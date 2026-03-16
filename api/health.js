/**
 * GET /api/health
 * Returns gateway health status.
 * Proxies to OpenClaw gateway `health` RPC method.
 */

import { tryGatewayRpc, getGatewayConfig } from './_lib/gateway.js'
import { getMockHealth } from './_lib/mock.js'
import { checkHiveApiKey, jsonResponse, unauthorizedResponse, corsHeaders } from './_lib/auth.js'

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!checkHiveApiKey(req)) return unauthorizedResponse(res)

  const isMock = !getGatewayConfig()

  if (isMock) {
    return jsonResponse(res, 200, {
      ...getMockHealth(),
      mock: true,
    })
  }

  try {
    const result = await tryGatewayRpc('health')

    // Normalise the health snapshot to a predictable shape
    const health = {
      status: result?.status ?? 'unknown',
      uptimeMs: result?.uptimeMs ?? null,
      version: result?.version ?? null,
      checks: result?.checks ?? {},
      channels: result?.channels ?? [],
      ts: Date.now(),
      mock: false,
    }

    return jsonResponse(res, 200, health)
  } catch (err) {
    console.error('[api/health] error:', err.message)
    // Still return something useful rather than a hard 500
    return jsonResponse(res, 200, {
      status: 'unreachable',
      error: err.message,
      ts: Date.now(),
      mock: false,
    })
  }
}
