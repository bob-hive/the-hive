import crypto from 'node:crypto'
import process from 'node:process'

const DEFAULT_DEDUPE_WINDOW_MS = Number.parseInt(process.env.HIVE_ALERT_DEDUPE_WINDOW_MS || '300000', 10)
const DEFAULT_SUPPRESS_WINDOW_MS = Number.parseInt(process.env.HIVE_ALERT_SUPPRESS_WINDOW_MS || '900000', 10) // 15 min

const SEVERITY_SCORE = {
  critical: 0.95,
  high: 0.8,
  warning: 0.6,
  medium: 0.5,
  low: 0.32,
  info: 0.25,
}

const ACTIONABLE_KEYWORDS = [
  'error',
  'failed',
  'fail',
  'down',
  'timeout',
  'oom',
  'memory',
  'disk',
  'latency',
  'unavailable',
  'panic',
  'incident',
]

const TRANSIENT_KEYWORDS = [
  'retry',
  'transient',
  'flaky',
  'temporary',
  'recover',
  'rate limit',
  'throttled',
]

// SLO-based scoring: user-facing services get a confidence boost
// TODO(P1): make this configurable via env or config file
const SLO_HIGH_PRIORITY_SOURCES = new Set([
  'api',
  'web',
  'frontend',
  'gateway',
  'auth',
  'payments',
  'checkout',
  'cdn',
  'load-balancer',
  'dns',
  'database',
  'production',
])

const SLO_BOOST = 0.1
const REPEAT_PATTERN_THRESHOLD = 3
const REPEAT_PATTERN_WINDOW_MS = 3600000 // 1 hour
const REPEAT_PATTERN_BOOST = 0.15
const TIME_DECAY_START_MS = 1800000 // 30 min — after this unresolved alerts get urgency boost
const TIME_DECAY_MAX_BOOST = 0.12

function clamp(num, min = 0, max = 1) {
  return Math.max(min, Math.min(max, num))
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeSeverity(severity) {
  const value = String(severity || 'warning').toLowerCase()
  if (SEVERITY_SCORE[value] !== undefined) return value
  return 'warning'
}

export function computeFingerprint(input) {
  const raw = [
    normalizeText(input.source).toLowerCase(),
    normalizeSeverity(input.severity),
    normalizeText(input.title || input.message).toLowerCase(),
    normalizeText(input.projectTags?.join('|')).toLowerCase(),
    normalizeText(input.agentTags?.join('|')).toLowerCase(),
  ].join('::')

  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

function keywordHitScore(text, words) {
  const normalized = text.toLowerCase()
  return words.some((word) => normalized.includes(word)) ? 0.12 : 0
}

/**
 * Check if source matches a user-facing/SLO-critical service.
 */
function isSloSource(source) {
  if (!source) return false
  const normalized = source.toLowerCase()
  for (const sloSource of SLO_HIGH_PRIORITY_SOURCES) {
    if (normalized.includes(sloSource)) return true
  }
  return false
}

/**
 * Count occurrences of a fingerprint in the last windowMs (for repeat-pattern detection).
 * Only counts open/unresolved alerts.
 */
export function countRecentFingerprints(alerts, fingerprint, nowTs = Date.now(), windowMs = REPEAT_PATTERN_WINDOW_MS) {
  let count = 0
  for (const alert of alerts) {
    if (alert.fingerprint !== fingerprint) continue
    const ageMs = nowTs - Number(alert.ts || 0)
    if (ageMs >= 0 && ageMs <= windowMs) {
      count += 1 + Number(alert.suppressedCount || 0)
    }
  }
  return count
}

/**
 * Compute time-decay urgency boost for an unresolved alert fingerprint.
 * Older unresolved alerts get a linearly increasing boost up to TIME_DECAY_MAX_BOOST.
 */
export function computeTimeDecayBoost(alerts, fingerprint, nowTs = Date.now()) {
  // Find the oldest unresolved alert with this fingerprint
  let oldestTs = null
  for (const alert of alerts) {
    if (alert.fingerprint !== fingerprint) continue
    if (alert.status === 'resolved') continue
    const ts = Number(alert.ts || 0)
    if (oldestTs === null || ts < oldestTs) oldestTs = ts
  }
  if (oldestTs === null) return 0
  const ageMs = nowTs - oldestTs
  if (ageMs < TIME_DECAY_START_MS) return 0
  // Linear ramp from 0 to TIME_DECAY_MAX_BOOST over 2 hours past start
  const rampMs = 7200000 // 2 hours
  const ratio = Math.min((ageMs - TIME_DECAY_START_MS) / rampMs, 1)
  return ratio * TIME_DECAY_MAX_BOOST
}

export function scoreConfidence(input, { duplicateInWindow = false, alerts = [] } = {}) {
  const severity = normalizeSeverity(input.severity)
  const text = `${normalizeText(input.title)} ${normalizeText(input.message)}`.trim()

  const explicitConfidence = Number(input.confidence)
  if (Number.isFinite(explicitConfidence) && explicitConfidence >= 0 && explicitConfidence <= 1) {
    return clamp(explicitConfidence)
  }

  const base = SEVERITY_SCORE[severity] ?? 0.5
  const actionableBoost = keywordHitScore(text, ACTIONABLE_KEYWORDS)
  const transientPenalty = keywordHitScore(text, TRANSIENT_KEYWORDS)
  const duplicatePenalty = duplicateInWindow ? 0.22 : 0

  // P0.2: SLO-based boost
  const sloBoost = isSloSource(input.source) ? SLO_BOOST : 0

  // P0.2: Repeat-pattern boost (same fingerprint 3+ times in 1h)
  const fingerprint = input._fingerprint || null
  let repeatBoost = 0
  if (fingerprint && alerts.length > 0) {
    const recentCount = countRecentFingerprints(alerts, fingerprint, Number(input._ts) || Date.now())
    if (recentCount >= REPEAT_PATTERN_THRESHOLD) {
      repeatBoost = REPEAT_PATTERN_BOOST
    }
  }

  // P0.2: Time-decay urgency boost
  let timeDecayBoost = 0
  if (fingerprint && alerts.length > 0) {
    timeDecayBoost = computeTimeDecayBoost(alerts, fingerprint, Number(input._ts) || Date.now())
  }

  return clamp(base + actionableBoost - transientPenalty - duplicatePenalty + sloBoost + repeatBoost + timeDecayBoost)
}

export function classifyLane(input, { duplicateInWindow = false, alerts = [] } = {}) {
  const severity = normalizeSeverity(input.severity)
  const confidence = scoreConfidence(input, { duplicateInWindow, alerts })
  const hasActionableContent = keywordHitScore(`${input.title || ''} ${input.message || ''}`, ACTIONABLE_KEYWORDS) > 0

  if (duplicateInWindow) {
    return { lane: 'noise', confidence, reason: 'duplicate_within_dedupe_window' }
  }

  if (severity === 'critical') {
    return { lane: 'signal', confidence, reason: 'critical_severity' }
  }

  if ((severity === 'high' || severity === 'warning') && confidence >= 0.72 && hasActionableContent) {
    return { lane: 'signal', confidence, reason: 'high_confidence_actionable' }
  }

  // P0.2: Repeat-pattern auto-promote to signal
  const fingerprint = input._fingerprint || null
  if (fingerprint && alerts.length > 0) {
    const recentCount = countRecentFingerprints(alerts, fingerprint, Number(input._ts) || Date.now())
    if (recentCount >= REPEAT_PATTERN_THRESHOLD) {
      return { lane: 'signal', confidence, reason: 'repeat_pattern_auto_promote' }
    }
  }

  return { lane: 'noise', confidence, reason: 'low_confidence_or_transient' }
}

export function isDuplicateWithinWindow(alerts, fingerprint, nowTs = Date.now(), dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS) {
  return alerts.some((alert) => {
    if (alert.fingerprint !== fingerprint) return false
    const ageMs = nowTs - Number(alert.ts || 0)
    return ageMs >= 0 && ageMs <= dedupeWindowMs
  })
}

/**
 * P0.2: Check if an alert fingerprint is within the suppression window.
 * Returns the existing alert to suppress into, or null if no suppression.
 */
export function findSuppressTarget(alerts, fingerprint, nowTs = Date.now(), suppressWindowMs = DEFAULT_SUPPRESS_WINDOW_MS) {
  for (const alert of alerts) {
    if (alert.fingerprint !== fingerprint) continue
    if (alert.status === 'resolved') continue
    const ageMs = nowTs - Number(alert.ts || 0)
    if (ageMs >= 0 && ageMs <= suppressWindowMs) return alert
  }
  return null
}

export function getDedupeWindowMs() {
  return DEFAULT_DEDUPE_WINDOW_MS
}

export function getSuppressWindowMs() {
  return DEFAULT_SUPPRESS_WINDOW_MS
}
