# The Hive — Security Model

## API Authentication Strategy

### Public endpoints (no API key required)
- `GET /api/health` — sanitized status only (no bot metadata)
- `GET /api/stats` — aggregate statistics

### Protected endpoints (require `HIVE_API_KEY`)
- `GET /api/sessions` — session data with costs, models, keys
- `GET /api/agents/status` — agent status and task details
- `GET /api/agents/activity` — activity feed with session details

### Why not protect everything?
The frontend is a public SPA. Any API key embedded in `VITE_*` env vars is visible in the browser bundle. Protecting public endpoints with a key that's exposed in the client JS provides no real security — it's security theater.

Instead:
- **Public endpoints** return only non-sensitive, aggregate data
- **Protected endpoints** require `HIVE_API_KEY` sent via `X-Hive-Key` header
- The API key is stored server-side only (`HIVE_API_KEY` env var in Vercel)
- The frontend sends `VITE_HIVE_API_KEY` if configured, but this is optional

For production use where sessions/activity should also be visible on the dashboard, either:
1. Accept that this data is semi-public (it's operational metadata, not secrets)
2. Add a proper auth layer (OAuth, session cookies) for the dashboard

## CORS

`HIVE_CORS_ORIGIN` restricts which origins can call the API.
Set to `https://the-hive-omega.vercel.app` in production.

## Rate Limiting

Vercel Edge Middleware (`middleware.js`) applies:
- 60 requests/minute per IP on all `/api/*` routes
- In-memory sliding window (per edge instance)
- Returns 429 with `Retry-After: 60` when exceeded

## Health Endpoint Sanitization

`/api/health` strips all metadata from the gateway response:
- No bot usernames, IDs, or application details
- Returns only `{ ok: boolean, channels: { <name>: { ok: boolean } } }`
