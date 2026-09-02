import { useCallback, useEffect, useRef, useState } from 'react'

import { ApprovalModal } from './components/ApprovalModal'
import { CalendarPage } from './components/CalendarPage'
import { Conversation } from './components/Conversation'
import { InboxDrawer } from './components/InboxDrawer'
import { copy, LANGUAGES, type Locale } from './i18n'
import { useCalendar } from './hooks/useCalendar'
import { useInbox } from './hooks/useInbox'
import { MissionGallery } from './components/MissionGallery'
import { NodeInspector } from './components/NodeInspector'
import { PlanCanvas } from './components/dag/PlanCanvas'
import { Citations, Memory, Telemetry, Timeline } from './components/Rail'
import { RunPresentation } from './components/RunPresentation'
import { RunScore } from './components/score/RunScore'
import { useStore } from './state/store'
import { ReplaySource, loadFixture } from './transport/replaySource'
import { SSEClient, health, postApprove, postChat } from './transport/sseClient'

const FIXTURES = [
  { file: 'golden_capabilities.jsonl', label: 'Full platform showcase · 24 tools' },
  { file: 'golden_conflict.jsonl', label: 'Conflict & arbitration' },
  { file: 'golden_clean.jsonl', label: 'Read-only question' },
  { file: 'golden_chaos.jsonl', label: 'Failure recovery' },
  { file: 'golden_reject.jsonl', label: 'Human rejects' },
]

const STUDENT = '1602-23-733-042'
const CALENDAR_WRITE_TOOLS = new Set(['register_event', 'add_to_calendar', 'create_reminder'])

export default function App() {
  const s = useStore()
  const [inboxOpen, setInboxOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const inbox = useInbox(STUDENT)
  const calendar = useCalendar(STUDENT)
  const refreshCalendar = calendar.refresh
  const replayRef = useRef<ReplaySource | null>(null)
  const sseRef = useRef<SSEClient | null>(null)
  const chatAbortRef = useRef<AbortController | null>(null)
  const transportEpochRef = useRef(0)

  useEffect(() => {
    const saved = localStorage.getItem('sutra-theme') as 'light' | 'dark' | null
    const stamped = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null
    const os = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    s.setTheme(saved ?? stamped ?? os)
    document.documentElement.lang = useStore.getState().locale

    const el = document.documentElement
    const observer = new MutationObserver(() => {
      const now = el.getAttribute('data-theme')
      if ((now === 'light' || now === 'dark') && now !== useStore.getState().theme) {
        useStore.getState().setTheme(now)
      }
    })
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    const poll = async () => { if (alive) useStore.getState().setBackendUp(await health()) }
    void poll()
    const t = setInterval(poll, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const stopAll = useCallback(() => {
    transportEpochRef.current += 1
    chatAbortRef.current?.abort()
    chatAbortRef.current = null
    replayRef.current?.stop()
    replayRef.current = null
    sseRef.current?.stop()
    sseRef.current = null
  }, [])

  const startReplay = useCallback(async (file: string) => {
    stopAll()
    const st = useStore.getState()
    st.setMode('replay')
    st.setSending(false)
    st.setLiveRunId(null)
    st.setThreadId(null)
    st.resetRun()
    const events = await loadFixture(file)
    st.loadEvents(events)
    st.setCenterView('score')
    st.setPresentationMode(true)

    const planned = events.find((e) => e.type === 'plan.created')
    const goal = (planned?.payload as { goal?: string } | undefined)?.goal
    st.addTurn({ role: 'user', text: goal || 'Recorded run', runId: st.run.runId })
    st.addTurn({ role: 'assistant', text: '', runId: st.run.runId, pending: true })

    const src = new ReplaySource(
      events,
      {
        onEvent: (e) => useStore.getState().ingest(e),
        onStatus: (status) => useStore.getState().setStatus(status),
        onProgress: (i, total) => useStore.getState().setProgress(i, total),
        onAwaitApproval: (id) => useStore.getState().setActiveApproval(id),
      },
      useStore.getState().pacing,
      (id) => useStore.getState().run.resolvedApprovalIds.includes(id),
    )
    src.setSpeed(useStore.getState().speed)
    replayRef.current = src
    src.start()
  }, [stopAll])

  const send = useCallback(async (text: string) => {
    stopAll()
    const epoch = transportEpochRef.current
    const controller = new AbortController()
    chatAbortRef.current = controller
    const st = useStore.getState()
    st.setMode('live')
    st.setSending(true)
    st.resetRun()
    st.addTurn({ role: 'user', text, runId: null })
    st.addTurn({ role: 'assistant', text: '', runId: null, pending: true })

    try {
      const { runId, threadId } = await postChat(
        text, STUDENT, 'student', st.threadId, st.locale, '', controller.signal,
      )
      if (transportEpochRef.current !== epoch) return
      chatAbortRef.current = null
      useStore.getState().setLiveRunId(runId)
      useStore.getState().setThreadId(threadId)

      const client = new SSEClient(runId, {
        onEvent: (e) => {
          if (transportEpochRef.current !== epoch) return
          const store = useStore.getState()
          store.ingest(e)
          if (e.type === 'approval.requested') {
            const id = String((e.payload as { id?: string }).id ?? '')
            if (id && !store.run.resolvedApprovalIds.includes(id)) store.setActiveApproval(id)
          }
          if (e.type === 'tool.result') {
            const payload = e.payload as { tool?: string; status?: string; data?: { receipt_id?: string } }
            if (
              payload.status === 'ok'
              && payload.tool && CALENDAR_WRITE_TOOLS.has(payload.tool)
              && payload.data?.receipt_id
            ) {
              refreshCalendar()
            }
          }
          if (e.type === 'run.finished') {
            const st2 = useStore.getState()
            const pending = st2.turns.filter((t) => t.role === 'assistant' && t.pending).at(-1)
            if (pending) st2.resolveTurn(pending.id, st2.run.answer ?? '')
            st2.setSending(false)
            refreshCalendar()
          }
          if (e.type === 'run.error' && e.agent == null && e.payload.detail === undefined) {
            const st2 = useStore.getState()
            const pending = st2.turns.filter((t) => t.role === 'assistant' && t.pending).at(-1)
            if (pending) st2.resolveTurn(pending.id, '')
            st2.setSending(false)
          }
        },
        onStatus: (status) => {
          if (transportEpochRef.current !== epoch) return
          const st2 = useStore.getState()
          st2.setStatus(status)
          if (status === 'closed' || status === 'error') {
            st2.setSending(false)
            if (!st2.run.runComplete && !st2.run.fatalError) {
              const pending = st2.turns.filter((t) => t.role === 'assistant' && t.pending).at(-1)
              if (pending) {
                st2.resolveTurn(
                  pending.id,
                  status === 'error'
                    ? 'The live event stream disconnected before the run completed. Your request was not submitted again.'
                    : 'The run ended before a final answer arrived. You can safely try again.',
                )
              }
            }
          }
        },
      })
      sseRef.current = client
      client.start()
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' || transportEpochRef.current !== epoch) return
      const st2 = useStore.getState()
      st2.setStatus('error')
      st2.setSending(false)
      const pending = st2.turns.filter((t) => t.role === 'assistant' && t.pending).at(-1)
      if (pending) {
        st2.resolveTurn(
          pending.id,
          "I couldn't reach the orchestrator, so nothing ran. Start it with " +
          '"python -m uvicorn apps.api.main:app --port 8000", or switch to ' +
          'Replay to show a recorded run.',
        )
      }
    } finally {
      if (chatAbortRef.current === controller) chatAbortRef.current = null
    }
  }, [stopAll, refreshCalendar])

  const stopLiveRun = useCallback(() => {
    stopAll()
    const st = useStore.getState()
    const pending = st.turns.filter((t) => t.role === 'assistant' && t.pending).at(-1)
    if (pending) st.resolveTurn(pending.id, 'Run stopped. Your draft is still here, so you can edit it or send it again.')
    st.setSending(false)
    st.setStatus('idle')
    st.setLiveRunId(null)
    st.setThreadId(null)
    st.setActiveApproval(null)
  }, [stopAll])

  const newChat = useCallback(() => {
    stopAll()
    const st = useStore.getState()
    st.clearConversation()
    st.resetRun()
    st.setStatus('idle')
    st.setCenterView('missions')
  }, [stopAll])

  const decide = useCallback(
    async (id: string, decision: 'approve' | 'reject' | 'edit', edited: Record<string, unknown> | null) => {
      const st = useStore.getState()
      st.setApprovalInFlight(true)
      st.setActiveApproval(null)
      try {
        if (st.mode === 'live' && st.liveRunId) {
          await postApprove(st.liveRunId, st.threadId, id, decision, edited)
        } else {
          replayRef.current?.releaseHold()
        }
      } finally {
        useStore.getState().setApprovalInFlight(false)
      }
    }, [])

  const seekReplay = useCallback((index: number) => {
    const st = useStore.getState()
    if (st.mode !== 'replay') return
    replayRef.current?.pause()
    st.seekTo(index)
    replayRef.current?.seek(index)
  }, [])

  const toggleReplayPlayback = useCallback(() => {
    const st = useStore.getState()
    if (st.status === 'streaming') replayRef.current?.pause()
    else replayRef.current?.resume()
  }, [])

  const changeReplaySpeed = useCallback((speed: number) => {
    useStore.getState().setSpeed(speed)
    replayRef.current?.setSpeed(speed)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        const st = useStore.getState()
        if (st.status === 'streaming') replayRef.current?.pause()
        else replayRef.current?.resume()
      }
      if (e.key === 'ArrowRight') replayRef.current?.stepForward()
      if (e.key === 'ArrowLeft') replayRef.current?.stepBack()
      if (e.key === 'Escape') {
        const st = useStore.getState()
        if (st.inspectorOpen) st.closeInspector()
        else if (st.presentationMode && !document.fullscreenElement) st.setPresentationMode(false)
      }
      if (e.key.toLowerCase() === 'd') {
        const st = useStore.getState()
        st.setTheme(st.theme === 'light' ? 'dark' : 'light')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const RailBody = { timeline: Timeline, citations: Citations, memory: Memory, telemetry: Telemetry }[s.rail]

  if (s.presentationMode) {
    const label = FIXTURES.find((fixture) => fixture.file === s.fixture)?.label ?? 'Recorded run'
    return (
      <>
        <RunPresentation
          fixtureLabel={label}
          onSeek={seekReplay}
          onBack={() => s.setPresentationMode(false)}
          onTogglePlayback={toggleReplayPlayback}
          onRestart={() => void startReplay(s.fixture)}
          onSpeedChange={changeReplaySpeed}
        />
        <ApprovalModal onDecide={decide} />
      </>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <Header
        onReplay={() => void startReplay(s.fixture)}
        onNewChat={newChat}
        onSpeedChange={changeReplaySpeed}
        onInbox={() => setInboxOpen(true)}
        onCalendar={() => { calendar.refresh(); setCalendarOpen(true) }}
        inboxCount={inbox.data?.attention_count ?? 0}
        calendarCount={calendar.data?.items.filter((item) => item.kind === 'event' || item.kind === 'calendar').length ?? 0}
      />

      <div className="cockpit" style={{ flex: 1, minHeight: 0 }}>
        <Conversation onSend={(t) => void send(t)} onCancel={stopLiveRun} />

        <main className="cockpit-canvas" style={{
          position: 'relative', minWidth: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--line)',
        }}>
          {s.centerView === 'missions' ? (
            <MissionGallery />
          ) : (
            <>
              <CenterToolbar />
              <div style={{ flex: 1, minHeight: 0 }}>
                {s.centerView === 'score'
                  ? <RunScore onSeek={seekReplay} />
                  : <PlanCanvas />}
              </div>
            </>
          )}
          <NodeInspector />
        </main>

        <aside className="cockpit-rail" style={{
          display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
          background: 'var(--surface)',
        }}>
          <div role="tablist" style={{
            display: 'flex', borderBottom: '1px solid var(--line)',
            background: 'var(--surface-sunken)',
          }}>
            {(['timeline', 'citations', 'memory', 'telemetry'] as const).map((r) => (
              <button key={r} role="tab" aria-selected={s.rail === r} onClick={() => s.setRail(r)}
                style={{
                  flex: 1, padding: '12px 6px', border: 'none', cursor: 'pointer',
                  background: s.rail === r ? 'var(--surface)' : 'transparent',
                  borderBottom: s.rail === r ? '2px solid var(--accent)' : '2px solid transparent',
                  color: s.rail === r ? 'var(--ink-900)' : 'var(--ink-400)',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontFamily: 'var(--font-body)',
                  transition: 'all var(--t-micro)',
                }}>
                {r}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}><RailBody /></div>
        </aside>
      </div>

      <ApprovalModal onDecide={decide} />
      {inboxOpen && (
        <InboxDrawer
          data={inbox.data}
          loading={inbox.loading}
          error={inbox.error}
          onClose={() => setInboxOpen(false)}
          onRefresh={inbox.refresh}
        />
      )}
      {calendarOpen && (
        <CalendarPage
          data={calendar.data}
          loading={calendar.loading}
          error={calendar.error}
          onClose={() => setCalendarOpen(false)}
          onRefresh={calendar.refresh}
        />
      )}
    </div>
  )
}

function CenterToolbar() {
  const view = useStore((s) => s.centerView)
  const setView = useStore((s) => s.setCenterView)
  return (
    <div style={{
      height: 44, flex: '0 0 44px', display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 14px', borderBottom: '1px solid var(--line)', background: 'var(--surface)',
    }}>
      <span className="eyebrow" style={{ fontSize: 10.5 }}>Run inspection</span>
      <div role="tablist" aria-label="Centre visualization" style={{
        display: 'flex', gap: 2, padding: 3, marginLeft: 'auto',
        borderRadius: 'var(--r-pill)', background: 'var(--surface-sunken)',
      }}>
        {(['score', 'plan'] as const).map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 'var(--r-pill)',
              padding: '5px 14px', background: view === option ? 'var(--surface)' : 'transparent',
              boxShadow: view === option ? 'var(--e1)' : 'none',
              color: view === option ? 'var(--ink-900)' : 'var(--ink-400)',
              fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-body)',
              textTransform: 'capitalize', transition: 'all var(--t-micro)',
            }}
          >
            {option === 'score' ? 'Run score' : 'Plan DAG'}
          </button>
        ))}
      </div>
    </div>
  )
}

function Header({
  onReplay,
  onNewChat,
  onSpeedChange,
  onInbox,
  onCalendar,
  inboxCount,
  calendarCount,
}: {
  onReplay: () => void
  onNewChat: () => void
  onSpeedChange: (speed: number) => void
  onInbox: () => void
  onCalendar: () => void
  inboxCount: number
  calendarCount: number
}) {
  const s = useStore()
  const pct = s.progress.total ? (s.progress.index / s.progress.total) * 100 : 0
  const inspecting = s.centerView !== 'missions'
  const inspectedEvents = s.mode === 'replay' ? s.progress.total : s.events.length
  const t = (key: Parameters<typeof copy>[1]) => copy(s.locale, key)

  return (
    <header style={{
      borderBottom: '1px solid var(--line)', background: 'var(--surface)',
      padding: '0 20px', display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'nowrap',
      height: 56, flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingRight: 20, borderRight: '1px solid var(--line)' }}>
        <span className="font-display" style={{ fontSize: 20, letterSpacing: '-0.03em' }}>Sūtra</span>
        <span className="eyebrow" style={{ fontSize: 10, opacity: 0.7 }}>Smart Campus</span>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--surface-sunken)', borderRadius: 'var(--r-pill)', padding: 3, marginLeft: 14 }}>
        {(['replay', 'live'] as const).map((m) => (
          <button key={m} onClick={() => s.setMode(m)}
            style={{
              padding: '4px 14px', borderRadius: 'var(--r-pill)', border: 'none', cursor: 'pointer',
              background: s.mode === m ? 'var(--surface)' : 'transparent',
              boxShadow: s.mode === m ? 'var(--e1)' : 'none',
              fontSize: 12, fontWeight: 700, color: s.mode === m ? 'var(--ink-900)' : 'var(--ink-400)',
              fontFamily: 'var(--font-body)', textTransform: 'capitalize', transition: 'all var(--t-micro)',
            }}>{m === 'replay' ? t('replay') : t('live')}</button>
        ))}
      </div>

      {/* Mode-specific controls */}
      {s.mode === 'replay' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 14, paddingLeft: 14, borderLeft: '1px solid var(--line)' }}>
          <select value={s.fixture} onChange={(e) => s.setFixture(e.target.value)} style={selectStyle}
            aria-label="Recorded run">
            {FIXTURES.map((f) => <option key={f.file} value={f.file}>{f.label}</option>)}
          </select>
          <button onClick={onReplay} className="btn-primary" style={{ padding: '5px 14px', fontSize: 12 }}>
            {s.fixture === 'golden_capabilities.jsonl' ? t('playShowcase') : t('playRun')}
          </button>
          <select value={s.speed} onChange={(e) => onSpeedChange(Number(e.target.value))} style={selectStyle}
            aria-label="Replay speed">
            {[0.5, 1, 2, 4].map((v) => <option key={v} value={v}>{v}×</option>)}
          </select>
        </div>
      ) : (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          marginLeft: 14, paddingLeft: 14, borderLeft: '1px solid var(--line)',
          color: s.backendUp ? 'var(--success)' : 'var(--danger)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: 999, background: 'currentColor',
            boxShadow: s.backendUp ? '0 0 6px var(--success)' : '0 0 6px var(--danger)',
          }} />
          {s.backendUp ? t('backendUp') : t('backendDown')}
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right-side controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Calendar & Inbox */}
        <button onClick={onCalendar} style={headerActionBtn} className="inbox-trigger"
          aria-label={`Calendar${calendarCount ? `, ${calendarCount} approved commitments` : ''}`}>
          <CalendarIcon />
          {calendarCount > 0 && <span className="calendar-header-count">{calendarCount}</span>}
        </button>
        <button onClick={onInbox} style={headerActionBtn} className="inbox-trigger"
          aria-label={`Inbox${inboxCount ? `, ${inboxCount} alerts` : ''}`}>
          <InboxIcon />
          {inboxCount > 0 && <span className="inbox-badge">{inboxCount > 9 ? '9+' : inboxCount}</span>}
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />

        {/* New chat */}
        {s.turns.length > 0 && (
          <button onClick={onNewChat} style={headerGhostBtn}>
            {t('newChat')}
          </button>
        )}

        {/* Inspect toggle */}
        <button
          onClick={() => s.setCenterView(inspecting ? 'missions' : 'score')}
          aria-expanded={inspecting}
          style={inspecting ? headerGhostBtn : headerAccentBtn}
        >
          {inspecting ? t('closeInspection') : `${t('inspectRun')}${inspectedEvents ? ` · ${inspectedEvents}` : ''}`}
        </button>

        {/* Progress bar (plan view) */}
        {s.centerView === 'plan' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
            <span className="eyebrow tnum" style={{ fontSize: 10 }}>{s.progress.index}/{s.progress.total}</span>
            <span style={{ width: 80, height: 3, background: 'var(--surface-sunken)', borderRadius: 2, overflow: 'hidden' }}>
              <span style={{
                display: 'block', height: '100%', width: `${pct}%`,
                background: 'var(--gradient-accent)', borderRadius: 2, transition: 'width var(--t-micro)',
              }} />
            </span>
          </div>
        )}

        <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />

        {/* Language */}
        <select
          value={s.locale}
          onChange={(event) => s.setLocale(event.target.value as Locale)}
          style={selectCompact}
          aria-label={t('language')}
          title={t('language')}
        >
          {LANGUAGES.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
        </select>

        {/* Theme toggle */}
        <button onClick={() => s.setTheme(s.theme === 'light' ? 'dark' : 'light')}
          style={headerIconBtn} title={s.theme === 'light' ? t('dark') : t('light')}>
          {s.theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    </header>
  )
}

/* Inline SVG icons for a polished header */
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <line x1="2" y1="6.5" x2="14" y2="6.5" />
      <line x1="5.5" y1="1.5" x2="5.5" y2="4.5" />
      <line x1="10.5" y1="1.5" x2="10.5" y2="4.5" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10.5V4a1 1 0 011-1h10a1 1 0 011 1v6.5" />
      <path d="M1 10.5h14L13 13H3L1 10.5z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8.5a5.5 5.5 0 01-7-7A5.5 5.5 0 1013.5 8.5z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="3" />
      <line x1="8" y1="13" x2="8" y2="15" />
      <line x1="1" y1="8" x2="3" y2="8" />
      <line x1="13" y1="8" x2="15" y2="8" />
      <line x1="3.1" y1="3.1" x2="4.5" y2="4.5" />
      <line x1="11.5" y1="11.5" x2="12.9" y2="12.9" />
      <line x1="3.1" y1="12.9" x2="4.5" y2="11.5" />
      <line x1="11.5" y1="4.5" x2="12.9" y2="3.1" />
    </svg>
  )
}

const selectStyle: React.CSSProperties = {
  fontSize: 12, padding: '5px 10px', borderRadius: 'var(--r-input)',
  border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-900)',
  fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'border-color var(--t-micro)',
}

const selectCompact: React.CSSProperties = {
  fontSize: 11, padding: '4px 6px', borderRadius: 'var(--r-input)',
  border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-600)',
  fontFamily: 'var(--font-body)', cursor: 'pointer',
}

const headerActionBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, position: 'relative',
  padding: '5px 10px', borderRadius: 'var(--r-input)',
  border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-600)',
  cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)',
  transition: 'all var(--t-micro)',
}

const headerGhostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 12px', borderRadius: 'var(--r-input)',
  border: '1px solid transparent', background: 'transparent', color: 'var(--ink-400)',
  cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
  transition: 'all var(--t-micro)',
}

const headerAccentBtn: React.CSSProperties = {
  ...headerGhostBtn,
  border: '1px solid var(--accent)',
  background: 'var(--accent-weak)', color: 'var(--accent)',
}

const headerIconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 'var(--r-input)',
  border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-400)',
  cursor: 'pointer', transition: 'all var(--t-micro)',
}
