# Alerts Control Plane (P0.1)

This is the first shipped slice of Hive alert triage: **Signal vs Noise lanes** with persisted ingest/remediation events.

## Scope shipped

- Server-side alert model + store
- Classification heuristic (confidence + dedupe)
- API endpoints for ingest/list/remediation
- Dashboard lane split (Signal top, Noise collapsed)
- Logging for ingest + remediation events

---

## Data model

Each alert record persists with:

- `id` string
- `ts` number (unix ms)
- `source` string
- `severity` one of `critical|high|warning|medium|low|info`
- `title` string
- `message` string
- `fingerprint` string
- `confidence` number (0..1)
- `lane` one of `signal|noise`
- `status` one of `open|acked|resolved`
- `projectTags` string[]
- `agentTags` string[]
- `remediationAttempts` array

Additional operational fields:

- `classifyReason` (why lane chosen)
- `duplicateInWindow` boolean
- `createdAt` / `updatedAt` ISO strings

### Remediation attempt shape

- `id` string
- `ts` number
- `actor` string
- `action` string
- `outcome` string
- `success` boolean|null
- `notes` string
- `metadata` object

---

## Storage + logging

Storage implementation: `api/_lib/alerts-store.js`

- Snapshot file: `alerts.json`
- Event log: `alerts.events.jsonl`

Path behavior:

- Local/dev: `./data/alerts`
- Vercel: `/tmp/the-hive-alerts` (ephemeral but writable)
- Override with `HIVE_ALERTS_DIR`

If disk read/write fails, store falls back to in-memory state (with TODO marker for durable store).

> TODO (production hardening): move to durable external persistence (KV/Postgres/S3), add retention and multi-instance consistency.

---

## Classification heuristic

Implementation: `api/_lib/alerts-classifier.js`

### Confidence scoring

- Base score from severity
- + actionable keyword boost (`error`, `failed`, `timeout`, `oom`, etc.)
- - transient keyword penalty (`retry`, `flaky`, `temporary`, etc.)
- - duplicate penalty if same fingerprint in dedupe window
- Explicit input `confidence` (0..1) overrides heuristic

### Lane rules

- **signal**:
  - any `critical`, OR
  - high/warning + actionable text + confidence >= 0.72 and not duplicate
- **noise**:
  - duplicate within dedupe window
  - low confidence / transient patterns

Dedupe window default: `300000ms` (5 min), configurable by `HIVE_ALERT_DEDUPE_WINDOW_MS`.

---

## API

All endpoints keep current auth model:

- Browser users: signed session + optional `X-Hive-Key` check when configured
- Machine callers: strict `X-Hive-Key` via `HIVE_API_KEY`

### `GET /api/alerts`

Query params:

- `lane=signal|noise` (optional)
- `openOnly=true|false` (optional)
- `limit=number` (optional)

Response includes `alerts`, `latestTs`, `updatedAt`, and store metadata.

### `POST /api/alerts/ingest`

Body example:

```json
{
  "source": "sentinel",
  "severity": "critical",
  "title": "Node memory pressure",
  "message": "node-02 heap OOM during index rebuild",
  "projectTags": ["the-hive"],
  "agentTags": ["ledger"]
}
```

### `POST /api/alerts/:id/remediation`

Body example:

```json
{
  "actor": "forge",
  "action": "restart_worker",
  "outcome": "worker restarted and recovered",
  "success": true,
  "status": "acked",
  "notes": "Monitoring next 10 minutes"
}
```

---

## Triage workflow (minimal)

1. Machine posts alert to `/api/alerts/ingest`.
2. Backend computes fingerprint, dedupe, confidence, lane.
3. Dashboard shows:
   - **Signal lane** first (urgent)
   - **Noise lane** collapsed summary
4. Remediation posted to `/api/alerts/:id/remediation`.
5. Attempt appended to alert and event logged in JSONL.

This is intentionally lightweight for P0.1 and safe to ship today.
