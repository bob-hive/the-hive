# Discord Workboard for The Hive (Roadmap Item #6)

This document defines a practical Discord-first operating model for multi-agent work orchestration with clear ownership, low noise, and safe defaults.

## 1) Recommended server structure

### Category: `00-governance` (read-mostly)
- `#welcome-and-rules` — server rules, data handling policy, escalation paths.
- `#announcements` — human-admin only; major updates.
- `#runbook` — pinned SOPs (incident flow, release flow, onboarding).

### Category: `10-command-center` (high-signal)
- `#ops-triage` — intake queue for requests/incidents.
- `#ops-standup` — daily async status updates.
- `#ops-decisions` — decision log (one message per decision, thread for rationale).
- `#ops-blockers` — blockers requiring human/admin action.

### Category: `20-workboard` (execution)
- `#wb-backlog` — new tasks, unassigned.
- `#wb-ready` — groomed and approved tasks.
- `#wb-in-progress` — active execution.
- `#wb-review` — waiting for human review/approval.
- `#wb-done` — completed (auto-archive summaries weekly).

### Category: `30-agent-status` (bot-to-human visibility)
- `#agent-heartbeats` — periodic health/status pings.
- `#agent-jobs` — start/finish/fail events for background jobs.
- `#agent-errors` — failures only, with retry/escalation metadata.

### Category: `40-integrations` (machine output)
- `#github-events` — PRs/issues/CI webhooks.
- `#deploy-events` — deployments, rollbacks, environment status.
- `#audit-log` — policy events and sensitive-action audit trail.

### Category: `90-social` (optional)
- `#general` — human conversation.
- `#wins` — celebrate shipped work.

---

## 2) Work item/thread conventions

Use one root message per work item in the current board channel.

**Message title format**
`[TYPE] short-title · owner:@user-or-agent · prio:P1|P2|P3`

**TYPE examples**
- `TASK`, `BUG`, `INCIDENT`, `RESEARCH`, `MAINT`

**Thread naming**
`wb-<id>-<slug>` (example: `wb-142-discord-routing`)

**Required first-thread comment template**
- Objective
- Scope / non-goals
- Inputs/links
- Risk level (Low/Med/High)
- Data classification (Public/Internal/Restricted)
- Exit criteria

**Status updates in thread**
- Use compact tags: `STATUS:`, `BLOCKED:`, `NEXT:`
- Post update at least once daily for in-progress items.
- When moving channels, add one final note in previous channel with destination link.

**Definition of done**
- Outcome summary
- Evidence links (PR, docs, screenshots, logs)
- Any follow-up tasks created

---

## 3) Role model (least privilege)

### Human roles
- `@owner` — full admin and policy authority.
- `@ops-admin` — manage channels/roles/integrations, no token sharing.
- `@reviewer` — can review/approve work, no server config changes.
- `@member` — participate in ops/workboard channels.
- `@observer` — read-only in selected channels.

### Agent/bot roles
- `@agent-orchestrator` — post in command center/workboard, create threads.
- `@agent-worker` — post only in assigned workboard/status channels.
- `@integration-bot` — webhook/integration output channels only.

### Permission guidelines
- Deny by default; grant channel-specific access.
- Bots should not have Administrator permission.
- Restrict mention permissions (`@everyone`, `@here`, role pings) to admins.
- Keep `#audit-log` append-only for bots; editable by admins only.

---

## 4) Notification routing guidelines

### Severity levels
- `INFO` — normal progress; no push required.
- `WARN` — degraded state/blocker; notify `@reviewer` in-channel.
- `CRIT` — service-impacting or security concern; notify `@ops-admin` + `@owner`.

### Routing matrix
- Work updates (`TASK/BUG`) → thread + `#wb-in-progress` summary
- Blockers > 2h → `#ops-blockers`
- Job failures/retries exhausted → `#agent-errors`
- Policy/sensitive actions (secrets, permission changes) → `#audit-log`
- Deploy/CI changes → `#deploy-events` / `#github-events`

### Noise control
- Batch non-urgent updates every 30-60 minutes.
- Use one summary message per work item/day in board channels; details stay in threads.
- Reserve direct role mentions for `WARN`/`CRIT` only.

---

## 5) Safety & privacy boundaries

- Never post secrets, tokens, private keys, auth headers, or raw credentials.
- Redact PII and internal-only identifiers when possible.
- Post links to secure systems instead of dumping sensitive payloads.
- Use private admin channel for incident triage involving user/customer data.
- Enforce retention for noisy channels and export audit logs regularly.
- Require human approval for destructive actions (deletes, permission escalations, production rollbacks).

---

## 6) Setup checklist

### Server and channels
- [ ] Create categories/channels from section 1.
- [ ] Configure channel topics with intended use + allowed mentions.
- [ ] Pin work item/thread template in `#wb-backlog` and `#ops-triage`.

### Roles and permissions
- [ ] Create roles from section 3.
- [ ] Apply least-privilege channel permissions.
- [ ] Remove Administrator from all bots.
- [ ] Restrict mass mentions to `@ops-admin` and `@owner`.

### Integrations
- [ ] Connect GitHub/webhook bots to `#github-events`.
- [ ] Connect deploy notifications to `#deploy-events`.
- [ ] Route job lifecycle events to `#agent-jobs`; failures to `#agent-errors`.
- [ ] Enable audit sink to `#audit-log` for sensitive operations.

### Operating model
- [ ] Adopt thread naming + status tags conventions.
- [ ] Define SLA targets (triage response, blocker escalation, review turnaround).
- [ ] Assign on-call reviewer/admin rotation.

---

## 7) MVP rollout plan (Week 1)

### Day 1: Foundation
- Create server structure (core categories/channels only).
- Create roles and baseline permissions.
- Publish rules + runbook + templates.

### Day 2: Integrations
- Wire GitHub and deploy webhooks.
- Stand up `#agent-jobs`, `#agent-errors`, and `#audit-log` pipelines.
- Validate routing with test events.

### Day 3: Pilot workflows
- Run 3-5 real tasks through `backlog -> ready -> in-progress -> review -> done`.
- Enforce thread conventions and daily updates.
- Tune noise controls and mention usage.

### Day 4: Guardrails
- Conduct permission and data-exposure review.
- Confirm redaction and incident handling playbook.
- Add escalation paths for WARN/CRIT.

### Day 5: Go-live + retrospective
- Move active ops tracking fully into Discord workboard.
- Capture friction points and update this document.
- Define Week 2 improvements (automation, analytics, SLA dashboards).

---

## 8) Success criteria (MVP)

- 90% of active tasks tracked in workboard channels with threads.
- All job failures visible in `#agent-errors` within 1 minute.
- Zero secrets/PII leakage incidents.
- Clear human ownership for every `WARN` and `CRIT` event.
