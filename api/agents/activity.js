/**
 * GET /api/agents/activity
 * Returns recent activity feed (events, messages, task completions).
 *
 * Derived from sessions.list — each session entry represents activity.
 */

import { tryGatewayRpc, getGatewayConfig } from '../_lib/gateway.js'
import { getMockActivity } from '../_lib/mock.js'
import { checkHiveApiKey, jsonResponse, unauthorizedResponse, corsHeaders, requireUserSession } from '../_lib/auth.js'

const KNOWN_AGENT_IDS = ['bob', 'scout', 'forge', 'ledger', 'sentinel']

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

/** Parse agentId from structured fields, session key, and labels. */
function agentIdFromSession(session = {}) {
  const directFields = [session.agentId, session.agent, session.owner, session.worker]
  for (const value of directFields) {
    const normalized = normalizeToken(value)
    if (!normalized) continue
    if (normalized === 'main') return 'bob'
    return normalized
  }

  const key = String(session.key || '')
  const parts = key.split(':').map((part) => normalizeToken(part)).filter(Boolean)
  if (parts[0] === 'agent' && parts[1]) {
    if (parts[1] === 'main') return 'bob'
    return parts[1]
  }

  const labelBlob = [session.label, session.name, session.title, session.summary]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const matchedKnown = KNOWN_AGENT_IDS.find((id) => labelBlob.includes(id))
  if (matchedKnown) return matchedKnown

  return 'unknown'
}

/** Best-effort timestamp extraction from known session fields. */
function sessionTimestamp(session = {}) {
  const candidates = [
    session.lastActiveMs,
    session.lastEventTs,
    session.updatedAt,
    session.lastSeenAt,
    session.createdAt,
    session.ts,
  ]

  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 1_000_000_000_000 ? value : value * 1000
    }

    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000
    }

    const parsed = Date.parse(String(value))
    if (!Number.isNaN(parsed)) return parsed
  }

  return null
}

/** Derive event type from session fields and status hints. */
function eventTypeFromSession(session = {}) {
  const key = String(session.key || '').toLowerCase()
  const channel = String(session.channel || '').toLowerCase()
  const statusBlob = [session.status, session.state, session.outcome, session.result]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (statusBlob.includes('error') || statusBlob.includes('fail')) return 'error'
  if (statusBlob.includes('complete') || statusBlob.includes('success') || statusBlob.includes('done')) return 'completed'

  if (key.includes(':subagent:')) {
    if (statusBlob.includes('running') || statusBlob.includes('active')) return 'spawned'
    return 'active'
  }

  if (channel === 'cron' && (statusBlob.includes('idle') || statusBlob.includes('sleep'))) return 'completed'
  if (statusBlob.includes('idle')) return 'completed'

  return 'active'
}

function trimMessage(value, max = 120) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

/** Build a human-readable message for a session */
function messageFromSession(session = {}, eventType = 'active') {
  const key = String(session.key || '')
  const channel = String(session.channel || '')
  const label = String(session.label || session.name || '').trim()

  const explicit =
    trimMessage(session.summary) ||
    trimMessage(session.message) ||
    trimMessage(session.currentTask)
  if (explicit) return explicit

  if (key.includes(':subagent:')) {
    if (eventType === 'error') return `Subagent encountered an error${label ? `: ${label}` : ''}`
    if (eventType === 'completed') return `Subagent completed${label ? `: ${label}` : ''}`
    return `Subagent running${label ? `: ${label}` : ''}`
  }

  if (key.includes(':cron:')) {
    if (eventType === 'error') return `Cron task failed${label ? `: ${label}` : ''}`
    if (eventType === 'completed') return `Cron task completed${label ? `: ${label}` : ''}`
    return `Cron task active${label ? `: ${label}` : ''}`
  }

  if (channel === 'telegram') return `Active on Telegram${label ? ` — ${label}` : ''}`
  if (channel === 'discord') return `Active on Discord${label ? ` — ${label}` : ''}`
  if (channel === 'cron') return `Cron activity${label ? ` — ${label}` : ''}`
  if (label) return trimMessage(label)

  return `Session activity: ${key.split(':').slice(-2).join(':') || 'unknown'}`
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
      .map((session, idx) => ({ ...session, __ts: sessionTimestamp(session) || (Date.now() - idx * 1000) }))
      .sort((a, b) => (b.__ts || 0) - (a.__ts || 0))
      .slice(0, 30)
      .map((session, i) => {
        const agentId = agentIdFromSession(session)
        const eventType = eventTypeFromSession(session)
        const baseId = session.id || session.sessionId || session.key || `session-${i}`

        return {
          id: `ev-${String(baseId).replace(/[^a-z0-9]/gi, '-')}-${i}`,
          type: eventType,
          agentId,
          agentName: nameFromId(agentId),
          timestamp: session.__ts || Date.now(),
          message: messageFromSession(session, eventType),
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
