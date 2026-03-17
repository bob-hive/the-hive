# Hive Search Index Efficiency Monitoring

## What it adds

A new dashboard panel tracking local search/index performance for:

- Context search
- Config search
- Index search

Metrics shown:

- Request count (24h)
- p50 latency
- p95 latency
- Slow query count
- Per-operation badge state (`healthy` / `warning` / `critical` / `no_data`)
- Trend chart (p95 + request volume)

Component: `src/components/SearchIndexEfficiencyPanel.jsx`

## Backend API

Route: `GET /api/monitoring/search-index-efficiency`

File: `api/monitoring/search-index-efficiency.js`

### Data source

The API parses `events.jsonl` from first existing path:

- `logs/events.jsonl`

Override path via:

- `SEARCH_INDEX_EVENTS_PATH` or `EVENTS_LOG_PATH`

### Event extraction

Events are included when operation text contains search/index semantics and can be mapped to one of:

- `contextSearch`
- `configSearch`
- `indexSearch`

Latency fields supported (top-level or metrics/meta):

- `latency_ms`, `duration_ms`, `elapsed_ms`, `took_ms`
- camelCase variants (`latencyMs`, `durationMs`, ...)

### Thresholds

Environment-configurable thresholds:

- warning: `SEARCH_INDEX_WARN_MS` (default `400`)
- critical: `SEARCH_INDEX_CRITICAL_MS` (default `1200`)

Status rules:

- `critical` if p95 >= critical threshold
- `warning` if p95 >= warning threshold or slow queries > 0
- `healthy` otherwise
- `no_data` when no matching events

### Trend model

- 24h window
- 12 buckets (2-hour buckets)
- Each point includes request count + p95 + derived status

## Frontend wiring

`fetchDashboardData()` now requests:

- `/api/monitoring/search-index-efficiency`

and surfaces `dashboard.searchIndexEfficiency` to the panel.

## Graceful no-data behavior

If no suitable events exist:

- Summary values render as zero / em dash
- Panel shows “No trend data yet”
- Status badges show `no_data`

## Freshness + timestamp resilience

- UI header now shows freshness (`Updated Xm ago`) from API `ts`.
- Freshness text turns warning color when stale (>15 minutes).
- Event timestamp parsing now accepts additional fields:
  - `createdAt`
  - `meta.ts`
- This reduces dropped samples from schema variants in upstream event emitters.

## Instrumentation TODOs

- Emit explicit event names for context/config/index search operations (stable schema).
- Emit latency fields consistently (`latency_ms`) for precise attribution.
- Add result-size/cardinality metadata to correlate latency with query volume.
