# TabTaskTick i18n — Testing Guide

> Companion to [`i18n-plan.md`](./i18n-plan.md). The plan describes *what* we
> built; this doc describes *how to verify it works* before merging or shipping.
> All commands run from the `tabtasktick/` directory unless noted.

The extension uses native `chrome.i18n` + `_locales/`, so the UI language follows
the browser's locale at startup. There is **no in-app switcher** — testing in a
non-English locale means launching Chrome in that locale.

Shipping locales: `en` (source of truth), `es`, `pt_BR`, `de`, `fr`, `ja`, `ko`.
Pseudo-locale `en_XA` is generated on demand for visual coverage testing.

---

## Test in three layers

Run them in order. Each catches a different class of bug, and the cheaper ones
should be green before you bother with the more expensive ones.

| Layer | Catches | Cost |
|---|---|---|
| 1. Automated checks | Missing keys, locale drift, hardcoded strings | Seconds |
| 2. Pseudo-locale sweep | Unlocalized strings still leaking through | ~10 min manual |
| 3. Real-locale spot-check | Translation quality, layout overflow, plural/date bugs | ~20 min per locale |

---

## Layer 1 — Automated checks

```bash
cd tabtasktick

npm test                # unit tests, includes tests/i18n.test.js
npm run i18n:check      # every t('key') call has a matching key in en/messages.json
npm run i18n:parity     # all other locales have the same key set as en
npm run lint            # no-hardcoded-ui-string rule (error in Phase 4)
```

Failure modes:

- **`i18n:check` fails** → a `t('foo.bar')` call references a key that doesn't
  exist in `_locales/en/messages.json`. Add the key, then re-run.
- **`i18n:parity` fails** → a translated locale is missing keys that exist in
  `en` (or vice versa). Translators owe an update, or the script names the
  offending locale.
- **Lint fails on `no-hardcoded-ui-string`** → user-visible string somewhere
  besides a `t()` call. Wrap it in `t()` and add the key to `en/messages.json`.

All four must be green before opening a PR that touches UI strings.

---

## Layer 2 — Pseudo-locale sweep (best for catching missed strings)

The pseudo-locale converts every translated string to accented characters
(`Hello` → `[Ĥéĺĺő]`), so anything still showing in plain ASCII in the UI is
*by definition* an unlocalized string that escaped the lint rule.

### Generate the pseudo-locale

```bash
cd tabtasktick
npm run i18n:pseudo    # writes _locales/en_XA/messages.json
```

This is git-ignored; regenerate after pulling.

### Launch Chrome in `en_XA`

macOS uses the system `AppleLanguages` preference, **not** the `--lang` flag —
that flag works on Linux/Windows but is silently ignored by Chrome on macOS.

```bash
# One-shot, doesn't persist (recommended). Single dash on -AppleLanguages.
open -na "Google Chrome Dev" --args \
  -AppleLanguages '(en_XA)' \
  --user-data-dir="/tmp/chrome-dev-en_XA"
```

Quit Chrome Dev fully (`Cmd+Q`) before running, or the prefs are ignored.

Load the unpacked extension at `chrome://extensions` → Developer mode → Load
unpacked → select the `tabtasktick/` directory.

### Sweep every surface

Open each and look for any text that is **not** wrapped in `[]` and accented
characters. Those are bugs:

- Popup (extension toolbar icon)
- Side panel (every tab: Tabs, Tasks, Collections, Snoozed, History, etc.)
- Dashboard — every left-nav view (Overview, All Tabs, Groups, Snoozed,
  History, Collections, Tasks, Rules Engine, Backup & Restore)
- Options page (`chrome://extensions` → Details → Extension options)
- Modals: Snooze, Task, Note, Collection picker, Rules editor
- Context menus (right-click a tab)
- Notifications (trigger a snooze wake-up or a scheduled backup)

Common offenders:

- Strings built by concatenation (`'Closed ' + n + ' tabs'`) instead of
  `t('toast.closed', [n])` with a `$1$` placeholder
- Strings inside template literals in view modules (ESLint can't see these
  reliably — see [CLAUDE.md §ESLint](../CLAUDE.md))
- Hardcoded strings in service files that produce user-visible output
  (toasts, notifications, error messages)

---

## Layer 3 — Real-locale spot-checks

Pseudo-locale finds *coverage* bugs. Real locales find *quality* bugs:
mistranslations, layout overflow, broken plurals, wrong date formats.

### Launch Chrome in a target locale

```bash
# German — longest strings, best for catching layout overflow
open -na "Google Chrome Dev" --args -AppleLanguages '(de)' \
  --user-data-dir="/tmp/chrome-dev-de"

# Japanese — different script, best for catching font/baseline issues
open -na "Google Chrome Dev" --args -AppleLanguages '(ja)' \
  --user-data-dir="/tmp/chrome-dev-ja"

# Others: es, pt_BR, fr, ko
open -na "Google Chrome Dev" --args -AppleLanguages '(fr)' \
  --user-data-dir="/tmp/chrome-dev-fr"
```

Substitute `"Google Chrome"` for stable Chrome. Verify the bundle ID once with
`osascript -e 'id of app "Google Chrome Dev"'` if `-AppleLanguages` seems to
have no effect.

### Persistent override (if you'll be in one locale for a while)

```bash
defaults write com.google.Chrome.Dev AppleLanguages '(de)'
open -a "Google Chrome Dev"
# revert:
defaults delete com.google.Chrome.Dev AppleLanguages
```

### What to check

| Check | How |
|---|---|
| Translations actually applied | Compare against a known-English screenshot. No English fallbacks except for proper nouns ("TabTaskTick", "Chrome", "GitHub"). |
| Layout overflow | German is ~30% longer than English. Inspect buttons, table headers, dashboard nav, modal titles. Text should never clip or push other elements off-screen. |
| Plurals | Snooze "in 1 hour" vs. "in 2 hours". Trigger both. Russian/Polish-style few/many categories aren't in our locale set today but `tPlural()` should still pick `_other` when no `_one` exists. |
| Dates and numbers | Should use locale formats (`24.05.2026` in `de`, `2026/05/24` in `ja`). These come from `Intl.*`, not message strings — bugs here mean a `toLocaleString()` call is hardcoding `'en-US'`. |
| Document direction | `<html lang>` should match the active locale. Check DevTools → Elements. |

### Spot-check priority

If you only have time for one: **`de`** (longest strings, easiest to spot layout
overflow). Add **`ja`** if you've changed anything that touches fonts or text
baselines.

---

## Triage cheat sheet

| Symptom | Likely cause | Fix |
|---|---|---|
| `[Ĥéĺĺő]` shown literally in pseudo-locale | Working as intended — that string *is* localized | None |
| Plain ASCII text in pseudo-locale UI | String not wrapped in `t()` | Wrap, add key to `en/messages.json`, re-run `i18n:pseudo` |
| `t('foo.bar')` shows `foo.bar` verbatim | Key missing from `en/messages.json` | Add it; `npm run i18n:check` will confirm |
| German translation present but English in `ja` | `ja/messages.json` missing the key | `npm run i18n:parity` will name it |
| Button text clipped in `de` | CSS `width` or `max-width` too tight | Switch to `min-width` or let content size the element |
| Date shows `5/24/2026` in `de` | Hardcoded `'en-US'` in a `toLocaleDateString()` call | Pass `chrome.i18n.getUILanguage()` or omit the locale arg |
| Counts always say "1 hours" or "2 hour" | Missing `_one` / `_other` key, or using `t()` instead of `tPlural()` | Use `tPlural()` and author both categories |

---

## Before shipping

A PR that touches user-visible strings should have:

- [ ] `npm test` green
- [ ] `npm run i18n:check` green
- [ ] `npm run i18n:parity` green
- [ ] `npm run lint` green (no `no-hardcoded-ui-string` violations)
- [ ] Pseudo-locale sweep done on every surface touched by the change
- [ ] At least `de` spot-check for layout overflow if UI elements moved or resized
- [ ] Translation keys for new strings added to **all** locale files (English
      fallback is acceptable as a placeholder, but flag it for the translator)
