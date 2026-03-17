# Hive Web Search Quota Health Widget

## What it adds

A dashboard panel in The Hive that surfaces web-search provider quota health:

- Primary provider status
- Secondary provider status
- Emergency provider status (or `not_configured`)
- Current active provider
- Dual-exhaustion critical state
- Last alert timestamp + reason

Component: `src/components/WebSearchQuotaHealthPanel.jsx`

## Backend API

Route: `GET /api/monitoring/web-search-quota`

File: `api/monitoring/web-search-quota.js`

### Data sources

The API reads local log artifacts (first existing path):

1. `logs/web-search-state.json`
2. `logs/web-search-alerts.jsonl`

If env paths are provided, they override defaults:

- `WEB_SEARCH_STATE_PATH` or `ALERT_STATE_PATH`
- `WEB_SEARCH_ALERTS_PATH` or `ALERT_LOG_PATH`

### Provider names

Provider names are resolved from env first, then latest alert payload:

- `WEB_SEARCH_PRIMARY` (default `tavily`)
- `WEB_SEARCH_SECONDARY` (default `serpapi`)
- `WEB_SEARCH_EMERGENCY` (default `duckduckgo`)

### Critical logic

`dualExhaustion.critical` becomes true when either:

- a `web_search.dual_provider_exhausted` alert exists in `web-search-alerts.jsonl`, or
- `consecutive_dual_overlimit >= threshold`

Threshold preference:
1. state/alert threshold payload
2. `ALERT_CONSECUTIVE_OVERLIMIT`
3. fallback `1`

## Frontend wiring

`fetchDashboardData()` now requests:

- `/api/monitoring/web-search-quota`

and exposes `dashboard.webSearchQuota` to the panel.

## Graceful no-data behavior

If logs are missing or empty:

- panel renders with `noData: true`
- statuses stay `unknown`
- last alert shows “No alert logged”

## Freshness + critical-state guardrails

- UI now shows a freshness label (`Updated Xm ago`) using API `ts`.
- Freshness text turns warning color when stale (>15 minutes).
- API critical state is no longer pinned by any historical alert forever.
  - `dualExhaustion.critical` is true when either:
    - state indicates critical,
    - consecutive dual-overlimit meets threshold, or
    - latest exhaustion alert is within a freshness window.
- Freshness window default: **6h** (`WEB_SEARCH_ALERT_FRESH_MS` override).

## TODOs

- Add explicit provider heartbeat logs to distinguish `healthy` vs `unknown` without relying on exhaustion alerts.
- Include provider success/failure counters over rolling windows.
