#!/usr/bin/env node
/**
 * i18n-pseudo
 *
 * Generates _locales/en_XA/messages.json from en by accenting letters, wrapping
 * each message in brackets, and padding length ~30%. Placeholder tokens ($name$
 * and $1..$9) are preserved. Set Chrome to the "en-XA" pseudo-locale to surface
 * untranslated (un-accented) strings and layout overflow before paying for
 * translation. Excluded from the packaged build (see package-ext.sh).
 *
 * Run via `npm run i18n:pseudo`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAP = {
  a: 'á', b: 'ḅ', c: 'ç', d: 'ḋ', e: 'é', f: 'ḟ', g: 'ḡ', h: 'ḫ', i: 'í', j: 'ĵ',
  k: 'ḳ', l: 'ḻ', m: 'ṁ', n: 'ñ', o: 'ó', p: 'ṗ', q: 'q̇', r: 'ṙ', s: 'š', t: 'ṫ',
  u: 'ú', v: 'ṽ', w: 'ẅ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ḅ', C: 'Ç', D: 'Ḋ', E: 'É', F: 'Ḟ', G: 'Ḡ', H: 'Ḫ', I: 'Í', J: 'Ĵ',
  K: 'Ḳ', L: 'Ḻ', M: 'Ṁ', N: 'Ñ', O: 'Ó', P: 'Ṗ', Q: 'Q̇', R: 'Ṙ', S: 'Š', T: 'Ṫ',
  U: 'Ú', V: 'Ṽ', W: 'Ẅ', X: 'Ẋ', Y: 'Ý', Z: 'Ž'
};

// Split out placeholder tokens so they pass through untouched.
const TOKEN = /(\$\w+\$|\$\d)/g;

function accent(text) {
  return text.split(TOKEN).map((part) => {
    if (TOKEN.test(part)) { TOKEN.lastIndex = 0; return part; }
    return part.replace(/[a-zA-Z]/g, (ch) => MAP[ch] || ch);
  }).join('');
}

function pad(text) {
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  const extra = Math.ceil(letters * 0.3);
  return extra > 0 ? `${text}${'·'.repeat(extra)}` : text;
}

const en = JSON.parse(readFileSync(join(ROOT, '_locales/en/messages.json'), 'utf8'));
const out = {};
for (const [key, entry] of Object.entries(en)) {
  out[key] = { ...entry, message: `⟦${pad(accent(entry.message))}⟧` };
}

const dir = join(ROOT, '_locales/en_XA');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'messages.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`✓ i18n-pseudo: wrote ${Object.keys(out).length} pseudo-localized messages to _locales/en_XA/messages.json`);
