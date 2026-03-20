/**
 * api/_lib/handler-monitoring.js
 * Monitoring handler module — imported by mega-router api/[[...slug]].js
 */

import process from 'node:process'
import fs from 'node:fs/promises'
import { corsHeaders, jsonResponse, requireUserSession, hasStrictHiveApiKey } from './auth.js'
import {
  firstExistingPath,
  parseTimestamp,
  pickFirstNumber,
  quantile,
  readJsonSafe,
  readJsonlSafe,
  resolveWorkspaceLogPaths,
} from './monitoring-observability.js'
import { readPushStore } from './push-store.js'

// ─── Push store paths ─────────────────────────────────────────────────────────

const WEBSEARCH_STORE_FILE   = '/tmp/hive-websearch.json'
const SEARCHINDEX_STORE_FILE = '/tmp/hive-searchindex.json'
const PUSH_STALE_MS          = 10 * 60_000  // 10 min

// ─── Sync handlers (POST, machine-to-machine) ─────────────────────────────────

async function handleWebSearchSync(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }
  if (!hasStrictHiveApiKey(req)) {
    return jsonResponse(res, 401, { error: 'Unauthorized — X-Hive-Key required', code: 'AUTH_REQUIRED' })
  }

  const body  = req.body || {}
  const store = { ...body, pushedAt: Date.now(), ts: typeof body.ts === 'number' ? body.ts : Date.now() }

  try {
    await fs.writeFile(WEBSEARCH_STORE_FILE, JSON.stringify(store, null, 2), 'utf8')
    console.log('[api/monitoring/web-search-quota/sync] stored push data')
    return jsonResponse(res, 200, { ok: true, ts: store.ts })
  } catch (err) {
    console.error('[api/monitoring/web-search-quota/sync] write failed:', err.message)
    return jsonResponse(res, 500, { error: 'Failed to store web-search data', code: 'STORE_WRITE_FAILED' })
  }
}

async function handleSearchIndexSync(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }
  if (!hasStrictHiveApiKey(req)) {
    return jsonResponse(res, 401, { error: 'Unauthorized — X-Hive-Key required', code: 'AUTH_REQUIRED' })
  }

  const body  = req.body || {}
  const store = { ...body, pushedAt: Date.now(), ts: typeof body.ts === 'number' ? body.ts : Date.now() }

  try {
    await fs.writeFile(SEARCHINDEX_STORE_FILE, JSON.stringify(store, null, 2), 'utf8')
    console.log('[api/monitoring/search-index-efficiency/sync] stored push data')
    return jsonResponse(res, 200, { ok: true, ts: store.ts })
  } catch (err) {
    console.error('[api/monitoring/search-index-efficiency/sync] write failed:', err.message)
    return jsonResponse(res, 500, { error: 'Failed to store search-index data', code: 'STORE_WRITE_FAILED' })
  }
}

// ─── /api/monitoring/web-search-quota helpers ────────────────────────────────

function providerStatus({ failure, overLimit, hasAlert }) {
  if (overLimit || failure?.over_limit === true) return 'exhausted'
  if (failure) return 'degraded'
  if (hasAlert) return 'healthy'
  return 'unknown'
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

function toIso(ts) {
  const ms = parseTimestamp(ts)
  return ms ? new Date(ms).toISOString() : null
}

async function handleWebSearchQuota(req, res) {
  // Check push store first (10 min freshness)
  const pushed = readPushStore(WEBSEARCH_STORE_FILE, PUSH_STALE_MS)
  if (pushed) return jsonResponse(res, 200, { ...pushed, source: 'PUSH' })

  try {
    const stateFile = await firstExistingPath(resolveWorkspaceLogPaths(
      'logs/web-search-state.json',
      process.env.WEB_SEARCH_STATE_PATH || process.env.ALERT_STATE_PATH
    ))
    const alertsFile = await firstExistingPath(resolveWorkspaceLogPaths(
      'logs/web-search-alerts.jsonl',
      process.env.WEB_SEARCH_ALERTS_PATH || process.env.ALERT_LOG_PATH
    ))

    const state = await readJsonSafe(stateFile, { consecutive_dual_overlimit: 0 })
    const alerts = await readJsonlSafe(alertsFile, { maxLines: 2000 })

    const quotaAlerts = alerts
      .filter((entry) => entry?.event === 'web_search.dual_provider_exhausted')
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))

    const lastAlert = quotaAlerts[0] || null

    const primary = normalizeProvider(process.env.WEB_SEARCH_PRIMARY) || normalizeProvider(lastAlert?.primary_provider) || 'tavily'
    const secondary = normalizeProvider(process.env.WEB_SEARCH_SECONDARY) || normalizeProvider(lastAlert?.secondary_provider) || 'serpapi'
    const emergency = normalizeProvider(process.env.WEB_SEARCH_EMERGENCY) || normalizeProvider(state.emergency_provider) || 'duckduckgo'

    const threshold = Number(
      state.threshold?.consecutive_dual_overlimit_required ||
      lastAlert?.threshold?.consecutive_dual_overlimit_required ||
      process.env.ALERT_CONSECUTIVE_OVERLIMIT ||
      1
    )

    const consecutiveDual = Number(state.consecutive_dual_overlimit || state.observed_consecutive_dual_overlimit || 0)

    const alertFreshWindowMs = Number(process.env.WEB_SEARCH_ALERT_FRESH_MS || (6 * 60 * 60 * 1000))
    const lastAlertTs = parseTimestamp(lastAlert?.ts)
    const recentAlertActive = Boolean(lastAlertTs && (Date.now() - lastAlertTs <= alertFreshWindowMs))
    const stateCritical = Boolean(
      state.dual_provider_exhausted === true ||
      state.dualExhaustion?.critical === true ||
      state.critical === true
    )

    const dualExhaustionCritical = stateCritical || recentAlertActive || consecutiveDual >= threshold
    const fallbackProvider = dualExhaustionCritical ? emergency : primary
    const activeProvider = inferActiveProvider(state, fallbackProvider)

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

    return jsonResponse(res, 200, {
      source: 'LOCAL_LOGS',
      ts: Date.now(),
      files: { stateFile, alertsFile },
      currentActiveProvider: activeProvider,
      dualExhaustion: { critical: dualExhaustionCritical, threshold, consecutiveDualOverlimit: consecutiveDual, recentAlertActive, alertFreshWindowMs },
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
    })
  } catch (error) {
    console.error('[api/monitoring/web-search-quota] error:', error.message)
    return jsonResponse(res, 200, {
      source: 'LOCAL_LOGS',
      ts: Date.now(),
      providers: {
        primary: { name: process.env.WEB_SEARCH_PRIMARY || 'tavily', status: 'unknown', reason: null },
        secondary: { name: process.env.WEB_SEARCH_SECONDARY || 'serpapi', status: 'unknown', reason: null },
        emergency: { name: process.env.WEB_SEARCH_EMERGENCY || 'duckduckgo', status: 'unknown', reason: null },
      },
      currentActiveProvider: null,
      dualExhaustion: { critical: false, threshold: Number(process.env.ALERT_CONSECUTIVE_OVERLIMIT || 1), consecutiveDualOverlimit: 0 },
      lastAlert: null,
      noData: true,
      error: error.message,
    })
  }
}

// ─── /api/monitoring/search-index-efficiency helpers ─────────────────────────

const OPERATION_KEYS = {
  contextSearch: ['context', 'context.search', 'context_search'],
  configSearch: ['config', 'config.search', 'config_search'],
  indexSearch: ['index', 'index.search', 'index_search', 'local_index'],
}

function extractOperation(entry = {}) {
  const raw = [
    entry.event_type, entry.event, entry.name, entry.operation, entry.type,
    entry.meta?.operation, entry.meta?.event_type, entry.details?.operation,
  ].filter(Boolean).join(' ').toLowerCase()

  if (!raw.includes('search') && !raw.includes('index')) return null

  if (OPERATION_KEYS.contextSearch.some((token) => raw.includes(token))) return 'contextSearch'
  if (OPERATION_KEYS.configSearch.some((token) => raw.includes(token))) return 'configSearch'
  if (OPERATION_KEYS.indexSearch.some((token) => raw.includes(token))) return 'indexSearch'

  return raw.includes('search') ? 'indexSearch' : null
}

function extractLatencyMs(entry = {}) {
  const direct = pickFirstNumber(entry, ['latency_ms', 'duration_ms', 'elapsed_ms', 'took_ms', 'latencyMs', 'durationMs', 'elapsedMs', 'tookMs'])
  if (direct !== null) return direct

  const fromMetrics = pickFirstNumber(entry.metrics || {}, ['latency_ms', 'duration_ms', 'elapsed_ms', 'p95_ms', 'p50_ms'])
  if (fromMetrics !== null) return fromMetrics

  return pickFirstNumber(entry.meta || {}, ['latency_ms', 'duration_ms', 'elapsed_ms'])
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
    const ts = sample.ts
    if (!ts) return
    const bucketStart = Math.floor(ts / bucketMs) * bucketMs
    const current = buckets.get(bucketStart) || []
    current.push(sample.latencyMs)
    buckets.set(bucketStart, current)
  })

  const points = []
  for (let i = 11; i >= 0; i -= 1) {
    const bucketStart = Math.floor((now - i * bucketMs) / bucketMs) * bucketMs
    const latencies = buckets.get(bucketStart) || []
    const p95 = quantile(latencies, 0.95)
    const slow = latencies.filter((ms) => ms >= warnMs).length

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

async function handleSearchIndexEfficiency(req, res) {
  // Check push store first (10 min freshness)
  const pushed = readPushStore(SEARCHINDEX_STORE_FILE, PUSH_STALE_MS)
  if (pushed) return jsonResponse(res, 200, { ...pushed, source: 'PUSH' })

  try {
    const eventsFile = await firstExistingPath(resolveWorkspaceLogPaths(
      'logs/events.jsonl',
      process.env.SEARCH_INDEX_EVENTS_PATH || process.env.EVENTS_LOG_PATH
    ))

    const rows = await readJsonlSafe(eventsFile, { maxLines: 4000 })
    const now = Date.now()
    const warnMs = Number(process.env.SEARCH_INDEX_WARN_MS || 400)
    const criticalMs = Number(process.env.SEARCH_INDEX_CRITICAL_MS || 1200)
    const bucketMs = 2 * 60 * 60 * 1000

    const samples = rows
      .map((entry) => {
        const operation = extractOperation(entry)
        const latencyMs = extractLatencyMs(entry)
        const ts = parseTimestamp(entry.ts || entry.timestamp || entry.time || entry.createdAt || entry.meta?.ts)

        if (!operation || latencyMs === null || !ts) return null

        return { operation, latencyMs, ts, id: entry.request_id || entry.run_id || null }
      })
      .filter(Boolean)
      .filter((entry) => now - entry.ts <= 24 * 60 * 60 * 1000)

    const grouped = { contextSearch: [], configSearch: [], indexSearch: [] }

    samples.forEach((sample) => {
      grouped[sample.operation]?.push(sample.latencyMs)
    })

    const operations = Object.entries(grouped).reduce((acc, [key, values]) => {
      const p50 = quantile(values, 0.5)
      const p95 = quantile(values, 0.95)
      const slowCount = values.filter((ms) => ms >= warnMs).length

      acc[key] = {
        requestCount: values.length,
        p50LatencyMs: p50 === null ? null : Number(p50.toFixed(1)),
        p95LatencyMs: p95 === null ? null : Number(p95.toFixed(1)),
        slowQueryCount: slowCount,
        status: statusFrom(p95, slowCount, warnMs, criticalMs),
      }
      return acc
    }, {})

    const allLatencies = samples.map((sample) => sample.latencyMs)
    const overallP50 = quantile(allLatencies, 0.5)
    const overallP95 = quantile(allLatencies, 0.95)
    const overallSlowCount = allLatencies.filter((ms) => ms >= warnMs).length

    return jsonResponse(res, 200, {
      source: 'LOCAL_LOGS',
      ts: now,
      files: { eventsFile },
      thresholds: { warningMs: warnMs, criticalMs },
      summary: {
        requestCount: allLatencies.length,
        p50LatencyMs: overallP50 === null ? null : Number(overallP50.toFixed(1)),
        p95LatencyMs: overallP95 === null ? null : Number(overallP95.toFixed(1)),
        slowQueryCount: overallSlowCount,
        status: statusFrom(overallP95, overallSlowCount, warnMs, criticalMs),
      },
      operations,
      trend: buildTrend(samples, now, bucketMs, warnMs, criticalMs),
      noData: allLatencies.length === 0,
    })
  } catch (error) {
    console.error('[api/monitoring/search-index-efficiency] error:', error.message)
    return jsonResponse(res, 200, {
      source: 'LOCAL_LOGS',
      ts: Date.now(),
      thresholds: { warningMs: Number(process.env.SEARCH_INDEX_WARN_MS || 400), criticalMs: Number(process.env.SEARCH_INDEX_CRITICAL_MS || 1200) },
      summary: { requestCount: 0, p50LatencyMs: null, p95LatencyMs: null, slowQueryCount: 0, status: 'no_data' },
      operations: {
        contextSearch: { requestCount: 0, p50LatencyMs: null, p95LatencyMs: null, slowQueryCount: 0, status: 'no_data' },
        configSearch: { requestCount: 0, p50LatencyMs: null, p95LatencyMs: null, slowQueryCount: 0, status: 'no_data' },
        indexSearch: { requestCount: 0, p50LatencyMs: null, p95LatencyMs: null, slowQueryCount: 0, status: 'no_data' },
      },
      trend: [],
      noData: true,
      error: error.message,
    })
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handler(req, res, slug) {
  const route    = slug[0] || ''
  const subroute = slug[1] || ''

  // Machine-to-machine sync endpoints (no user session required — strict API key only)
  if (route === 'web-search-quota'        && subroute === 'sync') return handleWebSearchSync(req, res)
  if (route === 'search-index-efficiency' && subroute === 'sync') return handleSearchIndexSync(req, res)

  // All other routes require user session
  if (!requireUserSession(req, res)) return

  if (route === 'web-search-quota')        return handleWebSearchQuota(req, res)
  if (route === 'search-index-efficiency') return handleSearchIndexEfficiency(req, res)

  return jsonResponse(res, 404, { error: 'Not found', code: 'NOT_FOUND' })
}
