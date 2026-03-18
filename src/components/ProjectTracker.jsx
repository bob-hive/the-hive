import { useState } from 'react'
import { CheckCircle2, Circle, ChevronDown, ExternalLink } from 'lucide-react'
import { PROJECTS, STATUS_CONFIG } from '../data/projects'
import { useTheme } from '../context/ThemeContext'

function ProgressBar({ completed, total, isNeon }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Progress
        </span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
          {completed}/{total} · {pct}%
        </span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ProjectCard({ project, isNeon }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG['planning']
  const colors = isNeon ? cfg.neon : cfg.light

  return (
    <div
      className="card overflow-hidden"
      style={{ borderLeft: `3px solid ${colors.border}` }}
    >
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-start justify-between gap-3 p-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-xl flex-shrink-0 mt-0.5">{project.emoji}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-xs font-mono"
                style={{ color: 'var(--color-text-muted)' }}
              >
                P{project.id}
              </span>
              <h3
                className="font-semibold text-sm leading-tight truncate"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {project.name}
              </h3>
            </div>
            <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--color-text-secondary)' }}>
              {project.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Status badge */}
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              color: colors.color,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
            }}
          >
            {cfg.label}
          </span>
          <ChevronDown
            size={14}
            style={{
              color: 'var(--color-text-muted)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              flexShrink: 0,
            }}
          />
        </div>
      </button>

      {/* Progress bar (always visible) */}
      <div className="px-4 pb-3">
        <ProgressBar
          completed={project.completedItems}
          total={project.totalItems}
          isNeon={isNeon}
        />
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {/* Phase + Owner */}
          <div className="flex flex-wrap gap-4 pt-3">
            {project.phase && (
              <div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Phase: </span>
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  {project.phase}
                </span>
              </div>
            )}
            <div>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Owner: </span>
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {project.owner}
              </span>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-muted)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Milestones */}
          <div className="space-y-1.5">
            {project.milestones.map((m, i) => (
              <div key={i} className="flex items-start gap-2">
                {m.done ? (
                  <CheckCircle2
                    size={13}
                    className="flex-shrink-0 mt-0.5"
                    style={{ color: colors.color }}
                  />
                ) : (
                  <Circle
                    size={13}
                    className="flex-shrink-0 mt-0.5"
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                )}
                <span
                  className="text-xs leading-relaxed"
                  style={{
                    color: m.done ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                    textDecoration: m.done ? 'none' : 'none',
                  }}
                >
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProjectTracker() {
  const [open, setOpen] = useState(true)
  const { theme } = useTheme()
  const isNeon = theme === 'neon'

  const total = PROJECTS.length
  const inProgress = PROJECTS.filter((p) => p.status === 'in-progress').length
  const complete = PROJECTS.filter((p) => p.status === 'complete').length

  return (
    <section>
      <button
        type="button"
        className="w-full flex items-center justify-between mb-3"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <h2
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Project Tracker
          </h2>
          <span
            className="text-xs tabular-nums"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {inProgress} active · {complete}/{total} complete
          </span>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {open && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {PROJECTS.map((project) => (
            <ProjectCard key={project.id} project={project} isNeon={isNeon} />
          ))}
        </div>
      )}
    </section>
  )
}
