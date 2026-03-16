import { useMemo, useState } from 'react'

const CADENCE_FILTERS = ['all', 'hourly', 'daily', 'weekly', 'monthly', 'unknown']
const STATUS_FILTERS = ['all', 'success', 'failed', 'running', 'pending', 'unknown', 'enabled', 'disabled']

function formatDateTime(ts) {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ts))
}

function normalizeText(value) {
  return String(value || '').toLowerCase()
}

function statusTagClass(status) {
  if (status === 'failed' || status === 'error') return 'failed'
  if (status === 'success') return 'success'
  if (status === 'pending' || status === 'running') return 'running'
  return 'idle'
}

export default function JobsOperationsPanel({ jobs = [] }) {
  const [cadenceFilter, setCadenceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (cadenceFilter !== 'all' && normalizeText(job.cadence) !== cadenceFilter) return false

      if (statusFilter !== 'all') {
        if (statusFilter === 'enabled') return job.enabled === true
        if (statusFilter === 'disabled') return job.enabled === false
        return normalizeText(job.lastRunStatus) === statusFilter
      }

      return true
    })
  }, [jobs, cadenceFilter, statusFilter])

  return (
    <section className="animate-fade-in" style={{ animationDelay: '0.35s' }}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="section-title">Jobs Operations</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Reminders / cron / recurring jobs visibility and run health.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label style={{ color: 'var(--color-text-muted)' }}>Cadence</label>
          <select
            value={cadenceFilter}
            onChange={(e) => setCadenceFilter(e.target.value)}
            className="rounded-md px-2 py-1"
            style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {CADENCE_FILTERS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <label style={{ color: 'var(--color-text-muted)' }}>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md px-2 py-1"
            style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 860 }}>
          <thead>
            <tr style={{ color: 'var(--color-text-muted)', textAlign: 'left' }}>
              <th className="py-2 pr-3 font-semibold">Job</th>
              <th className="py-2 pr-3 font-semibold">Cadence</th>
              <th className="py-2 pr-3 font-semibold">Next run</th>
              <th className="py-2 pr-3 font-semibold">Last run status</th>
              <th className="py-2 pr-3 font-semibold">Enabled</th>
              <th className="py-2 pr-3 font-semibold">Owner</th>
              <th className="py-2 pr-3 font-semibold">Target</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  No jobs match current filters.
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => (
                <tr key={job.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td className="py-3 pr-3" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {job.name}
                  </td>
                  <td className="py-3 pr-3">
                    <span className="tag idle">{job.cadence || 'unknown'}</span>
                  </td>
                  <td className="py-3 pr-3" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatDateTime(job.nextRunMs)}
                  </td>
                  <td className="py-3 pr-3">
                    <span className={`tag ${statusTagClass(normalizeText(job.lastRunStatus))}`}>
                      {job.lastRunStatus || 'unknown'}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <span className={`tag ${job.enabled ? 'online' : 'idle'}`}>
                      {job.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </td>
                  <td className="py-3 pr-3" style={{ color: 'var(--color-text-secondary)' }}>{job.owner || '—'}</td>
                  <td className="py-3 pr-3" style={{ color: 'var(--color-text-secondary)' }}>{job.target || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
          TODO(hive-p1.2): add job controls from UI (pause/resume/edit) once write-capable endpoints are ready.
        </p>
      </div>
    </section>
  )
}
