import { formatUptime, relativeTime } from '../data/mock'

const STATUS_LABEL = {
  online: 'Online',
  busy: 'Busy',
  idle: 'Idle',
  error: 'Error',
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

export default function AgentCard({ agent, index }) {
  const delay = ['delay-100', 'delay-200', 'delay-300', 'delay-400', 'delay-500'][index % 5]
  const sparkColor = SPARKLINE_COLOR[agent.status] ?? 'var(--color-accent)'

  return (
    <div className={`card p-5 flex flex-col gap-4 animate-slide-up ${delay}`}>
      {/* Top row — avatar + name + status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="text-2xl w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-surface-2)' }}
          >
            {agent.avatar}
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
          <span className={`status-dot ${agent.status}${agent.status === 'online' ? ' pulse' : ''}`} />
          <span className={`tag ${agent.status}`}>{STATUS_LABEL[agent.status] ?? agent.status}</span>
        </div>
      </div>

      {/* Current task */}
      <div
        className="rounded-lg px-3 py-2.5 text-xs leading-relaxed min-h-[40px] flex items-center"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
      >
        {agent.currentTask || (
          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No active task</span>
        )}
      </div>

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
            <div className="progress-fill" style={{ width: `${agent.load}%` }} />
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
        <span>
          Active{' '}
          <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
            {agent.lastActiveMs ? relativeTime(agent.lastActiveMs) : formatUptime(agent.uptime) + ' up'}
          </span>
        </span>
      </div>
    </div>
  )
}
