const router = require('express').Router();
const { z } = require('zod');
const { Op } = require('sequelize');
const {
  Book,
  Entitlement,
  MysteryBox,
  MysteryBoxAppearance,
  MysteryBoxItem,
  MysteryBoxPurchase,
  MysteryBoxShipping,
  StoreCart,
  StoreCartItem,
  User,
  sequelize
} = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { validateBody } = require('../middleware/validation');
const { toMinorUnits } = require('../utils/stripe');
const { logSecurityEvent } = require('../utils/securityEvents');
const { availableBookLanguages, isBookLanguage } = require('../utils/bookFiles');
const { priceForFormat, resolvePurchaseFormat, cartFormatFor } = require('../utils/bookAvailability');
const { shippingMatrixForCountry } = require('../utils/bookShipping');
const { computeMysteryBoxState, effectivePrice, isPhysicalItem, remainingStock } = require('../utils/mysteryBox');
const { ACTIVE_PURCHASE_STATUSES } = require('../utils/mysteryBoxService');

const readers = [authenticate, allowRoles('READER')];
const MAX_PHYSICAL_QUANTITY = Math.min(100, Math.max(1, Number(process.env.MAX_PHYSICAL_BOOKS_PER_ORDER || 20)));
const quantitySchema = z.number().int().min(1).max(MAX_PHYSICAL_QUANTITY);
const languageSchema = z.enum(['ar', 'en', 'fr']);
const cartItemSchema = z.object({
  bookId: z.number().int().positive().optional(),
  // A mystery box is always a single line, so it carries no format/language.
  mysteryBoxId: z.number().int().positive().optional(),
  quantity: quantitySchema.default(1),
  // Printed copy or e-book, when the book offers both.
  format: z.enum(['print', 'ebook']).optional(),
  // Ebook PDF version the reader wants to buy.
  language: languageSchema.optional()
}).strict().refine((value) => Boolean(value.bookId) !== Boolean(value.mysteryBoxId), {
  message: 'Provide exactly one of bookId or mysteryBoxId.'
});
const cartUpdateSchema = z.object({
  quantity: quantitySchema.optional(),
  format: z.enum(['print', 'ebook']).optional(),
  language: languageSchema.optional()
}).strict();
const cartMergeSchema = z.object({
  items: z.array(cartItemSchema).max(50)
}).strict();

function apiError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function shippingMinorFor(currency, hasPrint) {
  if (!hasPrint) return 0;
  const configured = process.env.BOOK_SHIPPING_FEE;
  if (configured === undefined || String(configured).trim() === '') {
    throw apiError(503, 'Book shipping is not configured.', 'SHIPPING_UNAVAILABLE');
  }
  return toMinorUnits(Number(configured), currency, { allowZero: true });
}

function money(minor) {
  return (Math.round(Number(minor) || 0) / 100).toFixed(2);
}

function includesBook() {
  return [{
    model: StoreCartItem,
    as: 'items',
    include: [
      { model: Book, as: 'book' },
      {
        model: MysteryBox,
        as: 'mysteryBox',
        include: [
          { model: MysteryBoxItem, as: 'items' },
          { model: MysteryBoxShipping, as: 'shipping' },
          { model: MysteryBoxAppearance, as: 'appearance' }
        ]
      }
    ]
  }];
}

async function ownedEntitlements(userId, bookIds) {
  if (!bookIds.length) return [];
  return Entitlement.findAll({
    where: {
      userId,
      resourceId: { [Op.in]: bookIds },
      resourceType: { [Op.in]: ['book', 'ebook'] },
      revokedAt: null,
      startsAt: { [Op.lte]: new Date() },
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }]
    },
    attributes: ['resourceId', 'contentLanguage']
  });
}

function pickedLanguage(book, requested) {
  const available = availableBookLanguages(book);
  if (!available.length) throw apiError(409, 'This ebook has no PDF file yet.', 'EBOOK_FILE_MISSING');
  if (requested && !available.includes(requested)) {
    throw apiError(422, 'This ebook is not available in the selected language.', 'LANGUAGE_UNAVAILABLE');
  }
  return isBookLanguage(requested) && available.includes(requested) ? requested : available[0];
}

function serializeMysteryBoxLine(item, box) {
  const price = effectivePrice(box);
  const state = computeMysteryBoxState(box);
  const stock = remainingStock(box);
  const requiresShipping = Boolean(box.requiresShipping);
  const requiresDigitalConsent = (box.items || []).some((entry) => !isPhysicalItem(entry));
  return {
    id: item.id,
    kind: 'mystery_box',
    bookId: null,
    mysteryBoxId: box.id,
    slug: box.slug,
    title: box.title,
    cover: box.appearance?.bannerImage || null,
    format: 'mystery_box',
    quantity: 1,
    unitPrice: price.amount,
    currency: price.currency,
    stockQuantity: stock,
    language: null,
    languages: [],
    alreadyOwned: false,
    ownedLanguages: [],
    available: state === 'active' && (stock === null || stock > 0),
    requiresShipping,
    requiresDigitalConsent,
    lineTotalMinor: toMinorUnits(price.amount, price.currency)
  };
}

async function cartDto(cart, userId, country = null) {
  const allItems = (cart?.items || []).filter((item) => item.book || item.mysteryBox);
  const boxLines = allItems
    .filter((item) => item.mysteryBox && !['draft', 'archived'].includes(item.mysteryBox.status))
    .map((item) => serializeMysteryBoxLine(item, item.mysteryBox));
  const items = allItems.filter((item) => item.book && item.book.status !== 'archived' && (item.book.status === 'published' || item.book.isPublished === true));
  const ebookIds = items
    .filter((item) => cartFormatFor(item.book, item.format) === 'ebook')
    .map((item) => item.bookId);
  const owned = await ownedEntitlements(userId, ebookIds);
  const ownedIds = new Set(owned.map((entry) => Number(entry.resourceId)));
  const ownedLanguages = new Map();
  for (const entry of owned) {
    const id = Number(entry.resourceId);
    const list = ownedLanguages.get(id) || [];
    if (entry.contentLanguage) list.push(entry.contentLanguage);
    ownedLanguages.set(id, list);
  }
  const currency = String(items[0]?.book.currency || boxLines[0]?.currency || 'EUR').toUpperCase();
  const normalized = items.map((item) => {
    const book = item.book;
    const format = cartFormatFor(book, item.format);
    const quantity = format === 'ebook' ? 1 : Math.min(item.quantity, Number(book.stockQuantity ?? item.quantity));
    const unitPrice = format ? priceForFormat(book, format) : Number(book.price);
    const unitMinor = toMinorUnits(unitPrice, String(book.currency).toUpperCase());
    const languages = format === 'ebook' ? availableBookLanguages(book) : [];
    const language = format === 'ebook'
      ? (languages.includes(item.language) ? item.language : languages[0] || null)
      : null;
    return {
      id: item.id,
      kind: 'book',
      bookId: book.id,
      mysteryBoxId: null,
      slug: book.slug,
      title: book.title,
      cover: book.cover,
      format: format || book.format,
      quantity,
      unitPrice,
      currency: book.currency,
      stockQuantity: book.stockQuantity,
      language,
      languages,
      // Already downloaded in that exact version: buying it again is offered on purpose.
      alreadyOwned: format === 'ebook' && ownedIds.has(Number(book.id)),
      ownedLanguages: ownedLanguages.get(Number(book.id)) || [],
      available: Boolean(format) && (format !== 'print' || book.stockQuantity === null || Number(book.stockQuantity) >= quantity),
      lineTotalMinor: unitMinor * quantity
    };
  });
  const lines = [...normalized, ...boxLines];
  const subtotalMinor = lines.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const hasBooks = normalized.length > 0;
  const hasPrint = normalized.some((item) => item.format === 'print');
  const hasBox = boxLines.length > 0;
  const boxNeedsShipping = boxLines.some((item) => item.requiresShipping);
  // Printed books expose their destination countries and fee for the country
  // the reader typed, so the cart shows the exact total before Stripe.
  const printLines = items.filter((item) => cartFormatFor(item.book, item.format) === 'print');
  const printSubtotalMinor = normalized
    .filter((item) => item.format === 'print')
    .reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const shippingMatrix = hasPrint
    ? shippingMatrixForCountry(printLines, { country, currency, subtotalMinor: printSubtotalMinor })
    : { legacy: false, countries: [], fees: {}, allowed: true, feeMinor: 0, country: null };
  // Legacy books (no per-country configuration) keep the global fee. A box's
  // delivery fee depends on the destination and is computed at its checkout.
  const shippingMinor = hasPrint
    ? (shippingMatrix.legacy ? shippingMinorFor(currency, true) : shippingMatrix.feeMinor || 0)
    : 0;
  return {
    id: cart?.id || null,
    items: lines,
    itemCount: lines.reduce((sum, item) => sum + item.quantity, 0),
    hasPhysical: hasPrint || boxNeedsShipping,
    hasBooks,
    hasPrint,
    hasMysteryBox: hasBox,
    shippingAtCheckout: hasBox,
    shippingLegacy: shippingMatrix.legacy,
    shippingCountries: shippingMatrix.countries,
    shippingFees: shippingMatrix.fees,
    shippingCountry: shippingMatrix.country || null,
    shippingCountryAllowed: hasPrint ? shippingMatrix.allowed : true,
    currency,
    subtotalMinor,
    shippingMinor,
    discountMinor: 0,
    totalMinor: subtotalMinor + shippingMinor,
    subtotal: money(subtotalMinor),
    shipping: money(shippingMinor),
    total: money(subtotalMinor + shippingMinor)
  };
}

/** PDF language of a stored e-book line, normalised against the current files. */
function lineLanguageOf(book, item) {
  const available = availableBookLanguages(book);
  return available.includes(item.language) ? item.language : available[0] || null;
}

/** One line per (book, format, language): the same book can hold several PDFs. */
function lineMatches(book, item, format, language) {
  if (cartFormatFor(book, item.format) !== format) return false;
  if (format !== 'ebook') return true;
  return lineLanguageOf(book, item) === language;
}

function requestedLineFilters(req) {
  const format = req.query.format === 'print' || req.query.format === 'ebook' ? req.query.format : null;
  const language = typeof req.query.language === 'string' && isBookLanguage(req.query.language)
    ? req.query.language
    : null;
  return { format, language };
}

function findCartLine(lines, { format, language }) {
  return lines.find((entry) => {
    const entryFormat = cartFormatFor(entry.book, entry.format);
    if (format && entryFormat !== format) return false;
    if (language) return entryFormat === 'ebook' && lineLanguageOf(entry.book, entry) === language;
    return true;
  }) || null;
}

async function loadCart(userId) {
  return StoreCart.findOne({ where: { userId }, include: includesBook() });
}

async function ensureCart(userId, transaction) {
  const [cart] = await StoreCart.findOrCreate({
    where: { userId },
    defaults: { userId },
    transaction
  });
  return cart;
}

async function addItem(userId, { bookId, quantity, format, language: requestedLanguage }, req) {
  const transaction = await sequelize.transaction();
  try {
    const book = await Book.findOne({
      where: {
        id: bookId,
        status: { [Op.ne]: 'archived' },
        [Op.or]: [{ status: 'published' }, { isPublished: true }]
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!book) throw apiError(404, 'Book not found.', 'BOOK_NOT_FOUND');
    // Refuses a printed copy on a digital-only book, an out-of-stock copy, etc.
    const purchaseFormat = resolvePurchaseFormat(book, format);
    if (purchaseFormat === 'ebook') quantity = 1;
    if (purchaseFormat === 'print' && book.stockQuantity !== null && quantity > book.stockQuantity) {
      throw apiError(409, 'Not enough stock is available for this book.', 'OUT_OF_STOCK');
    }
    // A reader may buy an ebook again (another language, or a new download quota).
    const contentLanguage = purchaseFormat === 'ebook' ? pickedLanguage(book, requestedLanguage) : null;
    const cart = await ensureCart(userId, transaction);
    // Books and a mystery box never share an order: the box keeps its own
    // per-person limit and stock reservation.
    const boxLine = await StoreCartItem.findOne({
      where: { cartId: cart.id, mysteryBoxId: { [Op.ne]: null } },
      transaction
    });
    if (boxLine) {
      throw apiError(409, 'A mystery box is already in your cart. Pay it before adding books.', 'MIXED_CART');
    }
    const existingLines = await StoreCartItem.findAll({
      where: { cartId: cart.id, bookId: book.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const sameLine = existingLines.find((line) => lineMatches(book, line, purchaseFormat, contentLanguage));
    if (sameLine) {
      if (purchaseFormat === 'ebook') {
        throw apiError(409, 'This ebook is already in your cart.', 'ALREADY_IN_CART');
      }
      const next = Math.min(sameLine.quantity + quantity, book.stockQuantity ?? MAX_PHYSICAL_QUANTITY);
      await sameLine.update({ quantity: next }, { transaction });
      await transaction.commit();
      return loadCart(userId);
    }
    // Historical behaviour for a book that only has one line: picking the other
    // format converts that line. Another language adds a new line instead.
    const singleLine = existingLines.length === 1 ? existingLines[0] : null;
    if (singleLine && cartFormatFor(book, singleLine.format) !== purchaseFormat) {
      await singleLine.update({ format: purchaseFormat, quantity, language: contentLanguage }, { transaction });
      await transaction.commit();
      return loadCart(userId);
    }
    await StoreCartItem.create({
      cartId: cart.id,
      bookId: book.id,
      quantity,
      format: purchaseFormat,
      language: contentLanguage
    }, { transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
  return loadCart(userId);
}

async function addMysteryBox(userId, boxId) {
  const transaction = await sequelize.transaction();
  try {
    const box = await MysteryBox.findByPk(boxId, {
      include: [
        { model: MysteryBoxItem, as: 'items' },
        { model: MysteryBoxShipping, as: 'shipping' },
        { model: MysteryBoxAppearance, as: 'appearance' }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!box || ['draft', 'archived'].includes(box.status)) {
      throw apiError(404, 'Mystery box not found.', 'BOX_NOT_FOUND');
    }
    const state = computeMysteryBoxState(box);
    if (state === 'sold_out' || (remainingStock(box) !== null && remainingStock(box) <= 0)) {
      throw apiError(409, 'This box is sold out.', 'BOX_SOLD_OUT');
    }
    if (state !== 'active') throw apiError(409, 'This box is not on sale.', 'BOX_NOT_ACTIVE');
    const limit = Math.max(1, Number(box.perUserLimit || 1));
    const paid = await MysteryBoxPurchase.count({
      where: { userId, boxId, status: { [Op.in]: ACTIVE_PURCHASE_STATUSES } },
      transaction
    });
    if (paid >= limit) {
      throw apiError(409, 'The per-person limit for this box has been reached.', 'PER_USER_LIMIT');
    }
    const cart = await ensureCart(userId, transaction);
    const lines = await StoreCartItem.findAll({ where: { cartId: cart.id }, transaction });
    if (lines.some((line) => line.bookId)) {
      throw apiError(409, 'Remove the books from your cart before adding a mystery box.', 'MIXED_CART');
    }
    if (lines.some((line) => Number(line.mysteryBoxId) === Number(boxId))) {
      throw apiError(409, 'This mystery box is already in your cart.', 'ALREADY_IN_CART');
    }
    if (lines.some((line) => line.mysteryBoxId)) {
      throw apiError(409, 'Only one mystery box can be in the cart at a time.', 'BOX_ALREADY_IN_CART');
    }
    await StoreCartItem.create({ cartId: cart.id, mysteryBoxId: box.id, quantity: 1 }, { transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
  return loadCart(userId);
}

router.get('/cart', ...readers, async (req, res, next) => {
  try {
    const cart = await loadCart(req.user.id);
    res.set('Cache-Control', 'private, no-store');
    res.json(await cartDto(cart, req.user.id, req.query.country));
  } catch (error) {
    next(error);
  }
});

router.post('/cart/items', ...readers, validateBody(cartItemSchema), async (req, res, next) => {
  try {
    const cart = req.body.mysteryBoxId
      ? await addMysteryBox(req.user.id, req.body.mysteryBoxId)
      : await addItem(req.user.id, req.body, req);
    res.status(201).json(await cartDto(cart, req.user.id));
  } catch (error) {
    if (['ALREADY_OWNED', 'OUT_OF_STOCK', 'LANGUAGE_UNAVAILABLE', 'EBOOK_FILE_MISSING', 'PER_USER_LIMIT', 'MIXED_CART', 'BOX_ALREADY_IN_CART'].includes(error.code)) {
      await logSecurityEvent(req, {
        type: 'cart_rule_blocked',
        severity: 'warning',
        reason: error.message,
        metadata: { bookId: req.body.bookId, code: error.code }
      });
    }
    next(error);
  }
});

router.patch('/cart/items/:bookId', ...readers, validateBody(cartUpdateSchema), async (req, res, next) => {
  try {
    const bookId = Number(req.params.bookId);
    if (!Number.isSafeInteger(bookId) || bookId < 1) throw apiError(400, 'Invalid book id.');
    const cart = await loadCart(req.user.id);
    if (!cart) return res.status(404).json({ message: 'Cart is empty.', code: 'CART_EMPTY' });
    // A book may hold several lines (printed copy, Arabic PDF, English PDF):
    // the caller selects one with ?format= and ?language=.
    const lines = cart.items.filter((entry) => entry.bookId === bookId);
    const filters = requestedLineFilters(req);
    const item = findCartLine(lines, filters) || (filters.format || filters.language ? null : lines[0]);
    if (!item) return res.status(404).json({ message: 'Cart item not found.', code: 'CART_ITEM_NOT_FOUND' });
    const purchaseFormat = req.body.format
      ? resolvePurchaseFormat(item.book, req.body.format)
      : cartFormatFor(item.book, item.format);
    if (purchaseFormat === 'ebook' && req.body.quantity !== undefined && req.body.quantity !== 1) {
      throw apiError(422, 'An ebook quantity is always 1.', 'EBOOK_QUANTITY');
    }
    if (purchaseFormat === 'print' && item.book.stockQuantity !== null && req.body.quantity > item.book.stockQuantity) {
      throw apiError(409, 'Not enough stock is available for this book.', 'OUT_OF_STOCK');
    }
    const language = purchaseFormat === 'ebook' ? pickedLanguage(item.book, req.body.language ?? item.language) : null;
    if (purchaseFormat === 'ebook' && language) {
      const duplicate = lines.some((entry) => entry.id !== item.id &&
        cartFormatFor(entry.book, entry.format) === 'ebook' &&
        lineLanguageOf(entry.book, entry) === language);
      if (duplicate) throw apiError(409, 'This language is already in your cart.', 'LANGUAGE_IN_CART');
    }
    const values = {
      format: purchaseFormat,
      quantity: purchaseFormat === 'ebook' ? 1 : (req.body.quantity ?? item.quantity),
      language
    };
    await item.update(values);
    res.json(await cartDto(await loadCart(req.user.id), req.user.id));
  } catch (error) {
    next(error);
  }
});

router.delete('/cart/items/mystery-box/:boxId', ...readers, async (req, res, next) => {
  try {
    const boxId = Number(req.params.boxId);
    if (!Number.isSafeInteger(boxId) || boxId < 1) throw apiError(400, 'Invalid mystery box id.');
    const cart = await loadCart(req.user.id);
    if (cart) {
      await StoreCartItem.destroy({ where: { cartId: cart.id, mysteryBoxId: boxId } });
    }
    res.json(await cartDto(await loadCart(req.user.id), req.user.id));
  } catch (error) {
    next(error);
  }
});

router.delete('/cart/items/:bookId', ...readers, async (req, res, next) => {
  try {
    const bookId = Number(req.params.bookId);
    if (!Number.isSafeInteger(bookId) || bookId < 1) throw apiError(400, 'Invalid book id.');
    const cart = await loadCart(req.user.id);
    if (cart) {
      const filters = requestedLineFilters(req);
      if (filters.format || filters.language) {
        const item = findCartLine(cart.items.filter((entry) => entry.bookId === bookId), filters);
        if (item) await item.destroy();
      } else {
        // Without a selector, the whole book leaves the cart (historical behaviour).
        await StoreCartItem.destroy({ where: { cartId: cart.id, bookId } });
      }
    }
    res.json(await cartDto(await loadCart(req.user.id), req.user.id));
  } catch (error) {
    next(error);
  }
});

router.delete('/cart', ...readers, async (req, res, next) => {
  try {
    const cart = await loadCart(req.user.id);
    if (cart) await StoreCartItem.destroy({ where: { cartId: cart.id } });
    res.json(await cartDto(null, req.user.id));
  } catch (error) {
    next(error);
  }
});

/** Guest carts hold only ids and quantities; merge them after login. */
router.post('/cart/merge', ...readers, validateBody(cartMergeSchema), async (req, res, next) => {
  try {
    for (const item of req.body.items) {
      await addItem(req.user.id, item, req).catch((error) => {
        if (!['ALREADY_OWNED', 'ALREADY_IN_CART', 'OUT_OF_STOCK', 'BOOK_NOT_FOUND', 'LANGUAGE_UNAVAILABLE', 'LANGUAGE_IN_CART', 'EBOOK_FILE_MISSING', 'PRINT_UNAVAILABLE', 'BOOK_UNAVAILABLE'].includes(error.code)) throw error;
      });
    }
    res.json(await cartDto(await loadCart(req.user.id), req.user.id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
