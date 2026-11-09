const test = require('node:test');
const assert = require('node:assert/strict');
const { canBuyerViewOffers } = require('../utils/tendering');

test('les offres scellées restent masquées avant l’échéance', () => {
  const now = new Date('2026-10-14T10:00:00.000Z');

  assert.equal(canBuyerViewOffers({ sealedOffers: true, deadline: '2026-10-15T10:00:00.000Z' }, now), false);
  assert.equal(canBuyerViewOffers({ sealedOffers: true, deadline: '2026-10-14T09:59:59.000Z' }, now), true);
  assert.equal(canBuyerViewOffers({ sealedOffers: false, deadline: '2026-10-15T10:00:00.000Z' }, now), true);
});
