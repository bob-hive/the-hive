# Live Backend Env Contract

This document defines environment variables used by the new live status backend slice.

## Required for LIVE mode

- `OPENCLAW_GATEWAY_URL`
  - Example: `ws://127.0.0.1:18789`
- `OPENCLAW_API_TOKEN`
  - Gateway token from local OpenClaw config

If either value is missing, backend routes automatically return `MOCK` mode.

## Auth and protection

- `HIVE_AUTH_SECRET` *(required for sign-in/session)*
- `HIVE_API_KEY` *(optional defense-in-depth; used with `X-Hive-Key` header)*
- `HIVE_CORS_ORIGIN` *(optional CORS scope control)*

## Frontend flags

- `VITE_ENABLE_REALTIME_STATUS_PANEL`
  - `true`: render new real-time status panel
  - `false` (default): keep legacy `AgentGrid`

## Freshness tuning

- `HIVE_LIVE_STATUS_STALE_MS`
  - Default: `90000` (90s)
  - Used by backend freshness metadata to mark stale payloads

## Mock controls

- `VITE_MOCK_MODE=true` or `MOCK_MODE=true`
  - Forces mock responses even when gateway values exist

## Security notes

- Never commit real values for gateway/API secrets
- Keep `.env.local` and any machine-specific env files untracked
- Only expose `VITE_*` variables to browser runtime
