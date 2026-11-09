const test = require('node:test');
const assert = require('node:assert/strict');
const { localizeFields, requestedLanguage } = require('../utils/contentLocalization');

test('locale localization never falls back to another language', () => {
  const story = {
    title: 'العنوان',
    summary: 'ملخص عربي',
    translations: {
      fr: { title: 'Titre français', summary: 'Résumé français' }
    }
  };

  assert.equal(localizeFields(story, 'en', ['title', 'summary']), null);
  assert.deepEqual(localizeFields(story, 'fr', ['title', 'summary']), {
    title: 'Titre français',
    summary: 'Résumé français'
  });
  assert.deepEqual(localizeFields(story, 'ar', ['title', 'summary']), {
    title: 'العنوان',
    summary: 'ملخص عربي'
  });
});

test('unsupported language parameters safely select Arabic', () => {
  assert.equal(requestedLanguage('en'), 'en');
  assert.equal(requestedLanguage('fr'), 'fr');
  assert.equal(requestedLanguage('unknown'), 'ar');
});
