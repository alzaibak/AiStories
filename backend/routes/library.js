const router = require('express').Router();
const { Op } = require('sequelize');
const {
  Book,
  Entitlement,
  MysteryBox,
  MysteryBoxPurchase,
  StoreOrder,
  StoreOrderItem,
  ReturnRequest,
  User
} = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { validateBody } = require('../middleware/validation');
const { shippingAddressSchema } = require('../middleware/storyValidation');
const policy = require('../utils/returns/policy');
const { pickDownloadable } = require('../utils/bookDownloads');
const { availableBookLanguages } = require('../utils/bookFiles');
const { READER_VISIBLE_ORDER_STATUSES } = require('../utils/orderState');

const readers = [authenticate, allowRoles('READER')];

function toMinor(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function money(minor) {
  return (Math.round(Number(minor) || 0) / 100).toFixed(2);
}

/**
 * Reader library: purchased ebooks, active rentals and mystery-box purchases.
 * Locked or expired items are returned as such, never with a download link.
 */
router.get('/me/library', ...readers, async (req, res, next) => {
  try {
    const now = new Date();
    const entitlements = await Entitlement.findAll({
      where: {
        userId: req.user.id,
        revokedAt: null,
        startsAt: { [Op.lte]: now },
        [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }]
      },
      order: [['id', 'DESC']]
    });

    const bookIds = [...new Set(entitlements
      .filter((entitlement) => ['book', 'ebook'].includes(entitlement.resourceType))
      .map((entitlement) => entitlement.resourceId))];
    const books = bookIds.length
      ? await Book.findAll({ where: { id: { [Op.in]: bookIds } }, attributes: ['id', 'slug', 'title', 'cover', 'format', 'fileStorageKey', 'bookFiles'] })
      : [];
    const bookById = new Map(books.map((book) => [book.id, book]));

    // One entry per book: the entitlement that still has a download wins, so a
    // re-bought book shows as downloadable again with its own language.
    const grouped = new Map();
    for (const entitlement of entitlements) {
      const current = grouped.get(entitlement.resourceId) || [];
      grouped.set(entitlement.resourceId, [...current, entitlement]);
    }
    const items = [...grouped.values()].map((rows) => pickDownloadable(rows)).filter(Boolean)
      .map((entitlement) => {
        const book = bookById.get(entitlement.resourceId);
        if (!book) return null;
        const downloadsRemaining = entitlement.downloadLimit === null || entitlement.downloadLimit === undefined
          ? null
          : Math.max(0, Number(entitlement.downloadLimit) - Number(entitlement.downloadCount || 0));
        return {
          entitlementId: entitlement.id,
          bookId: book.id,
          slug: book.slug,
          title: book.title,
          cover: book.cover,
          format: book.format,
          language: entitlement.contentLanguage || null,
          languages: book.format === 'ebook' ? availableBookLanguages(book) : [],
          source: entitlement.source,
          purchasedAt: entitlement.startsAt,
          expiresAt: entitlement.expiresAt,
          isRental: entitlement.source === 'rental' || Boolean(entitlement.expiresAt),
          canDownload: (entitlement.resourceType === 'ebook' || book.format === 'ebook') && (downloadsRemaining === null || downloadsRemaining > 0),
          downloadPath: `/books/${encodeURIComponent(book.slug)}/download`,
          fileAvailable: book.format === 'ebook' ? availableBookLanguages(book).length > 0 : true,
          downloadLimit: entitlement.downloadLimit,
          downloadCount: entitlement.downloadCount,
          downloadsRemaining
        };
      })
      .filter(Boolean);

    const purchases = await MysteryBoxPurchase.findAll({
      where: {
        userId: req.user.id,
        status: { [Op.in]: ['paid', 'fulfilled', 'partially_fulfilled'] }
      },
      include: [{ model: MysteryBox, as: 'box', attributes: ['id', 'title', 'translations'] }],
      order: [['id', 'DESC']],
      limit: 30
    });

    res.set('Cache-Control', 'private, no-store');
    res.json({
      ebooks: items.filter((item) => !item.isRental),
      rentals: items.filter((item) => item.isRental),
      mysteryBoxes: purchases.map((purchase) => ({
        id: purchase.id,
        boxId: purchase.boxId,
        title: purchase.box?.title || '',
        status: purchase.status,
        shippingStatus: purchase.shippingStatus,
        trackingNumber: purchase.trackingNumber,
        carrier: purchase.carrier,
        amountTotal: purchase.amountTotal,
        currency: purchase.currency,
        purchasedAt: purchase.createdAt,
        itemsFulfillment: purchase.itemsFulfillment || []
      }))
    });
  } catch (error) {
    next(error);
  }
});

/** Reader orders with fulfillment, tracking and return eligibility. */
router.get('/me/orders', ...readers, async (req, res, next) => {
  try {
    const now = new Date();
    const settings = await policy.getReturnPolicy();
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'returnsBlocked'] });
    const orders = await StoreOrder.findAll({
      // Unpaid checkout attempts never reach the account: no "pending" orders.
      where: { userId: req.user.id, status: { [Op.in]: READER_VISIBLE_ORDER_STATUSES } },
      include: [{
        model: StoreOrderItem,
        as: 'items',
        include: [{ model: Book, as: 'book', attributes: ['id', 'slug', 'title', 'cover', 'format', 'isReturnable'] }]
      }],
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    const orderIds = orders.map((order) => order.id);
    const returns = orderIds.length
      ? await ReturnRequest.findAll({
        where: { userId: req.user.id, orderId: { [Op.in]: orderIds } },
        attributes: ['id', 'orderId', 'rmaNumber', 'status', 'refundAmount', 'requestedAt'],
        order: [['id', 'DESC']]
      })
      : [];
    const returnByOrder = new Map();
    for (const request of returns) {
      if (!returnByOrder.has(request.orderId)) returnByOrder.set(request.orderId, request);
    }

    res.set('Cache-Control', 'private, no-store');
    res.json({
      returnsEnabled: settings.returnsEnabled && !user?.returnsBlocked,
      orders: orders.map((order) => {
        const items = order.items || [];
        const printItems = items.filter((item) => item.book?.format === 'print');
        const delivery = policy.resolveDeliveryDate({
          deliveredAt: order.deliveredAt,
          shippedAt: order.shippedAt,
          fallbackDays: settings.defaultDeliveryEstimateDays,
          now
        });
        const windowEndAt = delivery.date && printItems.length
          ? printItems.reduce((latest, item) => {
            const end = policy.addDays(delivery.date, policy.itemWindowDays(item, settings));
            return !latest || end > latest ? end : latest;
          }, null)
          : null;
        const hasReturnableItem = printItems.some((item) => (
          (item.isReturnable === null || item.isReturnable === undefined ? true : item.isReturnable) &&
          item.book?.isReturnable !== false
        ));
        const existingReturn = returnByOrder.get(order.id) || null;
        return {
          id: order.id,
          status: order.status,
          fulfillmentStatus: order.fulfillmentStatus,
          returnStatus: order.returnStatus,
          currency: order.currency,
          subtotal: order.subtotal,
          discountAmount: order.discountAmount,
          total: order.paidAmount ?? order.total,
          createdAt: order.createdAt,
          shippedAt: order.shippedAt,
          deliveredAt: order.deliveredAt,
          trackingNumber: order.trackingNumber,
          items: items.map((item) => ({
            id: item.id,
            bookId: item.bookId,
            title: item.titleSnapshot || item.book?.title || '',
            slug: item.book?.slug || null,
            cover: item.book?.cover || null,
            format: item.book?.format || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            pricePaidAfterDiscount: item.pricePaidAfterDiscount
          })),
          return: {
            enabled: settings.returnsEnabled && !user?.returnsBlocked,
            eligible: Boolean(
              settings.returnsEnabled && !user?.returnsBlocked &&
              order.status === 'paid' && delivery.date && hasReturnableItem &&
              windowEndAt && now <= windowEndAt
            ),
            windowEndsAt: windowEndAt,
            isPhysical: printItems.length > 0,
            existingRequest: existingReturn ? {
              id: existingReturn.id,
              rmaNumber: existingReturn.rmaNumber,
              status: existingReturn.status,
              refundAmount: existingReturn.refundAmount,
              requestedAt: existingReturn.requestedAt
            } : null
          }
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delivery address for the cart. The profile address wins; when the reader has
 * not saved one yet we fall back to the address of the latest physical order.
 * The source is returned so the cart can say where the address came from.
 */
router.get('/me/shipping-address', ...readers, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['shippingAddress'] });
    let address = user?.shippingAddress || null;
    let source = address ? 'profile' : null;
    if (!address) {
      const order = await StoreOrder.findOne({
        where: { userId: req.user.id, shippingAddress: { [Op.ne]: null } },
        attributes: ['shippingAddress'],
        order: [['createdAt', 'DESC']]
      });
      address = order?.shippingAddress || null;
      source = address ? 'order' : null;
    }
    res.set('Cache-Control', 'private, no-store');
    res.json({ address, source });
  } catch (error) {
    next(error);
  }
});

/** Saves or replaces the reader's delivery address from "Mon compte". */
router.put('/me/shipping-address', ...readers, validateBody(shippingAddressSchema), async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    await user.update({ shippingAddress: req.body });
    res.set('Cache-Control', 'private, no-store');
    res.json({ address: req.body, source: 'profile' });
  } catch (error) {
    next(error);
  }
});

/** Forgets the saved address; the cart then falls back to the last order's address. */
router.delete('/me/shipping-address', ...readers, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    await user.update({ shippingAddress: null });
    res.set('Cache-Control', 'private, no-store');
    res.json({ address: null, source: null });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.money = money;
module.exports.toMinor = toMinor;
