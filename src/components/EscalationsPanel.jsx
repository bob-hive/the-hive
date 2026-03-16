import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Send } from 'lucide-react'
import { relativeTime } from '../data/mock'
import { acknowledgeEscalation, resolveEscalation, retryEscalationDispatch } from '../data/api'

function stateTag(state) {
  const normalized = String(state || '').toLowerCase()
  if (normalized === 'failed') return 'failed'
  if (normalized === 'acknowledged') return 'running'
  if (normalized === 'dispatched') return 'pending'
  return 'pending'
}

export default function EscalationsPanel({ escalations = [], meta = {}, onRefresh }) {
  const [pendingActionId, setPendingActionId] = useState('')
  const [error, setError] = useState('')

  const sortedEscalations = useMemo(() => {
    return [...escalations].sort((a, b) => {
      const aTs = new Date(a.updatedAt || a.createdAt || 0).getTime()
      const bTs = new Date(b.updatedAt || b.createdAt || 0).getTime()
      return bTs - aTs
    })
  }, [escalations])

  const bobQueue = sortedEscalations.filter((item) => item.target === 'bob' && item.state !== 'resolved')

  async function runAction(escalationId, action) {
    setError('')
    setPendingActionId(`${escalationId}:${action}`)

    try {
      if (action === 'ack') {
        await acknowledgeEscalation(escalationId, { actor: 'bob', reason: 'triage_ack' })
      } else if (action === 'resolve') {
        await resolveEscalation(escalationId, { actor: 'bob', reason: 'triage_resolved' })
      } else if (action === 'retry') {
        await retryEscalationDispatch(escalationId, { actor: 'bob', reason: 'operator_retry' })
      }

      if (typeof onRefresh === 'function') {
        await onRefresh()
      }
    } catch (err) {
      setError(err.message || 'Escalation action failed')
    } finally {
      setPendingActionId('')
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="section-title">Escalations / Bob Queue</h2>

        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="section-chip">Dispatch: {meta.dispatchMode || 'dry-run'}</span>
          <span>Open escalations: {sortedEscalations.length}</span>
          <span>Bob queue: {bobQueue.length}</span>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Send size={14} style={{ color: 'var(--color-accent)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Pending triage items
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Track ownership, age, and escalation reason. Ack and resolve keep audit history on the server.
          </p>
        </div>

        {error ? (
          <div className="px-4 py-2 text-xs" style={{ color: 'var(--color-error)', borderBottom: '1px solid var(--color-border)' }}>
            {error}
          </div>
        ) : null}

        <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {sortedEscalations.length === 0 ? (
            <div className="px-4 py-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No open escalations.
            </div>
          ) : sortedEscalations.map((item) => {
            const isFailed = item.state === 'failed'
            const isResolved = item.state === 'resolved'
            const ageRef = item.createdAt || item.updatedAt
            const ageLabel = ageRef ? relativeTime(new Date(ageRef).getTime()) : '—'

            return (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {item.alert?.title || 'Escalation'}
                      </p>
                      <span className={`tag ${stateTag(item.state)}`}>{item.state}</span>
                      <span className="section-chip">target: {item.target}</span>
                      <span className="section-chip">owner: {item.ownership || item.target}</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      reason: {item.reason} · age: {ageLabel}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      alert {item.alertId} · escalation {item.id}
                    </p>
                    {isFailed ? (
                      <p className="text-xs mt-1" style={{ color: 'var(--color-error)' }}>
                        Last dispatch failed: {item.dispatch?.lastError || 'unknown error'}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isResolved && item.state !== 'acknowledged' && (
                      <button
                        type="button"
                        className="section-chip"
                        onClick={() => runAction(item.id, 'ack')}
                        disabled={pendingActionId === `${item.id}:ack`}
                      >
                        <CheckCircle2 size={12} className="inline mr-1" /> Ack
                      </button>
                    )}

                    {!isResolved && (
                      <button
                        type="button"
                        className="section-chip"
                        onClick={() => runAction(item.id, 'resolve')}
                        disabled={pendingActionId === `${item.id}:resolve`}
                      >
                        Resolve
                      </button>
                    )}

                    {isFailed && (
                      <button
                        type="button"
                        className="section-chip"
                        onClick={() => runAction(item.id, 'retry')}
                        disabled={pendingActionId === `${item.id}:retry`}
                      >
                        <RefreshCw size={12} className="inline mr-1" /> Retry
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-2 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
          {meta.dispatchMode === 'dry-run' ? (
            <>
              <AlertTriangle size={12} />
              Dry-run mode enabled: Ani dispatch payloads are generated and logged but not sent.
            </>
          ) : (
            <>
              <CheckCircle2 size={12} style={{ color: 'var(--color-success)' }} />
              Live dispatch enabled.
            </>
          )}
        </div>
      </div>
    </section>
  )
}
