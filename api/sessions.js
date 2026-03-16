/**
 * GET /api/sessions
 * Returns session/run history.
 *
 * Proxies to OpenClaw gateway `sessions.list` RPC.
 */

import { tryGatewayRpc, getGatewayConfig } from './_lib/gateway.js'
import { getMockSessions } from './_lib/mock.js'
import { checkHiveApiKey, jsonResponse, unauthorizedResponse, corsHeaders, requireUserSession } from './_lib/auth.js'

function normaliseSession(s) {
  const key = s.key || s.sessionKey || ''
  const parts = key.split(':')
  // key format: "agent:<agentId>:<channel>:..." or "agent:<agentId>:subagent:..."
  const agentId = parts[0] === 'agent' ? (parts[1] || null) : null
  const channel = parts[0] === 'agent' ? (parts[2] || null) : (parts[0] || null)

  return {
    id: s.sessionId || s.id || key,
    key,
    agentId: agentId || s.agentId || null,
    channel: channel || s.channel || null,
    label: s.label || null,
    lastActiveMs: s.lastActiveMs || s.updatedAt || null,
    createdAt: s.createdAt || null,
    status: s.status || 'unknown',
    messageCount: s.usage?.messageCounts?.total ?? s.messageCount ?? null,
    totalCost: s.usage?.totalCost ?? null,
    model: s.model || s.usage?.model || null,
  }
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
    return jsonResponse(res, 200, { sessions: getMockSessions(), mock: true, ts: Date.now() })
  }

  try {
    const limit = Math.min(parseInt(req.query?.limit || '50', 10), 200)
    const result = await tryGatewayRpc('sessions.list', { limit })
    const rawSessions = result?.sessions ?? (Array.isArray(result) ? result : [])
    const sessions = rawSessions.map(normaliseSession)

    return jsonResponse(res, 200, { sessions, total: sessions.length, mock: false, ts: Date.now() })
  } catch (err) {
    console.error('[api/sessions] error:', err.message)
    return jsonResponse(res, 200, {
      sessions: getMockSessions(),
      mock: true,
      error: err.message,
      ts: Date.now(),
    })
  }
}
