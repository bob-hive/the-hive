import crypto from 'node:crypto'
import process from 'node:process'

function nowIso() {
  return new Date().toISOString()
}

function normalizeDispatchMode() {
  const raw = String(process.env.HIVE_ESCALATION_DISPATCH_MODE || 'dry-run').trim().toLowerCase()
  if (raw === 'live') return 'live'
  return 'dry-run'
}

function buildAniMessage(escalation, alert) {
  const baseUrl = String(process.env.HIVE_DASHBOARD_URL || '').replace(/\/$/, '')
  const alertTitle = alert?.title || alert?.message || 'Untitled alert'
  const deepLink = baseUrl ? `${baseUrl}/?focusAlert=${encodeURIComponent(alert?.id || '')}` : ''

  const lines = [
    '🚨 Hive escalation',
    `Escalation: ${escalation.id}`,
    `Alert: ${alert?.id || 'unknown'}`,
    `Target: Ani`,
    `Reason: ${escalation.reason}`,
    `Severity: ${alert?.severity || 'unknown'}`,
    `Source: ${alert?.source || 'unknown'}`,
    `Title: ${alertTitle}`,
    deepLink ? `Dashboard: ${deepLink}` : null,
  ].filter(Boolean)

  return lines.join('\n')
}

function buildAniPayload(escalation, alert) {
  return {
    channel: process.env.HIVE_ESCALATION_TELEGRAM_CHANNEL || null,
    text: buildAniMessage(escalation, alert),
    escalationId: escalation.id,
    alertId: alert?.id || null,
    reason: escalation.reason,
    severity: alert?.severity || null,
    source: alert?.source || null,
    createdAt: escalation.createdAt,
  }
}

async function dispatchAniLive(payload) {
  const webhookUrl = String(process.env.HIVE_ESCALATION_TELEGRAM_WEBHOOK_URL || '').trim()
  if (!webhookUrl) {
    throw new Error('HIVE_ESCALATION_TELEGRAM_WEBHOOK_URL is required for live Ani dispatch')
  }

  const token = String(process.env.HIVE_ESCALATION_TELEGRAM_WEBHOOK_TOKEN || '').trim()

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Ani dispatch webhook failed (${response.status}): ${text || response.statusText}`)
  }

  return {
    provider: 'webhook',
    statusCode: response.status,
  }
}

async function dispatchBob(escalation, alert) {
  return {
    queueRecord: {
      id: `bobq_${crypto.randomBytes(5).toString('hex')}`,
      queue: 'bob-triage',
      owner: 'bob',
      alertId: alert?.id || null,
      escalationId: escalation.id,
      reason: escalation.reason,
      createdAt: nowIso(),
    },
  }
}

const adapters = {
  bob: async ({ escalation, alert }) => {
    const { queueRecord } = await dispatchBob(escalation, alert)
    return {
      destination: 'bob-triage-queue',
      payload: {
        queueRecord,
      },
    }
  },
  ani: async ({ escalation, alert, mode }) => {
    const payload = buildAniPayload(escalation, alert)

    if (mode === 'live') {
      const result = await dispatchAniLive(payload)
      return {
        destination: 'telegram-escalation-webhook',
        payload,
        result,
      }
    }

    return {
      destination: 'telegram-escalation-webhook',
      payload,
      result: {
        provider: 'dry-run',
      },
    }
  },
}

export function getEscalationDispatchMode() {
  return normalizeDispatchMode()
}

export async function dispatchEscalation(escalation, alert) {
  const target = String(escalation?.target || '').toLowerCase()
  const mode = normalizeDispatchMode()

  const adapter = adapters[target]
  if (!adapter) {
    throw new Error(`Unsupported escalation target: ${target || 'unknown'}`)
  }

  const output = await adapter({ escalation, alert, mode })

  return {
    mode,
    target,
    destination: output.destination,
    payload: output.payload,
    result: output.result || null,
  }
}

// TODO(P1): add signed request replay protection + delivery idempotency keys for live webhook dispatches.
