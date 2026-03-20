import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { Moon, ChevronDown, ChevronUp, RefreshCw, AlertTriangle, Cog, CheckCircle2, XCircle } from 'lucide-react'
import { formatFreshness } from '../utils/freshness'

const API_KEY = import.meta.env.VITE_HIVE_API_KEY || ''
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const POLL_INTERVAL_MS = 60_000 // less frequent — overnight data changes slowly

// Overnight window: 11 PM previous day → 8 AM today
function getOvernightWindow() {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(8, 0, 0, 0)

  // If it's before 8 AM, "last night" started yesterday at 11 PM
  const windowEnd = now.getHours() < 8 ? now : todayStart

  const windowStart = new Date(windowEnd)
  windowStart.setDate(windowStart.getDate() - (now.getHours() < 8 ? 0 : 0))
  // go back to 11 PM of the previous day
  if (now.getHours() < 8) {
    windowStart.setDate(windowStart.getDate() - 1)
    windowStart.setHours(23, 0, 0, 0)
  } else {
    // after 8 AM — last night was prev day 11 PM → today 8 AM
    const prevDay = new Date(todayStart)
    prevDay.setDate(prevDay.getDate() - 1)
    prevDay.setHours(23, 0, 0, 0)
    return { start: prevDay.getTime(), end: todayStart.getTime() }
  }

  return { start: windowStart.getTime(), end: windowEnd.getTime() }
}

function relativeTs(ts) {
  const diff = Math.max(0, Date.now() - ts)
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function formatTs(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const EVENT_TYPE_COLORS = {
  task: '#60a5fa',
  cron: '#a78bfa',
  error: '#ef4444',
  heartbeat: '#22c55e',
  deploy: '#34d399',
  alert: '#fbbf24',
}

function EventRow({ event }) {
  const color = EVENT_TYPE_COLORS[event.eventType] || '#94a3b8'
  const isError = event.eventType === 'error' || event.status === 'error'

  return (
    <div className="flex items-start gap-2.5 py-2">
      <div
        className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {formatTs(event.timestamp)}
          </span>
          <span className="text-[10px] font-semibold uppercase rounded px-1" style={{ color, background: `${color}18` }}>
            {event.eventType}
          </span>
          {isError && <XCircle size={10} style={{ color: '#ef4444' }} />}
        </div>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {event.agentName || event.agent}
          </span>
          {' — '}
          {event.summary || event.message || '(no summary)'}
        </p>
      </div>
    </div>
  )
}

export default function OvernightBriefing() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const timerRef = useRef(null)

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (API_KEY) headers['X-Hive-Key'] = API_KEY

      const res = await fetch(`${API_BASE}/api/live/activity-feed?limit=100`, {
        headers,
        credentials: 'include',
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    timerRef.current = setInterval(() => fetchData(), POLL_INTERVAL_MS)
    return () => clearInterval(timerRef.current)
  }, [fetchData])

  // Filter to overnight window
  const { overnightEvents, stats } = useMemo(() => {
    const events = data?.events ?? []
    const window = getOvernightWindow()

    const overnight = events
      .filter((e) => {
        const ts = e.timestamp || e.ts || 0
        return ts >= window.start && ts <= window.end
      })
      .sort((a, b) => b.timestamp - a.timestamp)

    const sessions = overnight.length
    const completed = overnight.filter((e) => e.status === 'success').length
    const errors = overnight.filter((e) => e.status === 'error' || e.eventType === 'error').length
    const cronRuns = overnight.filter((e) => e.eventType === 'cron').length

    return {
      overnightEvents: overnight,
      stats: { sessions, completed, errors, cronRuns },
    }
  }, [data])

  const isMock = data?.mock ?? true
  const freshnessTs = data?.freshness?.generatedAtMs || data?.ts || 0
  const freshnessLabel = formatFreshness(freshnessTs)
  const hasActivity = overnightEvents.length > 0

  // Determine window label
  const now = new Date()
  const windowLabel = now.getHours() < 8 ? 'Overnight activity (in progress)' : 'Last Night (11 PM – 8 AM)'

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Moon size={16} style={{ color: 'var(--color-accent)' }} />
          <h2 className="section-title">{windowLabel}</h2>
        </div>

        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold"
            style={{
              background: isMock ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
              color: isMock ? '#b45309' : '#047857',
            }}
          >
            {isMock ? '🔴 MOCK' : '🟢 LIVE'}
          </span>
          <span>{freshnessLabel}</span>
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            title="Refresh"
            style={{
              background: 'none',
              border: 'none',
              cursor: refreshing ? 'wait' : 'pointer',
              padding: 0,
              color: 'var(--color-text-muted)',
              display: 'flex',
            }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div className="card px-4 py-4">
        {loading && !data ? (
          <div className="py-8 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            <Cog size={18} className="mx-auto mb-2 opacity-50" />
            Loading overnight data…
          </div>
        ) : error && !data ? (
          <div className="py-6 text-sm text-center" style={{ color: 'var(--color-error)' }}>
            <AlertTriangle size={16} className="mx-auto mb-1" />
            {error}
          </div>
        ) : !hasActivity ? (
          <div className="py-8 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            <Moon size={18} className="mx-auto mb-2 opacity-40" />
            No overnight activity recorded.
          </div>
        ) : (
          <>
            {/* Stats summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Events', value: stats.sessions, color: 'var(--color-accent)' },
                { label: 'Completed', value: stats.completed, color: 'var(--color-online)' },
                { label: 'Errors', value: stats.errors, color: stats.errors > 0 ? 'var(--color-error)' : 'var(--color-text-muted)' },
                { label: 'Cron Runs', value: stats.cronRuns, color: '#a78bfa' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg px-3 py-2 text-center"
                  style={{ background: 'var(--color-surface-2)' }}
                >
                  <div className="text-lg font-bold" style={{ color: stat.color }}>
                    {stat.value}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Status line */}
            <div className="flex items-center gap-2 mb-3">
              {stats.errors === 0 ? (
                <>
                  <CheckCircle2 size={14} style={{ color: 'var(--color-online)' }} />
                  <span className="text-xs" style={{ color: 'var(--color-online)' }}>
                    All overnight tasks completed without errors
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle size={14} style={{ color: 'var(--color-error)' }} />
                  <span className="text-xs" style={{ color: 'var(--color-error)' }}>
                    {stats.errors} error{stats.errors !== 1 ? 's' : ''} detected overnight
                  </span>
                </>
              )}
            </div>

            {/* Collapsible event list */}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold w-full mb-2"
              style={{
                color: 'var(--color-accent)',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'Hide' : 'Show'} {overnightEvents.length} event{overnightEvents.length !== 1 ? 's' : ''}
            </button>

            {expanded && (
              <div
                className="border-t pt-2 max-h-64 overflow-y-auto"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {overnightEvents.map((event) => (
                  <EventRow key={event.id || event.timestamp} event={event} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
