# TabTaskTick Review Prompt — Plan

> **Status:** Proposed. **Goal:** ask happy users for a Chrome Web Store review
> without bothering anyone — fewer than ~1 in 50 sessions ever sees the prompt,
> and nobody sees it twice unless they explicitly defer.
>
> **Surface decided:** **popup**, occupying the same slot where we currently
> advertise Collections. Rationale in §5. Dashboard surfaces are out of scope
> for the first release.

---

## 1. Non-goals (what this is *not*)

These constraints come from the user — they shape every other decision:

- **Not a popup that fires on launch.** Modal-on-startup is the #1 cause of
  one-star reviews complaining about begging.
- **Not a recurring nag.** Each user sees the prompt **at most three times** in
  their entire lifetime with the extension (the §2 worst case), enforced by a hard
  `shownCount` cap (`MAX_LIFETIME_SHOWS = 3`). After a definitive choice — or the
  cap — never again. The cap also bounds users who passively ignore the prompt
  (close the popup without clicking), who otherwise set no suppression flag.
- **Not shown to users who haven't gotten value.** Eligibility gates (§3) must
  pass first — otherwise we're asking strangers for a favor.
- **Not a wall.** The prompt is dismissable with one click, and the dismiss
  affordance is at least as prominent as the "rate it" button.
- **No telemetry.** TabTaskTick is local-only and ships zero analytics. We will
  *not* add usage tracking to measure prompt effectiveness — the signal is the
  Chrome Web Store review count going up.

---

## 2. The two-step ask pattern

This is the industry-standard "intent gate" — used by Tweetbot, Overcast,
DuckDuckGo, and most well-rated indie apps for the last decade. It works
because it routes unhappy users to feedback channels *before* they have the
opportunity to leave a one-star review.

```
                       Step 1
              ┌─────────────────────────────┐
              │  Enjoying TabTaskTick?      │
              │                             │
              │  [ 👍 Yes ]   [ 👎 Not yet ]│
              │              [ Dismiss × ]  │
              └─────────────────────────────┘
                   │                  │
        thumbs up  │                  │  thumbs down
                   ▼                  ▼
        ┌────────────────────┐  ┌────────────────────────┐
        │ Mind leaving a     │  │ Sorry to hear it.      │
        │ review? It really  │  │ Want to share what     │
        │ helps.             │  │ could be better?       │
        │                    │  │                        │
        │ [ Rate on Web      │  │ [ Open a GitHub issue ]│
        │   Store ]          │  │ [ No thanks ]          │
        │ [ Maybe later ]    │  │                        │
        └────────────────────┘  └────────────────────────┘
```

### Outcomes and follow-up behavior

| User action | What we record | When (if ever) we ask again |
|---|---|---|
| Step 1: Dismiss `×` | `dismissedAt: now` | Re-eligible after **90 days**, only if all gates §3 still pass |
| Step 1: Thumbs down | `feedbackPath: github` | **Never again** — they're a feedback channel, not a review channel |
| Step 2a: "Rate on Web Store" | `rated: true` | **Never again** |
| Step 2a: "Maybe later" | `deferredAt: now` | Re-eligible after **30 days**, only if all gates still pass |
| Step 2b: "Open GitHub issue" | `feedbackPath: github` | **Never again** |
| Step 2b: "No thanks" | `declined: true` | **Never again** |

The most aggressive scenario possible: a user is shown the prompt, hits
"Maybe later", waits 30 days, gets shown it again, hits "Dismiss ×", waits 90
days, gets shown it once more, declines. **Three exposures total, ever.**

---

## 3. Eligibility gates (all must pass)

Before the prompt is *eligible* to fire, every one of these must be true:

| Gate | Threshold | Rationale |
|---|---|---|
| **Days since install** | ≥ 14 | Don't ask strangers — give them time to form an opinion |
| **Dashboard opened from popup** | ≥ 2 distinct sessions | Evidence the user has actively engaged beyond the quick-action popup surface. One open could be exploratory; two is intent. Works for users who go to the dashboard for *any* reason — Tasks, Rules, Snoozed, Collections, History — not feature-specific. |
| **Prompt cooldown** | No prompt shown in last 7 days | Anti-spam guard |
| **Not previously rated/declined** | `rated !== true && declined !== true` | Lifetime suppression once they've made a definitive choice |
| **Under lifetime exposure cap** | `shownCount < 3` | Hard ceiling so passive ignores can't nag forever (see §2) |

> **Cut:** an earlier draft had a "No errors in last 5 minutes" gate. It is
> **removed** — there is no error signal in the extension to drive it, and a gate
> with no producer always passes (ships inert), which is exactly the false-coverage
> trap §12 warns against. Re-add only if a real recent-error signal exists.

A user who installs today, opens the popup a few times, and never visits the
dashboard would *never* see the prompt. That's the point.

### Why "dashboard opened from popup" specifically

- **Feature-neutral.** Captures engagement signal regardless of *which*
  TabTaskTick features the user values. A heavy Tasks user qualifies as
  easily as a heavy Collections user.
- **Single, cheap instrumentation point.** One counter, one call site in
  the popup's dashboard-open handler. No wiring into N execution services,
  no granular action-counting logic.
- **Hard to game accidentally.** Unlike "opened the popup" (which fires
  every time a user reaches for any extension), opening the dashboard from
  the popup is a deliberate navigation — clicking past the lightweight
  surface to the heavier one is meaningful intent.
- **"Through the popup" matters.** Direct dashboard URL opens (via
  bookmark, tab restore, deep-link) don't count — the user has to make
  that navigation choice from the popup itself.

---

## 4. Trigger: popup open + first-open-of-day

The popup is itself a deliberate user action — opening it is the trigger.
The prompt renders in the slot currently occupied by the Collections promo,
gated by:

| Condition | Reason |
|---|---|
| **All §3 gates pass** | The bar for being shown at all |
| **First popup open of the day** | Popup opens are frequent — many users hit it dozens of times daily. Capping to first-open per day prevents accidental re-renders mid-session. |
| **Last dashboard-open from popup ≤ 14 days ago** | Show while the positive memory of recent engagement is fresh. A user who actively used the dashboard last month but hasn't since may have drifted away — don't ambush them. |

### Display logic when popup opens

```
1. User has rated or declined?       → no review prompt slot
                                       (Collections promo unaffected)
2. All §3 gates pass + first-open-today + recent dashboard-from-popup?
                                     → show review prompt in the promo slot
3. Otherwise                         → show whatever the slot would have
                                       shown anyway (Collections promo, etc.)
```

The review prompt and the Collections promo are not feature-coupled — they're
just two pieces of content that compete for the same UI real-estate when
both are eligible. Precedence: review prompt wins when its (stricter) gates
pass, since it has a 4-month effective cap and won't dominate the slot.

### What about the dashboard?

Out of scope for the first release. If popup-only doesn't move review numbers
enough after 4–6 weeks of data, the dashboard banner (originally proposed as
primary in earlier drafts) is a clean Phase 3 add-on with the same service
backend.

---

## 5. Placement: popup Collections-promo slot

The popup already has a promotional slot used to advertise Collections. The
review prompt replaces that slot's content when the §3 gates and §4 mutex
conditions all pass.

### Why this surface

- **Highest reach** — most users see the popup multiple times per day.
  Dashboard reach is much lower (many TabTaskTick users never open it,
  which is precisely why "opened the dashboard from the popup ≥ 2 times"
  is the right engagement gate).
- **Popup-open is itself a deliberate user action** — the user came here to
  do something, so showing the prompt isn't interrupting work, just
  occupying the same slot they were already going to see.
- **One surface to test** — no need to build dashboard logic and reconcile
  two surfaces' suppression state for the first release.

### Visual treatment

Not a modal. Not an overlay. The prompt occupies the existing promo slot
inline, matching the visual weight of the Collections promo it replaces —
same border, same padding, same dismiss control. The user should be able to
ignore it as easily as they ignore (or close) the Collections promo today.

Animation: fade-in only. **No bouncing, no pulsing, no attention-grabbing
microinteractions.** A respectful review prompt is quiet.

### Why not popup-as-modal

A modal blocking the popup body is hostile — the user came to do *one
specific thing* and the modal blocks it. The Collections promo today doesn't
block the popup's primary content; the review prompt should match that
restraint.

---

## 6. Architecture

Follow the services-first pattern from `CLAUDE.md`. All prompt logic lives in
a service; the surface code just asks "should I show?" and renders.

```
services/
  execution/
    ReviewPromptService.js   # ← new
  utils/
    i18n.js                  # already exists — all strings via t()
```

### `ReviewPromptService.js` — public API

```js
// Increment the dashboard-from-popup counter. Idempotent within a session
// (multiple opens of the dashboard from the same popup session count as 1).
trackDashboardOpenFromPopup()

// Returns { eligible, reason, version } where:
//   eligible: boolean — all gates §3 pass right now
//   reason: string — debug label, e.g. 'install_too_recent', 'rated'
//   version: 'fresh' | 'after_defer' — controls Step 1 copy variant
// Accepts an optional injected clock so unit tests can drive every time-based
// gate deterministically (CLAUDE.md: same inputs → same outputs). Production
// callers pass nothing and it uses the real clock.
shouldPrompt({ now = Date.now() } = {})

// Record the outcome from the UI (§2 table).
// Updates storage + suppresses future prompts per the table.
recordOutcome({ step, action })  // e.g. ({ step: 2, action: 'rated' })

// --- Developer/testing surface (gated by Developer Mode, see §10.1) ---

// Returns everything needed to verify the prompt triggers ORGANICALLY —
// the raw storage, the live shouldPrompt() result, and a per-gate breakdown
// with human-readable derived values so a tester can watch gates flip while
// actually using the extension (no force-show involved). Read-only.
getDebugState()
// → {
//     storage: { ...reviewPrompt key verbatim... },
//     shouldPrompt: { eligible, reason, version },
//     derived: {
//       daysSinceInstall,            // e.g. 9   (gate needs ≥ 14)
//       dashboardOpensFromPopup,     // e.g. 1   (gate needs ≥ 2)
//       daysSinceLastDashboardOpen,  // e.g. 0   (§4 needs ≤ 14)
//       daysSinceLastPrompt,         // e.g. null/30 (gate needs ≥ 7)
//       firstOpenToday,              // bool (§4)
//     },
//     gates: [                       // §3 + §4, each evaluated independently
//       { id: 'install_age',        pass: false, detail: '9/14 days' },
//       { id: 'dashboard_opens',    pass: false, detail: '1/2 sessions' },
//       { id: 'prompt_cooldown',    pass: true,  detail: 'no prompt in 7d' },
//       { id: 'not_rated_declined', pass: true,  detail: '' },
//       { id: 'exposure_cap',       pass: true,  detail: '0/3 shown' },
//       { id: 'recent_dashboard',   pass: true,  detail: '0d ago (≤14)' },
//       { id: 'first_open_today',   pass: true,  detail: '' },
//     ],
//   }
// The gate list is the SAME predicate set shouldPrompt() evaluates — it
// reads them, never re-implements them, so the panel can't drift from reality.

// Wipe the `reviewPrompt` key back to first-run state (installedAt reset to
// now). Used by the "Reset review-prompt state" dev button.
resetState()

// Set/clear the dev force-show override (persisted as `reviewPrompt.devForceShow`).
// When true, shouldPrompt() short-circuits to eligible regardless of gates.
setForceShow(enabled)

// Load a named test scenario (§12) — writes the `reviewPrompt` key to a known
// state that isolates ONE gate/behavior (e.g. 'install_too_recent' back-dates
// installedAt to now-13d with every other gate passing). This is how the
// time-based gates get tested without waiting: the scenario back-dates the
// relevant timestamp. Returns the resulting getDebugState() for assertion.
applyTestScenario(id)
```

When `devForceShow` is set, `shouldPrompt()` returns
`{ eligible: true, reason: 'dev_override', version }` **before evaluating any
§3 gate**, and the popup's §4 first-open-of-day cap is also bypassed so the
prompt renders on every popup open. The `version` ('fresh' | 'after_defer')
honors the dev variant selector (§10.1) so both copy variants are previewable.
The override only ever flips via the Developer Options panel — no production
code path writes `devForceShow`, so a normal user can never trip it.

### Storage shape (`chrome.storage.local`)

Single key `reviewPrompt`:

```js
{
  installedAt: 1748000000000,            // epoch ms, set on first run
  dashboardOpensFromPopup: 0,            // counter, gated by §3 (≥ 2)
  lastDashboardOpenFromPopupAt: null,    // for the §4 14-day recency window
  lastPromptAt: null,                    // §3 cooldown
  lastDeferredAt: null,                  // 30-day re-ask window
  lastDismissedAt: null,                 // 90-day re-ask window
  rated: false,                          // lifetime suppression
  declined: false,                       // lifetime suppression
  shownCount: 0,                         // hard lifetime exposure cap (§2): max 3
  devForceShow: false,                   // dev-only override (§10.1); never set in prod
}
```

### Single call site for `trackDashboardOpenFromPopup`

Just one — wherever the popup currently handles its "Open dashboard" button:

- `popup/popup.js` → on the dashboard-link click handler, before opening
  the dashboard tab.

A session deduper inside the service prevents a user who opens the dashboard,
returns to the popup, and opens it again from incrementing twice in the same
popup session.

UI surfaces never call `trackDashboardOpenFromPopup` from anywhere else.

---

## 7. UI components

### Step 1 — initial ask (inline banner)

Visual treatment matches existing dashboard "info" banner — same border,
padding, dismiss icon position. Not a modal, no overlay, no animation other
than a single fade-in.

```html
<div class="review-prompt-banner" role="dialog" aria-labelledby="rp-q">
  <p id="rp-q">${t('reviewPrompt_step1_question')}</p>
  <button class="primary">${t('reviewPrompt_step1_yes')}</button>
  <button class="secondary">${t('reviewPrompt_step1_no')}</button>
  <button class="dismiss" aria-label="${t('reviewPrompt_dismiss')}">×</button>
</div>
```

### Step 2 — positive path

```html
<div class="review-prompt-banner review-prompt-positive">
  <p>${t('reviewPrompt_step2_positive_question')}</p>
  <a href="${webStoreUrl}" target="_blank" class="primary">
    ${t('reviewPrompt_step2_positive_rate')}
  </a>
  <button class="secondary">${t('reviewPrompt_step2_positive_later')}</button>
</div>
```

### Step 2 — negative path

```html
<div class="review-prompt-banner review-prompt-negative">
  <p>${t('reviewPrompt_step2_negative_question')}</p>
  <a href="${githubIssueUrl}" target="_blank" class="primary">
    ${t('reviewPrompt_step2_negative_feedback')}
  </a>
  <button class="secondary">${t('reviewPrompt_step2_negative_decline')}</button>
</div>
```

Animation: fade-in only. **No bouncing, no pulsing, no attention-grabbing
microinteractions.** The respectful version of this UX is quiet.

---

## 8. Localization

All strings go through `t()` and add to `_locales/en/messages.json`. New keys:

```
reviewPrompt_step1_question        "Enjoying TabTaskTick?"
reviewPrompt_step1_yes             "Yes"
reviewPrompt_step1_no              "Not yet"
reviewPrompt_dismiss               "Dismiss"
reviewPrompt_step2_positive_question  "Mind leaving a review? It really helps."
reviewPrompt_step2_positive_rate      "Rate on Chrome Web Store"
reviewPrompt_step2_positive_later     "Maybe later"
reviewPrompt_step2_negative_question  "Sorry to hear it. Want to share what could be better?"
reviewPrompt_step2_negative_feedback  "Open a GitHub issue"
reviewPrompt_step2_negative_decline   "No thanks"
```

Developer Options panel labels/descriptions (§10.1) also go through `t()`:

```
options_reviewPrompt_forceShow_label   "Force-show review prompt"
options_reviewPrompt_forceShow_desc    "Bypass all eligibility gates and show the prompt on every popup open"
options_reviewPrompt_variant_label     "Prompt copy variant"
options_reviewPrompt_state_label       "Review-prompt state"
options_reviewPrompt_state_desc        "Live gate checklist + stored metadata for verifying organic triggering"
options_reviewPrompt_reset_btn         "Reset review-prompt state"
```

(The popup occupies the existing Collections promo slot, so no separate
footer-link string is needed for Phase 1. If Phase 3 adds a dashboard banner,
no new keys are needed — it reuses the same Step 1 / Step 2 strings. The
read-only state dump itself is raw debug output and is not localized.)

All 6 translated locales must be updated before merge —
`npm run i18n:parity` will block otherwise.

---

## 9. URLs

| Purpose | URL |
|---|---|
| Chrome Web Store review page | `https://chromewebstore.google.com/detail/<ext-id>/reviews` |
| GitHub issue tracker | `https://github.com/lenulus/tabtasktick/issues/new?labels=feedback&template=feedback.md` |

Hard-code as constants in `ReviewPromptService.js` — the extension ID is fixed
post-publish and we already have the GitHub URL elsewhere in the codebase.

If a `feedback.md` issue template doesn't exist yet, that's a small
prerequisite — see §11.

---

## 10. Implementation phases

Single shipping phase for the feature itself, followed by an observe window and
an optional dashboard add-on.

### Phase 1 — popup review prompt + dev tooling (one PR)

The full feature ships in one release. The earlier draft split this into
"instrument only" (A) then "show the prompt" (B) so existing users'
dashboard-from-popup counters could pre-warm before the prompt went live. We're
collapsing that: the cold-start ramp (everyone starts at counter 0, so the
prompt only fires once users re-accumulate ≥ 2 dashboard-from-popup opens) is
**on-brand** for a deliberately rare, quiet prompt — a gradual ramp is fine,
not a bug. One release is simpler and the dev tooling (§10.1) removes the only
real reason the split existed: being unable to exercise the prompt without
weeks of accumulated state.

Scope:

- Add `ReviewPromptService.js` with the full public API (§6): storage,
  `trackDashboardOpenFromPopup()`, `shouldPrompt()`, `recordOutcome()`, and the
  dev surface (`getDebugState()`, `resetState()`, `setForceShow()`).
- Add the single `trackDashboardOpenFromPopup()` call site in `popup/popup.js`
  on the dashboard-open click handler (§6).
- Add the prompt component to the popup, occupying the Collections promo slot
  when its gates pass. Implement §4 display logic (first-open-of-day + 14-day
  recency window), wire Step 1 → Step 2 transitions, persist outcomes per §2.
- Add the Developer Options testing controls (§10.1) and the `applyTestScenario`
  scenario loader.
- Add the validation suite (§12): unit tests covering every gate/outcome
  boundary and the E2E spec driving the dev UI. Ships in the same PR — the
  feature is not "done" until the §12 matrix is green.
- Add localized strings (§8) across all locales; `npm run i18n:parity` must pass.

### 10.1 — Developer Options testing controls

Because every §3 gate is designed to make the prompt rare, it is effectively
**impossible to QA by waiting**. The plan therefore ships with test controls in
the existing **Developer Options** section of `options/options.html`, shown only
when **Developer Mode** is enabled (they live inside the existing
`#developerSettings` panel that is `.hidden` until the `developerMode` flag is
set, alongside Log Level and Test Log Levels).

Controls (each a `setting-item` matching the existing pattern — label +
`setting-description` + control):

| Control | Type | Behavior |
|---|---|---|
| **Force-show review prompt** | toggle | Calls `setForceShow(checked)`. When on, `shouldPrompt()` returns eligible on every popup open, bypassing all §3 gates and the §4 first-open-of-day cap. Persists as `reviewPrompt.devForceShow`. |
| **Prompt copy variant** | select | `fresh` / `after_defer` — sets which Step 1 copy variant the forced prompt renders, so both can be previewed. |
| **Review-prompt state** | read-only block | Renders `getDebugState()` (§6) as a per-gate checklist — each §3/§4 gate shown with a ✓/✗ and its derived value (e.g. `✗ install age 9/14 days`, `✗ dashboard opens 1/2`, `✓ first open today`), plus the overall `shouldPrompt()` verdict and the raw storage dump. This is the primary tool for confirming **organic** triggering: leave the panel open (or reopen it), use the extension normally — open the dashboard from the popup, let install age accrue — and watch each gate flip to ✓ without ever touching force-show. |
| **Reset review-prompt state** | button | Calls `resetState()` — wipes the `reviewPrompt` key back to first-run (re-enables a user who already rated/declined for repeat testing). |
| **Load test scenario** | select + "Apply" | Calls `applyTestScenario(id)` to put storage into a known single-variable state for each row of the §12 matrix (e.g. *Install too recent (13d)*, *Defer boundary − below 30d*, *Dismiss boundary − above 90d*, *Exposure cap reached*). Lets a tester reproduce any gate's pass/fail edge from the UI without back-dating timestamps by hand. The state block (above) then shows the resulting verdict. |

Because the metadata changes from *other* surfaces while the options tab sits
open (opening the dashboard from the popup increments `dashboardOpensFromPopup`
in a different context), the state block subscribes to
`chrome.storage.onChanged` for the `reviewPrompt` key and re-renders live — so
a tester can keep options open in one tab, exercise the popup/dashboard in
another, and watch the counters and gate ✓/✗ update in real time. Time-based
gates (install age, cooldowns) won't change second-to-second; a manual
"Refresh" affordance covers re-evaluating those on demand.

Guardrails:

- All four controls are inert unless `developerMode` is `true`; toggling
  Developer Mode off should also clear `devForceShow` so it can never leak into
  a normal user's session.
- No production code path writes `devForceShow` or calls `setForceShow()` —
  only this panel does. A regular user with Developer Mode off can never see or
  trip these.
- These are debug affordances, not user settings: no need to localize the
  read-only state dump, but the labels/descriptions still go through `t()` for
  consistency with the rest of the panel (§8 adds the keys).

### Phase 2 — observe and decide (no code, 4–6 weeks)

- Watch the Chrome Web Store review count.
- No analytics — the review count itself is the signal.
- If review velocity meaningfully increases, the popup-only design is
  sufficient. Stop here.
- If not, consider Phase 3.

### Phase 3 — dashboard banner (optional, only if Phase 2 says popup is insufficient)

- Add the dashboard banner described in earlier drafts of this plan.
- Trigger: ~1.5s after a successful Collection save, on the dashboard's
  Collections view.
- Same `ReviewPromptService` backend — the dashboard surface just calls
  `shouldPrompt()` and reuses the same suppression state, so a user who
  saw the prompt in the popup won't see it again on the dashboard.

---

## 11. Open questions

Worth a decision before Phase 1:

1. **Prompt visual weight** — match the existing Collections promo's exact
   border / padding / typography, or a slightly distinct variant so users
   notice the slot's content has changed? Lean: match exactly. Differentiation
   reads as "trying to grab attention," which the plan explicitly avoids.
2. **GitHub feedback issue template** — does `feedback.md` exist already? If
   not, the negative path will dump users on a generic "New Issue" page,
   which is OK but not ideal.
3. **Should "Open GitHub issue" pre-populate the issue body?** Could
   include extension version, locale, install date — useful for triage, but
   adds an "this extension knows things about me" surface. Lean: no
   pre-population, plain link only.
4. **Precedence when both promos are eligible.** The plan says the review
   prompt wins when its (stricter) gates pass, which is the right default.
   Worth a sanity check: are there cases where a brand-new feature promo
   would deserve priority over the review prompt? If so, add a
   `promoPriority` constant rather than scattering precedence logic.
5. **Install-age cold start.** With the single-phase rollout, existing users
   pass the 14-day install gate instantly but start at
   `dashboardOpensFromPopup: 0`, so the prompt ramps up only as they
   re-accumulate opens. Accepted as on-brand (§10). Confirm there's no desire
   to backfill `installedAt` for pre-existing users to shorten that ramp
   (lean: no — a clean start is simpler and the ramp is harmless).

---

## 12. Validation plan

The whole design is "rarely true," which makes it easy to ship something that
*looks* right and silently never fires (or fires when it shouldn't). Every gate
and outcome in this doc must have a way to be exercised and asserted. This
section maps each one to (a) an automated test and (b) a manual UI affordance
from §10.1, so nothing ships unverified.

### 12.1 — Testability requirements (must hold for any of this to be checkable)

- **Injectable clock.** `shouldPrompt({ now })` (§6) takes a clock so the
  time-based gates (install age, 7-day cooldown, 30-day defer, 90-day dismiss,
  14-day dashboard recency) are deterministic in unit tests. No `Date.now()`
  buried inside the gate predicates.
- **Single predicate source.** `getDebugState().gates` reads the *same*
  predicate functions `shouldPrompt()` evaluates — the panel and the live logic
  can never disagree, so a green checklist in the UI means the real gate passed.
- **Scenario loader.** `applyTestScenario(id)` back-dates the relevant
  timestamp(s) so any gate's pass *and* fail edge is reachable from the options
  UI without editing storage by hand or waiting real days.

### 12.2 — Condition/behavior coverage matrix

Each row gets a unit test (deterministic, clock injected) **and** a manual
repro via the §10.1 *Load test scenario* control. "Expected" is the
`shouldPrompt()` verdict; for outcome rows it's the post-action storage state.

**Eligibility gates (§3 + §4) — 7 conditions:**

| # | Condition | Scenario to load | Expected verdict |
|---|---|---|---|
| 1 | Exposure cap (§2) | `shownCount = 3` | `reason: exposure_cap`, never eligible |
| 2 | Install age ≥ 14 | install age = 13d / 14d | `13d → reason: install_too_recent` · `14d → pass` |
| 3 | Dashboard opens ≥ 2 | opens = 1 / 2 | `1 → reason: not_enough_engagement` · `2 → pass` |
| 4 | Prompt cooldown ≥ 7d | last prompt 6d / 7d ago | `6d → reason: in_cooldown` · `7d → pass` |
| 5 | Not rated/declined | `rated:true`; `declined:true` | both → `reason: already_resolved`, never eligible |
| 6 | Dashboard recency ≤ 14d | last dashboard-open 15d ago | `reason: engagement_stale`, not eligible |
| 7 | First popup open of day | second open same day | second open → not shown. **E2E-only** — runtime state, not reproducible via `applyTestScenario` (see implementation plan §4.4). |

**Outcome behaviors (§2) — 6 explicit transitions + passive close:** load the
*all-gates-pass* scenario, force-show on, click the path (or close without
clicking), assert resulting storage + re-eligibility:

| # | Path | Expected storage | Re-eligible? |
|---|---|---|---|
| 1 | Step 1 Dismiss × | `lastDismissedAt = now` | after 90d (verify via scenario: dismissed 89d → blocked, 91d → eligible) |
| 2 | Step 1 👎 | `feedbackPath: github` | never |
| 3 | Step 2a Rate | `rated: true` | never |
| 4 | Step 2a Maybe later | `lastDeferredAt = now` | after 30d (scenario: 29d → blocked, 31d → eligible, copy = `after_defer`) |
| 5 | Step 2b GitHub issue | `feedbackPath: github` | never |
| 6 | Step 2b No thanks | `declined: true` | never |
| 7 | Passive close (shown, no click) | `shownCount++`, `lastPromptAt = now`, no suppression flag | after 7d, until `shownCount` hits 3 (§2) — then never |

Every displayed prompt increments `shownCount` (via `markShown`), so the cap
applies to all paths, including passive closes.

### 12.3 — Test layers

- **Unit (`tests/`)** — `ReviewPromptService.test.js`: one assertion per matrix
  row above, clock injected. This is the source of truth for gate logic; it
  must cover every boundary (the `Nd → blocked / N+1d → pass` pairs), not just
  the happy path.
- **E2E (`tests/e2e/`)** — Playwright spec that (1) enables Developer Mode,
  (2) drives the §10.1 controls to load scenarios and assert the state block's
  ✓/✗ checklist matches the matrix, and (3) with force-show on, opens the popup
  and clicks each §2 path, asserting the prompt renders in the Collections slot
  and the recorded outcome is correct. See `tests/e2e/README.md` first.
- **i18n** — `npm run i18n:parity` must pass with the new keys (§8) present in
  all locales.

### 12.4 — Manual QA checklist (pre-merge, via the options UI)

1. Developer Mode **off** → confirm none of the §10.1 controls are visible and
   `getDebugState`/force-show are inert.
2. Developer Mode **on** → state block renders the gate checklist with live
   values.
3. Walk the §12.2 gate matrix using *Load test scenario*; confirm each verdict
   and `reason` matches.
4. **Organic dry-run** (the real point): reset state, then with the state block
   open, actually use the extension — open the dashboard from the popup twice,
   load a scenario that ages install to 14d — and watch gates 2 and 6 flip to ✓
   live (§10.1 storage.onChanged), ending in `eligible: true` with no force-show.
5. Force-show on → walk all six §2 outcome paths; after each, confirm the state
   block shows the expected suppression and re-eligibility window.
6. Reset state → confirm back to first-run.

---

## 13. Anti-patterns to explicitly avoid

For posterity — these are tempting "improvements" that have been tried by
other extensions and consistently regretted:

- **Snooze + remind.** "Remind me in 7 days" sounds friendly but trains
  users to dismiss without thinking. The 30/90-day cooldowns in §2 are the
  closest thing to this we should ever build.
- **Tying features to reviews.** "Leave a review to unlock X" violates
  Chrome Web Store policy and corrupts the review signal.
- **Prompting on uninstall.** Users uninstalling have decided. Any popup
  shown then will be received as begging.
- **Showing the prompt count.** "Step 1 of 2" or "Only one more question"
  feels like a survey. Don't.
- **A/B testing copy via remote config.** Requires adding network calls,
  violates the local-only promise. Hard-code one good version; iterate by
  releasing.
