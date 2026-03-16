/**
 * GET /api/jobs
 * Returns cron/reminder/recurring job operations data + dashboard summary.
 */

import { tryGatewayRpc, getGatewayConfig } from './_lib/gateway.js'
import { getMockJobsData } from './_lib/mock.js'
import {
  checkHiveApiKey,
  jsonResponse,
  unauthorizedResponse,
  corsHeaders,
  requireUserSession,
} from './_lib/auth.js'

const DAY_MS = 24 * 60 * 60 * 1000

function parseTimestamp(value) {
  if (!value) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function inferCadence(input) {
  const text = String(input || '').toLowerCase()
  if (!text) return 'unknown'

  if (text.includes('@hourly') || text.includes('hourly') || /\b\*\s+\*\s+\*\s+\*\s+\*/.test(text)) return 'hourly'
  if (text.includes('@daily') || text.includes('daily') || /^\d+\s+\d+\s+\*\s+\*\s+\*/.test(text)) return 'daily'
  if (text.includes('@weekly') || text.includes('weekly')) return 'weekly'
  if (text.includes('@monthly') || text.includes('monthly') || /^\d+\s+\d+\s+\d+\s+\*\s+\*/.test(text)) return 'monthly'

  if (text.includes('every hour')) return 'hourly'
  if (text.includes('every day') || text.includes('once a day')) return 'daily'
  if (text.includes('every week') || text.includes('once a week')) return 'weekly'
  if (text.includes('every month') || text.includes('once a month')) return 'monthly'

  return 'unknown'
}

function cadenceIntervalMs(cadence) {
  if (cadence === 'hourly') return 60 * 60 * 1000
  if (cadence === 'daily') return 24 * 60 * 60 * 1000
  if (cadence === 'weekly') return 7 * 24 * 60 * 60 * 1000
  if (cadence === 'monthly') return 30 * 24 * 60 * 60 * 1000
  return null
}

function normalizeStatus(rawStatus, enabled) {
  if (enabled === false) return 'disabled'
  const status = String(rawStatus || '').toLowerCase()

  if (!status) return 'unknown'
  if (status.includes('fail') || status.includes('error')) return 'failed'
  if (status.includes('run') || status.includes('active') || status.includes('progress')) return 'running'
  if (status.includes('success') || status.includes('complete') || status.includes('ok') || status.includes('idle')) return 'success'
  if (status.includes('pending') || status.includes('queue') || status.includes('wait')) return 'pending'

  return status
}

function isJobLikeSession(session) {
  const key = String(session.key || session.sessionKey || '').toLowerCase()
  const label = String(session.label || '').toLowerCase()
  const channel = String(session.channel || '').toLowerCase()

  if (channel === 'cron' || key.includes(':cron:')) return true
  if (label.includes('cron') || label.includes('reminder') || label.includes('schedule')) return true

  return false
}

function deriveNextRunMs(job, now) {
  const explicit =
    parseTimestamp(job.nextRunMs) ??
    parseTimestamp(job.nextRunAt) ??
    parseTimestamp(job.schedule?.nextRunMs) ??
    parseTimestamp(job.schedule?.nextRunAt)

  if (explicit) return explicit

  const cadence = inferCadence(job.cadence || job.schedule || job.cron || job.label || job.key)
  const interval = cadenceIntervalMs(cadence)
  if (!interval) return null

  const lastRunMs = parseTimestamp(job.lastRunMs) ?? parseTimestamp(job.lastActiveMs) ?? now
  return lastRunMs + interval
}

function normalizeJob(session, now) {
  const key = session.key || session.sessionKey || ''
  const explicitCadence = session.cadence || session.schedule?.cadence
  const cadence = inferCadence(explicitCadence || session.cron || session.schedule?.cron || session.label || key)

  const enabled =
    typeof session.enabled === 'boolean'
      ? session.enabled
      : typeof session.disabled === 'boolean'
        ? !session.disabled
        : session.paused === true
          ? false
          : true

  const lastRunMs =
    parseTimestamp(session.lastRunMs) ??
    parseTimestamp(session.lastRunAt) ??
    parseTimestamp(session.lastActiveMs) ??
    parseTimestamp(session.updatedAt)

  const rawLastStatus =
    session.lastRunStatus ||
    session.lastStatus ||
    session.status ||
    session.schedule?.lastRunStatus ||
    'unknown'

  const lastRunStatus = normalizeStatus(rawLastStatus, enabled)
  const nextRunMs = deriveNextRunMs({ ...session, cadence }, now)

  const owner = session.owner || session.agentId || (key.startsWith('agent:') ? key.split(':')[1] : null)
  const target = session.target || session.channel || session.schedule?.target || null

  return {
    id: session.jobId || session.id || session.sessionId || key,
    key,
    name: session.name || session.label || key || 'Unnamed job',
    cadence,
    nextRunMs,
    lastRunMs,
    lastRunStatus,
    enabled,
    owner: owner || null,
    target,
  }
}

function buildSummary(jobs, now) {
  const activeJobs = jobs.filter((job) => job.enabled)

  const failedOrIssueCount = jobs.filter((job) => {
    if (job.lastRunStatus === 'failed' || job.lastRunStatus === 'error') return true
    if (job.lastRunStatus === 'running' || job.lastRunStatus === 'pending') {
      return job.lastRunMs ? (now - job.lastRunMs) < DAY_MS : false
    }
    return false
  }).length

  const nextUpcoming = activeJobs
    .filter((job) => typeof job.nextRunMs === 'number' && job.nextRunMs >= now)
    .sort((a, b) => a.nextRunMs - b.nextRunMs)[0] || null

  return {
    totalActiveJobs: activeJobs.length,
    failedOrRecentIssueCount: failedOrIssueCount,
    nextUpcomingRun: nextUpcoming
      ? {
          jobId: nextUpcoming.id,
          jobName: nextUpcoming.name,
          nextRunMs: nextUpcoming.nextRunMs,
        }
      : null,
  }
}

function applyFilters(jobs, query = {}) {
  const cadenceFilter = String(query.cadence || 'all').toLowerCase()
  const statusFilter = String(query.status || 'all').toLowerCase()

  return jobs.filter((job) => {
    if (cadenceFilter !== 'all' && job.cadence !== cadenceFilter) return false

    if (statusFilter !== 'all') {
      if (statusFilter === 'enabled' && !job.enabled) return false
      else if (statusFilter === 'disabled' && job.enabled) return false
      else if (!['enabled', 'disabled'].includes(statusFilter) && job.lastRunStatus !== statusFilter) return false
    }

    return true
  })
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!requireUserSession(req, res)) return
  if (!checkHiveApiKey(req)) return unauthorizedResponse(res)

  const isMock = !getGatewayConfig()
  const now = Date.now()

  if (isMock) {
    const mock = getMockJobsData()
    const jobs = applyFilters(mock.jobs, req.query)
    return jsonResponse(res, 200, {
      jobs,
      summary: mock.summary,
      total: jobs.length,
      totalUnfiltered: mock.jobs.length,
      source: 'MOCK',
      mock: true,
      ts: now,
    })
  }

  try {
    const limit = Math.min(parseInt(req.query?.limit || '200', 10), 500)
    const result = await tryGatewayRpc('sessions.list', { limit })
    const rawSessions = result?.sessions ?? (Array.isArray(result) ? result : [])

    const jobsAll = rawSessions
      .filter(isJobLikeSession)
      .map((session) => normalizeJob(session, now))
      .sort((a, b) => {
        const aNext = a.nextRunMs ?? Number.MAX_SAFE_INTEGER
        const bNext = b.nextRunMs ?? Number.MAX_SAFE_INTEGER
        return aNext - bNext
      })

    const jobs = applyFilters(jobsAll, req.query)
    const summary = buildSummary(jobsAll, now)

    return jsonResponse(res, 200, {
      jobs,
      summary,
      total: jobs.length,
      totalUnfiltered: jobsAll.length,
      source: 'LIVE',
      mock: false,
      ts: now,
    })
  } catch (err) {
    console.error('[api/jobs] error:', err.message)
    const mock = getMockJobsData()
    const jobs = applyFilters(mock.jobs, req.query)
    return jsonResponse(res, 200, {
      jobs,
      summary: mock.summary,
      total: jobs.length,
      totalUnfiltered: mock.jobs.length,
      source: 'MOCK_FALLBACK',
      mock: true,
      error: err.message,
      ts: now,
    })
  }
}
