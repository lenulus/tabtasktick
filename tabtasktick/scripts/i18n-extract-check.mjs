#!/usr/bin/env node
/**
 * i18n-extract-check
 *
 * Scans source for i18n keys and asserts each exists in _locales/en/messages.json.
 *   - t('key') / t("key")              -> key must exist
 *   - tPlural('base', …)               -> base_one AND base_other must exist (en)
 *   - data-i18n[-title|-label|...]="k" -> k must exist
 *
 * Exit code 1 if any key is missing. Run via `npm run i18n:check`.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['popup', 'sidepanel', 'dashboard', 'options', 'lib', 'services', 'components'];
const SKIP = new Set(['node_modules', 'tests', 'coverage', '_locales', 'scripts']);
// The i18n helper's JSDoc contains data-i18n="key" examples; don't scan it.
const SKIP_FILES = new Set([join(ROOT, 'services', 'utils', 'i18n.js')]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (['.js', '.html'].includes(extname(full)) && !full.endsWith('.min.js') && !full.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

const en = JSON.parse(readFileSync(join(ROOT, '_locales/en/messages.json'), 'utf8'));
const enKeys = new Set(Object.keys(en));

const tKeys = new Set();
const pluralBases = new Set();

const reT = /\bt\(\s*['"`]([A-Za-z0-9_]+)['"`]/g;
const rePlural = /\btPlural\(\s*['"`]([A-Za-z0-9_]+)['"`]/g;
const reAttr = /\bdata-i18n(?:-(?:title|label|placeholder|alt))?\s*=\s*['"]([A-Za-z0-9_]+)['"]/g;

const files = SCAN_DIRS.flatMap((d) => {
  try { return walk(join(ROOT, d)); } catch { return []; }
}).filter((f) => !SKIP_FILES.has(f));

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let m;
  while ((m = rePlural.exec(src))) pluralBases.add(m[1]);
  // strip tPlural calls so the generic t() scan doesn't double-count the base
  const stripped = src.replace(rePlural, 'tPlural(');
  while ((m = reT.exec(stripped))) tKeys.add(m[1]);
  while ((m = reAttr.exec(src))) tKeys.add(m[1]);
}

const missing = [];
for (const k of tKeys) if (!enKeys.has(k)) missing.push(k);
for (const base of pluralBases) {
  for (const cat of ['one', 'other']) {
    if (!enKeys.has(`${base}_${cat}`)) missing.push(`${base}_${cat}`);
  }
}

if (missing.length) {
  console.error(`✖ i18n-extract-check: ${missing.length} key(s) used in source but missing from _locales/en/messages.json:`);
  for (const k of missing.sort()) console.error(`    - ${k}`);
  process.exit(1);
}
console.log(`✓ i18n-extract-check: all ${tKeys.size + pluralBases.size} referenced keys exist in en.`);
