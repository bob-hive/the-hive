import { MessageSquareMore } from 'lucide-react'
import backlog from '../data/roadmapBacklog.json'

export default function BacklogPanel() {
  return (
    <section className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="section-title">
          {backlog.title}
        </h2>
        <span className="section-chip" style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}>
          {backlog.project}
        </span>
      </div>

      <div className="card p-5">
        <div
          className="rounded-xl px-3.5 py-3 mb-4 flex items-start gap-2.5"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
          }}
        >
          <MessageSquareMore size={15} style={{ color: 'var(--color-accent)', marginTop: 1, flexShrink: 0 }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {backlog.description}
          </p>
        </div>

        <ul className="space-y-2.5">
          {backlog.items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl px-3.5 py-3"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                  {item.title}
                </p>
                <span className="tag running" style={{ flexShrink: 0 }}>
                  {item.tag}
                </span>
              </div>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
