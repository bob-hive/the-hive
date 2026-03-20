#!/usr/bin/env node
/**
 * scripts/hive-usage-sync.js
 *
 * Reads token/cost usage data from local workspace files, transforms it into
 * the shape the Hive usage-tracker panel expects, and POSTs to the Hive API.
 *
 * Usage:
 *   node scripts/hive-usage-sync.js
 *
 * Required env:
 *   HIVE_API_KEY   — machine-to-machine key for /api/live/usage-tracker/sync
 *
 * Optional env:
 *   HIVE_API_URL   — defaults to https://the-hive-omega.vercel.app
 *   OPENCLAW_WORKSPACE — overrides default workspace root
 */

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import https from 'node:https'

// ─── Config ───────────────────────────────────────────────────────────────────

const HIVE_API_URL = (process.env.HIVE_API_URL || 'https://the-hive-omega.vercel.app').replace(/\/$/, '')
const HIVE_API_KEY = process.env.HIVE_API_KEY || ''
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || join(homedir(), '.openclaw', 'workspace')

const PROXIMITY_STATE_PATH = join(WORKSPACE, 'memory', 'usage-proximity-state.json')
const API_USAGE_LOG_PATH   = join(WORKSPACE, 'memory', 'api-usage-log.md')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function alertLevelFromPct(pct) {
  if (pct >= 80) return 'critical'
  if (pct >= 60) return 'warn'
  return 'ok'
}

function estimateTimeToExhaustion(pct, ageMs) {
  if (!ageMs || ageMs <= 0 || pct <= 0) return null
  const remaining = 100 - pct
  if (remaining <= 0) return 0
  const ratePerPct = ageMs / pct
  return Math.round(ratePerPct * remaining)
}

function parseProximityState(raw) {
  const data = JSON.parse(raw)

  const pct    = Number(data?.context?.pct ?? 0)
  const used   = Number(data?.context?.used ?? 0)
  const max    = Number(data?.context?.max ?? 272000)
  const status = String(data?.status || data?.modelStatus || 'UNKNOWN')

  // Support both the old spend structure and a direct claude30d field
  const claudeTokens = data?.spend?.claude_30d_tokens ?? data?.claude30d?.totalTokens ?? 0
  const openaiTokens = data?.spend?.openai_30d_tokens ?? data?.openai30d?.totalTokens ?? 0

  const alerts     = Array.isArray(data?.alerts) ? data.alerts : []
  const observedAt = data?.timestamp ? Date.parse(data.timestamp) : null

  return { pct, used, max, status, alertLevel: alertLevelFromPct(pct), claudeTokens30d: claudeTokens, openaiTokens30d: openaiTokens, alerts, observedAt, raw: data }
}

function parseApiUsageLog(text) {
  const entries = []
  const logSections = text.split(/^## /m).filter(Boolean)

  for (const section of logSections.slice(-8)) {
    const lines = section.split('\n')
    const header = lines[0]?.trim() || ''
    const body   = lines.slice(1).join('\n').trim()
    if (!header) continue
    entries.push({ date: header, summary: body.slice(0, 300) })
  }

  return entries.slice(-5).reverse()
}

// ─── Build payload ────────────────────────────────────────────────────────────

function buildPayload() {
  if (!existsSync(PROXIMITY_STATE_PATH)) {
    console.error('[usage-sync] Proximity state file not found:', PROXIMITY_STATE_PATH)
    process.exit(1)
  }

  let state
  try {
    state = parseProximityState(readFileSync(PROXIMITY_STATE_PATH, 'utf8'))
  } catch (err) {
    console.error('[usage-sync] Failed to parse proximity state:', err.message)
    process.exit(1)
  }

  let trendEntries = []
  if (existsSync(API_USAGE_LOG_PATH)) {
    try {
      trendEntries = parseApiUsageLog(readFileSync(API_USAGE_LOG_PATH, 'utf8'))
    } catch (err) {
      console.warn('[usage-sync] Could not parse api-usage-log.md:', err.message)
    }
  } else {
    console.warn('[usage-sync] api-usage-log.md not found, skipping trend entries')
  }

  const observedAtMs = state.observedAt ?? Date.now()
  const ageMs = Date.now() - observedAtMs
  const estimatedTimeToExhaustionMs = estimateTimeToExhaustion(state.pct, ageMs)

  const recentAlerts = (state.alerts || []).slice(-5).map((a) => ({
    ts: a.ts ? Date.parse(a.ts) : Date.now(),
    level: a.level || 'info',
    message: a.message || String(a),
  }))

  const claudeStatus = state.pct >= 80 ? 'critical' : state.pct >= 60 ? 'warn' : 'ok'

  return {
    pct: state.pct,
    used: state.used,
    max: state.max,
    status: state.status,
    alertLevel: state.alertLevel,
    estimatedTimeToExhaustionMs,
    providers: {
      claude: {
        label: 'Claude (Anthropic)',
        status: claudeStatus,
        tokens30d: state.claudeTokens30d,
        note: state.claudeTokens30d > 0
          ? `${state.claudeTokens30d.toLocaleString()} tokens (30d)`
          : 'No usage recorded',
      },
      codex: {
        label: 'OpenAI Codex / GPT',
        status: 'ok',
        tokens30d: state.openaiTokens30d,
        note: state.openaiTokens30d > 0
          ? `${state.openaiTokens30d.toLocaleString()} tokens (30d)`
          : 'No usage recorded',
      },
      gemini: {
        label: 'Google Gemini',
        status: 'ok',
        tokens30d: null,
        note: 'Not tracked in local dataset',
      },
    },
    recentAlerts,
    trendEntries,
    mock: false,
    ts: Date.now(),
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
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Hive-Key':    apiKey,
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
    console.error('[usage-sync] HIVE_API_KEY is not set')
    process.exit(1)
  }

  const payload = buildPayload()
  const url = `${HIVE_API_URL}/api/live/usage-tracker/sync`

  console.log(`[usage-sync] Posting to ${url}`)
  console.log(`[usage-sync] Context: ${payload.pct}% used (${payload.used}/${payload.max}), status=${payload.status}`)

  const result = await postJson(url, payload, HIVE_API_KEY)
  console.log('[usage-sync] POST OK:', JSON.stringify(result))
  console.log('[usage-sync] Done.')
}

main().catch((err) => {
  console.error('[usage-sync] Fatal:', err.message)
  process.exit(1)
})
