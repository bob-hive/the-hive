import { Activity } from 'lucide-react'
import { relativeTime } from '../data/mock'
import { formatFreshness, isStale } from '../utils/freshness'

const STATUS_LABEL = {
  online: 'Online',
  busy: 'Busy',
  idle: 'Idle',
  error: 'Error',
}

const PULSE_LABEL = {
  hot: 'Hot',
  warm: 'Warm',
  cool: 'Cool',
  cold: 'Cold',
}

function pulseColor(pulse) {
  if (pulse === 'hot') return 'var(--color-success)'
  if (pulse === 'warm') return 'var(--color-busy)'
  if (pulse === 'cool') return 'var(--color-accent)'
  return 'var(--color-idle)'
}

export default function RealTimeStatusPanel({ panel }) {
  const agents = panel?.agents || []
  const freshnessTs = panel?.freshness?.generatedAtMs || panel?.ts || 0
  const freshnessLabel = formatFreshness(freshnessTs)
  const stale = isStale(freshnessTs, panel?.freshness?.staleAfterMs || 90_000)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="section-title">Real-time Status</h2>
          <span className="section-chip">{panel?.mode || 'MOCK'}</span>
          <span className="text-xs" style={{ color: stale ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
            {freshnessLabel}
          </span>
        </div>
        <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          {panel?.counts?.busy || 0} busy · {panel?.counts?.online || 0} online · {panel?.counts?.idle || 0} idle
        </span>
      </div>

      <div className="card overflow-hidden">
        {agents.length === 0 ? (
          <div className="px-4 py-7 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            No agent status data yet.
          </div>
        ) : (
          <ul>
            {agents.map((agent, index) => {
              const isLast = index === agents.length - 1
              const pulse = agent.pulse || 'cold'

              return (
                <li
                  key={agent.id}
                  className="px-4 py-3 flex items-center gap-3"
                  style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-border)' }}
                >
                  <div className="text-xl w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-surface-2)' }}>
                    {agent.avatar || '🤖'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {agent.name}
                      </span>
                      <span className={`tag ${agent.status || 'idle'}`}>
                        {STATUS_LABEL[agent.status] || agent.status || 'Idle'}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1"
                        style={{ background: 'var(--color-surface-2)', color: pulseColor(pulse) }}>
                        <Activity size={11} /> {PULSE_LABEL[pulse] || pulse}
                      </span>
                    </div>
                    <p className="text-xs truncate mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      {agent.currentTask || 'No active task'}
                    </p>
                  </div>

                  <div className="text-right text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <div>Last seen</div>
                    <div className="font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                      {agent.lastSeenMs ? relativeTime(agent.lastSeenMs) : '—'}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
