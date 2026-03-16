import {
  exchangeCodeForGoogleTokens,
  getAuthBaseUrl,
  getGoogleClientConfig,
  isAllowedEmail,
  validateGoogleIdToken,
} from '../_lib/oauth.js'
import {
  clearOauthStateCookie,
  clearSessionCookie,
  getOauthState,
  jsonResponse,
  setSessionCookie,
} from '../_lib/auth.js'

function redirectWithStatus(req, res, status) {
  const origin = getAuthBaseUrl(req)
  const url = new URL('/', origin)
  if (status) url.searchParams.set('auth', status)
  res.setHeader('Location', url.toString())
  return res.status(302).end()
}

export default async function handler(req, res) {
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

  const { code, state, error } = req.query || {}
  if (error) {
    clearOauthStateCookie(req, res)
    clearSessionCookie(req, res)
    return redirectWithStatus(req, res, 'cancelled')
  }

  const oauthState = getOauthState(req)
  if (!code || !state || !oauthState || oauthState.state !== state) {
    clearOauthStateCookie(req, res)
    clearSessionCookie(req, res)
    return redirectWithStatus(req, res, 'invalid_state')
  }

  try {
    const tokens = await exchangeCodeForGoogleTokens({ code, req })
    const profile = await validateGoogleIdToken({
      idToken: tokens.id_token,
      nonce: oauthState.nonce,
      req,
    })

    if (!isAllowedEmail(profile.email)) {
      clearOauthStateCookie(req, res)
      clearSessionCookie(req, res)
      return redirectWithStatus(req, res, 'unauthorized')
    }

    setSessionCookie(req, res, profile)
    clearOauthStateCookie(req, res)
    return redirectWithStatus(req, res, 'ok')
  } catch (err) {
    console.error('[api/auth/callback] error:', err.message)
    clearOauthStateCookie(req, res)
    clearSessionCookie(req, res)
    return redirectWithStatus(req, res, 'error')
  }
}
