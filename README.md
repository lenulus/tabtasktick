# TabTaskTick

**Stop tab hoarding. Start working with confidence.**

TabTaskTick is a Chrome extension that fuses **tab management** with **task management** — the only local-first, open-source tool that lets you save, organize, snooze, and attach to-dos to the tabs and windows you already work in. No account, no cloud sync, no tracking.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](tabtasktick/manifest.json)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-v1.4.16-orange.svg)](https://chromewebstore.google.com/detail/kninondobdcahcnbfknfeijdljkkbbgc)

> **Built for** researchers juggling 100+ tabs, developers context-switching across projects, and GTD practitioners who keep a weekly review.

---

## Why TabTaskTick

Most tools make you choose. Tab managers (OneTab, Session Buddy, Toby) organize tabs but don't know about your work. To-do apps (Todoist, TickTick) track tasks but don't know about your tabs. TabTaskTick treats **a tab as an open task** — with context, notes, a lifecycle, and the URL still attached.

Three things make it different:

- **Local-first.** Everything lives in your browser (IndexedDB + `chrome.storage`). No login, no server, works offline.
- **Open source (MIT).** The full source is here. Inspect it, fork it, contribute to it.
- **Hybrid depth.** Collections, a rules engine, smart snoozing, and a Kanban task board — in one extension.

---

## Features

### Collections — save entire windows for later
Save a whole window (URLs, notes, and tasks) as a named Collection, then restore it exactly as you left it with one click. Close windows freely, knowing the work inside is safely stored locally. Export a Collection to share a research pack with a colleague.

### Tasks & Notes — contextual to-dos
Attach tasks and notes directly to individual tabs or to entire collections, so three weeks later you still know *why* you kept that tab. Visualize everything in a **Kanban board** in the side panel.

### Rules Engine — automated housekeeping
Define rules that keep the browser tidy on their own:
- **Auto-grouping** by domain or custom criteria
- **De-duplication** globally or per-window
- **Smart snoozing** of tabs and entire windows ("snooze until tomorrow morning")
- **Memory suspension** of inactive tabs to keep Chrome fast

### Dashboard & Analytics
A bird's-eye view of your browsing: overview stats, top domains, a searchable history of closed tabs, and bulk actions (select / move / close / group) across every window.

### Backup & Recovery
Export your full session — or a single window — to JSON, CSV, or Markdown. Schedule automatic backups with a retention policy, and restore from any backup file.

---

## Installation

### From the Chrome Web Store
Install the latest published version:
**[TabTaskTick on the Chrome Web Store](https://chromewebstore.google.com/detail/kninondobdcahcnbfknfeijdljkkbbgc)**

### From source (development)
The extension is unbundled vanilla JavaScript — no build step required.

```bash
git clone https://github.com/lenulus/tabtasktick.git
```

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `tabtasktick/` directory (the inner folder containing `manifest.json`)

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + S` | Quick-snooze the current tab |
| `Ctrl/Cmd + Shift + G` | Group all tabs by domain |
| `Ctrl/Cmd + Shift + D` | Close duplicate tabs |

Shortcuts can be customized at `chrome://extensions/shortcuts`.

---

## Privacy

TabTaskTick is built privacy-first:

- **No cloud sync.** All data (Collections, Tasks, Rules, history) stays on your machine in IndexedDB and `chrome.storage.local`.
- **No tracking.** No analytics inside the extension, no data sent to external servers.
- **Offline ready.** Works without an internet connection.

The `<all_urls>` host permission is used solely to read tab titles/URLs for the features above — never to transmit them.

---

## Architecture

TabTaskTick follows a strict **services-first** design with a clean separation between *selection* (what to act on) and *execution* (how to act). All business logic lives in shared services; the UI surfaces (popup, dashboard, side panel) are thin presentation layers that call into them.

```
User Interfaces  →  Selection Services  →  Execution Services  →  Chrome APIs
(popup, dashboard,    (selectTabs,           (groupTabs, SnoozeService,
 side panel, rules)    detectSnoozeOps)        WindowService, ...)
```

- **Manifest V3** with a module service worker (`background-integrated.js`)
- **Vanilla JS** — no frameworks, no bundler
- **Chart.js** for dashboard analytics
- **IndexedDB** for primary local storage

Deeper documentation lives in [`docs/`](docs/):
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design and decisions
- [`docs/service-dependencies.md`](docs/service-dependencies.md) — service dependency map
- [`docs/service-usage-examples.md`](docs/service-usage-examples.md) — real-world workflows
- [`CLAUDE.md`](CLAUDE.md) — full service catalog and engineering conventions

---

## Project Structure

```
tabtasktick/
├── manifest.json              # Manifest V3 definition
├── background-integrated.js   # Service worker / coordinator (thin)
├── popup/                     # Toolbar popup UI
├── sidepanel/                 # Kanban tasks + collections side panel
├── dashboard/                 # Full-page dashboard & analytics
├── options/                   # Settings page
├── services/                  # ALL shared business logic
│   ├── selection/             #   what to act on (read-only filtering)
│   ├── execution/             #   how to act (state modification)
│   └── utils/                 #   pure helpers (db, formatters, ...)
├── lib/                       # Rules engine, DSL, scheduler, modals
├── icons/
└── tests/                     # Unit (Jest) + E2E (Playwright)
```

---

## Development

Commands run from inside the `tabtasktick/` directory:

```bash
cd tabtasktick
npm install            # install dev dependencies

npm run lint           # ESLint (incl. custom local rules)
npm test               # unit tests (Jest)
npm run test:coverage  # unit tests with coverage
npm run test:e2e       # end-to-end tests (Playwright)
```

To package a release zip for the Chrome Web Store, use the helper script from the repo root:

```bash
./package-ext.sh --patch   # build + bump patch version
./package-ext.sh --help    # see all options
```

> **Note:** Chrome extension service workers do **not** support dynamic `import()`. All imports must be static and at the top of the file. See [`CLAUDE.md`](CLAUDE.md) for this and other critical conventions before contributing.

---

## Contributing

Contributions are welcome. Before opening a PR:

1. Read [`CLAUDE.md`](CLAUDE.md) for the architecture principles (services-first, separation of concerns, no duplicate logic).
2. Keep surfaces thin — shared logic belongs in `services/`.
3. Run `npm run lint` and `npm test` and make sure both pass.
4. Keep changes small and focused, with clear commit messages.

Bug reports and feature ideas are welcome via [GitHub Issues](https://github.com/lenulus/tabtasktick/issues).

---

## License

Released under the [MIT License](LICENSE) — Copyright © 2025 Anthony Laforge.
