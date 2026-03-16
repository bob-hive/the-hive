import crypto from 'node:crypto'
import process from 'node:process'

const DEFAULT_DEDUPE_WINDOW_MS = Number.parseInt(process.env.HIVE_ALERT_DEDUPE_WINDOW_MS || '300000', 10)

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

export function scoreConfidence(input, { duplicateInWindow = false } = {}) {
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

  return clamp(base + actionableBoost - transientPenalty - duplicatePenalty)
}

export function classifyLane(input, { duplicateInWindow = false } = {}) {
  const severity = normalizeSeverity(input.severity)
  const confidence = scoreConfidence(input, { duplicateInWindow })
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

  return { lane: 'noise', confidence, reason: 'low_confidence_or_transient' }
}

export function isDuplicateWithinWindow(alerts, fingerprint, nowTs = Date.now(), dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS) {
  return alerts.some((alert) => {
    if (alert.fingerprint !== fingerprint) return false
    const ageMs = nowTs - Number(alert.ts || 0)
    return ageMs >= 0 && ageMs <= dedupeWindowMs
  })
}

export function getDedupeWindowMs() {
  return DEFAULT_DEDUPE_WINDOW_MS
}
