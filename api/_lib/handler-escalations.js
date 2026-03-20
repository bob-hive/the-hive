/**
 * api/_lib/handler-escalations.js
 * Escalations handler module — imported by mega-router api/[[...slug]].js
 */

import {
  checkHiveApiKey,
  corsHeaders,
  hasStrictHiveApiKey,
  jsonResponse,
  requireUserSession,
  unauthorizedResponse,
} from './auth.js'
import {
  ackEscalation,
  listEscalations,
  resolveEscalationById,
  retryEscalation,
} from './alerts-store.js'

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

function handleMutationError(res, error, fallbackCode) {
  if (error?.code === 'ESCALATION_NOT_FOUND') {
    return jsonResponse(res, 404, {
      error: error.message,
      code: error.code,
    })
  }

  if (error?.code === 'ESCALATION_INVALID_STATE' || error?.code === 'ESCALATION_ALERT_MISSING') {
    return jsonResponse(res, 409, {
      error: error.message,
      code: error.code,
    })
  }

  return jsonResponse(res, 500, {
    error: error.message || 'Escalation operation failed',
    code: fallbackCode,
  })
}

export async function handler(req, res, slug) {
  if (!authGate(req, res)) return

  if (req.method === 'GET' && slug.length === 0) {
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

  if (req.method === 'POST' && slug.length === 2) {
    const [escalationId, action] = slug

    try {
      let result
      if (action === 'ack') {
        result = await ackEscalation(escalationId, req.body || {})
      } else if (action === 'resolve') {
        result = await resolveEscalationById(escalationId, req.body || {})
      } else if (action === 'retry') {
        result = await retryEscalation(escalationId, req.body || {})
      } else {
        return jsonResponse(res, 404, { error: 'Escalation action not found', code: 'NOT_FOUND' })
      }

      return jsonResponse(res, 200, {
        ok: true,
        escalation: result.escalation,
        ts: Date.now(),
      })
    } catch (error) {
      const fallback = action === 'ack'
        ? 'ESCALATION_ACK_FAILED'
        : action === 'resolve'
          ? 'ESCALATION_RESOLVE_FAILED'
          : 'ESCALATION_RETRY_FAILED'

      return handleMutationError(res, error, fallback)
    }
  }

  return jsonResponse(res, 405, {
    error: 'Method not allowed',
    code: 'METHOD_NOT_ALLOWED',
  })
}
