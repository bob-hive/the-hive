# The Hive — Security Model

## Auth model (Phase 1)

The Hive now uses **Google OAuth + signed cookie sessions** for both UI and API access.

- Browser signs in at `/api/auth/login`
- OAuth callback at `/api/auth/callback` creates `hive_session` cookie
- Dashboard checks `/api/auth/me` before rendering
- Protected API routes require a valid session
- Email allowlist enforced via `HIVE_ALLOWED_EMAILS`

Default allowlist value: `singh.anirudh@gmail.com`

## API route protection

### Auth routes
- `GET /api/auth/login` — starts Google OAuth
- `GET /api/auth/callback` — validates Google token, sets session cookie
- `GET /api/auth/me` — returns auth state (`200`, `401`, or `403`)
- `GET|POST /api/auth/logout` — clears session cookie

### Session-protected routes
- `GET /api/stats`
- `GET /api/sessions`
- `GET /api/agents/status`
- `GET /api/agents/activity`

### Hybrid auth route
- `GET /api/health`
  - allows **either** valid user session cookie, **or** valid `X-Hive-Key` matching `HIVE_API_KEY`
  - response is sanitized (only top-level health + channel ok booleans)

### Defense in depth: API key
These sensitive routes still keep `HIVE_API_KEY` checks (`X-Hive-Key`) where already present:
- `GET /api/sessions`
- `GET /api/agents/status`
- `GET /api/agents/activity`

So callers need both:
1) valid signed user session cookie, and
2) matching API key header (if `HIVE_API_KEY` is set)

## Cookie/session hardening

- Session and OAuth state are signed with `HIVE_AUTH_SECRET` (HMAC-SHA256)
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in HTTPS/prod
- Session TTL: 8h
- OAuth state TTL: 10m
- Timing-safe signature comparison used

## CORS

`HIVE_CORS_ORIGIN` restricts allowed origins. If set to a concrete origin, credentials support is enabled (`Access-Control-Allow-Credentials: true`).

## Rate limiting

Vercel Edge Middleware (`middleware.js`) applies:
- 60 requests/minute per IP on all `/api/*` routes
- In-memory sliding window (per edge instance)
- Returns 429 with `Retry-After: 60` when exceeded
