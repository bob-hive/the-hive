/**
 * OpenClaw Gateway WebSocket RPC client
 * Server-side only — never imported by frontend code.
 *
 * Protocol:
 *   1. Connect to ws(s)://<gateway>
 *   2. Receive connect.challenge event → send connect RPC with auth token
 *   3. Receive connect.ok → call any gateway RPC method
 *   4. Return result and close
 */

import { randomUUID } from 'crypto'
import WebSocketImpl from 'ws'

const CONNECT_TIMEOUT_MS = 10_000
const REQUEST_TIMEOUT_MS = 15_000
const PROTOCOL_VERSION = 3

/**
 * Make a single RPC call to the OpenClaw gateway.
 *
 * @param {object} opts
 * @param {string} opts.gatewayUrl  e.g. ws://127.0.0.1:18789
 * @param {string} opts.token       gateway auth token
 * @param {string} opts.method      RPC method name e.g. "sessions.list"
 * @param {object} [opts.params]    RPC params
 * @returns {Promise<any>}          RPC result payload
 */
export async function gatewayRpc({ gatewayUrl, token, method, params = {} }) {
  const WebSocket = WebSocketImpl

  return new Promise((resolve, reject) => {
    let ws
    let connectTimer
    let requestTimer
    let connectId = null
    let callId = null
    let settled = false
    let connected = false

    function cleanup() {
      clearTimeout(connectTimer)
      clearTimeout(requestTimer)
      try { ws?.terminate?.() ?? ws?.close?.() } catch {}
    }

    function settle(err, value) {
      if (settled) return
      settled = true
      cleanup()
      if (err) reject(err)
      else resolve(value)
    }

    try {
      ws = new WebSocket(gatewayUrl, {
        handshakeTimeout: CONNECT_TIMEOUT_MS,
        // Don't verify self-signed certs in dev
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' ? true : false,
      })
    } catch (err) {
      return reject(new Error(`Failed to create WebSocket: ${err.message}`))
    }

    connectTimer = setTimeout(() => settle(new Error('Gateway connect timeout')), CONNECT_TIMEOUT_MS)

    ws.on('error', (err) => settle(new Error(`Gateway WS error: ${err.message}`)))
    ws.on('close', (code, reason) => {
      if (!settled) settle(new Error(`Gateway closed unexpectedly (${code}): ${reason || 'no reason'}`))
    })

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }

      // ── Event: connect.challenge ──────────────────────────────────────────
      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        const nonce = msg.payload?.nonce
        if (!nonce) return settle(new Error('Gateway challenge missing nonce'))

        connectId = randomUUID()
        const connectParams = {
          minProtocol: PROTOCOL_VERSION,
          maxProtocol: PROTOCOL_VERSION,
          client: {
            id: 'gateway-client',
            version: '1.0.0',
            platform: 'node',
            mode: 'backend',
            instanceId: `hive-api-${Date.now()}`,
          },
          role: 'operator',
          scopes: ['operator.admin'],
          caps: [],
          auth: { token },
        }
        ws.send(JSON.stringify({ type: 'req', id: connectId, method: 'connect', params: connectParams }))
        return
      }

      // ── Response to connect ───────────────────────────────────────────────
      if (msg.type === 'res' && msg.id === connectId) {
        if (!msg.ok) {
          return settle(new Error(`Gateway auth failed: ${msg.error?.message ?? 'unknown'} (${msg.error?.code ?? '?'})`))
        }
        // Auth OK — now issue the real RPC call
        clearTimeout(connectTimer)
        connected = true

        callId = randomUUID()
        requestTimer = setTimeout(() => settle(new Error(`Gateway RPC timeout: ${method}`)), REQUEST_TIMEOUT_MS)
        ws.send(JSON.stringify({ type: 'req', id: callId, method, params }))
        return
      }

      // ── Response to our RPC call ──────────────────────────────────────────
      if (msg.type === 'res' && msg.id === callId) {
        if (!msg.ok) {
          return settle(new Error(`Gateway RPC error [${method}]: ${msg.error?.message ?? 'unknown'} (${msg.error?.code ?? '?'})`))
        }
        settle(null, msg.payload)
      }
    })
  })
}

/**
 * Get the configured gateway URL and token from env vars.
 * Returns null if MOCK_MODE is enabled or env is incomplete.
 */
export function getGatewayConfig() {
  const mockMode = process.env.MOCK_MODE === 'true' || process.env.VITE_MOCK_MODE === 'true'
  if (mockMode) return null

  const url = process.env.OPENCLAW_GATEWAY_URL?.trim()
  const token = process.env.OPENCLAW_API_TOKEN?.trim()

  if (!url || !token) return null
  return { url, token }
}

/**
 * Helper: call a gateway method, or return null if gateway is not configured.
 */
export async function tryGatewayRpc(method, params = {}) {
  const cfg = getGatewayConfig()
  if (!cfg) return null
  return gatewayRpc({ gatewayUrl: cfg.url, token: cfg.token, method, params })
}
