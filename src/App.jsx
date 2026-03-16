import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import MetricsBar from './components/MetricsBar'
import Trends from './components/Trends'
import AgentGrid from './components/AgentGrid'
import LiveFeed from './components/LiveFeed'
import Timeline from './components/Timeline'
import AlertFeed from './components/AlertFeed'
import ClawHubPanel from './components/ClawHubPanel'
import Footer from './components/Footer'
import { ApiError, fetchAuthState, fetchDashboardData } from './data/api'
import { usePolling } from './hooks/usePolling'

const POLL_INTERVAL_MS = parseInt(import.meta.env.VITE_POLL_INTERVAL_MS || '10000', 10)

function AuthScreen({ title, description, actionLabel, actionHref, details }) {
  return (
    <div className="scanline-overlay min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <main style={{ maxWidth: 760 }} className="mx-auto px-6 py-20">
        <div className="card p-8 animate-fade-in">
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            {description}
          </p>

          {details ? (
            <div
              className="rounded-lg px-4 py-3 text-sm mb-6"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
            >
              {details}
            </div>
          ) : null}

          {actionLabel && actionHref ? (
            <a
              href={actionHref}
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              {actionLabel}
            </a>
          ) : null}
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
  const allowedHint = allowedEmails.length > 0 ? `Allowed: ${allowedEmails.join(', ')}` : ''

  if (state.error?.status === 403 || state.error?.code === 'AUTH_FORBIDDEN') {
    return (
      <AuthScreen
        title="Access denied"
        description="Your account is authenticated but not on the allowlist for The Hive."
        actionLabel="Sign out"
        actionHref="/api/auth/logout"
        details={allowedHint}
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
    trends: [],
    sessions: [],
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

      <main style={{ maxWidth: 1280 }} className="mx-auto px-6 py-8 space-y-10">
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
            <MetricsBar metrics={dashboard.metrics} />

            <AgentGrid agents={dashboard.agents} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <LiveFeed agents={dashboard.agents} events={dashboard.events} />
              <Timeline tasks={dashboard.tasks} agents={dashboard.agents} />
            </div>

            <Trends trends={dashboard.trends} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <AlertFeed alerts={dashboard.alerts} />
              <ClawHubPanel />
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
