/**
 * The Hive — Live Data API Service Layer
 *
 * Fetches real data from the OpenClaw local API server.
 * Falls back to mock data when unavailable (Vercel production, offline, etc.)
 *
 * ## Architecture
 *
 * LOCAL DEV:
 *   Browser → Vite proxy (/openclaw/*) → http://127.0.0.1:18789
 *   The Vite dev server proxies requests to avoid CORS issues.
 *
 * PRODUCTION (Vercel):
 *   The Hive is deployed on Vercel and CANNOT reach localhost.
 *   Options for live data in production:
 *     A) Tailscale Funnel relay — expose Gateway via https://mac-1.tail24e41a.ts.net
 *        and set VITE_OPENCLAW_API_URL to that URL with a valid token.
 *     B) Edge function relay — a thin Vercel edge function that proxies
 *        to the Tailscale URL (keeps token server-side).
 *     C) Self-hosted relay — small VPS or Cloudflare Worker that relays
 *        to the home machine via Tailscale or other tunnel.
 *
 * CONFIG:
 *   VITE_OPENCLAW_API_URL  — Base URL for OpenClaw REST API
 *                            Default: /openclaw (proxied to localhost in dev)
 *   VITE_OPENCLAW_TOKEN    — Bearer token for auth
 *                            Default: read from openclaw.json at build time
 *
 * Note: The Gateway auth token should NOT be hard-coded in production builds.
 * Use an environment variable or a server-side relay that adds the token.
 */

import { generateMockDashboardData } from './mock'

// Config — set VITE_OPENCLAW_API_URL to point to a relay for production
const API_BASE = import.meta.env.VITE_OPENCLAW_API_URL ?? '/openclaw'
const API_TOKEN = import.meta.env.VITE_OPENCLAW_TOKEN ?? ''

// Read cron jobs from local file system (dev only via proxy)
const CRON_FILE = '/openclaw-local/cron/jobs.json'

let _liveAvailable = null // null = untested, true/false = result

/**
 * Check if the local OpenClaw API is reachable.
 * Caches result for the session to avoid hammering 127.0.0.1.
 */
export async function checkLiveAvailable() {
  if (_liveAvailable !== null) return _liveAvailable
  try {
    const headers = API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}
    const resp = await fetch(`${API_BASE}/ping`, {
      headers,
      signal: AbortSignal.timeout(2000),
    })
    _liveAvailable = resp.ok || resp.status === 404 // 404 means server is up, endpoint just missing
  } catch {
    _liveAvailable = false
  }
  return _liveAvailable
}

/**
 * Reset availability cache (e.g., after network change).
 */
export function resetLiveAvailability() {
  _liveAvailable = null
}

/**
 * Map OpenClaw session/agent data to AgentCard shape.
 * OpenClaw sessions have: id, agentId, model, status, createdAt, etc.
 */
function mapSessionToAgent(session) {
  const agentMap = {
    main: { name: 'Bob', role: 'Orchestrator', avatar: '😎', id: 'bob' },
    scout: { name: 'Scout', role: 'Researcher', avatar: '🔭', id: 'scout' },
    forge: { name: 'Forge', role: 'Builder', avatar: '⚒️', id: 'forge' },
  }
  const agentId = session.agentId ?? 'main'
  const base = agentMap[agentId] ?? { name: agentId, role: 'Agent', avatar: '🤖', id: agentId }

  const isActive = ['running', 'active', 'busy'].includes(session.status)
  const isIdle = ['idle', 'waiting'].includes(session.status)

  return {
    id: base.id,
    name: base.name,
    role: base.role,
    avatar: base.avatar,
    status: isActive ? 'busy' : isIdle ? 'idle' : 'online',
    tasksCompleted: session.completedTasks ?? 0,
    tasksRunning: session.activeTasks ?? (isActive ? 1 : 0),
    currentTask: session.currentTask ?? (isActive ? 'Processing task…' : ''),
    uptime: session.uptimeSecs ?? 0,
    load: isActive ? 65 : isIdle ? 5 : 20,
  }
}

/**
 * Map OpenClaw cron job to task shape.
 */
function mapCronJobToTask(job, index) {
  const state = job.state ?? {}
  const lastRan = state.lastRunAtMs ? new Date(state.lastRunAtMs) : null
  const statusMap = {
    ok: 'success',
    error: 'failed',
    running: 'running',
    pending: 'pending',
  }

  return {
    id: `cron-${job.id?.slice(0, 8) ?? index}`,
    title: job.name ?? `Cron job ${index + 1}`,
    agentId: job.agentId ?? 'bob',
    status: statusMap[state.lastRunStatus ?? state.lastStatus ?? 'ok'] ?? 'success',
    timestamp: lastRan ? lastRan.getTime() : Date.now(),
    duration: state.lastDurationMs ?? undefined,
    detail: state.lastStatus
      ? `Schedule: ${job.schedule?.expr ?? '?'} · Last: ${state.lastRunStatus ?? 'ok'}`
      : `Schedule: ${job.schedule?.expr ?? '?'}`,
  }
}

/**
 * Fetch live agent/session data from OpenClaw.
 * Returns null if unavailable.
 */
async function fetchLiveSessions() {
  try {
    const headers = API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}
    const resp = await fetch(`${API_BASE}/sessions`, {
      headers,
      signal: AbortSignal.timeout(3000),
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

/**
 * Fetch live cron job data.
 * Returns null if unavailable.
 */
async function fetchLiveCronJobs() {
  try {
    const headers = API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}
    const resp = await fetch(`${API_BASE}/cron`, {
      headers,
      signal: AbortSignal.timeout(3000),
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

/**
 * Build the real bot agents (static — these don't change dynamically).
 * These match the actual OpenClaw bot roles.
 */
function getRealBotAgents() {
  return [
    {
      id: 'bob',
      name: 'Bob',
      role: 'Orchestrator',
      status: 'online',
      avatar: '😎',
      tasksCompleted: 0,
      tasksRunning: 0,
      currentTask: 'Main agent — orchestrates Scout & Forge',
      uptime: 0,
      load: 15,
    },
    {
      id: 'scout',
      name: 'Scout',
      role: 'Researcher',
      status: 'idle',
      avatar: '🔭',
      tasksCompleted: 0,
      tasksRunning: 0,
      currentTask: '',
      uptime: 0,
      load: 0,
    },
    {
      id: 'forge',
      name: 'Forge',
      role: 'Builder',
      status: 'idle',
      avatar: '⚒️',
      tasksCompleted: 0,
      tasksRunning: 0,
      currentTask: '',
      uptime: 0,
      load: 0,
    },
  ]
}

/**
 * Main live data fetcher.
 *
 * Attempts to load real data from OpenClaw API.
 * Falls back gracefully to mock data if unavailable.
 *
 * @returns {Promise<{data: object, isLive: boolean}>}
 */
export async function fetchDashboardData() {
  const mock = generateMockDashboardData()

  // Use real bot agents as the base (not mock ones)
  const realAgents = getRealBotAgents()

  // Try fetching live cron data (used as task feed)
  let liveTasks = null
  try {
    const cronData = await fetchLiveCronJobs()
    if (cronData?.jobs?.length) {
      liveTasks = cronData.jobs
        .sort((a, b) => (b.state?.lastRunAtMs ?? 0) - (a.state?.lastRunAtMs ?? 0))
        .slice(0, 10)
        .map(mapCronJobToTask)
    }
  } catch {
    // fallback
  }

  // Build live metrics from real data if available
  const tasks = liveTasks ?? mock.tasks
  const successCount = tasks.filter((t) => t.status === 'success').length
  const liveMetrics = liveTasks
    ? {
        tasksCompletedToday: successCount,
        activeSessions: realAgents.filter((a) => a.status !== 'idle').length,
        uptimeFormatted: 'Online',
        successRate: tasks.length ? Math.round((successCount / tasks.length) * 100) : 0,
        avgTaskMs: tasks.reduce((sum, t) => sum + (t.duration ?? 0), 0) / Math.max(tasks.filter((t) => t.duration).length, 1),
        totalAgents: realAgents.length,
      }
    : mock.metrics

  return {
    agents: realAgents,
    tasks,
    trends: mock.trends, // trends are derived; keep mock for now
    alerts: mock.alerts,  // alerts would need a separate endpoint
    metrics: liveMetrics,
    _isLive: liveTasks !== null,
  }
}

/**
 * Drop-in replacement for fetchMockDashboardData in usePolling.
 * Tries live data first, falls back to mock on any error.
 */
export async function fetchDashboardDataSafe() {
  try {
    return await fetchDashboardData()
  } catch {
    return {
      ...generateMockDashboardData(),
      _isLive: false,
    }
  }
}

/**
 * Production deployment guide:
 *
 * To enable live data on Vercel:
 *
 * Option A — Tailscale Funnel (simplest):
 *   1. Ensure Tailscale Funnel is running:
 *      tailscale --socket=/Users/anispecialops/.tailscale/tailscaled.sock funnel 18789
 *   2. Set Vercel env vars:
 *      VITE_OPENCLAW_API_URL=https://mac-1.tail24e41a.ts.net
 *      VITE_OPENCLAW_TOKEN=<gateway auth token>
 *   3. Rebuild + redeploy on Vercel.
 *
 * Option B — Vercel Edge Function relay (token stays server-side):
 *   1. Create /api/openclaw/[...path].js in project root
 *   2. Edge function reads OPENCLAW_TOKEN (non-VITE, server-only)
 *   3. Proxies to Tailscale URL with auth header
 *   4. Client calls /api/openclaw/* (no token exposure)
 *
 * For local dev, configure Vite proxy in vite.config.js:
 *   server: {
 *     proxy: {
 *       '/openclaw': {
 *         target: 'http://127.0.0.1:18789',
 *         rewrite: (path) => path.replace(/^\/openclaw/, ''),
 *         headers: { 'Authorization': 'Bearer <token>' },
 *       }
 *     }
 *   }
 */
