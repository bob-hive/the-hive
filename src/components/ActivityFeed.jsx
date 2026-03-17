import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleDot,
  Clock,
  Cog,
  RefreshCw,
  Rocket,
  Terminal,
  Zap,
} from 'lucide-react'
import { formatFreshness } from '../utils/freshness'

const API_KEY = import.meta.env.VITE_HIVE_API_KEY || ''
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const POLL_INTERVAL_MS = 30_000

// ── Event type config ─────────────────────────────────────────────────────────

const EVENT_TYPE_CONFIG = {
  task: {
    label: 'Task',
    icon: Terminal,
    light: { color: '#2563eb', bg: 'rgba(37,99,235,0.10)', border: 'rgba(37,99,235,0.22)' },
    dark:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.13)', border: 'rgba(96,165,250,0.28)' },
  },
  cron: {
    label: 'Cron',
    icon: Clock,
    light: { color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', border: 'rgba(124,58,237,0.22)' },
    dark:  { color: '#a78bfa', bg: 'rgba(167,139,250,0.13)', border: 'rgba(167,139,250,0.28)' },
  },
  alert: {
    label: 'Alert',
    icon: Bell,
    light: { color: '#d97706', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)' },
    dark:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.13)', border: 'rgba(251,191,36,0.30)' },
  },
  error: {
    label: 'Error',
    icon: AlertTriangle,
    light: { color: '#dc2626', bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.25)' },
    dark:  { color: '#f87171', bg: 'rgba(248,113,113,0.13)', border: 'rgba(248,113,113,0.28)' },
  },
  deploy: {
    label: 'Deploy',
    icon: Rocket,
    light: { color: '#059669', bg: 'rgba(5,150,105,0.10)', border: 'rgba(5,150,105,0.24)' },
    dark:  { color: '#34d399', bg: 'rgba(52,211,153,0.13)', border: 'rgba(52,211,153,0.28)' },
  },
  heartbeat: {
    label: 'Heartbeat',
    icon: Activity,
    light: { color: '#0e7490', bg: 'rgba(14,116,144,0.10)', border: 'rgba(14,116,144,0.24)' },
    dark:  { color: '#22d3ee', bg: 'rgba(34,211,238,0.12)', border: 'rgba(34,211,238,0.28)' },
  },
}

const STATUS_CONFIG = {
  success: { label: 'Success', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  running: { label: 'Running', color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
  error:   { label: 'Error',   color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  idle:    { label: 'Idle',    color: '#64748b', bg: 'rgba(148,163,184,0.14)' },
  unknown: { label: 'Unknown', color: '#64748b', bg: 'rgba(148,163,184,0.14)' },
}

const ALL_TYPES = Object.keys(EVENT_TYPE_CONFIG)

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTs(ts) {
  const diff = Math.max(0, Date.now() - ts)
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function isDark() {
  return typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
}

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({ event }) {
  const typeCfg = EVENT_TYPE_CONFIG[event.eventType] || EVENT_TYPE_CONFIG.task
  const statusCfg = STATUS_CONFIG[event.status] || STATUS_CONFIG.unknown
  const colors = isDark() ? typeCfg.dark : typeCfg.light
  const TypeIcon = typeCfg.icon

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <TypeIcon size={13} style={{ color: colors.color, flexShrink: 0 }} />
          <span
            className="text-[10px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5"
            style={{ color: colors.color, background: colors.bg, border: `1px solid ${colors.border}` }}
          >
            {typeCfg.label}
          </span>
          <span
            className="text-[10px] font-semibold rounded-full px-1.5 py-0.5"
            style={{ color: statusCfg.color, background: statusCfg.bg }}
          >
            {statusCfg.label}
          </span>
        </div>
        <span className="text-[11px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {relativeTs(event.timestamp)}
        </span>
      </div>

      <p className="text-sm mt-1.5 font-medium leading-snug" style={{ color: 'var(--color-text-primary)' }}>
        {event.summary}
      </p>

      <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
        {event.agentName || event.agent}
      </p>
    </div>
  )
}

// ── FilterPill ────────────────────────────────────────────────────────────────

function FilterPill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-semibold rounded-full px-2.5 py-1 transition-colors"
      style={{
        background: active ? 'var(--color-accent)' : 'var(--color-surface-2, rgba(100,116,139,0.12))',
        color: active ? '#fff' : 'var(--color-text-secondary)',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivityFeed() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [refreshing, setRefreshing] = useState(false)
  const timerRef = useRef(null)

  const fetchFeed = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (API_KEY) headers['X-Hive-Key'] = API_KEY

      const res = await fetch(`${API_BASE}/api/live/activity-feed?limit=50`, {
        headers,
        credentials: 'include',
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

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
    fetchFeed()
    timerRef.current = setInterval(() => fetchFeed(), POLL_INTERVAL_MS)
    return () => clearInterval(timerRef.current)
  }, [fetchFeed])

  const events = data?.events ?? []
  const freshness = data?.freshness
  const isMock = data?.mock ?? true
  const stale = freshness ? freshness.stale : false
  const freshnessLabel = freshness ? formatFreshness(freshness.generatedAtMs) : '—'

  const filtered = activeFilter === 'all'
    ? events
    : events.filter((e) => e.eventType === activeFilter)

  const typeCounts = {}
  for (const e of events) {
    typeCounts[e.eventType] = (typeCounts[e.eventType] || 0) + 1
  }

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap size={16} style={{ color: 'var(--color-accent)' }} />
          <h2 className="section-title">Activity Feed</h2>
        </div>

        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold"
            style={{
              background: isMock ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
              color: isMock ? '#b45309' : '#047857',
            }}
          >
            <CircleDot size={11} />
            {isMock ? 'MOCK' : 'LIVE'}
          </span>

          {stale && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309' }}
            >
              <AlertTriangle size={11} />
              Stale
            </span>
          )}

          <span>{freshnessLabel}</span>

          <button
            type="button"
            onClick={() => fetchFeed(true)}
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

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <FilterPill
          label={`All (${events.length})`}
          active={activeFilter === 'all'}
          onClick={() => setActiveFilter('all')}
        />
        {ALL_TYPES.map((type) => (
          typeCounts[type] ? (
            <FilterPill
              key={type}
              label={`${EVENT_TYPE_CONFIG[type].label} (${typeCounts[type]})`}
              active={activeFilter === type}
              onClick={() => setActiveFilter(type)}
            />
          ) : null
        ))}
      </div>

      {/* Feed */}
      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="px-4 py-8 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            <Cog size={18} className="mx-auto mb-2 opacity-50" />
            Loading activity feed…
          </div>
        ) : error && !data ? (
          <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--color-error)' }}>
            <AlertTriangle size={16} className="mx-auto mb-1" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            <CheckCircle2 size={18} className="mx-auto mb-2 opacity-40" />
            No{activeFilter !== 'all' ? ` ${activeFilter}` : ''} events.
          </div>
        ) : (
          <div className="px-4 py-3 space-y-2">
            {filtered.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* Refresh note */}
      <p className="text-[11px] mt-2 text-right" style={{ color: 'var(--color-text-muted)' }}>
        Auto-refreshes every 30s
      </p>
    </section>
  )
}
