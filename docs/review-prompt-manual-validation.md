# Review Prompt — Manual Validation Guide

> How to hand-test the Chrome Web Store review prompt. The feature is
> **deliberately rare** (gated so <~1 in 50 sessions sees it), so it ships with
> Developer-Mode test controls that let you trigger and inspect it without
> waiting real days.
>
> - **Design:** [`review-prompt-plan.md`](./review-prompt-plan.md)
> - **Implementation:** [`review-prompt-implementation-plan.md`](./review-prompt-implementation-plan.md)
> - **Automated coverage:** `tabtasktick/tests/services/ReviewPromptService.test.js`
>   (50 unit) and `tabtasktick/tests/e2e/review-prompt.spec.js` (13 Playwright).
>   This guide is the *manual* counterpart to those.

---

## 0. Setup

1. Load the extension unpacked: `chrome://extensions` → enable **Developer mode**
   (top-right) → **Load unpacked** → select `tabtasktick/` (the inner folder
   containing `manifest.json`). Or use a build from `./package-ext.sh`.
2. **Open the popup** by clicking the TabTaskTick toolbar icon. (The review
   prompt lives in the popup, in the same slot as the "Try Collections" banner.)
3. **Open Options:** right-click the toolbar icon → **Options**, or
   `chrome://extensions` → TabTaskTick → **Details** → **Extension options**.

> Two distinct "Developer mode" toggles exist — Chrome's (step 1) and
> TabTaskTick's own (below). You need both for testing.

---

## 1. Reveal the test controls

In **Options → General tab → Developer Options**:

1. Turn on **Developer Mode** (the toggle). A **Developer Options** panel expands.
2. You'll see the review-prompt controls (alongside Log Level / Test Log):

| Control | ID | What it does |
|---|---|---|
| **Force-show review prompt** | `rpForceShow` | Bypasses *all* eligibility gates so the prompt shows on every popup open. |
| **Prompt copy variant** | `rpVariant` | `fresh` vs `after_defer` — which Step 1 copy the forced prompt shows. |
| **Load test scenario** dropdown + **Apply** button | `rpScenario` / `rpApplyScenario` | Writes storage into a known single-gate state (see §3). The **Apply** button sits on the *same row*, to the right of the dropdown. |
| **Review-prompt state** | `rpState` | Live ✓/✗ gate checklist + raw stored JSON. Updates as you use the extension. |
| **Reset State** | `rpReset` | Wipes review-prompt storage back to first-run. |

> If you toggle Developer Mode **off**, Force-show is automatically cleared so it
> can never leak into a normal user's session — verify this (§7).

---

## 2. Quick smoke test (2 minutes)

1. Options → Developer Mode **on** → **Force-show review prompt** **on**.
2. Open the popup. ✅ You should see the review banner in the promo slot:
   **"Enjoying TabTaskTick?"** with **Yes** / **Not yet** and a dismiss **×**.
   The "Try Collections" banner should be **hidden** (mutex).
3. Click **Yes** → it swaps to **"Mind leaving a review? It really helps."** with
   **Rate on Chrome Web Store** / **Maybe later**.
4. Close the popup, reopen → prompt shows again (force-show ignores gates/cooldown).
5. Re-open the popup and click **Not yet** instead → it swaps to the negative
   path: **"Sorry to hear it…"** with **Open a GitHub issue** / **No thanks**.
6. Turn **Force-show off** when done.

If all of that renders and transitions, the UI wiring is good. Now validate the
*logic*.

---

## 3. Validate each eligibility gate (via scenarios)

The prompt only fires organically when **all** gates pass. The **Load test
scenario** control puts storage into a state that isolates one gate so you can
confirm it blocks (and its boundary passes). With Force-show **off**:

1. Pick a scenario in the **Load test scenario** dropdown, then click the
   **Apply** button on the same row (to the right of the dropdown).
2. Read the **Review-prompt state** block — the **verdict line** shows
   `eligible` / `not eligible` and the **reason** (the first failing gate). Each
   gate row shows ✓/✗ with its derived value (e.g. `install age 13/14 days`).

| Scenario | Expected verdict (reason) |
|---|---|
| `all_pass` | ✅ eligible |
| `install_13d` | ❌ `install_too_recent` |
| `install_14d` | ✅ eligible |
| `opens_1` | ❌ `not_enough_engagement` |
| `opens_2` | ✅ eligible |
| `recency_15d` | ❌ `engagement_stale` |
| `cooldown_6d` | ❌ `in_cooldown` |
| `cooldown_7d` | ✅ eligible |
| `rated` | ❌ `already_resolved` |
| `declined` | ❌ `already_resolved` |
| `defer_29d` | ❌ `deferred_recently` |
| `defer_31d` | ✅ eligible, **version `after_defer`** |
| `dismiss_89d` | ❌ `dismissed_recently` |
| `dismiss_91d` | ✅ eligible |
| `cap_reached` | ❌ `exposure_cap` |

The `_13d`/`_14d`, `_6d`/`_7d`, `_29d`/`_31d`, `_89d`/`_91d` pairs are the two
sides of each gate's boundary — confirm the prompt flips from blocked to eligible
across them. After applying an `all_pass`/eligible scenario, open the popup
(force-show still off) to confirm the prompt actually appears.

> The state block reads storage **fresh** every time, so the verdict always
> reflects what's actually stored.

---

## 4. The organic dry-run (the real test)

This proves the prompt fires from genuine use, with **no force-show**:

1. Options → **Reset State**. The state block should show a fresh first-run
   state: `install_too_recent` (installed just now), `not_enough_engagement`
   (0 dashboard opens).
2. Apply scenario `install_14d` (so install age is no longer the blocker) — or,
   if you want to wait, leave it and the install gate clears after 14 days.
3. **Leave the Options tab open** with the state block visible.
4. In the popup (open it from the toolbar), click **Dashboard** to open the
   dashboard. Do this from **two separate popup opens** (close the popup and
   reopen between them — opens are deduped per popup session).
5. Watch the **Review-prompt state** block in the Options tab update **live**:
   `dashboard opens` climbs 0 → 1 → 2, and the `not_enough_engagement` gate
   flips ✓. With install age also satisfied, the verdict becomes **eligible**.
6. Now open the popup → the review prompt appears **organically** (no force-show).

This exercises the live cross-context refresh (popup writes, Options re-renders
via `storage.onChanged`) and the real engagement counter that gates the feature.

---

## 5. Outcome paths & what to verify

With the prompt showing (force-show or organic), each action records state. Check
it in the **Review-prompt state** block (or via DevTools, §8). Every display
increments `shownCount` and sets `lastPromptAt`.

| Action | Stored effect | Re-eligible |
|---|---|---|
| Step 1 — **Dismiss ×** | `lastDismissedAt` set | after **90 days** |
| Step 1 — **Not yet** (👎) | `feedbackPath: "github"` | **never** |
| Step 2 — **Rate on Chrome Web Store** | `rated: true`; opens the Web Store review page | **never** |
| Step 2 — **Maybe later** | `lastDeferredAt` set | after **30 days** (next time shows the `after_defer` copy) |
| Step 2 — **Open a GitHub issue** | `feedbackPath: "github"`; opens the GitHub feedback issue | **never** |
| Step 2 — **No thanks** | `declined: true` | **never** |
| **Passive close** (close popup, no click) | `shownCount++`, `lastPromptAt` set, no suppression flag | after **7 days**, until the exposure cap |

To verify a "never again" path: take that action, then **turn force-show off**,
Apply `all_pass`, and confirm the verdict is `already_resolved` (rated/declined)
or that re-eligibility is blocked.

**Verify the Web Store / GitHub links** open:
- Rate → `https://chromewebstore.google.com/detail/kninondobdcahcnbfknfeijdljkkbbgc/reviews`
- GitHub → `https://github.com/lenulus/tabtasktick/issues/new?labels=feedback`

---

## 6. Exposure cap (≤3 lifetime shows)

The prompt can never appear more than **3 times** total, even if it's only ever
passively ignored:

1. **Reset State**, then Apply `all_pass`.
2. Open the popup (prompt shows) and **just close it** without clicking. Repeat —
   each open after a reset... no: instead, watch `shownCount` in the state block
   climb with each display. (You can also Apply `cap_reached` to jump straight to
   `shownCount: 3`.)
3. With `shownCount` at 3, Apply `all_pass`-style state but keep `shownCount: 3`
   (or use `cap_reached`) → verdict is `exposure_cap`, prompt never shows.

---

## 7. Guardrails

- **Force-show clears on Developer-Mode-off:** turn Force-show **on**, then turn
  **Developer Mode off**. Reopen Options → Force-show is **off** and the dev
  controls are hidden. Confirm the popup shows **no** prompt (unless gates pass
  organically). This proves the override can't leak to real users.
- **Dev controls are hidden** entirely when Developer Mode is off.

---

## 8. Inspecting raw storage directly (optional)

The state block shows everything, but to peek yourself:

1. `chrome://extensions` → TabTaskTick → **Inspect views: service worker**.
2. In that DevTools console:
   ```js
   chrome.storage.local.get('reviewPrompt', (r) => console.log(r.reviewPrompt));
   ```
3. To hand-set a state for testing:
   ```js
   chrome.storage.local.set({ reviewPrompt: { installedAt: Date.now() - 20*864e5,
     dashboardOpensFromPopup: 2, lastDashboardOpenFromPopupAt: Date.now(),
     shownCount: 0 } });
   ```
   (The state block in Options reflects it live.)

---

## 9. Reset between runs

Click **Reset State** in Options (or `chrome.storage.local.remove('reviewPrompt')`
in the SW console) to return to first-run before each scenario so tests don't
contaminate each other.

---

## 10. What the automated tests already cover

You don't need to manually re-verify these — they run in CI:

- **Unit** (`npm test`, `tests/services/ReviewPromptService.test.js`): every gate
  boundary, all outcome transitions, the exposure cap, session dedup, the
  variant, and the concurrent-write regression.
- **E2E** (`npx playwright test tests/e2e/review-prompt.spec.js`): drives the real
  Options dev controls and popup in headful Chrome — dev panel scenarios, all six
  outcome paths, first-open-of-day cooldown, the Collections mutex, and the copy
  variant.

Manual testing is most valuable for **look-and-feel** (does the banner read well,
is the dismiss as prominent as the CTA, do the links open the right pages) and the
**organic dry-run** (§4), which the unit tests can only approximate.
