import AgentCard from './AgentCard'

export default function AgentGrid({ agents }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Agents
        </h2>
        <span
          className="text-xs tabular-nums"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {agents.filter((a) => a.status !== 'idle').length} active · {agents.length} total
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
        {agents.map((agent, i) => (
          <AgentCard key={agent.id} agent={agent} index={i} />
        ))}
      </div>
    </section>
  )
}
