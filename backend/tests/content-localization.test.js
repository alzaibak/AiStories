const test = require('node:test');
const assert = require('node:assert/strict');
const { localizeFields, requestedLanguage } = require('../utils/contentLocalization');

test('locale localization falls back to Arabic fields when a translation is missing', () => {
  const story = {
    title: 'العنوان',
    summary: 'ملخص عربي',
    translations: {
      en: { title: 'English title', summary: '' },
      fr: { title: 'Titre français' }
    }
  };

  assert.deepEqual(localizeFields(story, 'en', ['title', 'summary']), {
    title: 'English title',
    summary: 'ملخص عربي'
  });
  assert.deepEqual(localizeFields(story, 'fr', ['title', 'summary']), {
    title: 'Titre français',
    summary: 'ملخص عربي'
  });
  assert.deepEqual(localizeFields(story, 'ar', ['title', 'summary']), {
    title: 'العنوان',
    summary: 'ملخص عربي'
  });
});

test('required text is unavailable only when Arabic and requested-language text are both empty', () => {
  const story = {
    title: '',
    summary: 'ملخص عربي',
    translations: { en: { title: '   ' } }
  };
  assert.equal(localizeFields(story, 'en', ['title', 'summary']), null);
});

test('unsupported language parameters safely select Arabic', () => {
  assert.equal(requestedLanguage('en'), 'en');
  assert.equal(requestedLanguage('fr'), 'fr');
  assert.equal(requestedLanguage('unknown'), 'ar');
});
