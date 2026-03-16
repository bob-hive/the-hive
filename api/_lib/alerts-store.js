import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import {
  classifyLane,
  computeFingerprint,
  getDedupeWindowMs,
  isDuplicateWithinWindow,
} from './alerts-classifier.js'

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

    const duplicateInWindow = isDuplicateWithinWindow(snapshot.alerts, fingerprint, ts, getDedupeWindowMs())
    const classification = classifyLane({ severity, title, message, confidence: input.confidence }, { duplicateInWindow })

    const alert = {
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
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }

    const next = {
      ...snapshot,
      updatedAt: nowIso(),
      alerts: [alert, ...snapshot.alerts],
    }

    await appendEvent({
      eventType: 'ingest',
      eventTs: nowIso(),
      requestMeta: meta,
      alert,
    })

    return next
  }).then((snapshot) => ({
    alert: snapshot.alerts[0],
    updatedAt: snapshot.updatedAt,
  }))
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
    const updatedAlert = {
      ...current,
      status: normalizeStatus(attemptInput.status || current.status),
      remediationAttempts: [...(current.remediationAttempts || []), attempt],
      updatedAt: nowIso(),
    }

    nextAlerts[index] = updatedAlert

    const next = {
      ...snapshot,
      updatedAt: nowIso(),
      alerts: nextAlerts,
    }

    await appendEvent({
      eventType: 'remediation',
      eventTs: nowIso(),
      requestMeta: meta,
      alertId: id,
      remediationAttempt: attempt,
      status: updatedAlert.status,
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
    durability: process.env.VERCEL
      ? 'ephemeral_file_store_/tmp (serverless-safe but not durable)'
      : 'local_file_store',
  }
}
