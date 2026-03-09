import { Sun, Zap } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function Header() {
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
        className="mx-auto px-6 py-4 flex items-center justify-between"
      >
        {/* Logo */}
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

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="status-dot online pulse" />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Live
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
        </div>
      </div>
    </header>
  )
}
