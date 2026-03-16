import {
  checkHiveApiKey,
  corsHeaders,
  hasStrictHiveApiKey,
  jsonResponse,
  requireUserSession,
  unauthorizedResponse,
} from '../_lib/auth.js'
import { ingestAlert } from '../_lib/alerts-store.js'

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

  try {
    const { alert } = await ingestAlert(req.body || {}, requestMeta(req))
    return jsonResponse(res, 200, {
      ok: true,
      alert,
      ts: Date.now(),
    })
  } catch (error) {
    const isValidation = error.message?.includes('required')
    return jsonResponse(res, isValidation ? 400 : 500, {
      error: error.message || 'Failed to ingest alert',
      code: isValidation ? 'INVALID_ALERT' : 'ALERT_INGEST_FAILED',
    })
  }
}
