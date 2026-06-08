#!/usr/bin/env node
/**
 * Store-screenshot generator for TabTaskTick.
 *
 * Produces the 5 required store screenshots at exactly 1280×800 per locale.
 * For each locale it builds a temp copy of the extension with
 * _locales/en/messages.json overwritten by the target locale (Chrome resolves
 * UI locale en-US → _locales/en, so whatever is in that dir renders), launches
 * a fresh persistent context, seeds realistic data, and captures all 5 shots.
 *
 * Usage:
 *   node scripts/screenshots/capture.mjs              # all locales
 *   node scripts/screenshots/capture.mjs --locale=en  # one locale
 *
 * Output: screenshots/<locale>/0N-*.png
 *
 * NOTE: headful only (extensions require it). On CI use xvfb-run.
 */

import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';

import { LOCALES, getContent } from './fixtures.mjs';
import { seedIndexedDB, seedRule, openDataTabs, ensureTabCount } from './seed.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension root (3 levels up from scripts/screenshots/)
const EXT_ROOT = path.resolve(__dirname, '../../');
const OUT_ROOT = path.join(EXT_ROOT, 'screenshots');

const VIEWPORT = { width: 1280, height: 800 };
const TARGET_TAB_COUNT = 200; // total open tabs for the overview shot (#5)
const SETTLE_MS = 700; // settle for fonts/animation before each screenshot

// Dirs to exclude when copying the extension into a temp build.
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'test-results', 'playwright-report',
  'screenshots', 'tests', 'docs', 'coverage', '.github',
]);
const EXCLUDE_LOCALE_DIR = 'en_XA';

function parseArgs() {
  const args = process.argv.slice(2);
  let locale = null;
  for (const a of args) {
    if (a.startsWith('--locale=')) locale = a.slice('--locale='.length);
  }
  return { locale };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Builds a temp copy of the extension with _locales/en overwritten by the
 * target locale's messages. Returns the temp build path.
 */
async function buildLocalizedCopy(locale) {
  const dst = await fs.mkdtemp(path.join(os.tmpdir(), `ttt-ext-${locale}-`));

  await fs.cp(EXT_ROOT, dst, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(EXT_ROOT, src);
      if (rel === '') return true;
      const top = rel.split(path.sep)[0];
      if (EXCLUDE_DIRS.has(top)) return false;
      // Exclude the pseudo-locale dir
      if (rel.split(path.sep).join('/') === `_locales/${EXCLUDE_LOCALE_DIR}`) return false;
      return true;
    },
  });

  // Overwrite _locales/en/messages.json with the target locale's messages.
  const srcMsgs = path.join(EXT_ROOT, '_locales', locale, 'messages.json');
  const dstMsgs = path.join(dst, '_locales', 'en', 'messages.json');
  await fs.copyFile(srcMsgs, dstMsgs);

  return dst;
}

async function getServiceWorker(ctx) {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  // Ensure it's the extension SW
  const started = Date.now();
  while (!sw.url().startsWith('chrome-extension://')) {
    if (Date.now() - started > 15000) throw new Error('No extension service worker appeared');
    sw = await ctx.waitForEvent('serviceworker');
  }
  return sw;
}

/** Verify a PNG is exactly the expected size by parsing its IHDR chunk. */
async function pngSize(file) {
  const buf = await fs.readFile(file);
  // PNG signature is 8 bytes; IHDR width/height are big-endian uint32 at 16/20.
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, bytes: buf.length };
}

// ---------------------------------------------------------------------------
// The 5 shots
// ---------------------------------------------------------------------------

const SHOTS = [
  {
    file: '01-kanban.png',
    async capture(ctx, extId) {
      const page = await ctx.newPage();
      await page.goto(`chrome-extension://${extId}/dashboard/dashboard.html#tasks`);
      await page.locator('#tasksViewKanban').click();
      await page.locator('#tasksKanbanContainer .kanban-board').first().waitFor({ timeout: 15000 });
      // Confirm columns actually rendered cards
      await page.locator('#tasksKanbanContainer .kanban-board').first().waitFor();
      return page;
    },
  },
  {
    file: '02-collection.png',
    async capture(ctx, extId) {
      const page = await ctx.newPage();
      await page.goto(`chrome-extension://${extId}/dashboard/dashboard.html#collections`);
      await page.locator('.collection-card').first().waitFor({ timeout: 15000 });
      await page.locator('.collection-card [data-action="view-details"]').first().click();
      await page.locator('#collectionDetailsModal .collection-details').first().waitFor({ timeout: 15000 });
      // Notes only render when folders+tabs+non-empty notes exist.
      await page.locator('#collectionDetailsModal .detail-list-note').first().waitFor({ timeout: 15000 });
      // Wait for the transient "Loading collection details…" toast to clear.
      await page.locator('.notification').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
      return page;
    },
  },
  {
    file: '03-rules.png',
    async capture(ctx, extId) {
      const page = await ctx.newPage();
      await page.goto(`chrome-extension://${extId}/dashboard/dashboard.html#rules`);
      await page.locator('.rule-card').first().waitFor({ timeout: 15000 });
      return page;
    },
  },
  {
    file: '04-snooze.png',
    async capture(ctx, extId, serviceWorker) {
      // Open a handful of real (data:) tabs so the snooze modal shows realistic
      // tabs (and reads "Snooze Tabs", not the stray about:blank/dashboard).
      // These persist into shot 5, where ensureTabCount tops up to 200.
      await openDataTabs(serviceWorker, 6);

      const page = await ctx.newPage();
      await page.goto(`chrome-extension://${extId}/dashboard/dashboard.html#tabs`);
      // Default view is grid: .tab-checkbox[data-tab-id]. Select the data: tabs
      // we just opened (titled "Docs 1", "Inbox 1", "Calendar 1", …) so the
      // modal shows realistic tabs rather than about:blank / the dashboard.
      await page.locator('.tab-checkbox').first().waitFor({ timeout: 15000 });
      const wantTitles = ['Docs 1', 'Inbox 1', 'Calendar 1'];
      let selected = 0;
      for (const title of wantTitles) {
        const card = page.locator('.tab-card', { has: page.locator(`.tab-title:text-is("${title}")`) }).first();
        if (await card.count()) {
          await card.locator('.tab-checkbox').check();
          selected++;
        }
      }
      // Fallback: if titles weren't found, select the first few checkboxes.
      if (selected === 0) {
        const checkboxes = page.locator('.tab-checkbox');
        const n = Math.min(3, await checkboxes.count());
        for (let i = 0; i < n; i++) await checkboxes.nth(i).check();
      }
      // Bulk toolbar appears with the selection.
      await page.locator('#bulkToolbar:not([hidden])').waitFor({ timeout: 15000 });
      await page.locator('#bulkToolbar [data-action="snooze"]').click();
      // Snooze modal opens; first preset (tomorrow / 9 AM) auto-selects.
      await page.locator('.snooze-modal.show').waitFor({ timeout: 15000 });
      await page.locator('.snooze-modal.show [data-preset-id="tomorrow"].selected').waitFor({ timeout: 15000 });
      return page;
    },
  },
  {
    file: '05-dashboard.png',
    async capture(ctx, extId, serviceWorker) {
      // Open overview first (it counts as one of the open tabs), then top up
      // to exactly TARGET_TAB_COUNT, then reload so the live stat refreshes.
      const page = await ctx.newPage();
      await page.goto(`chrome-extension://${extId}/dashboard/dashboard.html#overview`);

      const total = await ensureTabCount(serviceWorker, TARGET_TAB_COUNT);
      if (total !== TARGET_TAB_COUNT) {
        throw new Error(`Expected ${TARGET_TAB_COUNT} tabs, have ${total}`);
      }

      // Reload to re-run loadOverviewData() against the live count, then poll.
      const statLocator = page.locator('#statTotalTabs');
      let ok = false;
      for (let attempt = 0; attempt < 10 && !ok; attempt++) {
        await page.reload();
        await statLocator.waitFor({ timeout: 15000 });
        try {
          await page.waitForFunction(
            (expected) => {
              const el = document.getElementById('statTotalTabs');
              return el && el.textContent.trim() === String(expected);
            },
            TARGET_TAB_COUNT,
            { timeout: 6000 }
          );
          ok = true;
        } catch {
          await sleep(1000);
        }
      }
      if (!ok) {
        const shown = await statLocator.textContent();
        throw new Error(`#statTotalTabs never reached ${TARGET_TAB_COUNT} (showed "${shown}")`);
      }
      return page;
    },
  },
];

// ---------------------------------------------------------------------------
// Per-locale run
// ---------------------------------------------------------------------------

async function runLocale(locale) {
  console.log(`\n=== Locale: ${locale} ===`);
  const build = await buildLocalizedCopy(locale);
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), `ttt-profile-${locale}-`));
  const outDir = path.join(OUT_ROOT, locale);
  await fs.mkdir(outDir, { recursive: true });

  let ctx;
  const results = [];
  try {
    ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${build}`,
        `--load-extension=${build}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--lang=${locale}`, // no-op on mac/win, helps chrome.i18n on Linux
        '--window-size=1320,920', // larger than viewport so headful can't clamp
      ],
      serviceWorkers: 'allow',
      viewport: VIEWPORT,
    });

    const sw = await getServiceWorker(ctx);
    const extId = sw.url().split('/')[2];
    console.log(`  extension id: ${extId}`);

    const content = getContent(locale);

    // Seed IndexedDB + rule via the extension's test page.
    const seedPage = await ctx.newPage();
    await seedPage.goto(`chrome-extension://${extId}/test-page.html`, { waitUntil: 'domcontentloaded' });
    const seedInfo = await seedIndexedDB(seedPage, content);
    console.log(`  seeded: ${seedInfo.tabCount} tabs, ${seedInfo.taskCount} tasks`);
    await seedRule(seedPage, content.rule);
    console.log('  seeded: 1 rule');
    await seedPage.close();

    // Capture each shot.
    for (const shot of SHOTS) {
      const page = await shot.capture(ctx, extId, sw);
      await sleep(SETTLE_MS);
      const outPath = path.join(outDir, shot.file);
      await page.screenshot({ path: outPath }); // fullPage:false → exact viewport
      await page.close();

      const size = await pngSize(outPath);
      const exact = size.width === VIEWPORT.width && size.height === VIEWPORT.height;
      console.log(
        `  ${exact ? '✓' : '✗'} ${shot.file}  ${size.width}×${size.height}  (${size.bytes} bytes)`
      );
      results.push({ file: shot.file, ...size, exact });
    }
  } finally {
    if (ctx) await ctx.close();
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(build, { recursive: true, force: true }).catch(() => {});
  }
  return results;
}

async function main() {
  const { locale } = parseArgs();
  const locales = locale ? [locale] : LOCALES;
  if (locale && !LOCALES.includes(locale)) {
    throw new Error(`Unknown locale "${locale}". Valid: ${LOCALES.join(', ')}`);
  }

  await fs.mkdir(OUT_ROOT, { recursive: true });

  const summary = {};
  for (const loc of locales) {
    summary[loc] = await runLocale(loc);
  }

  // Final report
  console.log('\n=== Summary ===');
  let allOk = true;
  for (const [loc, shots] of Object.entries(summary)) {
    for (const s of shots) {
      if (!s.exact || s.bytes === 0) allOk = false;
      console.log(`  ${loc}/${s.file}: ${s.width}×${s.height} ${s.exact ? 'OK' : 'WRONG SIZE'}`);
    }
  }
  if (!allOk) {
    console.error('\nOne or more screenshots are wrong size or empty.');
    process.exit(1);
  }
  console.log('\nAll screenshots generated at exactly 1280×800.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
