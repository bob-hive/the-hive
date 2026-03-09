import { formatUptime } from '../data/mock'

const STATUS_LABEL = {
  online: 'Online',
  busy: 'Busy',
  idle: 'Idle',
}

export default function AgentCard({ agent, index }) {
  const delay = ['delay-100', 'delay-200', 'delay-300', 'delay-400', 'delay-500'][index % 5]

  return (
    <div className={`card p-5 flex flex-col gap-4 animate-slide-up ${delay}`}>
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="text-2xl w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-surface-2)' }}
          >
            {agent.avatar}
          </div>
          <div>
            <h3
              className="font-semibold text-sm leading-tight"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {agent.name}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {agent.role}
            </p>
          </div>
        </div>
        {/* Status badge */}
        <div className="flex items-center gap-1.5">
          <span
            className={`status-dot ${agent.status}${agent.status === 'online' ? ' pulse' : ''}`}
          />
          <span className={`tag ${agent.status}`}>{STATUS_LABEL[agent.status]}</span>
        </div>
      </div>

      {/* Current task */}
      <div
        className="rounded-lg px-3 py-2.5 text-xs leading-relaxed min-h-[40px] flex items-center"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
      >
        {agent.currentTask || (
          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            No active task
          </span>
        )}
      </div>

      {/* Load bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Load
          </span>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {agent.load}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${agent.load}%` }}
          />
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
          done today
        </span>
        <span>
          Up{' '}
          <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
            {formatUptime(agent.uptime)}
          </span>
        </span>
      </div>
    </div>
  )
}
