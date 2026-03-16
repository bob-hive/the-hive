import { Sun, Zap, RefreshCw, WifiOff, FlaskConical } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

const POLLING_OPTIONS = [
  { label: '10s', value: 10_000 },
  { label: '15s', value: 15_000 },
  { label: '30s', value: 30_000 },
  { label: '60s', value: 60_000 },
]

function formatLastUpdated(date, secondsSince) {
  if (!date) return '—'
  if (secondsSince !== undefined && secondsSince < 5) return 'just now'
  if (secondsSince !== undefined && secondsSince < 60) return `${secondsSince}s ago`
  if (secondsSince !== undefined && secondsSince < 3600) return `${Math.floor(secondsSince / 60)}m ago`
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export default function Header({
  lastUpdated,
  secondsSince,
  isRefreshing,
  isOffline,
  isMock,
  onRefresh,
  intervalMs,
  onIntervalChange,
}) {
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
        {/* Logo + title */}
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

        {/* Right controls */}
        <div className="flex items-center gap-4 flex-wrap justify-end">
          {/* Last updated */}
          <div className="hidden lg:flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>Updated:</span>
            <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
              {formatLastUpdated(lastUpdated, secondsSince)}
            </span>
          </div>

          {/* Mock mode badge */}
          {isMock && (
            <span
              className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              title="Mock data — configure OPENCLAW_API_TOKEN to connect to live data"
              style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--color-busy)', border: '1px solid rgba(245,158,11,0.25)' }}
            >
              <FlaskConical size={10} />
              mock
            </span>
          )}

          {/* Offline badge */}
          {isOffline && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <WifiOff size={10} />
              offline
            </span>
          )}

          {/* Poll interval */}
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

          {/* Refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            className="theme-toggle"
            aria-label="Refresh dashboard"
            disabled={isRefreshing}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-2">
            <span
              className="status-dot"
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                display: 'inline-block',
                background: isOffline ? 'var(--color-error)' : 'var(--color-success)',
                animation: isOffline ? 'none' : 'pulse-dot 2s ease-in-out infinite',
              }}
            />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {isOffline ? 'Offline' : 'Live'}
            </span>
          </div>

          {/* Theme toggle */}
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

          {/* Sign out */}
          <a href="/api/auth/logout" className="theme-toggle" aria-label="Sign out of The Hive">
            Sign out
          </a>
        </div>
      </div>
    </header>
  )
}
