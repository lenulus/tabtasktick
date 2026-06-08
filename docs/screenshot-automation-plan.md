# Store Screenshot Automation — Plan

> **Goal:** Automatically produce the 5 required store screenshots at **1280×800**
> in all **7 locales** (de, en, es, fr, ja, ko, pt_BR) → **35 PNGs**, deterministic
> and repeatable. Built on the existing Playwright E2E harness.
>
> **Status:** Proposed. Grounded in code investigation (file:line cited). A few
> decisions (§7) need sign-off before implementation.

---

## 1. The five screenshots

| # | Shot | Surface + route | Wait-for selector | Data needed |
|---|---|---|---|---|
| 1 | Kanban with realistic tasks | `dashboard.html#tasks` → click `#tasksViewKanban` | `#tasksKanbanContainer .kanban-board` | Seed tasks (IndexedDB) across statuses |
| 2 | Collection with notes | `dashboard.html#collections` → click card `[data-action="view-details"]` | `#collectionDetailsModal .collection-details`, notes = `.detail-list-note` | Seed collection + folder + tabs w/ `note` (IndexedDB) |
| 3 | Rules Engine, 1 auto-group rule | `dashboard.html#rules` | `.rule-card` | Seed 1 rule (`addRule` message) |
| 4 | Snooze dialog ("tomorrow morning") | `dashboard.html#tabs` → select tab(s) → `[data-action="snooze"]` | `.snooze-modal.show`, preset `[data-preset-id="tomorrow"]` | Real tabs open (no stored data) |
| 5 | Dashboard "200 tabs / 5 windows" | `dashboard.html#overview` | `#statTotalTabs` == 200 | **200 real tabs across 5 real windows** — see §7.1 |

Notes:
- Dashboard is a full-page tab; at a 1280×800 viewport every shot fills the frame. The collection-details modal (#2) and snooze modal (#4) overlay the full page, so they look right at 1280×800 (the popup would be too small — we deliberately use the dashboard).
- The snooze modal auto-selects its **first** preset on open — preset `id:'tomorrow'`, label "Tomorrow", sublabel "9 AM", 🌅 (`components/snooze-modal.js:13-25,158-165`) — i.e. "tomorrow morning" is selected with no extra interaction.
- The auto-grouping rule shape (modern format, `lib/test-mode/rule-builder.js:277-293`):
  `{ name, enabled:true, when:{all:[{gte:['tab.countPerOrigin:domain',2]}]}, then:[{action:'group', by:'domain'}], trigger:{type:'immediate'} }`.

---

## 2. Architecture: standalone per-locale Playwright script

The shared E2E fixture (`tests/e2e/fixtures/extension.js`) is **worker-scoped and single context** — it can't switch locale per run. We instead write a **standalone script** that loops the 7 locales, launching a **fresh persistent context per locale** with a per-locale extension build.

```
scripts/screenshots/
  capture.mjs        # the runner (Playwright, loops locales × shots)
  fixtures.mjs       # per-locale realistic seed content (§5)
  seed.mjs           # seeding helpers (IndexedDB + messages)
output:
  screenshots/<locale>/01-kanban.png … 05-dashboard.png
```

Per-locale loop (pseudocode):
```js
for (const locale of ['de','en','es','fr','ja','ko','pt_BR']) {
  const build = await buildLocalizedCopy(locale);          // §3
  const ctx = await chromium.launchPersistentContext(tmpUserDir, {
    headless: false,                                        // extensions require headful
    channel: 'chromium',
    args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`,
           '--no-sandbox', '--disable-dev-shm-usage'],
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 800 },                // exact store size
  });
  const extId = await getExtensionId(ctx);                  // from SW url
  await seedAll(ctx, extId, locale);                        // §4, §5
  for (const shot of SHOTS) {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/${shot.route}`);
    await shot.prepare(page, extId);                        // navigate view / open modal
    await page.locator(shot.waitFor).first().waitFor();
    await page.screenshot({ path: `screenshots/${locale}/${shot.file}` }); // fullPage:false
    await page.close();
  }
  await ctx.close(); await cleanup(tmpUserDir, build);
}
```

Capture at the **default `fullPage:false`** so each PNG is exactly the 1280×800 viewport (do **not** use the `fullPage:true` example in `tests/e2e/README.md:178` — that captures the whole scrollable page).

---

## 3. Forcing the locale (the non-obvious part)

**`--lang` / Playwright `locale` do NOT work** for extension i18n — verified empirically on macOS: UI stays `en-US`, `chrome.i18n.getMessage` keeps returning English regardless of `--lang=de`, the `Local State` `intl.app_locale` trick, or `default_locale`. `services/utils/i18n.js` has **no runtime override** — its header literally says *"display language follows the browser/UI locale (no in-app override)"*.

**Working mechanism (verified — German rendered):** Chrome resolves messages by matching the UI locale (`en-US` → `_locales/en`). So for each locale, build a **temporary copy of the extension** and **overwrite `_locales/en/messages.json` with the target locale's `messages.json`** (keep the dir named `en`). Load that copy. `buildLocalizedCopy(locale)`:
1. Copy `tabtasktick/` → temp dir (exclude `node_modules`, `.git`, `test-results`, `playwright-report`, `_locales/en_XA`).
2. `cp _locales/<locale>/messages.json _locales/en/messages.json` in the copy (for `en`, it's a no-op).
3. Return the temp path; load via `--load-extension`.

**Caveat — plural rules:** because `getUILanguage()` still returns `en-US`, `tPlural()` selects plural categories with English rules. For our shots the visible counts are large (200 tabs, several tasks) → always the `other` category, which every locale defines → **no visible issue in practice**. Edge cases only at counts 0/1 in fr/etc. Mitigation if ever needed: run on Linux CI where `--lang=<locale>` *does* drive `chrome.i18n` natively (fixes plurals too) — keep `--lang` in the args as a no-op-on-mac/win that helps on Linux.

`manifest.json` has **no `key`** → extension ID is non-deterministic; always read it at runtime from the service-worker URL.

---

## 4. Data seeding strategy

Two persistence layers (`services/utils/db.js`, `background-integrated.js`):
- **IndexedDB `TabTaskTickDB` v4** — stores `collections`, `folders`, `tabs`, `tasks`. (Notes are a `note` field on a **tab** record, max 255 chars; there is no separate notes store.)
- **chrome.storage.local** — `rules`, `snoozedTabs`, `settings`.

**How to write seed data** (from a real extension page, NOT the service worker — services aren't on the SW global, and dynamic `import()` in the SW is the forbidden crash path):
- Open `chrome-extension://<id>/test-page.html` as a page, then `page.evaluate` with dynamic `import()` of the services (safe on a normal extension page). IndexedDB + storage are origin-scoped, so writes are immediately visible to the dashboard.
- **Tasks / collections / folders / tabs(notes):** call the services — `CollectionService.createCollection`, `FolderService.createFolder`, `TabService.createTab({collectionId, url, title, position, note})` (⚠ `collectionId` is now **required** — a stale E2E sample omits it), `TaskService.createTask({summary, status, priority, notes, …})`.
- **Rules:** `chrome.runtime.sendMessage({action:'addRule', rule})` — persists to `storage.local.rules` **and** syncs the SW in-memory `state.rules` (raw `storage.local.set` would desync).
- **Snooze (#4):** no stored data — open real tabs in the test window and trigger the modal live (`detectSnoozeOperations` runs on the selection).
- **Stat (#5):** no stored data — counts are live from `chrome.tabs.query` + `chrome.windows.getAll` (`services/selection/selectTabs.js:1075-1085`). Must open real tabs/windows (use `data:` URLs for instant, offline-safe loads — avoid live URLs, which caused load-timeout flakiness in the test runner).

**Task → Kanban column** is the task `status` field: `open | active | fixed | abandoned` (`dashboard/modules/views/tasks-kanban.js:23-28`) — seed across all four so the board looks full.

**Collection notes render guard:** notes only show when the collection has folders/tabs and each tab carries a non-empty `.note` (`dashboard/modules/views/collections.js:780,801`). Seed accordingly.

---

## 5. Realistic, localized content

The UI **chrome** (buttons/labels) localizes via §3. But seeded **content** (task summaries, collection/folder names, notes, the rule name) is user data — it does **not** auto-translate. For professional store assets each shot should read natively, so `fixtures.mjs` holds a **per-locale content set**:

```js
export const CONTENT = {
  en: {
    collection: { name: 'Q3 Product Launch', icon: '🚀' },
    folder: 'Launch assets',
    tabs: [ { title: 'Launch checklist', url: 'https://…', note: 'Final sign-off Friday' }, … ],
    tasks: [ { summary: 'Draft launch announcement', status: 'active', priority: 'high', notes: '…' }, … ],
    rule: { name: 'Group tabs by domain' },
  },
  de: { … }, es: { … }, … // translated equivalents
};
```

Curate **one** strong English set (realistic GTD-style tasks across the four columns, a collection with 4–6 noted tabs, etc.), then translate per locale. Translations can be model-generated to start, **flagged for a native-speaker pass** before publishing (same caveat as the UI strings). Keep proper nouns ("TabTaskTick", brand names) un-translated.

---

## 6. Tooling

- `npm run screenshots` → `node scripts/screenshots/capture.mjs` (optionally `-- --locale=de --shot=kanban` to regenerate one).
- Requires `npx playwright install chromium` once.
- Headful (extensions require it); on CI use `xvfb-run`.
- Output committed under `screenshots/` (or `.gitignore`'d and uploaded as a build artifact — §7.3).
- Runtime estimate: ~7 locales × (seed + 5 shots), dominated by the 200-tab build in #5; expect a few minutes total.

---

## 7. Decisions — RESOLVED

### 7.1 — Screenshot #5: shoot Overview, **Total Tabs = 200** ✅
Open **200 real `data:`-URL tabs** (distributed across 5 windows is fine but not required since it isn't displayed) and capture `dashboard.html#overview` with `#statTotalTabs == 200`. **No product-code change** — the window count is intentionally not shown. (If the "5 windows" framing later becomes important, adding a Windows stat card to `overview.js` is the follow-up.)

### 7.2 — Content: **translate per locale** ✅
`fixtures.mjs` carries a curated English content set plus per-locale translations so each shot reads natively. Translations start model-generated and are **flagged for a native-speaker review pass** before store submission (same caveat as the UI strings).

### 7.3 — Output: **CI artifacts only** ✅
`screenshots/` is `.gitignore`'d; `npm run screenshots` generates locally on demand and CI uploads the 35 PNGs as build artifacts. No binaries committed to git.

### 7.4 — Tab count for #5
Default **200 tabs** via `data:` URLs (instant, offline-safe). Adjustable via a constant if a smaller believable number is preferred for speed.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| `--lang` doesn't localize extensions (macOS/Win) | Per-locale `_locales/en` overwrite (§3) — cross-platform, verified |
| Plural category uses en rules under the overwrite | Counts are large → always `other`; or run on Linux CI with `--lang` |
| Live URLs time out (seen in test runner) | Use `data:` URLs for real tabs (#4, #5); IndexedDB tab records (#2) need no loading |
| SW in-memory desync (rules/snooze) | Seed via `addRule` message; snooze shown live, not seeded |
| Extension ID non-deterministic | Read from SW URL at runtime |
| `TabService.createTab` requires `collectionId` | Always pass it (a stale sample omits it) |
| Modal/animation not settled when captured | Wait on `.show`/content selector + small settle delay before `screenshot()` |
