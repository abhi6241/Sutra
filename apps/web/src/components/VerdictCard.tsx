/**
 * The positive counterpart to the evidence card — eligibility verdict.
 * Redesigned with better visual hierarchy and prominent status display.
 */
import type { RunState } from '../state/runReducer'

interface Criterion {
  criterion: string
  required: string
  actual: string
  passed: boolean
}

interface Eligibility {
  company_id?: string
  is_eligible?: boolean
  breakdown?: Criterion[]
}

export function findEligibility(run: RunState): Eligibility | null {
  for (const step of Object.values(run.steps)) {
    for (const call of step.tools) {
      if (call.tool === 'check_placement_eligibility' && call.data && 'is_eligible' in call.data) {
        return call.data as Eligibility
      }
    }
  }
  return null
}

const COMPANY_LABEL: Record<string, string> = {
  google: 'the Google SDE internship',
}

export function VerdictCard({ result }: { result: Eligibility }) {
  const eligible = result.is_eligible === true
  const breakdown = result.breakdown ?? []
  const target = COMPANY_LABEL[result.company_id ?? ''] ?? `the ${result.company_id} role`

  const tone = eligible ? 'var(--success)' : 'var(--denied)'
  const toneBg = eligible ? 'var(--success-bg)' : 'var(--denied-bg)'

  return (
    <figure
      className="evidence-card"
      style={{
        margin: '0 0 16px', border: `1px solid ${tone}`, borderLeftWidth: 4,
        borderRadius: 'var(--r-card)', background: 'var(--surface)',
        overflow: 'hidden', boxShadow: 'var(--e1)',
      }}
    >
      <figcaption style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        background: toneBg, color: tone,
        borderBottom: `1px solid color-mix(in srgb, ${tone} 25%, transparent)`,
      }}>
        <span
          aria-hidden
          style={{
            width: 24, height: 24, borderRadius: 'var(--r-pill)', flexShrink: 0,
            background: tone, color: 'var(--surface)',
            display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
          }}
        >
          {eligible ? '✓' : '✕'}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, lineHeight: '19px' }}>
          {eligible ? `You're eligible for ${target}` : `You're not eligible for ${target}`}
        </span>
      </figcaption>

      {breakdown.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {breakdown.map((c, i) => (
            <li
              key={c.criterion}
              style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10,
                alignItems: 'baseline', padding: '10px 14px',
                borderTop: i === 0 ? 'none' : '1px solid var(--line)',
              }}
            >
              <span
                aria-hidden
                style={{
                  fontSize: 12, fontWeight: 700,
                  color: c.passed ? 'var(--success)' : 'var(--denied)',
                }}
              >
                {c.passed ? '✓' : '✕'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-900)' }}>{c.criterion}</span>
              <span className="mono tnum" style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                <strong style={{ color: 'var(--ink-900)' }}>{c.actual}</strong>
                {' '}<span style={{ opacity: 0.7 }}>need {c.required}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}
