import { useMemo, useState, useRef } from 'react'
import { CheckCircle2, XCircle, Clock, Loader2, BarChart3, List } from 'lucide-react'
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

const STATUS_BAR_COLOR = {
  success: '#22c55e',
  failed:  '#ef4444',
  pending: '#f59e0b',
  running: '#6366f1',
}

const STATUS_FILTERS = ['all', 'running', 'success', 'pending', 'failed']
const DATE_RANGES = [
  { label: 'Last hour', ms: 60 * 60_000 },
  { label: 'Last 6h',  ms: 6 * 60 * 60_000 },
  { label: 'Last 24h', ms: 24 * 60 * 60_000 },
  { label: 'All time', ms: Infinity },
]

const getNow = () => Date.now()

// ── Swimlane / Gantt view ─────────────────────────────────────────────────────

const SWIMLANE_HEIGHT = 32
const SWIMLANE_GAP = 8
const LABEL_WIDTH = 90

function SwimlaneView({ tasks, agents, dateRangeMs }) {
  const [tooltip, setTooltip] = useState(null)
  const containerRef = useRef(null)

  const now = getNow()
  const windowMs = dateRangeMs === Infinity ? 24 * 60 * 60_000 : dateRangeMs
  const windowStart = now - windowMs

  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])
  const agentIds = useMemo(() => {
    // Show agents that have tasks, plus known agents
    const ids = new Set(['bob', 'scout', 'forge'])
    for (const t of tasks) {
      if (t.agentId) ids.add(t.agentId)
    }
    return [...ids]
  }, [tasks])

  // Group tasks by agent
  const tasksByAgent = useMemo(() => {
    const map = {}
    for (const id of agentIds) map[id] = []
    for (const t of tasks) {
      if (t.agentId && map[t.agentId]) {
        map[t.agentId].push(t)
      } else if (!t.agentId) {
        // unassigned — put in first bucket
        const first = agentIds[0]
        if (first) map[first].push(t)
      }
    }
    return map
  }, [tasks, agentIds])

  function pct(ts) {
    return Math.max(0, Math.min(100, ((ts - windowStart) / windowMs) * 100))
  }

  function barWidth(task) {
    const start = task.timestamp
    const end = task.durationMs
      ? start + task.durationMs
      : task.duration
      ? start + task.duration
      : start + 5 * 60_000 // default 5 min width

    const leftPct = pct(start)
    const rightPct = pct(Math.min(end, now))
    return { left: leftPct, width: Math.max(0.5, rightPct - leftPct) }
  }

  const totalHeight = agentIds.length * (SWIMLANE_HEIGHT + SWIMLANE_GAP) + 30

  // Time axis labels
  const timeLabels = useMemo(() => {
    const count = 6
    const labels = []
    for (let i = 0; i <= count; i++) {
      const ts = windowStart + (windowMs * i) / count
      labels.push({
        pct: (i / count) * 100,
        label: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })
    }
    return labels
  }, [windowStart, windowMs])

  return (
    <div ref={containerRef} className="relative overflow-x-auto" style={{ minHeight: totalHeight }}>
      {/* Time axis */}
      <div className="flex mb-3" style={{ paddingLeft: LABEL_WIDTH, position: 'relative' }}>
        {timeLabels.map((tl, i) => (
          <div
            key={i}
            className="absolute text-[10px]"
            style={{
              left: `calc(${LABEL_WIDTH}px + ${tl.pct}% - 20px)`,
              color: 'var(--color-text-muted)',
              top: 0,
              width: 40,
              textAlign: 'center',
            }}
          >
            {tl.label}
          </div>
        ))}
      </div>

      {/* Swimlanes */}
      <div style={{ paddingLeft: LABEL_WIDTH, marginTop: 18, position: 'relative' }}>
        {/* Grid lines */}
        {timeLabels.map((tl, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: `${tl.pct}%`,
              width: 1,
              background: 'var(--color-border)',
              opacity: 0.5,
            }}
          />
        ))}

        {/* "Now" marker */}
        <div
          className="absolute top-0 bottom-0"
          style={{ left: '100%', width: 2, background: 'var(--color-accent)', opacity: 0.6 }}
        />

        {agentIds.map((agentId, rowIdx) => {
          const agent = agentsById.get(agentId)
          const agentName = agent?.name || agentId.charAt(0).toUpperCase() + agentId.slice(1)
          const agentAvatar = agent?.avatar || '🤖'
          const agentTasks = tasksByAgent[agentId] || []
          const top = rowIdx * (SWIMLANE_HEIGHT + SWIMLANE_GAP)

          return (
            <div key={agentId} style={{ position: 'relative', marginBottom: SWIMLANE_GAP }}>
              {/* Row background */}
              <div
                className="rounded"
                style={{
                  position: 'absolute',
                  left: 0, right: 0, top: 0,
                  height: SWIMLANE_HEIGHT,
                  background: 'var(--color-surface-2)',
                  opacity: 0.4,
                }}
              />

              {/* Task bars */}
              {agentTasks.map((task) => {
                const { left, width } = barWidth(task)
                const color = STATUS_BAR_COLOR[task.status] || '#6366f1'

                return (
                  <div
                    key={task.id}
                    className="absolute rounded cursor-pointer transition-opacity hover:opacity-90"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      top: 4,
                      height: SWIMLANE_HEIGHT - 8,
                      background: color,
                      opacity: 0.75,
                      boxShadow: task.status === 'running' ? `0 0 8px ${color}66` : 'none',
                      minWidth: 4,
                    }}
                    onMouseEnter={(e) => {
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        task,
                        agent: agentName,
                        avatar: agentAvatar,
                      })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })}

              {/* Empty row placeholder */}
              {agentTasks.length === 0 && (
                <div
                  className="absolute flex items-center justify-center text-[10px]"
                  style={{
                    left: 0, right: 0,
                    height: SWIMLANE_HEIGHT,
                    color: 'var(--color-text-muted)',
                    fontStyle: 'italic',
                  }}
                >
                  no tasks
                </div>
              )}

              {/* Row label — positioned to the left of the swimlane container */}
              <div
                className="absolute flex items-center gap-1.5"
                style={{
                  left: -LABEL_WIDTH,
                  top: 0,
                  width: LABEL_WIDTH - 8,
                  height: SWIMLANE_HEIGHT,
                }}
              >
                <span className="text-base">{agentAvatar}</span>
                <span className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {agentName}
                </span>
              </div>

              {/* Invisible height holder */}
              <div style={{ height: SWIMLANE_HEIGHT }} />
            </div>
          )
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            maxWidth: 220,
            color: 'var(--color-text-primary)',
          }}
        >
          <div className="font-semibold mb-1">{tooltip.avatar} {tooltip.agent}</div>
          <div className="mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>{tooltip.task.title}</div>
          <div style={{ color: 'var(--color-text-muted)' }}>
            {relativeTime(tooltip.task.timestamp)}
            {tooltip.task.duration && ` · ${formatDuration(tooltip.task.duration)}`}
          </div>
          <span className={`tag ${tooltip.task.status} mt-1 inline-flex`}>{tooltip.task.status}</span>
        </div>
      )}
    </div>
  )
}

// ── List view (existing) ──────────────────────────────────────────────────────

function ListView({ filtered, agentsById }) {
  return (
    <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No tasks match your filters.
        </div>
      ) : (
        <ol className="relative" style={{ paddingLeft: '1.5rem' }}>
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
                <div
                  className="absolute flex-shrink-0 flex items-center justify-center"
                  style={{
                    left: '-1.5rem', top: '2px',
                    width: 14, height: 14,
                    borderRadius: '50%',
                    background: dotColor,
                    boxShadow: task.status === 'running' ? `0 0 8px ${dotColor}` : 'none',
                    zIndex: 1,
                  }}
                >
                  {task.status === 'running' && (
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#fff', opacity: 0.9,
                      animation: 'pulse-dot 1.5s ease-in-out infinite',
                    }} />
                  )}
                </div>

                <div
                  className="flex-1 rounded-xl px-4 py-3"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
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
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Timeline({ tasks = [], agents = [] }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [agentFilter, setAgentFilter]   = useState('all')
  const [dateRange, setDateRange]       = useState(DATE_RANGES[3])
  const [viewMode, setViewMode]         = useState('list') // 'list' | 'swimlane'

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
        <h2 className="section-title">Task Timeline</h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium"
              style={{
                background: viewMode === 'list' ? 'var(--color-accent)' : 'var(--color-surface-2)',
                color: viewMode === 'list' ? '#fff' : 'var(--color-text-secondary)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <List size={12} /> List
            </button>
            <button
              onClick={() => setViewMode('swimlane')}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium"
              style={{
                background: viewMode === 'swimlane' ? 'var(--color-accent)' : 'var(--color-surface-2)',
                color: viewMode === 'swimlane' ? '#fff' : 'var(--color-text-secondary)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <BarChart3 size={12} /> Swimlane
            </button>
          </div>

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

      <div className="card p-5">
        {viewMode === 'swimlane' ? (
          <SwimlaneView
            tasks={filtered}
            agents={agents}
            dateRangeMs={dateRange.ms}
          />
        ) : (
          <ListView filtered={filtered} agentsById={agentsById} />
        )}
      </div>
    </section>
  )
}
