import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { formatUptime, relativeTime } from '../data/mock'

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

function getStaleness(lastActiveMs) {
  if (!lastActiveMs) return null
  const age = Date.now() - lastActiveMs
  if (age >= STALE_RED_MS)   return 'red'
  if (age >= STALE_AMBER_MS) return 'amber'
  return null
}

function stalenessStyle(level) {
  if (level === 'red')   return { color: '#ef4444' }
  if (level === 'amber') return { color: '#f59e0b' }
  return { color: 'var(--color-text-muted)' }
}

// Mini sparkline SVG — accepts an array of 0-100 values
function Sparkline({ data = [], color = 'var(--color-accent)' }) {
  if (!data.length) return null
  const W = 64, H = 24, pad = 2
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2)
    const y = H - pad - ((v / max) * (H - pad * 2))
    return `${x},${y}`
  })
  const polyline = pts.join(' ')
  const area = `M${pts[0]} L${pts.slice(1).join(' L')} L${W - pad},${H - pad} L${pad},${H - pad} Z`

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace(/[^a-z]/gi, '')})`} />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last dot */}
      <circle
        cx={pts[pts.length - 1].split(',')[0]}
        cy={pts[pts.length - 1].split(',')[1]}
        r="2"
        fill={color}
      />
    </svg>
  )
}

const SPARKLINE_COLOR = {
  online: 'var(--color-online)',
  busy: 'var(--color-busy)',
  idle: 'var(--color-idle)',
  error: 'var(--color-error)',
}

// Task progress indicator
function TaskProgress({ status }) {
  if (status === 'running' || status === 'busy') {
    return (
      <Loader2
        size={12}
        style={{ color: 'var(--color-busy)', animation: 'spin 1.2s linear infinite', flexShrink: 0 }}
      />
    )
  }
  if (status === 'success' || status === 'done') {
    return <CheckCircle2 size={12} style={{ color: 'var(--color-online)', flexShrink: 0 }} />
  }
  if (status === 'error' || status === 'failed') {
    return <XCircle size={12} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
  }
  return null
}

// Card border/glow style based on agent status
function getCardStyle(status, staleLevel) {
  if (status === 'busy') {
    return {
      borderColor: 'rgba(245,158,11,0.5)',
      boxShadow: '0 0 16px rgba(245,158,11,0.12)',
    }
  }
  if (status === 'idle') {
    return {
      borderColor: 'rgba(245,158,11,0.25)',
    }
  }
  if (status === 'offline') {
    return {
      opacity: 0.65,
    }
  }
  if (staleLevel === 'red') {
    return { borderColor: 'rgba(239,68,68,0.4)' }
  }
  if (staleLevel === 'amber') {
    return { borderColor: 'rgba(245,158,11,0.35)' }
  }
  return {}
}

export default function AgentCard({ agent, index }) {
  const delay = ['delay-100', 'delay-200', 'delay-300', 'delay-400', 'delay-500'][index % 5]
  const sparkColor = SPARKLINE_COLOR[agent.status] ?? 'var(--color-accent)'
  const staleLevel = getStaleness(agent.lastActiveMs)
  const lastSeenLabel = agent.lastActiveMs ? relativeTime(agent.lastActiveMs) : null
  const cardStyle = getCardStyle(agent.status, staleLevel)

  // Sub-steps support
  const subSteps = Array.isArray(agent.subSteps) ? agent.subSteps : []

  return (
    <div
      className={`card p-5 flex flex-col gap-4 animate-slide-up ${delay}`}
      style={cardStyle}
    >
      {/* Top row — avatar + name + status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar with status ring */}
          <div className="relative flex-shrink-0">
            <div
              className="text-2xl w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-surface-2)' }}
            >
              {agent.avatar}
            </div>
            {agent.status === 'online' && (
              <span className="agent-heartbeat-ring" />
            )}
            {agent.status === 'busy' && (
              <span
                className="agent-heartbeat-ring"
                style={{ borderColor: 'var(--color-busy)', animation: 'heartbeat-ring 1.4s ease-out infinite' }}
              />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              {agent.name}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {agent.role}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`status-dot ${agent.status}${
              agent.status === 'online' || agent.status === 'busy' ? ' pulse' : ''
            }`}
          />
          <span className={`tag ${agent.status}`}>{STATUS_LABEL[agent.status] ?? agent.status}</span>
        </div>
      </div>

      {/* Current task — prominent when busy */}
      <div
        className="rounded-lg px-3 py-2.5 text-xs leading-relaxed min-h-[40px]"
        style={{
          background: agent.status === 'busy'
            ? 'rgba(245,158,11,0.08)'
            : 'var(--color-surface-2)',
          border: agent.status === 'busy' ? '1px solid rgba(245,158,11,0.25)' : '1px solid transparent',
          color: 'var(--color-text-secondary)',
        }}
      >
        {agent.currentTask ? (
          <div className="flex items-start gap-2">
            <TaskProgress status={agent.status} />
            <span className={agent.status === 'busy' ? 'font-medium' : ''}>
              {agent.currentTask}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No active task</span>
        )}
      </div>

      {/* Sub-steps list */}
      {subSteps.length > 0 && (
        <ul className="space-y-1">
          {subSteps.map((step, i) => (
            <li key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <TaskProgress status={step.status} />
              <span className={step.status === 'running' ? 'font-medium' : ''}>{step.label}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Load bar + sparkline */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Load</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
              {agent.load}%
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${agent.load}%`,
                background: agent.status === 'busy'
                  ? 'var(--color-busy)'
                  : agent.status === 'error'
                  ? 'var(--color-error)'
                  : undefined,
              }}
            />
          </div>
        </div>
        <div className="flex-shrink-0 pb-0.5">
          <Sparkline data={agent.sparkline} color={sparkColor} />
        </div>
      </div>

      {/* Footer stats */}
      <div
        className="flex items-center justify-between text-xs pt-1 border-t"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
      >
        <span>
          <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
            {agent.tasksCompleted}
          </span>{' '}
          tasks
        </span>

        {/* Last seen with stale detection */}
        {lastSeenLabel ? (
          <span style={stalenessStyle(staleLevel)}>
            {staleLevel === 'red'   && '🔴 '}
            {staleLevel === 'amber' && '🟡 '}
            last seen {lastSeenLabel}
          </span>
        ) : (
          <span>
            Active{' '}
            <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
              {formatUptime(agent.uptime)} up
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
