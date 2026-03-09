import { useTheme } from './context/ThemeContext'
import Header from './components/Header'
import MetricsBar from './components/MetricsBar'
import AgentGrid from './components/AgentGrid'
import TaskFeed from './components/TaskFeed'
import Footer from './components/Footer'

export default function App() {
  const { theme } = useTheme()

  return (
    <div className={`scanline-overlay min-h-screen`} style={{ background: 'var(--color-bg)' }}>
      <Header />

      <main style={{ maxWidth: 1280 }} className="mx-auto px-6 py-8 space-y-10">
        <MetricsBar />
        <AgentGrid />
        <TaskFeed />
      </main>

      <Footer />
    </div>
  )
}
