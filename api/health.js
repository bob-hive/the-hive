/**
 * GET /api/health
 * Returns gateway health status — sanitized, no metadata.
 * Proxies to OpenClaw gateway `health` RPC method.
 *
 * Public endpoint — no API key required.
 */

import { tryGatewayRpc, getGatewayConfig } from './_lib/gateway.js'
import { getMockHealth } from './_lib/mock.js'
import { jsonResponse, corsHeaders } from './_lib/auth.js'

/**
 * Sanitize health response: strip bot usernames, IDs, application details.
 * Return only { ok, channels: { <name>: { ok } } }
 */
function sanitizeHealth(raw) {
  const ok = raw?.status === 'ok' || raw?.status === 'healthy'

  // Build channels map — status only, no metadata
  const channels = {}
  const rawChannels = raw?.channels ?? raw?.checks ?? {}

  // channels may be an array of objects or an object
  if (Array.isArray(rawChannels)) {
    for (const ch of rawChannels) {
      const name = ch.name || ch.channel || ch.type
      if (name) {
        channels[name] = {
          ok: ch.ok !== false && ch.status !== 'error' && ch.status !== 'down',
        }
      }
    }
  } else if (typeof rawChannels === 'object') {
    for (const [name, val] of Object.entries(rawChannels)) {
      if (typeof val === 'object') {
        channels[name] = {
          ok: val.ok !== false && val.status !== 'error' && val.status !== 'down',
        }
      } else {
        channels[name] = { ok: Boolean(val) }
      }
    }
  }

  return { ok, channels }
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  // Health is a public endpoint — no API key check

  const isMock = !getGatewayConfig()

  if (isMock) {
    return jsonResponse(res, 200, {
      ...sanitizeHealth(getMockHealth()),
      mock: true,
    })
  }

  try {
    const result = await tryGatewayRpc('health')
    return jsonResponse(res, 200, {
      ...sanitizeHealth(result),
      mock: false,
    })
  } catch (err) {
    console.error('[api/health] error:', err.message)
    return jsonResponse(res, 200, {
      ok: false,
      channels: {},
      mock: false,
    })
  }
}
