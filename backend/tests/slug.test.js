const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify, slugFromLocalized } = require('../utils/slug');

test('transliterates all core Arabic letters and common Persian variants', () => {
  assert.equal(
    slugify('ء ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ى ي ة'),
    'a-b-t-th-j-h-kh-d-dh-r-z-s-sh-s-d-t-z-a-gh-f-q-k-l-m-n-h-w-a-y-h'
  );
  assert.equal(slugify('پ چ ژ گ ک ی ڤ ە'), 'p-ch-zh-g-k-y-v-h');
  assert.equal(slugify('قصص الأنبياء'), 'qss-alanbya');
});

test('uses the manually entered English title when available', () => {
  assert.equal(slugFromLocalized('قصة عربية', { en: { title: 'The Cave Companions' } }), 'the-cave-companions');
});
