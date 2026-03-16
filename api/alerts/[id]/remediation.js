import {
  checkHiveApiKey,
  corsHeaders,
  hasStrictHiveApiKey,
  jsonResponse,
  requireUserSession,
  unauthorizedResponse,
} from '../../_lib/auth.js'
import { appendRemediationAttempt } from '../../_lib/alerts-store.js'

function requestMeta(req) {
  return {
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.headers['x-real-ip'] || 'unknown',
    ua: req.headers['user-agent'] || 'unknown',
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  const machine = hasStrictHiveApiKey(req)
  if (!machine) {
    if (!requireUserSession(req, res)) return
    if (!checkHiveApiKey(req)) return unauthorizedResponse(res)
  }

  const alertId = req.query.id

  try {
    const { alert } = await appendRemediationAttempt(alertId, req.body || {}, requestMeta(req))
    return jsonResponse(res, 200, {
      ok: true,
      alert,
      ts: Date.now(),
    })
  } catch (error) {
    if (error?.code === 'ALERT_NOT_FOUND') {
      return jsonResponse(res, 404, {
        error: error.message,
        code: 'ALERT_NOT_FOUND',
      })
    }

    return jsonResponse(res, 500, {
      error: error.message || 'Failed to append remediation',
      code: 'ALERT_REMEDIATION_FAILED',
    })
  }
}
