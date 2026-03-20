/**
 * api/_lib/handler-alerts.js
 * Alerts handler module — imported by mega-router api/[[...slug]].js
 */

import {
  checkHiveApiKey,
  corsHeaders,
  hasStrictHiveApiKey,
  jsonResponse,
  requireUserSession,
  unauthorizedResponse,
} from './auth.js'
import { appendRemediationAttempt, ingestAlert, listAlerts, alertStoreInfo } from './alerts-store.js'

function requestMeta(req) {
  return {
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.headers['x-real-ip'] || 'unknown',
    ua: req.headers['user-agent'] || 'unknown',
  }
}

function authGate(req, res) {
  const machine = hasStrictHiveApiKey(req)
  if (machine) return true
  if (!requireUserSession(req, res)) return false
  if (!checkHiveApiKey(req)) {
    unauthorizedResponse(res)
    return false
  }
  return true
}

export async function handler(req, res, slug) {
  // GET /api/alerts — list alerts
  if (req.method === 'GET') {
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
      return jsonResponse(res, 500, { error: 'Failed to list alerts', code: 'ALERT_LIST_FAILED' })
    }
  }

  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }

  if (!authGate(req, res)) return

  if (slug.length === 1 && slug[0] === 'ingest') {
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

  if (slug.length === 2 && slug[1] === 'remediation') {
    try {
      const { alert } = await appendRemediationAttempt(slug[0], req.body || {}, requestMeta(req))
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

  return jsonResponse(res, 404, {
    error: 'Alert route not found',
    code: 'NOT_FOUND',
  })
}
