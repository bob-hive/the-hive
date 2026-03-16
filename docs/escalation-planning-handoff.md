# P0.3 Escalation Executor — Handoff for Planning Pages

## What is now live

- Escalations are persisted and dispatched via server-side adapters.
- Open escalations are visible in dashboard panel "Escalations / Bob Queue".
- Operators can ack / resolve / retry directly from UI.
- Transition and dispatch logs are written for postmortem review.

## Planning page integration points

### 1) Surface open escalations by ownership
Use:

- `GET /api/escalations?openOnly=true&target=bob`
- `GET /api/escalations?openOnly=true&target=ani`

Recommended page widgets:

- "Needs Bob triage" (state in `pending|dispatched|acknowledged|failed`)
- "Escalated to Ani" with last dispatch status

### 2) Action controls
Use:

- `POST /api/escalations/:id/ack`
- `POST /api/escalations/:id/resolve`
- `POST /api/escalations/:id/retry`

Suggested UX:

- Show retry only for `failed`
- Capture `actor` and `reason` in body for cleaner audit history

### 3) Timeline and postmortem views
Each escalation already includes:

- `transitions[]` (`ts`, `from`, `to`, `actor`, `reason`)
- `dispatch.attempts[]`

Planning pages can render this as a compact escalation timeline.

## TODOs for production hardening (post-P0.3)

- Move persistence from local file snapshots to durable shared storage.
- Add idempotency keys + replay protection for webhook dispatch.
- Add escalation SLO cards (dispatch success %, ack latency, resolve latency).
- Add role-based action gating if non-operator viewers are introduced.
