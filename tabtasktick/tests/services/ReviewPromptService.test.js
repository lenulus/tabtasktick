/**
 * Tests for ReviewPromptService
 *
 * Covers every row of the implementation-plan §7.3 coverage matrix:
 *  - Gate eligibility (both sides of each boundary), asserting shouldPrompt().reason
 *  - Outcome transitions (storage effect + re-eligibility)
 *  - trackDashboardOpenFromPopup session-dedup
 *  - devForceShow override
 *  - getDebugState() gate-array consistency with shouldPrompt()
 *  - applyTestScenario verdicts
 *
 * Time is injected explicitly via { now } everywhere — no fake timers.
 */

import * as ReviewPromptService from '../../services/execution/ReviewPromptService.js';
import { resetChromeMocks } from '../utils/chrome-mock.js';

const DAY = 24 * 60 * 60 * 1000;

// Fixed reference clock for all tests (a Jan 2026 instant, well past 90 days
// since epoch so back-dating never goes negative).
const NOW = 1_750_000_000_000;

// Stateful chrome.storage.local backed by a plain object so the service reads
// back what it writes (read-after-write across track/markShown/recordOutcome/
// applyTestScenario). Copied from tests/export-window-names.test.js.
function installStatefulStorage(initial = {}) {
  let store = { ...initial };
  global.chrome.storage.local.get.mockImplementation((keys) => {
    if (Array.isArray(keys)) {
      const out = {};
      for (const k of keys) out[k] = store[k];
      return Promise.resolve(out);
    }
    if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] });
    return Promise.resolve({ ...store });
  });
  global.chrome.storage.local.set.mockImplementation((obj) => {
    store = { ...store, ...obj };
    return Promise.resolve();
  });
  return () => store;
}

/** Read the persisted reviewPrompt object directly from the mocked store. */
async function readStored() {
  const data = await global.chrome.storage.local.get('reviewPrompt');
  return data.reviewPrompt;
}

/**
 * Seed the storage with a fully-passing baseline merged with overrides, then
 * invalidate the module cache so the next call re-reads it. Mirrors what
 * applyTestScenario produces but lets a test set up arbitrary state without a
 * named scenario.
 */
async function seed(overrides = {}, now = NOW) {
  const base = {
    installedAt: now - 14 * DAY,
    dashboardOpensFromPopup: 2,
    lastDashboardOpenFromPopupAt: now,
    lastPromptAt: null,
    lastDeferredAt: null,
    lastDismissedAt: null,
    shownCount: 0,
    rated: false,
    declined: false,
    feedbackPath: null,
    devForceShow: false,
  };
  await global.chrome.storage.local.set({ reviewPrompt: { ...base, ...overrides } });
  ReviewPromptService.__resetForTests();
}

describe('ReviewPromptService', () => {
  let getStore;

  beforeEach(() => {
    resetChromeMocks();
    getStore = installStatefulStorage();
    ReviewPromptService.__resetForTests();
  });

  // ---------------------------------------------------------------------------
  // Baseline / lazy init
  // ---------------------------------------------------------------------------
  describe('initialization', () => {
    it('lazy-seeds installedAt when missing', async () => {
      await ReviewPromptService.shouldPrompt({ now: NOW });
      const stored = getStore().reviewPrompt;
      expect(stored.installedAt).toBe(NOW);
    });

    it('all_pass baseline is eligible', async () => {
      await seed();
      const r = await ReviewPromptService.shouldPrompt({ now: NOW });
      expect(r).toEqual({ eligible: true, reason: 'eligible', version: 'fresh' });
    });
  });

  // ---------------------------------------------------------------------------
  // Gates — both sides of each boundary (§7.3 eligibility)
  // ---------------------------------------------------------------------------
  describe('gates', () => {
    it('exposure_cap: shownCount=3 -> exposure_cap; 2 -> eligible', async () => {
      await seed({ shownCount: 3 });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe('exposure_cap');

      await seed({ shownCount: 2 });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe('eligible');
    });

    it('install age: 13d -> install_too_recent; 14d -> eligible', async () => {
      await seed({ installedAt: NOW - 13 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe(
        'install_too_recent'
      );

      await seed({ installedAt: NOW - 14 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe('eligible');
    });

    it('dashboard opens: 1 -> not_enough_engagement; 2 -> eligible', async () => {
      await seed({ dashboardOpensFromPopup: 1 });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe(
        'not_enough_engagement'
      );

      await seed({ dashboardOpensFromPopup: 2 });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe('eligible');
    });

    it('engagement recency: 15d -> engagement_stale; 14d -> eligible', async () => {
      await seed({ lastDashboardOpenFromPopupAt: NOW - 15 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe(
        'engagement_stale'
      );

      await seed({ lastDashboardOpenFromPopupAt: NOW - 14 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe('eligible');
    });

    it('cooldown: 6d -> in_cooldown; 7d -> eligible', async () => {
      await seed({ lastPromptAt: NOW - 6 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe('in_cooldown');

      await seed({ lastPromptAt: NOW - 7 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe('eligible');
    });

    it('rated -> already_resolved', async () => {
      await seed({ rated: true });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe(
        'already_resolved'
      );
    });

    it('declined -> already_resolved', async () => {
      await seed({ declined: true });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe(
        'already_resolved'
      );
    });

    it('feedbackPath github -> already_resolved', async () => {
      await seed({ feedbackPath: 'github' });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe(
        'already_resolved'
      );
    });

    it('defer window: 29d -> deferred_recently; 31d -> eligible with version after_defer', async () => {
      await seed({ lastDeferredAt: NOW - 29 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe(
        'deferred_recently'
      );

      await seed({ lastDeferredAt: NOW - 31 * DAY });
      const r = await ReviewPromptService.shouldPrompt({ now: NOW });
      expect(r.reason).toBe('eligible');
      // Past the defer window: prompt re-shows, with the after-defer copy variant
      // (spec §7.3 row 7 — this is the only case where the variant is reachable).
      expect(r.version).toBe('after_defer');
    });

    it('version is after_defer while within the defer window', async () => {
      await seed({ lastDeferredAt: NOW - 29 * DAY });
      const r = await ReviewPromptService.shouldPrompt({ now: NOW });
      expect(r.version).toBe('after_defer');
    });

    it('dismiss window: 89d -> dismissed_recently; 91d -> eligible', async () => {
      await seed({ lastDismissedAt: NOW - 89 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe(
        'dismissed_recently'
      );

      await seed({ lastDismissedAt: NOW - 91 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe('eligible');
    });

    it('gate ordering: exposure_cap wins over other failing gates', async () => {
      // Both cap and install fail; cap is first in the ordered array.
      await seed({ shownCount: 3, installedAt: NOW - 1 * DAY });
      expect((await ReviewPromptService.shouldPrompt({ now: NOW })).reason).toBe('exposure_cap');
    });
  });

  // ---------------------------------------------------------------------------
  // Outcomes — storage effect + re-eligibility (§7.3 outcomes)
  // ---------------------------------------------------------------------------
  describe('recordOutcome', () => {
    it('dismiss -> lastDismissedAt=now; blocked at 89d, eligible at 91d', async () => {
      // Keep engagement fresh at the future check times so only the dismiss
      // window is under test (other gates must still pass).
      await seed({ lastDashboardOpenFromPopupAt: NOW + 80 * DAY });
      await ReviewPromptService.recordOutcome({ step: 1, action: 'dismiss', now: NOW });
      expect((await readStored()).lastDismissedAt).toBe(NOW);

      // Re-eligibility: 89d later still blocked, 91d later eligible.
      ReviewPromptService.__resetForTests();
      expect(
        (await ReviewPromptService.shouldPrompt({ now: NOW + 89 * DAY })).reason
      ).toBe('dismissed_recently');
      ReviewPromptService.__resetForTests();
      expect((await ReviewPromptService.shouldPrompt({ now: NOW + 91 * DAY })).reason).toBe(
        'eligible'
      );
    });

    it('thumbsDown -> feedbackPath=github (never again)', async () => {
      await seed();
      await ReviewPromptService.recordOutcome({ step: 1, action: 'thumbsDown', now: NOW });
      expect((await readStored()).feedbackPath).toBe('github');
      ReviewPromptService.__resetForTests();
      expect((await ReviewPromptService.shouldPrompt({ now: NOW + 365 * DAY })).reason).toBe(
        'already_resolved'
      );
    });

    it('rated -> rated=true (never again)', async () => {
      await seed();
      await ReviewPromptService.recordOutcome({ step: 2, action: 'rated', now: NOW });
      expect((await readStored()).rated).toBe(true);
      ReviewPromptService.__resetForTests();
      expect((await ReviewPromptService.shouldPrompt({ now: NOW + 365 * DAY })).reason).toBe(
        'already_resolved'
      );
    });

    it('later -> lastDeferredAt=now; blocked at 29d, eligible at 31d with after_defer copy at 29d', async () => {
      // Keep engagement fresh at the future check times.
      await seed({ lastDashboardOpenFromPopupAt: NOW + 25 * DAY });
      await ReviewPromptService.recordOutcome({ step: 2, action: 'later', now: NOW });
      expect((await readStored()).lastDeferredAt).toBe(NOW);

      ReviewPromptService.__resetForTests();
      const at29 = await ReviewPromptService.shouldPrompt({ now: NOW + 29 * DAY });
      expect(at29.reason).toBe('deferred_recently');
      expect(at29.version).toBe('after_defer');

      ReviewPromptService.__resetForTests();
      const at31 = await ReviewPromptService.shouldPrompt({ now: NOW + 31 * DAY });
      expect(at31.reason).toBe('eligible');
    });

    it('github -> feedbackPath=github (never again)', async () => {
      await seed();
      await ReviewPromptService.recordOutcome({ step: 2, action: 'github', now: NOW });
      expect((await readStored()).feedbackPath).toBe('github');
    });

    it('noThanks -> declined=true (never again)', async () => {
      await seed();
      await ReviewPromptService.recordOutcome({ step: 2, action: 'noThanks', now: NOW });
      expect((await readStored()).declined).toBe(true);
    });

    it('unknown action is a no-op', async () => {
      await seed();
      const before = await readStored();
      await ReviewPromptService.recordOutcome({ step: 1, action: 'bogus', now: NOW });
      const after = await readStored();
      expect(after).toEqual(before);
    });
  });

  // ---------------------------------------------------------------------------
  // markShown / passive close
  // ---------------------------------------------------------------------------
  describe('markShown (passive close)', () => {
    it('sets lastPromptAt and increments shownCount with no suppression flag', async () => {
      await seed();
      await ReviewPromptService.markShown({ now: NOW });
      const stored = await readStored();
      expect(stored.lastPromptAt).toBe(NOW);
      expect(stored.shownCount).toBe(1);
      // No suppression flag set.
      expect(stored.rated).toBe(false);
      expect(stored.declined).toBe(false);
      expect(stored.feedbackPath).toBeNull();
      expect(stored.lastDismissedAt).toBeNull();
      expect(stored.lastDeferredAt).toBeNull();
    });

    it('re-eligible after 7d cooldown, until the exposure cap', async () => {
      // Keep engagement fresh across the future check times.
      await seed({ lastDashboardOpenFromPopupAt: NOW + 95 * DAY });
      // Three passive shows, 7+ days apart, then capped.
      await ReviewPromptService.markShown({ now: NOW });
      ReviewPromptService.__resetForTests();
      expect(
        (await ReviewPromptService.shouldPrompt({ now: NOW + 6 * DAY })).reason
      ).toBe('in_cooldown');
      ReviewPromptService.__resetForTests();
      expect((await ReviewPromptService.shouldPrompt({ now: NOW + 7 * DAY })).reason).toBe(
        'eligible'
      );

      await ReviewPromptService.markShown({ now: NOW + 7 * DAY });
      await ReviewPromptService.markShown({ now: NOW + 14 * DAY });
      ReviewPromptService.__resetForTests();
      // shownCount is now 3 -> capped forever.
      expect(
        (await ReviewPromptService.shouldPrompt({ now: NOW + 100 * DAY })).reason
      ).toBe('exposure_cap');
    });
  });

  // ---------------------------------------------------------------------------
  // trackDashboardOpenFromPopup session-dedup
  // ---------------------------------------------------------------------------
  describe('trackDashboardOpenFromPopup', () => {
    it('increments only once per session, again after a new session', async () => {
      await seed({ dashboardOpensFromPopup: 0 });

      await ReviewPromptService.trackDashboardOpenFromPopup({ now: NOW });
      await ReviewPromptService.trackDashboardOpenFromPopup({ now: NOW + 1000 });
      expect((await readStored()).dashboardOpensFromPopup).toBe(1);

      // New popup open simulated by clearing module state.
      ReviewPromptService.__resetForTests();
      await ReviewPromptService.trackDashboardOpenFromPopup({ now: NOW + 2000 });
      expect((await readStored()).dashboardOpensFromPopup).toBe(2);
    });

    it('records lastDashboardOpenFromPopupAt', async () => {
      await seed({ dashboardOpensFromPopup: 0, lastDashboardOpenFromPopupAt: null });
      await ReviewPromptService.trackDashboardOpenFromPopup({ now: NOW });
      expect((await readStored()).lastDashboardOpenFromPopupAt).toBe(NOW);
    });
  });

  // ---------------------------------------------------------------------------
  // devForceShow
  // ---------------------------------------------------------------------------
  describe('devForceShow', () => {
    it('shouldPrompt is eligible regardless of failing gates', async () => {
      // Every gate failing, but force-show set.
      await seed({
        shownCount: 5,
        installedAt: NOW,
        dashboardOpensFromPopup: 0,
        rated: true,
        devForceShow: true,
      });
      const r = await ReviewPromptService.shouldPrompt({ now: NOW });
      expect(r).toEqual({ eligible: true, reason: 'dev_override', version: 'fresh' });
    });

    it('setForceShow persists the flag', async () => {
      await seed();
      await ReviewPromptService.setForceShow(true);
      expect((await readStored()).devForceShow).toBe(true);
      await ReviewPromptService.setForceShow(false);
      expect((await readStored()).devForceShow).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // devVariant — dev-only Step 1 copy selector for the force-show preview
  // ---------------------------------------------------------------------------
  describe('devVariant', () => {
    it('defaults to fresh when unset (DEFAULT_STATE merge)', async () => {
      // seed() writes a legacy object lacking devVariant; the service merges
      // DEFAULT_STATE over stored, so the field surfaces as 'fresh'.
      await seed();
      const debug = await ReviewPromptService.getDebugState({ now: NOW });
      expect(debug.storage.devVariant).toBe('fresh');
    });

    it('setVariant("after_defer") persists devVariant:after_defer', async () => {
      await seed();
      await ReviewPromptService.setVariant('after_defer');
      expect((await readStored()).devVariant).toBe('after_defer');
    });

    it('setVariant normalizes any non-after_defer value to fresh', async () => {
      await seed({ devVariant: 'after_defer' });
      await ReviewPromptService.setVariant('bogus');
      expect((await readStored()).devVariant).toBe('fresh');
      await ReviewPromptService.setVariant('fresh');
      expect((await readStored()).devVariant).toBe('fresh');
    });

    it('under devForceShow, shouldPrompt().version equals the set devVariant', async () => {
      await seed({ devForceShow: true, devVariant: 'after_defer' });
      const afterDefer = await ReviewPromptService.shouldPrompt({ now: NOW });
      expect(afterDefer).toEqual({
        eligible: true,
        reason: 'dev_override',
        version: 'after_defer',
      });

      await seed({ devForceShow: true, devVariant: 'fresh' });
      const fresh = await ReviewPromptService.shouldPrompt({ now: NOW });
      expect(fresh).toEqual({ eligible: true, reason: 'dev_override', version: 'fresh' });
    });

    it('getDebugState mirrors shouldPrompt version under force-show', async () => {
      await seed({ devForceShow: true, devVariant: 'after_defer' });
      const debug = await ReviewPromptService.getDebugState({ now: NOW });
      expect(debug.shouldPrompt.version).toBe('after_defer');
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrency robustness — mutators survive a reloadState() nulling the cache
  // mid-write (cross-context storage.onChanged hazard; impl-plan §1).
  // ---------------------------------------------------------------------------
  describe('setForceShow concurrency robustness', () => {
    it('from EMPTY storage persists devForceShow:true AND seeds installedAt', async () => {
      // Empty storage (the upgrader path: no reviewPrompt key at all).
      await ReviewPromptService.setForceShow(true);
      const stored = await readStored();
      expect(stored.devForceShow).toBe(true);
      expect(stored.installedAt).not.toBeNull();
    });

    it('does not lose the write when reloadState() fires mid-set (empty storage)', async () => {
      // Regression for the confirmed bug: from EMPTY storage, setForceShow()'s
      // ensureInitialized() lazy-seeds installedAt and persists, which fires
      // storage.onChanged in the options context. That handler calls
      // reloadState(), nulling the module cache mid-call. The mutator must still
      // land devForceShow:true (it operates on a captured local, not the cache).
      //
      // We mimic the onChanged firing by stubbing chrome.storage.local.set to
      // (a) update the backing store, THEN (b) call reloadState() before
      // resolving — exactly the interleaving the real handler produces.
      let store = {};
      global.chrome.storage.local.get.mockImplementation((keys) => {
        if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] });
        return Promise.resolve({ ...store });
      });
      global.chrome.storage.local.set.mockImplementation((obj) => {
        store = { ...store, ...obj };
        // Simulate the cross-context storage.onChanged → options reloadState().
        ReviewPromptService.reloadState();
        return Promise.resolve();
      });

      await ReviewPromptService.setForceShow(true);

      // The intended write must survive the mid-call cache invalidation.
      expect(store.reviewPrompt.devForceShow).toBe(true);
      expect(store.reviewPrompt.installedAt).not.toBeNull();
    });

    it('survives reloadState() called synchronously right after kicking off the mutation', async () => {
      // Empty storage; interleave reloadState() while the mutate() promise is in
      // flight (before its awaits resolve). The captured local still wins.
      const p = ReviewPromptService.setForceShow(true);
      ReviewPromptService.reloadState();
      await p;
      const stored = await readStored();
      expect(stored.devForceShow).toBe(true);
      expect(stored.installedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getDebugState consistency
  // ---------------------------------------------------------------------------
  describe('getDebugState', () => {
    it('gates array pass/fail matches shouldPrompt for an all-pass state', async () => {
      await seed();
      const debug = await ReviewPromptService.getDebugState({ now: NOW });
      const verdict = await ReviewPromptService.shouldPrompt({ now: NOW });
      expect(debug.shouldPrompt).toEqual(verdict);
      expect(debug.gates.every((g) => g.pass)).toBe(true);
    });

    it('first failing gate in the array matches shouldPrompt.reason', async () => {
      await seed({ installedAt: NOW - 13 * DAY });
      const debug = await ReviewPromptService.getDebugState({ now: NOW });
      const firstFail = debug.gates.find((g) => !g.pass);
      expect(firstFail.id).toBe('install_too_recent');
      expect(debug.shouldPrompt.reason).toBe('install_too_recent');
    });

    it('reads fresh (bypasses cache) so cross-context changes are visible', async () => {
      await seed();
      // Prime the module cache.
      await ReviewPromptService.shouldPrompt({ now: NOW });
      // Mutate storage directly (simulating another context) WITHOUT touching cache.
      const cur = (await readStored()) || {};
      await global.chrome.storage.local.set({
        reviewPrompt: { ...cur, shownCount: 3 },
      });
      const debug = await ReviewPromptService.getDebugState({ now: NOW });
      expect(debug.storage.shownCount).toBe(3);
      expect(debug.shouldPrompt.reason).toBe('exposure_cap');
    });

    it('exposes derived values', async () => {
      await seed({ installedAt: NOW - 20 * DAY, dashboardOpensFromPopup: 2 });
      const debug = await ReviewPromptService.getDebugState({ now: NOW });
      expect(debug.derived.daysSinceInstall).toBe(20);
      expect(debug.derived.dashboardOpensFromPopup).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // applyTestScenario
  // ---------------------------------------------------------------------------
  describe('applyTestScenario', () => {
    it('all_pass -> eligible', async () => {
      const debug = await ReviewPromptService.applyTestScenario('all_pass', { now: NOW });
      expect(debug.shouldPrompt.reason).toBe('eligible');
    });

    it('install_13d -> install_too_recent', async () => {
      const debug = await ReviewPromptService.applyTestScenario('install_13d', { now: NOW });
      expect(debug.shouldPrompt.reason).toBe('install_too_recent');
    });

    it('cap_reached -> exposure_cap', async () => {
      const debug = await ReviewPromptService.applyTestScenario('cap_reached', { now: NOW });
      expect(debug.shouldPrompt.reason).toBe('exposure_cap');
    });

    it('defer_31d -> eligible with after_defer version', async () => {
      const debug = await ReviewPromptService.applyTestScenario('defer_31d', { now: NOW });
      expect(debug.shouldPrompt.reason).toBe('eligible');
      expect(debug.shouldPrompt.version).toBe('after_defer');
    });

    it('defer_29d -> deferred_recently with after_defer version', async () => {
      const debug = await ReviewPromptService.applyTestScenario('defer_29d', { now: NOW });
      expect(debug.shouldPrompt.reason).toBe('deferred_recently');
      expect(debug.shouldPrompt.version).toBe('after_defer');
    });

    it('rejects an unknown scenario id', async () => {
      await expect(
        ReviewPromptService.applyTestScenario('nope', { now: NOW })
      ).rejects.toThrow(/Unknown review-prompt test scenario/);
    });

    it('persists the scenario state to storage', async () => {
      await ReviewPromptService.applyTestScenario('opens_1', { now: NOW });
      expect((await readStored()).dashboardOpensFromPopup).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // resetState
  // ---------------------------------------------------------------------------
  describe('resetState', () => {
    it('wipes to first-run with installedAt set', async () => {
      await seed({ rated: true, shownCount: 3 });
      await ReviewPromptService.resetState();
      const stored = await readStored();
      expect(stored.rated).toBe(false);
      expect(stored.shownCount).toBe(0);
      expect(stored.installedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // seedInstall (background onInstalled path)
  // ---------------------------------------------------------------------------
  describe('seedInstall', () => {
    it('seeds installedAt from empty storage', async () => {
      await ReviewPromptService.seedInstall({ now: NOW });
      expect((await readStored()).installedAt).toBe(NOW);
    });

    it('is a no-op when installedAt is already set', async () => {
      await seed({ installedAt: NOW - 30 * DAY });
      await ReviewPromptService.seedInstall({ now: NOW });
      expect((await readStored()).installedAt).toBe(NOW - 30 * DAY);
    });
  });

  // ---------------------------------------------------------------------------
  // URLs
  // ---------------------------------------------------------------------------
  describe('URLS', () => {
    it('exposes the expected review and feedback URLs', () => {
      expect(ReviewPromptService.URLS.review).toBe(
        'https://chromewebstore.google.com/detail/kninondobdcahcnbfknfeijdljkkbbgc/reviews'
      );
      expect(ReviewPromptService.URLS.feedback).toBe(
        'https://github.com/lenulus/tabtasktick/issues/new?labels=feedback&template=feedback.md'
      );
    });
  });
});
