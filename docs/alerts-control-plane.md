# Alerts Control Plane (P0.1 → P0.3)

Hive now ships a minimal but production-usable escalation executor on top of Signal/Noise triage.

## Scope shipped

- Persistent alerts + remediation attempts
- Signal/Noise classifier + suppression windows
- Escalation policy evaluation (`shouldEscalate`, `reason`, `target`)
- Escalation event state machine + dispatch executor
- Bob triage queue panel + ack/resolve controls
- Transition + dispatch audit logs for postmortems

---

## Data model

### Alert

Each alert record persists with:

- `id`, `ts`, `source`, `severity`, `title`, `message`, `fingerprint`
- `confidence`, `lane`, `status`
- `projectTags`, `agentTags`, `remediationAttempts[]`
- `suppressedCount`, `lastSuppressedAt`, `classifyReason`
- `escalation` summary:
  - `escalated`
  - `reason`
  - `target`
  - `activeEscalationId`
  - `activeEscalationState`
  - `lastTransitionAt`

### Escalation

Escalations persist alongside alerts in the same snapshot:

- `id`, `alertId`
- `state`: `pending -> dispatched -> acknowledged -> resolved` (or `failed`)
- `target`: `bob | ani`
- `reason`, `ownership`
- `createdAt`, `updatedAt`, `dispatchedAt`, `acknowledgedAt`, `resolvedAt`, `failedAt`
- `dispatch`:
  - `mode` (`dry-run` or `live`)
  - `destination`
  - `payload` (including Telegram-ready payload for Ani target)
  - `result`
  - `lastError`
  - `attempts[]`
- `transitions[]` with `{ ts, from, to, actor, reason }`

---

## Dispatch behavior

Implementation:

- `api/_lib/escalation-dispatch.js`
- `api/_lib/alerts-store.js`

Adapter pattern:

- **target=bob**
  - Creates internal queue record (`queue: bob-triage`)
  - Marked as dispatched
- **target=ani**
  - Generates outbound payload suitable for Telegram escalation relay
  - In `dry-run`: payload logged, not sent
  - In `live`: POST to configured webhook relay (`HIVE_ESCALATION_TELEGRAM_WEBHOOK_URL`)

Safety default:

- `HIVE_ESCALATION_DISPATCH_MODE` defaults to `dry-run`
- Explicit `live` required for external dispatch

> TODO (hardening): add idempotency keys and replay protection for outbound webhook delivery.

---

## API

Auth model is unchanged: session auth + optional API key for browser, strict API key for machine callers.

### Alerts

- `GET /api/alerts`
- `POST /api/alerts/ingest`
- `POST /api/alerts/:id/remediation`

### Escalations

- `GET /api/escalations?state=&target=&openOnly=true|false`
- `POST /api/escalations/:id/ack`
- `POST /api/escalations/:id/resolve`
- `POST /api/escalations/:id/retry`

---

## UI

Dashboard now renders **Escalations / Bob Queue** above the alerts panel:

- shows open escalations, ownership, age, reason
- exposes ack/resolve buttons
- exposes retry button for failed dispatches
- shows current dispatch mode (`dry-run` or `live`)

---

## Logging + postmortem loop

All important transitions are append-only logged in `alerts.events.jsonl`:

- `ingest`
- `suppressed_ingest`
- `remediation`
- `escalation_created`
- `escalation_dispatch`
- `escalation_transition`

Postmortem workflow enabled by this log:

1. Reconstruct escalation timeline from `transitions[]` + JSONL events.
2. Measure dispatch failure rates by target/mode.
3. Identify stale acknowledgements (time from `dispatched` to `acknowledged`).
4. Tune escalation policy reason-by-reason (false positive analysis).

> TODO (hardening): ship JSONL to durable analytics store + retention policy + dashboarded SLOs.
