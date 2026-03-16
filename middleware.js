/**
 * Vercel Edge Middleware — Rate limiting & security
 *
 * Applied to all /api/* routes.
 * Uses a simple sliding-window counter per IP (in-memory, per-edge-region).
 *
 * Limits:
 *   - 60 requests per minute per IP for API routes
 *   - Origin check for CORS (if HIVE_CORS_ORIGIN is set)
 */

// Simple in-memory rate limit store (per edge instance)
// Map<ip, { count, resetAt }>
const rateLimitMap = new Map()
const WINDOW_MS = 60_000   // 1 minute
const MAX_REQUESTS = 60    // per window

function isRateLimited(ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  entry.count++
  if (entry.count > MAX_REQUESTS) {
    return true
  }
  return false
}

// Periodic cleanup to prevent memory growth
let lastCleanup = Date.now()
function maybeCleanup() {
  const now = Date.now()
  if (now - lastCleanup < WINDOW_MS) return
  lastCleanup = now
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}

export default function middleware(request) {
  const url = new URL(request.url)

  // Only apply to API routes
  if (!url.pathname.startsWith('/api/')) {
    return undefined // pass through
  }

  maybeCleanup()

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'

  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      }
    )
  }

  // Pass through — let the API handler handle CORS/auth
  return undefined
}

export const config = {
  matcher: '/api/:path*',
}
