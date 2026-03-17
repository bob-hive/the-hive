import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Cog,
  RefreshCw,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { formatFreshness } from '../utils/freshness'

const API_KEY = import.meta.env.VITE_HIVE_API_KEY || ''
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const POLL_INTERVAL_MS = 30_000

// ── Gauge ─────────────────────────────────────────────────────────────────────

function gaugeColor(pct) {
  if (pct >= 80) return { bar: '#ef4444', track: 'rgba(239,68,68,0.15)', label: '#dc2626' }
  if (pct >= 60) return { bar: '#f59e0b', track: 'rgba(245,158,11,0.14)', label: '#b45309' }
  return { bar: '#22c55e', track: 'rgba(34,197,94,0.13)', label: '#16a34a' }
}

function ContextGauge({ pct, used, max, alertLevel, estimatedTimeToExhaustionMs }) {
  const colors = gaugeColor(pct)
  const barPct = Math.min(100, Math.max(0, pct))

  function formatTokens(n) {
    if (!n && n !== 0) return '—'
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
  }

  function formatEta(ms) {
    if (!ms) return null
    if (ms < 60_000) return '<1m remaining'
    if (ms < 3_600_000) return `~${Math.floor(ms / 60_000)}m remaining`
    return `~${(ms / 3_600_000).toFixed(1)}h remaining`
  }

  const eta = formatEta(estimatedTimeToExhaustionMs)
  const alertBadge = alertLevel === 'critical' ? 'CRITICAL'
    : alertLevel === 'warn' ? 'WARN'
    : 'OK'

  return (
    <div className="rounded-lg px-4 py-3 mb-4" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: colors.label }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
            Context Window Usage
          </span>
        </div>
        <span
          className="text-[10px] font-bold rounded-full px-2 py-0.5"
          style={{
            background: colors.track,
            color: colors.label,
            border: `1px solid ${colors.bar}44`,
          }}
        >
          {alertBadge}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="rounded-full overflow-hidden mb-1.5"
        style={{ height: 10, background: colors.track, border: `1px solid ${colors.bar}33` }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${barPct}%`, background: colors.bar }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: colors.label }}>
          {barPct}% used
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {formatTokens(used)} / {formatTokens(max)} tokens
        </span>
      </div>

      {eta && (
        <p className="text-[11px] mt-1.5" style={{ color: colors.label }}>
          ⏱ {eta}
        </p>
      )}
    </div>
  )
}

// ── Provider card ─────────────────────────────────────────────────────────────

const PROVIDER_STATUS_STYLES = {
  ok:       { label: 'OK',       color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  warn:     { label: 'Warn',     color: '#b45309', bg: 'rgba(245,158,11,0.14)' },
  critical: { label: 'Critical', color: '#b91c1c', bg: 'rgba(239,68,68,0.13)' },
  unknown:  { label: 'Unknown',  color: '#64748b', bg: 'rgba(148,163,184,0.14)' },
}

function ProviderCard({ id, provider }) {
  const styleCfg = PROVIDER_STATUS_STYLES[provider?.status] || PROVIDER_STATUS_STYLES.unknown

  function formatTokens(n) {
    if (n === null || n === undefined) return '—'
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
  }

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {provider?.label || id}
        </p>
        <span
          className="text-[10px] font-bold rounded-full px-2 py-0.5"
          style={{ color: styleCfg.color, background: styleCfg.bg }}
        >
          {styleCfg.label}
        </span>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {provider?.tokens30d !== null && provider?.tokens30d !== undefined
          ? `${formatTokens(provider.tokens30d)} tokens (30d)`
          : provider?.note || '—'}
      </p>
    </div>
  )
}

// ── Alert history ─────────────────────────────────────────────────────────────

function relativeTs(ts, now) {
  const diff = Math.max(0, now - ts)
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function AlertRow({ alert, now }) {
  const level = alert.level || 'info'
  const color = level === 'critical' ? '#dc2626' : level === 'warn' ? '#b45309' : '#2563eb'
  const bg = level === 'critical' ? 'rgba(220,38,38,0.08)'
    : level === 'warn' ? 'rgba(245,158,11,0.08)'
    : 'rgba(37,99,235,0.08)'

  return (
    <div
      className="flex items-start gap-2 rounded px-2.5 py-2"
      style={{ background: bg, border: `1px solid ${color}22` }}
    >
      <ShieldAlert size={12} style={{ color, marginTop: 2, flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-snug" style={{ color: 'var(--color-text-primary)' }}>
          {alert.message}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {alert.ts ? relativeTs(alert.ts, now) : '—'} · {level.toUpperCase()}
        </p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UsageTracker() {
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

      const res = await fetch(`${API_BASE}/api/live/usage-tracker`, {
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

  const freshness = data?.freshness
  const isMock = data?.mock ?? true
  const freshnessLabel = freshness ? formatFreshness(freshness.generatedAtMs) : '—'

  const providers = data?.providers ?? {}
  const recentAlerts = data?.recentAlerts ?? []
  const nowMs = data?.ts ?? 0
  const trendEntries = data?.trendEntries ?? []

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap size={16} style={{ color: 'var(--color-accent)' }} />
          <h2 className="section-title">Cost &amp; Token Usage</h2>
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

      {/* Body */}
      <div className="card px-4 py-4">
        {loading && !data ? (
          <div className="py-8 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            <Cog size={18} className="mx-auto mb-2 opacity-50" />
            Loading usage data…
          </div>
        ) : error && !data ? (
          <div className="py-6 text-sm text-center" style={{ color: 'var(--color-error)' }}>
            <AlertTriangle size={16} className="mx-auto mb-1" />
            {error}
          </div>
        ) : (
          <>
            {/* Context gauge */}
            <ContextGauge
              pct={data?.pct ?? 0}
              used={data?.used}
              max={data?.max}
              alertLevel={data?.alertLevel || 'ok'}
              estimatedTimeToExhaustionMs={data?.estimatedTimeToExhaustionMs}
            />

            {/* Provider status cards */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Provider Status
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(providers).map(([id, provider]) => (
                  <ProviderCard key={id} id={id} provider={provider} />
                ))}
              </div>
            </div>

            {/* Alert history */}
            {recentAlerts.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Recent Alerts
                </p>
                <div className="space-y-1.5">
                  {recentAlerts.slice(0, 5).map((alert, i) => (
                    <AlertRow key={i} alert={alert} now={nowMs} />
                  ))}
                </div>
              </div>
            )}

            {/* Usage trend log */}
            {trendEntries.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Usage Trend (last {trendEntries.length} checks)
                </p>
                <div className="space-y-1.5">
                  {trendEntries.map((entry, i) => (
                    <div key={i} className="flex gap-2">
                      <span
                        className="text-[10px] font-mono shrink-0 mt-0.5"
                        style={{ color: 'var(--color-text-muted)', minWidth: 120 }}
                      >
                        {entry.date}
                      </span>
                      <span className="text-[11px] leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
                        {entry.summary}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recentAlerts.length === 0 && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-success, #16a34a)' }}>
                <CheckCircle2 size={14} />
                No usage alerts recorded.
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-[11px] mt-2 text-right" style={{ color: 'var(--color-text-muted)' }}>
        Auto-refreshes every 30s
      </p>
    </section>
  )
}
