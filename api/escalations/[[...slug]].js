import {
  checkHiveApiKey,
  corsHeaders,
  hasStrictHiveApiKey,
  jsonResponse,
  requireUserSession,
  unauthorizedResponse,
} from '../_lib/auth.js'
import {
  ackEscalation,
  listEscalations,
  resolveEscalationById,
  retryEscalation,
} from '../_lib/alerts-store.js'

function slugParts(req) {
  const slug = req.query?.slug
  if (!slug) return []
  return Array.isArray(slug) ? slug : [slug]
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!authGate(req, res)) return

  const parts = slugParts(req)

  if (req.method === 'GET' && parts.length === 0) {
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

  if (req.method === 'POST' && parts.length === 2) {
    const [escalationId, action] = parts

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
