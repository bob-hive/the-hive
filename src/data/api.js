/**
 * The Hive — API client
 *
 * All data requests go through /api/* routes (serverless functions).
 * In MOCK_MODE or when the API is unreachable, falls back to mock data.
 */

import { generateMockDashboardData } from './mock.js'

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true'
const API_KEY = import.meta.env.VITE_HIVE_API_KEY || ''
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function apiHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (API_KEY) headers['X-Hive-Key'] = API_KEY
  return headers
}

async function parseErrorBody(res) {
  const text = await res.text().catch(() => '')
  if (!text) return { message: res.statusText || 'Request failed', code: 'API_ERROR' }

  try {
    const parsed = JSON.parse(text)
    return {
      message: parsed.error || parsed.message || text,
      code: parsed.code || 'API_ERROR',
    }
  } catch {
    return { message: text, code: 'API_ERROR' }
  }
}

async function apiFetch(path) {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    headers: apiHeaders(),
    credentials: 'include',
  })

  if (!res.ok) {
    const err = await parseErrorBody(res)
    throw new ApiError(err.message, {
      status: res.status,
      code: err.code,
    })
  }

  return res.json()
}

export async function fetchAuthState() {
  const data = await apiFetch('/api/auth/me')
  return data
}

function isAuthError(reason) {
  return reason instanceof ApiError && (reason.status === 401 || reason.status === 403)
}

export async function fetchDashboardData() {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 120))
    return generateMockDashboardData()
  }

  const results = await Promise.allSettled([
    apiFetch('/api/alerts'),
    apiFetch('/api/agents/status'),
    apiFetch('/api/agents/activity'),
    apiFetch('/api/sessions'),
    apiFetch('/api/stats'),
    apiFetch('/api/health'),
  ])

  const allRejected = results.every((r) => r.status === 'rejected')

  if (allRejected) {
    const authFailure = results.find((r) => r.status === 'rejected' && isAuthError(r.reason))
    if (authFailure) throw authFailure.reason

    console.warn('[hive] all API calls failed, falling back to mock data')
    return { ...generateMockDashboardData(), _offline: true }
  }

  const [alertsRes, agentsRes, activityRes, sessionsRes, statsRes, healthRes] = results

  const alerts = alertsRes.status === 'fulfilled' ? (alertsRes.value.alerts ?? []) : []
  const agents = agentsRes.status === 'fulfilled' ? (agentsRes.value.agents ?? []) : []
  const events = activityRes.status === 'fulfilled' ? (activityRes.value.events ?? []) : []
  const sessions = sessionsRes.status === 'fulfilled' ? (sessionsRes.value.sessions ?? []) : []
  const stats = statsRes.status === 'fulfilled' ? statsRes.value : {}
  const health = healthRes.status === 'fulfilled' ? healthRes.value : {}

  const isMock = Boolean(alertsRes.value?.mock || agentsRes.value?.mock || statsRes.value?.mock)
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

  const mockData = generateMockDashboardData()

  return {
    agents: agents.length > 0 ? agents : mockData.agents,
    events: events.length > 0 ? events : mockData.events,
    tasks: mockData.tasks,
    trends: mockData.trends,
    alerts: alerts.length > 0 ? alerts : mockData.alerts,
    sessions,
    metrics,
    alertsMeta: {
      source: alertsRes.value?.source || (alerts.length > 0 ? 'LIVE' : 'MOCK'),
      isMock: Boolean(alertsRes.value?.mock || alerts.length === 0),
      latestTs: alertsRes.value?.latestTs || 0,
      ts: alertsRes.value?.ts || Date.now(),
      updatedAt: alertsRes.value?.updatedAt || null,
    },
    _offline: false,
    _isMock: isMock,
  }
}

export { fetchDashboardData as default }
