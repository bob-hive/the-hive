import crypto from 'node:crypto'
import process from 'node:process'
import { Buffer } from 'node:buffer'

const DEFAULT_ALLOWED_EMAIL = 'singh.anirudh@gmail.com'

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function randomToken(size = 24) {
  return b64url(crypto.randomBytes(size))
}

export function getAllowedEmails() {
  const raw = process.env.HIVE_ALLOWED_EMAILS || DEFAULT_ALLOWED_EMAIL
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedEmail(email) {
  if (!email) return false
  return getAllowedEmails().includes(String(email).trim().toLowerCase())
}

export function getAuthBaseUrl(req) {
  const configured = process.env.HIVE_AUTH_BASE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')

  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers.host
  return `${proto}://${host}`
}

export function getGoogleClientConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
  }
}

export function getGoogleRedirectUri(req) {
  return `${getAuthBaseUrl(req)}/api/auth/callback`
}

export function buildGoogleAuthUrl(req, { state, nonce }) {
  const { clientId } = getGoogleClientConfig()
  const redirectUri = getGoogleRedirectUri(req)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
    nonce,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeCodeForGoogleTokens({ code, req }) {
  const { clientId, clientSecret } = getGoogleClientConfig()

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getGoogleRedirectUri(req),
    grant_type: 'authorization_code',
  })

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '')
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${text}`)
  }

  return tokenRes.json()
}

export async function validateGoogleIdToken({ idToken, nonce, req }) {
  const url = new URL('https://oauth2.googleapis.com/tokeninfo')
  url.searchParams.set('id_token', idToken)

  const infoRes = await fetch(url)
  if (!infoRes.ok) {
    const text = await infoRes.text().catch(() => '')
    throw new Error(`Google token validation failed (${infoRes.status}): ${text}`)
  }

  const info = await infoRes.json()
  const { clientId } = getGoogleClientConfig()

  if (!info.email || info.email_verified !== 'true') {
    throw new Error('Google account email is missing or not verified')
  }

  if (info.aud !== clientId) {
    throw new Error('Google token audience mismatch')
  }

  if (nonce && info.nonce !== nonce) {
    throw new Error('Google token nonce mismatch')
  }

  const expMs = Number.parseInt(info.exp, 10) * 1000
  if (!Number.isFinite(expMs) || expMs <= Date.now()) {
    throw new Error('Google token is expired')
  }

  return {
    email: String(info.email).toLowerCase(),
    name: info.name || '',
    picture: info.picture || '',
    sub: info.sub || '',
    issuer: info.iss || '',
    expiresAt: expMs,
    callbackOrigin: getAuthBaseUrl(req),
  }
}
