/**
 * api/live/activity-feed.js
 * Chronological activity feed from OpenClaw session events.
 * Supports LIVE (via gateway) and MOCK modes.
 */

import process from 'node:process'
import { checkHiveApiKey, corsHeaders, jsonResponse, requireUserSession, unauthorizedResponse } from '../_lib/auth.js'
import { getGatewayConfig, tryGatewayRpc } from '../_lib/gateway.js'
import { getMockActivity } from '../_lib/mock.js'

const DEFAULT_STALE_MS = Number(process.env.HIVE_LIVE_ACTIVITY_STALE_MS || 60_000)
const MIN_LIMIT = 5
const MAX_LIMIT = 100

function freshnessMeta({ source, observedAtMs, staleAfterMs = DEFAULT_STALE_MS, mock = false }) {
  const generatedAtMs = Date.now()
  const observed = observedAtMs ?? generatedAtMs
  const ageMs = Math.max(0, generatedAtMs - observed)

  return {
    source,
    mode: mock ? 'MOCK' : 'LIVE',
    observedAtMs: observed,
    generatedAtMs,
    ageMs,
    staleAfterMs,
    stale: ageMs > staleAfterMs,
  }
}

// Derive event type from a session key + metadata
function deriveEventType(session) {
  const key = String(session.key || session.sessionKey || '')
  const channel = session.channel || session.delivery?.channel || ''

  if (channel === 'cron' || key.includes(':cron:')) return 'cron'
  if (key.includes(':subagent:')) return 'task'
  if (session.status === 'error' || session.lastError) return 'error'
  if (channel === 'telegram' || channel === 'discord') return 'heartbeat'
  return 'task'
}

function deriveStatusBadge(session) {
  const status = String(session.status || 'unknown').toLowerCase()
  if (status === 'active' || status === 'running') return 'running'
  if (status === 'completed' || status === 'done' || status === 'success') return 'success'
  if (status === 'error' || status === 'failed') return 'error'
  if (status === 'idle') return 'idle'
  return 'unknown'
}

function deriveAgent(session) {
  const key = String(session.key || session.sessionKey || '')
  const keyParts = key.split(':')
  const agentFromKey = keyParts[0] === 'agent' ? (keyParts[1] || null) : null

  return {
    id: session.agentId || agentFromKey || 'unknown',
    name: session.agentName || session.label || agentFromKey || 'Agent',
  }
}

function summarize(session) {
  if (session.currentTask) return session.currentTask
  const label = session.label || ''
  const channel = session.channel || session.delivery?.channel || ''
  if (label) return label
  if (channel === 'cron') return 'Scheduled cron run'
  if (channel === 'telegram') return 'Telegram session active'
  if (channel === 'discord') return 'Discord session active'
  return 'Session event'
}

function parseMs(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function sessionToEvent(session, index) {
  const agent = deriveAgent(session)
  const ts = parseMs(session.lastActiveMs || session.updatedAt || session.createdAt) || (Date.now() - index * 60_000)

  return {
    id: session.id || session.sessionKey || session.key || `evt-${index}`,
    timestamp: ts,
    agent: agent.id,
    agentName: agent.name,
    eventType: deriveEventType(session),
    summary: summarize(session),
    status: deriveStatusBadge(session),
  }
}

// Build mock events from getMockActivity (mock.js)
function buildMockEvents() {
  const raw = getMockActivity()

  return raw.map((item) => ({
    id: item.id,
    timestamp: item.timestamp,
    agent: item.agentId,
    agentName: item.agentName,
    eventType: mapMockType(item.type),
    summary: item.message,
    status: mapMockStatus(item.type),
  }))
}

function mapMockType(type) {
  switch (type) {
    case 'spawned': return 'task'
    case 'completed': return 'task'
    case 'active': return 'task'
    case 'error': return 'error'
    case 'cron': return 'cron'
    case 'alert': return 'alert'
    case 'deploy': return 'deploy'
    case 'heartbeat': return 'heartbeat'
    default: return 'task'
  }
}

function mapMockStatus(type) {
  switch (type) {
    case 'completed': return 'success'
    case 'error': return 'error'
    case 'spawned': return 'running'
    case 'active': return 'running'
    default: return 'unknown'
  }
}

// Supplement mock events with extra realistic variety
function buildEnrichedMockEvents() {
  const now = Date.now()
  const mins = (n) => n * 60_000

  const extras = [
    { id: 'e-011', timestamp: now - mins(3),   agent: 'sentinel', agentName: 'Sentinel', eventType: 'alert',    summary: 'Disk usage on node-02 crossed 80% threshold', status: 'error' },
    { id: 'e-012', timestamp: now - mins(22),  agent: 'ledger',   agentName: 'Ledger',   eventType: 'cron',     summary: 'Daily cost-report cron triggered', status: 'success' },
    { id: 'e-013', timestamp: now - mins(60),  agent: 'forge',    agentName: 'Forge',    eventType: 'deploy',   summary: 'the-hive v2.4.1 deployed to Vercel', status: 'success' },
    { id: 'e-014', timestamp: now - mins(95),  agent: 'bob',      agentName: 'Bob',      eventType: 'heartbeat',summary: 'Heartbeat check — all systems nominal', status: 'success' },
    { id: 'e-015', timestamp: now - mins(150), agent: 'scout',    agentName: 'Scout',    eventType: 'error',    summary: 'Rate-limit hit on Brave Search API — failover activated', status: 'error' },
  ]

  const base = buildMockEvents()
  return [...base, ...extras].sort((a, b) => b.timestamp - a.timestamp)
}

async function getLiveActivityEvents(limit) {
  try {
    const sessionsResult = await tryGatewayRpc('sessions.list', { limit: Math.min(limit * 2, 200), activeMinutes: 360 })
    const rawSessions = sessionsResult?.sessions ?? (Array.isArray(sessionsResult) ? sessionsResult : [])

    if (rawSessions.length === 0) return null

    const events = rawSessions
      .map(sessionToEvent)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)

    const latestMs = events[0]?.timestamp ?? Date.now()

    return {
      events,
      observedAtMs: latestMs,
      mock: false,
    }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!requireUserSession(req, res)) return
  if (!checkHiveApiKey(req)) return unauthorizedResponse(res)

  const rawLimit = parseInt(req.query?.limit || '50', 10)
  const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Number.isFinite(rawLimit) ? rawLimit : 50))

  const isLiveMode = Boolean(getGatewayConfig())

  if (isLiveMode) {
    const liveResult = await getLiveActivityEvents(limit)

    if (liveResult) {
      return jsonResponse(res, 200, {
        events: liveResult.events,
        freshness: freshnessMeta({ source: 'LIVE', observedAtMs: liveResult.observedAtMs, mock: false }),
        mock: false,
        count: liveResult.events.length,
        ts: Date.now(),
      })
    }
  }

  // MOCK fallback
  const events = buildEnrichedMockEvents().slice(0, limit)

  return jsonResponse(res, 200, {
    events,
    freshness: freshnessMeta({ source: isLiveMode ? 'MOCK_FALLBACK' : 'MOCK', observedAtMs: Date.now(), mock: true }),
    mock: true,
    count: events.length,
    ts: Date.now(),
  })
}
