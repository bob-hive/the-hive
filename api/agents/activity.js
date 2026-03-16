/**
 * GET /api/agents/activity
 * Returns recent activity feed (events, messages, task completions).
 *
 * Derived from sessions.list — each session entry represents activity.
 */

import { tryGatewayRpc, getGatewayConfig } from '../_lib/gateway.js'
import { getMockActivity } from '../_lib/mock.js'
import { checkHiveApiKey, jsonResponse, unauthorizedResponse, corsHeaders, requireUserSession } from '../_lib/auth.js'

/** Parse agentId from a session. Prefer explicit field, then parse from key. */
function agentIdFromSession(session) {
  if (session?.agentId) return String(session.agentId)

  const key = session?.key || ''
  if (!key) return 'unknown'

  const parts = key.split(':')
  if (parts[0] === 'agent' && parts[1]) return parts[1]
  return parts[0] || 'unknown'
}

/** Best-effort timestamp extraction from known session fields. */
function sessionTimestamp(session) {
  const candidates = [session?.lastActiveMs, session?.updatedAt, session?.createdAt]

  for (const value of candidates) {
    if (!value) continue
    if (typeof value === 'number' && Number.isFinite(value)) return value

    const parsed = Date.parse(String(value))
    if (!Number.isNaN(parsed)) return parsed
  }

  return null
}

/** Derive event type from session status/key/channel */
function eventTypeFromSession(session) {
  const key = session.key || ''
  const channel = session.channel || ''
  const status = String(session.status || '').toLowerCase()

  if (status.includes('error') || status.includes('fail')) return 'error'
  if (status.includes('complete') || status.includes('success') || status.includes('done')) return 'completed'
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

  if (!requireUserSession(req, res)) return

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
      .map((session) => ({ ...session, __ts: sessionTimestamp(session) }))
      .filter((session) => Boolean(session.__ts))
      .sort((a, b) => (b.__ts || 0) - (a.__ts || 0))
      .slice(0, 30)
      .map((session, i) => {
        const agentId = agentIdFromSession(session)
        const baseId = session.id || session.sessionId || session.key || `session-${i}`

        return {
          id: `ev-${String(baseId).replace(/[^a-z0-9]/gi, '-')}-${i}`,
          type: eventTypeFromSession(session),
          agentId,
          agentName: nameFromId(agentId),
          timestamp: session.__ts || Date.now(),
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
