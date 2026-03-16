import { getAllowedEmails } from '../_lib/oauth.js'
import { getSession, jsonResponse } from '../_lib/auth.js'

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Method not allowed' })
  }

  const session = getSession(req)

  if (!session) {
    return jsonResponse(res, 401, {
      authenticated: false,
      code: 'AUTH_REQUIRED',
      allowedEmails: getAllowedEmails(),
    })
  }

  if (session.unauthorized) {
    return jsonResponse(res, 403, {
      authenticated: false,
      code: 'AUTH_FORBIDDEN',
      email: session.email,
      allowedEmails: getAllowedEmails(),
    })
  }

  return jsonResponse(res, 200, {
    authenticated: true,
    user: {
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
    allowedEmails: getAllowedEmails(),
  })
}
