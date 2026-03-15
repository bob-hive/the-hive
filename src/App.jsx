import Header from './components/Header'
import MetricsBar from './components/MetricsBar'
import Trends from './components/Trends'
import AgentGrid from './components/AgentGrid'
import LiveFeed from './components/LiveFeed'
import Timeline from './components/Timeline'
import AlertFeed from './components/AlertFeed'
import ClawHubPanel from './components/ClawHubPanel'
import Footer from './components/Footer'
import { fetchMockDashboardData } from './data/mock'
import { usePolling } from './hooks/usePolling'

export default function App() {
  const {
    data,
    error,
    isLoading,
    isRefreshing,
    lastUpdated,
    intervalMs,
    setIntervalMs,
    refresh,
  } = usePolling(fetchMockDashboardData, { defaultIntervalMs: 30_000 })

  const dashboard = data ?? {
    agents: [],
    tasks: [],
    events: [],
    alerts: [],
    trends: [],
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
        isRefreshing={isRefreshing}
        onRefresh={refresh}
        intervalMs={intervalMs}
        onIntervalChange={setIntervalMs}
      />

      <main style={{ maxWidth: 1280 }} className="mx-auto px-6 py-8 space-y-10">
        {error && (
          <div className="card px-4 py-3 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
            Could not refresh data: {error.message}
          </div>
        )}

        {isLoading ? (
          <div className="card px-4 py-8 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            Loading dashboard data…
          </div>
        ) : (
          <>
            <MetricsBar metrics={dashboard.metrics} />

            {/* Agent cards — updated roles + sparklines */}
            <AgentGrid agents={dashboard.agents} />

            {/* Live event feed + task timeline side by side on wide screens */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <LiveFeed agents={dashboard.agents} />
              <Timeline tasks={dashboard.tasks} agents={dashboard.agents} />
            </div>

            <Trends trends={dashboard.trends} />

            {/* Alerts + ClawHub side by side on wide screens */}
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
