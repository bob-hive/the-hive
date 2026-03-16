# UI Direction Notes — inspired by agentclaw.space

Scope: future visual iteration only (no auth scope creep).

## Borrow these ideas

1. **Clear visual hierarchy above the fold**
   - Strong headline + compact supporting line
   - One primary CTA, one secondary action
   - Keep the dashboard "what matters now" visible immediately

2. **Card-forward layout with obvious grouping**
   - Distinct sections (status, activity, tasks, controls)
   - Consistent spacing rhythm and card sizing
   - Fast scanability on desktop and mobile

3. **Profile/agent cards with identity cues**
   - Strong avatar/icon + role + status in one glance
   - Keep current task summary to one line
   - Add subtle metadata rows (last active, throughput, errors)

4. **Status visuals that read instantly**
   - Color + icon + text together (not color alone)
   - Strong “healthy / warning / error” contrasts
   - Keep motion subtle and purposeful (pulse only for live/active)

5. **Section sequencing**
   - Top: live health and key metrics
   - Middle: agent roster + active timeline
   - Bottom: deeper logs/details/actions

## Avoid these pitfalls

1. **Marketing-page overload inside ops dashboard**
   - Avoid long promo-style sections, testimonials, pricing-style blocks

2. **Over-animated or noisy UI**
   - Too much glow/flicker hurts readability for operational use

3. **Text-heavy cards without operational priority**
   - Keep copy short; prioritize actionable telemetry and state

4. **Ambiguous CTA hierarchy**
   - Don’t compete critical actions with too many equal-weight buttons

5. **Shallow status semantics**
   - Avoid vague “active” states; use specific meanings (running, idle, blocked, failed)

## Practical next-step checklist (post-auth)

- Tighten top-level dashboard hierarchy (hero row + KPI strip)
- Normalize agent card anatomy and density
- Standardize status token system (labels + colors + icons)
- Improve contrast/readability in neon mode for prolonged monitoring
