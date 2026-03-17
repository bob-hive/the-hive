export function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000
  }

  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

export function formatFreshness(value, { now = Date.now() } = {}) {
  const ts = parseTimestamp(value)
  if (!ts) return 'Freshness unknown'

  const diff = Math.max(0, now - ts)

  if (diff < 60_000) return 'Updated just now'
  if (diff < 3_600_000) return `Updated ${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `Updated ${Math.floor(diff / 3_600_000)}h ago`
  return `Updated ${Math.floor(diff / 86_400_000)}d ago`
}

export function isStale(value, thresholdMs = 15 * 60 * 1000, { now = Date.now() } = {}) {
  const ts = parseTimestamp(value)
  if (!ts) return false
  return now - ts > thresholdMs
}
