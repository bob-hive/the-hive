# 🐝 The Hive

**Agent Activity Dashboard** — a polished, real-time-ready web app for monitoring AI agents.

Built with React (Vite) + Tailwind CSS v4.

---

## Features

| Feature | Details |
|---|---|
| **Agent cards** | 5 agents (Atlas, Forge, Scout, Ledger, Sentinel) with live status, load bar, task count |
| **Task feed** | 15 mock tasks with timestamps, agent assignment, status, and expandable detail |
| **Metrics bar** | Tasks completed today, active sessions, uptime, success rate |
| **Dual themes** | ☀️ Clean light (default) + 🌈 Neon dark — persisted to localStorage |
| **Animations** | Slide-up cards, pulsing status dots, neon glow/flicker effects |
| **Mock data layer** | `src/data/mock.js` — drop-in replacement for real API calls |

---

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Production build → dist/
npm run build

# Preview production build locally
npm run preview
```

---

## Project Structure

```
the-hive/
├── public/
│   └── favicon.svg
├── src/
│   ├── context/
│   │   └── ThemeContext.jsx     # Light/neon theme provider + toggle
│   ├── data/
│   │   └── mock.js              # ← All data lives here (agents, tasks, metrics)
│   ├── components/
│   │   ├── Header.jsx           # Logo + live indicator + theme toggle
│   │   ├── MetricsBar.jsx       # 4-up KPI cards
│   │   ├── AgentGrid.jsx        # Responsive grid of agent cards
│   │   ├── AgentCard.jsx        # Individual agent card
│   │   ├── TaskFeed.jsx         # Filterable task list with expand/collapse
│   │   └── Footer.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css                # Design tokens + all custom styles
├── index.html
├── vite.config.js
├── vercel.json
└── README.md
```

---

## Swapping to Real Data

All mock data is isolated in **`src/data/mock.js`**. The exports are:

```js
export const agents   // Agent[]
export const tasks    // Task[]
export const metrics  // Metrics object
export const getAgent(id)          // helper
export const relativeTime(ts)      // helper
export const formatDuration(ms)    // helper
export const formatUptime(secs)    // helper
```

To connect a real API, replace these exports with async functions or React Query hooks, keeping the same data shapes. The components will work without any other changes.

---

## Deploying to Vercel

```bash
# One-time setup
npm i -g vercel
vercel login

# Deploy
vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard — it auto-detects the Vite config.  
`vercel.json` is already configured for SPA routing.

---

## Theming

Toggle between **light** and **neon** by clicking the button in the top-right corner.  
Theme preference persists in `localStorage` under the key `hive-theme`.

Design tokens are CSS custom properties on `:root` / `[data-theme="neon"]` in `index.css` — easy to extend.

---

## Tech Stack

- [Vite 7](https://vitejs.dev/) — lightning-fast dev server
- [React 19](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/) via `@tailwindcss/vite`
- [Lucide React](https://lucide.dev/) — icon set
- [Inter](https://rsms.me/inter/) — typography

---

*The Hive — built by Bob 🐝*
