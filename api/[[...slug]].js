/**
 * api/[[...slug]].js
 * Mega-router: consolidates all subdirectory catch-all routes into a single
 * Vercel serverless function to prevent bundling scope collisions and stay
 * within the Vercel Hobby 12-function limit.
 *
 * Routes handled:
 *   /api/agents/*       → handler-agents.js
 *   /api/alerts/*       → handler-alerts.js
 *   /api/escalations/*  → handler-escalations.js
 *   /api/live/*         → handler-live.js
 *   /api/monitoring/*   → handler-monitoring.js
 */

import { corsHeaders, jsonResponse } from './_lib/auth.js'
import { getGatewayConfig, tryGatewayRpc } from './_lib/gateway.js'
import { handler as agentsHandler } from './_lib/handler-agents.js'
import { handler as alertsHandler } from './_lib/handler-alerts.js'
import { handler as escalationsHandler } from './_lib/handler-escalations.js'
import { handler as liveHandler } from './_lib/handler-live.js'
import { handler as monitoringHandler } from './_lib/handler-monitoring.js'
import { handler as projectsHandler } from './_lib/handler-projects.js'

/**
 * Parse the URL path into [section, ...rest] where section is the first
 * path segment after /api/. Works regardless of how Vercel passes the slug.
 */
function parsePath(req) {
  const url = req.url || ''
  // Strip query string
  const pathname = url.split('?')[0]
  // Remove leading /api/ prefix (handles both /api/agents/status and agents/status)
  const stripped = pathname.replace(/^\/api\//, '').replace(/^\//, '')
  const parts = stripped.split('/').filter(Boolean)
  return parts
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  const parts = parsePath(req)
  const section = parts[0] || ''
  const slug = parts.slice(1)

  switch (section) {
    case 'agents':
      return agentsHandler(req, res, slug)

    case 'alerts':
      return alertsHandler(req, res, slug)

    case 'escalations':
      return escalationsHandler(req, res, slug)

    case 'live':
      return liveHandler(req, res, slug)

    case 'monitoring':
      return monitoringHandler(req, res, slug)

    case 'projects':
      return projectsHandler(req, res, slug)

    case 'debug-gateway': {
      const cfg = getGatewayConfig()
      if (!cfg) {
        return jsonResponse(res, 200, {
          ok: false,
          reason: 'getGatewayConfig() returned null',
          hasUrl: !!process.env.OPENCLAW_GATEWAY_URL,
          hasToken: !!process.env.OPENCLAW_API_TOKEN,
          urlPrefix: (process.env.OPENCLAW_GATEWAY_URL || '').slice(0, 20),
        })
      }
      try {
        const result = await tryGatewayRpc('agents.list')
        return jsonResponse(res, 200, { ok: true, agents: result, urlPrefix: cfg.url.slice(0, 20) })
      } catch (e) {
        return jsonResponse(res, 200, { ok: false, error: e.message, urlPrefix: cfg.url.slice(0, 20) })
      }
    }

    default:
      return jsonResponse(res, 404, { error: 'Not found', code: 'NOT_FOUND' })
  }
}
