import { useState } from 'react'
import { AlertTriangle, Info, Siren, ChevronDown } from 'lucide-react'
import { relativeTime } from '../data/mock'
import { useTheme } from '../context/ThemeContext'

const SEVERITY_CONFIG = {
  critical: {
    icon: Siren,
    label: 'Critical',
    light: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.24)' },
    neon: { color: '#ff4560', bg: 'rgba(255,69,96,0.12)', border: 'rgba(255,69,96,0.35)' },
  },
  warning: {
    icon: AlertTriangle,
    label: 'Warning',
    light: { color: '#d97706', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.28)' },
    neon: { color: '#ffb800', bg: 'rgba(255,184,0,0.12)', border: 'rgba(255,184,0,0.35)' },
  },
  info: {
    icon: Info,
    label: 'Info',
    light: { color: '#2563eb', bg: 'rgba(37,99,235,0.1)', border: 'rgba(37,99,235,0.24)' },
    neon: { color: '#60a5fa', bg: 'rgba(96,165,250,0.14)', border: 'rgba(96,165,250,0.35)' },
  },
}

export default function AlertFeed({ alerts }) {
  const [open, setOpen] = useState(true)
  const { theme } = useTheme()
  const isNeon = theme === 'neon'

  return (
    <section>
      <button
        type="button"
        className="w-full flex items-center justify-between mb-3"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="section-title">
          Alert Feed
        </h2>
        <ChevronDown
          size={14}
          style={{
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {open && (
        <div className="card overflow-hidden">
          <ul>
            {alerts.map((alert, index) => {
              const cfg = SEVERITY_CONFIG[alert.severity]
              const colors = isNeon ? cfg.neon : cfg.light
              const Icon = cfg.icon
              const isLast = index === alerts.length - 1

              return (
                <li
                  key={alert.id}
                  className="px-4 py-3"
                  style={{
                    borderBottom: isLast ? 'none' : `1px solid var(--color-border)`,
                  }}
                >
                  <div
                    className="rounded-lg px-3 py-2.5"
                    style={{
                      background: colors.bg,
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon size={14} style={{ color: colors.color }} />
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.color }}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{alert.message}</p>
                    <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {alert.agentName} · {relativeTime(alert.timestamp)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
