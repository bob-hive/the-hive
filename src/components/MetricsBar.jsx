import { useMemo } from 'react'
import { CheckCircle2, Radio, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react'

// Compute live stats from agents + events when available
function computeLiveMetrics(metrics, agents = [], events = []) {
  const now = Date.now()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayStartMs = todayStart.getTime()

  // Sessions today: events with timestamp > todayStartMs
  const eventsToday = events.filter((e) => {
    const ts = e.timestamp || e.ts || 0
    return ts >= todayStartMs
  })
  const sessionsToday = eventsToday.length || metrics.tasksCompletedToday || 0

  // Active agents: not idle/offline
  const activeAgents = agents.filter((a) => a.status === 'busy' || a.status === 'online').length
  const totalAgents = agents.length || metrics.totalAgents || 0

  // Success rate from events
  const successEvents = eventsToday.filter((e) => e.status === 'success')
  const failedEvents = eventsToday.filter((e) => e.status === 'error' || e.status === 'failed')
  const ratedEvents = successEvents.length + failedEvents.length
  const liveSuccessRate = ratedEvents > 0
    ? Math.round((successEvents.length / ratedEvents) * 100)
    : metrics.successRate || 0

  return {
    sessionsToday,
    eventsToday: eventsToday.length,
    activeAgents: activeAgents || metrics.activeSessions || 0,
    totalAgents,
    successRate: liveSuccessRate,
    uptimeFormatted: metrics.uptimeFormatted,
  }
}

function DeltaArrow({ delta }) {
  if (delta === null || delta === undefined) {
    return <Minus size={12} style={{ color: 'var(--color-text-muted)' }} />
  }
  if (delta > 0) return <TrendingUp size={12} style={{ color: 'var(--color-online)' }} />
  if (delta < 0) return <TrendingDown size={12} style={{ color: 'var(--color-error)' }} />
  return <Minus size={12} style={{ color: 'var(--color-text-muted)' }} />
}

function DeltaLabel({ delta, suffix = '' }) {
  if (delta === null || delta === undefined) return null
  const color = delta > 0 ? 'var(--color-online)' : delta < 0 ? 'var(--color-error)' : 'var(--color-text-muted)'
  const sign = delta > 0 ? '+' : ''
  return (
    <span className="text-[10px] font-semibold tabular-nums" style={{ color }}>
      {sign}{delta}{suffix} WoW
    </span>
  )
}

export default function MetricsBar({ metrics, agents = [], events = [] }) {
  const live = useMemo(() => computeLiveMetrics(metrics, agents, events), [metrics, agents, events])

  const metricItems = [
    {
      label: 'Sessions Today',
      value: live.sessionsToday,
      suffix: '',
      icon: CheckCircle2,
      color: 'var(--color-online)',
      delay: 'delay-100',
      delta: null, // would need historical data for real WoW
      deltaLabel: live.eventsToday > 0 ? `${live.eventsToday} events` : null,
    },
    {
      label: 'Active Agents',
      value: live.activeAgents,
      suffix: live.totalAgents > 0 ? ` / ${live.totalAgents}` : '',
      icon: Radio,
      color: 'var(--color-accent)',
      delay: 'delay-200',
      delta: null,
      deltaLabel: null,
    },
    {
      label: 'System Uptime',
      value: live.uptimeFormatted,
      suffix: '',
      icon: Clock,
      color: 'var(--color-busy)',
      delay: 'delay-300',
      delta: null,
      deltaLabel: null,
    },
    {
      label: 'Success Rate',
      value: live.successRate,
      suffix: '%',
      icon: TrendingUp,
      color: live.successRate >= 90
        ? 'var(--color-online)'
        : live.successRate >= 70
        ? 'var(--color-busy)'
        : 'var(--color-error)',
      delay: 'delay-400',
      delta: null,
      deltaLabel: null,
    },
  ]

  return (
    <section>
      <h2 className="section-title mb-3">Overview</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricItems.map((item) => {
          const ItemIcon = item.icon

          return (
            <div
              key={item.label}
              className={`card p-5 animate-slide-up ${item.delay}`}
            >
              <div className="flex items-start justify-between mb-3">
                <p
                  className="text-xs font-medium leading-snug"
                  style={{ color: 'var(--color-text-secondary)', maxWidth: '80%' }}
                >
                  {item.label}
                </p>
                <div
                  className="rounded-lg p-1.5 flex-shrink-0"
                  style={{ background: `${item.color}18` }}
                >
                  <ItemIcon size={14} style={{ color: item.color }} />
                </div>
              </div>

              <div className="flex items-baseline gap-0.5">
                <span className="metric-value">{item.value}</span>
                {item.suffix && (
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    {item.suffix}
                  </span>
                )}
              </div>

              {/* Delta row */}
              <div className="flex items-center gap-1 mt-2">
                <DeltaArrow delta={item.delta} />
                {item.deltaLabel ? (
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {item.deltaLabel}
                  </span>
                ) : (
                  <DeltaLabel delta={item.delta} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
