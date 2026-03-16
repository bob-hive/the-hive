/**
 * GET /api/agents/status
 * Returns current agent statuses: active/idle/error, last seen, current task.
 *
 * Data sources:
 *   - `agents.list` — configured agents
 *   - `sessions.list` — to determine which agents are actively running
 */

import { tryGatewayRpc, getGatewayConfig } from '../_lib/gateway.js'
import { getMockAgentsStatus } from '../_lib/mock.js'
import { checkHiveApiKey, jsonResponse, unauthorizedResponse, corsHeaders, requireUserSession } from '../_lib/auth.js'

/** Map session channel/kind to a human-readable context string */
function describeSession(session) {
  const channel = session.channel || session.delivery?.channel
  if (!channel) return null
  if (channel === 'telegram') return `Telegram chat${session.label ? ` — ${session.label}` : ''}`
  if (channel === 'discord') return `Discord${session.label ? ` — ${session.label}` : ''}`
  if (channel === 'cron') return `Cron: ${session.label || session.key || 'scheduled task'}`
  return session.label || channel
}

/** Derive a simple status string from session/agent data */
function deriveStatus(agentId, sessions) {
  const agentSessions = sessions.filter((s) => {
    const sKey = s.key || ''
    return sKey.includes(`agent:${agentId}:`) || s.agentId === agentId
  })

  const now = Date.now()
  const recentThresholdMs = 5 * 60_000 // 5 min

  // Look for subagent sessions (these indicate active work)
  const hasSubagent = agentSessions.some((s) => (s.key || '').includes(':subagent:'))
  const hasRecentActivity = agentSessions.some(
    (s) => s.lastActiveMs && now - s.lastActiveMs < recentThresholdMs
  )
  const hasCronSession = agentSessions.some((s) => (s.key || '').includes(':cron:'))

  if (hasSubagent && hasRecentActivity) return 'busy'
  if (hasRecentActivity) return 'online'
  if (hasCronSession) return 'online'
  if (agentSessions.length === 0) return 'idle'
  return 'idle'
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!requireUserSession(req, res)) return

  if (!checkHiveApiKey(req)) return unauthorizedResponse(res)

  const isMock = !getGatewayConfig()

  if (isMock) {
    return jsonResponse(res, 200, { agents: getMockAgentsStatus(), mock: true, ts: Date.now() })
  }

  try {
    const [agentsResult, sessionsResult] = await Promise.allSettled([
      tryGatewayRpc('agents.list'),
      tryGatewayRpc('sessions.list', { limit: 100, activeMinutes: 60 }),
    ])

    const agentList = agentsResult.status === 'fulfilled' ? (agentsResult.value?.agents ?? []) : []
    const sessionList = sessionsResult.status === 'fulfilled' ? (sessionsResult.value?.sessions ?? sessionsResult.value ?? []) : []

    // Build agent status objects from the data
    const agents = agentList.map((agent, i) => {
      const agentId = agent.id || agent.agentId || `agent-${i}`
      const status = deriveStatus(agentId, sessionList)

      // Find the most recent session context for this agent
      const agentSessions = sessionList
        .filter((s) => (s.key || '').includes(`agent:${agentId}:`) || s.agentId === agentId)
        .sort((a, b) => (b.lastActiveMs || 0) - (a.lastActiveMs || 0))

      const mostRecent = agentSessions[0]
      const currentTask = mostRecent ? describeSession(mostRecent) : null
      const lastActiveMs = mostRecent?.lastActiveMs || agent.lastActiveMs || null

      return {
        id: agentId,
        name: agent.name || agent.displayName || agentId,
        role: agent.role || 'Agent',
        avatar: agent.avatar || agent.emoji || '🤖',
        status,
        tasksCompleted: agent.tasksCompleted || 0,
        tasksRunning: agentSessions.filter((s) => {
          const now = Date.now()
          return s.lastActiveMs && now - s.lastActiveMs < 2 * 60_000
        }).length,
        currentTask: currentTask || '',
        uptime: agent.uptime || 0,
        load: status === 'busy' ? 75 : status === 'online' ? 30 : 5,
        lastActiveMs,
        sparkline: [30, 30, 30, 30, 30, 30, 30, status === 'busy' ? 75 : 30],
      }
    })

    return jsonResponse(res, 200, { agents, mock: false, ts: Date.now() })
  } catch (err) {
    console.error('[api/agents/status] error:', err.message)
    // Graceful fallback to mock on error
    return jsonResponse(res, 200, {
      agents: getMockAgentsStatus(),
      mock: true,
      error: err.message,
      ts: Date.now(),
    })
  }
}
