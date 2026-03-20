import { Activity, Loader2, CheckCircle2, WifiOff } from 'lucide-react'
import { relativeTime } from '../data/mock'
import { formatFreshness, isStale } from '../utils/freshness'

const STATUS_LABEL = {
  online: 'Online',
  busy: 'Busy',
  idle: 'Idle',
  offline: 'Offline',
  error: 'Error',
}

// Stale detection thresholds
const STALE_AMBER_MS = 30 * 60_000   // 30 min
const STALE_RED_MS   = 2 * 3_600_000 // 2 h

function getLastSeenColor(lastSeenMs) {
  if (!lastSeenMs) return 'var(--color-text-muted)'
  const age = Date.now() - lastSeenMs
  if (age >= STALE_RED_MS) return '#ef4444'
  if (age >= STALE_AMBER_MS) return '#f59e0b'
  return 'var(--color-text-muted)'
}

function getLastSeenLabel(lastSeenMs) {
  if (!lastSeenMs) return '—'
  const age = Date.now() - lastSeenMs
  if (age >= STALE_RED_MS) return `🔴 ${relativeTime(lastSeenMs)}`
  if (age >= STALE_AMBER_MS) return `🟡 ${relativeTime(lastSeenMs)}`
  return relativeTime(lastSeenMs)
}

function StatusIndicator({ status }) {
  if (status === 'busy') {
    return (
      <Loader2
        size={13}
        style={{ color: 'var(--color-busy)', animation: 'spin 1.2s linear infinite', flexShrink: 0 }}
      />
    )
  }
  if (status === 'online') {
    return (
      <CheckCircle2 size={13} style={{ color: 'var(--color-online)', flexShrink: 0 }} />
    )
  }
  if (status === 'offline') {
    return (
      <WifiOff size={13} style={{ color: 'var(--color-idle)', flexShrink: 0 }} />
    )
  }
  return (
    <span
      className={`status-dot ${status || 'idle'}`}
      style={{ flexShrink: 0, marginTop: 2 }}
    />
  )
}

// Agent row card with status-based glow
function AgentRow({ agent, isLast }) {
  const status = agent.status || 'idle'
  const lastSeenMs = agent.lastSeenMs || agent.lastActiveMs

  const rowStyle = {
    borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
    background: status === 'busy'
      ? 'rgba(245,158,11,0.04)'
      : status === 'offline'
      ? 'rgba(148,163,184,0.04)'
      : 'transparent',
    transition: 'background 0.3s ease',
  }

  const avatarGlow = status === 'busy'
    ? { boxShadow: '0 0 8px rgba(245,158,11,0.4)' }
    : status === 'online'
    ? { boxShadow: '0 0 8px rgba(34,197,94,0.3)' }
    : {}

  return (
    <li className="px-4 py-3.5 flex items-center gap-3" style={rowStyle}>
      {/* Avatar */}
      <div
        className="text-xl w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--color-surface-2)', ...avatarGlow }}
      >
        {agent.avatar || '🤖'}
      </div>

      {/* Name + task */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {agent.name}
          </span>
          <span className={`tag ${status}`}>
            {STATUS_LABEL[status] || status}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <StatusIndicator status={status} />
          <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
            {agent.currentTask || (
              <span style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                {status === 'offline' ? 'Offline' : 'No active task'}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Last seen */}
      <div
        className="text-right text-xs flex-shrink-0"
        style={{ color: getLastSeenColor(lastSeenMs), minWidth: 70 }}
      >
        <div style={{ color: 'var(--color-text-muted)' }}>Last seen</div>
        <div className="font-semibold tabular-nums mt-0.5">
          {getLastSeenLabel(lastSeenMs)}
        </div>
      </div>
    </li>
  )
}

export default function RealTimeStatusPanel({ panel }) {
  const agents = panel?.agents || []
  const freshnessTs = panel?.freshness?.generatedAtMs || panel?.ts || 0
  const freshnessLabel = formatFreshness(freshnessTs)
  const stale = isStale(freshnessTs, panel?.freshness?.staleAfterMs || 90_000)
  const source = panel?.source || panel?.mode || 'MOCK'
  const isMock = panel?.mock ?? true

  const counts = panel?.counts || {
    busy: agents.filter((a) => a.status === 'busy').length,
    online: agents.filter((a) => a.status === 'online').length,
    idle: agents.filter((a) => a.status === 'idle').length,
  }

  const sourceColor = isMock
    ? { color: '#b45309', bg: 'rgba(245,158,11,0.12)' }
    : stale
    ? { color: '#b45309', bg: 'rgba(245,158,11,0.12)' }
    : { color: '#047857', bg: 'rgba(16,185,129,0.12)' }

  const sourceLabel = isMock ? '🔴 MOCK' : stale ? '🟡 STALE' : '🟢 LIVE'

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Activity size={16} style={{ color: 'var(--color-accent)' }} />
          <h2 className="section-title">Real-time Agent Status</h2>
          <span
            className="text-[10px] font-bold rounded-full px-2 py-0.5"
            style={{ ...sourceColor, border: `1px solid ${sourceColor.color}44` }}
          >
            {sourceLabel}
          </span>
          <span className="text-xs" style={{ color: stale ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
            {freshnessLabel}
          </span>
        </div>
        <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          {counts.busy > 0 && (
            <span style={{ color: 'var(--color-busy)' }}>{counts.busy} busy</span>
          )}
          {counts.busy > 0 && ' · '}
          {counts.online || 0} online · {counts.idle || 0} idle
        </span>
      </div>

      <div className="card overflow-hidden">
        {agents.length === 0 ? (
          <div className="px-4 py-8 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            <Activity size={18} className="mx-auto mb-2 opacity-40" />
            No agent status data yet. Waiting for first push…
          </div>
        ) : (
          <ul>
            {agents.map((agent, index) => (
              <AgentRow
                key={agent.id || index}
                agent={agent}
                isLast={index === agents.length - 1}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
