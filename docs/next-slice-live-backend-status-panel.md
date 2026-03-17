# Next Slice Plan — Live Backend + Real-Time Status Panel

## Goal
Ship the next Hive slice that makes "live" system state explicit and actionable:

1. **Live data backend** via Vercel API routes to OpenClaw APIs
2. **Real-time status panel** with agent status, pulse, last seen, and current task

---

## Scope (This Run)

### ✅ Backend scaffolding
- Add shared service client: `api/_lib/openclaw-service-client.js`
- Add route: `GET /api/live/status-panel`
- Add route: `GET /api/live/pulse`
- Standardize response metadata for each route:
  - `source`: `LIVE | MOCK | MOCK_FALLBACK`
  - `mode`: `LIVE | MOCK`
  - `freshness`: `{ observedAtMs, generatedAtMs, ageMs, staleAfterMs, stale }`

### ✅ Frontend scaffolding
- Add `RealTimeStatusPanel` component:
  - status badge (busy/online/idle/error)
  - pulse indicator (hot/warm/cool/cold)
  - last seen
  - current task
- Wire data through `fetchDashboardData()` from `/api/live/status-panel`
- Gate UI behind feature flag: `VITE_ENABLE_REALTIME_STATUS_PANEL`

### ✅ Environment contract docs
- Add `docs/live-backend-env-contract.md`
- Update README + `.env` examples for new toggles/thresholds

---

## API Contract (Status Panel)

### `GET /api/live/status-panel`

Returns:
- `source`, `mode`, `mock`, `ts`
- `freshness`
- `counts` (`total`, `busy`, `online`, `idle`, `error`)
- `agents[]` with:
  - `id`, `name`, `role`, `avatar`
  - `status`
  - `pulse`
  - `lastSeenMs`
  - `currentTask`

### `GET /api/live/pulse`

Returns:
- `source`, `mode`, `mock`, `ts`
- `freshness`
- `pulse` aggregate buckets (`hot`, `warm`, `cool`, `cold`, `totalAgents`)

---

## Rollout Plan

1. **Dark launch**
   - Deploy backend routes first
   - Keep `VITE_ENABLE_REALTIME_STATUS_PANEL=false`
2. **Internal validation**
   - Verify LIVE mode against gateway
   - Verify MOCK mode and fallback semantics
3. **Feature flag enable**
   - Turn on panel in staging/preview
4. **Promote to production**
   - Observe freshness and error/fallback rates

---

## Follow-ups (Next Iteration)

- Add route-level contract tests (live/mock/fallback snapshots)
- Add pulse trend mini-chart in status panel
- Add "data degraded" banner when source=`MOCK_FALLBACK`
- Merge/replace legacy `AgentGrid` once panel matures
- Consider SSE/WebSocket stream for sub-10s updates (instead of poll-only)
