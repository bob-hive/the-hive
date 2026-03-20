import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, CircleAlert, CircleCheck, CircleDashed, Clock3, UserRound } from 'lucide-react'
import { getProjectById, getProjectsData, listProjects } from '../data/projects'

const PROJECT_QUERY_PARAM = 'project'

function getSelectedProjectIdFromUrl() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(PROJECT_QUERY_PARAM) || ''
}

function formatDate(value) {
  if (!value) return 'Unknown'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function ragMeta(status) {
  if (status === 'green') return { label: 'Green', className: 'tag success' }
  if (status === 'amber') return { label: 'Amber', className: 'tag pending' }
  return { label: 'Red', className: 'tag failed' }
}

function StatusIcon({ status }) {
  if (status === 'green') return <CircleCheck size={14} style={{ color: 'var(--color-success)' }} />
  if (status === 'amber') return <CircleAlert size={14} style={{ color: 'var(--color-warning)' }} />
  return <CircleDashed size={14} style={{ color: 'var(--color-error)' }} />
}

function ProjectCard({ project, onOpen }) {
  const rag = ragMeta(project.ragStatus)

  return (
    <article className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--color-text-muted)' }}>
            {project.roadmapRef}
          </p>
          <h3 className="text-base font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
            {project.name}
          </h3>
        </div>
        <span className={rag.className}>{rag.label}</span>
      </div>

      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {project.progressSummary}
      </p>

      <dl className="grid grid-cols-1 gap-2 text-xs">
        <div className="flex items-start gap-2">
          <UserRound size={13} style={{ color: 'var(--color-text-muted)', marginTop: 1 }} />
          <div>
            <dt className="font-semibold" style={{ color: 'var(--color-text-muted)' }}>Owner</dt>
            <dd style={{ color: 'var(--color-text-secondary)' }}>{project.owner}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <CalendarClock size={13} style={{ color: 'var(--color-text-muted)', marginTop: 1 }} />
          <div>
            <dt className="font-semibold" style={{ color: 'var(--color-text-muted)' }}>Next sprint focus</dt>
            <dd style={{ color: 'var(--color-text-secondary)' }}>{project.nextSprintFocus}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <CircleAlert size={13} style={{ color: 'var(--color-warning)', marginTop: 1 }} />
          <div>
            <dt className="font-semibold" style={{ color: 'var(--color-text-muted)' }}>Blockers</dt>
            <dd style={{ color: 'var(--color-text-secondary)' }}>{project.blockers.length}</dd>
          </div>
        </div>
      </dl>

      <button type="button" className="project-link-btn" onClick={() => onOpen(project.id)}>
        View project detail
        <ArrowRight size={13} />
      </button>
    </article>
  )
}

function ProjectDetail({ project, onBack }) {
  const rag = ragMeta(project.ragStatus)

  return (
    <section className="card p-5 mb-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <button type="button" className="project-back-btn" onClick={onBack}>
            ← Back to project board
          </button>
          <h3 className="text-xl font-semibold mt-2" style={{ color: 'var(--color-text-primary)' }}>
            {project.name}
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {project.roadmapRef}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon status={project.ragStatus} />
          <span className={rag.className}>{rag.label} status</span>
        </div>
      </div>

      <div className="project-detail-grid mt-5">
        <div className="project-detail-block">
          <h4>Detailed status</h4>
          <p>{project.detailedStatus}</p>
        </div>

        <div className="project-detail-block">
          <h4>Notes</h4>
          <ul>
            {project.notes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>

        <div className="project-detail-block">
          <h4>Next sprint</h4>
          <ul>
            {project.nextSprint.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>

        <div className="project-detail-block">
          <h4>Blockers</h4>
          <ul>
            {project.blockers.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>

        <div className="project-detail-block">
          <h4>Recommendations</h4>
          <ul>
            {project.recommendations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>

        <div className="project-detail-block">
          <h4>Backlog</h4>
          <ul>
            {project.backlog.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <p className="text-xs mt-4 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
        <Clock3 size={12} />
        Last updated: {formatDate(project.lastUpdated)}
      </p>
    </section>
  )
}

export default function ProjectsHub() {
  const projectsData = useMemo(() => getProjectsData(), [])
  const projects = useMemo(() => listProjects(), [])
  const [selectedProjectId, setSelectedProjectId] = useState(getSelectedProjectIdFromUrl)
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    const onPopState = () => setSelectedProjectId(getSelectedProjectIdFromUrl())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const selectedProject = useMemo(
    () => getProjectById(selectedProjectId),
    [selectedProjectId],
  )

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const isClosed = p.closed === true || p.status === 'closed' || p.status === 'completed';
      return showClosed ? isClosed : !isClosed;
    })
  }, [projects, showClosed])

  const updateUrlProject = (value) => {
    const url = new URL(window.location.href)
    if (value) {
      url.searchParams.set(PROJECT_QUERY_PARAM, value)
    } else {
      url.searchParams.delete(PROJECT_QUERY_PARAM)
    }
    window.history.pushState({}, '', `${url.pathname}${url.search}`)
  }

  const openProject = (projectId) => {
    setSelectedProjectId(projectId)
    updateUrlProject(projectId)
  }

  const closeProject = () => {
    setSelectedProjectId('')
    updateUrlProject('')
  }

  return (
    <section className="animate-fade-in" style={{ animationDelay: '0.25s' }}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="section-title">Projects Hub · Planning</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-[var(--color-surface-2)] rounded-lg p-1 border border-[var(--color-border)]">
            <button
              onClick={() => setShowClosed(false)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!showClosed ? 'bg-[var(--color-accent)] text-white shadow-lg' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
            >
              Active
            </button>
            <button
              onClick={() => setShowClosed(true)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${showClosed ? 'bg-[var(--color-accent)] text-white shadow-lg' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
            >
              Closed
            </button>
          </div>
          <span className="section-chip" style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}>
            {projectsData.planning.label}
          </span>
        </div>
      </div>

      <div className="card p-5 mb-4">
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          Planning label: <strong>{projectsData.planning.label}</strong>
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Source: {projectsData.planning.source}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {projectsData.planning.updateCadence}
        </p>
      </div>

      {selectedProject ? <ProjectDetail project={selectedProject} onBack={closeProject} /> : null}

      {selectedProjectId && !selectedProject ? (
        <div className="card p-4 mb-4 text-sm" style={{ color: 'var(--color-warning)' }}>
          Project not found for id: {selectedProjectId}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProjects.map((project) => (
          <ProjectCard key={project.id} project={project} onOpen={openProject} />
        ))}
      </div>
    </section>
  )
}
