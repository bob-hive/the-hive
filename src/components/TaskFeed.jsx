import { useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Clock, Loader2, ChevronDown } from 'lucide-react'
import { relativeTime, formatDuration } from '../data/mock'

const STATUS_ICON = {
  success: <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} />,
  failed: <XCircle size={14} style={{ color: 'var(--color-error)' }} />,
  pending: <Clock size={14} style={{ color: 'var(--color-busy)' }} />,
  running: <Loader2 size={14} style={{ color: 'var(--color-accent)', animation: 'spin 1.2s linear infinite' }} />,
}

const FILTERS = ['all', 'running', 'success', 'pending', 'failed']

export default function TaskFeed({ tasks, agents }) {
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)

  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  )

  const filtered = filter === 'all'
    ? tasks
    : tasks.filter((t) => t.status === filter)

  return (
    <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Recent Tasks
        </h2>

        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const count = f === 'all' ? tasks.length : tasks.filter((t) => t.status === f).length
            const active = filter === f
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-200"
                style={{
                  background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
                  color: active ? '#fff' : 'var(--color-text-secondary)',
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  boxShadow: active ? 'var(--glow-accent)' : 'none',
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span
                  className="ml-1.5 opacity-70 tabular-nums"
                  style={{ fontSize: '10px' }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div
        className="card overflow-hidden"
        style={{ border: '1px solid var(--color-border)' }}
      >
        {filtered.length === 0 ? (
          <div
            className="py-12 text-center text-sm"
            style={{ color: 'var(--color-text-muted)' }}
          >
            No tasks match this filter.
          </div>
        ) : (
          <ul>
            {filtered.map((task, i) => {
              const agent = agentsById.get(task.agentId)
              const isOpen = expanded === task.id
              const isLast = i === filtered.length - 1

              return (
                <li
                  key={task.id}
                  className="transition-colors duration-150"
                  style={{
                    borderBottom: isLast ? 'none' : `1px solid var(--color-border)`,
                  }}
                >
                  <button
                    className="w-full text-left px-5 py-3.5 flex items-center gap-3 group"
                    onClick={() => setExpanded(isOpen ? null : task.id)}
                    style={{ background: 'transparent' }}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {STATUS_ICON[task.status]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-sm font-medium truncate"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {task.title}
                        </span>
                        <span className={`tag ${task.status} flex-shrink-0`}>
                          {task.status}
                        </span>
                      </div>
                      <div
                        className="flex items-center gap-2 mt-0.5 text-xs flex-wrap"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {agent && (
                          <span>
                            {agent.avatar} {agent.name}
                          </span>
                        )}
                        <span>·</span>
                        <span>{relativeTime(task.timestamp)}</span>
                        {task.duration && (
                          <>
                            <span>·</span>
                            <span>{formatDuration(task.duration)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {task.detail && (
                      <ChevronDown
                        size={14}
                        className="flex-shrink-0 transition-transform duration-200"
                        style={{
                          color: 'var(--color-text-muted)',
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                        }}
                      />
                    )}
                  </button>

                  {isOpen && task.detail && (
                    <div
                      className="px-5 pb-3.5 text-xs leading-relaxed animate-fade-in"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      <div
                        className="rounded-lg px-3 py-2.5"
                        style={{ background: 'var(--color-surface-2)', fontFamily: 'var(--font-mono)' }}
                      >
                        {task.detail}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
