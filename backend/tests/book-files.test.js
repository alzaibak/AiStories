const test = require('node:test');
const assert = require('node:assert/strict');
const {
  availableBookLanguages,
  normalizeBookFiles,
  resolveBookFile
} = require('../utils/bookFiles');

test('a legacy single file counts as the Arabic version', () => {
  const book = { fileStorageKey: 'private/books/x.pdf', bookFiles: null };
  assert.deepEqual(availableBookLanguages(book), ['ar']);
  assert.deepEqual(resolveBookFile(book, 'ar'), { key: 'private/books/x.pdf', name: null, language: 'ar' });
  // Buying another language is impossible when it was never uploaded.
  assert.equal(resolveBookFile(book, 'en'), null);
});

test('only uploaded languages are offered, Arabic first', () => {
  const book = {
    fileStorageKey: null,
    bookFiles: {
      fr: { key: 'private/books/x-fr.pdf', name: 'x-fr.pdf' },
      en: { key: 'private/books/x-en.pdf', name: 'x-en.pdf' }
    }
  };
  assert.deepEqual(availableBookLanguages(book), ['en', 'fr']);
  assert.equal(resolveBookFile(book, 'fr').key, 'private/books/x-fr.pdf');
});

test('a book with no pdf offers nothing', () => {
  assert.deepEqual(availableBookLanguages({ bookFiles: {} }), []);
  assert.equal(resolveBookFile({ bookFiles: {} }, 'ar'), null);
});

test('a right without language falls back to any available version', () => {
  const book = { bookFiles: { en: 'private/books/x-en.pdf', ar: { key: 'private/books/x-ar.pdf' } } };
  assert.deepEqual(normalizeBookFiles(book).en, { key: 'private/books/x-en.pdf', name: null });
  assert.equal(resolveBookFile(book, null).language, 'ar');
  assert.equal(resolveBookFile(book, null).key, 'private/books/x-ar.pdf');
});
