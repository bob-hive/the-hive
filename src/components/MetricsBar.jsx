import { CheckCircle2, Radio, Clock, TrendingUp } from 'lucide-react'

export default function MetricsBar({ metrics }) {
  const metricItems = [
    {
      label: 'Tasks Completed Today',
      value: metrics.tasksCompletedToday,
      suffix: '',
      icon: CheckCircle2,
      color: 'var(--color-online)',
      delay: 'delay-100',
    },
    {
      label: 'Active Sessions',
      value: metrics.activeSessions,
      suffix: ` / ${metrics.totalAgents}`,
      icon: Radio,
      color: 'var(--color-accent)',
      delay: 'delay-200',
    },
    {
      label: 'System Uptime',
      value: metrics.uptimeFormatted,
      suffix: '',
      icon: Clock,
      color: 'var(--color-busy)',
      delay: 'delay-300',
    },
    {
      label: 'Success Rate',
      value: metrics.successRate,
      suffix: '%',
      icon: TrendingUp,
      color: 'var(--color-online)',
      delay: 'delay-400',
    },
  ]

  return (
    <section>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Overview
      </h2>
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
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {item.suffix}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
