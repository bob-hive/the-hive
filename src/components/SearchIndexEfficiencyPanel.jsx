import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Activity, CircleAlert } from 'lucide-react'
import { formatFreshness, isStale } from '../utils/freshness'

function statusTag(status) {
  if (status === 'critical') return 'failed'
  if (status === 'warning') return 'pending'
  if (status === 'healthy') return 'success'
  return 'idle'
}

function MetricCell({ label, value }) {
  return (
    <div className="project-detail-block">
      <p className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-sm mt-1" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  )
}

function OperationRow({ label, operation = {} }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          p50 {operation.p50LatencyMs ?? '—'} ms · p95 {operation.p95LatencyMs ?? '—'} ms
        </p>
      </div>
      <div className="text-right">
        <span className={`tag ${statusTag(operation.status)}`}>{operation.status || 'no_data'}</span>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {operation.requestCount || 0} req · {operation.slowQueryCount || 0} slow
        </p>
      </div>
    </div>
  )
}

export default function SearchIndexEfficiencyPanel({ data = {} }) {
  const summary = data.summary || {}
  const thresholds = data.thresholds || { warningMs: 400, criticalMs: 1200 }
  const trend = Array.isArray(data.trend) ? data.trend : []
  const freshness = formatFreshness(data?.ts)
  const stale = isStale(data?.ts)

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="section-title">Search Index Efficiency</h2>
        <div className="text-right">
          <span className={`tag ${statusTag(summary.status)}`}>{summary.status || 'no_data'}</span>
          <p className="text-[11px] mt-1" style={{ color: stale ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
            {freshness}
          </p>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-2 md:grid-cols-4">
          <MetricCell label="Requests (24h)" value={summary.requestCount ?? 0} />
          <MetricCell label="p50 latency" value={summary.p50LatencyMs === null ? '—' : `${summary.p50LatencyMs} ms`} />
          <MetricCell label="p95 latency" value={summary.p95LatencyMs === null ? '—' : `${summary.p95LatencyMs} ms`} />
          <MetricCell label="Slow queries" value={summary.slowQueryCount ?? 0} />
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Context/config/index operations
          </p>
          <OperationRow label="Context Search" operation={data.operations?.contextSearch} />
          <OperationRow label="Config Search" operation={data.operations?.configSearch} />
          <OperationRow label="Index Search" operation={data.operations?.indexSearch} />
        </div>

        <div className="mt-4 h-64">
          {trend.length === 0 ? (
            <div className="h-full rounded-lg border border-dashed flex items-center justify-center text-sm" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
              No trend data yet — waiting for latency events.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
                <XAxis dataKey="label" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    color: 'var(--color-text-primary)',
                  }}
                />
                <Bar yAxisId="right" dataKey="count" name="Request count" fill="var(--color-accent)" opacity={0.35} radius={[5, 5, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="p95" name="p95 (ms)" stroke="var(--color-warning)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
          {summary.status === 'critical' ? <CircleAlert size={14} className="mt-0.5" /> : <Activity size={14} className="mt-0.5" />}
          <p>
            Warning ≥ {thresholds.warningMs} ms · Critical ≥ {thresholds.criticalMs} ms. Slow query count tracks events over warning threshold.
          </p>
        </div>
      </div>
    </section>
  )
}
