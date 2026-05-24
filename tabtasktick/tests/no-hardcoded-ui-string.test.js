import { Linter } from 'eslint';
import rule from '../eslint-plugin-local/no-hardcoded-ui-string.js';

const linter = new Linter();
const config = {
  plugins: { local: { rules: { 'no-hardcoded-ui-string': rule } } },
  rules: { 'local/no-hardcoded-ui-string': 'error' },
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
};

const count = (code) => linter.verify(code, config).length;

describe('no-hardcoded-ui-string', () => {
  it('flags string assigned to textContent', () => {
    expect(count("el.textContent = 'Hello world';")).toBe(1);
  });

  it('flags innerHTML with real text', () => {
    expect(count("el.innerHTML = '<p>No active rules</p>';")).toBe(1);
  });

  it('flags setAttribute title text', () => {
    expect(count("el.setAttribute('title', 'Wake all snoozed tabs');")).toBe(1);
  });

  it('flags confirm() text', () => {
    expect(count("if (confirm('Delete this item?')) {}")).toBe(1);
  });

  it('does NOT flag t() / tPlural() values', () => {
    expect(count("el.textContent = t('popup_help');")).toBe(0);
    expect(count("el.innerHTML = `<p>${t('popup_rules_empty')}</p>`;")).toBe(0);
  });

  it('does NOT flag templates that are pure markup + interpolation', () => {
    expect(count('el.innerHTML = `<button title="${t(\'k\')}" data-id="${id}">${name}</button>`;')).toBe(0);
  });

  it('does NOT flag empty strings or CSS class assignments', () => {
    expect(count("el.innerHTML = '';")).toBe(0);
    expect(count("el.className = 'rule-item disabled';")).toBe(0);
  });

  it('does NOT flag non-UI member assignments', () => {
    expect(count("obj.action = 'getStatistics';")).toBe(0);
  });
});
