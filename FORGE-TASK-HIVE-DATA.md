# Forge Task: Hive Dashboard Data & Layout Fixes

**Project:** The Hive (Project 3)
**Priority:** High
**Requested by:** Ani (2026-03-20)

## Context
The Hive dashboard is deployed and rendering, but most panels show mock/stale data. Ani reviewed the dashboard and flagged multiple issues.

## Wave 1: Layout Reorder & Static Data Fixes

### Task 1.1: Reorder dashboard sections
**Files:** `src/App.jsx`
**Action:** Reorder the dashboard component rendering order to:
1. EscalationsPanel (Bob Queue)
2. BacklogPanel (Discuss with Ani) ← moved up from bottom
3. AlertFeed
4. MetricsBar
5. JobsSummaryCard
6. Agent grid / RealTimeStatusPanel
7. LiveFeed + Timeline (side by side)
8. ProjectsHub
9. Trends
10. WebSearchQuotaHealthPanel + SearchIndexEfficiencyPanel ← moved to bottom
11. JobsOperationsPanel
12. ClawHubPanel
**Verify:** `npm run build` succeeds, sections render in new order

### Task 1.2: Fix project statuses in projects.json
**Files:** `src/data/projects.json`
**Action:**
- Find project with id matching "TurnkeyListingMedia Website Remake" (Project 9) → set `closed: false` (keep open)
- Set `closed: true` for projects matching these PROJECTS.md numbers:
  - Project 1: Sub-Agent Infrastructure
  - Project 2: Discord Workboard
  - Project 4: Additional Skills
  - Project 6: Notion Integration
  - Project 7: TurnkeyListingMedia (if present)
  - Project 8: WhatsApp Social
- The ProjectsHub component should respect the `closed` field. Check if it filters closed projects. If not, add a toggle/filter: show open by default, with a "Show closed" toggle.
**Verify:** `npm run build`, closed projects hidden by default

### Task 1.3: Update backlog data
**Files:** `src/data/roadmapBacklog.json`
**Action:** Replace with current actionable items from the workspace. Use these items:
```json
{
  "project": "Master Roadmap",
  "title": "Backlog / Discuss with Ani",
  "description": "Active next-action items requiring Ani's input or decision.",
  "items": [
    {
      "id": "p9-tk-website-review",
      "title": "TK Website Review",
      "detail": "Review TurnKey Listing Media website on Vercel. Approve Phase 2 scope (booking, payments, integrations).",
      "tag": "Waiting on Ani"
    },
    {
      "id": "p10-roleranger-oauth",
      "title": "RoleRanger Gmail OAuth",
      "detail": "Provide Gmail OAuth redirect URL for RoleRanger job hunt agent.",
      "tag": "Blocked"
    },
    {
      "id": "p11-tk-voice-test",
      "title": "TK Voice E2E Test",
      "detail": "Port conflict needs resolution before end-to-end voice call testing.",
      "tag": "Blocked"
    },
    {
      "id": "p3-hive-live-data",
      "title": "Hive Live Data Wiring",
      "detail": "Approve alert bridge cron to keep Hive alert feed fresh with real data.",
      "tag": "Waiting on Ani"
    },
    {
      "id": "p11-crm-templates",
      "title": "CRM Template Preferences",
      "detail": "Confirm CRM template preferences from Google Drive folder.",
      "tag": "Waiting on Ani"
    }
  ]
}
```
**Verify:** `npm run build`, backlog shows updated items

### Task 1.4: Commit and deploy Wave 1
**Action:** `git add -A && git commit -m "fix(hive): layout reorder, project status fixes, backlog update" && vercel --prod`
**Verify:** `curl -s -o /dev/null -w "%{http_code}" https://the-hive-omega.vercel.app` returns 200

## Wave 2: Live Data Wiring (requires API changes)

### Task 2.1: Wire escalations/Bob Queue to workspace data
**Files:** `api/_lib/handler-escalations.js`, `api/_lib/escalation-engine.js`
**Action:** The escalations panel should show actionable items per project. Currently empty because no escalation data is being ingested. Create a simple approach:
- Add a new API helper that reads the workspace `PROJECTS.md` file (via gateway RPC `tools.read` or direct file read) and extracts "Blocked / Waiting on Ani" sections from each active project
- Transform these into escalation-format items with project name, blocker description, and priority
- Return these from the `/api/escalations` endpoint as the Bob Queue
- Fall back to empty array if gateway is unreachable
**Verify:** `curl` the endpoint locally, returns structured escalation items

### Task 2.2: Wire project data to live PROJECTS.md sync
**Files:** `src/data/projects.js`, `api/sessions.js` or new `api/_lib/handler-projects.js`
**Action:**
- Create `/api/projects` endpoint that reads `PROJECTS.md` from the workspace (via gateway RPC) and parses project status, progress, blockers
- Update `src/data/projects.js` to fetch from `/api/projects` instead of static JSON
- Keep JSON as fallback if API is unreachable
- This enables the daily sync requirement (data comes from live PROJECTS.md)
**Verify:** Projects Hub shows data from PROJECTS.md

### Task 2.3: Commit and deploy Wave 2
**Action:** `git add -A && git commit -m "feat(hive): live escalations from PROJECTS.md + live project sync" && vercel --prod`
**Verify:** Escalations panel and Projects Hub show live data after deploy

## Notes
- Mock badges on activity feed, alerts, cost/token sections are expected until we wire the gateway RPC for real-time data (separate sprint, not in this task)
- Trends (tasks completed, success rate) require event log integration — tracked separately
- Web Search Quota and Search Index Efficiency panels moved to bottom since they have no data currently
