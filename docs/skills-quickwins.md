# Skills Quick Wins (Top 3)

_Last updated: 2026-03-09_

## 1) Standardized retry wrapper for existing skills
- **Why this is a quick win:** many failures are transient (network/timeouts/rate limits).
- **Action:** add a shared retry/backoff utility and apply it to high-traffic skills first (GitHub, web fetch/search, messaging).
- **Effort:** Small (1-2 days)
- **Expected impact:** immediate reduction in flaky failures; better user trust.

## 2) Unified run log format (JSONL) + daily digest
- **Why this is a quick win:** visibility is currently fragmented.
- **Action:** emit a standard run event record (`run_id`, `skill`, `status`, `latency_ms`, `error_class`) and create a daily summary.
- **Effort:** Small (1-2 days)
- **Expected impact:** instant observability baseline without building a full dashboard.

## 3) Approval tag for high-risk actions
- **Why this is a quick win:** improves safety with minimal architecture change.
- **Action:** add a simple `requires_approval` tag for external/destructive operations (delete/send/public-post).
- **Effort:** Small (1 day)
- **Expected impact:** safer autonomy and auditable decisions.

---

## Suggested immediate sequence (this week)
1. Implement retry wrapper + adopt in top 5 skills.  
2. Add JSONL run logs + one daily digest report.  
3. Enable approval tags on risky paths.
