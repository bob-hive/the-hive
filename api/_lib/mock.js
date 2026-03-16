/**
 * Server-side mock data for MOCK_MODE or when gateway is unavailable.
 * Mirrors the shape returned by the real API routes.
 */

const mins = (n) => n * 60_000

export function getMockAgentsStatus() {
  const now = Date.now()
  return [
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
      lastActiveMs: now - mins(1),
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
      lastActiveMs: now - mins(0),
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
      lastActiveMs: now - mins(0),
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
      lastActiveMs: now - mins(18),
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
      lastActiveMs: now - mins(2),
      sparkline: [15, 18, 14, 20, 16, 17, 15, 17],
    },
  ]
}

export function getMockActivity() {
  const now = Date.now()
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

export function getMockSessions() {
  const now = Date.now()
  return [
    { id: 'sess-001', key: 'agent:main:telegram:direct:8790367246', agentId: 'bob',      channel: 'telegram', label: 'Main Chat',          lastActiveMs: now - mins(1),  status: 'active'   },
    { id: 'sess-002', key: 'agent:main:subagent:scout-001',          agentId: 'scout',    channel: null,        label: 'Subagent: Scout',   lastActiveMs: now - mins(4),  status: 'active'   },
    { id: 'sess-003', key: 'agent:main:subagent:forge-001',          agentId: 'forge',    channel: null,        label: 'Subagent: Forge',   lastActiveMs: now - mins(1),  status: 'active'   },
    { id: 'sess-004', key: 'agent:main:cron:daily-report',           agentId: 'ledger',   channel: 'cron',      label: 'Daily Report',      lastActiveMs: now - mins(18), status: 'idle'     },
    { id: 'sess-005', key: 'agent:main:cron:health-check',           agentId: 'sentinel', channel: 'cron',      label: 'Health Check Cron', lastActiveMs: now - mins(2),  status: 'active'   },
  ]
}

export function getMockJobsData() {
  const now = Date.now()

  const jobs = [
    {
      id: 'job-001',
      key: 'agent:ledger:cron:daily-report',
      name: 'Daily cost report',
      cadence: 'daily',
      nextRunMs: now + mins(42),
      lastRunMs: now - mins(18),
      lastRunStatus: 'success',
      enabled: true,
      owner: 'ledger',
      target: 'telegram',
    },
    {
      id: 'job-002',
      key: 'agent:sentinel:cron:health-check',
      name: 'Platform health check',
      cadence: 'hourly',
      nextRunMs: now + mins(19),
      lastRunMs: now - mins(41),
      lastRunStatus: 'success',
      enabled: true,
      owner: 'sentinel',
      target: 'alerts-health',
    },
    {
      id: 'job-003',
      key: 'agent:scout:cron:weekly-digest',
      name: 'Weekly research digest',
      cadence: 'weekly',
      nextRunMs: now + mins(60 * 24 * 2),
      lastRunMs: now - mins(60 * 24 * 5),
      lastRunStatus: 'failed',
      enabled: true,
      owner: 'scout',
      target: 'project-tracker',
    },
    {
      id: 'job-004',
      key: 'agent:bob:cron:monthly-ops-review',
      name: 'Monthly ops review',
      cadence: 'monthly',
      nextRunMs: now + mins(60 * 24 * 11),
      lastRunMs: now - mins(60 * 24 * 19),
      lastRunStatus: 'success',
      enabled: true,
      owner: 'bob',
      target: 'bob-orchestrator',
    },
    {
      id: 'job-005',
      key: 'agent:forge:cron:stale-branch-cleanup',
      name: 'Stale branch cleanup',
      cadence: 'weekly',
      nextRunMs: now + mins(60 * 24 * 6),
      lastRunMs: now - mins(60 * 24 * 1),
      lastRunStatus: 'disabled',
      enabled: false,
      owner: 'forge',
      target: 'github',
    },
  ]

  const nextUpcoming = jobs
    .filter((job) => job.enabled && typeof job.nextRunMs === 'number' && job.nextRunMs >= now)
    .sort((a, b) => a.nextRunMs - b.nextRunMs)[0] || null

  return {
    jobs,
    summary: {
      totalActiveJobs: jobs.filter((job) => job.enabled).length,
      failedOrRecentIssueCount: jobs.filter((job) => job.lastRunStatus === 'failed').length,
      nextUpcomingRun: nextUpcoming
        ? {
            jobId: nextUpcoming.id,
            jobName: nextUpcoming.name,
            nextRunMs: nextUpcoming.nextRunMs,
          }
        : null,
    },
  }
}

export function getMockStats() {
  return {
    totalSessions: 5,
    activeSessions: 4,
    totalAgents: 5,
    activeAgents: 4,
    tasksCompletedToday: 12,
    eventsLast24h: 47,
    successRate: 87,
    uptimeFormatted: '24 d 7 h 12 m',
    avgTaskMs: 11_400,
  }
}

export function getMockHealth() {
  return {
    status: 'healthy',
    uptimeMs: 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000 + 12 * 60 * 1000,
    version: 'mock',
    checks: {
      gateway: 'ok',
      sessions: 'ok',
      channels: 'ok',
    },
    ts: Date.now(),
  }
}
