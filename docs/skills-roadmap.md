# Bob/The Hive Skills Roadmap (Priority “More Skills”) 

_Last updated: 2026-03-09_

## Why this roadmap
The current skill set is already broad (productivity, messaging, media, notes, weather, GitHub, etc.). The biggest remaining gaps for an **orchestrator-first** assistant are less about one-off tools and more about:

1. **Reliability** (runbooks, retries, failure handling, health visibility)
2. **Automation depth** (repeatable workflows, triggers, routing)
3. **Reporting and observability** (what happened, what failed, where time/cost went)
4. **Integration glue** (cross-tool state, queues, approval flow)

This roadmap focuses on those gaps first.

---

## Prioritized shortlist (10 capabilities)

| Order | Skill / Capability | User Value | Effort | Dependency / Risk Notes |
|---|---|---|---|---|
| 1 | **workflow-engine** (DAG/playbook runner with retries, backoff, idempotency keys) | Turns ad-hoc agent behavior into reliable repeatable automations; biggest leverage for Bob-as-orchestrator | L | Needs clear run state model; risk: over-complex initial scope |
| 2 | **event-router** (ingest + route events from Telegram/Discord/GitHub/calendar/webhooks) | Enables “when X happens, do Y” patterns and cross-channel coordination | M | Needs normalized event schema; risk: noisy triggers without filters |
| 3 | **state-store / memory-index** (structured task state, entities, workflow context) | Prevents dropped context and duplication across sessions/subagents | M | Decide storage (SQLite/Postgres); risk: schema drift |
| 4 | **ops-observability** (run logs, latency/failure dashboards, per-skill metrics) | Gives Ani confidence and enables fast debugging when automation breaks | M | Requires instrumentation standards; risk: telemetry gaps |
| 5 | **alerting-oncall-lite** (failure alerts, escalation policy, digest + urgent path) | Moves from “silent fail” to explicit accountability | S-M | Define severity rules; risk: alert fatigue |
| 6 | **approval-gate** (human-in-the-loop checkpoints for external/destructive actions) | Safer autonomous operations with explicit approval trails | M | Policy model needed; risk: too many prompts if overused |
| 7 | **scheduler-plus** (cron + dependency-aware scheduling + windows/blackouts) | More dependable periodic work than raw heartbeat checks | M | Timezone + DST correctness; risk: overlapping runs |
| 8 | **incident-runbooks** (auto-remediation scripts + guided triage templates) | Faster recovery for common failures, less manual intervention | S-M | Needs curated runbooks per failure class |
| 9 | **knowledge-sync** (auto-ingest docs/repos/notes → searchable index) | Improves answer quality and reduces repeated context loading | M-L | Incremental sync + permissions handling |
|10| **cost-and-capacity-guardrails** (budget caps, model routing, queue/backpressure) | Keeps system stable and predictable as bot family scales | M | Needs usage telemetry and policy thresholds |

---

## Capability details

### 1) workflow-engine (highest priority)
- **What it should do:** declarative workflows, step retries, conditional branches, timeout controls, dead-letter queue.
- **Why now:** everything else (alerts, reports, approvals) is stronger when actions are explicit workflow steps.
- **MVP:** YAML/JSON workflow definitions + local runner + run history.

### 2) event-router
- **What it should do:** normalize inbound signals into one event model; route to workflows based on rules.
- **Why now:** unlocks automation triggers from existing channels/tools.
- **MVP:** Telegram + GitHub + scheduled events.

### 3) state-store / memory-index
- **What it should do:** durable store for active tasks, owners, status, dependencies, and checkpoints.
- **Why now:** orchestration quality depends on state continuity.
- **MVP:** SQLite tables for runs/tasks/artifacts.

### 4) ops-observability
- **What it should do:** run timeline, success rate, MTTR, top failing skills, queue depth.
- **Why now:** reliability work is blind without metrics.
- **MVP:** JSONL event emission + simple dashboard/CLI summaries.

### 5) alerting-oncall-lite
- **What it should do:** severity scoring + escalation path (digest vs urgent). 
- **Why now:** early warning and accountability.
- **MVP:** Telegram alerts for failed runs after retry exhaustion.

### 6) approval-gate
- **What it should do:** route risky actions to explicit approval UI/message with timeout and audit record.
- **Why now:** increases safe autonomy.
- **MVP:** approval-required tags on workflow steps.

### 7) scheduler-plus
- **What it should do:** dependency-aware windows, blackout periods, jitter, and overlap prevention.
- **Why now:** reduces brittle periodic jobs.
- **MVP:** lock-based no-overlap + retry window.

### 8) incident-runbooks
- **What it should do:** codified playbooks for known failure signatures (auth fail, rate limit, network timeout).
- **Why now:** fast, consistent remediation.
- **MVP:** 5 high-frequency runbooks linked from alerts.

### 9) knowledge-sync
- **What it should do:** incremental ingestion from docs/repos/notes with source attribution.
- **Why now:** better orchestration decisions and summaries.
- **MVP:** sync local repo docs + notes folder nightly.

### 10) cost-and-capacity-guardrails
- **What it should do:** per-workflow budget caps, model fallback tiers, queue throttles.
- **Why now:** prevents reliability regressions under load.
- **MVP:** daily budget threshold alerts + simple model routing policy.

---

## Recommended build order (practical sequence)

1. workflow-engine  
2. state-store / memory-index  
3. event-router  
4. ops-observability  
5. alerting-oncall-lite  
6. approval-gate  
7. scheduler-plus  
8. incident-runbooks  
9. cost-and-capacity-guardrails  
10. knowledge-sync

Rationale: build execution core first, then visibility/safety, then optimization/intelligence.

---

## 2-week execution plan

## Week 1 — Foundation + first reliability loop

### Day 1-2: Architecture & contracts
- **Owner:** Bob Core + Platform Engineer
- Define workflow schema, event schema, run state machine.
- Decide storage baseline (SQLite first).
- **Expected outcome:** design doc + skeleton modules + acceptance criteria.

### Day 3-4: workflow-engine MVP
- **Owner:** Platform Engineer
- Implement step runner, retries/backoff, timeout handling, run persistence.
- Add 2 sample workflows (daily check + issue triage).
- **Expected outcome:** deterministic workflow execution with persisted history.

### Day 5: state-store + event-router MVP
- **Owner:** Integrations Engineer
- Build event ingestion adapter (Telegram + scheduler).
- Map events to workflows via rule config.
- **Expected outcome:** at least one trigger-driven workflow live.

## Week 2 — Visibility + safety + operational readiness

### Day 6-7: observability + alerting
- **Owner:** SRE/Platform
- Instrument runs; expose success/fail/latency metrics.
- Add failure alerts with severity levels and digest mode.
- **Expected outcome:** operator can detect and triage failures within minutes.

### Day 8-9: approval-gate + scheduler-plus basics
- **Owner:** Bob Core
- Add approval checkpoints for external/destructive steps.
- Implement no-overlap locks and blackout windows.
- **Expected outcome:** safer autonomous execution and reduced run collisions.

### Day 10: incident runbooks + readiness review
- **Owner:** Bob Core + Integrations
- Create 5 runbooks and attach to alert categories.
- Dry-run incident simulation + postmortem template.
- **Expected outcome:** repeatable incident handling; clear go/no-go for broader rollout.

---

## Success criteria at end of 2 weeks
- 3 production workflows running via workflow-engine.
- 90%+ workflow step completion (excluding external dependency outages).
- Mean time to detect failed run < 5 minutes.
- Approval-gated actions produce auditable records.
- At least 3 incident classes have tested runbooks.

---

## Notes on implementation risk
- Biggest risk is trying to ship all integrations before core reliability primitives exist.
- Keep MVP narrow: local-first execution, minimal adapters, strong logging.
- Design every capability as composable modules so future skills can plug in cleanly.
