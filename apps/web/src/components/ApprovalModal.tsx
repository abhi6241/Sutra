import { useEffect, useMemo, useState } from 'react'

import { useStore } from '../state/store'

interface Props {
  onDecide: (
    approvalId: string,
    decision: 'approve' | 'reject' | 'edit',
    editedArgs: Record<string, unknown> | null,
  ) => void
}

export function ApprovalModal({ onDecide }: Props) {
  const run = useStore((s) => s.run)
  const activeId = useStore((s) => s.activeApprovalId)
  const inFlight = useStore((s) => s.approvalInFlight)
  const mode = useStore((s) => s.mode)
  const events = useStore((s) => s.events)
  const approval = activeId ? run.approvals[activeId] : null

  const replaying = mode === 'replay'
  const rawRecorded = replaying && activeId
    ? (events.find(
        (e) => e.type === 'approval.resolved'
          && (e.payload as { id?: string }).id === activeId,
      )?.payload as { decision?: string } | undefined)?.decision ?? null
    : null
  const recorded: 'approve' | 'reject' | 'edit' | null =
    rawRecorded === 'approve' || rawRecorded === 'reject' || rawRecorded === 'edit'
      ? rawRecorded
      : null

  const [args, setArgs] = useState<Record<string, unknown>>({})
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (approval) setArgs({ ...approval.args })
  }, [approval?.id])

  const dirty = useMemo(
    () => approval ? JSON.stringify(args) !== JSON.stringify(approval.args) : false,
    [args, approval],
  )

  useEffect(() => {
    if (!approval) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        setShake(true)
        setTimeout(() => setShake(false), 400)
      }
      if (ev.key === 'Enter' && !inFlight) {
        onDecide(approval.id, (replaying ? recorded ?? 'approve' : 'approve') as 'approve' | 'reject' | 'edit', null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [approval, inFlight, onDecide, replaying, recorded])

  if (!approval || approval.status !== 'pending') return null

  const waited = run.lastTs && approval.requestedTs
    ? Math.max(0, run.lastTs - approval.requestedTs) : 0
  const queuePos = run.approvalQueue.indexOf(approval.id) + 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgb(17 19 24 / 0.2)', backdropFilter: 'blur(8px)',
      display: 'grid', placeItems: 'center', padding: 24,
      animation: 'sutra-fade-in 0.15s ease',
    }}>
      <div className={shake ? 'shake' : undefined} style={{
        width: 580, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto',
        background: 'var(--surface)', borderRadius: 'calc(var(--r-card) + 4px)',
        border: '1px solid var(--line)', boxShadow: 'var(--e3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--line)',
          background: 'var(--gradient-hero)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="eyebrow" style={{ color: 'var(--approval)' }}>Approval required</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-pill)',
              background: approval.risk === 'medium' ? 'var(--degraded-bg)' : 'var(--pending-bg)',
              color: approval.risk === 'medium' ? 'var(--degraded)' : 'var(--ink-600)',
              border: `1px solid ${approval.risk === 'medium' ? 'color-mix(in srgb, var(--degraded) 25%, transparent)' : 'var(--line)'}`,
            }}>{approval.risk.toUpperCase()} RISK</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-pill)',
              background: approval.reversible ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: approval.reversible ? 'var(--success)' : 'var(--danger)',
              border: `1px solid ${approval.reversible ? 'color-mix(in srgb, var(--success) 25%, transparent)' : 'color-mix(in srgb, var(--danger) 25%, transparent)'}`,
            }}>{approval.reversible ? 'REVERSIBLE' : 'IRREVERSIBLE'}</span>
            {run.approvalQueue.length > 1 && (
              <span className="eyebrow" style={{ marginLeft: 'auto' }}>
                {queuePos} of {run.approvalQueue.length}
              </span>
            )}
          </div>
          <div className="font-display" style={{ fontSize: 20, lineHeight: '26px' }}>
            {approval.description}
          </div>
        </div>

        {/* Preview */}
        {approval.preview && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--line)' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>What will happen</div>
            <pre className="mono" style={{
              margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: '18px',
              background: 'var(--surface-sunken)', padding: 14, borderRadius: 'var(--r-chip)',
              color: 'var(--ink-900)', border: '1px solid var(--line)',
            }}>{approval.preview}</pre>
          </div>
        )}

        {/* Arguments */}
        <div style={{ padding: '16px 24px' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Arguments · {approval.tool} · agent {approval.agent}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {Object.entries(args).map(([k, v]) => {
                const changed = JSON.stringify(v) !== JSON.stringify(approval.args[k])
                return (
                  <tr key={k}>
                    <td className="mono" style={{
                      padding: '7px 10px 7px 0', color: 'var(--ink-600)', width: 130, verticalAlign: 'top',
                    }}>{k}</td>
                    <td style={{ padding: '7px 0' }}>
                      <input
                        className="mono"
                        value={String(v)}
                        onChange={(ev) => setArgs({ ...args, [k]: ev.target.value })}
                        readOnly={replaying}
                        style={{
                          cursor: replaying ? 'default' : 'text',
                          width: '100%', fontSize: 12, padding: '7px 10px',
                          border: `1px solid ${changed ? 'var(--accent)' : 'var(--line)'}`,
                          borderRadius: 'var(--r-input)', background: changed ? 'var(--accent-weak)' : 'var(--surface)',
                          color: 'var(--ink-900)', transition: 'border-color var(--t-micro), background var(--t-micro)',
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 10 }}>
            {replaying
              ? 'These are the arguments the recorded run actually used.'
              : 'Values may be edited; new fields are rejected by the server.'}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface-sunken)',
        }}>
          <span className="tnum" style={{ fontSize: 12, color: 'var(--ink-400)' }}>
            agent blocked {waited.toFixed(1)}s
          </span>
          {replaying ? (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                Recorded decision — replay
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '7px 16px',
                borderRadius: 'var(--r-input)',
                color: recorded === 'reject' ? 'var(--denied)' : 'var(--success)',
                background: recorded === 'reject' ? 'var(--denied-bg)' : 'var(--success-bg)',
                border: `1px solid ${recorded === 'reject' ? 'color-mix(in srgb, var(--denied) 30%, transparent)' : 'color-mix(in srgb, var(--success) 30%, transparent)'}`,
              }}>
                {recorded === 'reject' ? 'Rejected' : recorded === 'edit' ? 'Edited & approved' : 'Approved'}
              </span>
              <button onClick={() => onDecide(approval.id, recorded ?? 'approve', null)}
                className="btn-primary">Continue</button>
            </div>
          ) : (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button disabled={inFlight} onClick={() => onDecide(approval.id, 'reject', null)}
                className="btn-secondary">Reject</button>
              <button disabled={inFlight || !dirty} onClick={() => onDecide(approval.id, 'edit', args)}
                style={{
                  ...btnSecondaryBase,
                  opacity: dirty ? 1 : 0.5, cursor: dirty ? 'pointer' : 'not-allowed',
                }}>Edit &amp; Approve</button>
              <button disabled={inFlight} onClick={() => onDecide(approval.id, 'approve', null)}
                className="btn-primary">Approve</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const btnSecondaryBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 18px', borderRadius: 'var(--r-input)',
  border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--accent)',
  cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
}
