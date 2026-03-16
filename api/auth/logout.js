import { getAuthBaseUrl } from '../_lib/oauth.js'
import { clearSessionCookie, corsHeaders, jsonResponse } from '../_lib/auth.js'

export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' })
  }

  clearSessionCookie(req, res)

  // Browser flow: redirect back to home with a signed-out marker.
  if (req.method === 'GET') {
    const url = new URL('/', getAuthBaseUrl(req))
    url.searchParams.set('auth', 'signed_out')
    res.setHeader('Location', url.toString())
    return res.status(302).end()
  }

  return jsonResponse(res, 200, { ok: true })
}
