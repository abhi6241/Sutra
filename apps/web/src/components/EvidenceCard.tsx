/**
 * The evidence card — redesigned with better visual impact.
 * Still shows the two key things: overlap and attendance projection.
 */
import type { ConflictRecord } from '../state/runReducer'

const THRESHOLD = 75

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function EvidenceCard({ conflict }: { conflict: ConflictRecord }) {
  const ev = conflict.evidence
  if (!ev) return null
  const { event, collides_with: collides, attendance_impact: impact } = ev

  return (
    <figure
      className="evidence-card"
      style={{
        margin: '0 0 16px', border: '1px solid var(--danger)', borderLeftWidth: 4,
        borderRadius: 'var(--r-card)', background: 'var(--surface)',
        overflow: 'hidden', boxShadow: 'var(--e1)',
      }}
    >
      <figcaption style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: 'var(--danger-bg)', color: 'var(--danger)',
        borderBottom: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
      }}>
        <span aria-hidden style={{ fontSize: 14 }}>⚔</span>
        <span className="eyebrow" style={{ color: 'inherit' }}>
          Academic agent blocked this
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, letterSpacing: '0.04em',
          textTransform: 'uppercase', opacity: 0.7,
        }}>
          checked, not guessed
        </span>
      </figcaption>

      <div style={{ padding: 16 }}>
        {event && collides && <TimeCollision event={event} collides={collides} />}
        {impact && <AttendanceProjection impact={impact} />}

        {conflict.rationale && (
          <p style={{
            margin: '14px 0 0', paddingTop: 12, borderTop: '1px solid var(--line)',
            fontSize: 13, lineHeight: '20px', color: 'var(--ink-600)',
          }}>
            {conflict.rationale}
          </p>
        )}
      </div>
    </figure>
  )
}

function TimeCollision({
  event, collides,
}: {
  event: NonNullable<NonNullable<ConflictRecord['evidence']>['event']>
  collides: NonNullable<NonNullable<ConflictRecord['evidence']>['collides_with']>
}) {
  const start = toMinutes(event.start)
  const end = toMinutes(event.end)
  const span = Math.max(end - start, 60)
  const pct = (mins: number) => ((mins - start) / span) * 100

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Same slot</div>

      <div style={{ display: 'grid', gap: 8 }}>
        <Bar
          label={event.title}
          sub={`${event.day} ${event.start}–${event.end}`}
          color="var(--danger)"
          bg="var(--danger-bg)"
          left={pct(start)}
          width={pct(end) - pct(start)}
        />
        <Bar
          label={collides.course_id}
          sub={`${collides.session_type} · already on your timetable`}
          color="var(--ink-600)"
          bg="var(--surface-sunken)"
          left={pct(start)}
          width={pct(end) - pct(start)}
        />
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 6,
        fontSize: 10.5, color: 'var(--ink-300)', fontFamily: 'var(--font-mono)',
      }}>
        <span>{event.start}</span>
        <span>{event.end}</span>
      </div>
    </div>
  )
}

function Bar({
  label, sub, color, bg, left, width,
}: {
  label: string; sub: string; color: string; bg: string; left: number; width: number
}) {
  return (
    <div>
      <div style={{
        height: 28, borderRadius: 6, background: 'var(--surface-sunken)',
        position: 'relative', overflow: 'hidden', border: '1px solid var(--line)',
      }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${left}%`, width: `${width}%`,
          background: bg, borderLeft: `3px solid ${color}`,
          display: 'flex', alignItems: 'center', paddingLeft: 8,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {label}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 3 }}>{sub}</div>
    </div>
  )
}

function AttendanceProjection({
  impact,
}: {
  impact: NonNullable<NonNullable<ConflictRecord['evidence']>['attendance_impact']>
}) {
  const cur = Math.max(0, Math.min(100, impact.current_pct))
  const proj = Math.max(0, Math.min(100, impact.projected_pct))

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        Cost of missing it · {impact.course_name}
      </div>

      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12,
        fontFamily: 'var(--font-mono)',
      }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-600)' }}>
          {impact.current_pct}%
        </span>
        <span aria-hidden style={{ color: 'var(--ink-300)', fontSize: 18 }}>→</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--danger)' }}>
          {impact.projected_pct}%
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--danger)',
          background: 'var(--danger-bg)', padding: '3px 8px', borderRadius: 'var(--r-pill)',
          border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
        }}>
          {impact.delta_pct}
        </span>
      </div>

      {/* Track */}
      <div style={{ position: 'relative', height: 24 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 6,
          background: 'var(--surface-sunken)', border: '1px solid var(--line)',
        }} />
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: `${cur}%`,
          background: 'var(--pending-bg)', borderRadius: '6px 0 0 6px',
          borderRight: '2px solid var(--ink-300)',
        }} />
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: `${proj}%`,
          background: 'var(--danger-bg)', borderRadius: '6px 0 0 6px',
          borderRight: '2px solid var(--danger)',
          transition: 'width var(--t-layout)',
        }} />
        <div style={{
          position: 'absolute', left: `${THRESHOLD}%`, top: -4, bottom: -4, width: 2,
          background: 'var(--ink-900)',
        }} />
        <div style={{
          position: 'absolute', left: `calc(${THRESHOLD}% + 6px)`, top: '50%',
          transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700,
          color: 'var(--ink-900)', whiteSpace: 'nowrap',
        }}>
          75% required
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-600)', lineHeight: '19px' }}>
        {impact.already_below
          ? `Already ${(THRESHOLD - impact.current_pct).toFixed(2)} points short of the requirement — `
          : impact.crosses_threshold
            ? 'This is what would push it below the requirement — '
            : 'Still above the requirement, but — '}
        <strong style={{ color: 'var(--ink-900)' }}>
          {impact.classes_attended}/{impact.classes_held} attended
        </strong>
        {impact.sessions_needed_to_recover > 0 && (
          <>
            , and it would take{' '}
            <strong style={{ color: 'var(--ink-900)' }}>
              {impact.sessions_needed_to_recover} consecutive sessions
            </strong>{' '}
            to recover.
          </>
        )}
      </div>
    </div>
  )
}
