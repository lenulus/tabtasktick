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
| **Meaningful actions** | ≥ 5 | Evidence the user is using the extension, not just installed and ignored it. Counted actions in §4. |
| **Active days** | ≥ 5 distinct calendar days with any tracked action | Filters out the "tried it once for an hour" user |
| **Prompt cooldown** | No prompt shown in last 7 days (any surface) | Anti-spam between surfaces if we later add both |
| **Not previously rated/declined** | `rated !== true && declined !== true` | Lifetime suppression once they've made a definitive choice |
| **Last action was successful** | The triggering action did not error or get rolled back | Don't ask after a bad experience |
| **No errors in last 5 minutes** | `recentErrorAt < now - 5min` | Same — don't ask while frustration is fresh |

A user who installs today, opens the extension twice, and closes it without
saving anything would *never* see the prompt. That's the point.

### What counts as a "meaningful action"

Defined narrowly — these are moments of evidence that the user got value:

- Saved a Collection (window → collection)
- Restored a Collection (collection → window)
- Snoozed a tab or window and the wake-up fired successfully
- Created a Task or Rule that subsequently ran without error
- Closed 10+ duplicate tabs in one operation
- Used the same Collection on 3+ separate days

Notably **not** counted: opening the popup, viewing the dashboard, scrolling
the tab list. Passive engagement isn't evidence of value.

---

## 4. Trigger: popup open + recency window

The popup is itself a deliberate user action — opening it is the trigger.
The prompt renders in the slot currently occupied by the Collections promo,
and only when both these *additional* conditions hold (beyond the §3 gates):

| Additional condition | Reason |
|---|---|
| **Last meaningful action ≤ 7 days ago** | Show while the positive memory of the extension is fresh, not weeks later when the user opens the popup to do something tangential. |
| **Mutex with Collections promo** — never both in the same session | The Collections promo nudges users *to* save a collection; the review prompt is for users who already have. They can't both apply. |
| **First popup open of the day** only | Popup opens are frequent — many users hit it dozens of times daily. Capping to first-open per day prevents accidental re-renders mid-session. |

### Display logic when popup opens

```
1. User has rated or declined?     → no promo slot at all
2. User has never saved a Collection?
                                   → show Collections promo (existing behavior)
3. All §3 gates pass + last action ≤ 7 days + first-open-today?
                                   → show review prompt
4. Otherwise                       → empty promo slot (or other future promo)
```

Step 2 is the elegant part — the Collections promo and the review prompt are
naturally mutually exclusive. A user hasn't saved a Collection? They see the
promo. They have? The promo is wasted screen, and the review prompt earns the
slot. No competing CTAs.

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
  Dashboard reach is much lower (many TabTaskTick users never open it).
- **Clean mutex with the Collections promo** — by the time a user is eligible
  for the review prompt, the Collections promo is moot for them (they've
  already saved a Collection). One slot, two states, no competing CTAs.
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
// Increment a counter for a tracked action category.
// Categories defined in §3 ("meaningful actions").
trackAction(category)

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
  installedAt: 1748000000000,        // epoch ms, set on first run
  actionCounts: {                    // counted §3 actions
    collection_saved: 0,
    collection_restored: 0,
    snooze_fired: 0,
    rule_ran_clean: 0,
    duplicates_closed: 0,
  },
  activeDays: ['2026-05-14', ...],   // ISO date strings, distinct
  lastPromptAt: null,                // suppresses §3 cooldown
  lastDeferredAt: null,              // 30-day re-ask window
  lastDismissedAt: null,             // 90-day re-ask window
  rated: false,                      // lifetime suppression
  declined: false,                   // lifetime suppression
  recentErrorAt: null,               // anti-frustration window
}
```

### Where to call `trackAction`

Following the separation-of-concerns rule, tracking calls live in the
execution services that actually perform the action:

- `CollectionService.saveCollection()` → `trackAction('collection_saved')`
- `RestoreCollectionService.restore()` → `trackAction('collection_restored')`
- `SnoozeService.handleSnoozeAlarm()` (on successful wake) → `trackAction('snooze_fired')`
- `DeduplicationOrchestrator.deduplicate()` (when closed ≥10) → `trackAction('duplicates_closed')`
- Rules engine on a successful clean run → `trackAction('rule_ran_clean')`

UI surfaces never call `trackAction` directly.

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

- Add `ReviewPromptService.js` with storage and `trackAction()` only.
- Wire `trackAction()` calls into the 5 execution services in §6.
- No UI surface yet.
- Lets the next release start accumulating real data so by the time the
  prompt ships, existing users already meet the eligibility gates and the
  "last action ≤ 7 days" recency window is meaningful.
- **Minimum 14 days between Phase A and Phase B** so the install-age gate
  has time to accumulate (existing users pass instantly; users who installed
  Phase A as their first version need to age in).

### Phase B — popup review prompt (one PR)

- Add `shouldPrompt()` and `recordOutcome()` to the service.
- Add the prompt component to the popup, occupying the Collections promo slot.
- Implement the §4 display logic (mutex with Collections promo, first-open-of-day,
  recency window).
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
4. **What happens to the Collections promo slot after Phase B ships?** For
   users who never become eligible (light users), the Collections promo keeps
   running indefinitely. Is that OK, or should there be a "stop showing
   Collections promo after N popup opens" cap independent of this work?
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
