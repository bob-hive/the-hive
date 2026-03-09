/**
 * The Hive — Mock Data Layer
 *
 * All exports here are the single source of truth for UI data.
 * Swap these out for real API calls later by replacing the exports
 * with async fetch functions (same shape).
 */

// ──────────────────────────────────────────────
// Agents
// ──────────────────────────────────────────────

/** @typedef {'online'|'busy'|'idle'} AgentStatus */

/**
 * @typedef {Object} Agent
 * @property {string}      id
 * @property {string}      name
 * @property {string}      role
 * @property {AgentStatus} status
 * @property {string}      avatar   – emoji shorthand
 * @property {number}      tasksCompleted
 * @property {number}      tasksRunning
 * @property {string}      currentTask   – short description or ''
 * @property {number}      uptime        – seconds online this session
 * @property {number}      load          – 0–100 (CPU/effort %)
 */

export const agents = [
  {
    id: 'atlas',
    name: 'Atlas',
    role: 'Orchestrator',
    status: 'online',
    avatar: '🗺️',
    tasksCompleted: 47,
    tasksRunning: 3,
    currentTask: 'Coordinating deployment pipeline',
    uptime: 18420,
    load: 62,
  },
  {
    id: 'forge',
    name: 'Forge',
    role: 'Build Agent',
    status: 'busy',
    avatar: '⚒️',
    tasksCompleted: 134,
    tasksRunning: 1,
    currentTask: 'Compiling the-hive production bundle',
    uptime: 14400,
    load: 91,
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'Research Agent',
    status: 'online',
    avatar: '🔭',
    tasksCompleted: 88,
    tasksRunning: 2,
    currentTask: 'Crawling docs for API surface changes',
    uptime: 21600,
    load: 38,
  },
  {
    id: 'ledger',
    name: 'Ledger',
    role: 'Data Agent',
    status: 'idle',
    avatar: '📒',
    tasksCompleted: 221,
    tasksRunning: 0,
    currentTask: '',
    uptime: 7200,
    load: 4,
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Monitor',
    status: 'online',
    avatar: '🛡️',
    tasksCompleted: 1042,
    tasksRunning: 1,
    currentTask: 'Health-checking downstream services',
    uptime: 86400,
    load: 17,
  },
]

// ──────────────────────────────────────────────
// Tasks
// ──────────────────────────────────────────────

/** @typedef {'success'|'pending'|'running'|'failed'} TaskStatus */

/**
 * @typedef {Object} Task
 * @property {string}     id
 * @property {string}     title
 * @property {string}     agentId
 * @property {TaskStatus} status
 * @property {number}     timestamp  – unix ms
 * @property {number}     [duration] – ms elapsed (omit if pending/running)
 * @property {string}     [detail]
 */

const now = Date.now()
const mins = (n) => n * 60_000

export const tasks = [
  {
    id: 't-001',
    title: 'Deploy staging environment',
    agentId: 'atlas',
    status: 'success',
    timestamp: now - mins(3),
    duration: 47_200,
    detail: 'K8s rollout completed, 3/3 pods healthy',
  },
  {
    id: 't-002',
    title: 'Compile production bundle',
    agentId: 'forge',
    status: 'running',
    timestamp: now - mins(6),
    detail: 'Vite build — 73% complete',
  },
  {
    id: 't-003',
    title: 'Scan OpenAI API changelog',
    agentId: 'scout',
    status: 'success',
    timestamp: now - mins(11),
    duration: 8_300,
    detail: '3 breaking changes flagged',
  },
  {
    id: 't-004',
    title: 'Aggregate daily cost report',
    agentId: 'ledger',
    status: 'success',
    timestamp: now - mins(18),
    duration: 2_100,
    detail: '$4.21 total spend',
  },
  {
    id: 't-005',
    title: 'Health-check payment gateway',
    agentId: 'sentinel',
    status: 'success',
    timestamp: now - mins(20),
    duration: 340,
    detail: 'Latency p99: 182 ms',
  },
  {
    id: 't-006',
    title: 'Summarise GitHub PR #448',
    agentId: 'scout',
    status: 'success',
    timestamp: now - mins(27),
    duration: 5_800,
    detail: '12 files changed, +340 −88',
  },
  {
    id: 't-007',
    title: 'Rebuild search index',
    agentId: 'ledger',
    status: 'failed',
    timestamp: now - mins(35),
    duration: 31_000,
    detail: 'OOM at 94% — heap limit hit',
  },
  {
    id: 't-008',
    title: 'Lint & type-check codebase',
    agentId: 'forge',
    status: 'success',
    timestamp: now - mins(42),
    duration: 9_700,
    detail: '0 errors, 4 warnings',
  },
  {
    id: 't-009',
    title: 'Coordinate multi-agent research sprint',
    agentId: 'atlas',
    status: 'pending',
    timestamp: now - mins(48),
    detail: 'Waiting on Scout + Ledger',
  },
  {
    id: 't-010',
    title: 'Monitor disk usage on prod nodes',
    agentId: 'sentinel',
    status: 'running',
    timestamp: now - mins(51),
    detail: 'node-02: 78% — approaching threshold',
  },
  {
    id: 't-011',
    title: 'Generate weekly analytics summary',
    agentId: 'ledger',
    status: 'success',
    timestamp: now - mins(63),
    duration: 4_400,
    detail: '1.2 k events processed',
  },
  {
    id: 't-012',
    title: 'Patch dependency vulnerabilities',
    agentId: 'forge',
    status: 'success',
    timestamp: now - mins(74),
    duration: 14_200,
    detail: '6 packages updated',
  },
  {
    id: 't-013',
    title: 'Scrape competitor pricing page',
    agentId: 'scout',
    status: 'success',
    timestamp: now - mins(88),
    duration: 3_600,
    detail: '5 plans captured & stored',
  },
  {
    id: 't-014',
    title: 'Rotate API keys',
    agentId: 'sentinel',
    status: 'success',
    timestamp: now - mins(105),
    duration: 890,
    detail: '4 keys rotated, secrets updated',
  },
  {
    id: 't-015',
    title: 'Draft Q1 infrastructure report',
    agentId: 'atlas',
    status: 'success',
    timestamp: now - mins(130),
    duration: 22_100,
    detail: '8-page report saved to Drive',
  },
]

// ──────────────────────────────────────────────
// Metrics
// ──────────────────────────────────────────────

/**
 * @typedef {Object} Metrics
 * @property {number} tasksCompletedToday
 * @property {number} activeSessions
 * @property {string} uptimeFormatted
 * @property {number} successRate   – 0–100
 * @property {number} avgTaskMs
 * @property {number} totalAgents
 */

export const metrics = {
  tasksCompletedToday: tasks.filter((t) => t.status === 'success').length,
  activeSessions: agents.filter((a) => a.status !== 'idle').length,
  uptimeFormatted: '24 d 7 h 12 m',
  successRate: 92,
  avgTaskMs: 11_400,
  totalAgents: agents.length,
}

// ──────────────────────────────────────────────
// Helpers (reusable across components)
// ──────────────────────────────────────────────

/** Find an agent by id */
export const getAgent = (id) => agents.find((a) => a.id === id)

/** Format a unix-ms timestamp as relative "3 m ago" etc. */
export const relativeTime = (ts) => {
  const diff = Date.now() - ts
  if (diff < 60_000)  return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86400_000)}d ago`
}

/** Format duration ms → human string */
export const formatDuration = (ms) => {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

/** Format uptime seconds → "Xh Ym" */
export const formatUptime = (secs) => {
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return m ? `${h}h ${m}m` : `${h}h`
}
