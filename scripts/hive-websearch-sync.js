#!/usr/bin/env node
/**
 * scripts/hive-websearch-sync.js
 *
 * Reads web search provider state and alerts from local workspace files,
 * transforms them into the shape the Hive web-search-quota panel expects,
 * and POSTs to the Hive API.
 *
 * Usage:
 *   node scripts/hive-websearch-sync.js
 *
 * Required env:
 *   HIVE_API_KEY   — machine-to-machine key for /api/monitoring/web-search-quota/sync
 *
 * Optional env:
 *   HIVE_API_URL        — defaults to https://the-hive-omega.vercel.app
 *   OPENCLAW_WORKSPACE  — overrides default workspace root
 *   WEB_SEARCH_PRIMARY, WEB_SEARCH_SECONDARY, WEB_SEARCH_EMERGENCY
 *   WEB_SEARCH_ALERT_FRESH_MS
 *   ALERT_CONSECUTIVE_OVERLIMIT
 */

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import https from 'node:https'

// ─── Config ───────────────────────────────────────────────────────────────────

const HIVE_API_URL = (process.env.HIVE_API_URL || 'https://the-hive-omega.vercel.app').replace(/\/$/, '')
const HIVE_API_KEY = process.env.HIVE_API_KEY || ''
const WORKSPACE    = process.env.OPENCLAW_WORKSPACE || join(homedir(), '.openclaw', 'workspace')

const STATE_PATH  = join(WORKSPACE, 'logs', 'web-search-state.json')
const ALERTS_PATH = join(WORKSPACE, 'logs', 'web-search-alerts.jsonl')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Support both ms and s epoch values
    return value > 1_000_000_000_000 ? value : value * 1000
  }
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeProvider(name) {
  const value = String(name || '').trim()
  return value || null
}

function inferActiveProvider(state = {}, fallback = null) {
  return (
    normalizeProvider(state.active_provider) ||
    normalizeProvider(state.activeProvider) ||
    normalizeProvider(state.current_provider) ||
    normalizeProvider(state.currentProvider) ||
    normalizeProvider(state.last_provider) ||
    normalizeProvider(state.lastProvider) ||
    fallback
  )
}

function providerStatus({ failure, overLimit, hasAlert }) {
  if (overLimit || failure?.over_limit === true) return 'exhausted'
  if (failure) return 'degraded'
  if (hasAlert) return 'healthy'
  return 'unknown'
}

function toIso(ts) {
  const ms = parseTimestamp(ts)
  return ms ? new Date(ms).toISOString() : null
}

function readJsonSafe(filePath, fallback = {}) {
  if (!filePath || !existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function readJsonlSafe(filePath, { maxLines = 2000 } = {}) {
  if (!filePath || !existsSync(filePath)) return []
  try {
    const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean)
    const tail  = lines.slice(-maxLines)
    return tail.map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
  } catch {
    return []
  }
}

// ─── Build payload ────────────────────────────────────────────────────────────

function buildPayload() {
  const state  = readJsonSafe(STATE_PATH,  { consecutive_dual_overlimit: 0 })
  const alerts = readJsonlSafe(ALERTS_PATH, { maxLines: 2000 })

  const quotaAlerts = alerts
    .filter((entry) => entry?.event === 'web_search.dual_provider_exhausted')
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))

  const lastAlert = quotaAlerts[0] || null

  const primary   = normalizeProvider(process.env.WEB_SEARCH_PRIMARY)   || normalizeProvider(lastAlert?.primary_provider)   || 'tavily'
  const secondary = normalizeProvider(process.env.WEB_SEARCH_SECONDARY) || normalizeProvider(lastAlert?.secondary_provider) || 'serpapi'
  const emergency = normalizeProvider(process.env.WEB_SEARCH_EMERGENCY) || normalizeProvider(state.emergency_provider)      || 'duckduckgo'

  const threshold = Number(
    state.threshold?.consecutive_dual_overlimit_required ||
    lastAlert?.threshold?.consecutive_dual_overlimit_required ||
    process.env.ALERT_CONSECUTIVE_OVERLIMIT ||
    1
  )

  const consecutiveDual = Number(state.consecutive_dual_overlimit || state.observed_consecutive_dual_overlimit || 0)

  const alertFreshWindowMs = Number(process.env.WEB_SEARCH_ALERT_FRESH_MS || (6 * 60 * 60 * 1000))
  const lastAlertTs        = parseTimestamp(lastAlert?.ts)
  const recentAlertActive  = Boolean(lastAlertTs && (Date.now() - lastAlertTs <= alertFreshWindowMs))
  const stateCritical      = Boolean(
    state.dual_provider_exhausted === true ||
    state.dualExhaustion?.critical === true ||
    state.critical === true
  )

  const dualExhaustionCritical = stateCritical || recentAlertActive || consecutiveDual >= threshold
  const fallbackProvider = dualExhaustionCritical ? emergency : primary
  const activeProvider   = inferActiveProvider(state, fallbackProvider)

  const providers = {
    primary: {
      name: primary,
      status: providerStatus({ failure: lastAlert?.primary_failure, overLimit: lastAlert?.primary_failure?.over_limit, hasAlert: recentAlertActive }),
      reason: lastAlert?.primary_failure?.error || null,
    },
    secondary: {
      name: secondary,
      status: providerStatus({ failure: lastAlert?.secondary_failure, overLimit: lastAlert?.secondary_failure?.over_limit, hasAlert: recentAlertActive }),
      reason: lastAlert?.secondary_failure?.error || null,
    },
    emergency: {
      name: emergency,
      status: emergency ? (activeProvider === emergency ? 'active' : 'standby') : 'not_configured',
      reason: null,
    },
  }

  return {
    source: 'PUSH',
    ts: Date.now(),
    currentActiveProvider: activeProvider,
    dualExhaustion: {
      critical: dualExhaustionCritical,
      threshold,
      consecutiveDualOverlimit: consecutiveDual,
      recentAlertActive,
      alertFreshWindowMs,
    },
    providers,
    lastAlert: lastAlert
      ? {
          ts: parseTimestamp(lastAlert.ts),
          at: toIso(lastAlert.ts),
          reason: lastAlert?.recommended_action || 'Primary and secondary providers exhausted',
          requestId: lastAlert?.request_id || null,
          query: lastAlert?.query || null,
        }
      : null,
    noData: !lastAlert && consecutiveDual === 0,
  }
}

// ─── HTTP POST ────────────────────────────────────────────────────────────────

function postJson(url, body, apiKey) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const data   = JSON.stringify(body)

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Hive-Key':     apiKey,
      },
    }

    const req = https.request(options, (res) => {
      let chunks = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { chunks += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(chunks)) } catch { resolve({ raw: chunks }) }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${chunks}`))
        }
      })
    })

    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!HIVE_API_KEY) {
    console.error('[websearch-sync] HIVE_API_KEY is not set')
    process.exit(1)
  }

  const payload = buildPayload()
  const url = `${HIVE_API_URL}/api/monitoring/web-search-quota/sync`

  console.log(`[websearch-sync] Posting to ${url}`)
  console.log(`[websearch-sync] Active provider: ${payload.currentActiveProvider}, dualExhaustion.critical: ${payload.dualExhaustion.critical}`)

  const result = await postJson(url, payload, HIVE_API_KEY)
  console.log('[websearch-sync] POST OK:', JSON.stringify(result))
  console.log('[websearch-sync] Done.')
}

main().catch((err) => {
  console.error('[websearch-sync] Fatal:', err.message)
  process.exit(1)
})
