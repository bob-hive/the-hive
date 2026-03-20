/**
 * api/_lib/handler-projects.js
 * Projects handler — serves live project data from workspace PROJECTS.md
 * Falls back to static JSON seed if gateway is unreachable.
 */

import {
  corsHeaders,
  jsonResponse,
  requireUserSession,
} from './auth.js'
import {
  getWorkspaceEscalations,
  readProjectsMd,
  parseProjectsMd,
  buildProjectsFromMd,
} from './workspace-reader.js'

// Static seed fallback
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

async function loadSeedProjects() {
  try {
    // Load the static seed JSON from src/data/projects.json
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const seedPath = path.resolve(__dirname, '../../src/data/projects.json')
    const raw = await readFile(seedPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function handler(req, res, slug) {
  // Auth: require user session (no strict API key needed for read)
  if (!requireUserSession(req, res)) return

  if (req.method === 'GET' && slug.length === 0) {
    try {
      // Attempt to read live data from workspace
      const markdown = await readProjectsMd()

      if (markdown) {
        const parsed = parseProjectsMd(markdown)
        const projects = buildProjectsFromMd(parsed)

        return jsonResponse(res, 200, {
          source: 'workspace_live',
          updatedAt: new Date().toISOString(),
          projects,
          planning: {
            label: 'Planning Session Board',
            source: 'Live workspace PROJECTS.md via Gateway RPC',
            updateCadence: 'Real-time — reads from workspace on every request.',
          },
        })
      }
    } catch (err) {
      console.warn('[handler-projects] live read failed, falling back to seed:', err.message)
    }

    // Fallback to static seed
    const seed = await loadSeedProjects()
    if (seed) {
      return jsonResponse(res, 200, {
        ...seed,
        source: 'seed_fallback',
        updatedAt: new Date().toISOString(),
      })
    }

    return jsonResponse(res, 503, {
      error: 'Projects data unavailable',
      code: 'PROJECTS_UNAVAILABLE',
    })
  }

  return jsonResponse(res, 405, {
    error: 'Method not allowed',
    code: 'METHOD_NOT_ALLOWED',
  })
}
