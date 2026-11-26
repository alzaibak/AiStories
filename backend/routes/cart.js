const router = require('express').Router();
const { z } = require('zod');
const { Op } = require('sequelize');
const {
  Book,
  Entitlement,
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

const readers = [authenticate, allowRoles('READER')];
const MAX_PHYSICAL_QUANTITY = Math.min(100, Math.max(1, Number(process.env.MAX_PHYSICAL_BOOKS_PER_ORDER || 20)));
const quantitySchema = z.number().int().min(1).max(MAX_PHYSICAL_QUANTITY);
const languageSchema = z.enum(['ar', 'en', 'fr']);
const cartItemSchema = z.object({
  bookId: z.number().int().positive(),
  quantity: quantitySchema.default(1),
  // Ebook PDF version the reader wants to buy.
  language: languageSchema.optional()
}).strict();
const cartUpdateSchema = z.object({ quantity: quantitySchema.optional(), language: languageSchema.optional() }).strict();
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
    include: [{ model: Book, as: 'book' }]
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

async function cartDto(cart, userId) {
  const items = (cart?.items || []).filter((item) => item.book && item.book.status !== 'archived' && (item.book.status === 'published' || item.book.isPublished === true));
  const ebookIds = items.filter((item) => item.book.format === 'ebook').map((item) => item.bookId);
  const owned = await ownedEntitlements(userId, ebookIds);
  const ownedIds = new Set(owned.map((entry) => Number(entry.resourceId)));
  const ownedLanguages = new Map();
  for (const entry of owned) {
    const id = Number(entry.resourceId);
    const list = ownedLanguages.get(id) || [];
    if (entry.contentLanguage) list.push(entry.contentLanguage);
    ownedLanguages.set(id, list);
  }
  const currency = String(items[0]?.book.currency || 'EUR').toUpperCase();
  const normalized = items.map((item) => {
    const book = item.book;
    const quantity = book.format === 'ebook' ? 1 : Math.min(item.quantity, Number(book.stockQuantity ?? item.quantity));
    const unitMinor = toMinorUnits(book.price, String(book.currency).toUpperCase());
    const languages = book.format === 'ebook' ? availableBookLanguages(book) : [];
    const language = book.format === 'ebook'
      ? (languages.includes(item.language) ? item.language : languages[0] || null)
      : null;
    return {
      id: item.id,
      bookId: book.id,
      slug: book.slug,
      title: book.title,
      cover: book.cover,
      format: book.format,
      quantity,
      unitPrice: Number(book.price),
      currency: book.currency,
      stockQuantity: book.stockQuantity,
      language,
      languages,
      // Already downloaded in that exact version: buying it again is offered on purpose.
      alreadyOwned: ownedIds.has(Number(book.id)),
      ownedLanguages: ownedLanguages.get(Number(book.id)) || [],
      available: book.format !== 'print' || book.stockQuantity === null || book.stockQuantity >= quantity,
      lineTotalMinor: unitMinor * quantity
    };
  });
  const subtotalMinor = normalized.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const hasPrint = normalized.some((item) => item.format === 'print');
  const shippingMinor = normalized.length ? shippingMinorFor(currency, hasPrint) : 0;
  return {
    id: cart?.id || null,
    items: normalized,
    itemCount: normalized.reduce((sum, item) => sum + item.quantity, 0),
    hasPhysical: hasPrint,
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

async function addItem(userId, { bookId, quantity }, req) {
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
    if (book.format === 'ebook') quantity = 1;
    if (book.format === 'print' && book.stockQuantity !== null && quantity > book.stockQuantity) {
      throw apiError(409, 'Not enough stock is available for this book.', 'OUT_OF_STOCK');
    }
    // A reader may buy an ebook again (another language, or a new download quota).
    const language = book.format === 'ebook' ? pickedLanguage(book, req.body.language) : null;
    const cart = await ensureCart(userId, transaction);
    const existing = await StoreCartItem.findOne({
      where: { cartId: cart.id, bookId: book.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existing && book.format === 'ebook') {
      if (existing.language !== language) {
        await existing.update({ language }, { transaction });
        await transaction.commit();
        return loadCart(userId);
      }
      throw apiError(409, 'This ebook is already in your cart.', 'ALREADY_IN_CART');
    }
    if (existing) {
      const next = Math.min(existing.quantity + quantity, book.stockQuantity ?? MAX_PHYSICAL_QUANTITY);
      await existing.update({ quantity: next }, { transaction });
    } else {
      await StoreCartItem.create({ cartId: cart.id, bookId: book.id, quantity, language }, { transaction });
    }
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
    res.json(await cartDto(cart, req.user.id));
  } catch (error) {
    next(error);
  }
});

router.post('/cart/items', ...readers, validateBody(cartItemSchema), async (req, res, next) => {
  try {
    const cart = await addItem(req.user.id, req.body, req);
    res.status(201).json(await cartDto(cart, req.user.id));
  } catch (error) {
    if (['ALREADY_OWNED', 'OUT_OF_STOCK', 'LANGUAGE_UNAVAILABLE', 'EBOOK_FILE_MISSING'].includes(error.code)) {
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
    const item = cart.items.find((entry) => entry.bookId === bookId);
    if (!item) return res.status(404).json({ message: 'Cart item not found.', code: 'CART_ITEM_NOT_FOUND' });
    if (item.book.format === 'ebook' && req.body.quantity !== undefined && req.body.quantity !== 1) {
      throw apiError(422, 'An ebook quantity is always 1.', 'EBOOK_QUANTITY');
    }
    if (item.book.format === 'print' && item.book.stockQuantity !== null && req.body.quantity > item.book.stockQuantity) {
      throw apiError(409, 'Not enough stock is available for this book.', 'OUT_OF_STOCK');
    }
    const values = { quantity: item.book.format === 'ebook' ? 1 : (req.body.quantity ?? item.quantity) };
    if (item.book.format === 'ebook' && req.body.language !== undefined) {
      values.language = pickedLanguage(item.book, req.body.language);
    }
    await item.update(values);
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
      await StoreCartItem.destroy({ where: { cartId: cart.id, bookId } });
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
        if (!['ALREADY_OWNED', 'ALREADY_IN_CART', 'OUT_OF_STOCK', 'BOOK_NOT_FOUND', 'LANGUAGE_UNAVAILABLE', 'EBOOK_FILE_MISSING'].includes(error.code)) throw error;
      });
    }
    res.json(await cartDto(await loadCart(req.user.id), req.user.id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
