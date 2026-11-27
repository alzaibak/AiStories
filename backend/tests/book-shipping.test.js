const test = require('node:test');
const assert = require('node:assert/strict');

const { shippingForBooks, shippingMatrixForCountry, shippingCountriesWithoutFee } = require('../utils/bookShipping');

function book(overrides = {}) {
  return {
    id: 1,
    title: 'Livre imprimé',
    format: 'print',
    availabilityMode: 'print_only',
    price: 20,
    currency: 'EUR',
    stockQuantity: 5,
    shippingCountries: ['FR', 'BE'],
    shippingFees: { FR: 5, BE: 9 },
    shippingFreeOver: null,
    ...overrides
  };
}

test('le tarif suit le pays de livraison du livre', () => {
  const items = [{ book: book(), format: 'print' }];
  assert.equal(shippingForBooks({ items, country: 'FR', currency: 'EUR', subtotalMinor: 2000 }), 500);
  assert.equal(shippingForBooks({ items, country: 'be', currency: 'EUR', subtotalMinor: 2000 }), 900);
});

test('un pays non desservi refuse la commande', () => {
  const items = [{ book: book(), format: 'print' }];
  assert.throws(
    () => shippingForBooks({ items, country: 'DE', currency: 'EUR', subtotalMinor: 2000 }),
    (error) => error.status === 409 && error.code === 'COUNTRY_NOT_ALLOWED'
  );
});

test('le seuil de gratuité annule le tarif, et le livre numérique ne paie rien', () => {
  const free = book({ shippingFreeOver: 40 });
  assert.equal(shippingForBooks({ items: [{ book: free, format: 'print' }], country: 'FR', currency: 'EUR', subtotalMinor: 4000 }), 0);
  assert.equal(shippingForBooks({ items: [{ book: free, format: 'print' }], country: 'FR', currency: 'EUR', subtotalMinor: 3000 }), 500);
  assert.equal(shippingForBooks({ items: [{ book: free, format: 'ebook' }], country: 'FR', currency: 'EUR', subtotalMinor: 800 }), 0);
});

test('plusieurs livres imprimés prennent le tarif le plus élevé', () => {
  const items = [
    { book: book({ id: 1, shippingFees: { FR: 5 } }), format: 'print' },
    { book: book({ id: 2, shippingFees: { FR: 7 } }), format: 'print' }
  ];
  assert.equal(shippingForBooks({ items, country: 'FR', currency: 'EUR', subtotalMinor: 4000 }), 700);
});

test('le panier liste les pays desservis et le tarif du pays choisi', () => {
  const lines = [{ book: book() }];
  const fr = shippingMatrixForCountry(lines, { country: 'FR', currency: 'EUR', subtotalMinor: 2000 });
  assert.deepEqual(fr.countries, ['BE', 'FR']);
  assert.deepEqual(fr.fees, { FR: 500, BE: 900 });
  assert.equal(fr.allowed, true);
  assert.equal(fr.feeMinor, 500);
  const de = shippingMatrixForCountry(lines, { country: 'DE', currency: 'EUR', subtotalMinor: 2000 });
  assert.equal(de.allowed, false);
  assert.equal(de.feeMinor, 0);
});

test('un pays doit être desservi par tous les livres papier du panier', () => {
  const lines = [
    { book: book({ id: 1, shippingCountries: ['FR', 'BE'] }) },
    { book: book({ id: 2, shippingCountries: ['FR'] }) }
  ];
  const matrix = shippingMatrixForCountry(lines, { country: 'BE', currency: 'EUR', subtotalMinor: 4000 });
  assert.deepEqual(matrix.countries, ['FR']);
  assert.equal(matrix.allowed, false);
});

test('une destination sans tarif est signalée et n’est pas proposée', () => {
  const incomplete = book({ shippingFees: { FR: 5 } });
  assert.deepEqual(shippingCountriesWithoutFee(incomplete), ['BE']);
  const matrix = shippingMatrixForCountry([{ book: incomplete }], { country: 'BE', currency: 'EUR', subtotalMinor: 2000 });
  assert.deepEqual(matrix.countries, ['FR']);
  assert.equal(matrix.allowed, false);
  assert.throws(() => shippingForBooks({
    items: [{ book: incomplete, format: 'print' }],
    country: 'BE',
    currency: 'EUR',
    subtotalMinor: 2000,
    fallbackMinor: () => 500
  }), (error) => error.code === 'SHIPPING_UNAVAILABLE');
});

test('un livre sans pays configuré garde le tarif global historique', () => {
  const legacy = book({ shippingCountries: [], shippingFees: {} });
  assert.equal(shippingForBooks({
    items: [{ book: legacy, format: 'print' }],
    country: 'DE',
    currency: 'EUR',
    subtotalMinor: 2000,
    fallbackMinor: () => 450
  }), 450);
});
