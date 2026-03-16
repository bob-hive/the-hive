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
import { dispatchEscalation, getEscalationDispatchMode } from './escalation-dispatch.js'

const STORE_VERSION = 2
const DEFAULT_BASE_DIR = process.env.VERCEL
  ? '/tmp/the-hive-alerts'
  : path.join(process.cwd(), 'data', 'alerts')

const BASE_DIR = process.env.HIVE_ALERTS_DIR || DEFAULT_BASE_DIR
const SNAPSHOT_FILE = path.join(BASE_DIR, 'alerts.json')
const EVENTS_FILE = path.join(BASE_DIR, 'alerts.events.jsonl')

const ESCALATION_OPEN_STATES = new Set(['pending', 'dispatched', 'acknowledged', 'failed'])

let inMemorySnapshot = createEmptySnapshot()
let writeQueue = Promise.resolve()

function createEmptySnapshot() {
  return {
    version: STORE_VERSION,
    updatedAt: null,
    alerts: [],
    escalations: [],
  }
}

function normalizeSnapshot(parsed) {
  if (!parsed || !Array.isArray(parsed.alerts)) {
    throw new Error('invalid alert store format')
  }

  return {
    version: Number(parsed.version) || STORE_VERSION,
    updatedAt: parsed.updatedAt || null,
    alerts: parsed.alerts,
    escalations: Array.isArray(parsed.escalations) ? parsed.escalations : [],
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

function normalizeEscalationState(input) {
  const value = String(input || '').toLowerCase()
  if (['pending', 'dispatched', 'acknowledged', 'resolved', 'failed'].includes(value)) return value
  return null
}

function isEscalationOpen(state) {
  return ESCALATION_OPEN_STATES.has(String(state || '').toLowerCase())
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
          activeEscalationId: null,
          activeEscalationState: null,
          lastTransitionAt: null,
        }
  }

  return {
    escalated: true,
    reason: policy.reason,
    target: policy.target,
    at: existingEscalation?.at || atIso,
    activeEscalationId: existingEscalation?.activeEscalationId || null,
    activeEscalationState: existingEscalation?.activeEscalationState || null,
    lastTransitionAt: existingEscalation?.lastTransitionAt || atIso,
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

function createEscalationRecord(alert, policy, atIso, actor = 'system') {
  return {
    id: uid('esc'),
    alertId: alert.id,
    state: 'pending',
    target: policy.target,
    reason: policy.reason,
    ownership: policy.target,
    createdAt: atIso,
    updatedAt: atIso,
    dispatchedAt: null,
    acknowledgedAt: null,
    resolvedAt: null,
    failedAt: null,
    dispatch: {
      mode: getEscalationDispatchMode(),
      attempts: [],
      lastError: null,
      payload: null,
      destination: null,
      result: null,
      queueRecord: null,
    },
    transitions: [
      {
        ts: atIso,
        from: null,
        to: 'pending',
        actor,
        reason: 'policy_triggered',
      },
    ],
  }
}

function applyEscalationTransition(escalation, { to, actor = 'system', reason = '' }, tsIso) {
  const from = escalation.state
  const transitions = [
    ...(Array.isArray(escalation.transitions) ? escalation.transitions : []),
    {
      ts: tsIso,
      from,
      to,
      actor,
      reason,
    },
  ]

  return {
    ...escalation,
    state: to,
    updatedAt: tsIso,
    dispatchedAt: to === 'dispatched' ? tsIso : escalation.dispatchedAt,
    acknowledgedAt: to === 'acknowledged' ? tsIso : escalation.acknowledgedAt,
    resolvedAt: to === 'resolved' ? tsIso : escalation.resolvedAt,
    failedAt: to === 'failed' ? tsIso : escalation.failedAt,
    transitions,
  }
}

function syncAlertEscalation(alert, escalation, stamp) {
  if (!alert) return alert

  return {
    ...alert,
    updatedAt: stamp,
    escalation: {
      ...(alert.escalation || {}),
      escalated: true,
      reason: escalation.reason,
      target: escalation.target,
      at: alert.escalation?.at || escalation.createdAt || stamp,
      activeEscalationId: escalation.id,
      activeEscalationState: escalation.state,
      lastTransitionAt: stamp,
    },
  }
}

async function ensureStoreDir() {
  await fs.mkdir(BASE_DIR, { recursive: true })
}

async function readSnapshotFromDisk() {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return normalizeSnapshot(parsed)
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

async function dispatchPendingEscalation({ snapshot, escalation, alert, reason = 'policy_dispatch' }) {
  const ts = nowIso()
  const attempt = {
    id: uid('disp'),
    ts,
    mode: getEscalationDispatchMode(),
    status: 'pending',
    target: escalation.target,
  }

  let nextEscalation = escalation
  try {
    const dispatchResult = await dispatchEscalation(escalation, alert)

    attempt.status = 'success'
    attempt.destination = dispatchResult.destination
    attempt.payload = dispatchResult.payload
    attempt.result = dispatchResult.result

    nextEscalation = applyEscalationTransition(escalation, {
      to: 'dispatched',
      actor: 'system',
      reason,
    }, ts)

    nextEscalation = {
      ...nextEscalation,
      dispatch: {
        ...(nextEscalation.dispatch || {}),
        mode: dispatchResult.mode,
        destination: dispatchResult.destination,
        payload: dispatchResult.payload,
        result: dispatchResult.result,
        queueRecord: dispatchResult.payload?.queueRecord || nextEscalation.dispatch?.queueRecord || null,
        lastError: null,
        attempts: [...(nextEscalation.dispatch?.attempts || []), attempt],
      },
    }
  } catch (error) {
    attempt.status = 'failed'
    attempt.error = error.message || 'dispatch_failed'

    nextEscalation = applyEscalationTransition(escalation, {
      to: 'failed',
      actor: 'system',
      reason: `dispatch_failed:${attempt.error}`,
    }, ts)

    nextEscalation = {
      ...nextEscalation,
      dispatch: {
        ...(nextEscalation.dispatch || {}),
        lastError: attempt.error,
        attempts: [...(nextEscalation.dispatch?.attempts || []), attempt],
      },
    }
  }

  const nextEscalations = snapshot.escalations.map((entry) => (entry.id === escalation.id ? nextEscalation : entry))
  const nextAlerts = snapshot.alerts.map((entry) => {
    if (entry.id !== alert.id) return entry
    return syncAlertEscalation(entry, nextEscalation, ts)
  })

  await appendEvent({
    eventType: 'escalation_dispatch',
    eventTs: ts,
    escalationId: escalation.id,
    alertId: alert.id,
    state: nextEscalation.state,
    target: nextEscalation.target,
    reason,
    dispatch: {
      mode: attempt.mode,
      status: attempt.status,
      destination: attempt.destination || null,
      error: attempt.error || null,
    },
  })

  return {
    ...snapshot,
    updatedAt: ts,
    alerts: nextAlerts,
    escalations: nextEscalations,
  }
}

async function ensureEscalationForAlert(snapshot, alert, escalationPolicy, { actor = 'system' } = {}) {
  if (!escalationPolicy?.shouldEscalate) return snapshot

  const existingOpen = snapshot.escalations.find((entry) => {
    if (entry.alertId !== alert.id) return false
    if (entry.target !== escalationPolicy.target) return false
    if (entry.reason !== escalationPolicy.reason) return false
    return isEscalationOpen(entry.state)
  })

  if (existingOpen) {
    return snapshot
  }

  const stamp = nowIso()
  const created = createEscalationRecord(alert, escalationPolicy, stamp, actor)
  let nextSnapshot = {
    ...snapshot,
    updatedAt: stamp,
    escalations: [created, ...snapshot.escalations],
    alerts: snapshot.alerts.map((entry) => {
      if (entry.id !== alert.id) return entry
      return syncAlertEscalation(entry, created, stamp)
    }),
  }

  await appendEvent({
    eventType: 'escalation_created',
    eventTs: stamp,
    escalationId: created.id,
    alertId: alert.id,
    target: created.target,
    reason: created.reason,
    state: created.state,
    actor,
  })

  nextSnapshot = await dispatchPendingEscalation({
    snapshot: nextSnapshot,
    escalation: created,
    alert,
    reason: 'policy_dispatch',
  })

  return nextSnapshot
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

export async function listEscalations({ state, target, openOnly = false, limit = 200 } = {}) {
  let snapshot

  try {
    snapshot = await readSnapshotFromDisk()
    inMemorySnapshot = snapshot
  } catch (error) {
    console.warn('[alerts-store] listEscalations disk read failed, serving in-memory snapshot:', error.message)
    snapshot = inMemorySnapshot
  }

  const stateFilter = normalizeEscalationState(state)
  const targetFilter = target ? String(target).toLowerCase() : null

  const enriched = snapshot.escalations.map((entry) => {
    const alert = snapshot.alerts.find((alertItem) => alertItem.id === entry.alertId) || null
    return {
      ...entry,
      alert: alert
        ? {
            id: alert.id,
            severity: alert.severity,
            source: alert.source,
            title: alert.title || alert.message,
            ts: alert.ts,
            status: alert.status,
          }
        : null,
    }
  })

  const escalations = enriched
    .filter((entry) => {
      if (stateFilter && entry.state !== stateFilter) return false
      if (targetFilter && entry.target !== targetFilter) return false
      if (openOnly && entry.state === 'resolved') return false
      return true
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, Math.max(1, Math.min(Number(limit) || 200, 1000)))

  return {
    escalations,
    updatedAt: snapshot.updatedAt,
    source: process.env.VERCEL ? 'LIVE_TMP' : 'LIVE_LOCAL',
    dispatchMode: getEscalationDispatchMode(),
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

        let next = {
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

        next = await ensureEscalationForAlert(next, updatedAlert, escalationPolicy)
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

    let next = {
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

    next = await ensureEscalationForAlert(next, alert, escalationPolicy)
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

    let next = {
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

    next = await ensureEscalationForAlert(next, updatedAlert, escalationPolicy, {
      actor: attempt.actor || 'system',
    })

    return next
  }).then((snapshot) => {
    const alert = snapshot.alerts.find((entry) => entry.id === id)
    return { alert, updatedAt: snapshot.updatedAt }
  })
}

function parseEscalationActor(actorInput) {
  const actor = String(actorInput || '').trim()
  return actor || 'system'
}

export async function ackEscalation(escalationId, { actor = 'system', reason = 'acknowledged' } = {}) {
  const id = String(escalationId || '').trim()
  if (!id) throw new Error('escalation id is required')

  return withSnapshotMutate(async (snapshot) => {
    const index = snapshot.escalations.findIndex((entry) => entry.id === id)
    if (index < 0) {
      const error = new Error('Escalation not found')
      error.code = 'ESCALATION_NOT_FOUND'
      throw error
    }

    const current = snapshot.escalations[index]
    if (current.state === 'resolved') {
      const error = new Error('Resolved escalation cannot be acknowledged')
      error.code = 'ESCALATION_INVALID_STATE'
      throw error
    }

    const stamp = nowIso()
    const updated = applyEscalationTransition(current, {
      to: 'acknowledged',
      actor: parseEscalationActor(actor),
      reason: String(reason || 'acknowledged').trim(),
    }, stamp)

    const nextEscalations = [...snapshot.escalations]
    nextEscalations[index] = updated

    const nextAlerts = snapshot.alerts.map((entry) => {
      if (entry.id !== updated.alertId) return entry
      const ackedStatus = entry.status === 'resolved' ? 'resolved' : 'acked'
      return {
        ...syncAlertEscalation(entry, updated, stamp),
        status: ackedStatus,
      }
    })

    await appendEvent({
      eventType: 'escalation_transition',
      eventTs: stamp,
      escalationId: updated.id,
      alertId: updated.alertId,
      from: current.state,
      to: updated.state,
      actor: parseEscalationActor(actor),
      reason,
    })

    return {
      ...snapshot,
      updatedAt: stamp,
      alerts: nextAlerts,
      escalations: nextEscalations,
    }
  }).then((snapshot) => {
    const escalation = snapshot.escalations.find((entry) => entry.id === id) || null
    return { escalation, updatedAt: snapshot.updatedAt }
  })
}

export async function resolveEscalationById(escalationId, { actor = 'system', reason = 'resolved' } = {}) {
  const id = String(escalationId || '').trim()
  if (!id) throw new Error('escalation id is required')

  return withSnapshotMutate(async (snapshot) => {
    const index = snapshot.escalations.findIndex((entry) => entry.id === id)
    if (index < 0) {
      const error = new Error('Escalation not found')
      error.code = 'ESCALATION_NOT_FOUND'
      throw error
    }

    const current = snapshot.escalations[index]
    if (current.state === 'resolved') {
      return snapshot
    }

    const stamp = nowIso()
    const updated = applyEscalationTransition(current, {
      to: 'resolved',
      actor: parseEscalationActor(actor),
      reason: String(reason || 'resolved').trim(),
    }, stamp)

    const nextEscalations = [...snapshot.escalations]
    nextEscalations[index] = updated

    const nextAlerts = snapshot.alerts.map((entry) => {
      if (entry.id !== updated.alertId) return entry

      return {
        ...syncAlertEscalation(entry, updated, stamp),
        status: 'resolved',
      }
    })

    await appendEvent({
      eventType: 'escalation_transition',
      eventTs: stamp,
      escalationId: updated.id,
      alertId: updated.alertId,
      from: current.state,
      to: updated.state,
      actor: parseEscalationActor(actor),
      reason,
    })

    return {
      ...snapshot,
      updatedAt: stamp,
      alerts: nextAlerts,
      escalations: nextEscalations,
    }
  }).then((snapshot) => {
    const escalation = snapshot.escalations.find((entry) => entry.id === id) || null
    return { escalation, updatedAt: snapshot.updatedAt }
  })
}

export async function retryEscalation(escalationId, { actor = 'system', reason = 'manual_retry' } = {}) {
  const id = String(escalationId || '').trim()
  if (!id) throw new Error('escalation id is required')

  return withSnapshotMutate(async (snapshot) => {
    const index = snapshot.escalations.findIndex((entry) => entry.id === id)
    if (index < 0) {
      const error = new Error('Escalation not found')
      error.code = 'ESCALATION_NOT_FOUND'
      throw error
    }

    const current = snapshot.escalations[index]
    if (current.state !== 'failed') {
      const error = new Error('Only failed escalations can be retried')
      error.code = 'ESCALATION_INVALID_STATE'
      throw error
    }

    const alert = snapshot.alerts.find((entry) => entry.id === current.alertId)
    if (!alert) {
      const error = new Error('Escalation alert context missing')
      error.code = 'ESCALATION_ALERT_MISSING'
      throw error
    }

    const stamp = nowIso()
    const pending = applyEscalationTransition(current, {
      to: 'pending',
      actor: parseEscalationActor(actor),
      reason: String(reason || 'manual_retry').trim(),
    }, stamp)

    let nextSnapshot = {
      ...snapshot,
      updatedAt: stamp,
      alerts: snapshot.alerts.map((entry) => {
        if (entry.id !== alert.id) return entry
        return syncAlertEscalation(entry, pending, stamp)
      }),
      escalations: snapshot.escalations.map((entry) => (entry.id === current.id ? pending : entry)),
    }

    await appendEvent({
      eventType: 'escalation_transition',
      eventTs: stamp,
      escalationId: pending.id,
      alertId: pending.alertId,
      from: current.state,
      to: pending.state,
      actor: parseEscalationActor(actor),
      reason,
    })

    nextSnapshot = await dispatchPendingEscalation({
      snapshot: nextSnapshot,
      escalation: pending,
      alert,
      reason: 'manual_retry_dispatch',
    })

    return nextSnapshot
  }).then((snapshot) => {
    const escalation = snapshot.escalations.find((entry) => entry.id === id) || null
    return { escalation, updatedAt: snapshot.updatedAt }
  })
}

export function alertStoreInfo() {
  return {
    baseDir: BASE_DIR,
    snapshotFile: SNAPSHOT_FILE,
    eventsFile: EVENTS_FILE,
    dedupeWindowMs: getDedupeWindowMs(),
    suppressWindowMs: getSuppressWindowMs(),
    dispatchMode: getEscalationDispatchMode(),
    durability: process.env.VERCEL
      ? 'ephemeral_file_store_/tmp (serverless-safe but not durable)'
      : 'local_file_store',
  }
}
