import { useState } from 'react'
import { ExternalLink, Package, Send, Sparkles } from 'lucide-react'

const FEATURED_SKILLS = [
  { id: 'gh-issues',    emoji: '🐙', name: 'gh-issues',       desc: 'GitHub issue triage & PR automation' },
  { id: 'gog',          emoji: '📅', name: 'gog',              desc: 'Google Workspace: Gmail, Calendar, Drive' },
  { id: 'blogwatcher',  emoji: '📡', name: 'blogwatcher',      desc: 'Monitor RSS/Atom feeds for updates' },
  { id: 'openai-image', emoji: '🎨', name: 'openai-image-gen', desc: 'Batch image generation via OpenAI' },
]

export default function ClawHubPanel() {
  const [skillRequest, setSkillRequest] = useState('')
  const [sent, setSent] = useState(false)

  const handleRequest = () => {
    if (!skillRequest.trim()) return
    // In production: POST to Bob's orchestrator endpoint or open a Telegram thread
    console.info('[ClawHub] Skill request to Bob:', skillRequest)
    setSent(true)
    setTimeout(() => {
      setSent(false)
      setSkillRequest('')
    }, 3000)
  }

  return (
    <section className="animate-fade-in" style={{ animationDelay: '0.35s' }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">
          ClawHub Skills
        </h2>
        <a
          href="https://clawhub.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-all duration-200"
          style={{
            background: 'var(--color-accent)',
            color: '#fff',
            boxShadow: 'var(--glow-accent)',
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={11} />
          Browse clawhub.ai
        </a>
      </div>

      <div className="card p-5 flex flex-col gap-5">
        {/* Featured skills grid */}
        <div>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            Featured skills available in the registry:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FEATURED_SKILLS.map((skill) => (
              <a
                key={skill.id}
                href={`https://clawhub.ai/skills/${skill.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 group"
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                <span className="text-xl flex-shrink-0">{skill.emoji}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {skill.name}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {skill.desc}
                  </p>
                </div>
                <Package
                  size={12}
                  className="ml-auto flex-shrink-0"
                  style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}
                />
              </a>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--color-border)' }} />

        {/* Request skill form */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={13} style={{ color: 'var(--color-accent)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              Request a skill from Bob
            </p>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            Describe the skill you need and Bob will handle the install from ClawHub.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. 'calendar reminders via Notion'"
              value={skillRequest}
              onChange={(e) => setSkillRequest(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRequest()}
              disabled={sent}
              className="flex-1 text-xs px-3 py-2 rounded-lg outline-none transition-all duration-200"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            />
            <button
              onClick={handleRequest}
              disabled={sent || !skillRequest.trim()}
              className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-all duration-200"
              style={{
                background: sent ? 'rgba(34,197,94,0.15)' : 'var(--color-accent)',
                color: sent ? 'var(--color-success)' : '#fff',
                border: sent ? '1px solid rgba(34,197,94,0.4)' : '1px solid transparent',
                opacity: !sent && !skillRequest.trim() ? 0.5 : 1,
                cursor: sent || !skillRequest.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {sent ? (
                <>✓ Sent to Bob</>
              ) : (
                <>
                  <Send size={11} />
                  Request
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
