import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, LockKeyhole, ShieldCheck } from 'lucide-react'
import Header from './components/Header'
import MetricsBar from './components/MetricsBar'
import Trends from './components/Trends'
import AgentGrid from './components/AgentGrid'
import RealTimeStatusPanel from './components/RealTimeStatusPanel'
import LiveFeed from './components/LiveFeed'
import Timeline from './components/Timeline'
import JobsSummaryCard from './components/JobsSummaryCard'
import JobsOperationsPanel from './components/JobsOperationsPanel'
import EscalationsPanel from './components/EscalationsPanel'
import AlertFeed from './components/AlertFeed'
import WebSearchQuotaHealthPanel from './components/WebSearchQuotaHealthPanel'
import SearchIndexEfficiencyPanel from './components/SearchIndexEfficiencyPanel'
import ClawHubPanel from './components/ClawHubPanel'
import BacklogPanel from './components/BacklogPanel'
import ProjectsHub from './components/ProjectsHub'
import Footer from './components/Footer'
import ActivityFeed from './components/ActivityFeed'
import UsageTracker from './components/UsageTracker'
import ChannelActivityPanel from './components/ChannelActivityPanel'
import OvernightBriefing from './components/OvernightBriefing'
import MultiAgentView from './components/MultiAgentView'
import { ApiError, fetchAuthState, fetchDashboardData } from './data/api'
import { usePolling } from './hooks/usePolling'

const POLL_INTERVAL_MS = parseInt(import.meta.env.VITE_POLL_INTERVAL_MS || '10000', 10)
// Feature flags default to true — set to 'false' in env to disable
const ENABLE_REALTIME_STATUS_PANEL = import.meta.env.VITE_ENABLE_REALTIME_STATUS_PANEL !== 'false'
const ENABLE_ACTIVITY_FEED = import.meta.env.VITE_ENABLE_ACTIVITY_FEED !== 'false'
const ENABLE_USAGE_TRACKER = import.meta.env.VITE_ENABLE_USAGE_TRACKER !== 'false'

function AuthScreen({
  title,
  description,
  actionLabel,
  actionHref,
  details,
  tone = 'neutral',
}) {
  const toneConfig = {
    neutral: {
      icon: ShieldCheck,
      iconColor: 'var(--color-accent)',
      iconBg: 'var(--color-accent-soft)',
      badge: 'Secure session check',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'var(--color-warning)',
      iconBg: 'rgba(245,158,11,0.14)',
      badge: 'Access issue',
    },
    denied: {
      icon: LockKeyhole,
      iconColor: 'var(--color-error)',
      iconBg: 'rgba(239,68,68,0.14)',
      badge: 'Allowlist required',
    },
  }[tone]

  const ToneIcon = toneConfig.icon

  return (
    <div className="scanline-overlay auth-shell" style={{ background: 'var(--color-bg)' }}>
      <main style={{ maxWidth: 760 }} className="mx-auto px-6 py-20">
        <div className="card auth-card animate-fade-in">
          <span className="auth-badge" style={{ color: toneConfig.iconColor, background: toneConfig.iconBg }}>
            <ToneIcon size={13} />
            {toneConfig.badge}
          </span>

          <h1 className="text-3xl font-bold mb-2 mt-4" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h1>
          <p className="text-sm mb-5" style={{ color: 'var(--color-text-secondary)' }}>
            {description}
          </p>

          {details ? (
            <div className="auth-note text-sm mb-6">
              {details}
            </div>
          ) : null}

          {actionLabel && actionHref ? (
            <a
              href={actionHref}
              className="auth-primary-action"
            >
              {actionLabel}
            </a>
          ) : null}

          <p className="text-xs mt-5" style={{ color: 'var(--color-text-muted)' }}>
            Need access updates? Ask Ani to update the allowlist.
          </p>
        </div>
      </main>
    </div>
  )
}

function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })

  const authStatusParam = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('auth')
  }, [])

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const data = await fetchAuthState()
        if (active) setState({ loading: false, data, error: null })
      } catch (error) {
        if (!active) return
        if (error instanceof ApiError) {
          setState({ loading: false, data: null, error })
          return
        }

        setState({
          loading: false,
          data: null,
          error: new ApiError('Unable to verify your session', { status: 500 }),
        })
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  if (state.loading) {
    return (
      <AuthScreen
        title="Checking access…"
        description="Verifying your Hive session."
      />
    )
  }

  if (state.data?.authenticated) {
    return children
  }

  const allowedEmails = state.data?.allowedEmails || []
  const allowedHint = allowedEmails.length > 0 ? `Allowed accounts: ${allowedEmails.join(', ')}` : ''

  if (state.error?.status === 403 || state.error?.code === 'AUTH_FORBIDDEN') {
    return (
      <AuthScreen
        title="Access denied"
        description="Your account is authenticated but not currently on The Hive allowlist."
        actionLabel="Sign out"
        actionHref="/api/auth/logout"
        details={allowedHint}
        tone="denied"
      />
    )
  }

  const statusMessage = {
    cancelled: 'Sign-in was cancelled. Try again when ready.',
    invalid_state: 'Login session expired or invalid. Please retry sign-in.',
    unauthorized: 'That Google account is not on the allowlist for this dashboard.',
    error: 'Authentication failed. Please retry.',
    signed_out: 'You have been signed out.',
  }[authStatusParam]

  return (
    <AuthScreen
      title="Sign in required"
      description="Authenticate with Google to access The Hive dashboard and API."
      actionLabel="Continue with Google"
      actionHref="/api/auth/login"
      details={[statusMessage, allowedHint].filter(Boolean).join(' ')}
      tone={statusMessage ? 'warning' : 'neutral'}
    />
  )
}

function Dashboard() {
  const {
    data,
    error,
    isLoading,
    isRefreshing,
    isOffline,
    lastUpdated,
    secondsSince,
    intervalMs,
    setIntervalMs,
    refresh,
  } = usePolling(fetchDashboardData, { defaultIntervalMs: POLL_INTERVAL_MS })

  const dashboard = data ?? {
    agents: [],
    tasks: [],
    events: [],
    alerts: [],
    escalations: [],
    trends: [],
    sessions: [],
    jobs: [],
    jobsSummary: {
      totalActiveJobs: 0,
      failedOrRecentIssueCount: 0,
      nextUpcomingRun: null,
    },
    webSearchQuota: {
      providers: {
        primary: { name: 'tavily', status: 'unknown', reason: null },
        secondary: { name: 'serpapi', status: 'unknown', reason: null },
        emergency: { name: 'duckduckgo', status: 'unknown', reason: null },
      },
      currentActiveProvider: null,
      dualExhaustion: { critical: false, threshold: 1, consecutiveDualOverlimit: 0 },
      lastAlert: null,
      noData: true,
    },
    searchIndexEfficiency: {
      summary: {
        requestCount: 0,
        p50LatencyMs: null,
        p95LatencyMs: null,
        slowQueryCount: 0,
        status: 'no_data',
      },
      operations: {
        contextSearch: { requestCount: 0, p50LatencyMs: null, p95LatencyMs: null, slowQueryCount: 0, status: 'no_data' },
        configSearch: { requestCount: 0, p50LatencyMs: null, p95LatencyMs: null, slowQueryCount: 0, status: 'no_data' },
        indexSearch: { requestCount: 0, p50LatencyMs: null, p95LatencyMs: null, slowQueryCount: 0, status: 'no_data' },
      },
      trend: [],
      thresholds: { warningMs: 400, criticalMs: 1200 },
      noData: true,
    },
    realtimeStatusPanel: {
      source: 'MOCK',
      mode: 'MOCK',
      mock: true,
      freshness: {
        source: 'MOCK',
        mode: 'MOCK',
        observedAtMs: 0,
        generatedAtMs: 0,
        ageMs: 0,
        staleAfterMs: 90_000,
        stale: false,
      },
      counts: {
        total: 0,
        busy: 0,
        online: 0,
        idle: 0,
        error: 0,
      },
      agents: [],
      ts: 0,
    },
    agentsMeta: {
      source: 'MOCK',
      isMock: true,
      ts: 0,
      pushedAt: null,
      staleMs: null,
    },
    activityMeta: {
      source: 'MOCK',
      isMock: true,
      ts: 0,
      pushedAt: null,
      staleMs: null,
    },
    alertsMeta: {
      source: 'MOCK',
      isMock: true,
      latestTs: 0,
      ts: 0,
      updatedAt: null,
    },
    escalationsMeta: {
      source: 'LIVE',
      updatedAt: null,
      ts: 0,
      dispatchMode: 'dry-run',
    },
    metrics: {
      tasksCompletedToday: 0,
      activeSessions: 0,
      uptimeFormatted: '—',
      successRate: 0,
      avgTaskMs: 0,
      totalAgents: 0,
    },
  }

  return (
    <div className="scanline-overlay min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Header
        lastUpdated={lastUpdated}
        secondsSince={secondsSince}
        isRefreshing={isRefreshing}
        isOffline={isOffline}
        onRefresh={refresh}
        intervalMs={intervalMs}
        onIntervalChange={setIntervalMs}
        isMock={data?._isMock}
      />

      <main style={{ maxWidth: 1280 }} className="dashboard-main mx-auto px-6 py-8 space-y-10">
        {isOffline && data && (
          <div
            className="card px-4 py-3 text-sm flex items-center gap-2"
            style={{ borderColor: 'var(--color-busy)', color: 'var(--color-busy)' }}
          >
            <span>⚡</span>
            <span>
              API unreachable — showing last cached data
              {secondsSince > 0 && ` (${secondsSince}s ago)`}.{' '}
              <button
                onClick={refresh}
                className="underline"
                style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Retry
              </button>
            </span>
          </div>
        )}

        {error && !isOffline && !data && (
          <div
            className="card px-4 py-3 text-sm"
            style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
          >
            Could not load data: {error.message}
          </div>
        )}

        {isLoading && !data ? (
          <div className="card px-4 py-8 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            Loading dashboard data…
          </div>
        ) : (
          <>
            <EscalationsPanel
              escalations={dashboard.escalations}
              meta={dashboard.escalationsMeta}
              onRefresh={refresh}
            />

            <BacklogPanel />

            <AlertFeed alerts={dashboard.alerts} meta={dashboard.alertsMeta} />

            <MetricsBar
              metrics={dashboard.metrics}
              agents={dashboard.agents}
              events={dashboard.events}
            />

            <JobsSummaryCard summary={dashboard.jobsSummary} />

            {/* Agent status: always show cards grid; also show compact panel when enabled */}
            <AgentGrid agents={dashboard.agents} />

            <MultiAgentView sessions={dashboard.sessions} events={dashboard.events} />

            {ENABLE_REALTIME_STATUS_PANEL && dashboard.realtimeStatusPanel?.agents?.length > 0 && (
              <RealTimeStatusPanel panel={dashboard.realtimeStatusPanel} />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <LiveFeed agents={dashboard.agents} events={dashboard.events} meta={dashboard.activityMeta} />
              <Timeline tasks={dashboard.tasks} agents={dashboard.agents} />
            </div>

            <ProjectsHub />

            <Trends trends={dashboard.trends} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <WebSearchQuotaHealthPanel data={dashboard.webSearchQuota} />
              <SearchIndexEfficiencyPanel data={dashboard.searchIndexEfficiency} />
            </div>

            <JobsOperationsPanel jobs={dashboard.jobs} />

            <ClawHubPanel />

            {/* Activity Feed + Usage Tracker */}
            {(ENABLE_ACTIVITY_FEED || ENABLE_USAGE_TRACKER) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {ENABLE_ACTIVITY_FEED && <ActivityFeed />}
                {ENABLE_USAGE_TRACKER && <UsageTracker />}
              </div>
            )}

            {/* Channel Activity + Overnight Briefing */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ChannelActivityPanel />
              <OvernightBriefing />
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  )
}
