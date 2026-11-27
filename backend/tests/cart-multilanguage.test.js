const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { app } = require('../index');
const { Book, User, StoreCart, StoreCartItem } = require('../models');
const { hashPassword } = require('../utils/security');
const { createSessionToken } = require('../utils/sessionToken');
const { bookCheckoutSchema } = require('../middleware/storyValidation');

const suffix = crypto.randomUUID().slice(0, 8);
let server;
let baseUrl;
let book;
let reader;
let readerToken;

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

function linesOf(payload) {
  return payload.items.filter((item) => item.bookId === book.id);
}

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  book = await Book.create({
    title: `Livre trois langues ${suffix}`,
    slug: `livre-trois-langues-${suffix}`,
    translations: {},
    availabilityMode: 'digital_only',
    format: 'ebook',
    price: 4.9,
    currency: 'EUR',
    bookFiles: {
      ar: { key: `private/books/${suffix}.ar.pdf`, name: `${suffix}.ar.pdf` },
      en: { key: `private/books/${suffix}.en.pdf`, name: `${suffix}.en.pdf` },
      fr: { key: `private/books/${suffix}.fr.pdf`, name: `${suffix}.fr.pdf` }
    },
    status: 'published',
    isPublished: true
  });

  reader = await User.create({
    firstName: 'Multi', lastName: 'Reader',
    email: `cart.multilang.${suffix}@qa.test`,
    passwordHash: await hashPassword('CartTest!2026'),
    role: 'READER', status: 'ACTIVE', language: 'ar', emailVerifiedAt: new Date()
  });
  readerToken = createSessionToken(reader);
});

test.after(async () => {
  if (reader) {
    const cart = await StoreCart.findOne({ where: { userId: reader.id } }).catch(() => null);
    if (cart) await StoreCartItem.destroy({ where: { cartId: cart.id } }).catch(() => {});
    await StoreCart.destroy({ where: { userId: reader.id } }).catch(() => {});
  }
  if (book) await book.destroy().catch(() => {});
  if (reader) await reader.destroy().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('chaque langue choisie devient une ligne du panier', async () => {
  const arabic = await jsonFetch('/cart/items', {
    token: readerToken,
    method: 'POST',
    body: { bookId: book.id, format: 'ebook', language: 'ar' }
  });
  assert.equal(arabic.status, 201);
  assert.equal(linesOf(arabic.payload).length, 1);
  assert.equal(linesOf(arabic.payload)[0].language, 'ar');

  const english = await jsonFetch('/cart/items', {
    token: readerToken,
    method: 'POST',
    body: { bookId: book.id, format: 'ebook', language: 'en' }
  });
  assert.equal(english.status, 201);
  let lines = linesOf(english.payload);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((line) => line.language).sort(), ['ar', 'en']);
  assert.ok(lines.every((line) => line.format === 'ebook' && line.quantity === 1));

  const french = await jsonFetch('/cart/items', {
    token: readerToken,
    method: 'POST',
    body: { bookId: book.id, format: 'ebook', language: 'fr' }
  });
  assert.equal(french.status, 201);
  lines = linesOf(french.payload);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((line) => line.language).sort(), ['ar', 'en', 'fr']);
  assert.equal(Number(french.payload.subtotal), 14.7);
});

test('ajouter deux fois la même langue est refusé sans toucher aux autres', async () => {
  const duplicate = await jsonFetch('/cart/items', {
    token: readerToken,
    method: 'POST',
    body: { bookId: book.id, format: 'ebook', language: 'ar' }
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.payload.code, 'ALREADY_IN_CART');

  const cart = await jsonFetch('/cart', { token: readerToken });
  assert.equal(linesOf(cart.payload).length, 3);
});

test('changer une ligne vers une langue déjà présente est refusé', async () => {
  const response = await jsonFetch(`/cart/items/${book.id}?format=ebook&language=ar`, {
    token: readerToken,
    method: 'PATCH',
    body: { language: 'en' }
  });
  assert.equal(response.status, 409);
  assert.equal(response.payload.code, 'LANGUAGE_IN_CART');

  const cart = await jsonFetch('/cart', { token: readerToken });
  assert.equal(linesOf(cart.payload).length, 3);
});

test('supprimer une ligne ne retire que sa langue', async () => {
  const response = await jsonFetch(`/cart/items/${book.id}?format=ebook&language=en`, {
    token: readerToken,
    method: 'DELETE'
  });
  assert.equal(response.status, 200);
  const lines = linesOf(response.payload);
  assert.deepEqual(lines.map((line) => line.language).sort(), ['ar', 'fr']);
});

test('supprimer sans sélecteur vide le livre entier', async () => {
  const response = await jsonFetch(`/cart/items/${book.id}`, {
    token: readerToken,
    method: 'DELETE'
  });
  assert.equal(response.status, 200);
  assert.equal(linesOf(response.payload).length, 0);
});

test('la fusion du panier invité conserve les langues', async () => {
  const merged = await jsonFetch('/cart/merge', {
    token: readerToken,
    method: 'POST',
    body: {
      items: [
        { bookId: book.id, quantity: 1, format: 'ebook', language: 'ar' },
        { bookId: book.id, quantity: 1, format: 'ebook', language: 'fr' }
      ]
    }
  });
  assert.equal(merged.status, 200);
  assert.deepEqual(linesOf(merged.payload).map((line) => line.language).sort(), ['ar', 'fr']);
});

test('le paiement accepte un livre en plusieurs langues, pas la même deux fois', () => {
  const parsed = bookCheckoutSchema.safeParse({
    items: [
      { bookId: book.id, quantity: 1, format: 'ebook', language: 'ar' },
      { bookId: book.id, quantity: 1, format: 'ebook', language: 'en' }
    ]
  });
  assert.equal(parsed.success, true);

  const duplicated = bookCheckoutSchema.safeParse({
    items: [
      { bookId: book.id, quantity: 1, format: 'ebook', language: 'ar' },
      { bookId: book.id, quantity: 1, format: 'ebook', language: 'ar' }
    ]
  });
  assert.equal(duplicated.success, false);
});

