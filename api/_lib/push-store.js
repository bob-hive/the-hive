/**
 * api/_lib/push-store.js
 * Shared helper for reading push-store files written by local sync scripts.
 *
 * Usage:
 *   import { readPushStore } from './_lib/push-store.js'
 *   const pushed = readPushStore('/tmp/hive-usage.json', 600_000)
 *   if (pushed) return jsonResponse(res, 200, { ...pushed, source: 'PUSH' })
 */

import fs from 'node:fs'

/**
 * Read a push-store JSON file, returning its parsed content if fresh.
 *
 * @param {string} storePath   - Absolute path to the /tmp store file.
 * @param {number} maxAgeMs    - Maximum age in milliseconds (default 10 min).
 * @returns {object|null}      - Parsed store object if fresh, null otherwise.
 */
export function readPushStore(storePath, maxAgeMs = 600_000) {
  try {
    const raw = fs.readFileSync(storePath, 'utf8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null

    // Check freshness via pushedAt or ts
    const age = Date.now() - Number(data.pushedAt || data.ts || 0)
    if (age > maxAgeMs) return null

    return data
  } catch {
    return null
  }
}

/**
 * Write data to a push-store file (sync, for Vercel serverless handlers).
 * Stamps pushedAt automatically.
 *
 * @param {string} storePath
 * @param {object} data
 */
export function writePushStoreSync(storePath, data) {
  const payload = { ...data, pushedAt: Date.now() }
  fs.writeFileSync(storePath, JSON.stringify(payload, null, 2), 'utf8')
}
