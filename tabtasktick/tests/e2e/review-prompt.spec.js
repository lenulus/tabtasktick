/**
 * E2E tests for the review-prompt feature (implementation-plan §7.2).
 *
 * First-of-kind popup/options E2E spec. The toolbar action popup is not reliably
 * drivable in Playwright, so the popup and options surfaces are opened as PAGES
 * (`chrome-extension://<id>/popup/popup.html`, `.../options/options.html`).
 *
 * Tests in this file share one ephemeral Chrome profile / IndexedDB (workers:1,
 * worker-scoped shared context). The single `reviewPrompt` storage key is reset
 * from the service worker in beforeEach so each test is independent. (Per the
 * task spec, this targeted reset is the intended way to keep these tests
 * independent — distinct from the README's "don't clean IndexedDB" guidance.)
 *
 * Note on the SW + chrome.storage: in a cold MV3 service worker, `chrome` exists
 * but `chrome.storage` is undefined until the extension has been activated by an
 * open extension page. `ensureSwStorage()` loads a throwaway extension page once
 * to wake `chrome.storage` in the SW, after which serviceWorkerPage.evaluate can
 * read/write storage reliably (including before the popup/options page loads,
 * which the outcome-path tests need for pre-seeding).
 *
 * FIXED (was: lost-write concurrency bug; remediated in ReviewPromptService):
 * The options `#rpForceShow` toggle previously failed to persist
 * `devForceShow:true` when the `reviewPrompt` storage key was ENTIRELY ABSENT.
 * Mechanism: on first run, setForceShow()'s ensureInitialized() lazy-seeds and
 * persists `installedAt`, which fires storage.onChanged; the options handler's
 * reloadState() nulled the service's module `state` cache mid-call, so the
 * subsequent `state.devForceShow = true` write threw/was lost.
 * Fix: every mutator now performs a read-modify-write on a captured non-null
 * LOCAL snapshot (helper `mutate()` / `writeState()` in the service) and persists
 * that local, so a concurrent reloadState() can no longer drop the write. The
 * reachable path (an upgrader in Developer Mode toggling force-show before any
 * other reviewPrompt write) now works. The toggle test below starts from
 * EMPTY/reset storage so it exercises that real upgrader path and guards the fix.
 */

import { test, expect } from './fixtures/extension.js';

const POPUP = (id) => `chrome-extension://${id}/popup/popup.html`;
const OPTIONS = (id) => `chrome-extension://${id}/options/options.html`;

/**
 * Wake `chrome.storage` in the service worker context if it isn't available yet.
 * Loads a throwaway extension page (which activates the extension) and waits for
 * `chrome.storage` to appear in the SW, then closes the page.
 */
async function ensureSwStorage(context, serviceWorkerPage, extensionId) {
  const ready = await serviceWorkerPage.evaluate(
    () => typeof chrome !== 'undefined' && !!chrome.storage,
  );
  if (ready) return;

  const warmup = await context.newPage();
  try {
    await warmup.goto(OPTIONS(extensionId));
    await warmup.waitForLoadState('domcontentloaded');
    await expect
      .poll(() => serviceWorkerPage.evaluate(() => !!(chrome && chrome.storage)))
      .toBe(true);
  } finally {
    await warmup.close();
  }
}

// Reset only the reviewPrompt key before each test (leaves developerMode etc. intact).
test.beforeEach(async ({ context, serviceWorkerPage, extensionId }) => {
  await ensureSwStorage(context, serviceWorkerPage, extensionId);
  await serviceWorkerPage.evaluate(() => chrome.storage.local.remove('reviewPrompt'));
});

/** Read the persisted reviewPrompt state object from the service worker context. */
async function readReviewPrompt(serviceWorkerPage) {
  return serviceWorkerPage.evaluate(async () => {
    const data = await chrome.storage.local.get('reviewPrompt');
    return data.reviewPrompt || null;
  });
}

/** Seed the reviewPrompt key directly from the service worker context. */
async function seedReviewPrompt(serviceWorkerPage, state) {
  await serviceWorkerPage.evaluate((s) => chrome.storage.local.set({ reviewPrompt: s }), state);
}

/**
 * Open the options page and ensure Developer Mode is enabled + the dev panel is
 * visible. Idempotent: only toggles the checkbox if it isn't already checked.
 */
async function openOptionsWithDevMode(page, extensionId) {
  await page.goto(OPTIONS(extensionId));
  await page.waitForLoadState('domcontentloaded');

  // #developerMode is a CSS "switch" toggle: the real <input> is visually hidden
  // (zero-size, behind a .slider), so clicking the input directly fails
  // ("outside of viewport"). Click the visible sibling .slider instead, which
  // toggles the input and fires its change handler. isChecked() reflects state.
  const devModeCheckbox = page.locator('#developerMode');
  await devModeCheckbox.waitFor({ state: 'attached' });

  if (!(await devModeCheckbox.isChecked())) {
    await page.locator('#developerMode + .slider').click();
    await expect(devModeCheckbox).toBeChecked();
  }

  // The #developerSettings panel un-hides when developer mode is on.
  await expect(page.locator('#developerSettings')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Test 1: Dev panel gates checklist (§7.2 step 2, §7.3 matrix)
// ---------------------------------------------------------------------------
test.describe('Developer Options — gate scenarios', () => {
  test('Developer Mode reveals the review-prompt dev controls', async ({ page, extensionId }) => {
    await openOptionsWithDevMode(page, extensionId);

    // #rpForceShow is a hidden switch input; assert it's present and its visible
    // slider is shown. The rest are ordinary visible controls.
    await expect(page.locator('#rpForceShow')).toBeAttached();
    await expect(page.locator('#rpForceShow + .slider')).toBeVisible();
    await expect(page.locator('#rpVariant')).toBeVisible();
    await expect(page.locator('#rpScenario')).toBeVisible();
    await expect(page.locator('#rpApplyScenario')).toBeVisible();
    await expect(page.locator('#rpReset')).toBeVisible();
  });

  test('representative scenarios produce the expected verdict in #rpState', async ({
    page,
    extensionId,
  }) => {
    await openOptionsWithDevMode(page, extensionId);

    // The full gate-id list is ALWAYS rendered in .rp-gate-list regardless of
    // pass/fail, so the discriminating signal is the verdict line only
    // (.rp-state-verdict renders "✗ <reason> (<version>)" or "✓ eligible (...)").
    const verdict = page.locator('#rpState .rp-state-verdict');

    const cases = [
      // [scenario id, expected substring(s) in the verdict line]
      ['install_13d', ['install_too_recent']],
      ['install_14d', ['eligible']],
      ['opens_1', ['not_enough_engagement']],
      ['cap_reached', ['exposure_cap']],
      ['rated', ['already_resolved']],
      ['recency_15d', ['engagement_stale']],
      ['cooldown_6d', ['in_cooldown']],
      // defer_31d is past the 30d window → eligible AND drives the after_defer variant.
      ['defer_31d', ['eligible', 'after_defer']],
      ['dismiss_89d', ['dismissed_recently']],
      ['all_pass', ['eligible']],
    ];

    for (const [scenario, expected] of cases) {
      await page.locator('#rpScenario').selectOption(scenario);
      await page.locator('#rpApplyScenario').click();
      // Web-first assertions auto-retry, covering the async getDebugState re-render.
      for (const text of expected) {
        await expect(verdict, `scenario ${scenario} → ${text}`).toContainText(text);
      }
    }
  });

  test('#rpForceShow toggle writes devForceShow to storage', async ({
    page,
    extensionId,
    serviceWorkerPage,
  }) => {
    // Start from EMPTY storage (beforeEach already removed the `reviewPrompt`
    // key) so this exercises the real upgrader path: the key is entirely absent,
    // so setForceShow()'s lazy install-seed fires storage.onChanged →
    // reloadState() nulls the cache mid-call. This used to drop the write (see
    // the spec-file FIXED note); the service's robust read-modify-write now keeps
    // it. No pre-seed — the toggle itself must seed + persist correctly.
    expect(await readReviewPrompt(serviceWorkerPage)).toBeNull();

    await openOptionsWithDevMode(page, extensionId);

    // #rpForceShow is a CSS "switch" toggle (hidden input). Click the visible
    // slider sibling (inside the same <label>) to toggle the input; the options
    // change-handler calls setForceShow() and persists devForceShow.
    const toggle = page.locator('#rpForceShow');
    const slider = page.locator('#rpForceShow + .slider');

    await slider.click();
    await expect(toggle).toBeChecked();
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.devForceShow)
      .toBe(true);

    await slider.click();
    await expect(toggle).not.toBeChecked();
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.devForceShow)
      .toBe(false);
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.devForceShow)
      .toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Force-show + outcome paths (§7.2 step 3, §7.3 outcomes table)
// ---------------------------------------------------------------------------
test.describe('Popup review prompt — force-show & outcomes', () => {
  // With devForceShow:true, shouldPrompt() short-circuits to eligible regardless
  // of gates, so the minimal seed per outcome test is just { devForceShow: true }.
  const forceShow = { devForceShow: true };

  test('banner is visible in the promo slot when force-show is on', async ({
    page,
    extensionId,
    serviceWorkerPage,
  }) => {
    await seedReviewPrompt(serviceWorkerPage, forceShow);
    await page.goto(POPUP(extensionId));
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('#reviewPromptBanner')).toBeVisible();
    await expect(page.locator('#reviewPromptStep1')).toBeVisible();
  });

  test('Step 1 dismiss × sets lastDismissedAt', async ({ page, extensionId, serviceWorkerPage }) => {
    await seedReviewPrompt(serviceWorkerPage, forceShow);
    await page.goto(POPUP(extensionId));
    await page.locator('#reviewPromptBanner').waitFor({ state: 'visible' });

    await page.locator('#reviewPromptDismiss').click();

    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.lastDismissedAt)
      .toBeGreaterThan(0);
  });

  test('Step 1 Not yet routes to github (feedbackPath)', async ({
    page,
    extensionId,
    serviceWorkerPage,
  }) => {
    await seedReviewPrompt(serviceWorkerPage, forceShow);
    await page.goto(POPUP(extensionId));
    await page.locator('#reviewPromptBanner').waitFor({ state: 'visible' });

    await page.locator('#reviewPromptNo').click();

    // Should swap to the negative step and record the thumbsDown → feedbackPath.
    await expect(page.locator('#reviewPromptStep2Negative')).toBeVisible();
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.feedbackPath)
      .toBe('github');
  });

  test('Step 2 Rate sets rated', async ({ page, extensionId, serviceWorkerPage }) => {
    await seedReviewPrompt(serviceWorkerPage, forceShow);
    await page.goto(POPUP(extensionId));
    await page.locator('#reviewPromptBanner').waitFor({ state: 'visible' });

    // 👍 Yes swaps to the positive step (no outcome recorded yet).
    await page.locator('#reviewPromptYes').click();
    await expect(page.locator('#reviewPromptStep2Positive')).toBeVisible();

    // Rate records rated BEFORE chrome.tabs.create (which opens an external tab —
    // ignore any resulting navigation/tab; only the storage write matters).
    await page.locator('#reviewPromptRate').click();

    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.rated)
      .toBe(true);
  });

  test('Step 2 Maybe later sets lastDeferredAt', async ({
    page,
    extensionId,
    serviceWorkerPage,
  }) => {
    await seedReviewPrompt(serviceWorkerPage, forceShow);
    await page.goto(POPUP(extensionId));
    await page.locator('#reviewPromptBanner').waitFor({ state: 'visible' });

    await page.locator('#reviewPromptYes').click();
    await expect(page.locator('#reviewPromptStep2Positive')).toBeVisible();

    await page.locator('#reviewPromptLater').click();

    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.lastDeferredAt)
      .toBeGreaterThan(0);
  });

  test('Step 2 GitHub routes to github (feedbackPath)', async ({
    page,
    extensionId,
    serviceWorkerPage,
  }) => {
    await seedReviewPrompt(serviceWorkerPage, forceShow);
    await page.goto(POPUP(extensionId));
    await page.locator('#reviewPromptBanner').waitFor({ state: 'visible' });

    // Reach the negative step via Not yet, then click the GitHub action.
    await page.locator('#reviewPromptNo').click();
    await expect(page.locator('#reviewPromptStep2Negative')).toBeVisible();

    await page.locator('#reviewPromptGithub').click();

    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.feedbackPath)
      .toBe('github');
  });

  test('Step 2 No thanks sets declined', async ({ page, extensionId, serviceWorkerPage }) => {
    await seedReviewPrompt(serviceWorkerPage, forceShow);
    await page.goto(POPUP(extensionId));
    await page.locator('#reviewPromptBanner').waitFor({ state: 'visible' });

    await page.locator('#reviewPromptNo').click();
    await expect(page.locator('#reviewPromptStep2Negative')).toBeVisible();

    await page.locator('#reviewPromptDecline').click();

    // Note: reaching the negative step (Not yet) already set feedbackPath='github',
    // so assert ONLY the target field for this path.
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.declined)
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 2b: Dev variant selector drives the Step 1 copy in the popup (§7.3 row 7)
// ---------------------------------------------------------------------------
test.describe('Popup review prompt — dev variant selector', () => {
  test('#rpVariant after_defer → popup shows after-defer copy; fresh → fresh copy', async ({
    page,
    extensionId,
    serviceWorkerPage,
  }) => {
    const question = page.locator('#reviewPromptQuestion');

    // --- after_defer ---
    // Drive the options UI: pick the after_defer variant and turn force-show on,
    // both of which route through ReviewPromptService into the single reviewPrompt key.
    await openOptionsWithDevMode(page, extensionId);
    await page.locator('#rpVariant').selectOption('after_defer');
    await page.locator('#rpForceShow + .slider').click();
    await expect(page.locator('#rpForceShow')).toBeChecked();

    // Wait for BOTH writes to land before opening the popup (async storage writes).
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.devVariant)
      .toBe('after_defer');
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.devForceShow)
      .toBe(true);

    await page.goto(POPUP(extensionId));
    await page.locator('#reviewPromptBanner').waitFor({ state: 'visible' });
    await expect(question).toHaveText('Still enjoying TabTaskTick?');

    // --- fresh ---
    // #rpVariant lives only on the options page, so navigate back to flip it.
    await openOptionsWithDevMode(page, extensionId);
    await page.locator('#rpVariant').selectOption('fresh');
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.devVariant)
      .toBe('fresh');

    await page.goto(POPUP(extensionId));
    await page.locator('#reviewPromptBanner').waitFor({ state: 'visible' });
    await expect(question).toHaveText('Enjoying TabTaskTick?');
  });
});

// ---------------------------------------------------------------------------
// Test 3: Gate "first-open-of-day" — E2E-only (§4.4, §7.2 step 4)
// ---------------------------------------------------------------------------
test.describe('Popup review prompt — first-open-of-day cooldown', () => {
  test('shows once organically, then is suppressed on same-day reopen', async ({
    page,
    extensionId,
    serviceWorkerPage,
  }) => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    // All gates pass, force-show OFF: installed 20d ago, 2 engaged sessions, recent.
    await seedReviewPrompt(serviceWorkerPage, {
      installedAt: now - 20 * DAY,
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
    });

    // First open: prompt shows organically and markShown() bumps shownCount to 1.
    await page.goto(POPUP(extensionId));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#reviewPromptBanner')).toBeVisible();

    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.shownCount)
      .toBe(1);
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.lastPromptAt)
      .toBeGreaterThan(0);

    // Same-day reopen: in_cooldown gate now fails → prompt does NOT re-show.
    // page.reload() gives a fresh JS context (module flags reset, storage re-read),
    // so the hidden state is a real re-evaluation, not stale DOM.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // The real proof: the second open did NOT call markShown() again.
    await expect
      .poll(async () => (await readReviewPrompt(serviceWorkerPage))?.shownCount)
      .toBe(1);
    // Secondary DOM check: banner stays hidden.
    await expect(page.locator('#reviewPromptBanner')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// Test 4: Mutex with Collections promo (§7.2)
// ---------------------------------------------------------------------------
test.describe('Popup review prompt — mutex with Collections banner', () => {
  test('Collections banner is hidden while the review prompt shows', async ({
    page,
    extensionId,
    serviceWorkerPage,
  }) => {
    await seedReviewPrompt(serviceWorkerPage, { devForceShow: true });
    await page.goto(POPUP(extensionId));
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('#reviewPromptBanner')).toBeVisible();
    await expect(page.locator('#collectionsBanner')).toBeHidden();
  });
});
