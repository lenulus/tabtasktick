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
- **Not a recurring nag.** Each user sees the prompt at most twice in their
  entire lifetime with the extension. After the second decline, never again.
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
| **No errors in last 5 minutes** | `recentErrorAt < now - 5min` | Don't ask while frustration is fresh |

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
primary in earlier drafts) is a clean Phase D add-on with the same service
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
shouldPrompt()

// Record the outcome from the UI (§2 table).
// Updates storage + suppresses future prompts per the table.
recordOutcome({ step, action })  // e.g. ({ step: 2, action: 'rated' })
```

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
  recentErrorAt: null,                   // anti-frustration window
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

(The popup occupies the existing Collections promo slot, so no separate
footer-link string is needed for Phase B. If Phase D adds a dashboard banner,
no new keys are needed — it reuses the same Step 1 / Step 2 strings.)

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

Pick one phase per release; ship and observe before the next.

### Phase A — instrument only (one PR)

- Add `ReviewPromptService.js` with storage and `trackDashboardOpenFromPopup()`
  only.
- Add one call site in `popup/popup.js` on the dashboard-open click handler.
- No `shouldPrompt()` / `recordOutcome()` / UI yet.
- Lets the next release start accumulating real data so by the time the
  prompt ships, existing users already have a dashboard-from-popup counter
  building toward the ≥ 2 threshold and the §4 14-day recency window is
  meaningful.
- **Minimum 14 days between Phase A and Phase B** so the install-age gate
  has time to accumulate (existing users pass instantly; users who installed
  Phase A as their first version need to age in).

### Phase B — popup review prompt (one PR)

- Add `shouldPrompt()` and `recordOutcome()` to the service.
- Add the prompt component to the popup, occupying the Collections promo slot
  when its gates pass.
- Implement the §4 display logic (first-open-of-day + 14-day recency window).
- Wire Step 1 → Step 2 transitions; persist outcomes per §2.
- Ship.

### Phase C — observe and decide (no code, 4–6 weeks)

- Watch the Chrome Web Store review count.
- No analytics — the review count itself is the signal.
- If review velocity meaningfully increases, the popup-only design is
  sufficient. Stop here.
- If not, consider Phase D.

### Phase D — dashboard banner (optional, only if Phase C says popup is insufficient)

- Add the dashboard banner described in earlier drafts of this plan.
- Trigger: ~1.5s after a successful Collection save, on the dashboard's
  Collections view.
- Same `ReviewPromptService` backend — the dashboard surface just calls
  `shouldPrompt()` and reuses the same suppression state, so a user who
  saw the prompt in the popup won't see it again on the dashboard.

---

## 11. Open questions

Worth a decision before Phase B:

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
5. **Phase A timing** — is there an upcoming release in the next ~2 weeks
   we can piggyback the Phase A tracking onto? If so, the 14-day install-age
   delay between Phase A and Phase B is "free" — we don't have to wait for
   it.

---

## 12. Anti-patterns to explicitly avoid

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
