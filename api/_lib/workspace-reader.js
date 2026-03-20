/**
 * api/_lib/workspace-reader.js
 * Reads workspace files via Gateway RPC and parses project/escalation data.
 * Server-side only.
 */

import { tryGatewayRpc } from './gateway.js'

const PROJECTS_MD_PATH = '/Users/anispecialops/.openclaw/workspace/PROJECTS.md'

/**
 * Read PROJECTS.md from the workspace via Gateway RPC.
 * Returns null if the gateway is unreachable.
 */
export async function readProjectsMd() {
  try {
    const result = await tryGatewayRpc('tools.read', { path: PROJECTS_MD_PATH })
    if (!result) return null
    // Gateway RPC tools.read returns { content: string } or similar
    const content = result.content ?? result.text ?? (typeof result === 'string' ? result : null)
    return content || null
  } catch (err) {
    console.warn('[workspace-reader] readProjectsMd failed:', err.message)
    return null
  }
}

/**
 * Parse sections of PROJECTS.md for project status.
 * Returns an array of parsed project objects.
 */
export function parseProjectsMd(markdown) {
  if (!markdown) return []

  const projects = []
  // Split on Project N headers
  const sections = markdown.split(/^##\s+Project\s+(\d+)/im)

  // sections[0] = preamble before first project
  // sections[1, 3, 5...] = project numbers
  // sections[2, 4, 6...] = project content
  for (let i = 1; i < sections.length; i += 2) {
    const projectNumber = parseInt(sections[i], 10)
    const content = sections[i + 1] || ''

    // Extract project name from first non-empty line after the header
    const nameMatch = content.match(/^[:\s]*([^\n]+)/m)
    const name = nameMatch ? nameMatch[1].replace(/^[:\s#]+/, '').trim() : `Project ${projectNumber}`

    // Extract RAG status
    const ragMatch = content.match(/(?:status|rag)[:\s*]+([🟢🟡🔴]|\b(?:green|amber|red)\b)/im)
    let ragStatus = 'amber'
    if (ragMatch) {
      const raw = ragMatch[1].toLowerCase()
      if (raw === 'green' || raw === '🟢') ragStatus = 'green'
      else if (raw === 'red' || raw === '🔴') ragStatus = 'red'
    }

    // Extract blockers
    const blockers = []
    const blockerSection = content.match(/(?:blocker|blocked)[^#]*?(?=^##|\z)/imsd)
    if (blockerSection) {
      const lines = blockerSection[0].split('\n')
      for (const line of lines) {
        const bullet = line.match(/^[-*•]\s+(.+)/)
        if (bullet) blockers.push(bullet[1].trim())
      }
    }

    // Extract "Waiting on Ani" items
    const waitingItems = []
    const waitingSection = content.match(/(?:waiting on ani|ani[- ]blocked)[^#]*?(?=^##|\z)/imsd)
    if (waitingSection) {
      const lines = waitingSection[0].split('\n')
      for (const line of lines) {
        const bullet = line.match(/^[-*•]\s+(.+)/)
        if (bullet) waitingItems.push(bullet[1].trim())
      }
    }

    projects.push({
      projectNumber,
      name,
      ragStatus,
      blockers,
      waitingItems,
      rawContent: content.slice(0, 2000),
    })
  }

  return projects
}

/**
 * Convert parsed project blockers into escalation-like items for the Bob Queue.
 * These are "synthetic" escalations — not stored in the alert store.
 */
export function buildEscalationsFromProjects(parsedProjects) {
  const escalations = []
  const now = new Date().toISOString()

  // Closed project IDs that should be skipped
  const CLOSED_PROJECT_NUMBERS = new Set([1, 2, 4, 6, 7, 8])

  for (const project of parsedProjects) {
    if (CLOSED_PROJECT_NUMBERS.has(project.projectNumber)) continue

    const allBlockers = [
      ...project.blockers.map((b) => ({ text: b, type: 'blocker' })),
      ...project.waitingItems.map((w) => ({ text: w, type: 'waiting' })),
    ]

    for (const blocker of allBlockers) {
      const id = `workspace-esc-p${project.projectNumber}-${Buffer.from(blocker.text).toString('base64url').slice(0, 12)}`
      escalations.push({
        id,
        alertId: `workspace-alert-p${project.projectNumber}`,
        state: 'pending',
        target: blocker.type === 'waiting' ? 'ani' : 'bob',
        reason: blocker.type === 'waiting' ? 'waiting_on_ani' : 'project_blocker',
        ownership: blocker.type === 'waiting' ? 'ani' : 'bob',
        createdAt: now,
        updatedAt: now,
        source: 'workspace',
        alert: {
          id: `workspace-alert-p${project.projectNumber}`,
          severity: 'high',
          source: `Project ${project.projectNumber}`,
          title: `[P${project.projectNumber}] ${blocker.text.slice(0, 100)}`,
          ts: Date.now(),
          status: 'open',
        },
        dispatch: {
          mode: 'dry-run',
          attempts: [],
          lastError: null,
          payload: null,
          destination: null,
          result: null,
          queueRecord: null,
        },
        transitions: [],
        _synthetic: true,
        _projectName: project.name,
        _projectNumber: project.projectNumber,
      })
    }
  }

  return escalations
}

/**
 * Full pipeline: read PROJECTS.md → parse → return synthetic escalations.
 * Returns empty array if gateway unreachable.
 */
export async function getWorkspaceEscalations() {
  const markdown = await readProjectsMd()
  if (!markdown) return []
  const projects = parseProjectsMd(markdown)
  return buildEscalationsFromProjects(projects)
}

/**
 * Parse PROJECTS.md into a structured project list compatible with projects.json format.
 * Used by the /api/projects endpoint.
 */
export function buildProjectsFromMd(parsedProjects) {
  const CLOSED_PROJECT_NUMBERS = new Set([1, 2, 4, 6, 7, 8])

  return parsedProjects.map((project) => {
    const closed = CLOSED_PROJECT_NUMBERS.has(project.projectNumber)

    // Extract progress summary from first paragraph
    const summaryMatch = project.rawContent.match(/(?:progress|summary|status)[:\s]+([^\n]{10,200})/i)
    const progressSummary = summaryMatch ? summaryMatch[1].trim() : ''

    // Extract owner
    const ownerMatch = project.rawContent.match(/(?:owner|assigned)[:\s]+([^\n]{2,60})/i)
    const owner = ownerMatch ? ownerMatch[1].trim() : 'Bob'

    // Extract next sprint
    const nextSprintItems = []
    const nextSprintSection = project.rawContent.match(/(?:next sprint|sprint focus)[^#]*?(?=^##|\z)/imsd)
    if (nextSprintSection) {
      const lines = nextSprintSection[0].split('\n')
      for (const line of lines) {
        const bullet = line.match(/^[-*•]\s+(.+)/)
        if (bullet) nextSprintItems.push(bullet[1].trim())
      }
    }

    return {
      id: `project-${project.projectNumber}`,
      roadmapRef: `Project ${project.projectNumber}`,
      name: project.name,
      ragStatus: project.ragStatus,
      closed,
      progressSummary,
      owner,
      nextSprintFocus: nextSprintItems[0] || '',
      detailedStatus: '',
      notes: [],
      nextSprint: nextSprintItems,
      blockers: project.blockers,
      recommendations: [],
      backlog: [],
      lastUpdated: new Date().toISOString(),
      _source: 'workspace',
    }
  })
}
