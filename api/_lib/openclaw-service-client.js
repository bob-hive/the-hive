import process from 'node:process'
import { getGatewayConfig, tryGatewayRpc } from './gateway.js'
import { getMockAgentsStatus } from './mock.js'

const DEFAULT_STALE_MS = Number(process.env.HIVE_LIVE_STATUS_STALE_MS || 90_000)

function parseMs(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value

  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric

  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function freshnessMeta({ source, observedAtMs, staleAfterMs = DEFAULT_STALE_MS, mock = false }) {
  const generatedAtMs = Date.now()
  const observed = parseMs(observedAtMs) || generatedAtMs
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

function describeSession(session) {
  const channel = session.channel || session.delivery?.channel
  if (!channel) return session.label || null

  if (channel === 'telegram') return `Telegram${session.label ? ` · ${session.label}` : ''}`
  if (channel === 'discord') return `Discord${session.label ? ` · ${session.label}` : ''}`
  if (channel === 'cron') return `Cron${session.label ? ` · ${session.label}` : ''}`

  return session.label || channel
}

function normalizeSession(raw) {
  const key = raw.key || raw.sessionKey || ''
  const keyParts = key.split(':')
  const maybeAgentFromKey = keyParts[0] === 'agent' ? keyParts[1] : null

  return {
    ...raw,
    key,
    agentId: raw.agentId || maybeAgentFromKey || null,
    lastActiveMs: parseMs(raw.lastActiveMs || raw.updatedAt || raw.lastRunMs || raw.lastRunAt),
    currentTask: describeSession(raw),
  }
}

function deriveAgentStatus(agentId, sessions, nowMs) {
  const agentSessions = sessions.filter((s) => s.agentId === agentId || String(s.key || '').includes(`agent:${agentId}:`))

  if (agentSessions.length === 0) return { status: 'idle', pulse: 'cold', lastSeenMs: null, currentTask: '' }

  const mostRecent = agentSessions
    .slice()
    .sort((a, b) => (b.lastActiveMs || 0) - (a.lastActiveMs || 0))[0]

  const lastSeenMs = mostRecent?.lastActiveMs || null
  const ageMs = lastSeenMs ? nowMs - lastSeenMs : Number.POSITIVE_INFINITY
  const hasSubagent = agentSessions.some((s) => String(s.key || '').includes(':subagent:'))

  let status = 'idle'
  if (lastSeenMs && ageMs <= 2 * 60_000) status = hasSubagent ? 'busy' : 'online'
  else if (lastSeenMs && ageMs <= 10 * 60_000) status = 'online'

  const pulse =
    ageMs <= 60_000 ? 'hot'
    : ageMs <= 5 * 60_000 ? 'warm'
    : ageMs <= 15 * 60_000 ? 'cool'
    : 'cold'

  return {
    status,
    pulse,
    lastSeenMs,
    currentTask: mostRecent?.currentTask || '',
  }
}

function normalizeAgent(raw, index) {
  return {
    id: raw.id || raw.agentId || `agent-${index}`,
    name: raw.name || raw.displayName || raw.id || `Agent ${index + 1}`,
    role: raw.role || 'Agent',
    avatar: raw.avatar || raw.emoji || '🤖',
    tasksCompleted: raw.tasksCompleted || 0,
    tasksRunning: raw.tasksRunning || 0,
    uptime: raw.uptime || 0,
    load: raw.load || 0,
    sparkline: Array.isArray(raw.sparkline) ? raw.sparkline : [],
  }
}

function mapMockStatusAgent(agent) {
  const nowMs = Date.now()
  const ageMs = agent.lastActiveMs ? Math.max(0, nowMs - agent.lastActiveMs) : Number.POSITIVE_INFINITY

  return {
    ...agent,
    pulse:
      ageMs <= 60_000 ? 'hot'
      : ageMs <= 5 * 60_000 ? 'warm'
      : ageMs <= 15 * 60_000 ? 'cool'
      : 'cold',
    lastSeenMs: agent.lastActiveMs || null,
  }
}

function summarizeAgents(agents) {
  return agents.reduce((acc, agent) => {
    acc.total += 1
    if (agent.status === 'busy') acc.busy += 1
    else if (agent.status === 'online') acc.online += 1
    else if (agent.status === 'error') acc.error += 1
    else acc.idle += 1
    return acc
  }, { total: 0, busy: 0, online: 0, idle: 0, error: 0 })
}

export function getLiveServiceMode() {
  return getGatewayConfig() ? 'LIVE' : 'MOCK'
}

export async function getAgentStatusPanelData() {
  const mode = getLiveServiceMode()

  if (mode === 'MOCK') {
    const agents = getMockAgentsStatus().map(mapMockStatusAgent)
    return {
      agents,
      counts: summarizeAgents(agents),
      freshness: freshnessMeta({ source: 'MOCK', observedAtMs: Date.now(), mock: true }),
      mock: true,
    }
  }

  try {
    const [agentsResult, sessionsResult] = await Promise.all([
      tryGatewayRpc('agents.list'),
      tryGatewayRpc('sessions.list', { limit: 150, activeMinutes: 180 }),
    ])

    const rawAgents = agentsResult?.agents ?? (Array.isArray(agentsResult) ? agentsResult : [])
    const rawSessions = sessionsResult?.sessions ?? (Array.isArray(sessionsResult) ? sessionsResult : [])

    const sessions = rawSessions.map(normalizeSession)
    const observedAtMs = sessions.reduce((max, s) => Math.max(max, s.lastActiveMs || 0), 0) || Date.now()
    const nowMs = Date.now()

    const agents = rawAgents.map((raw, index) => {
      const base = normalizeAgent(raw, index)
      const statusBits = deriveAgentStatus(base.id, sessions, nowMs)

      return {
        ...base,
        status: statusBits.status,
        pulse: statusBits.pulse,
        lastSeenMs: statusBits.lastSeenMs,
        currentTask: statusBits.currentTask,
      }
    })

    return {
      agents,
      counts: summarizeAgents(agents),
      freshness: freshnessMeta({ source: 'LIVE', observedAtMs, mock: false }),
      mock: false,
    }
  } catch (error) {
    const agents = getMockAgentsStatus().map(mapMockStatusAgent)

    return {
      agents,
      counts: summarizeAgents(agents),
      freshness: freshnessMeta({ source: 'MOCK_FALLBACK', observedAtMs: Date.now(), mock: true }),
      mock: true,
      error: error.message,
    }
  }
}
