import { jest } from '@jest/globals';
import { t, tPlural, getUILanguage, applyTranslations, localizeDocument } from '../services/utils/i18n.js';

describe('i18n helper', () => {
  describe('t()', () => {
    it('returns the localized message for a known key', () => {
      expect(t('common_save')).toBe('Save');
      expect(t('common_cancel')).toBe('Cancel');
    });

    it('returns the key itself when missing', () => {
      expect(t('this_key_does_not_exist')).toBe('this_key_does_not_exist');
    });

    it('substitutes positional placeholders', () => {
      // popup_collectionsDetail: "$active$ active, $saved$ saved" -> $1/$2
      expect(t('popup_collectionsDetail', ['3', '12'])).toBe('3 active, 12 saved');
    });
  });

  describe('tPlural()', () => {
    it('selects the singular form for count 1', () => {
      expect(tPlural('snooze_title_tabs', 1)).toBe('Snooze 1 Tab');
    });

    it('selects the plural form for other counts', () => {
      expect(tPlural('snooze_title_tabs', 3)).toBe('Snooze 3 Tabs');
      expect(tPlural('snooze_title_tabs', 0)).toBe('Snooze 0 Tabs');
    });
  });

  describe('getUILanguage()', () => {
    it('returns the mocked locale', () => {
      expect(getUILanguage()).toBe('en');
    });
  });

  describe('applyTranslations()', () => {
    it('sets textContent and attributes from data-i18n markers', () => {
      document.body.innerHTML = `
        <h2 data-i18n="common_settings">x</h2>
        <button data-i18n-title="common_close">x</button>
        <input data-i18n-placeholder="common_loading" />
      `;
      applyTranslations();
      expect(document.querySelector('h2').textContent).toBe('Settings');
      expect(document.querySelector('button').getAttribute('title')).toBe('Close');
      expect(document.querySelector('input').getAttribute('placeholder')).toBe('Loading...');
    });
  });

  describe('localizeDocument()', () => {
    it('sets <html lang> and document title', () => {
      document.body.innerHTML = '';
      localizeDocument('appName');
      expect(document.documentElement.lang).toBe('en');
      expect(document.title).toBe('TabTaskTick');
    });
  });
});
