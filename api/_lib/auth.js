import crypto from 'node:crypto'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { isAllowedEmail } from './oauth.js'

const SESSION_COOKIE = 'hive_session'
const OAUTH_STATE_COOKIE = 'hive_oauth_state'
const SESSION_TTL_SECONDS = 60 * 60 * 8 // 8 hours
const OAUTH_STATE_TTL_SECONDS = 60 * 10  // 10 minutes

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function getSigningSecret() {
  return process.env.HIVE_AUTH_SECRET?.trim() || ''
}

function sign(value, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64url')
}

function timingSafeEqualString(a, b) {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

function encodeSignedPayload(payload, secret) {
  const json = JSON.stringify(payload)
  const encoded = base64url(json)
  const signature = sign(encoded, secret)
  return `${encoded}.${signature}`
}

function decodeSignedPayload(value, secret) {
  if (!value || !secret) return null
  const [encoded, signature] = String(value).split('.')
  if (!encoded || !signature) return null

  const expected = sign(encoded, secret)
  if (!timingSafeEqualString(signature, expected)) return null

  try {
    const parsed = JSON.parse(fromBase64url(encoded))
    if (parsed?.exp && Number(parsed.exp) < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || ''
  const out = {}

  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=')
    if (idx < 0) return
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key) return
    out[key] = decodeURIComponent(value)
  })

  return out
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader('Set-Cookie')
  if (!current) {
    res.setHeader('Set-Cookie', cookieValue)
    return
  }

  const next = Array.isArray(current) ? [...current, cookieValue] : [String(current), cookieValue]
  res.setHeader('Set-Cookie', next)
}

function serializeCookie(name, value, options = {}) {
  const attrs = [`${name}=${encodeURIComponent(value)}`]

  if (options.maxAge !== undefined) attrs.push(`Max-Age=${Math.floor(options.maxAge)}`)
  if (options.path) attrs.push(`Path=${options.path}`)
  if (options.httpOnly) attrs.push('HttpOnly')
  if (options.secure) attrs.push('Secure')
  if (options.sameSite) attrs.push(`SameSite=${options.sameSite}`)

  return attrs.join('; ')
}

function cookieSecureFlag(req) {
  const forwardedProto = req.headers['x-forwarded-proto']
  if (forwardedProto) return forwardedProto === 'https'
  return process.env.NODE_ENV === 'production'
}

export function setSessionCookie(req, res, user) {
  const secret = getSigningSecret()
  if (!secret) throw new Error('HIVE_AUTH_SECRET is required')

  const now = Date.now()
  const payload = {
    email: String(user.email || '').toLowerCase(),
    name: user.name || '',
    picture: user.picture || '',
    iat: now,
    exp: now + SESSION_TTL_SECONDS * 1000,
  }

  const token = encodeSignedPayload(payload, secret)
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    httpOnly: true,
    secure: cookieSecureFlag(req),
    sameSite: 'Lax',
  }))
}

export function clearSessionCookie(req, res) {
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: cookieSecureFlag(req),
    sameSite: 'Lax',
  }))
}

export function setOauthStateCookie(req, res, payload) {
  const secret = getSigningSecret()
  if (!secret) throw new Error('HIVE_AUTH_SECRET is required')

  const now = Date.now()
  const token = encodeSignedPayload({
    ...payload,
    iat: now,
    exp: now + OAUTH_STATE_TTL_SECONDS * 1000,
  }, secret)

  appendSetCookie(res, serializeCookie(OAUTH_STATE_COOKIE, token, {
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: '/api/auth',
    httpOnly: true,
    secure: cookieSecureFlag(req),
    sameSite: 'Lax',
  }))
}

export function getOauthState(req) {
  const secret = getSigningSecret()
  if (!secret) return null
  const cookies = parseCookies(req)
  return decodeSignedPayload(cookies[OAUTH_STATE_COOKIE], secret)
}

export function clearOauthStateCookie(req, res) {
  appendSetCookie(res, serializeCookie(OAUTH_STATE_COOKIE, '', {
    maxAge: 0,
    path: '/api/auth',
    httpOnly: true,
    secure: cookieSecureFlag(req),
    sameSite: 'Lax',
  }))
}

export function getSession(req) {
  const secret = getSigningSecret()
  if (!secret) return null

  const cookies = parseCookies(req)
  const session = decodeSignedPayload(cookies[SESSION_COOKIE], secret)
  if (!session) return null

  const email = String(session.email || '').toLowerCase()
  if (!isAllowedEmail(email)) {
    return {
      ...session,
      email,
      unauthorized: true,
    }
  }

  return {
    ...session,
    email,
    unauthorized: false,
  }
}

export function requireUserSession(req, res) {
  const session = getSession(req)

  if (!session) {
    jsonResponse(res, 401, { error: 'Authentication required', code: 'AUTH_REQUIRED' })
    return null
  }

  if (session.unauthorized) {
    jsonResponse(res, 403, { error: 'Account is not authorized for The Hive', code: 'AUTH_FORBIDDEN' })
    return null
  }

  return session
}

/**
 * API key check for frontend→backend requests.
 * If not configured, key check is skipped.
 */
export function checkHiveApiKey(req) {
  const expectedKey = process.env.HIVE_API_KEY?.trim()
  if (!expectedKey) return true

  const provided = (req.headers['x-hive-key'] || '').trim()
  if (!provided) return false
  return timingSafeEqualString(provided, expectedKey)
}

/**
 * Strict API key check (requires configured key + provided header match).
 * Use for machine-to-machine endpoints that should work without user session.
 */
export function hasStrictHiveApiKey(req) {
  const expectedKey = process.env.HIVE_API_KEY?.trim()
  if (!expectedKey) return false

  const provided = (req.headers['x-hive-key'] || '').trim()
  if (!provided) return false
  return timingSafeEqualString(provided, expectedKey)
}

export function corsHeaders() {
  const origin = process.env.HIVE_CORS_ORIGIN || '*'
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Hive-Key, Content-Type',
  }

  if (origin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  return headers
}

export function jsonResponse(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json')
  Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
  res.json(body)
}

export function unauthorizedResponse(res) {
  jsonResponse(res, 401, { error: 'Unauthorized', code: 'AUTH_REQUIRED' })
}

export function forbiddenResponse(res) {
  jsonResponse(res, 403, { error: 'Forbidden', code: 'AUTH_FORBIDDEN' })
}
