/**
 * The Hive — API client
 *
 * All data requests go through /api/* routes (serverless functions).
 * In MOCK_MODE or when the API is unreachable, falls back to mock data.
 *
 * Set VITE_MOCK_MODE=true in .env to force mock mode.
 * Set VITE_HIVE_API_KEY=<key> to send the X-Hive-Key header.
 * Set VITE_API_BASE_URL if the API lives elsewhere (e.g. proxy in dev).
 */

import { generateMockDashboardData } from './mock.js'

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true'
const API_KEY = import.meta.env.VITE_HIVE_API_KEY || ''
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

/** Default headers for all API requests */
function apiHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (API_KEY) headers['X-Hive-Key'] = API_KEY
  return headers
}

/** Fetch a JSON API route, throwing on non-2xx */
async function apiFetch(path) {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, { headers: apiHeaders() })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }
  return res.json()
}

/**
 * Fetch all dashboard data in one go.
 * Returns the same shape as `generateMockDashboardData()`.
 */
export async function fetchDashboardData() {
  if (MOCK_MODE) {
    // Slight delay to simulate network round-trip in dev
    await new Promise((r) => setTimeout(r, 120))
    return generateMockDashboardData()
  }

  // Fan out all API calls in parallel
  const [agentsRes, activityRes, sessionsRes, statsRes, healthRes] = await Promise.allSettled([
    apiFetch('/api/agents/status'),
    apiFetch('/api/agents/activity'),
    apiFetch('/api/sessions'),
    apiFetch('/api/stats'),
    apiFetch('/api/health'),
  ])

  // If all calls failed, fall back to mock entirely
  const allFailed = [agentsRes, activityRes, sessionsRes, statsRes, healthRes].every(
    (r) => r.status === 'rejected'
  )
  if (allFailed) {
    console.warn('[hive] all API calls failed, falling back to mock data')
    return { ...generateMockDashboardData(), _offline: true }
  }

  const agents = agentsRes.status === 'fulfilled' ? (agentsRes.value.agents ?? []) : []
  const events = activityRes.status === 'fulfilled' ? (activityRes.value.events ?? []) : []
  const sessions = sessionsRes.status === 'fulfilled' ? (sessionsRes.value.sessions ?? []) : []
  const stats = statsRes.status === 'fulfilled' ? statsRes.value : {}
  const health = healthRes.status === 'fulfilled' ? healthRes.value : {}

  // Determine if at least some API calls succeeded
  const isMock = agentsRes.value?.mock || statsRes.value?.mock

  // Build metrics from stats API response
  const metrics = {
    tasksCompletedToday: stats.tasksCompletedToday ?? 0,
    activeSessions: stats.activeSessions ?? agents.filter((a) => a.status !== 'idle').length,
    totalAgents: stats.totalAgents ?? agents.length,
    uptimeFormatted: stats.uptimeFormatted ?? '—',
    successRate: stats.successRate ?? 0,
    avgTaskMs: stats.avgTaskMs ?? null,
    _health: health,
    _isMock: isMock,
  }

  // Build trends (no direct API for this yet — use placeholder data)
  const mockData = generateMockDashboardData()

  return {
    agents: agents.length > 0 ? agents : mockData.agents,
    events: events.length > 0 ? events : mockData.events,
    tasks: mockData.tasks,       // TODO: tasks API endpoint
    trends: mockData.trends,     // TODO: trends API endpoint
    alerts: mockData.alerts,     // TODO: alerts API endpoint
    sessions,
    metrics,
    _offline: false,
    _isMock: isMock,
  }
}

/** Alias for backward compatibility with usePolling(fetchDashboardData) */
export { fetchDashboardData as default }
