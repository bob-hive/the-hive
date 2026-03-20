#!/usr/bin/env node
/**
 * scripts/hive-searchindex-sync.js
 *
 * Reads the local events.jsonl log, computes search latency p50/p95 and
 * operation breakdown, then POSTs to the Hive API search-index-efficiency panel.
 *
 * Usage:
 *   node scripts/hive-searchindex-sync.js
 *
 * Required env:
 *   HIVE_API_KEY   — machine-to-machine key for /api/monitoring/search-index-efficiency/sync
 *
 * Optional env:
 *   HIVE_API_URL                  — defaults to https://the-hive-omega.vercel.app
 *   OPENCLAW_WORKSPACE            — overrides default workspace root
 *   SEARCH_INDEX_WARN_MS          — warn threshold (default 400)
 *   SEARCH_INDEX_CRITICAL_MS      — critical threshold (default 1200)
 *   SEARCH_INDEX_EVENTS_PATH      — override events.jsonl path
 */

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import https from 'node:https'

// ─── Config ───────────────────────────────────────────────────────────────────

const HIVE_API_URL  = (process.env.HIVE_API_URL || 'https://the-hive-omega.vercel.app').replace(/\/$/, '')
const HIVE_API_KEY  = process.env.HIVE_API_KEY || ''
const WORKSPACE     = process.env.OPENCLAW_WORKSPACE || join(homedir(), '.openclaw', 'workspace')
const EVENTS_PATH   = process.env.SEARCH_INDEX_EVENTS_PATH || join(WORKSPACE, 'logs', 'events.jsonl')
const WARN_MS       = Number(process.env.SEARCH_INDEX_WARN_MS     || 400)
const CRITICAL_MS   = Number(process.env.SEARCH_INDEX_CRITICAL_MS || 1200)
const BUCKET_MS     = 2 * 60 * 60 * 1000  // 2-hour trend buckets

// ─── Operation classification (mirrors handler-monitoring.js) ─────────────────

const OPERATION_KEYS = {
  contextSearch: ['context', 'context.search', 'context_search'],
  configSearch:  ['config',  'config.search',  'config_search'],
  indexSearch:   ['index',   'index.search',   'index_search', 'local_index'],
}

function extractOperation(entry = {}) {
  const raw = [
    entry.event_type, entry.event, entry.name, entry.operation, entry.type,
    entry.meta?.operation, entry.meta?.event_type, entry.details?.operation,
  ].filter(Boolean).join(' ').toLowerCase()

  if (!raw.includes('search') && !raw.includes('index')) return null

  if (OPERATION_KEYS.contextSearch.some((token) => raw.includes(token))) return 'contextSearch'
  if (OPERATION_KEYS.configSearch.some((token) => raw.includes(token)))  return 'configSearch'
  if (OPERATION_KEYS.indexSearch.some((token) => raw.includes(token)))   return 'indexSearch'

  return raw.includes('search') ? 'indexSearch' : null
}

function extractLatencyMs(entry = {}) {
  const keys = ['latency_ms', 'duration_ms', 'elapsed_ms', 'took_ms', 'latencyMs', 'durationMs', 'elapsedMs', 'tookMs']
  for (const k of keys) {
    const v = entry[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  const metricKeys = ['latency_ms', 'duration_ms', 'elapsed_ms', 'p95_ms', 'p50_ms']
  for (const src of [entry.metrics, entry.meta]) {
    if (src && typeof src === 'object') {
      for (const k of metricKeys) {
        const v = src[k]
        if (typeof v === 'number' && Number.isFinite(v)) return v
      }
    }
  }
  return null
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000
  }
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

// ─── Statistics ───────────────────────────────────────────────────────────────

function quantile(numbers = [], percentile = 0.5) {
  const sorted = [...numbers].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]

  const idx = percentile * (sorted.length - 1)
  const lo  = Math.floor(idx)
  const hi  = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function statusFrom(p95, slowCount, warnMs, criticalMs) {
  if (p95 === null) return 'no_data'
  if (p95 >= criticalMs) return 'critical'
  if (p95 >= warnMs || slowCount > 0) return 'warning'
  return 'healthy'
}

function buildTrend(samples = [], now, bucketMs, warnMs, criticalMs) {
  const buckets = new Map()

  samples.forEach((sample) => {
    if (!sample.ts) return
    const bucketStart = Math.floor(sample.ts / bucketMs) * bucketMs
    const current = buckets.get(bucketStart) || []
    current.push(sample.latencyMs)
    buckets.set(bucketStart, current)
  })

  const points = []
  for (let i = 11; i >= 0; i -= 1) {
    const bucketStart = Math.floor((now - i * bucketMs) / bucketMs) * bucketMs
    const latencies   = buckets.get(bucketStart) || []
    const p95         = quantile(latencies, 0.95)
    const slow        = latencies.filter((ms) => ms >= warnMs).length

    points.push({
      bucketStart,
      label: new Date(bucketStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      count: latencies.length,
      p95: p95 === null ? null : Number(p95.toFixed(1)),
      slowCount: slow,
      status: statusFrom(p95, slow, warnMs, criticalMs),
    })
  }

  return points
}

// ─── Build payload ────────────────────────────────────────────────────────────

function buildPayload() {
  if (!existsSync(EVENTS_PATH)) {
    console.warn('[searchindex-sync] events.jsonl not found:', EVENTS_PATH, '— sending no_data payload')
    const noData = { requestCount: 0, p50LatencyMs: null, p95LatencyMs: null, slowQueryCount: 0, status: 'no_data' }
    return {
      source: 'PUSH',
      ts: Date.now(),
      thresholds: { warningMs: WARN_MS, criticalMs: CRITICAL_MS },
      summary: noData,
      operations: {
        contextSearch: { ...noData },
        configSearch:  { ...noData },
        indexSearch:   { ...noData },
      },
      trend: [],
      noData: true,
    }
  }

  const rows = readFileSync(EVENTS_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .slice(-4000)
    .map((line) => { try { return JSON.parse(line) } catch { return null } })
    .filter(Boolean)

  const now = Date.now()

  const samples = rows
    .map((entry) => {
      const operation = extractOperation(entry)
      const latencyMs = extractLatencyMs(entry)
      const ts = parseTimestamp(entry.ts || entry.timestamp || entry.time || entry.createdAt || entry.meta?.ts)
      if (!operation || latencyMs === null || !ts) return null
      return { operation, latencyMs, ts, id: entry.request_id || entry.run_id || null }
    })
    .filter(Boolean)
    .filter((s) => now - s.ts <= 24 * 60 * 60 * 1000)  // last 24h

  const grouped = { contextSearch: [], configSearch: [], indexSearch: [] }
  samples.forEach((s) => { grouped[s.operation]?.push(s.latencyMs) })

  const operations = Object.entries(grouped).reduce((acc, [key, values]) => {
    const p50      = quantile(values, 0.5)
    const p95      = quantile(values, 0.95)
    const slowCount = values.filter((ms) => ms >= WARN_MS).length
    acc[key] = {
      requestCount:  values.length,
      p50LatencyMs:  p50 === null ? null : Number(p50.toFixed(1)),
      p95LatencyMs:  p95 === null ? null : Number(p95.toFixed(1)),
      slowQueryCount: slowCount,
      status: statusFrom(p95, slowCount, WARN_MS, CRITICAL_MS),
    }
    return acc
  }, {})

  const allLatencies    = samples.map((s) => s.latencyMs)
  const overallP50      = quantile(allLatencies, 0.5)
  const overallP95      = quantile(allLatencies, 0.95)
  const overallSlow     = allLatencies.filter((ms) => ms >= WARN_MS).length

  return {
    source: 'PUSH',
    ts: now,
    thresholds: { warningMs: WARN_MS, criticalMs: CRITICAL_MS },
    summary: {
      requestCount:  allLatencies.length,
      p50LatencyMs:  overallP50 === null ? null : Number(overallP50.toFixed(1)),
      p95LatencyMs:  overallP95 === null ? null : Number(overallP95.toFixed(1)),
      slowQueryCount: overallSlow,
      status: statusFrom(overallP95, overallSlow, WARN_MS, CRITICAL_MS),
    },
    operations,
    trend: buildTrend(samples, now, BUCKET_MS, WARN_MS, CRITICAL_MS),
    noData: allLatencies.length === 0,
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
    console.error('[searchindex-sync] HIVE_API_KEY is not set')
    process.exit(1)
  }

  const payload = buildPayload()
  const url = `${HIVE_API_URL}/api/monitoring/search-index-efficiency/sync`

  console.log(`[searchindex-sync] Posting to ${url}`)
  console.log(`[searchindex-sync] Samples in last 24h: ${payload.summary.requestCount}, p95=${payload.summary.p95LatencyMs}ms, status=${payload.summary.status}`)

  const result = await postJson(url, payload, HIVE_API_KEY)
  console.log('[searchindex-sync] POST OK:', JSON.stringify(result))
  console.log('[searchindex-sync] Done.')
}

main().catch((err) => {
  console.error('[searchindex-sync] Fatal:', err.message)
  process.exit(1)
})
