/**
 * Simple API key check for frontend→backend requests.
 * The key is read from HIVE_API_KEY env var.
 * If not set, auth is skipped (open access — fine for internal/demo use).
 */

import process from 'node:process'

export function checkHiveApiKey(req) {
  const expectedKey = process.env.HIVE_API_KEY?.trim()
  if (!expectedKey) return true  // not configured → allow all

  const provided = (req.headers['x-hive-key'] || '').trim()
  return provided === expectedKey
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.HIVE_CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Hive-Key, Content-Type',
  }
}

export function jsonResponse(res, status, body) {
  res.status(status)
    .setHeader('Content-Type', 'application/json')
  Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
  res.json(body)
}

export function unauthorizedResponse(res) {
  jsonResponse(res, 401, { error: 'Unauthorized', code: 'AUTH_REQUIRED' })
}
