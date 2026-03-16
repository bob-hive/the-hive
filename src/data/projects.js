import projectsSeed from './projects.json'

const STATUS_ORDER = {
  red: 0,
  amber: 1,
  green: 2,
}

export function getProjectsData() {
  // TODO(hive-p1.2): replace JSON import with /api/projects once backend endpoint is ready.
  // TODO(hive-p1.2): add auto-sync job to regenerate this data from workspace PROJECTS.md.
  return projectsSeed
}

export function listProjects() {
  const data = getProjectsData()
  return [...(data.projects || [])].sort((a, b) => {
    const statusDelta = (STATUS_ORDER[a.ragStatus] ?? 99) - (STATUS_ORDER[b.ragStatus] ?? 99)
    if (statusDelta !== 0) return statusDelta
    return a.name.localeCompare(b.name)
  })
}

export function getProjectById(projectId) {
  if (!projectId) return null
  return listProjects().find((project) => project.id === projectId) || null
}
