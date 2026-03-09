import { Sun, Zap, RefreshCw } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

const POLLING_OPTIONS = [
  { label: '15s', value: 15_000 },
  { label: '30s', value: 30_000 },
  { label: '60s', value: 60_000 },
]

function formatLastUpdated(date) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export default function Header({ lastUpdated, isRefreshing, onRefresh, intervalMs, onIntervalChange }) {
  const { theme, toggle } = useTheme()
  const isNeon = theme === 'neon'

  return (
    <header
      style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
      className="sticky top-0 z-50"
    >
      <div
        style={{ maxWidth: 1280 }}
        className="mx-auto px-6 py-4 flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="hive-hex">🐝</div>
          <div>
            <h1
              className={`text-lg font-bold leading-none tracking-tight ${isNeon ? 'neon-text animate-neon-title' : ''}`}
              style={{ color: isNeon ? undefined : 'var(--color-text-primary)' }}
            >
              The Hive
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Agent Activity Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap justify-end">
          <div className="hidden lg:flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>Last updated:</span>
            <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
              {formatLastUpdated(lastUpdated)}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>Poll:</span>
            <select
              value={intervalMs}
              onChange={(e) => onIntervalChange(Number(e.target.value))}
              className="rounded-md px-2 py-1"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {POLLING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="theme-toggle"
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <div className="hidden sm:flex items-center gap-2">
            <span className="status-dot online pulse" />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Live
            </span>
          </div>

          <button
            onClick={toggle}
            className="theme-toggle"
            aria-label={`Switch to ${isNeon ? 'light' : 'neon'} theme`}
          >
            {isNeon ? (
              <>
                <Sun size={14} />
                <span>Light</span>
              </>
            ) : (
              <>
                <Zap size={14} />
                <span>Neon</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
