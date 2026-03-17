import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const MAX_JSONL_LINES = 4000

function unique(items = []) {
  return [...new Set(items.filter(Boolean))]
}

function normalizeRelative(candidate) {
  if (!candidate) return null
  if (path.isAbsolute(candidate)) return candidate
  return path.resolve(process.cwd(), candidate)
}

function toMillis(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1_000_000_000_000) return raw
    if (raw > 1_000_000_000) return raw * 1000
    return raw
  }

  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric > 1_000_000_000_000) return numeric
    if (numeric > 1_000_000_000) return numeric * 1000
    return numeric
  }

  const parsed = Date.parse(String(raw))
  return Number.isFinite(parsed) ? parsed : null
}

export function resolveWorkspaceLogPaths(relativePath, envValue) {
  if (envValue) {
    const explicit = path.isAbsolute(envValue)
      ? envValue
      : path.resolve(process.cwd(), envValue)
    return [explicit]
  }

  const local = normalizeRelative(relativePath)
  const parentWorkspace = normalizeRelative(path.join('..', relativePath || ''))
  const rootWorkspace = normalizeRelative(path.join('..', '..', relativePath || ''))

  return unique([local, parentWorkspace, rootWorkspace])
}

export async function firstExistingPath(candidates = []) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  return candidates[0] || null
}

export async function readJsonSafe(filePath, fallback = {}) {
  if (!filePath) return fallback
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

export async function readJsonlSafe(filePath, { maxLines = MAX_JSONL_LINES } = {}) {
  if (!filePath) return []

  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const lines = raw.split('\n').filter(Boolean)
    const slice = lines.slice(-Math.max(1, Math.min(maxLines, MAX_JSONL_LINES)))

    return slice
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

export function quantile(numbers = [], percentile = 0.5) {
  const values = numbers.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (values.length === 0) return null
  if (values.length === 1) return values[0]

  const pos = (values.length - 1) * percentile
  const base = Math.floor(pos)
  const rest = pos - base

  if (values[base + 1] === undefined) return values[base]
  return values[base] + rest * (values[base + 1] - values[base])
}

export function pickFirstNumber(obj, keys = []) {
  for (const key of keys) {
    const value = obj?.[key]
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric >= 0) return numeric
  }
  return null
}

export function parseTimestamp(value) {
  return toMillis(value)
}
