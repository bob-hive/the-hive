import Header from './components/Header'
import MetricsBar from './components/MetricsBar'
import Trends from './components/Trends'
import AgentGrid from './components/AgentGrid'
import LiveFeed from './components/LiveFeed'
import Timeline from './components/Timeline'
import AlertFeed from './components/AlertFeed'
import ClawHubPanel from './components/ClawHubPanel'
import Footer from './components/Footer'
import { fetchDashboardData } from './data/api'
import { usePolling } from './hooks/usePolling'

const POLL_INTERVAL_MS = parseInt(import.meta.env.VITE_POLL_INTERVAL_MS || '10000', 10)

export default function App() {
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
        {/* Offline banner — shown when API is unreachable but we have cached data */}
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

        {/* Hard error with no cached data */}
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
