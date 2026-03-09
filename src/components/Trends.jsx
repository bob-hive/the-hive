import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../context/ThemeContext'

export default function Trends({ trends }) {
  const { theme } = useTheme()
  const isNeon = theme === 'neon'

  const palette = {
    tasks: 'var(--color-accent)',
    successRate: isNeon ? '#39ff85' : '#22c55e',
    uptime: isNeon ? '#ffb800' : '#f59e0b',
    grid: 'var(--color-border)',
    text: 'var(--color-text-secondary)',
    tooltipBg: 'var(--color-surface)',
  }

  return (
    <section>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Trends (Last 7 Days)
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Tasks Completed / Day
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} opacity={0.5} />
                <XAxis dataKey="day" tick={{ fill: palette.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: palette.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: palette.tooltipBg,
                    border: `1px solid ${palette.grid}`,
                    borderRadius: 8,
                    color: 'var(--color-text-primary)',
                  }}
                />
                <Bar dataKey="tasksCompleted" fill={palette.tasks} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Success Rate & Agent Uptime
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} opacity={0.5} />
                <XAxis dataKey="day" tick={{ fill: palette.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" domain={[85, 100]} tick={{ fill: palette.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[94, 100]} tick={{ fill: palette.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: palette.tooltipBg,
                    border: `1px solid ${palette.grid}`,
                    borderRadius: 8,
                    color: 'var(--color-text-primary)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: palette.text }} />
                <Line yAxisId="left" type="monotone" dataKey="successRate" name="Success %" stroke={palette.successRate} strokeWidth={2.25} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="agentUptime" name="Uptime %" stroke={palette.uptime} strokeWidth={2.25} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  )
}
