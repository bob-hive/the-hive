import process from 'node:process'
import { corsHeaders, jsonResponse, requireUserSession } from '../_lib/auth.js'
import {
  firstExistingPath,
  parseTimestamp,
  readJsonSafe,
  readJsonlSafe,
  resolveWorkspaceLogPaths,
} from '../_lib/monitoring-observability.js'

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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!requireUserSession(req, res)) return

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

    const consecutiveDual = Number(
      state.consecutive_dual_overlimit ||
      state.observed_consecutive_dual_overlimit ||
      0
    )

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
        status: providerStatus({
          failure: lastAlert?.primary_failure,
          overLimit: lastAlert?.primary_failure?.over_limit,
          hasAlert: recentAlertActive,
        }),
        reason: lastAlert?.primary_failure?.error || null,
      },
      secondary: {
        name: secondary,
        status: providerStatus({
          failure: lastAlert?.secondary_failure,
          overLimit: lastAlert?.secondary_failure?.over_limit,
          hasAlert: recentAlertActive,
        }),
        reason: lastAlert?.secondary_failure?.error || null,
      },
      emergency: {
        name: emergency,
        status: emergency
          ? (activeProvider === emergency ? 'active' : 'standby')
          : 'not_configured',
        reason: null,
      },
    }

    const payload = {
      source: 'LOCAL_LOGS',
      ts: Date.now(),
      files: {
        stateFile,
        alertsFile,
      },
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
            reason:
              lastAlert?.recommended_action ||
              'Primary and secondary providers exhausted',
            requestId: lastAlert?.request_id || null,
            query: lastAlert?.query || null,
          }
        : null,
      noData: !lastAlert && consecutiveDual === 0,
    }

    return jsonResponse(res, 200, payload)
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
      dualExhaustion: {
        critical: false,
        threshold: Number(process.env.ALERT_CONSECUTIVE_OVERLIMIT || 1),
        consecutiveDualOverlimit: 0,
      },
      lastAlert: null,
      noData: true,
      error: error.message,
    })
  }
}
