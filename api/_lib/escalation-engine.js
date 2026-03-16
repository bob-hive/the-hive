const ESCALATION_WINDOW_MS = 3600000 // 1h
const FINGERPRINT_STALE_UNRESOLVED_MS = 1800000 // 30m

function normalizeSeverity(value) {
  return String(value || '').toLowerCase()
}

function isUnresolved(alert) {
  return String(alert?.status || 'open').toLowerCase() !== 'resolved'
}

function countSignalAlertsBySource(alerts, source, nowTs = Date.now()) {
  if (!source) return 0
  const normalizedSource = String(source).toLowerCase()

  let count = 0
  for (const alert of alerts) {
    if (String(alert.source || '').toLowerCase() !== normalizedSource) continue
    if (alert.lane !== 'signal') continue
    const ageMs = nowTs - Number(alert.ts || 0)
    if (ageMs >= 0 && ageMs <= ESCALATION_WINDOW_MS) {
      count += 1 + Number(alert.suppressedCount || 0)
    }
  }

  return count
}

function hasUnresolvedFingerprintOlderThan(alerts, fingerprint, thresholdMs, nowTs = Date.now()) {
  for (const alert of alerts) {
    if (alert.fingerprint !== fingerprint) continue
    if (!isUnresolved(alert)) continue

    const ageMs = nowTs - Number(alert.ts || 0)
    if (ageMs > thresholdMs) return true
  }

  return false
}

function countFailedRemediationAttempts(alert) {
  const attempts = Array.isArray(alert?.remediationAttempts) ? alert.remediationAttempts : []
  return attempts.reduce((sum, attempt) => {
    const explicitFailure = attempt?.success === false
    const outcomeFailure = String(attempt?.outcome || '').toLowerCase().includes('fail')
    return sum + (explicitFailure || outcomeFailure ? 1 : 0)
  }, 0)
}

/**
 * Evaluate escalation policy for a candidate alert.
 *
 * Returns:
 * { shouldEscalate: boolean, reason: string, target: 'bob'|'ani' }
 */
export function evaluateEscalation(candidateAlert, { alerts = [], nowTs = Date.now() } = {}) {
  const severity = normalizeSeverity(candidateAlert?.severity)
  const lane = String(candidateAlert?.lane || '').toLowerCase()

  if (severity === 'critical' && lane === 'signal') {
    return {
      shouldEscalate: true,
      reason: 'critical_signal_immediate',
      target: 'ani',
    }
  }

  if (
    candidateAlert?.fingerprint
    && hasUnresolvedFingerprintOlderThan(alerts, candidateAlert.fingerprint, FINGERPRINT_STALE_UNRESOLVED_MS, nowTs)
  ) {
    return {
      shouldEscalate: true,
      reason: 'fingerprint_unresolved_over_30m',
      target: 'ani',
    }
  }

  let signalFromSource = countSignalAlertsBySource(alerts, candidateAlert?.source, nowTs)
  const alreadyCounted = candidateAlert?.id
    && alerts.some((alert) => alert.id === candidateAlert.id)

  if (candidateAlert?.lane === 'signal' && !alreadyCounted) {
    signalFromSource += 1
  }

  if (signalFromSource >= 3) {
    return {
      shouldEscalate: true,
      reason: 'source_signal_burst_3_in_1h',
      target: 'ani',
    }
  }

  if (countFailedRemediationAttempts(candidateAlert) >= 2) {
    return {
      shouldEscalate: true,
      reason: 'remediation_failed_2plus',
      target: 'ani',
    }
  }

  return {
    shouldEscalate: false,
    reason: '',
    target: 'bob',
  }
}

// TODO(P1): make escalation targets/rules configurable per team/service via policy config.
