const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  offeredFormats,
  priceForFormat,
  resolvePurchaseFormat,
  cartFormatFor,
  availabilitySummary
} = require('../utils/bookAvailability');

const { app } = require('../index');
const { Book, User, StoreCart, StoreCartItem, sequelize } = require('../models');
const { hashPassword } = require('../utils/security');
const { createSessionToken } = require('../utils/sessionToken');

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

const pdf = { ar: { key: 'private/books/test.ar.pdf', name: 'test.ar.pdf' } };

function fakeBook(overrides = {}) {
  return {
    id: 1,
    title: 'Test book',
    format: 'print',
    availabilityMode: 'both',
    price: 20,
    digitalPrice: 8,
    currency: 'EUR',
    stockQuantity: 5,
    bookFiles: pdf,
    ...overrides
  };
}

test('digital_only ne propose jamais la version imprimée', () => {
  const book = fakeBook({ availabilityMode: 'digital_only', format: 'ebook', stockQuantity: null });
  assert.deepEqual(offeredFormats(book), ['ebook']);
  assert.throws(() => resolvePurchaseFormat(book, 'print'), (error) => error.code === 'PRINT_UNAVAILABLE');
  assert.equal(resolvePurchaseFormat(book, 'ebook'), 'ebook');
  assert.equal(priceForFormat(book, 'ebook'), 8);
});

test('both propose papier et PDF, avec repli du prix numérique', () => {
  const book = fakeBook();
  assert.deepEqual(offeredFormats(book), ['print', 'ebook']);
  const summary = availabilitySummary(book);
  assert.deepEqual(summary.formats, ['print', 'ebook']);
  assert.deepEqual(summary.prices, { print: 20, digital: 8 });
  assert.equal(priceForFormat(fakeBook({ digitalPrice: null }), 'ebook'), 20);
});

test('both sans PDF ne vend que la version imprimée', () => {
  const book = fakeBook({ bookFiles: null });
  assert.deepEqual(offeredFormats(book), ['print']);
  assert.equal(resolvePurchaseFormat(book, undefined), 'print');
  assert.throws(() => resolvePurchaseFormat(book, 'ebook'), (error) => error.code === 'EBOOK_FILE_MISSING');
});

test('print_only ne vend jamais le PDF, même quand un fichier existe', () => {
  const book = fakeBook({ availabilityMode: 'print_only' });
  assert.deepEqual(offeredFormats(book), ['print']);
  assert.equal(resolvePurchaseFormat(book, 'print'), 'print');
  assert.throws(() => resolvePurchaseFormat(book, 'ebook'), (error) => error.code === 'EBOOK_UNAVAILABLE');
  assert.equal(availabilitySummary(book).prices.digital, null);
  assert.deepEqual(availabilitySummary(book).formats, ['print']);

  const soldOut = fakeBook({ availabilityMode: 'print_only', stockQuantity: 0 });
  assert.deepEqual(offeredFormats(soldOut), []);
  assert.equal(cartFormatFor(book, 'ebook'), 'print');
});

test('un livre imprimé épuisé ou historique reste cohérent', () => {
  const soldOut = fakeBook({ stockQuantity: 0 });
  assert.deepEqual(offeredFormats(soldOut), ['ebook']);
  assert.throws(() => resolvePurchaseFormat(soldOut, 'print'), (error) => error.code === 'OUT_OF_STOCK');

  // Books created before the availability mode exist without the column value.
  const legacy = fakeBook({ availabilityMode: undefined, digitalPrice: undefined, bookFiles: null });
  assert.deepEqual(offeredFormats(legacy), ['print']);
  assert.equal(cartFormatFor(legacy, 'ebook'), 'print');
  assert.equal(cartFormatFor(fakeBook({ availabilityMode: 'digital_only' }), 'print'), 'ebook');
});

/* ------------------------------------------------------------------ */
/* HTTP: real routes and database                                      */
/* ------------------------------------------------------------------ */

const suffix = crypto.randomUUID().slice(0, 8);
let server;
let baseUrl;
let bothBook;
let digitalOnlyBook;
let reader;
let editor;
let readerToken;
let editorToken;
let previousShippingFee;

async function jsonFetch(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, payload };
}

test.before(async () => {
  // Printed lines need a shipping fee; keep the test independent from the local env.
  previousShippingFee = process.env.BOOK_SHIPPING_FEE;
  process.env.BOOK_SHIPPING_FEE = '5.00';
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  bothBook = await Book.create({
    title: `Livre deux formats ${suffix}`,
    slug: `livre-deux-formats-${suffix}`,
    translations: {},
    availabilityMode: 'both',
    format: 'print',
    price: 20,
    digitalPrice: 8,
    currency: 'EUR',
    stockQuantity: 5,
    weightGrams: 300,
    bookFiles: pdf,
    status: 'published',
    isPublished: true
  });
  digitalOnlyBook = await Book.create({
    title: `Livre numérique ${suffix}`,
    slug: `livre-numerique-${suffix}`,
    translations: {},
    availabilityMode: 'digital_only',
    format: 'ebook',
    price: 12,
    currency: 'EUR',
    bookFiles: pdf,
    status: 'published',
    isPublished: true
  });
  const passwordHash = await hashPassword('BookTest!2026');
  reader = await User.create({
    firstName: 'Book', lastName: 'Reader',
    email: `book.reader.${suffix}@qa.test`,
    passwordHash, role: 'READER', status: 'ACTIVE', language: 'ar', emailVerifiedAt: new Date()
  });
  editor = await User.create({
    firstName: 'Book', lastName: 'Editor',
    email: `book.editor.${suffix}@qa.test`,
    passwordHash, role: 'ADMIN', status: 'ACTIVE', language: 'ar', emailVerifiedAt: new Date()
  });
  readerToken = createSessionToken(reader);
  editorToken = createSessionToken(editor);
});

test.after(async () => {
  if (reader) {
    const cart = await StoreCart.findOne({ where: { userId: reader.id } }).catch(() => null);
    if (cart) await StoreCartItem.destroy({ where: { cartId: cart.id } }).catch(() => {});
    await StoreCart.destroy({ where: { userId: reader.id } }).catch(() => {});
  }
  for (const book of [bothBook, digitalOnlyBook]) {
    if (book) await book.destroy().catch(() => {});
  }
  for (const user of [reader, editor]) {
    if (user) await user.destroy().catch(() => {});
  }
  if (previousShippingFee === undefined) delete process.env.BOOK_SHIPPING_FEE;
  else process.env.BOOK_SHIPPING_FEE = previousShippingFee;
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('HTTP: la page livre expose les deux formats et leurs prix', async () => {
  const response = await jsonFetch(`/books/${bothBook.slug}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.payload.formats, ['print', 'ebook']);
  assert.deepEqual(response.payload.prices, { print: 20, digital: 8 });
  assert.equal(response.payload.availabilityMode, 'both');
  assert.deepEqual(response.payload.languages, ['ar']);
  assert.equal('bookFiles' in response.payload, false);
});

test('HTTP: le panier garde le format choisi et applique le bon prix', async () => {
  const print = await jsonFetch('/cart/items', {
    token: readerToken,
    method: 'POST',
    body: { bookId: bothBook.id, format: 'print', quantity: 2 }
  });
  assert.equal(print.status, 201);
  let line = print.payload.items.find((item) => item.bookId === bothBook.id);
  assert.equal(line.format, 'print');
  assert.equal(line.quantity, 2);
  assert.equal(line.unitPrice, 20);
  assert.equal(print.payload.hasPhysical, true);

  // Same book, other format: the line switches to the e-book.
  const digital = await jsonFetch('/cart/items', {
    token: readerToken,
    method: 'POST',
    body: { bookId: bothBook.id, format: 'ebook', language: 'ar' }
  });
  assert.equal(digital.status, 201);
  line = digital.payload.items.find((item) => item.bookId === bothBook.id);
  assert.equal(line.format, 'ebook');
  assert.equal(line.quantity, 1);
  assert.equal(line.unitPrice, 8);
  assert.deepEqual(line.languages, ['ar']);
  assert.equal(digital.payload.hasPhysical, false);
});

test('HTTP: une version imprimée est refusée sur un livre numérique', async () => {
  const response = await jsonFetch('/cart/items', {
    token: readerToken,
    method: 'POST',
    body: { bookId: digitalOnlyBook.id, format: 'print', quantity: 1 }
  });
  assert.equal(response.status, 409);
  assert.equal(response.payload.code, 'PRINT_UNAVAILABLE');
});

test('HTTP: un livre numérique sans PDF ne peut pas être publié, un livre mixte oui', async () => {
  const noPdf = await Book.create({
    title: `Livre sans PDF ${suffix}`,
    slug: `livre-sans-pdf-${suffix}`,
    translations: {},
    availabilityMode: 'digital_only',
    format: 'ebook',
    price: 9,
    currency: 'EUR',
    status: 'draft',
    isPublished: false
  });
  const digitalPublish = await jsonFetch(`/admin/content/books/${noPdf.id}/publish`, { token: editorToken, method: 'POST' });
  assert.equal(digitalPublish.status, 409);
  assert.equal(digitalPublish.payload.code, 'PUBLISH_REQUIREMENTS');
  assert.ok(digitalPublish.payload.missing.includes('PDF file'));

  const mixedNoPdf = await Book.create({
    title: `Livre mixte sans PDF ${suffix}`,
    slug: `livre-mixte-sans-pdf-${suffix}`,
    translations: {},
    availabilityMode: 'both',
    format: 'print',
    price: 15,
    currency: 'EUR',
    stockQuantity: 3,
    status: 'draft',
    isPublished: false
  });
  const mixedPublish = await jsonFetch(`/admin/content/books/${mixedNoPdf.id}/publish`, { token: editorToken, method: 'POST' });
  assert.equal(mixedPublish.status, 200);

  const publicMixed = await jsonFetch(`/books/${mixedNoPdf.slug}`);
  assert.deepEqual(publicMixed.payload.formats, ['print']);
  await mixedNoPdf.destroy();
  await noPdf.destroy();
});

test('HTTP: le mode d’un livre pilote le format de base enregistré', async () => {
  const response = await jsonFetch(`/admin/content/books/${digitalOnlyBook.id}`, {
    token: editorToken,
    method: 'PATCH',
    body: { availabilityMode: 'both', stockQuantity: 4 }
  });
  assert.equal(response.status, 200);
  assert.equal(response.payload.availabilityMode, 'both');
  assert.equal(response.payload.format, 'print');

  const back = await jsonFetch(`/admin/content/books/${digitalOnlyBook.id}`, {
    token: editorToken,
    method: 'PATCH',
    body: { availabilityMode: 'digital_only' }
  });
  assert.equal(back.status, 200);
  assert.equal(back.payload.format, 'ebook');
  assert.equal(back.payload.stockQuantity, null);

  const printed = await jsonFetch(`/admin/content/books/${digitalOnlyBook.id}`, {
    token: editorToken,
    method: 'PATCH',
    body: { availabilityMode: 'print_only', stockQuantity: 2, price: 18 }
  });
  assert.equal(printed.status, 200);
  assert.equal(printed.payload.availabilityMode, 'print_only');
  assert.equal(printed.payload.format, 'print');
  assert.equal(printed.payload.digitalPrice, null);

  const publicPrinted = await jsonFetch(`/books/${digitalOnlyBook.slug}`);
  assert.deepEqual(publicPrinted.payload.formats, ['print']);
  assert.equal(publicPrinted.payload.prices.digital, null);
});

test.after(async () => {
  await sequelize.close().catch(() => {});
});
