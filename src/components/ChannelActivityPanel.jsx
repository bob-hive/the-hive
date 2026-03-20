import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { BarChart2, RefreshCw, AlertTriangle, Cog } from 'lucide-react'
import { formatFreshness } from '../utils/freshness'

const API_KEY = import.meta.env.VITE_HIVE_API_KEY || ''
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const POLL_INTERVAL_MS = 30_000

// Channel config: icon, label, color
const CHANNEL_CONFIG = {
  telegram: { label: 'Telegram', color: '#2AABEE', icon: '✈️' },
  discord:  { label: 'Discord',  color: '#5865F2', icon: '🎮' },
  cron:     { label: 'Cron',     color: '#a78bfa', icon: '⏰' },
  heartbeat:{ label: 'Heartbeat',color: '#22c55e', icon: '💓' },
  task:     { label: 'Task',     color: '#60a5fa', icon: '⚙️' },
  error:    { label: 'Error',    color: '#ef4444', icon: '⚠️' },
  deploy:   { label: 'Deploy',   color: '#34d399', icon: '🚀' },
}

function deriveChannel(event) {
  // Use eventType if it maps directly
  if (event.eventType in CHANNEL_CONFIG) return event.eventType

  // Try channel field
  const ch = (event.channel || '').toLowerCase()
  if (ch in CHANNEL_CONFIG) return ch

  // Fallback: map event types
  const t = (event.type || event.eventType || '').toLowerCase()
  if (t === 'spawned' || t === 'active' || t === 'completed') return 'task'
  if (t === 'alert') return 'error'
  return 'task'
}

// Mini horizontal bar chart for a single channel
function ChannelBar({ label, icon, color, count, maxCount }) {
  const pct = maxCount > 0 ? Math.max(3, Math.round((count / maxCount) * 100)) : 0

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-base w-5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {label}
          </span>
          <span className="text-xs font-bold tabular-nums" style={{ color }}>
            {count}
          </span>
        </div>
        <div
          className="rounded-full overflow-hidden"
          style={{ height: 6, background: 'var(--color-surface-2)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color, opacity: 0.85 }}
          />
        </div>
      </div>
    </div>
  )
}

// Stacked summary: total breakdown by channel
function StackedBar({ channels, total }) {
  if (!total) return null

  return (
    <div className="mb-4">
      <div className="rounded-full overflow-hidden flex" style={{ height: 8 }}>
        {channels.map(({ key, count, color }) => {
          if (!count) return null
          const pct = (count / total) * 100
          return (
            <div
              key={key}
              title={`${CHANNEL_CONFIG[key]?.label || key}: ${count}`}
              className="h-full transition-all duration-700"
              style={{ width: `${pct}%`, background: color }}
            />
          )
        })}
      </div>
      <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
        {total} events in last 24h
      </p>
    </div>
  )
}

export default function ChannelActivityPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const timerRef = useRef(null)

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (API_KEY) headers['X-Hive-Key'] = API_KEY

      // Fetch activity feed — same source as ActivityFeed
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

  // Process events into channel counts (last 24h)
  const channelStats = useMemo(() => {
    const events = data?.events ?? []
    const cutoff = Date.now() - 24 * 60 * 60_000
    const recent = events.filter((e) => (e.timestamp || 0) >= cutoff)

    const counts = {}
    for (const ev of recent) {
      const ch = deriveChannel(ev)
      counts[ch] = (counts[ch] || 0) + 1
    }

    // Build sorted channel list
    const channelList = Object.entries(CHANNEL_CONFIG)
      .map(([key, cfg]) => ({
        key,
        label: cfg.label,
        icon: cfg.icon,
        color: cfg.color,
        count: counts[key] || 0,
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)

    const total = channelList.reduce((s, c) => s + c.count, 0)
    const maxCount = channelList[0]?.count || 1

    return { channelList, total, maxCount }
  }, [data])

  const isMock = data?.mock ?? true
  const freshnessTs = data?.freshness?.generatedAtMs || data?.ts || 0
  const freshnessLabel = formatFreshness(freshnessTs)

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} style={{ color: 'var(--color-accent)' }} />
          <h2 className="section-title">Channel Activity (24h)</h2>
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
            Loading channel data…
          </div>
        ) : error && !data ? (
          <div className="py-6 text-sm text-center" style={{ color: 'var(--color-error)' }}>
            <AlertTriangle size={16} className="mx-auto mb-1" />
            {error}
          </div>
        ) : channelStats.channelList.length === 0 ? (
          <div className="py-8 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            <BarChart2 size={18} className="mx-auto mb-2 opacity-40" />
            No activity in the last 24h.
          </div>
        ) : (
          <>
            {/* Stacked overview bar */}
            <StackedBar
              channels={channelStats.channelList}
              total={channelStats.total}
            />

            {/* Per-channel bars */}
            <div className="space-y-3">
              {channelStats.channelList.map((ch) => (
                <ChannelBar
                  key={ch.key}
                  label={ch.label}
                  icon={ch.icon}
                  color={ch.color}
                  count={ch.count}
                  maxCount={channelStats.maxCount}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <p className="text-[11px] mt-2 text-right" style={{ color: 'var(--color-text-muted)' }}>
        Auto-refreshes every 30s
      </p>
    </section>
  )
}
