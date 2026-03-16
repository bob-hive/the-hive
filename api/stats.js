/**
 * GET /api/stats
 * Returns aggregate stats: total sessions, events, active agents, etc.
 *
 * Combines data from sessions.list, agents.list, and health.
 */

import { tryGatewayRpc, getGatewayConfig } from './_lib/gateway.js'
import { getMockStats } from './_lib/mock.js'
import { jsonResponse, corsHeaders, requireUserSession } from './_lib/auth.js'

function formatUptime(ms) {
  if (!ms || ms < 0) return '—'
  const seconds = Math.floor(ms / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!requireUserSession(req, res)) return

  const isMock = !getGatewayConfig()

  if (isMock) {
    return jsonResponse(res, 200, { ...getMockStats(), mock: true, ts: Date.now() })
  }

  try {
    const [sessionsResult, agentsResult, healthResult] = await Promise.allSettled([
      tryGatewayRpc('sessions.list', { limit: 200 }),
      tryGatewayRpc('agents.list'),
      tryGatewayRpc('health'),
    ])

    const sessions = sessionsResult.status === 'fulfilled'
      ? (sessionsResult.value?.sessions ?? sessionsResult.value ?? [])
      : []
    const agentList = agentsResult.status === 'fulfilled'
      ? (agentsResult.value?.agents ?? [])
      : []
    const health = healthResult.status === 'fulfilled' ? healthResult.value : null

    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60_000

    const activeSessions = sessions.filter((s) => s.lastActiveMs && now - s.lastActiveMs < 5 * 60_000)
    const todaySessions = sessions.filter((s) => s.lastActiveMs && s.lastActiveMs > oneDayAgo)

    // Agents are "active" if they have a recent session
    const activeAgentIds = new Set(
      activeSessions.map((s) => {
        const key = s.key || ''
        const parts = key.split(':')
        return parts[0] === 'agent' ? parts[1] : null
      }).filter(Boolean)
    )

    const stats = {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      totalAgents: agentList.length || activeAgentIds.size,
      activeAgents: activeAgentIds.size,
      tasksCompletedToday: todaySessions.length,
      eventsLast24h: todaySessions.length,
      successRate: 87, // Would need to inspect session outcomes for real data
      uptimeMs: health?.uptimeMs ?? null,
      uptimeFormatted: formatUptime(health?.uptimeMs ?? null),
      avgTaskMs: null, // Would need task-level data
      ts: now,
      mock: false,
    }

    return jsonResponse(res, 200, stats)
  } catch (err) {
    console.error('[api/stats] error:', err.message)
    return jsonResponse(res, 200, {
      ...getMockStats(),
      mock: true,
      error: err.message,
      ts: Date.now(),
    })
  }
}
