import {
  checkHiveApiKey,
  corsHeaders,
  hasStrictHiveApiKey,
  jsonResponse,
  requireUserSession,
  unauthorizedResponse,
} from './_lib/auth.js'
import { listEscalations } from './_lib/alerts-store.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  const machine = hasStrictHiveApiKey(req)
  if (!machine) {
    if (!requireUserSession(req, res)) return
    if (!checkHiveApiKey(req)) return unauthorizedResponse(res)
  }

  const state = req.query.state ? String(req.query.state).toLowerCase() : undefined
  const target = req.query.target ? String(req.query.target).toLowerCase() : undefined
  const openOnly = String(req.query.openOnly || req.query.open_only || 'false').toLowerCase() === 'true'

  try {
    const result = await listEscalations({
      state,
      target,
      openOnly,
      limit: req.query.limit,
    })

    return jsonResponse(res, 200, {
      ...result,
      ts: Date.now(),
    })
  } catch (error) {
    console.error('[api/escalations] error:', error.message)
    return jsonResponse(res, 500, {
      error: 'Failed to list escalations',
      code: 'ESCALATION_LIST_FAILED',
    })
  }
}
