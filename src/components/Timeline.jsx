import { useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { relativeTime, formatDuration } from '../data/mock'

const STATUS_ICON = {
  success: <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} />,
  failed:  <XCircle size={14} style={{ color: 'var(--color-error)' }} />,
  pending: <Clock size={14} style={{ color: 'var(--color-busy)' }} />,
  running: <Loader2 size={14} style={{ color: 'var(--color-accent)', animation: 'spin 1.2s linear infinite' }} />,
}

const STATUS_DOT_COLOR = {
  success: 'var(--color-success)',
  failed:  'var(--color-error)',
  pending: 'var(--color-busy)',
  running: 'var(--color-accent)',
}

const STATUS_FILTERS = ['all', 'running', 'success', 'pending', 'failed']
const DATE_RANGES = [
  { label: 'Last hour', ms: 60 * 60_000 },
  { label: 'Last 6h',  ms: 6 * 60 * 60_000 },
  { label: 'Last 24h', ms: 24 * 60 * 60_000 },
  { label: 'All time', ms: Infinity },
]

const getNow = () => Date.now()

export default function Timeline({ tasks = [], agents = [] }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [agentFilter, setAgentFilter]   = useState('all')
  const [dateRange, setDateRange]       = useState(DATE_RANGES[3])

  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  const filtered = useMemo(() => {
    const cutoff = dateRange.ms === Infinity ? 0 : getNow() - dateRange.ms
    return tasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (agentFilter !== 'all' && t.agentId !== agentFilter) return false
      if (t.timestamp < cutoff) return false
      return true
    })
  }, [tasks, statusFilter, agentFilter, dateRange])

  return (
    <section className="animate-fade-in" style={{ animationDelay: '0.25s' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="section-title">
          Task Timeline
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Agent filter */}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="text-xs px-3 py-1 rounded-full outline-none"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              appearance: 'none',
              paddingRight: '1.5rem',
              cursor: 'pointer',
            }}
          >
            <option value="all">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>
            ))}
          </select>

          {/* Date range */}
          <select
            value={dateRange.label}
            onChange={(e) => setDateRange(DATE_RANGES.find((d) => d.label === e.target.value))}
            className="text-xs px-3 py-1 rounded-full outline-none"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              appearance: 'none',
              paddingRight: '1.5rem',
              cursor: 'pointer',
            }}
          >
            {DATE_RANGES.map((d) => (
              <option key={d.label} value={d.label}>{d.label}</option>
            ))}
          </select>

          {/* Status filter pills */}
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-200"
                style={{
                  background: active ? 'var(--color-accent)' : 'var(--color-surface-2)',
                  color: active ? '#fff' : 'var(--color-text-secondary)',
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  boxShadow: active ? 'var(--glow-accent)' : 'none',
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className="card p-5" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No tasks match your filters.
          </div>
        ) : (
          <ol className="relative" style={{ paddingLeft: '1.5rem' }}>
            {/* Vertical track line */}
            <div
              className="absolute top-0 bottom-0"
              style={{ left: '0.45rem', width: '2px', background: 'var(--color-border)' }}
            />

            {filtered.map((task, i) => {
              const agent = agentsById.get(task.agentId)
              const dotColor = STATUS_DOT_COLOR[task.status] ?? 'var(--color-border)'
              const isLast = i === filtered.length - 1

              return (
                <li
                  key={task.id}
                  className="relative flex gap-4"
                  style={{ marginBottom: isLast ? 0 : '1.25rem' }}
                >
                  {/* Dot */}
                  <div
                    className="absolute flex-shrink-0 flex items-center justify-center"
                    style={{
                      left: '-1.5rem',
                      top: '2px',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: dotColor,
                      boxShadow: task.status === 'running' ? `0 0 8px ${dotColor}` : 'none',
                      zIndex: 1,
                    }}
                  >
                    {task.status === 'running' && (
                      <div
                        style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: '#fff', opacity: 0.9,
                          animation: 'pulse-dot 1.5s ease-in-out infinite',
                        }}
                      />
                    )}
                  </div>

                  {/* Card */}
                  <div
                    className="flex-1 rounded-xl px-4 py-3 transition-colors duration-150"
                    style={{
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {STATUS_ICON[task.status]}
                        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {task.title}
                        </span>
                        <span className={`tag ${task.status}`}>{task.status}</span>
                      </div>
                      <span className="text-xs tabular-nums flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                        {relativeTime(task.timestamp)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
                      {agent && (
                        <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                          {agent.avatar} {agent.name}
                        </span>
                      )}
                      {task.duration && (
                        <>
                          <span>·</span>
                          <span>{formatDuration(task.duration)}</span>
                        </>
                      )}
                      {task.detail && (
                        <>
                          <span>·</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>{task.detail}</span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
