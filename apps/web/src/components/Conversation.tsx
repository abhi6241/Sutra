/**
 * The conversation pane.
 *
 * Redesigned with modern message bubbles, improved composer, and polished
 * welcome screen while preserving all existing functionality.
 */
import { Mic, MicOff, Send, Square, Sparkles, User } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { copy } from '../i18n'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { useStore } from '../state/store'
import { ActionLedger } from './ActionLedger'
import { EvidenceCard } from './EvidenceCard'
import { VerdictCard, findEligibility } from './VerdictCard'

export function Conversation({
  onSend,
  onCancel,
}: {
  onSend: (text: string) => void
  onCancel: () => void
}) {
  const turns = useStore((s) => s.turns)
  const draft = useStore((s) => s.draft)
  const setDraft = useStore((s) => s.setDraft)
  const sending = useStore((s) => s.sending)
  const mode = useStore((s) => s.mode)
  const backendUp = useStore((s) => s.backendUp)
  const composerFocusNonce = useStore((s) => s.composerFocusNonce)
  const locale = useStore((s) => s.locale)
  const voice = useVoiceInput()
  const t = (key: Parameters<typeof copy>[1]) => copy(locale, key)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const latestTurnText = turns.at(-1)?.text

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, latestTurnText])

  useEffect(() => {
    if (composerFocusNonce > 0) inputRef.current?.focus()
  }, [composerFocusNonce])

  const liveBlocked = mode === 'live' && !backendUp
  const canSend = draft.trim().length > 0 && !sending && !liveBlocked

  const submit = () => {
    if (!canSend) return
    if (voice.listening) voice.stop()
    const text = draft.trim()
    setDraft('')
    onSend(text)
  }

  return (
    <section
      aria-label="Conversation"
      style={{
        display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%',
        background: 'var(--surface)', borderRight: '1px solid var(--line)',
      }}
    >
      {/* Messages area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 20px 12px' }}>
        {turns.length === 0 ? (
          <Welcome onPick={(text) => { setDraft(text); inputRef.current?.focus() }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {turns.map((t) => (
              t.role === 'user' ? <UserTurn key={t.id} text={t.text} /> : <AssistantTurn key={t.id} id={t.id} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div style={{
        borderTop: '1px solid var(--line)', padding: 14, background: 'var(--surface)',
      }}>
        {liveBlocked && (
          <div style={{
            fontSize: 12, color: 'var(--degraded)', background: 'var(--degraded-bg)',
            padding: '8px 12px', borderRadius: 'var(--r-chip)', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 14 }}>⚠</span>
            {t('backendUnavailable')}
          </div>
        )}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-end',
          border: '1px solid var(--line-strong)', borderRadius: 'var(--r-card)',
          padding: '10px 12px', background: 'var(--surface)',
          transition: 'border-color var(--t-micro), box-shadow var(--t-micro)',
        }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!sending) submit()
              }
            }}
            rows={2}
            placeholder={mode === 'replay' ? t('replayPlaceholder') : t('placeholder')}
            aria-label="Ask a question"
            style={{
              flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
              font: 'inherit', fontSize: 14, lineHeight: '21px', color: 'var(--ink-900)',
              fontFamily: 'var(--font-body)', maxHeight: 120,
            }}
          />
          <button
            onClick={voice.listening ? voice.stop : voice.start}
            type="button"
            disabled={sending}
            aria-label={voice.listening ? t('voiceStop') : t('voiceStart')}
            title={voice.supported ? (voice.listening ? t('voiceStop') : t('voiceStart')) : t('voiceUnsupported')}
            className={`voice-button${voice.listening ? ' is-listening' : ''}`}
          >
            {voice.listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button
            onClick={sending ? onCancel : submit}
            disabled={sending ? false : !canSend}
            aria-label={sending ? 'Stop current run' : 'Send'}
            style={{
              width: 36, height: 36, flex: '0 0 36px',
              display: 'inline-grid', placeItems: 'center',
              borderRadius: 'var(--r-input)', border: 'none', cursor: sending || canSend ? 'pointer' : 'not-allowed',
              background: sending ? 'var(--danger)' : canSend ? 'var(--gradient-accent)' : 'var(--surface-sunken)',
              color: sending ? '#fff' : canSend ? 'var(--accent-ink)' : 'var(--ink-300)',
              transition: 'all var(--t-micro)',
              boxShadow: sending ? '0 2px 8px rgb(220 38 38 / 0.3)' : canSend ? '0 2px 8px rgb(67 56 202 / 0.25)' : 'none',
            }}
          >
            {sending ? <Square size={14} fill="currentColor" /> : <Send size={15} />}
          </button>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 8, fontSize: 11, color: 'var(--ink-300)',
        }}>
          <span>{voice.message ?? t('enterHint')}</span>
          {sending
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="pulse-dot" style={{ background: 'var(--accent)' }} />
                {t('runProgress')}
              </span>
            : mode === 'replay' && <span>{t('replayHint')}</span>}
        </div>
      </div>
    </section>
  )
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  const locale = useStore((s) => s.locale)
  const t = (key: Parameters<typeof copy>[1]) => copy(locale, key)
  const suggestions = [
    { label: t('heroRun'), text: t('heroPrompt'), color: 'var(--accent)' },
    { label: t('attendanceRule'), text: t('attendancePrompt'), color: 'var(--running)' },
    { label: t('eligibilityOnly'), text: t('eligibilityPrompt'), color: 'var(--success)' },
  ]
  return (
    <div style={{ paddingTop: 12, animation: 'vasavihub-fade-in 0.4s ease both' }}>
      {/* Logo mark */}
      <div style={{
        width: 48, height: 48, borderRadius: 'var(--r-card)',
        background: 'var(--gradient-hero)', display: 'grid', placeItems: 'center',
        marginBottom: 16, boxShadow: '0 4px 16px rgb(67 56 202 / 0.15)',
      }}>
        <Sparkles size={24} style={{ color: 'var(--accent)' }} />
      </div>

      <h1 className="font-display" style={{ fontSize: 28, lineHeight: '34px', margin: '0 0 8px' }}>
        {t('welcomeTitle')}
      </h1>
      <p style={{ fontSize: 14, lineHeight: '22px', color: 'var(--ink-600)', margin: '0 0 24px', maxWidth: 420 }}>
        {t('welcomeBody')}
      </p>

      <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--accent)' }}>{t('tryOne')}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.text)}
            style={{
              textAlign: 'left', padding: '12px 14px', cursor: 'pointer',
              border: '1px solid var(--line)', borderRadius: 'var(--r-card)',
              background: 'var(--surface)', fontFamily: 'var(--font-body)',
              transition: 'all var(--t-micro)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = s.color
              e.currentTarget.style.boxShadow = 'var(--e2)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--line)'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                width: 6, height: 6, borderRadius: 999, background: s.color, flexShrink: 0,
              }} />
              <span className="eyebrow" style={{ color: s.color }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--ink-600)', paddingLeft: 14 }}>
              {s.text}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function UserTurn({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <div style={{
        maxWidth: '82%', background: 'var(--gradient-accent)', color: 'var(--accent-ink)',
        borderRadius: 'var(--r-card) var(--r-card) 4px var(--r-card)',
        padding: '11px 15px', fontSize: 13.5, lineHeight: '20px',
        boxShadow: '0 2px 8px rgb(67 56 202 / 0.15)',
      }}>
        {text}
      </div>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'var(--surface-sunken)', display: 'grid', placeItems: 'center',
        border: '1px solid var(--line)', marginTop: 2,
      }}>
        <User size={14} style={{ color: 'var(--ink-400)' }} />
      </div>
    </div>
  )
}

/**
 * The live assistant turn. Reads straight from RunState rather than from the
 * stored turn text, so it fills in progressively as the run streams.
 */
function AssistantTurn({ id }: { id: string }) {
  const run = useStore((s) => s.run)
  const turns = useStore((s) => s.turns)
  const turn = turns.find((t) => t.id === id)
  const isLatest = turns.filter((t) => t.role === 'assistant').at(-1)?.id === id

  if (!isLatest) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--gradient-hero)', display: 'grid', placeItems: 'center',
          border: '1px solid var(--accent-weak)', marginTop: 2,
        }}>
          <Sparkles size={14} style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{
          maxWidth: '88%', fontSize: 14, lineHeight: '22px', color: 'var(--ink-900)',
        }}>
          {turn?.text}
        </div>
      </div>
    )
  }

  if (!turn?.pending && turn?.text && !run.answer) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--gradient-hero)', display: 'grid', placeItems: 'center',
          border: '1px solid var(--accent-weak)', marginTop: 2,
        }}>
          <Sparkles size={14} style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{
          maxWidth: '88%',
          border: '1px solid var(--degraded)', background: 'var(--degraded-bg)',
          color: 'var(--degraded)', borderRadius: 'var(--r-card)',
          padding: 14, fontSize: 13, lineHeight: '19px',
        }}>
          {turn.text}
        </div>
      </div>
    )
  }

  const evidenced = run.conflicts.filter((c) => c.evidence)
  const eligibility = findEligibility(run)

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'var(--gradient-hero)', display: 'grid', placeItems: 'center',
        border: '1px solid var(--accent-weak)', marginTop: 2,
      }}>
        <Sparkles size={14} style={{ color: 'var(--accent)' }} />
      </div>
      <div style={{ maxWidth: '88%', minWidth: 0 }}>
        {!run.answer && !run.fatalError && <Working />}

        {eligibility && <VerdictCard result={eligibility} />}
        {evidenced.map((c, i) => <EvidenceCard key={i} conflict={c} />)}

        {run.fatalError && (
          <div style={{
            border: '1px solid var(--danger)', background: 'var(--danger-bg)',
            color: 'var(--danger)', borderRadius: 'var(--r-card)', padding: 14, fontSize: 13,
          }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Run failed</div>
            {run.fatalError}
          </div>
        )}

        {run.answer && (
          <div style={{
            fontSize: 14, lineHeight: '22px', color: 'var(--ink-900)',
            background: 'var(--surface-sunken)', borderRadius: 'var(--r-card)',
            padding: '14px 16px', border: '1px solid var(--line)',
          }}>
            {run.answer}
          </div>
        )}

        {run.notCompleted.length > 0 && (
          <div style={{
            marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-card)',
            background: 'var(--degraded-bg)', color: 'var(--degraded)',
            fontSize: 12.5, lineHeight: '18px', border: '1px solid color-mix(in srgb, var(--degraded) 25%, transparent)',
          }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Ran degraded</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {run.notCompleted.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        {run.actions.length > 0 && <ActionLedger actions={run.actions} />}
      </div>
    </div>
  )
}

/** A status line that reports what is actually happening, not a spinner. */
function Working() {
  const run = useStore((s) => s.run)
  const running = Object.values(run.steps).filter((s) => s.status === 'running')
  const awaiting = run.status === 'awaiting-approval' || run.approvalQueue.length > 0

  const label = awaiting
    ? 'Waiting for your decision'
    : running.length > 1
      ? `${running.length} agents working in parallel`
      : running.length === 1
        ? `${running[0].agent} agent — ${running[0].task}`
        : run.plan
          ? 'Planning'
          : 'Thinking'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px',
      background: awaiting ? 'var(--approval-bg)' : 'var(--surface-sunken)',
      borderRadius: 'var(--r-card)', border: `1px solid ${awaiting ? 'var(--approval)' : 'var(--line)'}`,
      fontSize: 13, color: awaiting ? 'var(--approval)' : 'var(--ink-600)',
    }}>
      <span className="pulse-dot" style={{ background: 'currentColor' }} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  )
}
