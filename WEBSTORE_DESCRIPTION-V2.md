# TabTaskTick — Chrome Web Store Listing (V2)

> Draft rewrite based on the 6-Month GTM plan (sections A & C). The goal is ASO:
> get the two highest-volume keywords ("tab manager", "task") into the title,
> lead each feature with the user's *problem*, and make the local-first / open-source
> wedge explicit. Compare against `WEBSTORE_DESCRIPTION.md` (V1) before publishing.

---

## Listing metadata

**Title** (≤ ~45 chars displayed):
```
TabTaskTick: Tab & Task Manager — Kanban
```

A/B variants to test if the dashboard allows multiple updates:
- `TabTaskTick — Tab Manager, To-Do & Snooze`
- `TabTaskTick: Tabs + Tasks for Power Users`

**Short description** (≤ 132 chars):
```
Tab manager with built-in to-dos, Kanban, auto-grouping, and snooze. Local-only, no account, no tracking. Built for GTD.
```

**Category:** Test **Workflow & Planning** (where Todoist and TasksBoard sit, more
conversion-ready) against the current **Tools**.

**Assets still required** (produce separately, not in this doc):
- 5 screenshots (1280×800) with overlay headlines — Kanban view, populated Collection, a configured auto-grouping rule, the snooze dialog, the Dashboard stats.
- 1 marquee promo image (1400×560) — required for Featured-badge eligibility. Suggested line: "Tabs + Tasks. Local-first. Open source."
- 30-second demo GIF — Kanban + a tab being snoozed + a Collection being restored.

---

## Long description

**Stop tab hoarding. Start working with confidence.**

TabTaskTick is a tab manager with a to-do list built in. Save entire windows, attach tasks and notes to the tabs you're actually working on, snooze what you don't need yet, and let rules keep the clutter down — all stored locally in your browser. No account. No cloud. No tracking.

### Who it's for

*   **Researchers** juggling 100+ tabs who can't afford to lose a source.
*   **Developers** context-switching across projects all day.
*   **GTD practitioners** who keep a real weekly review.

---

### 📁 Closing a window shouldn't mean losing the work inside it.
**Collections** save an entire window — URLs, notes, and tasks — as one named workspace.
*   **One-click restore** brings a whole project back exactly as you left it.
*   **Context preserved**, not just bookmarks: the notes and tasks come back too.
*   **Shareable** — export a Collection to hand a colleague your research pack.
*   Close windows freely. Everything is safe in your local database.

### ✓ You've been using tabs as a to-do list. They're terrible at it.
**Tasks & Notes** let you attach real to-dos and context to a tab or a whole Collection — so three weeks later you still know *why* you kept it.
*   **Kanban board** in the side panel to see everything in flight.
*   Your to-dos live where the work lives, with the URL still attached.

### 🤖 Your browser shouldn't need babysitting.
The **Rules Engine** keeps things tidy automatically.
*   **Auto-grouping** by domain or custom criteria.
*   **De-duplication** — find and close duplicate tabs, globally or per-window.
*   **Smart snoozing** — make a tab or a whole window disappear now and return later ("snooze until tomorrow morning").
*   **Memory suspension** of inactive tabs to keep Chrome fast.

### 📊 200 tabs across 5 windows? See it all at once.
The **Dashboard** gives you the bird's-eye view.
*   Overview stats, top domains, and a searchable history of closed tabs.
*   Bulk actions — select, move, close, or group tabs across every window at once.

### 💾 Never lose a session again.
*   Export your full session or a single window to **JSON, CSV, or Markdown**.
*   **Scheduled backups** with a retention policy.
*   Restore one window or everything from any backup file.

---

### 🛡️ Why local-only matters

The most common complaint about cloud tab managers is "they made me create an account, and now my data is hostage." TabTaskTick is built the opposite way.

| | **TabTaskTick** | Toby / Workona |
|---|---|---|
| Where your data lives | Your browser (local) | Their cloud |
| Account required | No | Yes |
| Works offline | Yes | Limited |
| Tracking | None | Analytics |
| Open source | Yes (MIT) | No |
| Price | Free | Freemium / paywall |

All data — Collections, Tasks, Rules, history — is stored locally in your browser (IndexedDB). We never send it anywhere.

---

### ⌨️ Keyboard shortcuts

Power users live here:
*   **Ctrl/Cmd + Shift + S** — quick-snooze the current tab
*   **Ctrl/Cmd + Shift + G** — group all tabs by domain
*   **Ctrl/Cmd + Shift + D** — close duplicate tabs

Remap any of them at `chrome://extensions/shortcuts`.

---

### 🔓 Open source on GitHub

TabTaskTick is MIT-licensed and fully open. Read the code, file an issue, or contribute:
**https://github.com/lenulus/tabtasktick**

---

**Regain control of your browser today.**

*Version 1.4.11*
*Open Source (MIT) | Local Storage | Privacy Focused*
