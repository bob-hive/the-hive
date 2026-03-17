import { checkHiveApiKey, corsHeaders, jsonResponse, requireUserSession, unauthorizedResponse } from '../_lib/auth.js'
import { getAgentStatusPanelData } from '../_lib/openclaw-service-client.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v))
    return res.status(204).end()
  }

  if (!requireUserSession(req, res)) return

  if (!checkHiveApiKey(req)) return unauthorizedResponse(res)

  const data = await getAgentStatusPanelData()

  return jsonResponse(res, 200, {
    source: data.freshness.source,
    mode: data.freshness.mode,
    mock: data.mock,
    freshness: data.freshness,
    pulse: {
      totalAgents: data.counts.total,
      hot: data.agents.filter((agent) => agent.pulse === 'hot').length,
      warm: data.agents.filter((agent) => agent.pulse === 'warm').length,
      cool: data.agents.filter((agent) => agent.pulse === 'cool').length,
      cold: data.agents.filter((agent) => agent.pulse === 'cold').length,
    },
    ts: data.freshness.generatedAtMs,
    ...(data.error ? { error: data.error } : {}),
  })
}
