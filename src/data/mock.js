/**
 * The Hive — Mock Data Layer (v2)
 *
 * Updated to reflect actual bot roles. Swap fetchMockDashboardData
 * for a real async fetcher that returns the same shape.
 */

const mins = (n) => n * 60_000
const days = (n) => n * 24 * 60 * 60_000

// ── Canonical agent roster ────────────────────────────────────────────────────
export const AGENT_SEED = [
  {
    id: 'bob',
    name: 'Bob',
    role: 'Orchestrator',
    avatar: '😎',
    status: 'online',
    tasksCompleted: 47,
    tasksRunning: 3,
    currentTask: 'Coordinating multi-agent research sprint',
    uptime: 18420,
    load: 62,
    lastActiveMs: Date.now() - mins(1),
    // sparkline data (last 8 ticks, 0-100 load)
    sparkline: [40, 55, 62, 50, 68, 71, 65, 62],
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'Research',
    avatar: '🔍',
    status: 'busy',
    tasksCompleted: 88,
    tasksRunning: 2,
    currentTask: 'Crawling docs for API surface changes',
    uptime: 21600,
    load: 74,
    lastActiveMs: Date.now() - mins(0),
    sparkline: [30, 45, 60, 72, 68, 80, 78, 74],
  },
  {
    id: 'forge',
    name: 'Forge',
    role: 'Builder',
    avatar: '🔨',
    status: 'busy',
    tasksCompleted: 134,
    tasksRunning: 1,
    currentTask: 'Compiling the-hive production bundle',
    uptime: 14400,
    load: 91,
    lastActiveMs: Date.now() - mins(0),
    sparkline: [60, 70, 85, 88, 90, 93, 91, 91],
  },
  {
    id: 'ledger',
    name: 'Ledger',
    role: 'Analytics',
    avatar: '📊',
    status: 'idle',
    tasksCompleted: 221,
    tasksRunning: 0,
    currentTask: '',
    uptime: 7200,
    load: 4,
    lastActiveMs: Date.now() - mins(18),
    sparkline: [20, 35, 12, 8, 4, 2, 4, 4],
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Security',
    avatar: '🛡️',
    status: 'online',
    tasksCompleted: 1042,
    tasksRunning: 1,
    currentTask: 'Health-checking downstream services',
    uptime: 86400,
    load: 17,
    lastActiveMs: Date.now() - mins(2),
    sparkline: [15, 18, 14, 20, 16, 17, 15, 17],
  },
]

// ── Event feed seed ───────────────────────────────────────────────────────────
export function createEventFeed(now) {
  return [
    { id: 'e-001', type: 'spawned',   agentId: 'forge',    agentName: 'Forge',    timestamp: now - mins(0),   message: 'Build task started: the-hive prod bundle' },
    { id: 'e-002', type: 'completed', agentId: 'sentinel', agentName: 'Sentinel', timestamp: now - mins(2),   message: 'Health-check passed — all 9 endpoints OK' },
    { id: 'e-003', type: 'active',    agentId: 'scout',    agentName: 'Scout',    timestamp: now - mins(4),   message: 'Crawling OpenAI changelog page 3/7' },
    { id: 'e-004', type: 'error',     agentId: 'ledger',   agentName: 'Ledger',   timestamp: now - mins(35),  message: 'OOM during search-index rebuild — heap limit hit' },
    { id: 'e-005', type: 'completed', agentId: 'scout',    agentName: 'Scout',    timestamp: now - mins(11),  message: 'Summarised GitHub PR #448 — 12 files changed' },
    { id: 'e-006', type: 'completed', agentId: 'ledger',   agentName: 'Ledger',   timestamp: now - mins(18),  message: 'Daily cost report generated — $4.21 spend' },
    { id: 'e-007', type: 'spawned',   agentId: 'bob',      agentName: 'Bob',      timestamp: now - mins(48),  message: 'Orchestrating multi-agent research sprint' },
    { id: 'e-008', type: 'active',    agentId: 'sentinel', agentName: 'Sentinel', timestamp: now - mins(51),  message: 'Monitoring node-02 disk usage (78%) — threshold alert pending' },
    { id: 'e-009', type: 'completed', agentId: 'forge',    agentName: 'Forge',    timestamp: now - mins(74),  message: 'Patched 6 dependency vulnerabilities' },
    { id: 'e-010', type: 'completed', agentId: 'bob',      agentName: 'Bob',      timestamp: now - mins(130), message: 'Q1 infrastructure report drafted and saved' },
  ]
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
export function createTasks(now) {
  return [
    {
      id: 't-001',
      title: 'Deploy staging environment',
      agentId: 'bob',
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
      agentId: 'bob',
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
      agentId: 'bob',
      status: 'success',
      timestamp: now - mins(130),
      duration: 22_100,
      detail: '8-page report saved to Drive',
    },
  ]
}

function createTrends(now) {
  return Array.from({ length: 7 }, (_, index) => {
    const dayOffset = 6 - index
    const date = new Date(now - days(dayOffset))
    const day = date.toLocaleDateString('en-US', { weekday: 'short' })
    return {
      day,
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      tasksCompleted: 44 + index * 3 + (index % 2 === 0 ? 4 : -2),
      successRate: 89 + ((index + 2) % 4),
      agentUptime: 95.5 + index * 0.45,
    }
  })
}

function createAlerts(now) {
  return [
    {
      id: 'a-001',
      severity: 'critical',
      title: 'Search index rebuild failed',
      message: 'Search index rebuild failed due to memory pressure (heap OOM).',
      ts: now - mins(34),
      source: 'ledger',
      agentName: 'Ledger',
      lane: 'signal',
      confidence: 0.94,
      status: 'open',
    },
    {
      id: 'a-002',
      severity: 'warning',
      title: 'Sustained build load detected',
      message: 'Forge sustained >90% workload for 15 minutes.',
      ts: now - mins(22),
      source: 'forge',
      agentName: 'Forge',
      lane: 'signal',
      confidence: 0.77,
      status: 'open',
    },
    {
      id: 'a-003',
      severity: 'info',
      title: 'Disk usage elevated',
      message: 'Sentinel detected elevated disk usage on node-02 (78%).',
      ts: now - mins(50),
      source: 'sentinel',
      agentName: 'Sentinel',
      lane: 'noise',
      confidence: 0.42,
      status: 'open',
    },
    {
      id: 'a-004',
      severity: 'warning',
      title: 'Crawler retries increased',
      message: 'Scout retry count increased while crawling external docs.',
      ts: now - mins(12),
      source: 'scout',
      agentName: 'Scout',
      lane: 'noise',
      confidence: 0.35,
      status: 'open',
    },
  ]
}

export function generateMockDashboardData() {
  const now = Date.now()
  const agents = AGENT_SEED.map((agent) => ({ ...agent, lastActiveMs: agent.lastActiveMs ?? now }))
  const tasks = createTasks(now)
  const events = createEventFeed(now)
  const trends = createTrends(now)
  const alerts = createAlerts(now)

  const metrics = {
    tasksCompletedToday: tasks.filter((t) => t.status === 'success').length,
    activeSessions: agents.filter((a) => a.status !== 'idle').length,
    uptimeFormatted: '24 d 7 h 12 m',
    successRate: Math.round((tasks.filter((t) => t.status === 'success').length / tasks.length) * 100),
    avgTaskMs: 11_400,
    totalAgents: agents.length,
  }

  return { agents, tasks, events, trends, alerts, metrics }
}

export async function fetchMockDashboardData() {
  return Promise.resolve(generateMockDashboardData())
}

/** Format a unix-ms timestamp as relative "3m ago" etc. */
export const relativeTime = (ts) => {
  const diff = Date.now() - ts
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
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
