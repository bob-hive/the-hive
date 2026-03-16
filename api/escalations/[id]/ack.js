import {
  checkHiveApiKey,
  corsHeaders,
  hasStrictHiveApiKey,
  jsonResponse,
  requireUserSession,
  unauthorizedResponse,
} from '../../_lib/auth.js'
import { ackEscalation } from '../../_lib/alerts-store.js'

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
    const { escalation } = await ackEscalation(req.query.id, req.body || {})
    return jsonResponse(res, 200, {
      ok: true,
      escalation,
      ts: Date.now(),
    })
  } catch (error) {
    if (error?.code === 'ESCALATION_NOT_FOUND') {
      return jsonResponse(res, 404, {
        error: error.message,
        code: error.code,
      })
    }

    if (error?.code === 'ESCALATION_INVALID_STATE') {
      return jsonResponse(res, 409, {
        error: error.message,
        code: error.code,
      })
    }

    return jsonResponse(res, 500, {
      error: error.message || 'Failed to acknowledge escalation',
      code: 'ESCALATION_ACK_FAILED',
    })
  }
}
