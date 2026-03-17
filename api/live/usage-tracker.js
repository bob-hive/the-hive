/**
 * api/live/usage-tracker.js
 * Cost / token usage tracker — reads usage-proximity-state.json and api-usage-log.md.
 * Supports LIVE (file system) and MOCK modes.
 */

import process from 'node:process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { checkHiveApiKey, corsHeaders, jsonResponse, requireUserSession, unauthorizedResponse } from '../_lib/auth.js'

// Workspace root: walk up from __dirname; fall back to WORKSPACE env, then ~/openclaw/workspace
function resolveWorkspaceRoot() {
  if (process.env.OPENCLAW_WORKSPACE) return process.env.OPENCLAW_WORKSPACE
  // Vercel serverless: no __dirname with ESM, use cwd heuristic or env
  return path.join(process.env.HOME || '/root', '.openclaw', 'workspace')
}

const WORKSPACE = resolveWorkspaceRoot()
const PROXIMITY_STATE_PATH = path.join(WORKSPACE, 'memory', 'usage-proximity-state.json')
const API_USAGE_LOG_PATH = path.join(WORKSPACE, 'memory', 'api-usage-log.md')

function freshnessMeta({ source, observedAtMs, staleAfterMs = 300_000, mock = false }) {
  const generatedAtMs = Date.now()
  const observed = observedAtMs ?? generatedAtMs
  const ageMs = Math.max(0, generatedAtMs - observed)

  return {
    source,
    mode: mock ? 'MOCK' : 'LIVE',
    observedAtMs: observed,
    generatedAtMs,
    ageMs,
    staleAfterMs,
    stale: ageMs > staleAfterMs,
  }
}

function alertLevelFromPct(pct) {
  if (pct >= 80) return 'critical'
  if (pct >= 60) return 'warn'
  return 'ok'
}

function estimateTimeToExhaustion(pct, ageMs) {
  // Very rough heuristic: if we know age and current usage, extrapolate
  if (!ageMs || ageMs <= 0 || pct <= 0) return null
  const remaining = 100 - pct
  if (remaining <= 0) return 0
  // ms per 1% consumed → time to consume remaining %
  const ratePerPct = ageMs / pct
  return Math.round(ratePerPct * remaining)
}

function parseProximityState(raw) {
  try {
    const data = JSON.parse(raw)
    const pct = Number(data?.context?.pct ?? 0)
    const used = Number(data?.context?.used ?? 0)
    const max = Number(data?.context?.max ?? 272000)
    const status = String(data?.status || 'UNKNOWN')

    const claudeTokens = data?.claude30d?.totalTokens ?? 0
    const openaiTokens = data?.openai30d?.totalTokens ?? 0

    const alerts = Array.isArray(data?.alerts) ? data.alerts : []

    const observedAt = data?.timestamp ? Date.parse(data.timestamp) : null

    return {
      ok: true,
      pct,
      used,
      max,
      status,
      alertLevel: alertLevelFromPct(pct),
      claudeTokens30d: claudeTokens,
      openaiTokens30d: openaiTokens,
      alerts,
      observedAt,
      raw: data,
    }
  } catch {
    return { ok: false }
  }
}

function parseApiUsageLog(text) {
  // Extract last 5 entries from the markdown log
  const entries = []
  const sections = text.split(/^## /m).filter(Boolean)

  for (const section of sections.slice(-8)) {
    const lines = section.split('\n')
    const header = lines[0]?.trim() || ''
    const body = lines.slice(1).join('\n').trim()
    if (!header) continue

    entries.push({ date: header, summary: body.slice(0, 300) })
  }

  return entries.slice(-5).reverse()
}

function buildMockData() {
  const now = Date.now()
  const mins = (n) => n * 60_000

  return {
    pct: 7,
    used: 20000,
    max: 272000,
    status: 'ALL_CLEAR',
    alertLevel: 'ok',
    estimatedTimeToExhaustionMs: null,
    providers: {
      claude: { label: 'Claude (Anthropic)', status: 'ok', tokens30d: 7773, note: 'Within normal range' },
      codex: { label: 'OpenAI Codex / GPT', status: 'ok', tokens30d: 0, note: 'No usage recorded' },
      gemini: { label: 'Google Gemini', status: 'ok', tokens30d: null, note: 'Not tracked locally' },
    },
    recentAlerts: [
      { ts: now - mins(150), level: 'warn', message: 'Context usage crossed 60% — continuing to monitor' },
      { ts: now - mins(900), level: 'ok', message: 'Context reset after session end' },
    ],
    trendEntries: [
      { date: '2026-03-17 08:05 CT', summary: 'Context at 7%, all providers nominal.' },
      { date: '2026-03-16 20:04 CT', summary: 'Context at 10%, Gemini default, no degradation.' },
      { date: '2026-03-16 16:05 CT', summary: 'Context at 6%, tokens 16k/272k.' },
      { date: '2026-03-16 08:05 CT', summary: 'Context at 10%, Opus reachable, spend normal.' },
      { date: '2026-03-16 00:04 CT', summary: 'All systems nominal. No anomalies.' },
    ],
    freshness: freshnessMeta({ source: 'MOCK', observedAtMs: now, mock: true }),
    mock: true,
    ts: now,
  }
}

async function getLiveData() {
  const [stateRaw, logRaw] = await Promise.allSettled([
    readFile(PROXIMITY_STATE_PATH, 'utf8'),
    readFile(API_USAGE_LOG_PATH, 'utf8'),
  ])

  if (stateRaw.status === 'rejected') {
    return null // File not found → fall through to mock
  }

  const state = parseProximityState(stateRaw.value)
  if (!state.ok) return null

  const trendEntries = logRaw.status === 'fulfilled'
    ? parseApiUsageLog(logRaw.value)
    : []

  const observedAtMs = state.observedAt ?? Date.now()
  const ageMs = Date.now() - observedAtMs
  const estimatedTimeToExhaustionMs = estimateTimeToExhaustion(state.pct, ageMs)

  // Recent alerts from state
  const recentAlerts = (state.alerts || [])
    .slice(-5)
    .map((a) => ({
      ts: a.ts ? Date.parse(a.ts) : Date.now(),
      level: a.level || 'info',
      message: a.message || String(a),
    }))

  return {
    pct: state.pct,
    used: state.used,
    max: state.max,
    status: state.status,
    alertLevel: state.alertLevel,
    estimatedTimeToExhaustionMs,
    providers: {
      claude: {
        label: 'Claude (Anthropic)',
        status: state.pct >= 80 ? 'critical' : state.pct >= 60 ? 'warn' : 'ok',
        tokens30d: state.claudeTokens30d,
        note: state.claudeTokens30d > 0 ? `${state.claudeTokens30d.toLocaleString()} tokens (30d)` : 'No usage recorded',
      },
      codex: {
        label: 'OpenAI Codex / GPT',
        status: 'ok',
        tokens30d: state.openaiTokens30d,
        note: state.openaiTokens30d > 0 ? `${state.openaiTokens30d.toLocaleString()} tokens (30d)` : 'No usage recorded',
      },
      gemini: {
        label: 'Google Gemini',
        status: 'ok',
        tokens30d: null,
        note: 'Not tracked in local dataset',
      },
    },
    recentAlerts,
    trendEntries,
    freshness: freshnessMeta({ source: 'LIVE', observedAtMs, mock: false }),
    mock: false,
    ts: Date.now(),
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!requireUserSession(req, res)) return
  if (!checkHiveApiKey(req)) return unauthorizedResponse(res)

  try {
    const liveData = await getLiveData()

    if (liveData) {
      return jsonResponse(res, 200, liveData)
    }
  } catch {
    // Fall through to mock
  }

  return jsonResponse(res, 200, buildMockData())
}
