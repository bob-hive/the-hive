import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import {
  classifyLane,
  computeFingerprint,
  getDedupeWindowMs,
  getSuppressWindowMs,
  isDuplicateWithinWindow,
  findSuppressTarget,
} from './alerts-classifier.js'
import { evaluateEscalation } from './escalation-engine.js'

const STORE_VERSION = 1
const DEFAULT_BASE_DIR = process.env.VERCEL
  ? '/tmp/the-hive-alerts'
  : path.join(process.cwd(), 'data', 'alerts')

const BASE_DIR = process.env.HIVE_ALERTS_DIR || DEFAULT_BASE_DIR
const SNAPSHOT_FILE = path.join(BASE_DIR, 'alerts.json')
const EVENTS_FILE = path.join(BASE_DIR, 'alerts.events.jsonl')

let inMemorySnapshot = createEmptySnapshot()
let writeQueue = Promise.resolve()

function createEmptySnapshot() {
  return {
    version: STORE_VERSION,
    updatedAt: null,
    alerts: [],
  }
}

function nowIso() {
  return new Date().toISOString()
}

function uid(prefix = 'alrt') {
  const random = crypto.randomBytes(6).toString('hex')
  return `${prefix}_${Date.now().toString(36)}_${random}`
}

function normalizeArray(input) {
  if (!input) return []
  if (Array.isArray(input)) return input.map((v) => String(v).trim()).filter(Boolean)
  return [String(input).trim()].filter(Boolean)
}

function normalizeStatus(input) {
  const value = String(input || 'open').toLowerCase()
  if (value === 'open' || value === 'acked' || value === 'resolved') return value
  return 'open'
}

function normalizeSeverity(input) {
  const value = String(input || 'warning').toLowerCase()
  const valid = ['critical', 'high', 'warning', 'medium', 'low', 'info']
  if (valid.includes(value)) return value
  return 'warning'
}

function resolveEscalation(existingEscalation, policy, atIso) {
  if (!policy.shouldEscalate) {
    return existingEscalation && existingEscalation.escalated
      ? existingEscalation
      : {
          escalated: false,
          reason: '',
          target: 'bob',
          at: null,
        }
  }

  return {
    escalated: true,
    reason: policy.reason,
    target: policy.target,
    at: existingEscalation?.at || atIso,
  }
}

function summarizeSuppression(alerts) {
  const dedupedAlerts = alerts.filter((alert) => Number(alert.suppressedCount || 0) > 0)

  return {
    dedupedAlerts: dedupedAlerts.length,
    suppressedEvents: dedupedAlerts.reduce((sum, alert) => sum + Number(alert.suppressedCount || 0), 0),
    topFingerprints: dedupedAlerts
      .sort((a, b) => Number(b.suppressedCount || 0) - Number(a.suppressedCount || 0))
      .slice(0, 5)
      .map((alert) => ({
        fingerprint: alert.fingerprint,
        source: alert.source,
        title: alert.title || alert.message,
        suppressedCount: Number(alert.suppressedCount || 0),
      })),
  }
}

async function ensureStoreDir() {
  await fs.mkdir(BASE_DIR, { recursive: true })
}

async function readSnapshotFromDisk() {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.alerts)) throw new Error('invalid alert store format')
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return createEmptySnapshot()
    throw error
  }
}

async function writeSnapshotToDisk(snapshot) {
  await ensureStoreDir()
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf8')
}

async function appendEvent(event) {
  await ensureStoreDir()
  await fs.appendFile(EVENTS_FILE, `${JSON.stringify(event)}\n`, 'utf8')
}

function enqueueWrite(fn) {
  writeQueue = writeQueue.then(fn, fn)
  return writeQueue
}

async function withSnapshotMutate(mutator) {
  return enqueueWrite(async () => {
    let snapshot
    try {
      snapshot = await readSnapshotFromDisk()
      inMemorySnapshot = snapshot
    } catch (error) {
      console.warn('[alerts-store] disk read failed, falling back to in-memory snapshot:', error.message)
      snapshot = inMemorySnapshot
    }

    const next = await mutator(snapshot)
    inMemorySnapshot = next

    try {
      await writeSnapshotToDisk(next)
    } catch (error) {
      console.warn('[alerts-store] disk write failed (in-memory fallback active):', error.message)
      // TODO(P1): replace fallback with durable external storage (KV/Postgres/S3) for production reliability.
    }

    return next
  })
}

export async function listAlerts({ lane, openOnly = false, limit = 200 } = {}) {
  let snapshot

  try {
    snapshot = await readSnapshotFromDisk()
    inMemorySnapshot = snapshot
  } catch (error) {
    console.warn('[alerts-store] listAlerts disk read failed, serving in-memory snapshot:', error.message)
    snapshot = inMemorySnapshot
  }

  const laneFilter = lane ? String(lane).toLowerCase() : null

  const filtered = snapshot.alerts
    .filter((alert) => {
      if (laneFilter && alert.lane !== laneFilter) return false
      if (openOnly && alert.status !== 'open') return false
      return true
    })
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
    .slice(0, Math.max(1, Math.min(Number(limit) || 200, 1000)))

  return {
    alerts: filtered,
    updatedAt: snapshot.updatedAt,
    suppressionStats: summarizeSuppression(snapshot.alerts),
    mock: false,
    source: process.env.VERCEL ? 'LIVE_TMP' : 'LIVE_LOCAL',
  }
}

export async function ingestAlert(input, meta = {}) {
  const ts = Number(input.ts) || Date.now()
  const severity = normalizeSeverity(input.severity)
  const source = String(input.source || 'unknown').trim() || 'unknown'
  const title = String(input.title || '').trim()
  const message = String(input.message || '').trim()
  const projectTags = normalizeArray(input.projectTags || input.project)
  const agentTags = normalizeArray(input.agentTags || input.agent)
  const status = normalizeStatus(input.status || 'open')
  let selectedAlertId = null

  if (!title && !message) {
    throw new Error('title or message is required')
  }

  return withSnapshotMutate(async (snapshot) => {
    const fingerprint = String(input.fingerprint || computeFingerprint({
      source,
      severity,
      title,
      message,
      projectTags,
      agentTags,
    })).trim()

    const now = nowIso()

    // P0.2 suppression window check (per-fingerprint)
    const suppressTarget = findSuppressTarget(snapshot.alerts, fingerprint, ts, getSuppressWindowMs())

    if (suppressTarget) {
      const suppressIndex = snapshot.alerts.findIndex((alert) => alert.id === suppressTarget.id)

      if (suppressIndex >= 0) {
        const nextAlerts = [...snapshot.alerts]
        const current = nextAlerts[suppressIndex]

        const candidateClassifyInput = {
          severity,
          source,
          title: current.title || title,
          message: current.message || message,
          confidence: input.confidence,
          _fingerprint: fingerprint,
          _ts: ts,
        }

        const reclassification = classifyLane(candidateClassifyInput, {
          duplicateInWindow: false,
          alerts: snapshot.alerts,
        })

        const candidateAlert = {
          ...current,
          ts: Math.max(Number(current.ts || 0), ts),
          severity,
          source,
          title: current.title || title,
          message: current.message || message,
          lane: reclassification.lane,
          confidence: reclassification.confidence,
          status: normalizeStatus(input.status || current.status),
          remediationAttempts: Array.isArray(current.remediationAttempts) ? current.remediationAttempts : [],
        }

        const escalationPolicy = evaluateEscalation(candidateAlert, {
          alerts: snapshot.alerts,
          nowTs: ts,
        })

        const updatedAlert = {
          ...current,
          ts: Math.max(Number(current.ts || 0), ts),
          severity: severity || current.severity,
          lane: candidateAlert.lane,
          confidence: candidateAlert.confidence,
          classifyReason: reclassification.reason,
          status: candidateAlert.status,
          suppressedCount: Number(current.suppressedCount || 0) + 1,
          lastSuppressedAt: now,
          updatedAt: now,
          escalation: resolveEscalation(current.escalation, escalationPolicy, now),
        }

        nextAlerts[suppressIndex] = updatedAlert

        const next = {
          ...snapshot,
          updatedAt: now,
          alerts: nextAlerts,
        }

        selectedAlertId = updatedAlert.id

        await appendEvent({
          eventType: 'suppressed_ingest',
          eventTs: now,
          requestMeta: meta,
          fingerprint,
          alertId: updatedAlert.id,
          suppressedCount: updatedAlert.suppressedCount,
          escalation: updatedAlert.escalation,
        })

        return next
      }
    }

    const duplicateInWindow = isDuplicateWithinWindow(snapshot.alerts, fingerprint, ts, getDedupeWindowMs())
    const classifyInput = {
      severity,
      source,
      title,
      message,
      confidence: input.confidence,
      _fingerprint: fingerprint,
      _ts: ts,
    }
    const classification = classifyLane(classifyInput, {
      duplicateInWindow,
      alerts: snapshot.alerts,
    })

    const baseAlert = {
      id: String(input.id || uid()),
      ts,
      source,
      severity,
      title,
      message,
      fingerprint,
      confidence: classification.confidence,
      lane: classification.lane,
      status,
      projectTags,
      agentTags,
      remediationAttempts: Array.isArray(input.remediationAttempts) ? input.remediationAttempts : [],
      classifyReason: classification.reason,
      duplicateInWindow,
      suppressedCount: 0,
      lastSuppressedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    const escalationPolicy = evaluateEscalation(baseAlert, {
      alerts: snapshot.alerts,
      nowTs: ts,
    })

    const alert = {
      ...baseAlert,
      escalation: resolveEscalation(null, escalationPolicy, now),
    }

    const next = {
      ...snapshot,
      updatedAt: now,
      alerts: [alert, ...snapshot.alerts],
    }

    selectedAlertId = alert.id

    await appendEvent({
      eventType: 'ingest',
      eventTs: now,
      requestMeta: meta,
      alert,
    })

    return next
  }).then((snapshot) => {
    const alert = snapshot.alerts.find((entry) => entry.id === selectedAlertId) || snapshot.alerts[0] || null
    return {
      alert,
      updatedAt: snapshot.updatedAt,
    }
  })
}

export async function appendRemediationAttempt(alertId, attemptInput = {}, meta = {}) {
  const id = String(alertId || '').trim()
  if (!id) throw new Error('alert id is required')

  return withSnapshotMutate(async (snapshot) => {
    const index = snapshot.alerts.findIndex((alert) => alert.id === id)
    if (index < 0) {
      const error = new Error('Alert not found')
      error.code = 'ALERT_NOT_FOUND'
      throw error
    }

    const attempt = {
      id: uid('rem'),
      ts: Number(attemptInput.ts) || Date.now(),
      actor: String(attemptInput.actor || '').trim() || 'system',
      action: String(attemptInput.action || '').trim() || 'unknown_action',
      outcome: String(attemptInput.outcome || '').trim() || 'unknown',
      success: attemptInput.success === undefined ? null : Boolean(attemptInput.success),
      notes: String(attemptInput.notes || '').trim(),
      metadata: attemptInput.metadata && typeof attemptInput.metadata === 'object' ? attemptInput.metadata : {},
    }

    const nextAlerts = [...snapshot.alerts]
    const current = nextAlerts[index]

    const candidateAlert = {
      ...current,
      status: normalizeStatus(attemptInput.status || current.status),
      remediationAttempts: [...(current.remediationAttempts || []), attempt],
    }

    const escalationPolicy = evaluateEscalation(candidateAlert, {
      alerts: snapshot.alerts,
      nowTs: attempt.ts,
    })

    const stamp = nowIso()

    const updatedAlert = {
      ...candidateAlert,
      updatedAt: stamp,
      escalation: resolveEscalation(current.escalation, escalationPolicy, stamp),
    }

    nextAlerts[index] = updatedAlert

    const next = {
      ...snapshot,
      updatedAt: stamp,
      alerts: nextAlerts,
    }

    await appendEvent({
      eventType: 'remediation',
      eventTs: stamp,
      requestMeta: meta,
      alertId: id,
      remediationAttempt: attempt,
      status: updatedAlert.status,
      escalation: updatedAlert.escalation,
    })

    return next
  }).then((snapshot) => {
    const alert = snapshot.alerts.find((entry) => entry.id === id)
    return { alert, updatedAt: snapshot.updatedAt }
  })
}

export function alertStoreInfo() {
  return {
    baseDir: BASE_DIR,
    snapshotFile: SNAPSHOT_FILE,
    eventsFile: EVENTS_FILE,
    dedupeWindowMs: getDedupeWindowMs(),
    suppressWindowMs: getSuppressWindowMs(),
    durability: process.env.VERCEL
      ? 'ephemeral_file_store_/tmp (serverless-safe but not durable)'
      : 'local_file_store',
  }
}
