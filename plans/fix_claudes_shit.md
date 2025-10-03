awesome—let’s turn your “shared services, no magic” direction into a concrete, low-risk refactor you can actually land. this keeps JS (no TS), avoids new formats/engines, and collapses the three divergent behaviors into one set of **shared modules**.

# goals (non-negotiables)

* **one behavior** across all surfaces (dashboard/popup, background/worker, rules runner).
* **services-first**: all logic lives in shared modules; surfaces are thin.
* **no magic**: every side effect is an explicit call; every option is a parameter.
* **deterministic**: same inputs → same outputs; color/order collisions handled predictably.
* **maintainable**: small PRs, strong tests, clear docs, remove dead code quickly.

# target architecture (JS, no new rule language)

```
/src
  /services                # the only place with logic that changes behavior
    tabGrouping.js
    tabCleanup.js          # e.g., close by age, unpinned only, etc.
    tabCapture.js          # snapshot/cold storage/export
    classify.js            # domain/tag classification (opt-in lists)
    bookmarks.js
    windows.js
    telemetry.js
    errors.js
    time.js                # clock helpers (testable)
  /adapters                # chrome APIs (isolated for mocking)
    chromeTabs.js
    chromeTabGroups.js
    chromeWindows.js
    chromeStorage.js
  /surfaces
    /popup                 # thin: collects inputs, calls services, renders
    /dashboard
    /background
  /rules                   # existing rules structs (unchanged), tiny orchestrators
    applyRules.js          # calls into /services only
/test
  /fixtures                # captured contexts, windows, tabs, rules
  /mocks                   # chrome API mocks
  /golden                  # input → output JSON snapshots
```

> principle: if two places have “similar” logic, it moves into `/src/services/*` and both call it.

---

## phase 0 — inventory & alignment (0.5–1 day)

**deliverables**

* a **matrix** of the three current implementations (surface A, surface B, rules runner): entrypoints, options, side effects, ordering, edge cases (pinned, chrome://, collapsed groups, single-tab groups).
* pick a **canonical behavior** wherever they differ (document decisions).

**acceptance**

* `ADR-001-behavior-parity.md` with chosen behaviors (e.g., deterministic domain color, minTabsPerGroup=2 default, reuse existing single-tab groups).

---

## phase 1 — carve out adapters (API boundary) (1–2 PRs)

**why**: keep chrome API usage in one place for mocking and stability.

**work**

* create `/src/adapters/chromeTabs.js`, `/chromeTabGroups.js`, `/chromeWindows.js`, `/chromeStorage.js`.
* each exports thin, promise-based wrappers around `chrome.*` (no logic).
* surfaces and services import **adapters**, never `chrome.*` directly.

**acceptance**

* grep shows no direct `chrome.tabs/…` outside `/adapters`.
* basic unit tests run with adapter mocks.

---

## phase 2 — introduce shared services (start with grouping) (2–3 PRs)

**work**

* finalize `tabGrouping.js` (your shared module from the last message).
* add `telemetry.js` (structured log: op, params, result|error; no PII).
* add `errors.js` (normalize known chrome errors → codes/messages).
* add `time.js` (now(), toISO()) for testable time.

**acceptance**

* golden tests for `groupTabsByDomain()` (TARGETED, GLOBAL, PER_WINDOW) using fixtures.
* deterministic color and ordering confirmed by snapshots.

---

## phase 3 — move other duplicated behaviors into services (4–6 PRs)

pick the highest-value first; keep each PR narrow.

**examples**

* `tabCleanup.js`

  * close by age; ignore pinned tabs flag; minAgeMinutes; optional whitelist/blacklist scopes.
  * explicit return `{closed, skipped, windowsAffected, plan}`.
* `classify.js`

  * pure helpers: `normalizeDomain(url)`, `isNews(domain)`, tag add/remove (through adapter or storage).
  * use **explicit lists** you already have; no ML/PSL “magic”.
* `bookmarks.js`

  * move/annotate with short description; idempotent (hash by URL+collection).
* `windows.js`

  * open/create/ensure target window; find “dashboard window” by exact property, not heuristics.

**acceptance**

* each service has: JSDoc, stable options with defaults, golden tests, and doesn’t call UI.

---

## phase 4 — central rule application stays, but calls only services (1–2 PRs)

**work**

* in `/src/rules/applyRules.js`, remove any embedded behavior; route to services:

  * e.g., for “group by domain” rules: resolve scope → call `groupTabsByDomain(scope, windowId, opts)`.
* keep your **existing rule object shape** & storage; we’re not inventing a new language.

**acceptance**

* rule application diff vs old path is **0** on parity fixtures.

---

## phase 5 — parity harness & fixtures (1 PR)

**work**

* `/test/fixtures` with **real captured**: tabs, windows, existing groups, and rules.
* `/test/parity.spec.js` runs **old** (temporarily kept in `legacy/`), **new services**, compares outputs (ignore non-deterministic fields like timestamps).

**acceptance**

* CI shows green on parity; define “must hold 0-diff for N commits” gate.

---

## phase 6 — flip surfaces to shared services (2–3 PRs)

**work**

* replace surface A logic with service calls. keep UI; delete local forks.
* do same for surface B and rules runner/background.
* add a **feature flag** (env var or build flag) to toggle legacy vs services for quick rollback during this phase.

**acceptance**

* manual smoke: the same user action calls the same service, and telemetry shows identical ops.
* parity harness still green.

---

## phase 7 — delete legacy & set guardrails (1 PR)

**work**

* remove `legacy/` code, turn feature flag default to “new”.
* add **lint rules** (eslint custom rule) to block direct `chrome.*` imports outside adapters.
* add **dep check** to forbid services importing surfaces (one-way dependency).

**acceptance**

* repo builds without legacy; lint/dep checks enforce architecture.

---

## phase 8 — docs & maintainability (1 PR)

**work**

* `CONTRIBUTING.md`: “if behavior changes → change a **service**, add/adjust **golden test**, update **ADR**”.
* `MIGRATION.md`: what changed for contributors (where to add new behaviors).
* `SERVICES_CATALOG.md`: each service, its contract, defaults, return shape, examples.
* `PLAYBOOK.md`: “how to add a new operation” (scaffold template + test + adapter call).

---

# coding standards (js)

* vanilla JS modules, `"type": "module"`.
* **JSDoc** for every service function with param/return types (your editor will infer types).
* **no implicit behavior**: each option has a default value defined once at top of file.
* input validation: throw **early**, with clear messages.
* returns: small, stable **plain objects** with counts, affected IDs, and (optional) `plan` for audit.

---

# testing strategy

* **unit** (services):

  * chrome adapters fully mocked; fixtures for windows/tabs/groups; golden snapshots.
* **integration** (rules/applyRules):

  * real rule objects → service calls → output snapshot.
* **parity** (temporary):

  * legacy vs new side-by-side diff on the same fixtures.
* **smoke** (surfaces):

  * a few E2E clicks with adapter stub (no actual Chrome dependency in CI).

**tooling**: vitest/jest + tiny `deep-object-diff` util. no selenium/webdriver.

---

# telemetry & errors (lightweight)

* `telemetry.js`: `record(eventName, payload)` → console or storage; redact URLs if needed.
* `errors.js`: map common Chrome errors (`No tab with id`, `Invalid group`) to `{code, hint}` so callers can decide whether to continue or surface a message.

---

# acceptance criteria (definition of done)

* all grouping/cleanup/bookmarking behaviors are **only** in `/src/services/*`.
* zero parity diffs on fixtures covering:

  * multiple windows (some empty), pinned/unpinned, internal URLs (`chrome://`), single tabs per domain, existing titled groups, collapsed groups, duplicate domains across windows, target window missing.
* surfaces import **only** from `/src/services` and `/src/adapters`.
* docs exist and explain how to add/change behavior.
* lint/dep checks prevent architecture drift.

---

# suggested PR sequence (bite-sized)

1. **adapters foundation**
2. **tabGrouping service + tests**
3. **telemetry/errors/time helpers**
4. **tabCleanup service + tests**
5. **classify & bookmarks services + tests**
6. **rules/applyRules routed to services**
7. **parity harness + fixtures**
8. **flip surface A → services**
9. **flip surface B / background → services**
10. **delete legacy + add guardrails**
11. **docs pass**

---

# known risks & mitigations

* **silent behavior drift** → parity tests + ADRs; refuse merges without updated snapshots.
* **adapter regressions** → keep adapters ultra-thin; add a tiny manual smoke checklist.
* **UI assumptions** (e.g., color cycling, group titles) → codify as options in services with explicit defaults.

---

# quick wins you can land today

* drop in the finalized `tabGrouping.js` (from your last message) under `/src/services/`.
* add adapters for `chrome.tabs` and `chrome.tabGroups` and switch the grouping service to use them.
* write two golden tests (TARGETED and PER_WINDOW) with your real windows/tabs fixture.

if you want, paste your current repo layout + filenames for the two surfaces and the rules entrypoint, and I’ll map the exact move/cut lines and sketch PR #1 with real imports and test scaffolding.
