/**
 * @file ReviewPromptService - Eligibility logic and state for the popup review prompt
 *
 * @description
 * The ReviewPromptService owns all logic and persisted state for the Chrome Web Store
 * review prompt that occupies the popup's Collections-promo slot. It decides, via a set
 * of ordered eligibility gates, whether the prompt may be shown to a given user right
 * now, records the outcome of each interaction, and exposes a developer surface for
 * QA-ing a deliberately-rare feature without waiting real days.
 *
 * Following the services-first architecture (CLAUDE.md), all prompt logic lives here;
 * the popup/options surfaces are thin and merely ask "should I show?" and render. The
 * service reads and writes a single `chrome.storage.local` key (`reviewPrompt`) with no
 * background round-trip, matching the SidePanelNavigationService / ScheduledExportService
 * single-key patterns.
 *
 * Design intent and gate semantics are documented in
 * `docs/review-prompt-plan.md` (§2 outcomes, §3 gates) and
 * `docs/review-prompt-implementation-plan.md` (§4 the service spec).
 *
 * @module services/execution/ReviewPromptService
 *
 * @architecture
 * - Layer: Execution Service (state + policy)
 * - Dependencies: chrome.storage.local only
 * - Used By: popup (render + track + outcomes), options (dev controls + debug state)
 * - Storage Key: 'reviewPrompt' (single object, DEFAULT_STATE shape)
 * - Determinism: every time-touching public fn accepts an optional injected
 *   `{ now = Date.now() }` clock so the time-based gates are deterministic in tests
 *   (same inputs -> same outputs). Production callers pass nothing.
 *
 * @example
 * // In the popup, once per popup open:
 * import * as ReviewPromptService from '../services/execution/ReviewPromptService.js';
 * const { eligible, version } = await ReviewPromptService.shouldPrompt();
 * if (eligible) {
 *   renderReviewStep1(version);
 *   await ReviewPromptService.markShown();
 * }
 *
 * @example
 * // On the popup's dashboard-open handler:
 * await ReviewPromptService.trackDashboardOpenFromPopup();
 */

// -----------------------------------------------------------------------------
// Constants & storage shape (implementation-plan §4.1)
// -----------------------------------------------------------------------------

/** Single chrome.storage.local key holding the entire review-prompt state object. */
const REVIEW_PROMPT_KEY = 'reviewPrompt';

/** One day in milliseconds. */
const DAY = 24 * 60 * 60 * 1000;

/**
 * Gate thresholds. Centralized so the gate descriptors (§4.4) and any UI that
 * surfaces thresholds read from one source.
 *
 * Note: there is intentionally NO error gate / ERROR_WINDOW_MS — the design's
 * "no recent error" gate was cut (implementation-plan §4.1) because there is no
 * error signal to drive it.
 */
const GATES = {
  MIN_INSTALL_AGE_MS: 14 * DAY,
  MIN_DASHBOARD_OPENS: 2,
  PROMPT_COOLDOWN_MS: 7 * DAY,
  DASHBOARD_RECENCY_MS: 14 * DAY,
  DEFER_REELIGIBLE_MS: 30 * DAY,
  DISMISS_REELIGIBLE_MS: 90 * DAY,
  MAX_LIFETIME_SHOWS: 3, // §2.1 — the hard lifetime exposure cap
};

/** Chrome Web Store review page for the published extension. */
const WEB_STORE_REVIEW_URL =
  'https://chromewebstore.google.com/detail/kninondobdcahcnbfknfeijdljkkbbgc/reviews';

/** GitHub feedback issue entry point (negative-path destination). */
const GITHUB_FEEDBACK_URL =
  'https://github.com/lenulus/tabtasktick/issues/new?labels=feedback&template=feedback.md';

/**
 * First-run state for the `reviewPrompt` key. Every persisted state is a shallow
 * merge of this over whatever is stored, so older stored objects gain new fields
 * with sane defaults automatically.
 *
 * @typedef {Object} ReviewPromptState
 * @property {number|null} installedAt - epoch ms, seeded on first run / lazy init
 * @property {number} dashboardOpensFromPopup - distinct-session dashboard opens
 * @property {number|null} lastDashboardOpenFromPopupAt - epoch ms of last open
 * @property {number|null} lastPromptAt - epoch ms the prompt was last displayed
 * @property {number|null} lastDeferredAt - epoch ms "Maybe later" was clicked
 * @property {number|null} lastDismissedAt - epoch ms "Dismiss ×" was clicked
 * @property {number} shownCount - lifetime number of displays (capped, §2.1)
 * @property {boolean} rated - user rated (lifetime suppression)
 * @property {boolean} declined - user declined (lifetime suppression)
 * @property {('github'|null)} feedbackPath - set once routed to feedback (suppresses)
 * @property {boolean} devForceShow - dev-only override; never set in production code
 * @property {('fresh'|'after_defer')} devVariant - dev-only Step 1 copy variant for
 *   the force-show preview; never set in production code
 */
const DEFAULT_STATE = {
  installedAt: null,
  dashboardOpensFromPopup: 0,
  lastDashboardOpenFromPopupAt: null,
  lastPromptAt: null,
  lastDeferredAt: null,
  lastDismissedAt: null,
  shownCount: 0,
  rated: false,
  declined: false,
  feedbackPath: null,
  devForceShow: false,
  devVariant: 'fresh',
};

/** Public URL map for the UI to open. */
export const URLS = { review: WEB_STORE_REVIEW_URL, feedback: GITHUB_FEEDBACK_URL };

// -----------------------------------------------------------------------------
// Module-level state (implementation-plan §4.2)
// -----------------------------------------------------------------------------

/**
 * Per-execution-context cache of the persisted state. Popup and options are
 * separate JS contexts with separate module instances, so this cache is local to
 * one surface. `getDebugState()` deliberately bypasses it (reads fresh) and the
 * options storage.onChanged handler calls `reloadState()` to invalidate it.
 * @type {ReviewPromptState|null}
 */
let state = null;

/**
 * Session dedup flag for `trackDashboardOpenFromPopup`. A popup module instance
 * lives only while the popup is open, so this resets per popup open, giving
 * "≥ 2 distinct sessions" semantics (design §3).
 * @type {boolean}
 */
let countedThisSession = false;

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

/**
 * Lazy-initialize the module cache from storage. First line of every public fn.
 * Seeds `installedAt` if missing (covers upgraders + safety per §1 dual-seed).
 *
 * @param {number} [now=Date.now()] - injected clock for the lazy install seed
 * @returns {Promise<void>}
 */
async function ensureInitialized(now = Date.now()) {
  if (state) return;
  const data = await chrome.storage.local.get(REVIEW_PROMPT_KEY);
  state = { ...DEFAULT_STATE, ...(data[REVIEW_PROMPT_KEY] || {}) };
  if (state.installedAt == null) {
    state.installedAt = now;
    await persist();
  }
}

/**
 * Persist the current module cache to storage under the single key.
 *
 * Guard: never write a null/undefined state. `persist()` is only reached from
 * `ensureInitialized()`'s lazy install seed, where `state` was just assigned a
 * non-null object — but a concurrent `reloadState()` (cross-context
 * `storage.onChanged`) could null the module cache mid-`await`. The guard keeps
 * that race from clobbering storage with `undefined`. (Mutators no longer route
 * through `persist()`; they use `writeState()` on a captured local, §robustness.)
 *
 * @returns {Promise<void>}
 */
async function persist() {
  if (!state) return;
  await chrome.storage.local.set({ [REVIEW_PROMPT_KEY]: state });
}

/**
 * Set the module cache to `next` AND persist THAT exact object. Writing the
 * passed-in local (not the module variable) is what makes the read-modify-write
 * path robust against a concurrent `reloadState()` nulling `state` across the
 * `await`: even if the cache is invalidated mid-write, the intended object is
 * still the one that lands in storage.
 *
 * @param {ReviewPromptState} next - the fully-formed state object to persist
 * @returns {Promise<void>}
 */
async function writeState(next) {
  state = next;
  await chrome.storage.local.set({ [REVIEW_PROMPT_KEY]: next });
}

/**
 * Robust read-modify-write. Captures a non-null local snapshot, applies the
 * mutation to THAT local, then persists the local via `writeState()`.
 *
 * The snapshot is taken from the module cache when present (preserving the
 * intended cross-context cache semantics — §1) and falls back to `readFresh()`
 * otherwise, so the write target is never the module variable `state`, which a
 * concurrent `storage.onChanged` → `reloadState()` may null at any `await`
 * boundary. `installedAt` is seeded here too, so a mutation on first-run (empty
 * storage / upgrader) still produces a complete persisted object.
 *
 * @param {(s: ReviewPromptState, now: number) => void} mutator - applies the change to the local
 * @param {number} [now=Date.now()] - injected clock (for the lazy install seed)
 * @returns {Promise<void>}
 */
async function mutate(mutator, now = Date.now()) {
  await ensureInitialized(now);
  const base = state || (await readFresh());
  if (base.installedAt == null) base.installedAt = now;
  mutator(base, now);
  await writeState(base);
}

/**
 * Read the raw persisted object WITHOUT touching the module cache. Used by
 * `getDebugState()` so a value just changed in another execution context is
 * visible even if this context's cache is stale.
 *
 * @returns {Promise<ReviewPromptState>}
 */
async function readFresh() {
  const data = await chrome.storage.local.get(REVIEW_PROMPT_KEY);
  return { ...DEFAULT_STATE, ...(data[REVIEW_PROMPT_KEY] || {}) };
}

/**
 * Invalidate the module cache so the next `ensureInitialized()` re-reads storage.
 * Called by the options storage.onChanged handler before re-rendering the state
 * block.
 * @returns {void}
 */
export function reloadState() {
  state = null;
}

// -----------------------------------------------------------------------------
// Gate evaluation — ONE ordered descriptor array (implementation-plan §4.4)
// -----------------------------------------------------------------------------

/**
 * The single source of truth for eligibility gates. Both `firstFailingGate()`
 * and `getDebugState().gates` iterate THIS array — there is no second predicate
 * set and no parallel if-else chain, so the debug panel can never drift from the
 * live logic. Order is significant: `reason` strings and the validation matrix
 * depend on it.
 *
 * Each descriptor: { id, pass(state, now) => boolean, detail(state, now) => string }
 *
 * @type {Array<{id: string, pass: (s: ReviewPromptState, n: number) => boolean, detail: (s: ReviewPromptState, n: number) => string}>}
 */
const GATE_DESCRIPTORS = [
  {
    id: 'exposure_cap',
    pass: (s) => s.shownCount < GATES.MAX_LIFETIME_SHOWS,
    detail: (s) => `${s.shownCount}/${GATES.MAX_LIFETIME_SHOWS} shown`,
  },
  {
    id: 'already_resolved',
    pass: (s) => !(s.rated || s.declined || s.feedbackPath === 'github'),
    detail: (s) =>
      s.rated
        ? 'rated'
        : s.declined
          ? 'declined'
          : s.feedbackPath === 'github'
            ? 'routed to feedback'
            : '',
  },
  {
    id: 'install_too_recent',
    pass: (s, n) => s.installedAt != null && n - s.installedAt >= GATES.MIN_INSTALL_AGE_MS,
    detail: (s, n) => {
      const days = s.installedAt == null ? 0 : Math.floor((n - s.installedAt) / DAY);
      return `${days}/${GATES.MIN_INSTALL_AGE_MS / DAY} days`;
    },
  },
  {
    id: 'not_enough_engagement',
    pass: (s) => s.dashboardOpensFromPopup >= GATES.MIN_DASHBOARD_OPENS,
    detail: (s) => `${s.dashboardOpensFromPopup}/${GATES.MIN_DASHBOARD_OPENS} sessions`,
  },
  {
    id: 'engagement_stale',
    pass: (s, n) =>
      s.lastDashboardOpenFromPopupAt != null &&
      n - s.lastDashboardOpenFromPopupAt <= GATES.DASHBOARD_RECENCY_MS,
    detail: (s, n) => {
      if (s.lastDashboardOpenFromPopupAt == null) return 'never';
      const days = Math.floor((n - s.lastDashboardOpenFromPopupAt) / DAY);
      return `${days}d ago (≤${GATES.DASHBOARD_RECENCY_MS / DAY})`;
    },
  },
  {
    id: 'in_cooldown',
    pass: (s, n) => !s.lastPromptAt || n - s.lastPromptAt >= GATES.PROMPT_COOLDOWN_MS,
    detail: (s, n) => {
      if (!s.lastPromptAt) return `no prompt in ${GATES.PROMPT_COOLDOWN_MS / DAY}d`;
      const days = Math.floor((n - s.lastPromptAt) / DAY);
      return `${days}d ago (≥${GATES.PROMPT_COOLDOWN_MS / DAY})`;
    },
  },
  {
    id: 'deferred_recently',
    pass: (s, n) => !s.lastDeferredAt || n - s.lastDeferredAt >= GATES.DEFER_REELIGIBLE_MS,
    detail: (s, n) => {
      if (!s.lastDeferredAt) return 'not deferred';
      const days = Math.floor((n - s.lastDeferredAt) / DAY);
      return `${days}d ago (≥${GATES.DEFER_REELIGIBLE_MS / DAY})`;
    },
  },
  {
    id: 'dismissed_recently',
    pass: (s, n) => !s.lastDismissedAt || n - s.lastDismissedAt >= GATES.DISMISS_REELIGIBLE_MS,
    detail: (s, n) => {
      if (!s.lastDismissedAt) return 'not dismissed';
      const days = Math.floor((n - s.lastDismissedAt) / DAY);
      return `${days}d ago (≥${GATES.DISMISS_REELIGIBLE_MS / DAY})`;
    },
  },
];

/**
 * Return the id of the first failing gate (the `reason`), or null if all pass.
 * Iterates GATE_DESCRIPTORS in order.
 *
 * @param {ReviewPromptState} s - the state to evaluate
 * @param {number} n - the clock
 * @returns {string|null}
 */
function firstFailingGate(s, n) {
  const failing = GATE_DESCRIPTORS.find((g) => !g.pass(s, n));
  return failing ? failing.id : null;
}

/**
 * Determine the Step 1 copy variant for a given state. Returns `'after_defer'`
 * if the user has ever deferred ("Maybe later"), else `'fresh'`.
 *
 * Single source of truth — called by both `shouldPrompt()` and `getDebugState()`
 * so the live verdict and the debug panel can never disagree (same principle as
 * the GATE_DESCRIPTORS array). The reachable case the variant exists for is the
 * re-show AFTER the 30-day defer window clears (the `deferred_recently` gate
 * suppresses the prompt during the window, so a within-window check would make
 * the variant unreachable). Per spec §7.3 row 7: `defer_31d` -> `after_defer`.
 *
 * @param {ReviewPromptState} s - the state to evaluate
 * @returns {('fresh'|'after_defer')}
 */
function versionFor(s) {
  return s.lastDeferredAt ? 'after_defer' : 'fresh';
}

// -----------------------------------------------------------------------------
// Public API (implementation-plan §4.3)
// -----------------------------------------------------------------------------

/**
 * Increment the dashboard-from-popup engagement counter. Idempotent within a
 * single popup session (multiple dashboard opens from the same popup count once).
 *
 * @param {Object} [opts]
 * @param {number} [opts.now=Date.now()] - injected clock
 * @returns {Promise<void>}
 */
export async function trackDashboardOpenFromPopup({ now = Date.now() } = {}) {
  await ensureInitialized(now);
  if (countedThisSession) return;
  countedThisSession = true;
  await mutate((s) => {
    s.dashboardOpensFromPopup += 1;
    s.lastDashboardOpenFromPopupAt = now;
  }, now);
}

/**
 * Evaluate eligibility right now.
 *
 * @param {Object} [opts]
 * @param {number} [opts.now=Date.now()] - injected clock
 * @returns {Promise<{eligible: boolean, reason: string, version: ('fresh'|'after_defer')}>}
 *   `reason` is the first failing gate id, `'eligible'` when all pass, or
 *   `'dev_override'` when the dev force-show flag is set.
 */
export async function shouldPrompt({ now = Date.now() } = {}) {
  await ensureInitialized(now);
  if (state.devForceShow) {
    // Dev preview: the variant selector drives which Step 1 copy is shown,
    // not the organic versionFor() heuristic.
    return { eligible: true, reason: 'dev_override', version: state.devVariant || 'fresh' };
  }
  const failing = firstFailingGate(state, now);
  return { eligible: !failing, reason: failing || 'eligible', version: versionFor(state) };
}

/**
 * Record the outcome of a prompt interaction and persist suppression state.
 * Action mapping (implementation-plan §4.3 / design §2):
 *  - dismiss   -> lastDismissedAt = now   (re-eligible after 90d)
 *  - thumbsDown-> feedbackPath = 'github' (never again)
 *  - rated     -> rated = true            (never again)
 *  - later     -> lastDeferredAt = now    (re-eligible after 30d)
 *  - github    -> feedbackPath = 'github' (never again)
 *  - noThanks  -> declined = true         (never again)
 *
 * @param {Object} opts
 * @param {number} [opts.step] - the prompt step (1 or 2); informational only
 * @param {string} opts.action - one of the action ids above
 * @param {number} [opts.now=Date.now()] - injected clock
 * @returns {Promise<void>}
 */
export async function recordOutcome({ step, action, now = Date.now() } = {}) {
  await ensureInitialized(now);
  // Map the action to a mutation; unknown actions stay a no-write no-op.
  let apply;
  switch (action) {
  case 'dismiss':
    apply = (s) => { s.lastDismissedAt = now; };
    break;
  case 'thumbsDown':
    apply = (s) => { s.feedbackPath = 'github'; };
    break;
  case 'rated':
    apply = (s) => { s.rated = true; };
    break;
  case 'later':
    apply = (s) => { s.lastDeferredAt = now; };
    break;
  case 'github':
    apply = (s) => { s.feedbackPath = 'github'; };
    break;
  case 'noThanks':
    apply = (s) => { s.declined = true; };
    break;
  default:
    // Unknown action — no state change. (step is accepted for caller symmetry.)
    void step;
    return;
  }
  await mutate(apply, now);
}

/**
 * Record that the prompt was actually DISPLAYED. Sets the cooldown anchor and
 * increments the lifetime exposure count (§2.1) — applies to every display,
 * including passive closes.
 *
 * @param {Object} [opts]
 * @param {number} [opts.now=Date.now()] - injected clock
 * @returns {Promise<void>}
 */
export async function markShown({ now = Date.now() } = {}) {
  await mutate((s) => {
    s.lastPromptAt = now;
    s.shownCount += 1;
  }, now);
}

// --- Developer surface (implementation-plan §5) ---

/**
 * Return everything needed to verify organic triggering: raw storage, the live
 * `shouldPrompt()` verdict, human-readable derived values, and a per-gate
 * breakdown built from the SAME GATE_DESCRIPTORS array used by the live logic.
 *
 * Reads storage FRESH (bypassing the module cache) so a value just changed in
 * another execution context (e.g. the popup) is reflected here.
 *
 * @param {Object} [opts]
 * @param {number} [opts.now=Date.now()] - injected clock
 * @returns {Promise<{storage: ReviewPromptState, shouldPrompt: {eligible: boolean, reason: string, version: string}, derived: Object, gates: Array<{id: string, pass: boolean, detail: string}>}>}
 */
export async function getDebugState({ now = Date.now() } = {}) {
  const fresh = await readFresh();

  let verdict;
  if (fresh.devForceShow) {
    // Mirror shouldPrompt(): under force-show the dev variant selector drives the
    // previewed version, so the debug panel never disagrees with the live popup.
    verdict = { eligible: true, reason: 'dev_override', version: fresh.devVariant || 'fresh' };
  } else {
    const failing = firstFailingGate(fresh, now);
    verdict = { eligible: !failing, reason: failing || 'eligible', version: versionFor(fresh) };
  }

  const derived = {
    daysSinceInstall:
      fresh.installedAt == null ? null : Math.floor((now - fresh.installedAt) / DAY),
    dashboardOpensFromPopup: fresh.dashboardOpensFromPopup,
    daysSinceLastDashboardOpen:
      fresh.lastDashboardOpenFromPopupAt == null
        ? null
        : Math.floor((now - fresh.lastDashboardOpenFromPopupAt) / DAY),
    daysSinceLastPrompt:
      fresh.lastPromptAt == null ? null : Math.floor((now - fresh.lastPromptAt) / DAY),
    shownCount: fresh.shownCount,
  };

  const gates = GATE_DESCRIPTORS.map((g) => ({
    id: g.id,
    pass: g.pass(fresh, now),
    detail: g.detail(fresh, now),
  }));

  return { storage: fresh, shouldPrompt: verdict, derived, gates };
}

/**
 * Wipe the `reviewPrompt` key back to first-run state, with `installedAt` reset
 * to now. Used by the "Reset review-prompt state" dev button.
 *
 * @returns {Promise<void>}
 */
export async function resetState() {
  countedThisSession = false;
  // Wholesale replacement: write a fresh object via writeState() (robust against
  // a concurrent reloadState() nulling the cache) rather than a read-modify-write.
  await writeState({ ...DEFAULT_STATE, installedAt: Date.now() });
}

/**
 * Seed the install timestamp on a true first install. Called from the background
 * `onInstalled` (reason === 'install') so fresh installs get a precise install
 * date; existing-user upgrades fall back to the lazy seed in `ensureInitialized()`.
 * Routes through the service so the storage key/shape stay a single source of
 * truth (background never hardcodes them). No-op if `installedAt` is already set.
 *
 * @param {{ now?: number }} [opts]
 * @returns {Promise<void>}
 */
export async function seedInstall({ now = Date.now() } = {}) {
  const current = await readFresh();
  if (current.installedAt != null) return;
  await writeState({ ...current, installedAt: now });
}

/**
 * Set or clear the dev-only force-show override. When true, `shouldPrompt()`
 * short-circuits to eligible regardless of gates. Only the Developer Options
 * panel ever calls this — no production code path writes `devForceShow`.
 *
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export async function setForceShow(enabled) {
  await mutate((s) => {
    s.devForceShow = !!enabled;
  });
}

/**
 * Set the dev-only Step 1 copy variant used for the force-show preview. Any value
 * other than `'after_defer'` normalizes to `'fresh'`. When `devForceShow` is true,
 * `shouldPrompt()` / `getDebugState()` return this variant as the rendered version.
 * Only the Developer Options panel ever calls this — no production code path writes
 * `devVariant`.
 *
 * @param {('fresh'|'after_defer')} variant
 * @returns {Promise<void>}
 */
export async function setVariant(variant) {
  await mutate((s) => {
    s.devVariant = variant === 'after_defer' ? 'after_defer' : 'fresh';
  });
}

/**
 * Load a named test scenario: write a known single-variable state where exactly
 * one gate is at its pass/fail edge and all OTHER gates pass. Returns the
 * resulting `getDebugState()` for assertion (implementation-plan §5.2).
 *
 * Note: the first-open-of-day gate is runtime session state, not storage, so it
 * is intentionally NOT reproducible here (E2E-only).
 *
 * @param {string} id - scenario id (see SCENARIO_IDS)
 * @param {Object} [opts]
 * @param {number} [opts.now=Date.now()] - injected clock; the scenario back-dates
 *   timestamps relative to this
 * @returns {Promise<Object>} the resulting getDebugState()
 */
export async function applyTestScenario(id, { now = Date.now() } = {}) {
  // Baseline: all gates pass. Each scenario then perturbs exactly one variable.
  const base = {
    ...DEFAULT_STATE,
    installedAt: now - GATES.MIN_INSTALL_AGE_MS, // exactly 14d -> install gate passes
    dashboardOpensFromPopup: GATES.MIN_DASHBOARD_OPENS, // 2 -> engagement gate passes
    lastDashboardOpenFromPopupAt: now, // fresh -> recency gate passes
    lastPromptAt: null, // never shown -> cooldown passes
    lastDeferredAt: null,
    lastDismissedAt: null,
    shownCount: 0,
    rated: false,
    declined: false,
    feedbackPath: null,
    devForceShow: false,
  };

  let next;
  switch (id) {
  case 'all_pass':
    next = { ...base };
    break;
  case 'install_13d':
    next = { ...base, installedAt: now - 13 * DAY };
    break;
  case 'install_14d':
    next = { ...base, installedAt: now - 14 * DAY };
    break;
  case 'opens_1':
    next = { ...base, dashboardOpensFromPopup: 1 };
    break;
  case 'opens_2':
    next = { ...base, dashboardOpensFromPopup: 2 };
    break;
  case 'cooldown_6d':
    next = { ...base, lastPromptAt: now - 6 * DAY };
    break;
  case 'cooldown_7d':
    next = { ...base, lastPromptAt: now - 7 * DAY };
    break;
  case 'rated':
    next = { ...base, rated: true };
    break;
  case 'declined':
    next = { ...base, declined: true };
    break;
  case 'recency_15d':
    next = { ...base, lastDashboardOpenFromPopupAt: now - 15 * DAY };
    break;
  case 'defer_29d':
    next = { ...base, lastDeferredAt: now - 29 * DAY };
    break;
  case 'defer_31d':
    next = { ...base, lastDeferredAt: now - 31 * DAY };
    break;
  case 'dismiss_89d':
    next = { ...base, lastDismissedAt: now - 89 * DAY };
    break;
  case 'dismiss_91d':
    next = { ...base, lastDismissedAt: now - 91 * DAY };
    break;
  case 'cap_reached':
    next = { ...base, shownCount: GATES.MAX_LIFETIME_SHOWS };
    break;
  default:
    throw new Error(`Unknown review-prompt test scenario: ${id}`);
  }

  // Wholesale replacement: write the fully-formed scenario object via
  // writeState() (robust against a concurrent reloadState()), not a RMW that
  // could inherit stale fields.
  await writeState(next);
  return getDebugState({ now });
}

/**
 * Test-only hook: clear the module-level cache and session dedup flag so each
 * test starts from a clean module state. The no-dynamic-import rule is an
 * extension-runtime constraint, not a test one, but this explicit hook keeps
 * tests simple and avoids jest.resetModules churn.
 *
 * @returns {void}
 */
export function __resetForTests() {
  state = null;
  countedThisSession = false;
}
