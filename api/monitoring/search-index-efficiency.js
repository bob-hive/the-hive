import process from 'node:process'
import { corsHeaders, jsonResponse, requireUserSession } from '../_lib/auth.js'
import {
  firstExistingPath,
  parseTimestamp,
  pickFirstNumber,
  quantile,
  readJsonlSafe,
  resolveWorkspaceLogPaths,
} from '../_lib/monitoring-observability.js'

const OPERATION_KEYS = {
  contextSearch: ['context', 'context.search', 'context_search'],
  configSearch: ['config', 'config.search', 'config_search'],
  indexSearch: ['index', 'index.search', 'index_search', 'local_index'],
}

function extractOperation(entry = {}) {
  const raw = [
    entry.event_type,
    entry.event,
    entry.name,
    entry.operation,
    entry.type,
    entry.meta?.operation,
    entry.meta?.event_type,
    entry.details?.operation,
  ].filter(Boolean).join(' ').toLowerCase()

  if (!raw.includes('search') && !raw.includes('index')) return null

  if (OPERATION_KEYS.contextSearch.some((token) => raw.includes(token))) return 'contextSearch'
  if (OPERATION_KEYS.configSearch.some((token) => raw.includes(token))) return 'configSearch'
  if (OPERATION_KEYS.indexSearch.some((token) => raw.includes(token))) return 'indexSearch'

  return raw.includes('search') ? 'indexSearch' : null
}

function extractLatencyMs(entry = {}) {
  const direct = pickFirstNumber(entry, [
    'latency_ms',
    'duration_ms',
    'elapsed_ms',
    'took_ms',
    'latencyMs',
    'durationMs',
    'elapsedMs',
    'tookMs',
  ])
  if (direct !== null) return direct

  const fromMetrics = pickFirstNumber(entry.metrics || {}, [
    'latency_ms',
    'duration_ms',
    'elapsed_ms',
    'p95_ms',
    'p50_ms',
  ])
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!requireUserSession(req, res)) return

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

        return {
          operation,
          latencyMs,
          ts,
          id: entry.request_id || entry.run_id || null,
        }
      })
      .filter(Boolean)
      .filter((entry) => now - entry.ts <= 24 * 60 * 60 * 1000)

    const grouped = {
      contextSearch: [],
      configSearch: [],
      indexSearch: [],
    }

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

    const payload = {
      source: 'LOCAL_LOGS',
      ts: now,
      files: {
        eventsFile,
      },
      thresholds: {
        warningMs: warnMs,
        criticalMs,
      },
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
    }

    return jsonResponse(res, 200, payload)
  } catch (error) {
    console.error('[api/monitoring/search-index-efficiency] error:', error.message)
    return jsonResponse(res, 200, {
      source: 'LOCAL_LOGS',
      ts: Date.now(),
      thresholds: {
        warningMs: Number(process.env.SEARCH_INDEX_WARN_MS || 400),
        criticalMs: Number(process.env.SEARCH_INDEX_CRITICAL_MS || 1200),
      },
      summary: {
        requestCount: 0,
        p50LatencyMs: null,
        p95LatencyMs: null,
        slowQueryCount: 0,
        status: 'no_data',
      },
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
