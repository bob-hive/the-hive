/**
 * GET /api/agents/activity
 * Returns recent activity feed (events, messages, task completions).
 *
 * Derived from sessions.list — each session entry represents activity.
 */

import { tryGatewayRpc, getGatewayConfig } from '../_lib/gateway.js'
import { getMockActivity } from '../_lib/mock.js'
import { checkHiveApiKey, jsonResponse, unauthorizedResponse, corsHeaders } from '../_lib/auth.js'

/** Parse agentId from a session key like "agent:main:telegram:direct:..." */
function agentIdFromKey(key) {
  if (!key) return 'unknown'
  const parts = key.split(':')
  if (parts[0] === 'agent' && parts[1]) return parts[1]
  return parts[0] || 'unknown'
}

/** Derive event type from session key/channel */
function eventTypeFromSession(session) {
  const key = session.key || ''
  const channel = session.channel || ''

  if (key.includes(':subagent:')) return 'spawned'
  if (key.includes(':cron:')) return 'completed'
  if (channel === 'telegram' || channel === 'discord') return 'active'
  return 'active'
}

/** Build a human-readable message for a session */
function messageFromSession(session) {
  const key = session.key || ''
  const channel = session.channel || ''
  const label = session.label || ''

  if (key.includes(':subagent:')) {
    return `Subagent spawned${label ? `: ${label}` : ''}`
  }
  if (key.includes(':cron:')) {
    return `Cron task${label ? `: ${label}` : ' completed'}`
  }
  if (channel === 'telegram') return `Active on Telegram${label ? ` — ${label}` : ''}`
  if (channel === 'discord') return `Active on Discord${label ? ` — ${label}` : ''}`
  if (label) return label
  return `Session active: ${key.split(':').slice(-2).join(':')}`
}

/** Name from agent ID (title-case) */
function nameFromId(agentId) {
  if (!agentId) return 'Agent'
  return agentId.charAt(0).toUpperCase() + agentId.slice(1)
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!checkHiveApiKey(req)) return unauthorizedResponse(res)

  const isMock = !getGatewayConfig()

  if (isMock) {
    return jsonResponse(res, 200, { events: getMockActivity(), mock: true, ts: Date.now() })
  }

  try {
    const result = await tryGatewayRpc('sessions.list', { limit: 50, activeMinutes: 24 * 60 })
    const sessions = result?.sessions ?? (Array.isArray(result) ? result : [])

    // Convert sessions to activity events
    const events = sessions
      .filter((s) => s.key && s.lastActiveMs)
      .sort((a, b) => (b.lastActiveMs || 0) - (a.lastActiveMs || 0))
      .slice(0, 30)
      .map((session, i) => {
        const agentId = agentIdFromKey(session.key)
        return {
          id: `ev-${session.key?.replace(/[^a-z0-9]/gi, '-')}-${i}`,
          type: eventTypeFromSession(session),
          agentId,
          agentName: nameFromId(agentId),
          timestamp: session.lastActiveMs || Date.now(),
          message: messageFromSession(session),
        }
      })

    return jsonResponse(res, 200, { events, mock: false, ts: Date.now() })
  } catch (err) {
    console.error('[api/agents/activity] error:', err.message)
    return jsonResponse(res, 200, {
      events: getMockActivity(),
      mock: true,
      error: err.message,
      ts: Date.now(),
    })
  }
}
