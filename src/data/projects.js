import projectsSeed from './projects.json'

const STATUS_ORDER = {
  red: 0,
  amber: 1,
  green: 2,
}

let _cachedProjectsData = null
let _cacheTs = 0
const CACHE_TTL_MS = 60_000 // refresh at most once per minute

/**
 * Fetch live project data from /api/projects.
 * Falls back to static seed if fetch fails.
 */
async function fetchProjectsData() {
  const now = Date.now()
  if (_cachedProjectsData && (now - _cacheTs) < CACHE_TTL_MS) {
    return _cachedProjectsData
  }

  try {
    const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
    const API_KEY = import.meta.env.VITE_HIVE_API_KEY || ''
    const headers = { 'Content-Type': 'application/json' }
    if (API_KEY) headers['X-Hive-Key'] = API_KEY

    const res = await fetch(`${API_BASE}/api/projects`, {
      headers,
      credentials: 'include',
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    _cachedProjectsData = data
    _cacheTs = now
    return data
  } catch (err) {
    console.warn('[projects] /api/projects fetch failed, using seed:', err.message)
    return projectsSeed
  }
}

/**
 * Synchronous access — returns cached data or seed.
 * Used by components that need sync access; live fetch runs in background.
 */
export function getProjectsData() {
  // Return cached live data if available, otherwise seed
  return _cachedProjectsData ?? projectsSeed
}

export function listProjects(data) {
  const source = data ?? getProjectsData()
  return [...(source.projects || [])].sort((a, b) => {
    const statusDelta = (STATUS_ORDER[a.ragStatus] ?? 99) - (STATUS_ORDER[b.ragStatus] ?? 99)
    if (statusDelta !== 0) return statusDelta
    return a.name.localeCompare(b.name)
  })
}

export function getProjectById(projectId, data) {
  if (!projectId) return null
  return listProjects(data).find((project) => project.id === projectId) || null
}

/**
 * Hook-friendly async loader. Components can call this and update state when resolved.
 */
export { fetchProjectsData }
