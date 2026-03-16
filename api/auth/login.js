import { buildGoogleAuthUrl, getGoogleClientConfig, randomToken } from '../_lib/oauth.js'
import { corsHeaders, jsonResponse, setOauthStateCookie } from '../_lib/auth.js'

export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Method not allowed' })
  }

  const { clientId, clientSecret } = getGoogleClientConfig()
  if (!clientId || !clientSecret) {
    return jsonResponse(res, 500, {
      error: 'Google OAuth is not configured',
      code: 'AUTH_MISCONFIGURED',
    })
  }

  const state = randomToken(24)
  const nonce = randomToken(24)

  try {
    setOauthStateCookie(req, res, { state, nonce })
  } catch (err) {
    return jsonResponse(res, 500, {
      error: err.message,
      code: 'AUTH_MISCONFIGURED',
    })
  }

  const redirectUrl = buildGoogleAuthUrl(req, { state, nonce })
  res.setHeader('Location', redirectUrl)
  return res.status(302).end()
}
