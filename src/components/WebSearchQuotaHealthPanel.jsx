import { AlertTriangle, CircleAlert, SearchCheck, ShieldCheck } from 'lucide-react'
import { formatFreshness, isStale } from '../utils/freshness'

const STATUS_STYLE = {
  healthy: { label: 'Healthy', color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
  active: { label: 'Active', color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
  standby: { label: 'Standby', color: '#64748b', bg: 'rgba(148,163,184,0.16)' },
  warning: { label: 'Warning', color: '#b45309', bg: 'rgba(245,158,11,0.16)' },
  degraded: { label: 'Degraded', color: '#b45309', bg: 'rgba(245,158,11,0.16)' },
  exhausted: { label: 'Exhausted', color: '#b91c1c', bg: 'rgba(239,68,68,0.14)' },
  unknown: { label: 'Unknown', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
  no_data: { label: 'No data', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
  not_configured: { label: 'Not configured', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
}

function Badge({ status }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.unknown

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: style.color, background: style.bg }}
    >
      {style.label}
    </span>
  )
}

function ProviderRow({ label, provider }) {
  const name = provider?.name || '—'
  return (
    <div className="flex items-center justify-between gap-2 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
        <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{name}</p>
      </div>
      <Badge status={provider?.status || 'unknown'} />
    </div>
  )
}

export default function WebSearchQuotaHealthPanel({ data = {} }) {
  const critical = Boolean(data?.dualExhaustion?.critical)
  const freshness = formatFreshness(data?.ts || data?.lastAlert?.ts)
  const stale = isStale(data?.ts || data?.lastAlert?.ts)

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="section-title">Web Search Quota Health</h2>
        <div className="text-right">
          <span className="section-chip">{data.noData ? 'NO DATA YET' : 'LIVE LOGS'}</span>
          <p className="text-[11px] mt-1" style={{ color: stale ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
            {freshness}
          </p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {critical ? (
              <CircleAlert size={16} style={{ color: 'var(--color-error)' }} />
            ) : (
              <ShieldCheck size={16} style={{ color: 'var(--color-success)' }} />
            )}
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {critical ? 'Dual-provider exhaustion active' : 'Quota state nominal'}
            </p>
          </div>

          <span className={`tag ${critical ? 'failed' : 'success'}`}>
            {critical ? 'CRITICAL' : 'OK'}
          </span>
        </div>

        <div className="space-y-0">
          <ProviderRow label="Primary" provider={data.providers?.primary} />
          <ProviderRow label="Secondary" provider={data.providers?.secondary} />
          <ProviderRow label="Emergency" provider={data.providers?.emergency} />
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="project-detail-block">
            <p className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Current active provider</p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-primary)' }}>
              {data.currentActiveProvider || '—'}
            </p>
          </div>
          <div className="project-detail-block">
            <p className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Last alert</p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-primary)' }}>
              {data.lastAlert?.at ? new Date(data.lastAlert.at).toLocaleString() : 'No alert logged'}
            </p>
            {data.lastAlert?.reason ? (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{data.lastAlert.reason}</p>
            ) : null}
          </div>
        </div>

        {critical ? (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', color: '#b91c1c' }}>
            <AlertTriangle size={14} className="mt-0.5" />
            <div>
              <p className="font-semibold">Critical quota condition</p>
              <p>
                Consecutive dual over-limit: {data.dualExhaustion?.consecutiveDualOverlimit || 0}
                {' / '}
                threshold {data.dualExhaustion?.threshold || 1}.
              </p>
            </div>
          </div>
        ) : null}

        {data.noData ? (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: 'var(--color-surface-2)', border: '1px dashed var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <SearchCheck size={14} className="mt-0.5" />
            <p>No web-search quota alerts found yet. Panel will auto-populate once logs are produced.</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
