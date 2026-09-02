/**
 * "What it actually did", rendered from the backend's structured ledger.
 * Redesigned with better visual hierarchy and status indicators.
 */
import type { ActionOutcome, ActionRecord } from '../state/runReducer'

const STYLE: Record<ActionOutcome, { label: string; color: string; bg: string; glyph: string }> = {
  executed:     { label: 'Done',      color: 'var(--success)',  bg: 'var(--success-bg)',  glyph: '✓' },
  not_executed: { label: 'Not done',  color: 'var(--denied)',   bg: 'var(--denied-bg)',   glyph: '✕' },
  cancelled:    { label: 'Cancelled', color: 'var(--ink-400)',  bg: 'var(--surface-sunken)', glyph: '−' },
  failed:       { label: 'Failed',    color: 'var(--danger)',   bg: 'var(--danger-bg)',   glyph: '!' },
  skipped:      { label: 'Skipped',   color: 'var(--ink-400)',  bg: 'var(--surface-sunken)', glyph: '·' },
}

function reason(a: ActionRecord): string {
  if (a.outcome === 'not_executed') {
    return a.error?.includes('already declined')
      ? 'You already declined this earlier, so it was not proposed again.'
      : 'You declined this, so nothing was written.'
  }
  if (a.outcome === 'cancelled') {
    const deps = [...(a.error ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    return deps.length
      ? `Skipped because ${deps.join(' and ')} did not go ahead.`
      : 'Skipped because a step it depended on did not go ahead.'
  }
  return a.error ?? ''
}

export function ActionLedger({ actions }: { actions: ActionRecord[] }) {
  const wrote = actions.filter((a) => a.outcome === 'executed').length

  return (
    <section
      aria-label="Actions taken"
      style={{
        marginTop: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-card)',
        overflow: 'hidden', background: 'var(--surface)', boxShadow: 'var(--e1)',
      }}
    >
      <header style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: 'var(--surface-sunken)', borderBottom: '1px solid var(--line)',
      }}>
        <span className="eyebrow">Actions taken</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-400)' }}>
          {wrote === 0
            ? 'nothing was written'
            : `${wrote} write${wrote > 1 ? 's' : ''} committed`}
        </span>
      </header>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {actions.map((a, i) => {
          const st = STYLE[a.outcome] ?? STYLE.skipped
          return (
            <li
              key={a.approvalId ?? `${a.stepId}-${i}`}
              style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12,
                padding: '12px 14px',
                borderTop: i === 0 ? 'none' : '1px solid var(--line)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 24, height: 24, borderRadius: 'var(--r-pill)',
                  background: st.bg, color: st.color,
                  display: 'grid', placeItems: 'center',
                  fontSize: 12, fontWeight: 700, marginTop: 1,
                  border: `1px solid color-mix(in srgb, ${st.color} 20%, transparent)`,
                }}
              >
                {st.glyph}
              </span>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: st.color,
                  }}>
                    {st.label}
                  </span>
                  {a.agent && (
                    <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>{a.agent} agent</span>
                  )}
                </div>

                <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--ink-900)', marginTop: 3 }}>
                  {a.description}
                </div>

                {a.receiptId && (
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 5 }}>
                    receipt {a.receiptId}
                  </div>
                )}
                {(a.error || a.outcome === 'not_executed') && !a.receiptId && (
                  <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                    {reason(a)}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
