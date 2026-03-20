import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  ChevronDown,
  CircleDot,
  Info,
  Siren,
  ShieldAlert,
  ShieldCheck,
  CopyCheck,
} from 'lucide-react'
import { relativeTime } from '../data/mock'
import { useTheme } from '../context/ThemeContext'

const SEVERITY_CONFIG = {
  critical: {
    icon: Siren,
    label: 'Critical',
    light: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.24)' },
    neon: { color: '#ff4560', bg: 'rgba(255,69,96,0.12)', border: 'rgba(255,69,96,0.35)' },
  },
  high: {
    icon: AlertTriangle,
    label: 'High',
    light: { color: '#ea580c', bg: 'rgba(234,88,12,0.10)', border: 'rgba(234,88,12,0.28)' },
    neon: { color: '#fb923c', bg: 'rgba(251,146,60,0.14)', border: 'rgba(251,146,60,0.34)' },
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
  medium: {
    icon: Info,
    label: 'Medium',
    light: { color: '#2563eb', bg: 'rgba(37,99,235,0.1)', border: 'rgba(37,99,235,0.24)' },
    neon: { color: '#60a5fa', bg: 'rgba(96,165,250,0.14)', border: 'rgba(96,165,250,0.35)' },
  },
  low: {
    icon: Info,
    label: 'Low',
    light: { color: '#0e7490', bg: 'rgba(14,116,144,0.10)', border: 'rgba(14,116,144,0.25)' },
    neon: { color: '#22d3ee', bg: 'rgba(34,211,238,0.12)', border: 'rgba(34,211,238,0.30)' },
  },
}

function EscalationBadge({ escalation }) {
  if (!escalation?.escalated) return null

  const isAni = escalation.target === 'ani'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: isAni ? 'rgba(220,38,38,0.12)' : 'rgba(234,88,12,0.12)',
        color: isAni ? '#b91c1c' : '#c2410c',
        border: `1px solid ${isAni ? 'rgba(220,38,38,0.28)' : 'rgba(234,88,12,0.28)'}`,
      }}
      title={escalation.reason || 'Escalated'}
    >
      <ShieldAlert size={11} />
      Escalated → {isAni ? 'Ani' : 'Bob'}
    </span>
  )
}

function SuppressionBadge({ suppressedCount }) {
  const count = Number(suppressedCount || 0)
  if (count <= 0) return null

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: 'rgba(37,99,235,0.10)',
        color: '#1d4ed8',
        border: '1px solid rgba(37,99,235,0.24)',
      }}
      title={`Suppressed ${count} duplicate event${count === 1 ? '' : 's'}`}
    >
      <CopyCheck size={11} />
      +{count} suppressed
    </span>
  )
}

function AlertCard({ alert, isNeon, fallbackTs }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.warning
  const colors = isNeon ? cfg.neon : cfg.light
  const Icon = cfg.icon

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: colors.color }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.color }}>
            {cfg.label} · {alert.lane || 'noise'}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {(Number(alert.confidence || 0) * 100).toFixed(0)}%
        </span>
      </div>

      <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {alert.title || alert.message}
      </p>
      {alert.message && alert.title ? (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{alert.message}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <EscalationBadge escalation={alert.escalation} />
        <SuppressionBadge suppressedCount={alert.suppressedCount} />
      </div>

      <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {alert.source || 'unknown'} · {alert.ts || fallbackTs ? relativeTime(alert.ts || fallbackTs) : '—'}
      </p>
    </div>
  )
}

function EscalationSummary({ count }) {
  const value = Number(count || 0)
  const hasEscalations = value > 0

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        border: `1px solid ${hasEscalations ? 'rgba(220,38,38,0.25)' : 'var(--color-border)'}`,
        background: hasEscalations ? 'rgba(220,38,38,0.06)' : 'var(--color-bg-secondary)',
      }}
    >
      <div className="flex items-center gap-2">
        {hasEscalations ? (
          <ShieldAlert size={14} style={{ color: '#b91c1c' }} />
        ) : (
          <ShieldCheck size={14} style={{ color: 'var(--color-success)' }} />
        )}
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
          Escalation summary
        </p>
      </div>
      <p className="text-sm mt-1" style={{ color: 'var(--color-text-primary)' }}>
        {hasEscalations ? `${value} escalated alert${value === 1 ? '' : 's'} need attention` : 'No escalated alerts pending'}
      </p>
    </div>
  )
}

export default function AlertFeed({ alerts = [], meta = {} }) {
  const [noiseOpen, setNoiseOpen] = useState(false)
  const { theme } = useTheme()
  const isNeon = theme === 'neon'

  const { signalAlerts, noiseAlerts, escalatedCount } = useMemo(() => {
    const signal = []
    const noise = []
    let escalated = 0

    alerts.forEach((alert) => {
      if (alert.lane === 'signal') {
        signal.push(alert)
      } else {
        noise.push(alert)
      }

      if (alert.lane === 'signal' && alert.status !== 'resolved' && alert.escalation?.escalated) {
        escalated += 1
      }
    })

    return {
      signalAlerts: signal,
      noiseAlerts: noise,
      escalatedCount: escalated,
    }
  }, [alerts])

  const freshnessTs = meta.latestTs || meta.ts

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="section-title">Alerts — Signal vs Noise</h2>

        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {(() => {
            const source = meta.source || (meta.isMock ? 'MOCK' : 'LIVE')
            const isStaleSource = source === 'STALE' || (meta.pushedAt && Date.now() - meta.pushedAt > 5 * 60_000)
            const isMockSource = source === 'MOCK' || meta.isMock
            const label = isMockSource ? '🔴 MOCK' : isStaleSource ? '🟡 STALE' : '🟢 LIVE'
            const bg = isMockSource ? 'rgba(245,158,11,0.12)' : isStaleSource ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)'
            const color = isMockSource ? '#b45309' : isStaleSource ? '#92400e' : '#047857'
            return (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-1"
                style={{ background: bg, color }}>
                <CircleDot size={11} />
                {label}
              </span>
            )
          })()}
          <span>Freshness: {freshnessTs ? relativeTime(freshnessTs) : '—'}</span>
        </div>
      </div>

      <div className="mb-3">
        <EscalationSummary count={escalatedCount} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <BellRing size={14} style={{ color: 'var(--color-error)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Signal lane ({signalAlerts.length})
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            High-confidence, actionable alerts first.
          </p>
        </div>

        <div className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          {signalAlerts.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No urgent signal alerts.</p>
          ) : signalAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} isNeon={isNeon} fallbackTs={freshnessTs} />
          ))}
        </div>

        <div className="px-4 py-3">
          <button
            type="button"
            className="w-full flex items-center justify-between"
            onClick={() => setNoiseOpen((value) => !value)}
          >
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Noise lane ({noiseAlerts.length})
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Duplicate / transient / low-confidence alerts.
              </p>
            </div>

            <ChevronDown
              size={14}
              style={{
                color: 'var(--color-text-muted)',
                transform: noiseOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>

          {noiseOpen && (
            <div className="mt-3 space-y-2">
              {noiseAlerts.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No noise alerts.</p>
              ) : noiseAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} isNeon={isNeon} fallbackTs={freshnessTs} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
