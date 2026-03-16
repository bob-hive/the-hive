import { AlertTriangle, CalendarClock, TimerReset } from 'lucide-react'

function formatRelative(ts) {
  if (!ts) return '—'
  const diff = ts - Date.now()
  const abs = Math.abs(diff)

  if (abs < 60_000) return diff >= 0 ? 'in <1m' : '<1m ago'
  if (abs < 3_600_000) {
    const mins = Math.round(abs / 60_000)
    return diff >= 0 ? `in ${mins}m` : `${mins}m ago`
  }
  if (abs < 86_400_000) {
    const hrs = Math.round(abs / 3_600_000)
    return diff >= 0 ? `in ${hrs}h` : `${hrs}h ago`
  }

  const days = Math.round(abs / 86_400_000)
  return diff >= 0 ? `in ${days}d` : `${days}d ago`
}

export default function JobsSummaryCard({ summary }) {
  const nextRunLabel = summary?.nextUpcomingRun?.nextRunMs
    ? `${summary.nextUpcomingRun.jobName} · ${formatRelative(summary.nextUpcomingRun.nextRunMs)}`
    : 'No upcoming scheduled run'

  return (
    <section>
      <h2 className="section-title mb-3">Jobs Snapshot</h2>

      <div className="card p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl p-3" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
          <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            <TimerReset size={13} style={{ color: 'var(--color-accent)' }} />
            Active jobs
          </div>
          <p className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {summary?.totalActiveJobs ?? 0}
          </p>
        </div>

        <div className="rounded-xl p-3" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
          <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            <AlertTriangle size={13} style={{ color: 'var(--color-warning)' }} />
            Failed / recent issues
          </div>
          <p className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {summary?.failedOrRecentIssueCount ?? 0}
          </p>
        </div>

        <div className="rounded-xl p-3" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
          <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            <CalendarClock size={13} style={{ color: 'var(--color-online)' }} />
            Next upcoming run
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {nextRunLabel}
          </p>
        </div>
      </div>
    </section>
  )
}
