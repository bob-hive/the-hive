#!/usr/bin/env node
/**
 * scripts/hive-agent-sync.js
 *
 * Reads live agent/session data from the local OpenClaw gateway via WS RPC,
 * transforms it, and POSTs to the Hive API /api/agents/sync endpoint.
 *
 * Usage:
 *   node scripts/hive-agent-sync.js
 *
 * Required env:
 *   HIVE_API_KEY          — machine-to-machine key for /api/agents/sync
 *
 * Optional env:
 *   OPENCLAW_GATEWAY_TOKEN  — gateway auth token (falls back to ~/.openclaw/openclaw.json)
 *   HIVE_API_URL            — defaults to https://the-hive-omega.vercel.app
 */

import { createRequire } from 'module'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

// ─── Config ──────────────────────────────────────────────────────────────────

const HIVE_API_URL = (process.env.HIVE_API_URL || 'https://the-hive-omega.vercel.app').replace(/\/$/, '')
const HIVE_API_KEY = process.env.HIVE_API_KEY || ''
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'

const KNOWN_AGENT_IDS = ['bob', 'scout', 'forge', 'ledger', 'sentinel']

// ─── Read gateway token ───────────────────────────────────────────────────────

function readGatewayToken() {
  // 1. Explicit env override
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    return process.env.OPENCLAW_GATEWAY_TOKEN.trim()
  }

  // 2. Device operator token (has operator.read scope — needed for RPC)
  const deviceAuthPath = join(homedir(), '.openclaw', 'identity', 'device-auth.json')
  if (existsSync(deviceAuthPath)) {
    try {
      const raw = readFileSync(deviceAuthPath, 'utf8')
      const auth = JSON.parse(raw)
      const operatorToken = auth.tokens?.operator?.token
      if (operatorToken) {
        console.log('[sync] Using device operator token (operator.read scope)')
        return operatorToken.trim()
      }
    } catch (err) {
      console.warn('[sync] Failed to read device-auth.json:', err.message)
    }
  }

  // 3. Fallback: gateway auth token (passkey only — no scopes, RPC will likely fail)
  const configPath = join(homedir(), '.openclaw', 'openclaw.json')
  if (!existsSync(configPath)) {
    console.error('[sync] No token found: set OPENCLAW_GATEWAY_TOKEN or ensure ~/.openclaw/identity/device-auth.json exists')
    process.exit(1)
  }

  try {
    const raw = readFileSync(configPath, 'utf8')
    const cfg = JSON.parse(raw)
    const token = cfg.gateway?.auth?.token || cfg.gateway?.token || cfg.gatewayToken || cfg.token
    if (!token) {
      console.error('[sync] Cannot find gateway token in config')
      process.exit(1)
    }
    console.warn('[sync] Using gateway auth token (no operator.read scope — RPC may fail, will fall back to disk)')
    return token.trim()
  } catch (err) {
    console.error('[sync] Failed to read ~/.openclaw/openclaw.json:', err.message)
    process.exit(1)
  }
}

// ─── WebSocket RPC ────────────────────────────────────────────────────────────

async function gatewayRpc(gatewayUrl, token, method, params = {}) {
  // Lazy-load ws (it's a dependency in package.json)
  const require = createRequire(import.meta.url)
  let WebSocket
  try {
    WebSocket = require('ws')
  } catch {
    console.error('[sync] ws package not found — run: npm install ws')
    process.exit(1)
  }

  const CONNECT_TIMEOUT_MS = 10_000
  const REQUEST_TIMEOUT_MS = 15_000
  const PROTOCOL_VERSION = 3

  return new Promise((resolve, reject) => {
    let ws
    let connectTimer
    let requestTimer
    let connectId = null
    let callId = null
    let settled = false

    function cleanup() {
      clearTimeout(connectTimer)
      clearTimeout(requestTimer)
      try { ws?.terminate?.() ?? ws?.close?.() } catch { /* ignore */ }
    }

    function settle(err, value) {
      if (settled) return
      settled = true
      cleanup()
      if (err) reject(err)
      else resolve(value)
    }

    try {
      ws = new WebSocket(gatewayUrl, { handshakeTimeout: CONNECT_TIMEOUT_MS })
    } catch (err) {
      return reject(new Error(`Failed to create WebSocket: ${err.message}`))
    }

    connectTimer = setTimeout(() => settle(new Error('Gateway connect timeout')), CONNECT_TIMEOUT_MS)

    ws.on('error', (err) => settle(new Error(`Gateway WS error: ${err.message}`)))
    ws.on('close', (code, reason) => {
      if (!settled) settle(new Error(`Gateway closed (${code}): ${reason || 'no reason'}`))
    })

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }

      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        const nonce = msg.payload?.nonce
        if (!nonce) return settle(new Error('Gateway challenge missing nonce'))

        connectId = randomUUID()
        ws.send(JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: {
            minProtocol: PROTOCOL_VERSION,
            maxProtocol: PROTOCOL_VERSION,
            client: { id: 'gateway-client', version: '1.0.0', platform: 'node', mode: 'backend', instanceId: `hive-sync-${Date.now()}` },
            role: 'operator',
            scopes: ['operator.read', 'operator.admin'],
            caps: [],
            auth: { token },
          },
        }))
        return
      }

      if (msg.type === 'res' && msg.id === connectId) {
        if (!msg.ok) {
          return settle(new Error(`Gateway auth failed: ${msg.error?.message ?? 'unknown'} (${msg.error?.code ?? '?'})`))
        }
        clearTimeout(connectTimer)
        callId = randomUUID()
        requestTimer = setTimeout(() => settle(new Error(`Gateway RPC timeout: ${method}`)), REQUEST_TIMEOUT_MS)
        ws.send(JSON.stringify({ type: 'req', id: callId, method, params }))
        return
      }

      if (msg.type === 'res' && msg.id === callId) {
        if (!msg.ok) {
          return settle(new Error(`Gateway RPC error [${method}]: ${msg.error?.message ?? 'unknown'}`))
        }
        settle(null, msg.payload)
      }
    })
  })
}

// ─── Transform helpers ────────────────────────────────────────────────────────

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
  const parts = key.split(':').map((p) => normalizeToken(p)).filter(Boolean)
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
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
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

function nameFromId(id) {
  if (!id) return 'Agent'
  return id.charAt(0).toUpperCase() + id.slice(1)
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

function describeSession(session) {
  const channel = session.channel || session.delivery?.channel
  if (!channel) return null
  if (channel === 'telegram') return `Telegram chat${session.label ? ` — ${session.label}` : ''}`
  if (channel === 'discord') return `Discord${session.label ? ` — ${session.label}` : ''}`
  if (channel === 'cron') return `Cron: ${session.label || session.key || 'scheduled task'}`
  return session.label || channel
}

function transformToEvents(sessions) {
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

function transformToAgents(agentList, sessionList) {
  return agentList.map((agent, i) => {
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
}

// ─── POST to Hive API ─────────────────────────────────────────────────────────

async function postToHive(agents, events, ts) {
  if (!HIVE_API_KEY) {
    console.error('[sync] HIVE_API_KEY is not set — cannot POST to Hive API')
    process.exit(1)
  }

  const url = `${HIVE_API_URL}/api/agents/sync`
  const body = JSON.stringify({ agents, events, ts })

  console.log(`[sync] POSTing to ${url} — ${agents.length} agents, ${events.length} events`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hive-Key': HIVE_API_KEY,
    },
    body,
  })

  const text = await response.text()
  if (!response.ok) {
    console.error(`[sync] POST failed: ${response.status} ${response.statusText}`)
    console.error('[sync] Response:', text)
    process.exit(1)
  }

  let result
  try { result = JSON.parse(text) } catch { result = { raw: text } }
  console.log('[sync] POST OK:', JSON.stringify(result))
  return result
}

// ─── Local fallback: read sessions from disk ──────────────────────────────────

function readLocalSessions() {
  // OpenClaw stores sessions at ~/.openclaw/agents/<agentId>/sessions/sessions.json
  // sessions.json is an object keyed by session key (e.g. "agent:main:telegram:...": { sessionId, key, ... })
  const agentsDir = join(homedir(), '.openclaw', 'agents')
  if (!existsSync(agentsDir)) return []

  const now = Date.now()
  const oneDayMs = 24 * 60 * 60 * 1000

  let allSessions = []
  try {
    const agentDirs = readdirSync(agentsDir)
    for (const agentId of agentDirs) {
      const sessionsFile = join(agentsDir, agentId, 'sessions', 'sessions.json')
      if (!existsSync(sessionsFile)) continue
      try {
        const raw = readFileSync(sessionsFile, 'utf8')
        const data = JSON.parse(raw)

        let sessions = []
        if (Array.isArray(data)) {
          sessions = data
        } else if (data && typeof data === 'object') {
          // Object keyed by session key: { "agent:main:telegram:...": { sessionId, key, ... } }
          sessions = Object.entries(data).map(([key, session]) => ({
            ...session,
            key: session.key || key,
          }))
        }

        // Only include sessions active in the last 24h
        const recentSessions = sessions.filter((s) => {
          const updatedAt = s.updatedAt || s.lastActiveMs || s.ts
          if (!updatedAt) return true
          const ts = typeof updatedAt === 'number'
            ? (updatedAt > 1_000_000_000_000 ? updatedAt : updatedAt * 1000)
            : Date.parse(String(updatedAt))
          return !isNaN(ts) && (now - ts) < oneDayMs
        })

        // Inject agentId if missing
        for (const s of recentSessions) {
          if (!s.agentId && !s.agent) s.agentId = agentId
        }
        allSessions = allSessions.concat(recentSessions)
      } catch {
        // Ignore parse errors per file
      }
    }
  } catch {
    // Ignore readdir errors
  }

  console.log(`[sync] Read ${allSessions.length} sessions from local disk`)
  return allSessions
}

function readLocalAgentList() {
  // Read agents from ~/.openclaw/agents/<agentId>/ directories + config
  const agentsDir = join(homedir(), '.openclaw', 'agents')
  if (!existsSync(agentsDir)) return []

  try {
    const agentDirs = readdirSync(agentsDir)
    return agentDirs.map((agentId) => ({
      id: agentId,
      name: agentId === 'main' ? 'Bob' : (agentId.charAt(0).toUpperCase() + agentId.slice(1)),
      role: agentId === 'main' ? 'Orchestrator' : 'Agent',
      avatar: agentId === 'main' ? '😎' : '🤖',
    }))
  } catch {
    return []
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const token = readGatewayToken()

  console.log(`[sync] Connecting to gateway at ${GATEWAY_URL}`)

  // Fetch sessions (for activity feed and status derivation)
  let sessions = []
  let agentList = []
  let usedLocalFallback = false

  console.log('[sync] Calling sessions.list …')
  try {
    const sessionsResult = await gatewayRpc(GATEWAY_URL, token, 'sessions.list', { limit: 50, activeMinutes: 1440 })
    sessions = sessionsResult?.sessions ?? (Array.isArray(sessionsResult) ? sessionsResult : [])
    console.log(`[sync] Got ${sessions.length} sessions via RPC`)
  } catch (err) {
    console.warn('[sync] sessions.list RPC failed:', err.message)
    console.log('[sync] Falling back to local sessions files …')
    sessions = readLocalSessions()
    usedLocalFallback = true
  }

  console.log('[sync] Calling agents.list …')
  try {
    const agentsResult = await gatewayRpc(GATEWAY_URL, token, 'agents.list', {})
    agentList = agentsResult?.agents ?? (Array.isArray(agentsResult) ? agentsResult : [])
    console.log(`[sync] Got ${agentList.length} agents via RPC`)
  } catch (err) {
    console.warn('[sync] agents.list RPC failed:', err.message)
    if (usedLocalFallback) {
      agentList = readLocalAgentList()
      console.log(`[sync] Using ${agentList.length} agents from local dirs`)
    }
  }

  const ts = Date.now()
  const events = transformToEvents(sessions)
  const agents = transformToAgents(agentList, sessions)

  console.log(`[sync] Transformed: ${agents.length} agents, ${events.length} events`)

  await postToHive(agents, events, ts)
  console.log('[sync] Done.')
}

main().catch((err) => {
  console.error('[sync] Fatal:', err)
  process.exit(1)
})
