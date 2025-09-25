# PRD: Tab Rules Engine & Bulk Hygiene (Vanilla JS)

## 1) Problem & Goals

**Problem.** Large, messy browsing sessions (e.g., 350+ tabs) are hard to clean non-destructively. Existing tab managers lack a powerful, human-readable rules engine with bulk actions, category awareness, and safe workflows.

**Primary Goals**

* One view to **see all windows, groups, and tabs** and take **bulk actions** safely.
* A **rules engine** that supports *categories*, dupes, regex, age, origin, counts, and window context.
* **Triggers** (immediate/manual/repeat/once) with safe **dry-run** preview.
* **Human-readable serialization** (DSL) plus a structured JSON format.
* **Vanilla JS/HTML/CSS** (no React; minimal deps).

**Non-Goals**

* Monetization, accounts, cloud sync.
* Cross-browser sync beyond Chrome MV3 baseline.
* Perfect snooze reliability across OS restarts (nice-to-have, not P0).

---

## 2) Personas & Top Scenarios

* **The Power User (You):** Clears entropy quickly: dedupe, close solos, snooze stale, group spawned trails.
* **The Researcher:** Automatically groups search/gmail spawned tabs; archives PR diffs and long reads for later.

**Top Scenarios**

1. **Hygiene Sweep**: Run rules → close dupes, group by origin, snooze news.
2. **Snapshot & Nuke**: Serialize session → close everything not pinned; rehydrate later.
3. **Gmail Spawn Grouping**: Links opened from Gmail auto-grouped.
4. **Smart Solo Cleanup**: If a window has one tab older than N days → close or move to Collector.
5. **Category Timebox**: “News/Video/Social” tabs auto-snooze after horizon.

---

## 3) Functional Requirements

### 3.1 Objects & Derived Fields

* **Window**: `id`, `title`, `tabCount`, `createdAt`, `lastFocusedAt`
* **Group**: `id`, `windowId`, `name`, `color`
* **Tab**: `id`, `windowId`, `groupId?`, `title`, `url`, `domain`, `createdAt`, `lastActivatedAt`, `isPinned`, `origin`, `category?`
* **Derived**:

  * `tab.age = now - createdAt`
  * `tab.dupeKey = normalize(url)` (strip utm/ref/hash, sort query)
  * `countPerOrigin(domain|origin|dupeKey)`
  * `window.isSolo = (tabCount === 1)`

### 3.2 Categories

* Each tab has `category` (string).
* Category assignment pipeline (in order):

  1. **Explicit rule mapping** (e.g., domain→category)
  2. **Domain list** (JSON of known sites → categories)
  3. **Regex rules** (URL patterns → category)
  4. **Fallback**: `unknown`

### 3.3 Conditions (AND by default; support OR/NOT via groups)

* **Window**: `window.tabCount` *(==, !=, >, >=, <, <=)*
* **Tab**:

  * `tab.age` *(>, >=, <, <=)* (duration)
  * `tab.isDupe` *(is / is not)*
  * `tab.countPerOrigin(<metric>)` *(>, >=, <, <=)*
  * `tab.origin` *(is / is not / startsWith)*
  * `tab.domain` *(is / is not / in / not in / contains)*
  * `tab.url` *(contains / not contains / startsWith / endsWith / regex)*
  * `tab.category` *(is / is not / in / not in)*
  * `tab.isPinned`, `tab.isGrouped` *(is / is not)*
  * `tab.groupName` *(is / is not / contains)*
* **Meta**: `all([...])`, `any([...])`, `none([...])`, `not(...)`.

### 3.4 Actions (ordered)

* `close`
* `bookmark to "<folder>"`
* `snooze for <duration>` (wake into: same/new/collector window)
* `group name "<name>"` (create if missing)
* `group by <origin|domain|date|regexGroup>`

**Semantics**

* Execute in order. If a tab is closed, later actions no-op.
* Idempotency for group/bookmark.
* Respect `skipPinned` unless rule explicitly matches pins.

### 3.5 Triggers

* **Immediate** (debounced 2–5s on tab created/updated)
* **OnAction** (manual “Run now”)
* **Repeat** (`every N m/h/d`)
* **Once** (ISO datetime, local tz)

### 3.6 Preview & Safety

* **Dry-run** mode shows: matched count, list of tabs, per-tab action badges.
* **Conflicts**: Highlight rules that both snooze and close the same tab; respect order.
* **Undo**:

  * Last operation snapshot (tabs metadata + reopen list).
  * Reopen closed tabs within session (best-effort).

---

## 4) Human-Readable Formats

### 4.1 DSL (with **category** support)

> rule "Timebox News 1h" {
> when tab.category in ["news"] and tab.age >= 1h
> then snooze for 1d
> trigger repeat every 1h
> flags log skipPinned
> }

> rule "Close Solo Windows > 3d" {
> when window.tabCount == 1 and tab.age >= 3d
> then close
> trigger onAction
> flags immediate
> }

> rule "Gmail Group" {
> when tab.origin == "gmail"
> then group name "Gmail Session"
> trigger immediate
> }

> rule "Deduplicate" {
> when tab.isDupe
> then close
> trigger repeat every 30m
> }

### 4.2 JSON (UI emission; **category** included)

```json
{
  "name": "Timebox News 1h",
  "enabled": true,
  "when": {
    "all": [
      { "in": ["tab.category", ["news"]] },
      { "gte": ["tab.age", "1h"] }
    ]
  },
  "then": [{ "action": "snooze", "for": "1d", "wakeInto": "same_window" }],
  "trigger": { "repeat_every": "1h" },
  "flags": { "skipPinned": true, "log": true }
}
```

---

## 5) UI/UX (Vanilla JS/HTML/CSS)

### 5.1 Screens

* **Session View** (bulk hygiene):

  * Left: Windows → Groups → Tabs tree (virtualized list)
  * Right: Details + bulk actions (Close, Group, Snooze, Bookmark)
  * Toolbar: Search, Dedupe, “Close solos,” “Move to Collector,” Snapshot
* **Rules Editor**:

  * Header: Name, Enabled
  * **Conditions Builder**: rows `[Subject][Operator][Value]`, add/remove; **Group** blocks with junction **ALL/ANY/NONE**; per-row NOT toggle.
  * **Actions** list (ordered, draggable)
  * **Triggers** (Immediate/OnAction/Repeat/Once)
  * **Preview (Dry-run)**: counts + expandable list
  * Save (validates), Export DSL/JSON
* **Categories Manager**:

  * Domain→category mappings (chips)
  * Regex→category rules (test box)
  * Import/Export mappings

### 5.2 Widgets

* Subject select narrows operators; operator chooses the RHS control (chips / text / regex / duration picker / number).
* Regex helper with “Test against URL”.
* Duration chips (15m/1h/6h/1d/custom).

### 5.3 Accessibility

* Keyboard-first: tab/arrow supports tree view, rule reordering.
* ARIA roles for tree/grid.

---

## 6) Architecture (MV3, no React)

**Extension Components**

* `service_worker.js` (rules evaluation, timers, storage)
* `offscreen.html/js` (optional: notifications, snooze timers if needed)
* `session.html/js/css` (Session View UI)
* `rules.html/js/css` (Rules Editor UI)
* `categories.html/js/css` (Category mappings UI)
* `storage` (chrome.storage.local for rules, mappings, snapshots)

**Key Modules (Vanilla JS)**

* `model.js` — adapters for Chrome Tabs/Windows/Groups APIs
* `normalize.js` — URL → dupeKey; domain extract
* `categories.js` — category assigner (domain/regex/rules)
* `predicate.js` — compile JSON condition tree to function
* `dsl.js` — parse/print human-readable DSL (small PEG or hand-rolled)
* `engine.js` — run rules over context, apply actions, dry-run
* `scheduler.js` — triggers: immediate (debounced), repeat, once
* `snapshot.js` — export/import session; last-op undo
* `ui/*.js` — minimal DOM helpers (no framework)

**Dependencies**

* Optional tiny PEG (≤5KB) or hand-built tokenizer. Otherwise **zero deps**.

---

## 7) Performance & Limits

* Virtualize large tab lists (simple windowed rendering).
* Build indices once per run: `byDupeKey`, `byDomain`, `byOrigin`, `byCategory`.
* Debounce immediate triggers (2–5s).
* Evaluate rules per tab; short-circuit on **Stop after first match** (optional).

---

## 8) Data & Storage

* `rules.json` (array)
* `categories.json` (domain/regex maps)
* `snapshots/` (date-stamped session exports)
* `settings.json` (collector window id, defaults)

**Privacy**: All local; no network.

---

## 9) Security & Safety

* No external requests.
* Regex sandbox limits (timeout on pathological regex; warn on catastrophic backtracking).
* Bookmark action limits (max per batch to avoid UI spam).

---

## 10) Testing

* **Unit**: predicate compiler, category assigner, dupeKey normalization.
* **Integration**: engine runs on a mocked session; action results verified.
* **E2E (manual)**: dev session with 200+ tabs; measure run time & correctness.
* **Fixtures**: news, github PRs, gmail spawns, search trails.

---

## 11) Telemetry (local only, optional)

* Counters per rule: matches, actions taken, time saved (heuristic).
* Last run duration; error logs.
* Toggleable; stored locally.

---

## 12) Rollout

* **MVP**

  * Session View + bulk actions
  * Rules: domain/regex/age/dupe/origin/category
  * Triggers: onAction + Repeat
  * Dry-run preview
* **Post-MVP**

  * Once/Immediate trigger
  * Undo improvements; per-rule “stop after match”
  * Category import packs (news/social/dev)

---

## 13) Example Rules (JSON)

**A. Timebox News**

```json
{
  "name": "Timebox News 1h",
  "enabled": true,
  "when": { "all": [
    { "in": ["tab.category", ["news"]] },
    { "gte": ["tab.age", "1h"] }
  ]},
  "then": [{ "action": "snooze", "for": "1d" }],
  "trigger": { "repeat_every": "1h" },
  "flags": { "skipPinned": true, "log": true }
}
```

**B. Close Solo Windows >3d**

```json
{
  "name": "Close Solo Windows",
  "enabled": true,
  "when": { "all": [
    { "eq": ["window.tabCount", 1] },
    { "gte": ["tab.age", "3d"] }
  ]},
  "then": [{ "action": "close" }],
  "trigger": { "on_action": true },
  "flags": { "immediate": true }
}
```

**C. Gmail Grouping**

```json
{
  "name": "Gmail Spawn Group",
  "enabled": true,
  "when": { "eq": ["tab.origin", "gmail"] },
  "then": [{ "action": "group", "name": "Gmail Session", "createIfMissing": true }],
  "trigger": { "immediate": true }
}
```

**D. Deduplicate**

```json
{
  "name": "Deduplicate",
  "enabled": true,
  "when": { "is": ["tab.isDupe", true] },
  "then": [{ "action": "close" }],
  "trigger": { "repeat_every": "30m" }
}
```

**E. Clamp Research Explosions**

```json
{
  "name": "Clamp Research Explosions",
  "enabled": true,
  "when": { "all": [
    { "gte": ["tab.countPerOrigin:domain", 8] },
    { "gte": ["tab.age", "2h"] }
  ]},
  "then": [
    { "action": "group", "by": "origin" },
    { "action": "snooze", "for": "12h" }
  ],
  "trigger": { "repeat_every": "2h" }
}
```

---

## 14) Minimal Vanilla JS Skeletons

**predicate.js**

```js
export function compile(node) {
  const op = {
    eq: (a,b)=>a===b, neq:(a,b)=>a!==b,
    gt:(a,b)=>a>b, gte:(a,b)=>a>=b, lt:(a,b)=>a<b, lte:(a,b)=>a<=b,
    is:(a,b)=>!!a===!!b, in:(a,b)=>b.includes(a), nin:(a,b)=>!b.includes(a),
    contains:(a,b)=>String(a).includes(b),
    regex:(a,pat)=>new RegExp(pat.slice(1, pat.lastIndexOf('/')), pat.slice(pat.lastIndexOf('/')+1)).test(a)
  };
  const get = (lhs, ctx) => {
    if (lhs === 'tab.countPerOrigin:domain') return ctx.idx.byDomain[ctx.tab.domain]?.length||0;
    const [obj, prop] = lhs.split('.');
    return ctx[obj]?.[prop];
  };
  const build = n => {
    if (n.all) { const kids = n.all.map(build); return ctx => kids.every(f=>f(ctx)); }
    if (n.any) { const kids = n.any.map(build); return ctx => kids.some(f=>f(ctx)); }
    if (n.none){ const kids = n.none.map(build); return ctx => !kids.some(f=>f(ctx)); }
    const [lhs, rhs] = n.eq||n.neq||n.gt||n.gte||n.lt||n.lte||n.in||n.nin||n.contains||n.regex||n.is;
    const key = Object.keys(n)[0];
    return ctx => op[key](get(lhs, ctx), rhs);
  };
  return build(node);
}
```

**engine.js**

```js
import { compile } from './predicate.js';

export function runRules(rules, ctx, opts={dryRun:false, skipPinned:true}) {
  const idx = buildIdx(ctx.tabs);
  const results = [];
  for (const rule of rules.filter(r=>r.enabled)) {
    const matches = [];
    const pred = compile(rule.when);
    for (const tab of ctx.tabs) {
      if (opts.skipPinned && tab.isPinned) continue;
      const win = ctx.windows.find(w=>w.id===tab.windowId);
      if (pred({tab, win, idx})) matches.push(tab);
    }
    results.push({ rule, matches });
    if (!opts.dryRun) applyActions(rule.then, matches, ctx);
  }
  return results;
}

function buildIdx(tabs){
  const byDomain={}, byOrigin={}, byDupeKey={}, byCategory={};
  for (const t of tabs){
    (byDomain[t.domain] ||= []).push(t);
    (byOrigin[t.origin||'unknown'] ||= []).push(t);
    (byDupeKey[t.dupeKey] ||= []).push(t);
    (byCategory[t.category||'unknown'] ||= []).push(t);
  }
  return { byDomain, byOrigin, byDupeKey, byCategory };
}
```

---

## 15) Future Work

* Regex capture groups → `group by regexGroup(1)`
* Heuristics for category inference (lightweight ML later if desired)
* Cross-device snapshot import
* Per-rule metrics dashboard (local)

---

If you want, I can also draft the **domain→category** starter pack JSON (news, social, dev, docs, video) and a tiny HTML rules editor scaffold using vanilla JS components.
