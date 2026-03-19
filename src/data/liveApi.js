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
 */

import { generateMockDashboardData } from './mock'

// Config — set VITE_OPENCLAW_API_URL to point to a relay for production
const API_BASE = import.meta.env.VITE_OPENCLAW_API_URL ?? '/openclaw'

/**
 * Check if the local OpenClaw API is reachable.
 */
export async function checkLiveAvailable() {
  try {
    const resp = await fetch(`${API_BASE}/rpc`, {
      method: 'POST',
      body: JSON.stringify({ method: 'health' }),
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000),
    })
    return resp.ok
  } catch {
    return false
  }
}

/**
 * Map OpenClaw session/agent data to AgentCard shape.
 */
function mapSessionToAgent(session) {
  const agentMap = {
    main: { name: 'Bob', role: 'Orchestrator', avatar: '😎', id: 'bob' },
    scout: { name: 'Scout', role: 'Researcher', avatar: '🔭', id: 'scout' },
    forge: { name: 'Forge', role: 'Builder', avatar: '⚒️', id: 'forge' },
  }
  
  // session.agentId might be missing for main turns, or it might be 'main'
  const agentId = session.agentId ?? 'main'
  const base = agentMap[agentId] ?? { name: agentId, role: 'Agent', avatar: '🤖', id: agentId }

  const status = session.status ?? 'online'
  const isActive = ['running', 'active', 'busy'].includes(status)
  const isIdle = ['idle', 'waiting'].includes(status)

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
    lastActiveMs: session.updatedAt ?? Date.now(),
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
      ? `Schedule: ${job.schedule?.expr ?? job.schedule?.everyMs ? 'every ' + (job.schedule.everyMs/1000) + 's' : '?'} · Last: ${state.lastRunStatus ?? 'ok'}`
      : `Schedule: ${job.schedule?.expr ?? job.schedule?.everyMs ? 'every ' + (job.schedule.everyMs/1000) + 's' : '?'}`,
  }
}

/**
 * Fetch data via RPC.
 */
async function rpcCall(method, params = {}) {
  const resp = await fetch(`${API_BASE}/rpc`, {
    method: 'POST',
    body: JSON.stringify({ method, params }),
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(3000),
  })
  if (!resp.ok) throw new Error(`RPC failed: ${resp.status}`)
  return await resp.json()
}

/**
 * Main live data fetcher.
 */
export async function fetchDashboardData() {
  try {
    const [sessionsData, cronData] = await Promise.all([
      rpcCall('sessions_list', { allAgents: true, active: 60 }),
      rpcCall('cron_list'),
    ])

    const mock = generateMockDashboardData()

    // 1. Map Agents
    // We start with our roster and update with session data
    const roster = [
      { id: 'bob', name: 'Bob', role: 'Orchestrator', avatar: '😎', status: 'online' },
      { id: 'scout', name: 'Scout', role: 'Researcher', avatar: '🔭', status: 'idle' },
      { id: 'forge', name: 'Forge', role: 'Builder', avatar: '⚒️', status: 'idle' },
    ]

    const agents = roster.map(base => {
      const session = sessionsData.sessions?.find(s => (s.agentId ?? 'main') === (base.id === 'bob' ? 'main' : base.id))
      if (!session) return { ...base, tasksCompleted: 0, tasksRunning: 0, uptime: 0, load: 5 }
      return mapSessionToAgent(session)
    })

    // 2. Map Tasks (using cron runs as proxy for real-time task feed)
    const tasks = (cronData.jobs ?? [])
      .filter(j => j.state?.lastRunAtMs)
      .sort((a, b) => (b.state?.lastRunAtMs ?? 0) - (a.state?.lastRunAtMs ?? 0))
      .slice(0, 15)
      .map(mapCronJobToTask)

    if (tasks.length === 0) tasks.push(...mock.tasks)

    // 3. Build Metrics
    const liveMetrics = {
      tasksCompletedToday: tasks.filter(t => t.status === 'success').length,
      activeSessions: agents.filter(a => a.status === 'busy').length,
      uptimeFormatted: 'Online',
      successRate: tasks.length ? Math.round((tasks.filter(t => t.status === 'success').length / tasks.length) * 100) : 100,
      avgTaskMs: tasks.filter(t => t.duration).length 
        ? Math.round(tasks.reduce((sum, t) => sum + (t.duration ?? 0), 0) / tasks.filter(t => t.duration).length)
        : 0,
      totalAgents: agents.length,
    }

    return {
      agents,
      tasks,
      trends: mock.trends,
      alerts: mock.alerts,
      metrics: liveMetrics,
      jobs: cronData.jobs ?? [],
      _isLive: true,
    }
  } catch (err) {
    console.error('Live data fetch failed:', err)
    return {
      ...generateMockDashboardData(),
      _isLive: false,
    }
  }
}

export async function fetchDashboardDataSafe() {
  return await fetchDashboardData()
}
