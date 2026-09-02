/**
 * Click a node, see everything behind it.
 * Redesigned with better visual hierarchy and polished styling.
 */
import { X } from 'lucide-react'
import { useStore } from '../state/store'
import type { StepState, ToolCall } from '../state/runReducer'

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',           color: 'var(--pending)',  bg: 'var(--pending-bg)' },
  running:   { label: 'Running',           color: 'var(--running)',  bg: 'var(--running-bg)' },
  done:      { label: 'Done',              color: 'var(--success)',  bg: 'var(--success-bg)' },
  failed:    { label: 'Failed',            color: 'var(--danger)',   bg: 'var(--danger-bg)' },
  degraded:  { label: 'Degraded',          color: 'var(--degraded)', bg: 'var(--degraded-bg)' },
  awaiting:  { label: 'Awaiting approval', color: 'var(--approval)', bg: 'var(--approval-bg)' },
  rejected:  { label: 'Rejected',          color: 'var(--denied)',   bg: 'var(--denied-bg)' },
  denied:    { label: 'Not permitted',     color: 'var(--denied)',   bg: 'var(--denied-bg)' },
  cancelled: { label: 'Cancelled',         color: 'var(--ink-400)',  bg: 'var(--surface-sunken)' },
}

export function NodeInspector() {
  const open = useStore((s) => s.inspectorOpen)
  const stepId = useStore((s) => s.selectedStepId)
  const run = useStore((s) => s.run)
  const close = useStore((s) => s.closeInspector)

  const step = stepId ? run.steps[stepId] : null
  if (!open || !step) return null

  const st = STATUS_STYLE[step.status] ?? STATUS_STYLE.pending
  const conflicts = run.conflicts.filter((c) => c.stepIds.includes(step.id))

  return (
    <div
      role="dialog"
      aria-label={`Step ${step.id} detail`}
      className="inspector"
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '92%',
        background: 'var(--surface)', borderLeft: '1px solid var(--line)',
        boxShadow: 'var(--e3)', display: 'flex', flexDirection: 'column', zIndex: 20,
      }}
    >
      <header style={{
        padding: '16px 18px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
        background: 'var(--surface-sunken)',
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-400)' }}>{step.id}</span>
            <span className="eyebrow" style={{ color: `var(--agent-${step.agent})` }}>{step.agent}</span>
            <Pill color={st.color} bg={st.bg}>{st.label}</Pill>
          </div>
          <div style={{ fontSize: 15, lineHeight: '21px', color: 'var(--ink-900)', fontWeight: 600 }}>{step.task}</div>
        </div>
        <button onClick={close} aria-label="Close" className="icon-button" style={{ flexShrink: 0 }}>
          <X size={16} />
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
        <Facts step={step} run={run} />

        {conflicts.length > 0 && (
          <Section title="Why it was challenged">
            {conflicts.map((c, i) => (
              <div key={i} style={{
                padding: 12, borderRadius: 'var(--r-chip)', background: 'var(--danger-bg)',
                color: 'var(--danger)', fontSize: 12, lineHeight: '18px', marginBottom: 8,
                border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
              }}>
                <strong>{c.type}</strong>
                <div style={{ marginTop: 4, color: 'var(--ink-600)' }}>{c.detail}</div>
              </div>
            ))}
          </Section>
        )}

        <Section title={step.tools.length ? `Tool calls (${step.tools.length})` : 'Tool calls'}>
          {step.tools.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--ink-400)', margin: 0 }}>
              This step answered from context and prior results — no tool was needed.
            </p>
          ) : (
            step.tools.map((t, i) => <ToolBlock key={`${t.tool}-${i}`} call={t} />)
          )}
        </Section>

        {step.errors.length > 0 && (
          <Section title="Errors">
            {step.errors.map((err, i) => (
              <div key={i} className="mono" style={{
                fontSize: 11, color: 'var(--danger)', background: 'var(--danger-bg)',
                padding: 10, borderRadius: 'var(--r-chip)', marginBottom: 8, whiteSpace: 'pre-wrap',
                border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
              }}>{err}</div>
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}

function Facts({ step, run }: { step: StepState; run: ReturnType<typeof useStore.getState>['run'] }) {
  const deps = step.dependsOn.filter((d) => run.steps[d])
  const rows: [string, React.ReactNode][] = [
    ['Latency', step.latencyMs != null ? `${(step.latencyMs / 1000).toFixed(2)}s` : '—'],
    ['Needs approval', step.requiresApproval ? 'Yes — pauses for a human' : 'No'],
    ['Expected', step.expectedOutput || '—'],
    [
      'Ran after',
      deps.length
        ? deps.map((d) => (
            <button key={d} onClick={() => useStore.getState().openInspector(d)}
              className="mono"
              style={{
                border: '1px solid var(--line)', background: 'var(--surface-sunken)',
                borderRadius: 'var(--r-input)', padding: '2px 7px', marginRight: 4,
                fontSize: 11, cursor: 'pointer', color: 'var(--ink-600)',
                transition: 'all var(--t-micro)',
              }}>{d}</button>
          ))
        : 'nothing — it started immediately',
    ],
  ]
  if (step.ragChunks != null) rows.push(['Clauses retrieved', String(step.ragChunks)])

  return (
    <dl style={{ margin: '0 0 20px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px' }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ fontSize: 11.5, color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-900)' }}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function ToolBlock({ call }: { call: ToolCall }) {
  const tone =
    call.status === 'ok' ? 'var(--success)'
      : call.status === 'error' ? 'var(--danger)'
        : call.status === 'degraded' ? 'var(--degraded)'
          : call.status === 'pending_approval' ? 'var(--approval)'
            : call.status === 'permission_denied' ? 'var(--denied)'
              : 'var(--running)'

  return (
    <div style={{
      border: '1px solid var(--line)', borderLeft: `3px solid ${tone}`,
      borderRadius: 'var(--r-chip)', marginBottom: 12, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        background: 'var(--surface-sunken)',
      }}>
        <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-900)' }}>
          {call.tool}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
          textTransform: 'uppercase', color: tone,
        }}>
          {call.status.replace('_', ' ')}
        </span>
      </div>

      <div style={{ padding: 12 }}>
        <Label>Arguments</Label>
        <Code>{JSON.stringify(call.args, null, 2)}</Code>

        {call.retries.length > 0 && (
          <>
            <Label>Retries ({call.retries.length})</Label>
            {call.retries.map((r) => (
              <div key={r.attempt} style={{ fontSize: 11.5, color: 'var(--degraded)', marginBottom: 3 }}>
                attempt {r.attempt} — {r.error}
              </div>
            ))}
          </>
        )}

        {call.fallbackTo && (
          <>
            <Label>Fell back</Label>
            <div style={{ fontSize: 11.5, color: 'var(--degraded)' }}>
              → {call.fallbackTo} ({call.fallbackReason})
            </div>
          </>
        )}

        {call.status === 'pending_approval' && (
          <div style={{ fontSize: 11.5, color: 'var(--approval)', marginTop: 10, fontStyle: 'italic' }}>
            Staged, not executed. No write happened at this point — the receipt only
            appears after a human approves.
          </div>
        )}

        {call.data && Object.keys(call.data).length > 0 && (
          <>
            <Label>Result</Label>
            <Code>{JSON.stringify(call.data, null, 2)}</Code>
          </>
        )}

        {call.error && (
          <>
            <Label>Error</Label>
            <div style={{ fontSize: 11.5, color: 'var(--danger)' }}>{call.error}</div>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
      color: 'var(--ink-300)', margin: '10px 0 5px',
    }}>{children}</div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mono" style={{
      margin: 0, padding: 10, fontSize: 11, lineHeight: '16px',
      background: 'var(--surface-sunken)', borderRadius: 'var(--r-input)',
      color: 'var(--ink-600)', overflowX: 'auto', maxHeight: 220, overflowY: 'auto',
      border: '1px solid var(--line)',
    }}>{children}</pre>
  )
}

function Pill({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
      color, background: bg, padding: '3px 8px', borderRadius: 'var(--r-pill)',
    }}>{children}</span>
  )
}
