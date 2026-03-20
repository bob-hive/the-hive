/**
 * api/_lib/handler-live.js
 * Live data handler module — imported by mega-router api/[[...slug]].js
 */

import process from 'node:process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { checkHiveApiKey, jsonResponse, requireUserSession, unauthorizedResponse } from './auth.js'
import { getGatewayConfig, tryGatewayRpc } from './gateway.js'
import { getMockActivity } from './mock.js'
import { getAgentStatusPanelData } from './openclaw-service-client.js'

// ─── /api/live/status-panel + /api/live/pulse ───────────────────────────────

async function handleStatusPanel(req, res) {
  const data = await getAgentStatusPanelData()

  return jsonResponse(res, 200, {
    source: data.freshness.source,
    mode: data.freshness.mode,
    mock: data.mock,
    freshness: data.freshness,
    counts: data.counts,
    agents: data.agents,
    ts: data.freshness.generatedAtMs,
    ...(data.error ? { error: data.error } : {}),
  })
}

// ─── /api/live/activity-feed ─────────────────────────────────────────────────

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

    return { events, observedAtMs: latestMs, mock: false }
  } catch {
    return null
  }
}

async function handleActivityFeed(req, res) {
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

  const events = buildEnrichedMockEvents().slice(0, limit)

  return jsonResponse(res, 200, {
    events,
    freshness: freshnessMeta({ source: isLiveMode ? 'MOCK_FALLBACK' : 'MOCK', observedAtMs: Date.now(), mock: true }),
    mock: true,
    count: events.length,
    ts: Date.now(),
  })
}

// ─── /api/live/usage-tracker ─────────────────────────────────────────────────

function resolveWorkspaceRoot() {
  if (process.env.OPENCLAW_WORKSPACE) return process.env.OPENCLAW_WORKSPACE
  return path.join(process.env.HOME || '/root', '.openclaw', 'workspace')
}

const WORKSPACE = resolveWorkspaceRoot()
const PROXIMITY_STATE_PATH = path.join(WORKSPACE, 'memory', 'usage-proximity-state.json')
const API_USAGE_LOG_PATH = path.join(WORKSPACE, 'memory', 'api-usage-log.md')

function usageFreshnessMeta({ source, observedAtMs, staleAfterMs = 300_000, mock = false }) {
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

function alertLevelFromPct(pct) {
  if (pct >= 80) return 'critical'
  if (pct >= 60) return 'warn'
  return 'ok'
}

function estimateTimeToExhaustion(pct, ageMs) {
  if (!ageMs || ageMs <= 0 || pct <= 0) return null
  const remaining = 100 - pct
  if (remaining <= 0) return 0
  const ratePerPct = ageMs / pct
  return Math.round(ratePerPct * remaining)
}

function parseProximityState(raw) {
  try {
    const data = JSON.parse(raw)
    const pct = Number(data?.context?.pct ?? 0)
    const used = Number(data?.context?.used ?? 0)
    const max = Number(data?.context?.max ?? 272000)
    const status = String(data?.status || 'UNKNOWN')

    const claudeTokens = data?.claude30d?.totalTokens ?? 0
    const openaiTokens = data?.openai30d?.totalTokens ?? 0

    const alerts = Array.isArray(data?.alerts) ? data.alerts : []
    const observedAt = data?.timestamp ? Date.parse(data.timestamp) : null

    return { ok: true, pct, used, max, status, alertLevel: alertLevelFromPct(pct), claudeTokens30d: claudeTokens, openaiTokens30d: openaiTokens, alerts, observedAt, raw: data }
  } catch {
    return { ok: false }
  }
}

function parseApiUsageLog(text) {
  const entries = []
  const logSections = text.split(/^## /m).filter(Boolean)

  for (const logSection of logSections.slice(-8)) {
    const lines = logSection.split('\n')
    const header = lines[0]?.trim() || ''
    const body = lines.slice(1).join('\n').trim()
    if (!header) continue
    entries.push({ date: header, summary: body.slice(0, 300) })
  }

  return entries.slice(-5).reverse()
}

function buildMockUsageData() {
  const now = Date.now()
  const mins = (n) => n * 60_000

  return {
    pct: 7,
    used: 20000,
    max: 272000,
    status: 'ALL_CLEAR',
    alertLevel: 'ok',
    estimatedTimeToExhaustionMs: null,
    providers: {
      claude: { label: 'Claude (Anthropic)', status: 'ok', tokens30d: 7773, note: 'Within normal range' },
      codex: { label: 'OpenAI Codex / GPT', status: 'ok', tokens30d: 0, note: 'No usage recorded' },
      gemini: { label: 'Google Gemini', status: 'ok', tokens30d: null, note: 'Not tracked locally' },
    },
    recentAlerts: [
      { ts: now - mins(150), level: 'warn', message: 'Context usage crossed 60% — continuing to monitor' },
      { ts: now - mins(900), level: 'ok', message: 'Context reset after session end' },
    ],
    trendEntries: [
      { date: '2026-03-17 08:05 CT', summary: 'Context at 7%, all providers nominal.' },
      { date: '2026-03-16 20:04 CT', summary: 'Context at 10%, Gemini default, no degradation.' },
      { date: '2026-03-16 16:05 CT', summary: 'Context at 6%, tokens 16k/272k.' },
      { date: '2026-03-16 08:05 CT', summary: 'Context at 10%, Opus reachable, spend normal.' },
      { date: '2026-03-16 00:04 CT', summary: 'All systems nominal. No anomalies.' },
    ],
    freshness: usageFreshnessMeta({ source: 'MOCK', observedAtMs: now, mock: true }),
    mock: true,
    ts: now,
  }
}

async function getLiveUsageData() {
  const [stateRaw, logRaw] = await Promise.allSettled([
    readFile(PROXIMITY_STATE_PATH, 'utf8'),
    readFile(API_USAGE_LOG_PATH, 'utf8'),
  ])

  if (stateRaw.status === 'rejected') return null

  const state = parseProximityState(stateRaw.value)
  if (!state.ok) return null

  const trendEntries = logRaw.status === 'fulfilled' ? parseApiUsageLog(logRaw.value) : []

  const observedAtMs = state.observedAt ?? Date.now()
  const ageMs = Date.now() - observedAtMs
  const estimatedTimeToExhaustionMs = estimateTimeToExhaustion(state.pct, ageMs)

  const recentAlerts = (state.alerts || []).slice(-5).map((a) => ({
    ts: a.ts ? Date.parse(a.ts) : Date.now(),
    level: a.level || 'info',
    message: a.message || String(a),
  }))

  return {
    pct: state.pct,
    used: state.used,
    max: state.max,
    status: state.status,
    alertLevel: state.alertLevel,
    estimatedTimeToExhaustionMs,
    providers: {
      claude: {
        label: 'Claude (Anthropic)',
        status: state.pct >= 80 ? 'critical' : state.pct >= 60 ? 'warn' : 'ok',
        tokens30d: state.claudeTokens30d,
        note: state.claudeTokens30d > 0 ? `${state.claudeTokens30d.toLocaleString()} tokens (30d)` : 'No usage recorded',
      },
      codex: {
        label: 'OpenAI Codex / GPT',
        status: 'ok',
        tokens30d: state.openaiTokens30d,
        note: state.openaiTokens30d > 0 ? `${state.openaiTokens30d.toLocaleString()} tokens (30d)` : 'No usage recorded',
      },
      gemini: { label: 'Google Gemini', status: 'ok', tokens30d: null, note: 'Not tracked in local dataset' },
    },
    recentAlerts,
    trendEntries,
    freshness: usageFreshnessMeta({ source: 'LIVE', observedAtMs, mock: false }),
    mock: false,
    ts: Date.now(),
  }
}

async function handleUsageTracker(req, res) {
  try {
    const liveData = await getLiveUsageData()
    if (liveData) return jsonResponse(res, 200, liveData)
  } catch {
    // fall through to mock
  }

  return jsonResponse(res, 200, buildMockUsageData())
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handler(req, res, slug) {
  if (!requireUserSession(req, res)) return
  if (!checkHiveApiKey(req)) return unauthorizedResponse(res)

  const route = slug[0] || ''

  if (route === 'status-panel') return handleStatusPanel(req, res)
  if (route === 'pulse') return handleStatusPanel(req, res)
  if (route === 'activity-feed') return handleActivityFeed(req, res)
  if (route === 'usage-tracker') return handleUsageTracker(req, res)

  return jsonResponse(res, 404, { error: 'Not found', code: 'NOT_FOUND' })
}
