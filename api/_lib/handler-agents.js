/**
 * api/_lib/handler-agents.js
 * Agents handler module — imported by mega-router api/[[...slug]].js
 *
 * Data priority:
 *   1. PUSH store — /tmp/hive-agents.json (pushed from local sync script, < 10 min)
 *   2. Gateway RPC — live WS call to OpenClaw gateway (usually fails from Vercel)
 *   3. Mock — static fallback data
 */

import fs from 'node:fs/promises'
import process from 'node:process'
import { tryGatewayRpc, getGatewayConfig } from './gateway.js'
import { getMockActivity, getMockAgentsStatus } from './mock.js'
import { checkHiveApiKey, hasStrictHiveApiKey, jsonResponse, unauthorizedResponse, corsHeaders, requireUserSession } from './auth.js'

// ─── Push store ──────────────────────────────────────────────────────────────

const AGENTS_STORE_FILE = '/tmp/hive-agents.json'
const PUSH_STALE_MS = 10 * 60_000  // 10 min: treat pushed data as stale / fall back to RPC/mock

async function readPushStore() {
  try {
    const raw = await fs.readFile(AGENTS_STORE_FILE, 'utf8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

async function writePushStore(data) {
  await fs.writeFile(AGENTS_STORE_FILE, JSON.stringify(data, null, 2), 'utf8')
}

function isFresh(store) {
  if (!store?.ts) return false
  return Date.now() - Number(store.ts) < PUSH_STALE_MS
}

// ─── handleSync (POST /api/agents/sync) ──────────────────────────────────────

async function handleSync(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  if (!hasStrictHiveApiKey(req)) {
    return jsonResponse(res, 401, { error: 'Unauthorized — X-Hive-Key required', code: 'AUTH_REQUIRED' })
  }

  const body = req.body || {}
  if (!Array.isArray(body.agents) && !Array.isArray(body.events)) {
    return jsonResponse(res, 400, { error: 'Body must include agents and/or events arrays', code: 'INVALID_BODY' })
  }

  const store = {
    agents: Array.isArray(body.agents) ? body.agents : [],
    events: Array.isArray(body.events) ? body.events : [],
    ts: typeof body.ts === 'number' ? body.ts : Date.now(),
    pushedAt: Date.now(),
  }

  try {
    await writePushStore(store)
    console.log(`[api/agents/sync] stored ${store.agents.length} agents, ${store.events.length} events`)
    return jsonResponse(res, 200, { ok: true, agents: store.agents.length, events: store.events.length, ts: store.ts })
  } catch (err) {
    console.error('[api/agents/sync] write failed:', err.message)
    return jsonResponse(res, 500, { error: 'Failed to store agent data', code: 'STORE_WRITE_FAILED' })
  }
}

// ─── /api/agents/activity helpers ───────────────────────────────────────────

const KNOWN_AGENT_IDS = ['bob', 'scout', 'forge', 'ledger', 'sentinel']

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

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
    .filter(Boolean).join(' ').toLowerCase()
  const matchedKnown = KNOWN_AGENT_IDS.find((id) => labelBlob.includes(id))
  if (matchedKnown) return matchedKnown

  return 'unknown'
}

function sessionTimestamp(session = {}) {
  const candidates = [
    session.lastActiveMs, session.lastEventTs, session.updatedAt,
    session.lastSeenAt, session.createdAt, session.ts,
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

function eventTypeFromSession(session = {}) {
  const key = String(session.key || '').toLowerCase()
  const channel = String(session.channel || '').toLowerCase()
  const statusBlob = [session.status, session.state, session.outcome, session.result]
    .filter(Boolean).join(' ').toLowerCase()

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

function messageFromSession(session = {}, eventType = 'active') {
  const key = String(session.key || '')
  const channel = String(session.channel || '')
  const label = String(session.label || session.name || '').trim()

  const explicit = trimMessage(session.summary) || trimMessage(session.message) || trimMessage(session.currentTask)
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

function nameFromId(agentId) {
  if (!agentId) return 'Agent'
  return agentId.charAt(0).toUpperCase() + agentId.slice(1)
}

function sessionsToEvents(sessions) {
  return sessions
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
}

async function handleActivity(req, res) {
  // 1. Try push store first
  const store = await readPushStore()
  if (store && isFresh(store) && Array.isArray(store.events) && store.events.length > 0) {
    return jsonResponse(res, 200, {
      events: store.events,
      mock: false,
      source: 'PUSH',
      ts: store.ts,
      pushedAt: store.pushedAt,
    })
  }

  // 2. Try stale push store with STALE source badge
  if (store && Array.isArray(store.events) && store.events.length > 0) {
    const ageMs = Date.now() - Number(store.ts || 0)
    return jsonResponse(res, 200, {
      events: store.events,
      mock: false,
      source: 'STALE',
      staleMs: ageMs,
      ts: store.ts,
      pushedAt: store.pushedAt,
    })
  }

  // 3. Gateway RPC fallback
  if (getGatewayConfig()) {
    try {
      const result = await tryGatewayRpc('sessions.list', { limit: 50, activeMinutes: 24 * 60 })
      const sessions = result?.sessions ?? (Array.isArray(result) ? result : [])
      const events = sessionsToEvents(sessions)
      return jsonResponse(res, 200, { events, mock: false, source: 'RPC', ts: Date.now() })
    } catch (err) {
      console.error('[api/agents/activity] RPC error:', err.message)
    }
  }

  // 4. Mock fallback
  return jsonResponse(res, 200, { events: getMockActivity(), mock: true, source: 'MOCK', ts: Date.now() })
}

// ─── /api/agents/status helpers ─────────────────────────────────────────────

function describeSession(session) {
  const channel = session.channel || session.delivery?.channel
  if (!channel) return null
  if (channel === 'telegram') return `Telegram chat${session.label ? ` — ${session.label}` : ''}`
  if (channel === 'discord') return `Discord${session.label ? ` — ${session.label}` : ''}`
  if (channel === 'cron') return `Cron: ${session.label || session.key || 'scheduled task'}`
  return session.label || channel
}

function deriveStatus(agentId, sessions) {
  const agentSessions = sessions.filter((s) => {
    const sKey = s.key || ''
    return sKey.includes(`agent:${agentId}:`) || s.agentId === agentId
  })

  const now = Date.now()
  const recentThresholdMs = 5 * 60_000

  const hasSubagent = agentSessions.some((s) => (s.key || '').includes(':subagent:'))
  const hasRecentActivity = agentSessions.some((s) => s.lastActiveMs && now - s.lastActiveMs < recentThresholdMs)
  const hasCronSession = agentSessions.some((s) => (s.key || '').includes(':cron:'))

  if (hasSubagent && hasRecentActivity) return 'busy'
  if (hasRecentActivity) return 'online'
  if (hasCronSession) return 'online'
  if (agentSessions.length === 0) return 'idle'
  return 'idle'
}

async function handleStatus(req, res) {
  // 1. Try push store first
  const store = await readPushStore()
  if (store && isFresh(store) && Array.isArray(store.agents) && store.agents.length > 0) {
    return jsonResponse(res, 200, {
      agents: store.agents,
      mock: false,
      source: 'PUSH',
      ts: store.ts,
      pushedAt: store.pushedAt,
    })
  }

  // 2. Try stale push store with STALE source badge
  if (store && Array.isArray(store.agents) && store.agents.length > 0) {
    const ageMs = Date.now() - Number(store.ts || 0)
    return jsonResponse(res, 200, {
      agents: store.agents,
      mock: false,
      source: 'STALE',
      staleMs: ageMs,
      ts: store.ts,
      pushedAt: store.pushedAt,
    })
  }

  // 3. Gateway RPC fallback
  if (getGatewayConfig()) {
    try {
      const [agentsResult, sessionsResult] = await Promise.allSettled([
        tryGatewayRpc('agents.list'),
        tryGatewayRpc('sessions.list', { limit: 100, activeMinutes: 60 }),
      ])

      const agentList = agentsResult.status === 'fulfilled' ? (agentsResult.value?.agents ?? []) : []
      const sessionList = sessionsResult.status === 'fulfilled'
        ? (sessionsResult.value?.sessions ?? sessionsResult.value ?? []) : []

      const agents = agentList.map((agent, i) => {
        const agentId = agent.id || agent.agentId || `agent-${i}`
        const status = deriveStatus(agentId, sessionList)

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

      return jsonResponse(res, 200, { agents, mock: false, source: 'RPC', ts: Date.now() })
    } catch (err) {
      console.error('[api/agents/status] RPC error:', err.message)
    }
  }

  // 4. Mock fallback
  return jsonResponse(res, 200, { agents: getMockAgentsStatus(), mock: true, source: 'MOCK', ts: Date.now() })
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handler(req, res, slug) {
  const route = slug[0] || ''

  // POST /api/agents/sync — machine-to-machine, no user session required
  if (route === 'sync') return handleSync(req, res)

  // All other routes require user session
  if (!requireUserSession(req, res)) return
  if (!checkHiveApiKey(req)) return unauthorizedResponse(res)

  if (route === 'activity') return handleActivity(req, res)
  if (route === 'status') return handleStatus(req, res)

  return jsonResponse(res, 404, { error: 'Not found', code: 'NOT_FOUND' })
}
