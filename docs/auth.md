# Auth Phase 1 (Google OAuth + allowlist)

This phase gates **both UI and API** behind Google sign-in and an email allowlist.

- Dashboard access requires a valid session cookie (`hive_session`)
- API routes require the same session cookie
- Sensitive routes still enforce `HIVE_API_KEY` where already used (defense in depth)
- Allowlist is env-driven and defaults to one user

## Required environment variables

| Variable | Required | Purpose |
|---|---|---|
| `HIVE_AUTH_SECRET` | Yes | HMAC signing secret for session + OAuth state cookies |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `HIVE_ALLOWED_EMAILS` | Yes (recommended) | Comma-separated allowlist. Default: `singh.anirudh@gmail.com` |

## Optional environment variables

| Variable | Purpose |
|---|---|
| `HIVE_AUTH_BASE_URL` | Explicit public base URL used for auth redirects (ex: `https://the-hive-omega.vercel.app`) |
| `HIVE_API_KEY` | Additional API key check (`X-Hive-Key`) on sensitive API routes |
| `HIVE_CORS_ORIGIN` | CORS origin restriction |
| `OPENCLAW_GATEWAY_URL` | Gateway URL for live backend data |
| `OPENCLAW_API_TOKEN` | Gateway token |
| `MOCK_MODE` | Force backend mock responses |
| `VITE_HIVE_API_KEY` | Optional frontend header for `HIVE_API_KEY` protected endpoints |

## Google OAuth setup

1. In Google Cloud Console, create/update an OAuth Client (Web app).
2. Add Authorized redirect URI:
   - `http://localhost:5173/api/auth/callback` (local)
   - `https://the-hive-omega.vercel.app/api/auth/callback` (prod)
3. Copy Client ID/Secret into env vars.

## Local setup

1. Copy `.env.example` to `.env.local`
2. Set:
   - `HIVE_AUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `HIVE_ALLOWED_EMAILS=singh.anirudh@gmail.com`
3. Run `npm install` then `npm run dev`
4. Open app, sign in via Google, verify dashboard loads only for allowed account

## Production (Vercel) setup

1. Set project env vars in Vercel (Production):
   - `HIVE_AUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `HIVE_ALLOWED_EMAILS=singh.anirudh@gmail.com`
   - optional hardening vars (`HIVE_API_KEY`, `HIVE_CORS_ORIGIN`, gateway vars)
2. Redeploy
3. Verify flows:
   - unauthenticated users see sign-in gate
   - unauthorized email sees access denied
   - allowed email can access dashboard + API
