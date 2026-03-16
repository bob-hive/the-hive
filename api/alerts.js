import {
  checkHiveApiKey,
  corsHeaders,
  hasStrictHiveApiKey,
  jsonResponse,
  requireUserSession,
  unauthorizedResponse,
} from './_lib/auth.js'
import { listAlerts, alertStoreInfo } from './_lib/alerts-store.js'

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

  const lane = req.query.lane ? String(req.query.lane).toLowerCase() : undefined
  const openOnly = String(req.query.openOnly || req.query.open_only || 'false').toLowerCase() === 'true'

  try {
    const result = await listAlerts({ lane, openOnly, limit: req.query.limit })

    const latestTs = result.alerts.reduce((max, alert) => Math.max(max, Number(alert.ts || 0)), 0)

    return jsonResponse(res, 200, {
      ...result,
      ts: Date.now(),
      latestTs,
      store: alertStoreInfo(),
    })
  } catch (error) {
    console.error('[api/alerts] error:', error.message)
    return jsonResponse(res, 500, {
      error: 'Failed to list alerts',
      code: 'ALERT_LIST_FAILED',
    })
  }
}
