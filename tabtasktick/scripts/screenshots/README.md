# Store Screenshot Generator

Regenerates the **5 store screenshots** at exactly **1280×800** in all **7
locales** (de, en, es, fr, ja, ko, pt_BR) → 35 PNGs. Fully automated via
Playwright driving the unpacked extension.

Design rationale: [`docs/screenshot-automation-plan.md`](../../../docs/screenshot-automation-plan.md).

---

## Quick start

```bash
cd tabtasktick
npm install                      # once
npx playwright install chromium  # once (downloads the browser Playwright drives)

npm run screenshots              # all 7 locales → screenshots/<locale>/0N-*.png
npm run screenshots -- --locale=en   # just one locale (fast iteration)
```

- **Headful only** — Chrome extensions can't load headless. On macOS it "just
  works" (a window appears per locale). On Linux/CI wrap it: `xvfb-run -a npm run screenshots`.
- Output goes to `screenshots/<locale>/` which is **git-ignored** (binaries are
  CI artifacts, not committed). Each run overwrites.
- Runtime: a few minutes for all 7 (the 200-tab overview shot dominates).

## The 5 shots

| File | View | Source of data |
|---|---|---|
| `01-kanban.png` | Tasks → Kanban | seeded tasks (IndexedDB) |
| `02-collection.png` | Collection details modal w/ notes | seeded collection + folder + noted tabs (IndexedDB) |
| `03-rules.png` | Rules Engine (1 auto-group rule) | seeded rule (`addRule` message) |
| `04-snooze.png` | Snooze dialog ("Tomorrow / 9 AM") | live: real tabs selected, modal triggered |
| `05-dashboard.png` | Overview, Total Tabs = 200 | live: 200 real `data:`/https tabs opened |

## How it works

`capture.mjs` loops the 7 locales; per locale it:
1. **Builds a temp extension copy** and overwrites `_locales/en/messages.json`
   with the target locale's `messages.json`. This is the locale-forcing trick:
   Chrome resolves UI locale `en-US` → `_locales/en`, so whatever lives in that
   dir renders. **`--lang` does NOT localize extension `chrome.i18n`** (verified
   on macOS/Windows; it can help on Linux, so it's passed as a harmless extra).
2. Launches a fresh persistent context at 1280×800, reads the (non-deterministic)
   extension ID from the service-worker URL.
3. **Seeds data** (`seed.mjs`) from a `chrome-extension://…/test-page.html` page
   via dynamic `import()` of the services (IndexedDB for collections/tasks/notes),
   `addRule` message for the rule, and real tabs for shots 4 & 5.
4. Navigates to each view, waits for its container, settles fonts/animation, and
   captures `fullPage:false` (exact 1280×800). Verifies dimensions via the PNG
   IHDR; non-zero exit on any failure.

## Updating / extending

- **Change the displayed content** (task names, collection, notes, rule name):
  edit `fixtures.mjs` — `CONTENT[<locale>]`. `en` is the source; the other 6 are
  full translations (model-generated, **flag for native review before publishing**).
- **Add a locale:** add it to `_locales/`, add a `CONTENT[<locale>]` entry
  (falls back to `en` if omitted), and add it to `LOCALES` in `fixtures.mjs`.
- **Overview tab count:** `TARGET_TAB_COUNT` in `capture.mjs` (default 200).
- **Settle delay** before capture: `SETTLE_MS` in `capture.mjs`.

## Known cosmetic caveats (screenshots only)

- The snooze dialog's **date preview** ("Mon, Jun 8…") and the **native
  date/time input placeholders** render in `en-US` in the screenshots, because
  the build runs as `en-US`. They localize correctly for real non-English users
  (browser-native formatting) — not controllable from extension i18n.
- Plural categories use English rules under the `_locales/en` overwrite; visible
  counts here are large (→ `other`), so no practical effect. Running on Linux
  with `--lang` gives native plural rules if ever needed.

## Troubleshooting

- **No window / launch error:** ensure `npx playwright install chromium` ran;
  on Linux use `xvfb-run`.
- **A shot times out:** the view selector or seed may have changed — run a single
  locale (`--locale=en`) and watch the headful window; selectors live in the
  `SHOTS` array in `capture.mjs`.
- **Non-English shot shows English content:** that locale is missing a
  `CONTENT[<locale>]` entry (falling back to `en`) — add it in `fixtures.mjs`.
- **Non-English shot shows English UI chrome:** a string isn't internationalized
  in the product (route it through `t()`/`chrome.i18n` and add keys to all
  locales); confirm with `npm run i18n:check` / `npm run i18n:parity`.
