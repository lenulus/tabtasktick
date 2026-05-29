/**
 * @file i18n - Internationalization helper (single source of i18n logic)
 *
 * @description
 * Thin wrapper over chrome.i18n. The display language follows the browser/UI
 * locale (no in-app override). getMessage is synchronous and available in every
 * extension context (service worker, popup, side panel, dashboard, options), so
 * both UI surfaces and string-producing services use this helper.
 *
 * Degrades gracefully when chrome.i18n is unavailable (e.g. plain Node): t()
 * returns the key. Under Jest, chrome.i18n is mocked to read _locales/en so
 * tests see real English strings (see tests/utils/chrome-mock.js).
 *
 * @module services/utils/i18n
 * @architecture Utility Service. Static import only. No business logic.
 */

function i18nAvailable() {
  return typeof chrome !== 'undefined' &&
    chrome.i18n &&
    typeof chrome.i18n.getMessage === 'function';
}

/**
 * The active UI language tag (e.g. "en", "pt-BR"). Falls back to "en".
 * @returns {string}
 */
export function getUILanguage() {
  if (i18nAvailable() && typeof chrome.i18n.getUILanguage === 'function') {
    return chrome.i18n.getUILanguage();
  }
  return 'en';
}

/**
 * Get a localized message.
 * @param {string} key - message key in _locales/<locale>/messages.json
 * @param {string|string[]} [subs] - values for $1, $2 … placeholders
 * @returns {string} the localized string, or the key itself if not found
 */
export function t(key, subs) {
  if (i18nAvailable()) {
    const msg = chrome.i18n.getMessage(key, subs);
    if (msg) return msg;
  }
  return key;
}

/**
 * Plural-aware message. Selects `<keyBase>_<category>` via Intl.PluralRules for
 * the active locale (categories: zero|one|two|few|many|other), falling back to
 * `<keyBase>_other`. The count is always passed as $1; any extra substitutions
 * follow as $2, $3 …
 *
 * @param {string} keyBase - e.g. "snooze_title_tabs"
 * @param {number} count
 * @param {string|string[]} [extraSubs]
 * @returns {string}
 */
export function tPlural(keyBase, count, extraSubs) {
  const n = Number(count);
  const category = new Intl.PluralRules(getUILanguage()).select(n);
  const extras = extraSubs == null
    ? []
    : (Array.isArray(extraSubs) ? extraSubs.map(String) : [String(extraSubs)]);
  const subs = [String(count), ...extras];

  const primaryKey = `${keyBase}_${category}`;
  const msg = t(primaryKey, subs);
  if (msg !== primaryKey) return msg; // found a category-specific message
  return t(`${keyBase}_other`, subs);
}

/**
 * Apply translations to static DOM authored in HTML.
 * - [data-i18n="key"]              -> element.textContent
 * - [data-i18n-title="key"]        -> title attribute
 * - [data-i18n-label="key"]        -> aria-label attribute
 * - [data-i18n-placeholder="key"]  -> placeholder attribute
 * - [data-i18n-alt="key"]          -> alt attribute
 *
 * Uses textContent (never innerHTML) so translations cannot inject markup.
 *
 * @param {Document|HTMLElement} [root=document]
 */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });

  const attrs = ['title', 'label', 'placeholder', 'alt'];
  attrs.forEach((name) => {
    const domAttr = name === 'label' ? 'aria-label' : name;
    root.querySelectorAll(`[data-i18n-${name}]`).forEach((el) => {
      el.setAttribute(domAttr, t(el.getAttribute(`data-i18n-${name}`)));
    });
  });
}

/**
 * Set <html lang>, the document title, and apply static translations.
 * Call once from a surface's module entry after the DOM is ready.
 *
 * @param {string} [titleKey] - message key for document.title
 */
export function localizeDocument(titleKey) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = getUILanguage();
  if (titleKey) document.title = t(titleKey);
  applyTranslations();
}
