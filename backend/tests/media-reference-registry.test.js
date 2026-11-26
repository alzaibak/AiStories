const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../models');
const { PUBLIC_REFERENCE_FIELDS } = require('../utils/mediaCleanup');

const PUBLIC_URL_FIELD = /(cover|image|photo|banner|thumbnail|avatar|illustration|hero|social|attachment|url|file)/i;
const NOT_A_PUBLIC_URL = new Set([
  'coverAlt', 'bannerAlt', 'illustrationAlt', 'imageCredit', 'focalPoint',
  'coverVariants', 'fileStorageKey', 'previewFileKey', 'fileName',
  // Per-language ebook PDFs: private storage keys, like fileStorageKey.
  'bookFiles'
]);

function publicUrlFields(model) {
  return Object.entries(model.rawAttributes)
    .filter(([field, attribute]) => {
      const kind = attribute.type?.key;
      return ['STRING', 'TEXT', 'JSON'].includes(kind) && PUBLIC_URL_FIELD.test(field) && !NOT_A_PUBLIC_URL.has(field);
    })
    .map(([field]) => field);
}

test('every model field that can hold a public upload URL is in the cleanup registry', () => {
  const missing = [];
  for (const [modelName, model] of Object.entries(models)) {
    if (!model?.rawAttributes) continue;
    const registered = PUBLIC_REFERENCE_FIELDS[modelName] || [];
    for (const field of publicUrlFields(model)) {
      if (!registered.includes(field)) missing.push(`${modelName}.${field}`);
    }
  }
  assert.deepEqual(missing, [], `Add these fields to PUBLIC_REFERENCE_FIELDS so shared public uploads are never deleted: ${missing.join(', ')}`);
});