# 🐝 The Hive

Agent Activity Dashboard (React + Vite + Vercel API routes).

## What it does

- Live-ish dashboard for agents, activity, sessions, metrics
- Polling UI with offline fallback
- Vercel API routes proxying OpenClaw gateway
- **Auth Phase 1:** Google OAuth + email allowlist + protected API

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173` and sign in with an allowed Google account.

## Required auth env vars

- `HIVE_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `HIVE_ALLOWED_EMAILS` (defaults to `singh.anirudh@gmail.com` if omitted)

## Optional hardening env vars

- `HIVE_API_KEY` + `VITE_HIVE_API_KEY` (defense in depth on sensitive routes)
- `HIVE_CORS_ORIGIN`
- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_API_TOKEN`
- `MOCK_MODE`
- `HIVE_ALERTS_DIR` (optional alert store path override)
- `HIVE_ALERT_DEDUPE_WINDOW_MS` (optional dedupe window override)
- `HIVE_ALERT_SUPPRESS_WINDOW_MS` (optional suppression window override; default 15 min)
- `HIVE_ESCALATION_DISPATCH_MODE` (`dry-run` default, set `live` to enable outbound dispatch)
- `HIVE_DASHBOARD_URL` (optional deep-link base URL for escalation payloads)
- `HIVE_ESCALATION_TELEGRAM_WEBHOOK_URL` + `HIVE_ESCALATION_TELEGRAM_WEBHOOK_TOKEN` (live Ani escalation relay)
- `HIVE_ESCALATION_TELEGRAM_CHANNEL` (channel metadata for payload routing)

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run preview
```

## Deployment (Vercel)

1. Configure env vars in Vercel (Production)
2. Ensure Google redirect URI includes:
   - `https://the-hive-omega.vercel.app/api/auth/callback`
3. Deploy:

```bash
vercel --prod
```

## Docs

- Auth setup: `docs/auth.md`
- Security model: `docs/security.md`
- Product/UI references: `docs/ui-direction-agentclaw.md`
- Alerts control plane: `docs/alerts-control-plane.md`
