# TabTaskTick Review Prompt — Implementation Plan

> **Companion to** [`review-prompt-plan.md`](./review-prompt-plan.md) (the design
> doc). That doc decides *what* and *why*; this doc decides *how*, grounded in
> the actual code. Section numbers like "design §3" refer to the design doc.
>
> **Scope:** single shipping PR (design §10, Phase 1) — the popup review prompt,
> the `ReviewPromptService`, the Developer Options test controls, the validation
> suite, and the localized strings.

---

## 0. Preconditions & honesty notes

- **Nothing in this plan has been run or verified against a live build.**
  `node_modules` is absent from `tabtasktick/` — `npm test` currently fails with
  `Cannot find module 'jest-environment-jsdom'`. **Step 0 of implementation is
  `cd tabtasktick && npm install`.** Until then, unit tests, E2E, and
  `i18n:parity` are untested.
- All file:line references below are from the investigation snapshot; re-confirm
  before editing (the repo just fast-forwarded 37 commits).
- The published extension ID (from the Web Store URL) is
  `kninondobdcahcnbfknfeijdljkkbbgc`.

---

## 1. Architecture decisions (settled)

These are decided; the rest of the doc builds on them.

| Decision | Resolution | Evidence |
|---|---|---|
| **Where the logic runs** | A new popup-/options-side service imported **directly**; reads/writes its own `chrome.storage.local` key with **no background round-trip**. | `popup.js` already imports services directly (`exitTestMode` popup.js:7, `setPendingAction` popup.js:9) and reads/writes storage directly (`bannerDismissed` popup.js:115/638). Surfaces use both messaging and direct storage. |
| **Storage shape** | Single-key object under `reviewPrompt`, with a `DEFAULT_STATE` constant. | Matches `ScheduledExportService` `DEFAULT_CONFIG`/`CONFIG_KEY` (ScheduledExportService.js:54-74) and `SidePanelNavigationService` single-key pattern. |
| **Init** | Lazy `ensureInitialized()` as first line of each public fn; no eager background init. | `SnoozeService`/`ScheduledExportService` are explicitly left to lazy-init (background-integrated.js:390/409 comments). |
| **`installedAt` seeding** | **Dual-seed:** `onInstalled` sets it when `details.reason === 'install'`; `ensureInitialized()` lazy-seeds it if missing (covers upgraders + safety). | No `installedAt` exists today; `onInstalled` (background-integrated.js:386-402) takes no args and doesn't inspect `details.reason`. Existing-user upgraders get `now` → 14-day clock starts at ship, consistent with design §11.5's accepted clean-start ramp. |
| **Time injection** | Every time-touching public fn accepts optional `{ now = Date.now() }`. Tests pass `now` explicitly; production omits it. | No `Date.now` mock exists anywhere; `{ now }` is cleaner than `jest.setSystemTime` and exercises the real path. Design §6 already mandates `shouldPrompt({ now })`. |
| **Mutex with Collections promo** | Separate `#reviewPromptBanner` element; a module-level `reviewPromptActive` flag is checked inside `loadCollectionsAndTasks` before it re-shows `collectionsBanner`. | The 5s `loadCollectionsAndTasks` loop (popup.js:172-221, interval 102-106) force-toggles `collectionsBanner` and would clobber the slot otherwise. |
| **Render cadence** | Review prompt is evaluated/rendered **once per popup open**, guarded by a module-level flag, in `init` — **not** inside the 5s loop. | Same 5s-loop hazard. |
| **No telemetry** | Nothing added. Success signal = Web Store review count. | Design §1; no analytics infra exists (grep for `trackEvent`/`track(` = 0 hits). |
| **ESLint compliance** | Raw state dump via `JSON.stringify(state)` (a CallExpression, not a literal → not flagged); all labels via `t()`/`data-i18n`. | `no-hardcoded-ui-string` flags string/template literals to UI sinks in `options/**`, not call expressions (no-hardcoded-ui-string.js:14). |
| **Async chrome listeners** | `storage.onChanged` in options wrapped with `safeAsyncListener` (or non-async IIFE). | CLAUDE.md async-listener rule; `services/utils/listeners.js`. |
| **Cross-context cache freshness** | The module-level `state` cache is **per execution context** (popup ≠ options). To keep the live-debug view truthful, `getDebugState()` reads `chrome.storage.local` **fresh** (bypasses the cache), and an exported `reloadState()` (`state = null`) is called by the options `storage.onChanged` handler before re-render. | Popup and options are separate JS contexts with separate module instances; without this, options' `getDebugState()` returns stale cached values even though `onChanged` fired — silently breaking the §5.1/§7.4 "watch gates flip live" workflow. |

---

## 2. Open decisions (resolve before/at implementation)

### 2.1 — 🔴 BLOCKER: cap total exposures with `shownCount` (closes a design hole)

The design promises **"at most ~3 exposures, ever"** (design §1, §2). But every
suppression flag (`rated`, `declined`, `lastDeferredAt`, `lastDismissedAt`) is
set **only by an explicit button click**. A user who simply **closes the popup**
with the prompt showing sets none of them. The 7-day cooldown then clears, and if
they're still dashboard-active (recency ≤14d stays fresh) and the other gates
pass, **the prompt reappears every 7 days, indefinitely (~4×/month)** — an
engaged-but-uninterested user gets nagged forever. The "three exposures" figure
only holds for users who click something.

**Fix (small, faithful to the design's own worst case):**

- Add `shownCount: 0` to the storage shape.
- Increment it each time the prompt is actually **displayed** (in the same place
  `lastPromptAt` is set).
- Add a gate: `shownCount >= MAX_LIFETIME_SHOWS (= 3)` → ineligible, `reason:
  'exposure_cap'`. This is a hard lifetime ceiling regardless of interaction.

This is the one place the implementation must *correct* the design rather than
just realize it. **Resolved: `MAX_LIFETIME_SHOWS = 3`** (matches the explicit §2
walkthrough). The design doc's §1 "at most twice" headline has been reconciled to
"three exposures" to match.

### 2.2 — Passive-close semantics

Given 2.1, a passive close (prompt shown, popup closed, no click) consumes one of
the `shownCount` budget and starts the 7-day cooldown. It does **not** count as
dismiss (90d) or defer (30d). Confirm this is the intended treatment of "shown
but ignored." (Recommend yes — it's the only coherent reading once `shownCount`
exists.)

### 2.3 — `MAX_LIFETIME_SHOWS` interaction with re-eligibility windows

With the cap, the 30-day defer and 90-day dismiss windows still apply *within* the
budget. Worst realistic path: shown→defer (30d)→shown→dismiss (90d)→shown→ignore
→ **cap hit, never again**. Confirm this matches design §2's "three exposures."

### 2.4 — Translations for user-facing strings

Adding the 6 prompt strings (design §8) requires entries in **all 7 locales**
(en + de/es/fr/ja/ko/pt_BR); `i18n:parity` fails on any missing key. There is
**no translation tooling** (verified — manual edits only). Decision: real
translations for the 6 *user-facing* prompt strings (match whatever process
produced the existing 1441 keys) vs ship English-in-all-locales as a stopgap.
Dev-panel strings (§2.5) can ship English across locales (devs read English,
gated behind Developer Mode) — parity only checks key *presence*.

### 2.5 — GitHub feedback issue template (design §11.2)

Negative path links to `…/issues/new?labels=feedback&template=feedback.md`. If
`.github/ISSUE_TEMPLATE/feedback.md` doesn't exist, either create it (small
prereq) or drop the `template=` param. Decision needed.

### 2.6 — Which dashboard-opens count

Recommend instrumenting the single choke point `openDashboard()` (popup.js:1283-1297)
so footer button (605), stat cards (618), and rules-manager (1359) all count as
"engaged with the dashboard." The export/import modals open `dashboard.html#export-import`
via direct `chrome.tabs.create` (popup.js:1366-1384) bypassing `openDashboard()` —
recommend **not** counting those (modal launches, not dashboard engagement).
Confirm.

---

## 3. File change inventory

| File | Type | Change |
|---|---|---|
| `services/execution/ReviewPromptService.js` | **NEW** | The service (§4). |
| `popup/popup.html` | edit | Add `#reviewPromptBanner` markup in the promo slot (after the `#collectionsBanner` block, popup.html:48-58). |
| `popup/popup.js` | edit | Import service; render-once-per-session in `init`; `trackDashboardOpenFromPopup()` in `openDashboard()`; mutex guard in `loadCollectionsAndTasks`; wire Step 1/2 handlers. |
| `popup/popup.css` | edit | `.review-prompt-banner` + step-2 variants, cloning `.collections-banner`/`.test-mode-banner` box model (popup.css:151-273). |
| `options/options.html` | edit | Add dev controls inside `#developerSettings` (options.html:82-103). |
| `options/options.js` | edit | Load + wire dev controls; render state block; subscribe `storage.onChanged`. |
| `background-integrated.js` | edit | `onInstalled` `installedAt` seed (background-integrated.js:386). |
| `_locales/en/messages.json` + 6 locales | edit | New keys (design §8 + dev-panel keys). |
| `tests/services/ReviewPromptService.test.js` | **NEW** | Unit tests (§7.1). |
| `tests/e2e/review-prompt.spec.js` | **NEW** | E2E (§7.2). |
| `.github/ISSUE_TEMPLATE/feedback.md` | **NEW (maybe)** | Per decision 2.5. |

---

## 4. `ReviewPromptService.js`

Location: `services/execution/ReviewPromptService.js`. ES module, named exports,
module-level constants + `DEFAULT_STATE`, lazy `ensureInitialized()`. Import path
for `t()` (if needed): `../utils/i18n.js`. Model: `SidePanelNavigationService` +
`ScheduledExportService`.

### 4.1 — Constants & storage shape

```js
const REVIEW_PROMPT_KEY = 'reviewPrompt';

const DAY = 24 * 60 * 60 * 1000;
const GATES = {
  MIN_INSTALL_AGE_MS: 14 * DAY,
  MIN_DASHBOARD_OPENS: 2,
  PROMPT_COOLDOWN_MS: 7 * DAY,
  DASHBOARD_RECENCY_MS: 14 * DAY,
  DEFER_REELIGIBLE_MS: 30 * DAY,
  DISMISS_REELIGIBLE_MS: 90 * DAY,
  MAX_LIFETIME_SHOWS: 3,            // §2.1 — the exposure cap
};

const WEB_STORE_REVIEW_URL =
  'https://chromewebstore.google.com/detail/kninondobdcahcnbfknfeijdljkkbbgc/reviews';
const GITHUB_FEEDBACK_URL =
  'https://github.com/lenulus/tabtasktick/issues/new?labels=feedback'; // +template per 2.5

const DEFAULT_STATE = {
  installedAt: null,
  dashboardOpensFromPopup: 0,
  lastDashboardOpenFromPopupAt: null,
  lastPromptAt: null,
  lastDeferredAt: null,
  lastDismissedAt: null,
  shownCount: 0,                    // §2.1
  rated: false,
  declined: false,
  feedbackPath: null,              // 'github' once routed to feedback
  devForceShow: false,            // dev-only override (§5)
};
```

> **Cut gate (owner decision):** the design's "no errors in last 5 minutes" gate
> (design §3) is **removed** — there is no error signal to drive it, and shipping
> it inert (always-pass) is the "looks right, never fires correctly" trap design
> §12 warns against. No `recentErrorAt`/`noteRecentError`. If a real error signal
> exists later, re-add as a gate then.

```js
```

### 4.2 — Internal helpers

```js
let state = null;            // module-level cache (per execution context)
let countedThisSession = false; // dedup for trackDashboardOpenFromPopup (per popup open)

async function ensureInitialized(now = Date.now()) {
  if (state) return;
  const data = await chrome.storage.local.get(REVIEW_PROMPT_KEY);
  state = { ...DEFAULT_STATE, ...(data[REVIEW_PROMPT_KEY] || {}) };
  if (state.installedAt == null) {          // lazy seed (upgraders/safety)
    state.installedAt = now;
    await persist();
  }
}
async function persist() {
  await chrome.storage.local.set({ [REVIEW_PROMPT_KEY]: state });
}

// Read the raw persisted object WITHOUT touching the module cache — used by
// getDebugState() so a freshly-changed value in another context is visible.
async function readFresh() {
  const data = await chrome.storage.local.get(REVIEW_PROMPT_KEY);
  return { ...DEFAULT_STATE, ...(data[REVIEW_PROMPT_KEY] || {}) };
}

// Invalidate the cache so the next ensureInitialized() re-reads. The options
// storage.onChanged handler calls this before re-rendering the state block.
export function reloadState() { state = null; }
```

> **Session dedup rationale:** `countedThisSession` is module-level. A popup
> module instance lives only while the popup is open (popup tears down on close),
> so the flag resets per popup open → "≥ 2 *distinct sessions*" semantics hold.

### 4.3 — Public API

```js
// One counted increment per popup open (idempotent via countedThisSession).
export async function trackDashboardOpenFromPopup({ now = Date.now() } = {}) {
  await ensureInitialized(now);
  if (countedThisSession) return;
  countedThisSession = true;
  state.dashboardOpensFromPopup += 1;
  state.lastDashboardOpenFromPopupAt = now;
  await persist();
}

// Pure-ish gate evaluation. Returns { eligible, reason, version }.
export async function shouldPrompt({ now = Date.now() } = {}) {
  await ensureInitialized(now);
  if (state.devForceShow) return { eligible: true, reason: 'dev_override', version: computeVersion(now) };
  const failing = firstFailingGate(now);          // see §4.4
  return { eligible: !failing, reason: failing || 'eligible', version: computeVersion(now) };
}

// Record an outcome from the UI (design §2). Updates suppression + persists.
export async function recordOutcome({ step, action, now = Date.now() }) {
  await ensureInitialized(now);
  switch (action) {
    case 'dismiss':   state.lastDismissedAt = now; break;
    case 'thumbsDown':state.feedbackPath = 'github'; break;
    case 'rated':     state.rated = true; break;
    case 'later':     state.lastDeferredAt = now; break;
    case 'github':    state.feedbackPath = 'github'; break;
    case 'noThanks':  state.declined = true; break;
  }
  await persist();
}

// Called by the popup when it actually DISPLAYS the prompt (§2.1 + cooldown).
export async function markShown({ now = Date.now() } = {}) {
  await ensureInitialized(now);
  state.lastPromptAt = now;
  state.shownCount += 1;
  await persist();
}

// --- Dev surface (§5) — these intentionally use Date.now() directly (dev-only
//     paths, not subject to the §1 clock-injection determinism rule) ---
export async function getDebugState({ now = Date.now() } = {}) { /* §5.1 — reads readFresh(), not the cache */ }
export async function resetState() { state = { ...DEFAULT_STATE, installedAt: Date.now() }; await persist(); }
export async function setForceShow(enabled) { await ensureInitialized(); state.devForceShow = !!enabled; await persist(); }
export async function applyTestScenario(id, { now = Date.now() } = {}) { /* §5.2 */ }

export const URLS = { review: WEB_STORE_REVIEW_URL, feedback: GITHUB_FEEDBACK_URL };
```

### 4.4 — Gate evaluation — ONE ordered descriptor array (drift-proof)

**Enforcement mechanism (required):** gates are defined **once** as a single
ordered array of descriptors. Both `firstFailingGate()` and `getDebugState().gates`
**iterate this same array** — there is no second copy and no parallel if-else
chain. `firstFailingGate` returns the first descriptor whose `pass` is false (its
`id` becomes the `reason`); `getDebugState` maps every descriptor to
`{ id, pass, detail }`. Order is significant: `reason` strings and the §7.3 matrix
depend on it, so the array order must match the table below.

```js
// Each: { id, pass(state, now), detail(state, now) }
const GATE_DESCRIPTORS = [
  { id: 'exposure_cap',          pass: (s)     => s.shownCount < GATES.MAX_LIFETIME_SHOWS, ... },
  { id: 'already_resolved',      pass: (s)     => !(s.rated || s.declined || s.feedbackPath === 'github'), ... },
  { id: 'install_too_recent',    pass: (s, n)  => n - s.installedAt >= GATES.MIN_INSTALL_AGE_MS, ... },
  { id: 'not_enough_engagement', pass: (s)     => s.dashboardOpensFromPopup >= GATES.MIN_DASHBOARD_OPENS, ... },
  { id: 'engagement_stale',      pass: (s, n)  => s.lastDashboardOpenFromPopupAt != null && n - s.lastDashboardOpenFromPopupAt <= GATES.DASHBOARD_RECENCY_MS, ... },
  { id: 'in_cooldown',           pass: (s, n)  => !s.lastPromptAt || n - s.lastPromptAt >= GATES.PROMPT_COOLDOWN_MS, ... },
  { id: 'deferred_recently',     pass: (s, n)  => !s.lastDeferredAt || n - s.lastDeferredAt >= GATES.DEFER_REELIGIBLE_MS, ... },
  { id: 'dismissed_recently',    pass: (s, n)  => !s.lastDismissedAt || n - s.lastDismissedAt >= GATES.DISMISS_REELIGIBLE_MS, ... },
];
const firstFailingGate = (s, n) => GATE_DESCRIPTORS.find(g => !g.pass(s, n))?.id || null;
```

| Order | `reason` id | Passes when |
|---|---|---|
| 1 | `exposure_cap` | `shownCount < MAX_LIFETIME_SHOWS` (§2.1) |
| 2 | `already_resolved` | not (`rated \|\| declined \|\| feedbackPath==='github'`) |
| 3 | `install_too_recent` | `now - installedAt >= MIN_INSTALL_AGE_MS` |
| 4 | `not_enough_engagement` | `dashboardOpensFromPopup >= MIN_DASHBOARD_OPENS` |
| 5 | `engagement_stale` | `now - lastDashboardOpenFromPopupAt <= DASHBOARD_RECENCY_MS` |
| 6 | `in_cooldown` | no `lastPromptAt`, or `now - lastPromptAt >= PROMPT_COOLDOWN_MS` |
| 7 | `deferred_recently` | no `lastDeferredAt`, or past `DEFER_REELIGIBLE_MS` |
| 8 | `dismissed_recently` | no `lastDismissedAt`, or past `DISMISS_REELIGIBLE_MS` |

(The design's "no recent error" gate is **cut** — see §4.1 note.)

`versionFor(state)`: returns `'after_defer'` if `lastDeferredAt` is set, else
`'fresh'`. (The variant is only *reachable* once the 30-day defer window clears —
during it the `deferred_recently` gate suppresses — so it keys off presence, not
the window.) Under `devForceShow`, `shouldPrompt()`/`getDebugState()` instead
return `version: state.devVariant` so the dev variant selector drives the preview.
Drives Step 1 copy.

> **Gate "first popup open of the day" — intentional stricter approximation
> (design §4):** there is **no storage gate** for first-open-of-day. It is
> **approximated** at runtime by (a) the **per-popup-session render guard** (§6),
> which prevents the 5s loop and re-entry from re-rendering mid-session, and (b)
> the **7-day cooldown** (gate 6) once `markShown()` sets `lastPromptAt`. This is
> **strictly more conservative** than the design (7-day floor, not 1-day), so it
> never over-shows. Consequence: first-open-of-day is **not reproducible via
> `applyTestScenario`** (it's runtime module state, not storage) — it is covered
> **only** by the E2E open/close test (§7.2).

---

## 5. Developer Options test controls

Live inside the existing `#developerSettings` panel (options.html:82-103), gated by
the existing `developerMode` flag (panel `.hidden` toggle, options.js:96-97/212).
Add as `.setting-item` blocks matching the existing pattern (label + `.setting-description`
+ control). Wire in `loadDeveloperSettings()` (options.js:79-102) and
`setupEventListeners()` (options.js:205-243), each handler `await chrome.storage.local.set(...)`
→ `showSaveNotification()`.

| Control | Markup | Handler |
|---|---|---|
| Force-show review prompt | `label.switch > input#rpForceShow + span.slider` | `change` → `ReviewPromptService.setForceShow(e.target.checked)` |
| Prompt copy variant | `select#rpVariant.setting-select` (`fresh`/`after_defer`) | `change` → store preview variant (dev-only key) |
| Load test scenario | `select#rpScenario.setting-select` + `button#rpApplyScenario.btn.btn-secondary` | click → `applyTestScenario(select.value)` then re-render state block |
| Review-prompt state | read-only `<div id="rpState">` inside a `.setting-item` | rendered from `getDebugState()` |
| Reset review-prompt state | `button#rpReset.btn.btn-secondary` | click → `resetState()` then re-render |

**Guardrails:** when `developerMode` is toggled **off**, also clear `devForceShow`
(so it can't leak to normal users) — extend the existing developerMode `change`
handler (options.js:207-215) to call `setForceShow(false)` when unchecked.

### 5.1 — `getDebugState()` shape (drives the state block)

Returns `{ storage, shouldPrompt, derived, gates }` exactly as design §6
specifies. **`getDebugState()` reads `readFresh()` (§4.2), NOT the module cache** —
so a value just changed in the popup context is visible in the options context.
`gates` is built by mapping the **same `GATE_DESCRIPTORS` array** (§4.4) — no
second predicate set. The state block renders a ✓/✗ checklist (labels via `t()`)
plus `JSON.stringify(storage, null, 2)` in a `<pre>` (CallExpression → ESLint-safe).

**Live refresh:** subscribe `chrome.storage.onChanged` (wrapped in
`safeAsyncListener` from `services/utils/listeners.js`), filter for
`changes[REVIEW_PROMPT_KEY]`, call `ReviewPromptService.reloadState()` to drop the
stale cache, then re-render from `getDebugState()`. Lets a tester keep options
open while exercising the popup/dashboard in another tab and watch counters/gates
update. Time-based gates won't tick second-to-second; the **Reset/Apply** actions
and re-render-on-panel-focus cover those.

### 5.2 — `applyTestScenario(id)` (the §7 matrix loader)

Each scenario writes a known single-variable state (all other gates passing) so
one gate's pass/fail edge is reachable from the UI. Returns `getDebugState()` for
assertion. Enumerated scenarios (one per matrix row, §7.3):

```
all_pass, install_13d, install_14d, opens_1, opens_2, cooldown_6d, cooldown_7d,
rated, declined, recency_15d,
defer_29d, defer_31d, dismiss_89d, dismiss_91d, cap_reached
```

> **Coverage limit (state honestly):** scenarios reproduce the **storage-driven**
> gates + windows. They **cannot** reproduce gate-6 first-open-of-day (runtime
> session state, §4.4) — that is E2E-only.

---

## 6. Popup integration

### 6.1 — Markup (`popup/popup.html`)

Add a sibling to `#collectionsBanner` (after popup.html:58), hidden by default,
reusing `.banner-content`/`.banner-icon`/`.banner-text`/`.banner-close` and a new
`.review-prompt-banner` container. Step 1 holds 👍/👎 + dismiss ×; step-2 positive
and step-2 negative are separate inner blocks toggled in JS (or rebuilt via the
`createElement` + innerHTML-with-`t()` + `querySelector`/`addEventListener`
pattern used by `createWindowSnoozeElement`, popup.js:436-482). All static text
via `data-i18n` (auto-applied by `localizeDocument()`, popup.js:85).

### 6.2 — Render-once-per-session (`init`)

```js
// module scope
let reviewPromptActive = false;
let reviewPromptEvaluated = false;

async function maybeShowReviewPrompt() {
  if (reviewPromptEvaluated) return;        // once per popup open
  reviewPromptEvaluated = true;
  const { eligible, version } = await ReviewPromptService.shouldPrompt();
  if (!eligible) return;
  reviewPromptActive = true;
  elements.collectionsBanner.classList.add('hidden'); // mutex
  renderReviewStep1(version);
  await ReviewPromptService.markShown();   // sets lastPromptAt + shownCount (§2.1)
}
```

**Ordering (required):** `await maybeShowReviewPrompt()` must complete **before**
the first `loadCollectionsAndTasks()` call (popup.js:88), so `reviewPromptActive`
is set before any banner-show path runs. Otherwise the Collections banner paints
first and gets replaced → a visible flash. Call it once in `DOMContentLoaded`
init, after `localizeDocument()` (popup.js:85), before line 88. **Not** inside
`loadCollectionsAndTasks`.

### 6.3 — Mutex guard — BOTH Collections show-paths

`collectionsBanner.classList.remove('hidden')` fires in **two** places, not one:
- `loadBannerState()` / `init` at **popup.js:130**
- the 5s `loadCollectionsAndTasks` loop at **popup.js:199**

Guard **both** with `if (!reviewPromptActive)`. Guarding only the loop (the
obvious one) still lets the init path clobber the slot on first paint.

### 6.4 — Tracking call

In `openDashboard()` (popup.js:1283-1297), before `chrome.tabs.create({ url })`
(popup.js:1296), add `ReviewPromptService.trackDashboardOpenFromPopup();` (fire-and-forget,
or `await` — it's a single storage write). Single choke point covers footer/stat-cards/rules
(decision 2.6). Import at top: `import * as ReviewPromptService from '../services/execution/ReviewPromptService.js';`

### 6.5 — Outcome wiring (design §2)

| Button | Call | Then |
|---|---|---|
| Step 1 👍 Yes | — | swap to Step-2 positive |
| Step 1 👎 Not yet | `recordOutcome({ step:1, action:'thumbsDown' })` | swap to Step-2 negative |
| Step 1 Dismiss × | `recordOutcome({ step:1, action:'dismiss' })` | fade out (mirror `handleBannerDismiss` popup.js:635-651) |
| Step 2a Rate | `recordOutcome({ step:2, action:'rated' })` | `chrome.tabs.create({ url: URLS.review })` |
| Step 2a Maybe later | `recordOutcome({ step:2, action:'later' })` | fade out |
| Step 2b GitHub | `recordOutcome({ step:2, action:'github' })` | `chrome.tabs.create({ url: URLS.feedback })` |
| Step 2b No thanks | `recordOutcome({ step:2, action:'noThanks' })` | fade out |

The Rate/GitHub links open via `chrome.tabs.create` (matching `openDashboard`)
rather than `<a target="_blank">` to avoid popup-window quirks; or use real `<a>`
with the href from `URLS` — either is fine, pick one.

> **DRY (don't add a third fade copy):** the fade-out sequence
> (`opacity='0'` → `setTimeout(300)` → `add('hidden')`) **already exists twice** —
> `handleBannerDismiss` (popup.js:643) and the test-mode banner (popup.js:661).
> Do **not** mirror it a third time. Extract a `fadeOutAndHide(el, ms = 300)`
> helper in popup.js and refactor **all three** call sites (Collections, test-mode,
> review prompt) to use it. This pays down the existing duplication rather than
> compounding it (CLAUDE.md: extract shared logic, no duplicate implementations).

### 6.6 — CSS (`popup/popup.css`)

**Don't clone the box model** — extract a base `.popup-banner` class holding the
shared box model from `.collections-banner` (popup.css:151-159), then make
`.collections-banner`, `.test-mode-banner` (216-273), and `.review-prompt-banner`
thin modifiers (gradient/color only). Reuse `.banner-content`/`.banner-icon`/
`.banner-text`/`.banner-close` (194-213) and `.banner-action` (252-273) verbatim.
Keep the existing `slideIn`/fade only (design §5 — no bouncing/pulsing).
`.popup-banner.hidden { display:none }` covers all three.

---

## 7. Validation (design §12)

### 7.0 — Run order

`cd tabtasktick && npm install` → `npm test` → `npm run i18n:check` →
`npm run i18n:parity` → `npx playwright test tests/e2e/review-prompt.spec.js`.
(Lint: the project's ESLint config treats `no-hardcoded-ui-string` as `error` in
`options/**` and `popup/**` — run the lint step too.)

### 7.1 — Unit tests (`tests/services/ReviewPromptService.test.js`)

- Framework: Jest 29 ESM; global `chrome` mock auto-installed (tests/setup.js),
  reset each test.
- **Use the stateful storage helper** (`installStatefulStorage`, copied from
  `tests/export-window-names.test.js:9-25`) for read-after-write across
  `track`/`markShown`/`recordOutcome`.
- **Time:** pass `{ now }` explicitly — **no fake timers needed**. This is why
  every time-touching fn takes `now`.
- **Reset module cache between tests:** the service holds `state`/`countedThisSession`
  module-level. Use `jest.resetModules()` + dynamic `await import()` **in the test
  file only** (test files are Node/Jest, not the extension runtime — the
  no-dynamic-import rule is an *extension* constraint, not a test one), or export a
  `__resetForTests()` hook. Prefer the explicit hook to keep tests simple.
- One assertion per §7.3 matrix row, asserting `shouldPrompt({ now }).reason`.

### 7.2 — E2E (`tests/e2e/review-prompt.spec.js`)

- Import `{ test, expect }` from `./fixtures/extension.js`; worker-scoped shared
  context, `workers:1`, shared profile/IndexedDB per file.
- **Open the popup as a page** — `page.goto(\`chrome-extension://${extensionId}/popup/popup.html\`)`.
  **Do not** try to click the toolbar action popup (not reliably drivable in
  Playwright). Same for options: `…/options/options.html`. This spec is
  **first-of-kind** (no existing popup/options E2E) — model structure on
  `tests/e2e/sidepanel-tasks-view.spec.js`.
- Seed/inspect storage from the SW: `serviceWorkerPage.evaluate(() =>
  chrome.storage.local.get('reviewPrompt'))` and `.set(...)`.
- Flow: (1) enable Developer Mode via options page; (2) drive the §5 controls —
  load each scenario, assert the state block ✓/✗ matches the matrix; (3) with
  force-show on, open the popup page, assert the prompt renders in the promo slot,
  click each §2 path, assert `reviewPrompt` storage matches §7.3; (4) **gate-6
  test** (E2E-only): with all gates passing and force-show **off**, open the popup
  page → prompt shows; reload the page (same day) → prompt does **not** re-show
  (cooldown/`shownCount`).

### 7.3 — Coverage matrix (design §12.2, with `shownCount`)

**Eligibility (gates) — load scenario, assert `shouldPrompt().reason`:**

| # | Condition | Scenario(s) | Expected |
|---|---|---|---|
| 1 | Exposure cap (§2.1) | `cap_reached` (`shownCount=3`) | `reason: exposure_cap` |
| 2 | Install age ≥14 | `install_13d` / `install_14d` | `install_too_recent` / `eligible` |
| 3 | Dashboard opens ≥2 | `opens_1` / `opens_2` | `not_enough_engagement` / `eligible` |
| 4 | Dashboard recency ≤14d | `recency_15d` | `engagement_stale` |
| 5 | Cooldown ≥7d | `cooldown_6d` / `cooldown_7d` | `in_cooldown` / `eligible` |
| 6 | Not rated/declined | `rated` / `declined` | `already_resolved` (both) |
| 7 | Defer window | `defer_29d` / `defer_31d` | `deferred_recently` / `eligible` (version `after_defer`) |
| 8 | Dismiss window | `dismiss_89d` / `dismiss_91d` | `dismissed_recently` / `eligible` |
| — | First-open-of-day | **E2E-only** (§7.2 step 4) | second open same day → not shown |

**Outcomes — `all_pass` + force-show, click path, assert storage:**

| Path | Storage | Re-eligible |
|---|---|---|
| Step1 Dismiss × | `lastDismissedAt=now`, `shownCount++` | 90d |
| Step1 👎 | `feedbackPath='github'` | never |
| Step2a Rate | `rated=true` | never |
| Step2a Maybe later | `lastDeferredAt=now` | 30d (version `after_defer`) |
| Step2b GitHub | `feedbackPath='github'` | never |
| Step2b No thanks | `declined=true` | never |
| (passive close) | `shownCount++`, `lastPromptAt=now`, no suppression flag | 7d, until `shownCount` cap (§2.1) |

### 7.4 — Manual QA checklist (via options UI)

1. Dev Mode **off** → §5 controls hidden; `setForceShow`/`getDebugState` inert.
2. Dev Mode **on** → state block renders the gate checklist with live values.
3. Walk the gate matrix via *Load test scenario*; confirm each `reason`.
4. **Organic dry-run:** `resetState`, keep state block open, actually use the
   extension — open the dashboard from the popup twice, apply `install_14d` — and
   watch gates 3 & (install) flip to ✓ live (storage.onChanged), ending
   `eligible:true` with force-show **off**.
5. Force-show on → walk all 6 outcome paths; confirm suppression + re-eligibility.
6. Confirm `shownCount` increments on each show and the cap blocks at 3.
7. `resetState` → back to first-run.

---

## 8. i18n (design §8)

- Add keys to `_locales/en/messages.json` (`{ "message": "…" }`, no `description`
  field used in this codebase). User-facing prompt keys: the 6 from design §8.
  Dev-panel keys: `options_reviewPrompt_*` from design §8.
- Add the **same keys to all 6 other locales** (de/es/fr/ja/ko/pt_BR) — `i18n:parity`
  fails on any missing key. No plural keys here, so no `_many`/`_one`/`_other`
  fan-out. Translations per decision 2.4.
- `i18n:check` will fail if any `t('key')`/`data-i18n="key"` reference lacks an en
  entry — add en first.
- Static popup/options text via `data-i18n` (auto-applied); dynamic text via `t()`.
- Optional: `npm run i18n:pseudo` to eyeball overflow in `en_XA` (excluded from
  the packaged build).

---

## 9. Background change (minimal)

`background-integrated.js` `onInstalled` (386-402): change the handler to receive
`details` and seed `installedAt` only on true installs, additively (don't touch
the existing init sequence):

```js
chrome.runtime.onInstalled.addListener(safeAsyncListener(async (details) => {
  if (details?.reason === 'install') {
    const cur = await chrome.storage.local.get('reviewPrompt');
    if (!cur.reviewPrompt?.installedAt) {
      await chrome.storage.local.set({ reviewPrompt: { installedAt: Date.now() } });
    }
  }
  // …existing body unchanged…
}));
```

Note it currently uses `safeAsyncListener` already (background-integrated.js:386).
The `ensureInitialized()` lazy-seed (§4.2) is the real safety net (upgraders get
`reason:'update'`, not `'install'`); this just makes fresh installs precise. The
`storage` permission is already present (manifest.json:7-18).

---

## 10. Implementation sequence (single PR, verifiable steps)

1. `npm install` (step 0).
2. `ReviewPromptService.js` + unit tests (§4, §7.1) — TDD the gate matrix first;
   no UI yet. Green `npm test`.
3. en `messages.json` keys, then the 6 locales (§8). Green `i18n:check` +
   `i18n:parity`.
4. Popup: markup, CSS, init render, mutex, tracking, outcomes (§6). Manual smoke
   via popup-as-page.
5. Options dev controls + state block + live refresh (§5). Manual QA (§7.4).
6. `background-integrated.js` `installedAt` seed (§9).
7. E2E spec (§7.2). Green Playwright.
8. Lint (ESLint, incl. `no-hardcoded-ui-string`).
9. `feedback.md` template if decision 2.5 says yes.

---

## 11. Risk register

| Risk | Mitigation |
|---|---|
| **Unbounded passive-ignore nagging** (design hole) | `shownCount` cap, `MAX_LIFETIME_SHOWS=3` (§2.1) — the #1 fix; without it the plan breaks its own promise. |
| **Stale `state` cache across popup/options contexts** | `getDebugState()` reads fresh; `onChanged` calls `reloadState()` (§1, §4.2, §5.1). |
| **`recent_error` gate ships inert** | Gate **cut** (owner decision) — removed from service, design §3, and matrix (§4.1). |
| **Gate logic drift** (eval vs debug) | Single ordered `GATE_DESCRIPTORS` array iterated by both `firstFailingGate` and `getDebugState` (§4.4). |
| **Banner clobbers slot** (two show-paths) | `reviewPromptActive` mutex on **both** popup.js:130 and :199; `maybeShowReviewPrompt` awaited before first `loadCollectionsAndTasks` (§6.2, §6.3). |
| **Fade-out code duplicated a third time** | Extract `fadeOutAndHide()`, refactor all three call sites; base `.popup-banner` CSS class (§6.5, §6.6). |
| 5s loop re-renders the prompt mid-session | `reviewPromptEvaluated` once-per-open guard (§6.2). |
| Module `state` cache stale across tests | `__resetForTests()` hook (§7.1). |
| ESLint flags the raw state dump | `JSON.stringify` is a CallExpression, not a literal (§1); labels via `t()`. |
| `i18n:parity` fails on missing locale keys | Add keys to all 7 locales; decision 2.4 on translation quality. |
| `devForceShow` leaking to real users | Cleared when Developer Mode toggled off (§5 guardrail); no prod code path writes it. |
| Time non-determinism in tests | `{ now }` injection everywhere (§1). |
| E2E can't drive the toolbar popup | Open popup/options as `chrome-extension://…` pages (§7.2). |
| `node_modules` absent → nothing runs | `npm install` is step 0 (§0). |
| First-open-of-day not unit-testable | Documented as E2E-only (§4.4, §5.2, §7.2). |
