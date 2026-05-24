#!/usr/bin/env node
/**
 * i18n-key-parity
 *
 * Asserts every non-en locale provides en's full key set. Plural keys
 * (base_<category>) are checked against the categories each language actually
 * uses (Intl.PluralRules), so e.g. ja/ko only need *_other. en_XA (pseudo) is
 * skipped. Reports missing and extra keys; exit code 1 on missing.
 *
 * Run via `npm run i18n:parity`.
 */
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = join(ROOT, '_locales');
const PLURAL_CATS = ['zero', 'one', 'two', 'few', 'many', 'other'];
const SKIP_LOCALES = new Set(['en', 'en_XA']);

const load = (loc) => JSON.parse(readFileSync(join(LOCALES_DIR, loc, 'messages.json'), 'utf8'));
const toBCP47 = (loc) => loc.replace('_', '-');

function splitKeys(keys) {
  const plain = new Set();
  const pluralBases = new Set();
  for (const k of keys) {
    const m = k.match(/^(.*)_(zero|one|two|few|many|other)$/);
    if (m) pluralBases.add(m[1]); else plain.add(k);
  }
  return { plain, pluralBases };
}

const en = load('en');
const { plain: enPlain, pluralBases: enPluralBases } = splitKeys(Object.keys(en));

const locales = readdirSync(LOCALES_DIR).filter((l) => !SKIP_LOCALES.has(l));
let failed = false;

for (const loc of locales) {
  let msgs;
  try { msgs = load(loc); } catch { console.error(`✖ ${loc}: messages.json missing or invalid`); failed = true; continue; }
  const keys = new Set(Object.keys(msgs));
  const cats = new Intl.PluralRules(toBCP47(loc)).resolvedOptions().pluralCategories;

  const required = new Set(enPlain);
  for (const base of enPluralBases) for (const c of cats) required.add(`${base}_${c}`);

  const missing = [...required].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => {
    if (required.has(k)) return false;
    const m = k.match(/^(.*)_(zero|one|two|few|many|other)$/);
    if (m && enPluralBases.has(m[1]) && PLURAL_CATS.includes(m[2])) return false; // unused but valid category
    return true;
  });

  if (missing.length) {
    failed = true;
    console.error(`✖ ${loc}: ${missing.length} missing key(s): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`);
  }
  if (extra.length) {
    console.warn(`⚠ ${loc}: ${extra.length} extra key(s) not in en: ${extra.slice(0, 10).join(', ')}${extra.length > 10 ? ' …' : ''}`);
  }
  if (!missing.length) console.log(`✓ ${loc}: complete (${cats.join('/')})`);
}

process.exit(failed ? 1 : 0);
