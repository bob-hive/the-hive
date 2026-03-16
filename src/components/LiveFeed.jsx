import { useEffect, useRef, useState } from 'react'
import { Zap, CheckCircle2, XCircle, Activity } from 'lucide-react'
import { createEventFeed, relativeTime } from '../data/mock'

// Synthetic events injected over time when no real data is flowing
const SYNTHETIC_EVENTS = [
  { agentId: 'forge',    agentName: 'Forge',    type: 'active',    message: 'Build progress: 85% — linking chunks' },
  { agentId: 'scout',    agentName: 'Scout',    type: 'completed', message: 'Indexed page 4/7 of API changelog' },
  { agentId: 'sentinel', agentName: 'Sentinel', type: 'active',    message: 'TLS cert check passed for api.thehive.ai' },
  { agentId: 'bob',      agentName: 'Bob',      type: 'spawned',   message: 'Delegating analytics subtask to Ledger' },
  { agentId: 'ledger',   agentName: 'Ledger',   type: 'spawned',   message: 'Starting hourly metrics aggregation' },
  { agentId: 'forge',    agentName: 'Forge',    type: 'completed', message: 'Production bundle compiled — 342 kB gzipped' },
]

const TYPE_ICON = {
  spawned:   <Zap size={13} style={{ color: 'var(--color-accent)' }} />,
  active:    <Activity size={13} style={{ color: 'var(--color-busy)' }} />,
  completed: <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} />,
  error:     <XCircle size={13} style={{ color: 'var(--color-error)' }} />,
}

const TYPE_LABEL = {
  spawned:   { label: 'spawned',   style: { background: 'rgba(99,102,241,0.15)', color: 'var(--color-accent)' } },
  active:    { label: 'active',    style: { background: 'rgba(245,158,11,0.15)', color: 'var(--color-busy)' } },
  completed: { label: 'done',      style: { background: 'rgba(34,197,94,0.15)', color: 'var(--color-success)' } },
  error:     { label: 'error',     style: { background: 'rgba(239,68,68,0.15)', color: 'var(--color-error)' } },
}

let syntheticIdx = 0
let eventSeq = 100

export default function LiveFeed({ agents = [], events: propEvents = null }) {
  // When propEvents is provided (real API data), seed the feed from it.
  // Otherwise fall back to the mock seed.
  const seedEvents = propEvents && propEvents.length > 0 ? propEvents : createEventFeed(Date.now())
  const [events, setEvents] = useState(seedEvents)
  const [paused, setPaused] = useState(false)
  const listRef = useRef(null)
  const pausedRef = useRef(false)

  pausedRef.current = paused

  // Sync when prop events change (real data poll)
  useEffect(() => {
    if (!propEvents || propEvents.length === 0) return
    setEvents(propEvents)
  }, [propEvents])

  // Only inject synthetic events when NOT using real API data
  useEffect(() => {
    if (propEvents && propEvents.length > 0) return  // real data — no synthetic injection

    const timer = setInterval(() => {
      if (pausedRef.current) return
      const template = SYNTHETIC_EVENTS[syntheticIdx % SYNTHETIC_EVENTS.length]
      syntheticIdx++
      const newEvent = {
        ...template,
        id: `e-live-${++eventSeq}`,
        timestamp: Date.now(),
      }
      setEvents((prev) => [newEvent, ...prev].slice(0, 50))
    }, 6000)
    return () => clearInterval(timer)
  }, [propEvents])

  const agentsById = new Map((agents).map((a) => [a.id, a]))

  return (
    <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
            Live Feed
          </h2>
          {/* Live indicator */}
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: paused ? 'var(--color-surface-2)' : 'rgba(34,197,94,0.12)', color: paused ? 'var(--color-text-muted)' : 'var(--color-success)', border: `1px solid ${paused ? 'var(--color-border)' : 'rgba(34,197,94,0.3)'}` }}>
            <span className="status-dot" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: paused ? 'var(--color-idle)' : 'var(--color-success)',
              animation: paused ? 'none' : 'pulse-dot 2s ease-in-out infinite',
              display: 'inline-block', flexShrink: 0,
            }} />
            {paused ? 'paused' : 'live'}
          </span>
        </div>
        <button
          onClick={() => setPaused((p) => !p)}
          className="text-xs px-3 py-1 rounded-full transition-all duration-200"
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      <div
        ref={listRef}
        className="card overflow-hidden"
        style={{ maxHeight: 320, overflowY: 'auto' }}
      >
        {events.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Waiting for events…
          </div>
        ) : (
          <ul>
            {events.map((ev, i) => {
              const agent = agentsById.get(ev.agentId)
              const typeInfo = TYPE_LABEL[ev.type] ?? TYPE_LABEL.active
              const isLast = i === events.length - 1

              return (
                <li
                  key={ev.id}
                  className="px-4 py-3 flex items-start gap-3 transition-colors duration-150"
                  style={{
                    borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                    animation: i === 0 ? 'fade-in 0.3s ease both' : 'none',
                  }}
                >
                  {/* Type icon */}
                  <div className="mt-0.5 flex-shrink-0">{TYPE_ICON[ev.type] ?? TYPE_ICON.active}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {agent ? `${agent.avatar} ` : ''}{ev.agentName}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-xs font-medium"
                        style={typeInfo.style}
                      >
                        {typeInfo.label}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {ev.message}
                    </p>
                  </div>

                  {/* Timestamp */}
                  <span
                    className="flex-shrink-0 text-xs tabular-nums"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {relativeTime(ev.timestamp)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
