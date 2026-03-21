import { useMemo } from 'react'
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Cpu,
  GitBranch,
  GitCommit,
  Layers,
  Network,
  Play,
  Zap,
} from 'lucide-react'

const AGENT_CONFIG = {
  bob: { name: 'Bob', icon: '😎', color: 'var(--color-accent)' },
  scout: { name: 'Scout', icon: '🔍', color: '#60a5fa' },
  forge: { name: 'Forge', icon: '🔨', color: '#f59e0b' },
  ledger: { name: 'Ledger', icon: '📊', color: '#a78bfa' },
  sentinel: { name: 'Sentinel', icon: '🛡️', color: '#34d399' },
  unknown: { name: 'Agent', icon: '🤖', color: 'var(--color-text-muted)' },
}

function relativeTime(ms) {
  if (!ms) return ''
  const diff = Date.now() - ms
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

function Node({ session, events, depth = 0, isLast = false, children }) {
  const agent = AGENT_CONFIG[session.agentId] || AGENT_CONFIG.unknown
  const status = session.status || 'unknown'
  const isActive = status === 'active' || status === 'running'
  const isCompleted = status === 'completed' || status === 'success' || status === 'done'

  // Find most recent event for this session
  const sessionEvents = events.filter(e => e.id.includes(session.id) || e.agentId === session.agentId).sort((a, b) => b.timestamp - a.timestamp)
  const latestEvent = sessionEvents[0]

  const healthColor = isActive ? agent.color : isCompleted ? 'var(--color-online)' : 'var(--color-text-muted)'
  const glowStyle = isActive ? { boxShadow: `0 0 12px ${healthColor}44`, borderColor: healthColor } : {}

  return (
    <div className="relative">
      {/* Connection lines */}
      {depth > 0 && (
        <>
          <div
            className="absolute left-[-20px] top-[-10px] w-px h-[36px]"
            style={{ background: 'var(--color-border)' }}
          />
          <div
            className="absolute left-[-20px] top-[26px] w-[20px] h-px"
            style={{ background: 'var(--color-border)' }}
          />
        </>
      )}

      <div
        className={`flex items-center gap-3 p-3 rounded-xl border mb-3 transition-all duration-300 ${isActive ? 'animate-pulse-slow' : ''}`}
        style={{
          background: 'var(--color-surface-1)',
          borderColor: 'var(--color-border)',
          marginLeft: depth * 32,
          ...glowStyle
        }}
      >
        <div className="relative">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
            style={{ background: 'var(--color-surface-2)' }}
          >
            {agent.icon}
          </div>
          {isActive && (
            <span
              className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-surface-1"
              style={{ background: 'var(--color-online)' }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {session.label || agent.name}
            </h4>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
              {relativeTime(session.lastActiveMs)}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            {latestEvent ? (
              <p className="text-xs truncate italic" style={{ color: 'var(--color-text-secondary)' }}>
                {latestEvent.message || latestEvent.summary}
              </p>
            ) : (
              <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                {session.status}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-2">
          {isActive && (
            <Zap size={14} className="text-accent animate-pulse" style={{ color: 'var(--color-accent)' }} />
          )}
          {isCompleted && (
            <CheckCircle2 size={14} style={{ color: 'var(--color-online)' }} />
          )}
        </div>
      </div>

      {children && (
        <div className="ml-4">
          {children}
        </div>
      )}
    </div>
  )
}

export default function MultiAgentView({ sessions = [], events = [] }) {
  const tree = useMemo(() => {
    // 1. Find the root (Bob/Main)
    const mainSession = sessions.find(s => s.agentId === 'bob' && !s.key.includes(':subagent:')) || sessions[0]
    if (!mainSession) return null

    // 2. Identify subagents and link them to parents
    // Since we don't have explicit parentId, we use key heuristics
    // agent:main:subagent:scout-001 -> parent is agent:main
    const nodes = sessions.map(s => ({
      ...s,
      children: []
    }))

    const rootNodes = []
    const nodeMap = {}
    nodes.forEach(n => { nodeMap[n.key] = n })

    nodes.forEach(node => {
      const keyParts = node.key.split(':')
      if (keyParts.includes('subagent')) {
        // Find parent: remove "subagent:<id>" from end
        // e.g. agent:main:subagent:scout-001 -> agent:main
        const subIdx = keyParts.indexOf('subagent')
        const parentKeyPrefix = keyParts.slice(0, subIdx).join(':')

        // Find a session that starts with this parentKeyPrefix and is NOT a subagent itself (or is the closest parent)
        const parent = nodes.find(p => p.key === parentKeyPrefix || (p.agentId === 'bob' && !p.key.includes(':subagent:')))

        if (parent && parent !== node) {
          parent.children.push(node)
        } else {
          rootNodes.push(node)
        }
      } else if (node.agentId === 'bob') {
        rootNodes.push(node)
      } else {
        // Other top-level sessions (cron, etc.)
        // For this view, we might only want to show the Bob-led tree
        // but let's include them for completeness if they aren't subagents
        rootNodes.push(node)
      }
    })

    // Filter to only show one main Bob session as root if multiple exist, or group them
    return rootNodes.filter((n, i, self) => n.agentId === 'bob' || i === 0).slice(0, 1)
  }, [sessions])

  if (!tree || tree.length === 0) {
    return (
      <section>
        <h2 className="section-title mb-3">Multi-agent View</h2>
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <Network size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No active multi-agent sessions detected.</p>
        </div>
      </section>
    )
  }

  const renderTree = (nodes, depth = 0) => {
    return nodes.map((node, i) => (
      <Node
        key={node.id}
        session={node}
        events={events}
        depth={depth}
        isLast={i === nodes.length - 1}
      >
        {node.children && node.children.length > 0 && renderTree(node.children, depth + 1)}
      </Node>
    ))
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Network size={16} style={{ color: 'var(--color-accent)' }} />
          <h2 className="section-title">Multi-agent View</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--color-text-muted)' }}>
          Live Linkage
        </span>
      </div>

      <div className="card p-6 overflow-hidden">
        <div className="relative">
          {renderTree(tree)}
        </div>
      </div>
    </section>
  )
}
