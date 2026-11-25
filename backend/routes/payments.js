const express = require('express');
const { Op } = require('sequelize');
const {
  Book,
  Donation,
  DonationCampaign,
  Entitlement,
  Plan,
  PromoCode,
  PromoCodeRedemption,
  ProcessedWebhookEvent,
  RecurringDonation,
  ReturnRefund,
  ReturnRequest,
  OrderRefundApproval,
  StoreCart,
  StoreCartItem,
  StoreOrder,
  StoreOrderItem,
  StoreOrderEvent,
  StripeEvent,
  DonationTier,
  DownloadToken,
  Subscription,
  User,
  sequelize
} = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { validateBody } = require('../middleware/validation');
const schemas = require('../middleware/storyValidation');
const { subscriptionIsActive } = require('../utils/contentAccess');
const { slugFromLocalized } = require('../utils/slug');
const {
  createStripeClient,
  getClientAppUrl,
  toMinorUnits,
  mapStripeSubscriptionStatus,
  getInvoiceSubscriptionId
} = require('../utils/stripe');
const { recordAudit } = require('../utils/audit');
const { requestedLanguage } = require('../utils/contentLocalization');
const { localizePlan } = require('../utils/planLocalization');
const { sendTemplateEmail } = require('../utils/email');
const { getReturnPolicy } = require('../utils/returns/policy');
const {
  orderRefundableAmountMinor,
  requestRefundApproval,
  approveRefundApproval,
  rejectRefundApproval,
  serializeRefundApproval
} = require('../utils/refundApproval');
const {
  normalizeOrderStatus,
  canTransition,
  expectedTotalMinor,
  paymentMatchesOrder,
  makeOrderNumber
} = require('../utils/orderState');
const { logSecurityEvent } = require('../utils/securityEvents');
const { resolveDonationAmount, campaignState } = require('../utils/donations');
const { paidDonations, recomputeCampaignProgress } = require('../utils/donationService');
const {
  refundMysteryBoxPurchase,
  sendMysteryBoxPurchaseEmail,
  settleMysteryBoxPurchase
} = require('../utils/mysteryBoxService');

const router = express.Router();
const readers = [authenticate, allowRoles('READER')];
const admins = [authenticate, allowRoles('ADMIN', 'SUPER_ADMIN')];

function apiError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

async function cleanupCheckoutFailure(cleanups) {
  for (const [description, cleanup] of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      console.error(`Échec du nettoyage du checkout (${description}) :`, error);
    }
  }
}

function parseId(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw apiError(400, `${label} is invalid.`);
  return parsed;
}

function decimalFromMinor(amount) {
  return (amount / 100).toFixed(2);
}

async function sendRequiredTemplateEmail(options) {
  const sent = await sendTemplateEmail(options);
  if (!sent) throw new Error(`The active email template "${options.templateCode}" is missing a localized subject or body.`);
}

function assertTwoDecimalCurrency(currency) {
  let digits;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw apiError(400, 'The configured price currency is invalid.');
  }
  if (digits !== 2) {
    throw apiError(400, 'Only currencies with two decimal places are supported for checkout.');
  }
}

function orderItemsInclude() {
  return [{
    model: StoreOrderItem,
    as: 'items',
    include: [
      { model: Book, as: 'book', attributes: ['id', 'slug', 'title', 'cover', 'format', 'fileStorageKey'] },
      { model: Entitlement, as: 'entitlement', attributes: ['id', 'downloadLimit', 'downloadCount', 'revokedAt', 'expiresAt', 'startsAt'] }
    ]
  }];
}

async function loadOrderForUser(orderId, userId) {
  return StoreOrder.findOne({
    where: { id: orderId, userId },
    include: orderItemsInclude(),
    order: [[{ model: StoreOrderItem, as: 'items' }, 'id', 'ASC']]
  });
}

function serializeOrder(order, { admin = false, refundApproval = null } = {}) {
  const items = order.items || [];
  const downloads = items
    .filter((item) => item.book?.format === 'ebook')
    .map((item) => {
      const entitlement = item.entitlement;
      const active = entitlement && !entitlement.revokedAt &&
        (!entitlement.expiresAt || new Date(entitlement.expiresAt) > new Date());
      const limit = entitlement?.downloadLimit;
      const count = Number(entitlement?.downloadCount) || 0;
      return {
        orderItemId: item.id,
        bookId: item.book.id,
        entitlementId: entitlement?.id || null,
        slug: item.book.slug,
        title: item.titleSnapshot || item.book.title,
        cover: item.book.cover,
        canDownload: Boolean(active),
        revokedAt: entitlement?.revokedAt || null,
        downloadPath: active ? `/books/${encodeURIComponent(item.book.slug)}/download` : null,
        downloadLimit: limit ?? null,
        downloadCount: count,
        downloadsRemaining: limit === null || limit === undefined ? null : Math.max(0, Number(limit) - count)
      };
    });
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    normalizedStatus: normalizeOrderStatus(order.status),
    fulfillmentStatus: order.fulfillmentStatus,
    currency: order.currency,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    shippingAmount: order.shippingAmount,
    total: order.total,
    paidAmount: order.paidAmount,
    totalMinor: order.totalMinor,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    trackingNumber: order.trackingNumber,
    shippingAddress: order.shippingAddress || null,
    digitalConsentAt: order.digitalConsentAt,
    items: items.map((item) => ({
      id: item.id,
      bookId: item.bookId,
      title: item.titleSnapshot || item.book?.title || '',
      slug: item.book?.slug || null,
      cover: item.book?.cover || null,
      format: item.formatSnapshot || item.book?.format || null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotalMinor: item.lineTotalMinor
    })),
    downloads,
    ...(admin ? {
      customer: order.user ? {
        id: order.user.id,
        firstName: order.user.firstName,
        lastName: order.user.lastName,
        email: order.user.email
      } : null,
      stripeCheckoutSessionId: order.stripeCheckoutSessionId,
      stripePaymentIntentId: order.stripePaymentIntentId,
      refundApproval: serializeRefundApproval(refundApproval),
      events: (order.events || []).map((event) => ({
        id: event.id,
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        message: event.message,
        createdAt: event.createdAt
      }))
    } : {})
  };
}

async function reconcileOrderWithStripe(order, req, stripeClient = null) {
  if (!order?.stripeCheckoutSessionId) return { reconciled: false, reason: 'no_session' };
  if (['paid', 'fulfilled', 'refunded', 'partially_refunded'].includes(normalizeOrderStatus(order.status))) {
    return { reconciled: false, reason: 'already_settled' };
  }
  let stripe;
  try {
    stripe = stripeClient || createStripeClient();
  } catch (error) {
    if (error.status === 503) return { reconciled: false, reason: 'stripe_not_configured' };
    throw error;
  }
  const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
  await order.update({ lastStripeSyncAt: new Date() });
  if (session.status === 'expired') {
    const transaction = await sequelize.transaction();
    try {
      await settleStoreOrder(session, 'expired', transaction, { req, source: 'reconciliation' });
      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      throw error;
    }
    return { reconciled: true, status: 'expired' };
  }
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    const transaction = await sequelize.transaction();
    try {
      const result = await settleStoreOrder(session, 'paid', transaction, { req, source: 'reconciliation' });
      await transaction.commit();
      return { reconciled: Boolean(result?.settled), ...result };
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      throw error;
    }
  }
  return { reconciled: false, reason: 'not_paid_yet', stripeStatus: session.status, paymentStatus: session.payment_status };
}

async function ensureStripeCustomer(user, stripe) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    metadata: { userId: String(user.id) }
  }, { idempotencyKey: `reader-${user.id}-customer` });
  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
}

function configuredShippingFee(currency) {
  const rawFee = process.env.BOOK_SHIPPING_FEE;
  if (rawFee === undefined || rawFee.trim() === '') {
    throw apiError(503, 'Book shipping is not configured.', 'SHIPPING_UNAVAILABLE');
  }
  const fee = Number(rawFee);
  if (!Number.isFinite(fee) || fee < 0) {
    throw new Error('BOOK_SHIPPING_FEE must be a non-negative amount.');
  }
  return toMinorUnits(fee, currency, { allowZero: true });
}

async function reservePromoCode({ code, userId, scope, currency, amountMinor, bookIds, planId, orderId, subscriptionId }) {
  if (!code) return null;
  const transaction = await sequelize.transaction();
  try {
    const normalizedCode = String(code).trim().toUpperCase();
    const promo = await PromoCode.findOne({
      where: { code: normalizedCode },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const now = new Date();
    if (!promo || !promo.isActive ||
      promo.startsAt && promo.startsAt > now ||
      promo.endsAt && promo.endsAt <= now ||
      promo.maxUses !== null && promo.maxUses !== undefined && promo.usedCount >= promo.maxUses) {
      throw apiError(400, 'This promotion code is invalid or unavailable.', 'PROMO_CODE_INVALID');
    }
    if (promo.kind === 'gift') throw apiError(400, 'Gift codes must be redeemed from your account.', 'GIFT_CODE_REDEEM_REQUIRED');
    if (promo.appliesTo !== 'all' && promo.appliesTo !== `${scope}s`) {
      throw apiError(400, 'This code does not apply to this type of purchase.', 'PROMO_CODE_NOT_APPLICABLE');
    }
    if (scope === 'book' && promo.applicableBookIds?.length &&
      bookIds.some((bookId) => !promo.applicableBookIds.includes(bookId))) {
      throw apiError(400, 'This code does not apply to every book in the order.', 'PROMO_CODE_NOT_APPLICABLE');
    }
    if (scope === 'plan' && promo.applicablePlanIds?.length && !promo.applicablePlanIds.includes(planId)) {
      throw apiError(400, 'This code does not apply to this subscription plan.', 'PROMO_CODE_NOT_APPLICABLE');
    }
    if (promo.kind === 'fixed' && String(promo.currency).toUpperCase() !== currency) {
      throw apiError(400, 'This code is not valid for the selected currency.', 'PROMO_CODE_CURRENCY_MISMATCH');
    }
    const userRedemptions = await PromoCodeRedemption.count({
      where: { promoCodeId: promo.id, userId, status: { [Op.in]: ['pending', 'redeemed'] } },
      transaction
    });
    if (userRedemptions >= promo.perUserLimit) {
      throw apiError(409, 'You have already used this code the maximum number of times.', 'PROMO_CODE_LIMIT_REACHED');
    }

    const configuredAmount = promo.kind === 'percentage'
      ? Math.round(amountMinor * Number(promo.value) / 100)
      : toMinorUnits(promo.value, currency);
    const discountMinor = Math.min(amountMinor, configuredAmount);
    if (!Number.isSafeInteger(discountMinor) || discountMinor < 1) {
      throw apiError(400, 'The promotion does not produce a valid discount.', 'PROMO_CODE_INVALID');
    }
    const redemption = await PromoCodeRedemption.create({
      promoCodeId: promo.id,
      userId,
      orderId: orderId || null,
      subscriptionId: subscriptionId || null,
      status: 'pending',
      amountDiscounted: decimalFromMinor(discountMinor)
    }, { transaction });
    await promo.update({ usedCount: promo.usedCount + 1 }, { transaction });
    await transaction.commit();
    return { promo, redemption, discountMinor, amountMinor };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function releasePromoRedemption(redemptionId, transaction) {
  const ownsTransaction = !transaction;
  const currentTransaction = transaction || await sequelize.transaction();
  try {
    const redemption = await PromoCodeRedemption.findByPk(redemptionId, {
      transaction: currentTransaction,
      lock: currentTransaction.LOCK.UPDATE
    });
    if (redemption?.status === 'pending') {
      const promo = await PromoCode.findByPk(redemption.promoCodeId, {
        transaction: currentTransaction,
        lock: currentTransaction.LOCK.UPDATE
      });
      await redemption.update({ status: 'released' }, { transaction: currentTransaction });
      if (promo) await promo.update({ usedCount: Math.max(0, promo.usedCount - 1) }, { transaction: currentTransaction });
    }
    if (ownsTransaction) await currentTransaction.commit();
  } catch (error) {
    if (ownsTransaction && !currentTransaction.finished) await currentTransaction.rollback();
    throw error;
  }
}

async function finalizePromoRedemption(redemptionId, sessionId, transaction) {
  const redemption = await PromoCodeRedemption.findByPk(redemptionId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (redemption?.status === 'pending') {
    await redemption.update({ status: 'redeemed', stripeCheckoutSessionId: sessionId }, { transaction });
  }
}

async function createStripePromoCoupon(stripe, reservation) {
  const { promo, redemption, amountMinor } = reservation;
  const coupon = {
    name: promo.code,
    duration: 'once',
    max_redemptions: 1
  };
  if (promo.kind === 'percentage') coupon.percent_off = Number(promo.value);
  else {
    coupon.amount_off = Math.min(toMinorUnits(promo.value, String(promo.currency).toUpperCase()), amountMinor);
    coupon.currency = String(promo.currency).toLowerCase();
  }
  return stripe.coupons.create(coupon, { idempotencyKey: `promo-redemption-${redemption.id}` });
}

async function recordOrderEvent(order, type, values = {}, transaction) {
  if (!order) return null;
  return StoreOrderEvent.create({
    orderId: order.id,
    type,
    fromStatus: values.fromStatus ?? null,
    toStatus: values.toStatus ?? null,
    message: values.message ?? null,
    metadata: values.metadata || {}
  }, { transaction });
}

async function failPendingOrder(orderId, finalStatus = 'failed') {
  const transaction = await sequelize.transaction();
  try {
    const order = await StoreOrder.findByPk(orderId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (order && ['pending', 'pending_payment'].includes(order.status)) {
      await restoreOrderInventory(order.id, transaction);
      await order.update({
        status: finalStatus,
        ...(finalStatus === 'expired' ? { expiresAt: new Date() } : { canceledAt: new Date() })
      }, { transaction });
      await recordOrderEvent(order, `order_${finalStatus}`, {
        fromStatus: order.status,
        toStatus: finalStatus
      }, transaction);
    }
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function createPendingOrder({ userId, items, shippingAddress, customerEmail, digitalConsent = false, idempotencyKey = null, req = null }) {
  const transaction = await sequelize.transaction();
  try {
    const requestedIds = items.map((item) => item.bookId);
    const books = await Book.findAll({
      where: {
        id: { [Op.in]: requestedIds },
        status: { [Op.ne]: 'archived' },
        [Op.or]: [{ status: 'published' }, { isPublished: true }]
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (books.length !== items.length) {
      throw apiError(404, 'One or more books are no longer available.');
    }

    const byId = new Map(books.map((book) => [book.id, book]));
    const ebookIds = books.filter((book) => book.format === 'ebook').map((book) => book.id);
    if (ebookIds.length) {
      const owned = await Entitlement.findAll({
        where: {
          userId,
          resourceId: { [Op.in]: ebookIds },
          resourceType: { [Op.in]: ['book', 'ebook'] },
          revokedAt: null,
          startsAt: { [Op.lte]: new Date() },
          [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }]
        },
        attributes: ['resourceId', 'downloadLimit', 'downloadCount'],
        transaction
      });
      const stillUsable = owned.some((entitlement) =>
        entitlement.downloadLimit === null ||
        entitlement.downloadLimit === undefined ||
        Number(entitlement.downloadCount || 0) < Number(entitlement.downloadLimit)
      );
      if (stillUsable) {
        throw apiError(409, 'An e-book in this order is already in your library.', 'ALREADY_OWNED');
      }
    }
    const orderItems = items.map(({ bookId, quantity }) => {
      const book = byId.get(bookId);
      if (book.format === 'ebook' && quantity !== 1) {
        throw apiError(400, 'An e-book can only be purchased once per order.');
      }
      if (book.format === 'print' && book.stockQuantity !== null && book.stockQuantity < quantity) {
        throw apiError(409, `Not enough stock is available for "${book.title}".`, 'OUT_OF_STOCK');
      }
      const currency = String(book.currency).toUpperCase();
      assertTwoDecimalCurrency(currency);
      const unitAmount = toMinorUnits(book.price, currency);
      return { book, quantity, currency, unitAmount };
    });
    const currency = orderItems[0].currency;
    if (orderItems.some((item) => item.currency !== currency)) {
      throw apiError(400, 'All books in an order must use the same currency.');
    }

    const containsPrint = orderItems.some((item) => item.book.format === 'print');
  if (containsPrint && !shippingAddress) {
      throw apiError(400, 'A shipping address is required for printed books.');
    }
    if (!containsPrint && shippingAddress) {
      throw apiError(400, 'A shipping address is not required for digital books.');
    }
  if (orderItems.some((item) => item.book.format === 'ebook') && !digitalConsent) {
    throw apiError(422, 'Digital content consent is required before checkout.', 'DIGITAL_CONSENT_REQUIRED');
  }
    const subtotalMinor = orderItems.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
    const shippingMinor = containsPrint ? configuredShippingFee(currency) : 0;
    const totalMinor = subtotalMinor + shippingMinor;
    if (!Number.isSafeInteger(totalMinor)) throw apiError(400, 'The order total is too large.');

    for (const item of orderItems) {
      if (item.book.format === 'print' && item.book.stockQuantity !== null) {
        item.book.stockQuantity -= item.quantity;
        await item.book.save({ transaction });
      }
    }

    const order = await StoreOrder.create({
      userId,
      status: 'pending_payment',
      customerEmail: customerEmail || null,
      currency,
      subtotal: decimalFromMinor(subtotalMinor),
      subtotalMinor,
      discountMinor: 0,
      shippingMinor,
      shippingAmount: decimalFromMinor(shippingMinor),
      taxMinor: 0,
      totalMinor,
      total: decimalFromMinor(totalMinor),
      shippingAddress: shippingAddress || null,
      idempotencyKey: idempotencyKey || null,
      digitalConsentAt: digitalConsent ? new Date() : null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }, { transaction });
    await order.update({ orderNumber: makeOrderNumber(order.id) }, { transaction });
    await recordOrderEvent(order, 'order_created', {
      toStatus: 'pending_payment',
      message: 'Order created before Stripe Checkout.',
      metadata: { containsPrint, shippingMinor, totalMinor }
    }, transaction);
    const returnsSettings = await getReturnPolicy();
    await StoreOrderItem.bulkCreate(orderItems.map((item) => {
      const isPrint = item.book.format === 'print';
      const grossMinor = item.unitAmount * item.quantity;
      return {
        orderId: order.id,
        bookId: item.book.id,
        quantity: item.quantity,
        unitPrice: item.book.price,
        lineTotalMinor: item.unitAmount * item.quantity,
        formatSnapshot: item.book.format,
        titleSnapshot: item.book.title,
        isReturnable: isPrint && item.book.isReturnable !== false,
        returnWindowDays: isPrint ? (item.book.returnWindowDays || returnsSettings.defaultReturnWindowDays) : null,
        legalWithdrawalDays: isPrint ? returnsSettings.legalWithdrawalDays : null,
        definedShippingFee: isPrint ? decimalFromMinor(shippingMinor) : null,
        shippingFeeCharged: isPrint ? decimalFromMinor(shippingMinor) : null,
        pricePaidAfterDiscount: decimalFromMinor(grossMinor)
      };
    }), { transaction });
    await transaction.commit();
    return { order, orderItems, shippingMinor };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError' && idempotencyKey) {
      const existing = await StoreOrder.findOne({ where: { userId, idempotencyKey } });
      if (existing) {
        const existingItems = await StoreOrderItem.findAll({ where: { orderId: existing.id }, include: [{ model: Book, as: 'book' }] });
        return {
          order: existing,
          orderItems: existingItems.map((item) => ({ book: item.book, quantity: item.quantity, currency: existing.currency })),
          shippingMinor: Number(existing.shippingMinor) || 0,
          idempotentReplay: true
        };
      }
    }
    throw error;
  }
}

async function restoreOrderInventory(orderId, transaction) {
  const items = await StoreOrderItem.findAll({ where: { orderId }, transaction });
  for (const item of items) {
    const book = await Book.findByPk(item.bookId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (book?.format === 'print' && book.stockQuantity !== null) {
      book.stockQuantity += item.quantity;
      await book.save({ transaction });
    }
  }
}

async function clearPurchasedCartItems(userId, bookIds, transaction) {
  const ids = [...new Set(bookIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return;
  const cart = await StoreCart.findOne({ where: { userId }, transaction });
  if (!cart) return;
  await StoreCartItem.destroy({
    where: { cartId: cart.id, bookId: { [Op.in]: ids } },
    transaction
  });
}

async function settleStoreOrder(session, status, transaction, { req = null, source = 'stripe' } = {}) {
  const orderId = Number(session.metadata?.orderId || session.client_reference_id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    throw new Error('Stripe Checkout session is missing its order reference.');
  }
  const order = await StoreOrder.findByPk(orderId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!order) throw new Error(`Store order ${orderId} for Stripe Checkout session was not found.`);
  const fromStatus = normalizeOrderStatus(order.status);

  if (status !== 'paid') {
    if (!['pending_payment'].includes(fromStatus)) return false;
    const finalStatus = status === 'canceled' || status === 'cancelled' ? 'canceled' : status === 'expired' ? 'expired' : 'failed';
    if (!canTransition(fromStatus, finalStatus)) return false;
    await restoreOrderInventory(order.id, transaction);
    await order.update({
      status: finalStatus,
      stripeCheckoutSessionId: session.id || order.stripeCheckoutSessionId,
      ...(finalStatus === 'expired' ? { expiresAt: new Date() } : { canceledAt: new Date() })
    }, { transaction });
    await recordOrderEvent(order, `stripe_session_${finalStatus}`, {
      fromStatus,
      toStatus: finalStatus,
      metadata: { source, sessionId: session.id }
    }, transaction);
    return { settled: true, status: finalStatus };
  }

  if (['paid', 'fulfilled'].includes(fromStatus)) return { settled: false, alreadyPaid: true };
  if (fromStatus === 'amount_mismatch' && !session.amount_total) return { settled: false };
  if (!['pending_payment', 'amount_mismatch'].includes(fromStatus)) return false;

  if (!order.totalMinor && order.total !== null && order.total !== undefined) {
    order.totalMinor = Math.round(Number(order.total) * 100);
  }
  const verification = paymentMatchesOrder(session, order);
  if (!verification.matches) {
    await order.update({
      status: 'amount_mismatch',
      stripeCheckoutSessionId: session.id || order.stripeCheckoutSessionId,
      stripePaymentIntentId: typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || order.stripePaymentIntentId,
      lastStripeSyncAt: new Date()
    }, { transaction });
    await recordOrderEvent(order, 'amount_mismatch', {
      fromStatus,
      toStatus: 'amount_mismatch',
      message: verification.reason,
      metadata: {
        expected: verification.expected ?? order.totalMinor ?? null,
        actual: verification.actual ?? null,
        expectedCurrency: verification.expectedCurrency ?? order.currency,
        actualCurrency: verification.actualCurrency ?? null,
        source
      }
    }, transaction);
    await logSecurityEvent(req || {}, {
      type: 'payment_amount_mismatch',
      severity: 'critical',
      reason: `Order ${order.id} payment did not match the server total (${verification.reason}).`,
      metadata: {
        orderId: order.id,
        expected: verification.expected ?? null,
        actual: verification.actual ?? null,
        source
      },
      userId: order.userId
    });
    return { settled: false, amountMismatch: true, reason: verification.reason };
  }

  const values = {
    status: 'paid',
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null,
    paidAmount: decimalFromMinor(session.amount_total),
    paidAt: new Date(),
    lastStripeSyncAt: new Date()
  };
  await order.update(values, { transaction });
  await recordOrderEvent(order, 'payment_paid', {
    fromStatus,
    toStatus: 'paid',
    metadata: { source, amountMinor: session.amount_total, currency: String(session.currency || order.currency).toUpperCase() }
  }, transaction);

  const items = await StoreOrderItem.findAll({
    where: { orderId: order.id },
    include: [{ model: Book, as: 'book', attributes: ['id', 'format'] }],
    transaction
  });
  const hasPrint = items.some((item) => item.book?.format === 'print');
  for (const item of items) {
    if (item.book?.format !== 'ebook') continue;
    const entitlement = await Entitlement.findOne({
      where: { orderItemId: item.id },
      transaction
    });
    if (!entitlement) {
      await Entitlement.create({
        userId: order.userId,
        orderItemId: item.id,
        resourceType: 'book',
        resourceId: item.bookId,
        source: 'purchase',
        startsAt: new Date(),
        expiresAt: null,
        downloadCount: 0,
        downloadLimit: 1
      }, { transaction });
    }
  }
  await clearPurchasedCartItems(order.userId, items.map((item) => item.bookId), transaction);
  if (!hasPrint) {
    await order.update({ fulfillmentStatus: 'delivered', status: 'fulfilled' }, { transaction });
    await recordOrderEvent(order, 'fulfilled', {
      fromStatus: 'paid',
      toStatus: 'fulfilled',
      message: 'Digital-only order fulfilled immediately.'
    }, transaction);
  }
  return { settled: true, status: 'paid', order };
}

function subscriptionDates(stripeSubscription, status) {
  const periodEnd = stripeSubscription.current_period_end
    ? new Date(stripeSubscription.current_period_end * 1000)
    : null;
  const graceDays = Number(process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS || 3);
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 30) {
    throw new Error('SUBSCRIPTION_GRACE_PERIOD_DAYS must be between 0 and 30.');
  }
  return {
    startedAt: stripeSubscription.start_date ? new Date(stripeSubscription.start_date * 1000) : null,
    expiresAt: periodEnd,
    gracePeriodEndsAt: status === 'past_due'
      ? new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)
      : null,
    cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end)
  };
}

async function syncStripeSubscription(stripeSubscription, transaction) {
  const mappedStatus = mapStripeSubscriptionStatus(stripeSubscription.status);
  const metadataId = Number(stripeSubscription.metadata?.subscriptionId);
  let subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: stripeSubscription.id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!subscription && Number.isSafeInteger(metadataId) && metadataId > 0) {
    subscription = await Subscription.findByPk(metadataId, { transaction, lock: transaction.LOCK.UPDATE });
  }
  if (!subscription) return;

  const customerId = typeof stripeSubscription.customer === 'string'
    ? stripeSubscription.customer
    : stripeSubscription.customer?.id;
  await subscription.update({
    stripeSubscriptionId: stripeSubscription.id,
    stripeCustomerId: customerId || subscription.stripeCustomerId,
    status: mappedStatus,
    ...subscriptionDates(stripeSubscription, mappedStatus)
  }, { transaction });
  if (customerId) {
    await User.update(
      { stripeCustomerId: customerId },
      { where: { id: subscription.userId }, transaction }
    );
  }
}

async function syncInvoiceStatus(invoice, status, transaction) {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;
  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!subscription) return;
  const graceDays = Number(process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS || 3);
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 30) {
    throw new Error('SUBSCRIPTION_GRACE_PERIOD_DAYS must be between 0 and 30.');
  }

  function recurringDonationStatus(stripeStatus) {
    if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
    if (stripeStatus === 'past_due' || stripeStatus === 'unpaid' || stripeStatus === 'paused') return 'past_due';
    if (stripeStatus === 'canceled') return 'canceled';
    if (stripeStatus === 'incomplete_expired') return 'expired';
    return 'pending';
  }

  async function syncRecurringStripeSubscription(stripeSubscription, transaction) {
    let record = await RecurringDonation.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const metadataId = Number(stripeSubscription.metadata?.recurringDonationId);
    if (!record && Number.isSafeInteger(metadataId) && metadataId > 0) {
      record = await RecurringDonation.findByPk(metadataId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
    }
    if (!record) return;
    const customerId = typeof stripeSubscription.customer === 'string'
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id;
    await record.update({
      stripeSubscriptionId: stripeSubscription.id,
      status: recurringDonationStatus(stripeSubscription.status),
      cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
      stripeCustomerId: customerId || record.stripeCustomerId
    }, { transaction });
  }

  async function recordRecurringDonationInvoice(invoice, transaction) {
    const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
    if (!stripeSubscriptionId) return null;
    const record = await RecurringDonation.findOne({
      where: { stripeSubscriptionId },
      include: [{ model: User, as: 'user', attributes: ['id', 'email', 'firstName', 'language'] },
        { model: DonationCampaign, as: 'campaign', attributes: ['slug', 'translations'] }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!record) return null;
    const currency = String(invoice.currency || record.currency).toUpperCase();
    assertTwoDecimalCurrency(currency);
    const amountMinor = Number(invoice.amount_paid);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw new Error(`Stripe invoice ${invoice.id} has an invalid paid amount.`);
    }
    const paymentIntentId = typeof invoice.payment_intent === 'string'
      ? invoice.payment_intent
      : invoice.payment_intent?.id || null;
    const campaignForUnits = record.campaignId ? await DonationCampaign.findByPk(record.campaignId, { transaction }) : null;
    const costMinor = campaignForUnits?.costPerUnit
      ? toMinorUnits(campaignForUnits.costPerUnit, currency, { allowZero: true })
      : 0;
    const units = costMinor > 0 ? Math.floor(amountMinor / costMinor) : 0;
    const [donation, created] = await Donation.findOrCreate({
      where: { stripeInvoiceId: invoice.id },
      defaults: {
        campaignId: record.campaignId,
        recurringDonationId: record.id,
        userId: record.userId,
        amount: decimalFromMinor(amountMinor),
        currency,
        unitsSponsored: units,
        isRecurring: true,
        source: 'stripe',
        status: 'paid',
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: paymentIntentId
      },
      transaction
    });
    await record.update({ status: 'active' }, { transaction });
    if (created && record.campaignId) await recomputeCampaignProgress(record.campaignId, transaction);
    return created ? { donation, recurringDonation: record } : null;
  }

  async function failRecurringDonationInvoice(invoice, transaction) {
    const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
    if (!stripeSubscriptionId) return;
    await RecurringDonation.update({ status: 'past_due' }, {
      where: { stripeSubscriptionId, status: { [Op.in]: ['active', 'past_due'] } },
      transaction
    });
  }

  await subscription.update({
    status,
    gracePeriodEndsAt: status === 'past_due'
      ? new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)
      : null
  }, { transaction });
}

async function setSubscriptionRenewal(subscription, cancelAtPeriodEnd) {
  if (!subscription.stripeSubscriptionId) {
    throw apiError(409, 'This subscription is not managed by Stripe.');
  }
  const updated = await createStripeClient().subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: cancelAtPeriodEnd
  });
  await subscription.update({
    cancelAtPeriodEnd,
    expiresAt: updated.current_period_end ? new Date(updated.current_period_end * 1000) : subscription.expiresAt
  });
}

async function refundStoreOrder(charge, transaction) {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!charge.refunded || !paymentIntentId) return;
  const refundedMinor = Number(charge.amount_refunded) || 0;
  const chargedMinor = Number(charge.amount) || 0;
  const fullRefund = chargedMinor > 0 && refundedMinor >= chargedMinor;
  const affectedDonations = await Donation.findAll({
    where: { stripePaymentIntentId: paymentIntentId, status: 'paid' },
    attributes: ['id', 'campaignId'],
    transaction
  });
  await Donation.update({ status: 'refunded' }, {
    where: { stripePaymentIntentId: paymentIntentId, status: 'paid' },
    transaction
  });
  for (const campaignId of new Set(affectedDonations.map((donation) => donation.campaignId).filter(Boolean))) {
    await recomputeCampaignProgress(campaignId, transaction);
  }
  const order = await StoreOrder.findOne({
    where: { stripePaymentIntentId: paymentIntentId, status: { [Op.in]: ['paid', 'fulfilled', 'partially_refunded'] } },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!order) return;
  const fromStatus = normalizeOrderStatus(order.status);
  const nextStatus = fullRefund ? 'refunded' : 'partially_refunded';
  await order.update({ status: nextStatus, lastStripeSyncAt: new Date() }, { transaction });
  await recordOrderEvent(order, fullRefund ? 'payment_refunded' : 'payment_partially_refunded', {
    fromStatus,
    toStatus: nextStatus,
    metadata: { refundedMinor, chargedMinor, chargeId: charge.id }
  }, transaction);
  if (!fullRefund) return;
  const orderItems = await StoreOrderItem.findAll({
    where: { orderId: order.id },
    attributes: ['id'],
    transaction
  });
  if (orderItems.length) {
    await Entitlement.update({ revokedAt: new Date() }, {
      where: {
        orderItemId: { [Op.in]: orderItems.map((item) => item.id) },
        revokedAt: null
      },
      transaction
    });
  }
}

async function syncReturnRefund(refund, transaction) {
  if (!refund?.id) return;
  const row = await ReturnRefund.findOne({
    where: { stripeRefundId: refund.id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!row) return;
  const status = refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' ? 'failed' : 'pending';
  const values = {
    status,
    failureReason: status === 'failed' ? String(refund.failure_reason || 'Stripe refund failed').slice(0, 1000) : null
  };
  if (status === 'succeeded' && !row.issuedAt) values.issuedAt = new Date();
  await row.update(values, { transaction });

  const request = await ReturnRequest.findByPk(row.returnRequestId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!request) return;
  if (status === 'succeeded') {
    await request.update({ status: 'refunded', refundedAt: values.issuedAt || request.refundedAt || new Date() }, { transaction });
    if (request.orderId) {
      await StoreOrder.update({ returnStatus: 'completed' }, { where: { id: request.orderId }, transaction });
    }
  } else if (status === 'failed' && request.status === 'refund_pending') {
    await request.update({ status: 'inspected' }, { transaction });
  }
}

async function handleStripeEvent(event, transaction, postCommitActions = [], req = null) {
  const object = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (object.mode === 'payment' && object.metadata?.orderId &&
        ['paid', 'no_payment_required'].includes(object.payment_status)) {
        const orderSettled = await settleStoreOrder(object, 'paid', transaction, { req: req || null, source: 'webhook' });
        const orderId = Number(object.metadata.orderId);
        if (orderSettled?.settled) postCommitActions.push(['order confirmation', async () => {
          const order = await StoreOrder.findByPk(orderId);
          if (!order) throw new Error(`Store order ${orderId} was not found after its payment was committed.`);
          const user = await User.findByPk(order.userId);
          if (!user) throw new Error(`The reader for store order ${orderId} was not found.`);
          await sendRequiredTemplateEmail({
            templateCode: 'order_confirmation',
            to: user.email,
            language: requestedLanguage(user.language),
            variables: {
              firstName: user.firstName,
              orderId: order.id,
              total: order.total,
              currency: order.currency
            },
            purpose: 'order confirmation'
          });
        }]);
        if (object.metadata?.promoRedemptionId) {
          await finalizePromoRedemption(Number(object.metadata.promoRedemptionId), object.id, transaction);
        }
      } else if (object.mode === 'payment' && object.metadata?.mysteryBoxPurchaseId &&
        ['paid', 'no_payment_required'].includes(object.payment_status)) {
        const purchase = await settleMysteryBoxPurchase(object, 'paid', transaction);
        if (purchase) {
          const purchaseId = purchase.id;
          postCommitActions.push(['mystery box confirmation', async () => {
            await sendMysteryBoxPurchaseEmail(purchaseId);
          }]);
        }
      } else if (object.mode === 'payment' && object.metadata?.donationId &&
        ['paid', 'no_payment_required'].includes(object.payment_status)) {
        const donationId = Number(object.metadata.donationId);
        const donation = await Donation.findByPk(donationId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!donation || donation.status !== 'pending') break;
        const expectedMinor = toMinorUnits(donation.amount, String(donation.currency).toUpperCase());
        const actualMinor = Number(object.amount_total);
        if (expectedMinor !== actualMinor || String(donation.currency).toUpperCase() !== String(object.currency || '').toUpperCase()) {
          await donation.update({ status: 'amount_mismatch', stripeCheckoutSessionId: object.id }, { transaction });
          await logSecurityEvent(req || {}, {
            type: 'donation_amount_mismatch',
            severity: 'critical',
            reason: `Donation ${donation.id} amount did not match the server value.`,
            metadata: { donationId: donation.id, expectedMinor, actualMinor, currency: object.currency },
            userId: donation.userId
          });
          break;
        }
        const campaign = donation.campaignId
          ? await DonationCampaign.findByPk(donation.campaignId, { transaction })
          : null;
        const costMinor = campaign?.costPerUnit
          ? toMinorUnits(campaign.costPerUnit, String(donation.currency).toUpperCase())
          : 0;
        const units = donation.unitsSponsored > 0
          ? donation.unitsSponsored
          : (costMinor > 0 ? Math.floor(actualMinor / costMinor) : 0);
        await donation.update({
          status: 'paid',
          unitsSponsored: Math.max(0, units),
          paidAt: new Date(),
          stripeCheckoutSessionId: object.id,
          stripePaymentIntentId: typeof object.payment_intent === 'string'
            ? object.payment_intent
            : object.payment_intent?.id || null
        }, { transaction });
        if (donation.campaignId) await recomputeCampaignProgress(donation.campaignId, transaction);
        postCommitActions.push(['donation receipt', async () => {
          const donation = await Donation.findByPk(donationId);
          if (!donation) throw new Error(`Donation ${donationId} was not found after its payment was committed.`);
          const user = donation.userId ? await User.findByPk(donation.userId) : null;
          if (!user) throw new Error(`The reader for donation ${donationId} was not found.`);
          await sendRequiredTemplateEmail({
            templateCode: 'donation_receipt',
            to: user.email,
            language: requestedLanguage(user.language),
            variables: {
              firstName: user.firstName,
              amount: donation.amount,
              currency: donation.currency
            },
            purpose: 'donation receipt'
          });
        }]);
      } else if (object.mode === 'subscription' && object.subscription) {
        const recurringDonationId = Number(object.metadata?.recurringDonationId);
        if (Number.isSafeInteger(recurringDonationId) && recurringDonationId > 0) {
          const stripeSubscriptionId = typeof object.subscription === 'string'
            ? object.subscription
            : object.subscription.id;
          await RecurringDonation.update({
            stripeCheckoutSessionId: object.id,
            stripeSubscriptionId,
            stripeCustomerId: typeof object.customer === 'string' ? object.customer : object.customer?.id,
            status: 'active'
          }, { where: { id: recurringDonationId }, transaction });
          break;
        }
        const subscriptionId = Number(object.metadata?.subscriptionId);
        if (!Number.isSafeInteger(subscriptionId) || subscriptionId < 1) break;
        const stripeSubscriptionId = typeof object.subscription === 'string'
          ? object.subscription
          : object.subscription.id;
        await Subscription.update({
          stripeCheckoutSessionId: object.id,
          stripeSubscriptionId,
          stripeCustomerId: typeof object.customer === 'string' ? object.customer : object.customer?.id
        }, {
          where: { id: subscriptionId },
          transaction
        });
        if (object.metadata?.promoRedemptionId) {
          await finalizePromoRedemption(Number(object.metadata.promoRedemptionId), object.id, transaction);
        }
      }
      break;
    case 'checkout.session.expired':
      if (object.mode === 'payment' && object.metadata?.orderId) await settleStoreOrder(object, 'expired', transaction, { source: 'webhook' });
      if (object.mode === 'payment' && object.metadata?.mysteryBoxPurchaseId) {
        await settleMysteryBoxPurchase(object, 'cancelled', transaction);
      }
      if (object.mode === 'payment' && object.metadata?.donationId) {
        await Donation.update({ status: 'failed' }, {
          where: { id: Number(object.metadata.donationId), status: 'pending' },
          transaction
        });
      }
      if (object.metadata?.promoRedemptionId) {
        await releasePromoRedemption(Number(object.metadata.promoRedemptionId), transaction);
      }
      if (object.mode === 'subscription') {
        await Subscription.update({ status: 'expired' }, {
          where: { stripeCheckoutSessionId: object.id, status: 'incomplete' },
          transaction
        });
        await RecurringDonation.update({ status: 'expired' }, {
          where: { stripeCheckoutSessionId: object.id, status: 'pending' },
          transaction
        });
      }
      break;
    case 'checkout.session.async_payment_failed':
      if (object.mode === 'payment' && object.metadata?.orderId) await settleStoreOrder(object, 'failed', transaction, { source: 'webhook' });
      if (object.mode === 'payment' && object.metadata?.mysteryBoxPurchaseId) {
        await settleMysteryBoxPurchase(object, 'cancelled', transaction);
      }
      if (object.mode === 'payment' && object.metadata?.donationId) {
        await Donation.update({ status: 'failed' }, {
          where: { id: Number(object.metadata.donationId), status: 'pending' },
          transaction
        });
      }
      if (object.metadata?.promoRedemptionId) {
        await releasePromoRedemption(Number(object.metadata.promoRedemptionId), transaction);
      }
      if (object.mode === 'subscription') {
        await Subscription.update({ status: 'expired' }, {
          where: { stripeCheckoutSessionId: object.id, status: 'incomplete' },
          transaction
        });
        await RecurringDonation.update({ status: 'expired' }, {
          where: { stripeCheckoutSessionId: object.id, status: 'pending' },
          transaction
        });
      }
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncStripeSubscription(object, transaction);
      await syncRecurringStripeSubscription(object, transaction);
      break;
    case 'invoice.paid':
      await syncInvoiceStatus(object, 'active', transaction);
      {
        const receipt = await recordRecurringDonationInvoice(object, transaction);
        if (receipt) postCommitActions.push(['donation receipt', async () => {
          const user = receipt.recurringDonation.user;
          const campaign = receipt.recurringDonation.campaign;
          const language = requestedLanguage(user?.language);
          await sendRequiredTemplateEmail({
            templateCode: 'donation_receipt',
            to: user.email,
            language,
            variables: {
              firstName: user.firstName,
              amount: receipt.donation.amount,
              currency: receipt.donation.currency,
              campaign: campaign?.translations?.[language]?.title || campaign?.translations?.ar?.title || campaign?.slug
            },
            purpose: 'donation receipt'
          });
        }]);
        const stripeSubscriptionId = getInvoiceSubscriptionId(object);
        if (stripeSubscriptionId) postCommitActions.push(['subscription renewal email', async () => {
          const subscription = await Subscription.findOne({
            where: { stripeSubscriptionId },
            include: [{ model: Plan, as: 'plan', attributes: ['name', 'translations'] }]
          });
          if (!subscription) return;
          const user = await User.findByPk(subscription.userId);
          if (!user) throw new Error(`The reader for subscription ${subscription.id} was not found.`);
          const language = requestedLanguage(user.language);
          await sendRequiredTemplateEmail({
            templateCode: 'subscription_renewal',
            to: user.email,
            language,
            variables: {
              firstName: user.firstName,
              planName: subscription.plan?.translations?.[language]?.name || subscription.plan?.name || ''
            },
            purpose: 'subscription renewal'
          });
        }]);
      }
      break;
    case 'invoice.payment_failed':
      await syncInvoiceStatus(object, 'past_due', transaction);
      await failRecurringDonationInvoice(object, transaction);
      break;
    case 'charge.refunded':
      await refundStoreOrder(object, transaction);
      await refundMysteryBoxPurchase(object, transaction);
      break;
    case 'charge.dispute.created':
      if (object.payment_intent) {
        const paymentIntentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
        const disputed = paymentIntentId ? await StoreOrder.findOne({ where: { stripePaymentIntentId: paymentIntentId }, transaction, lock: transaction.LOCK.UPDATE }) : null;
        if (disputed) {
          const disputeFromStatus = normalizeOrderStatus(disputed.status);
          await disputed.update({ status: 'amount_mismatch', lastStripeSyncAt: new Date() }, { transaction });
          await recordOrderEvent(disputed, 'chargeback_opened', {
            fromStatus: disputeFromStatus,
            toStatus: 'amount_mismatch',
            message: 'Stripe dispute opened; fulfillment is frozen pending review.'
          }, transaction);
          await logSecurityEvent({}, {
            type: 'payment_dispute',
            severity: 'critical',
            reason: `Stripe dispute opened for order ${disputed.id}.`,
            metadata: { orderId: disputed.id, disputeId: object.id },
            userId: disputed.userId
          });
        }
      }
      break;
    case 'payment_intent.payment_failed':
      if (object.id) {
        const failedOrder = await StoreOrder.findOne({
          where: { stripePaymentIntentId: object.id, status: { [Op.in]: ['pending', 'pending_payment'] } },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (failedOrder) {
          const failedFromStatus = normalizeOrderStatus(failedOrder.status);
          await restoreOrderInventory(failedOrder.id, transaction);
          await failedOrder.update({ status: 'failed', lastStripeSyncAt: new Date() }, { transaction });
          await recordOrderEvent(failedOrder, 'payment_failed', {
            fromStatus: failedFromStatus,
            toStatus: 'failed',
            metadata: { paymentIntentId: object.id }
          }, transaction);
        }
      }
      break;
    case 'refund.updated':
    case 'refund.failed':
      await syncReturnRefund(object, transaction);
      break;
    default:
      break;
  }
}

function verifyStripeWebhookSignature(rawBody, signature, secret) {
  return createStripeClient().webhooks.constructEvent(rawBody, signature, secret);
}

async function stripeWebhookHandler(req, res) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ message: 'Stripe webhooks are not configured.', code: 'PAYMENTS_UNAVAILABLE' });
  }
  const signature = req.get('stripe-signature');
  if (!signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ message: 'A valid Stripe webhook signature and raw request body are required.' });
  }

  let event;
  try {
    event = verifyStripeWebhookSignature(req.body, signature, webhookSecret);
  } catch (error) {
    if (error.status === 503) {
      return res.status(503).json({ message: 'Stripe payment processing is not configured.', code: 'PAYMENTS_UNAVAILABLE' });
    }
    await logSecurityEvent(req, {
      type: 'stripe_webhook_signature_invalid',
      severity: 'critical',
      reason: 'Stripe webhook signature verification failed.'
    });
    return res.status(400).json({ message: 'Stripe webhook signature verification failed.' });
  }

  const payloadSummary = {
    eventId: event.id,
    type: event.type,
    objectId: event.data?.object?.id || null,
    mode: event.data?.object?.mode || null,
    paymentStatus: event.data?.object?.payment_status || null,
    amountTotal: event.data?.object?.amount_total ?? null,
    currency: event.data?.object?.currency || null,
    metadata: event.data?.object?.metadata || {}
  };
  let transaction;
  const postCommitActions = [];
  let stripeEvent;
  try {
    transaction = await sequelize.transaction();
    [stripeEvent] = await StripeEvent.findOrCreate({
      where: { stripeEventId: event.id },
      defaults: {
        stripeEventId: event.id,
        type: event.type,
        payloadSummary,
        status: 'received',
        receivedAt: new Date()
      },
      transaction
    });
    const [, created] = await ProcessedWebhookEvent.findOrCreate({
      where: { stripeEventId: event.id },
      defaults: { stripeEventId: event.id, type: event.type, processedAt: new Date() },
      transaction
    });
    if (!created) {
      await stripeEvent.update({ status: 'processed', processedAt: new Date() }, { transaction });
      await transaction.commit();
      return res.json({ received: true, duplicate: true });
    }
    await handleStripeEvent(event, transaction, postCommitActions, req);
    await stripeEvent.update({ status: 'processed', processedAt: new Date() }, { transaction });
    await transaction.commit();
    for (const [description, action] of postCommitActions) {
      try {
        await action();
      } catch (error) {
        console.error(`Échec de l’envoi de l’e-mail post-paiement (${description}) :`, error);
      }
    }
    return res.json({ received: true });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error('Échec du traitement du webhook Stripe :', error);
    await StripeEvent.update({
      status: 'failed',
      error: String(error.message || 'Webhook processing failed.').slice(0, 5000),
      processedAt: new Date()
    }, { where: { stripeEventId: event.id } }).catch(() => {});
    return res.status(500).json({ message: 'Le webhook Stripe n’a pas pu être traité.' });
  }
}

router.get('/plans', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const plans = await Plan.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'slug', 'price', 'currency', 'interval', 'features', 'translations', 'isFamily'],
      order: [['price', 'ASC']]
    });
    res.json(plans.map((plan) => localizePlan(plan, language)).filter(Boolean));
  } catch (error) {
    next(error);
  }
});

router.get('/admin/plans', ...admins, async (req, res, next) => {
  try {
    const plans = await Plan.findAll({
      attributes: ['id', 'name', 'slug', 'price', 'currency', 'interval', 'features', 'translations', 'isFamily', 'isActive'],
      order: [['price', 'ASC']]
    });
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/money/promo-codes', ...admins, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = req.query.q
      ? { code: { [Op.like]: `%${String(req.query.q).trim().toUpperCase()}%` } }
      : {};
    if (req.query.kind) where.kind = req.query.kind;
    const result = await PromoCode.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/promo-codes', ...admins, validateBody(schemas.promoCodeSchema), async (req, res, next) => {
  try {
    const promo = await PromoCode.create({ ...req.body, usedCount: 0 });
    await recordAudit(req, 'CREATE_PROMO_CODE', 'PromoCode', promo.id);
    res.status(201).json(promo);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/money/promo-codes/:id', ...admins, validateBody(schemas.promoCodeUpdateSchema), async (req, res, next) => {
  try {
    const promo = await PromoCode.findByPk(parseId(req.params.id, 'Code promotionnel'));
    if (!promo) return res.status(404).json({ message: 'Code promotionnel introuvable.' });
    const current = promo.toJSON();
    const merged = {
      ...current,
      ...req.body,
      value: Number(req.body.value ?? current.value),
      startsAt: req.body.startsAt ?? (current.startsAt ? new Date(current.startsAt).toISOString() : null),
      endsAt: req.body.endsAt ?? (current.endsAt ? new Date(current.endsAt).toISOString() : null)
    };
    const parsed = schemas.promoCodeSchema.safeParse(merged);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Les paramètres du code promotionnel sont invalides.', fields: parsed.error.flatten().fieldErrors });
    }
    await promo.update(parsed.data);
    await recordAudit(req, 'UPDATE_PROMO_CODE', 'PromoCode', promo.id);
    res.json(promo);
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/money/promo-codes/:id', ...admins, async (req, res, next) => {
  try {
    const promo = await PromoCode.findByPk(parseId(req.params.id, 'Code promotionnel'));
    if (!promo) return res.status(404).json({ message: 'Code promotionnel introuvable.' });
    const uses = await PromoCodeRedemption.count({ where: { promoCodeId: promo.id } });
    if (uses) return res.status(409).json({ message: 'Un code déjà utilisé ne peut pas être supprimé; désactivez-le plutôt.' });
    await promo.destroy();
    await recordAudit(req, 'DELETE_PROMO_CODE', 'PromoCode', promo.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/admin/money/promo-codes/:id/redemptions', ...admins, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await PromoCodeRedemption.findAndCountAll({
      where: { promoCodeId: parseId(req.params.id, 'Code promotionnel') },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/payments/books/checkout', ...readers, validateBody(schemas.bookCheckoutSchema), async (req, res, next) => {
  let reservation;
  let promoReservation;
  let stripe;
  let session;
  try {
    stripe = createStripeClient();
    const customer = await ensureStripeCustomer(req.user, stripe);
    const idempotencyKey = String(req.get('Idempotency-Key') || '').trim().slice(0, 120) || null;
    if (idempotencyKey) {
      const previous = await StoreOrder.findOne({
        where: { userId: req.user.id, idempotencyKey },
        include: [{ model: StoreOrderItem, as: 'items' }]
      });
      if (previous) {
        if (previous.stripeCheckoutSessionId && ['pending', 'pending_payment'].includes(previous.status)) {
          try {
            const previousSession = await stripe.checkout.sessions.retrieve(previous.stripeCheckoutSessionId);
            if (previousSession.status === 'open' && previousSession.url) {
              return res.status(200).json({ orderId: previous.id, orderNumber: previous.orderNumber, checkoutUrl: previousSession.url, idempotentReplay: true });
            }
          } catch {
            // Fall through to a normal conflict below.
          }
        }
        return res.status(409).json({
          message: 'This checkout request has already been processed.',
          code: 'CHECKOUT_REPLAYED',
          orderId: previous.id,
          status: previous.status
        });
      }
    }
    reservation = await createPendingOrder({
      userId: req.user.id,
      items: req.body.items,
      shippingAddress: req.body.shippingAddress,
      customerEmail: req.user.email,
      digitalConsent: req.body.digitalConsent === true,
      idempotencyKey,
      req
    });
    const subtotalMinor = toMinorUnits(reservation.order.subtotal, reservation.order.currency);
    promoReservation = await reservePromoCode({
      code: req.body.promoCode,
      userId: req.user.id,
      scope: 'book',
      currency: reservation.order.currency,
      amountMinor: subtotalMinor,
      bookIds: reservation.orderItems.map(({ book }) => book.id),
      orderId: reservation.order.id
    });
    let coupon;
    if (promoReservation) {
      // Stripe applies coupons to line items, not to shipping. Keep the
      // server total identical to the future Checkout amount_total.
      coupon = await createStripePromoCoupon(stripe, promoReservation);
      const { allocateDiscount } = require('../utils/returns/orderAmounts');
      const discountMinor = promoReservation.discountMinor;
      const discountTransaction = await sequelize.transaction();
      try {
        await reservation.order.update({
          discountAmount: decimalFromMinor(discountMinor),
          discountMinor,
          totalMinor: expectedTotalMinor({
            subtotalMinor,
            shippingMinor: reservation.shippingMinor,
            discountMinor
          }),
          total: decimalFromMinor(expectedTotalMinor({
            subtotalMinor,
            shippingMinor: reservation.shippingMinor,
            discountMinor
          }))
        }, { transaction: discountTransaction });
        // Snapshot the net paid value of every line now that the discount is
        // known, so returns never refund a gross price on a discounted order.
        const orderItems = await StoreOrderItem.findAll({
          where: { orderId: reservation.order.id },
          transaction: discountTransaction,
          lock: discountTransaction.LOCK.UPDATE
        });
        const netMinor = allocateDiscount(
          orderItems.map((item) => toMinorUnits(item.unitPrice, reservation.order.currency) * Math.max(0, Number(item.quantity) || 0)),
          discountMinor
        );
        for (let index = 0; index < orderItems.length; index += 1) {
          await orderItems[index].update({
            pricePaidAfterDiscount: decimalFromMinor(netMinor[index])
          }, { transaction: discountTransaction });
        }
        await discountTransaction.commit();
      } catch (error) {
        if (!discountTransaction.finished) await discountTransaction.rollback();
        throw error;
      }
    }
    const lineItems = reservation.orderItems.map(({ book, quantity, currency }) => ({
      quantity,
      price_data: {
        currency: currency.toLowerCase(),
        unit_amount: toMinorUnits(book.price, currency),
        product_data: {
          name: book.title,
          ...(book.description ? { description: book.description.slice(0, 500) } : {})
        }
      }
    }));
    const baseUrl = `${getClientAppUrl()}/${req.body.language}`;
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer,
      client_reference_id: String(reservation.order.id),
      metadata: {
        orderId: String(reservation.order.id),
        userId: String(req.user.id),
        ...(promoReservation ? { promoRedemptionId: String(promoReservation.redemption.id) } : {})
      },
      line_items: lineItems,
      ...(reservation.shippingMinor > 0 ? {
        shipping_options: [{
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: reservation.shippingMinor, currency: reservation.order.currency.toLowerCase() },
            display_name: 'Shipping'
          }
        }]
      } : {}),
      ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
      success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}&order_id=${reservation.order.id}`,
      cancel_url: `${baseUrl}/cart?checkout=cancelled`
    }, { idempotencyKey: `store-order-${reservation.order.id}` });
    if (!session.url) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } finally {
        await failPendingOrder(reservation.order.id);
      }
      throw new Error('Stripe did not return a Checkout URL.');
    }
    await reservation.order.update({ stripeCheckoutSessionId: session.id, expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : reservation.order.expiresAt });
    await recordOrderEvent(reservation.order, 'stripe_session_created', {
      fromStatus: 'pending_payment',
      toStatus: 'pending_payment',
      metadata: { sessionId: session.id, amountTotal: session.amount_total, currency: session.currency }
    });
    await recordAudit(req, 'CREATE_STORE_CHECKOUT', 'StoreOrder', reservation.order.id);
    res.status(201).json({ orderId: reservation.order.id, orderNumber: reservation.order.orderNumber, checkoutUrl: session.url });
  } catch (error) {
    const cleanups = [];
    if (session && stripe && !['complete', 'expired'].includes(session.status)) {
      cleanups.push(['expire session', () => stripe.checkout.sessions.expire(session.id)]);
    }
    if (promoReservation) cleanups.push(['release promotion', () => releasePromoRedemption(promoReservation.redemption.id)]);
    if (reservation) cleanups.push(['release order inventory', () => failPendingOrder(reservation.order.id)]);
    await cleanupCheckoutFailure(cleanups);
    next(error);
  }
});

router.post('/payments/subscriptions/checkout', ...readers, validateBody(schemas.subscriptionCheckoutSchema), async (req, res, next) => {
  let subscription;
  let promoReservation;
  let stripe;
  let session;
  try {
    const plan = await Plan.findOne({ where: { id: req.body.planId, isActive: true } });
    if (!plan) return res.status(404).json({ message: 'Subscription plan not found.' });
    const existing = await Subscription.findOne({
      where: {
        userId: req.user.id,
        status: { [Op.in]: ['incomplete', 'trialing', 'active', 'past_due'] }
      }
    });
    if (existing) return res.status(409).json({ message: 'An active or pending subscription already exists.' });
    const currency = String(plan.currency).toUpperCase();
    assertTwoDecimalCurrency(currency);
    const unitAmount = toMinorUnits(plan.price, currency);
    stripe = createStripeClient();
    const customer = await ensureStripeCustomer(req.user, stripe);
    subscription = await Subscription.create({
      userId: req.user.id,
      planId: plan.id,
      status: 'incomplete',
      stripeCustomerId: customer
    });
    const promoAmount = toMinorUnits(plan.price, currency);
    promoReservation = await reservePromoCode({
      code: req.body.promoCode,
      userId: req.user.id,
      scope: 'plan',
      currency,
      amountMinor: promoAmount,
      planId: plan.id,
      subscriptionId: subscription.id
    });
    const coupon = promoReservation ? await createStripePromoCoupon(stripe, promoReservation) : null;
    const metadata = {
      subscriptionId: String(subscription.id),
      userId: String(req.user.id),
      planId: String(plan.id),
      ...(promoReservation ? { promoRedemptionId: String(promoReservation.redemption.id) } : {})
    };
    const baseUrl = `${getClientAppUrl()}/${req.body.language}`;
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      metadata,
      subscription_data: { metadata },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: unitAmount,
          recurring: { interval: plan.interval },
          product_data: { name: plan.name }
        }
      }],
      ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
      success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/account?subscription=cancelled`
    }, { idempotencyKey: `reader-subscription-${subscription.id}` });
    if (!session.url) {
      await stripe.checkout.sessions.expire(session.id);
      throw new Error('Stripe did not return a Checkout URL.');
    }
    await subscription.update({ stripeCheckoutSessionId: session.id });
    await recordAudit(req, 'CREATE_SUBSCRIPTION_CHECKOUT', 'Subscription', subscription.id, { planId: plan.id });
    res.status(201).json({ subscriptionId: subscription.id, checkoutUrl: session.url });
  } catch (error) {
    const cleanups = [];
    if (session && stripe && !['complete', 'expired'].includes(session.status)) {
      cleanups.push(['expire session', () => stripe.checkout.sessions.expire(session.id)]);
    }
    if (promoReservation) cleanups.push(['release promotion', () => releasePromoRedemption(promoReservation.redemption.id)]);
    if (subscription && subscription.status === 'incomplete') {
      cleanups.push(['expire pending subscription', () => subscription.update({ status: 'expired' })]);
    }
    await cleanupCheckoutFailure(cleanups);
    next(error);
  }
});

router.post('/gift-codes/redeem', ...readers, validateBody(schemas.giftCodeRedemptionSchema), async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const user = await User.findByPk(req.user.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const promo = await PromoCode.findOne({
      where: { code: req.body.code },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const now = new Date();
    if (!promo || promo.kind !== 'gift' || !promo.isActive ||
      promo.startsAt && promo.startsAt > now ||
      promo.endsAt && promo.endsAt <= now ||
      promo.maxUses !== null && promo.maxUses !== undefined && promo.usedCount >= promo.maxUses) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Ce code cadeau est invalide ou n’est plus disponible.' });
    }
    if (!promo.giftPlanId || !promo.giftDurationDays) {
      await transaction.rollback();
      return res.status(409).json({ message: 'La durée ou l’offre de ce code cadeau n’est pas configurée.' });
    }
    const alreadyRedeemed = await PromoCodeRedemption.count({
      where: {
        promoCodeId: promo.id,
        userId: req.user.id,
        status: { [Op.in]: ['pending', 'redeemed'] }
      },
      transaction
    });
    if (alreadyRedeemed >= promo.perUserLimit) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Vous avez déjà utilisé ce code cadeau.' });
    }
    const currentSubscription = await Subscription.findOne({
      where: {
        userId: req.user.id,
        status: { [Op.in]: ['incomplete', 'trialing', 'active', 'past_due'] }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (currentSubscription) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Annulez ou terminez votre abonnement actuel avant d’utiliser un code cadeau.' });
    }
    const plan = await Plan.findOne({
      where: { id: promo.giftPlanId, isActive: true },
      transaction
    });
    if (!plan) {
      await transaction.rollback();
      return res.status(409).json({ message: 'L’offre associée au code cadeau n’est plus disponible.' });
    }

    const expiresAt = new Date(now.getTime() + promo.giftDurationDays * 24 * 60 * 60 * 1000);
    const subscription = await Subscription.create({
      userId: req.user.id,
      planId: plan.id,
      status: 'active',
      startedAt: now,
      expiresAt,
      gracePeriodEndsAt: null,
      cancelAtPeriodEnd: false
    }, { transaction });
    const redemption = await PromoCodeRedemption.create({
      promoCodeId: promo.id,
      userId: req.user.id,
      subscriptionId: subscription.id,
      status: 'redeemed',
      amountDiscounted: 0
    }, { transaction });
    await promo.update({ usedCount: promo.usedCount + 1 }, { transaction });
    await recordAudit(req, 'REDEEM_GIFT_CODE', 'PromoCodeRedemption', redemption.id, { promoCodeId: promo.id });
    await transaction.commit();
    res.status(201).json({ subscriptionId: subscription.id, plan: plan.name, expiresAt });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.post('/donations/checkout', ...readers, validateBody(schemas.donationCheckoutSchema), async (req, res, next) => {
  let recurringDonation;
  let donation;
  try {
    const currency = 'EUR';
    assertTwoDecimalCurrency(currency);
    const amountMinor = Math.round(Number(req.body.amount) * 100);
    if (req.body.tierId || !Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > 99999999) {
      return res.status(422).json({ message: 'Enter a platform donation amount between 1 and 999999.99 EUR.', code: 'DONATION_AMOUNT_OUT_OF_RANGE' });
    }
    const stripe = createStripeClient();
    const customer = await ensureStripeCustomer(req.user, stripe);
    const baseUrl = `${getClientAppUrl()}/${req.body.language}`;
    if (req.body.recurring) {
      recurringDonation = await RecurringDonation.create({
        campaignId: null,
        userId: req.user.id,
        amount: (amountMinor / 100).toFixed(2),
        currency,
        status: 'pending',
        stripeCustomerId: customer
      });
      const metadata = { recurringDonationId: String(recurringDonation.id), userId: String(req.user.id) };
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer,
        metadata,
        subscription_data: { metadata },
        line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: amountMinor, recurring: { interval: 'month' }, product_data: { name: 'Monthly support for Islamic Stories' } } }],
        success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}&donation_id=${recurringDonation.id}`,
        cancel_url: `${baseUrl}/donate?checkout=cancelled`
      }, { idempotencyKey: `platform-recurring-donation-${recurringDonation.id}` });
      await recurringDonation.update({ stripeCheckoutSessionId: session.id });
      return res.status(201).json({ donationId: recurringDonation.id, checkoutUrl: session.url, recurring: true });
    }
    donation = await Donation.create({
      campaignId: null,
      userId: req.user.id,
      amount: (amountMinor / 100).toFixed(2),
      currency,
      unitsSponsored: 0,
      isRecurring: false,
      isAnonymous: req.body.isAnonymous === true,
      displayName: req.body.isAnonymous ? null : (req.body.displayName || `${req.user.firstName} ${req.user.lastName}`.trim()).slice(0, 120),
      message: req.body.message || null,
      source: 'stripe',
      status: 'pending'
    });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer,
      metadata: { donationId: String(donation.id), userId: String(req.user.id) },
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: amountMinor, product_data: { name: 'Support Islamic Stories' } } }],
      success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}&donation_id=${donation.id}`,
      cancel_url: `${baseUrl}/donate?checkout=cancelled`
    }, { idempotencyKey: `platform-donation-${donation.id}` });
    if (!session.url) throw new Error('Stripe did not return a Checkout URL.');
    await donation.update({ stripeCheckoutSessionId: session.id });
    res.status(201).json({ donationId: donation.id, checkoutUrl: session.url, recurring: false });
  } catch (error) {
    if (donation) await donation.update({ status: 'failed' }).catch(() => {});
    if (recurringDonation) await recurringDonation.update({ status: 'expired' }).catch(() => {});
    next(error);
  }
});

router.post('/donation-campaigns/:id/checkout', ...readers, validateBody(schemas.donationCheckoutSchema), async (req, res, next) => {
  let donation;
  let recurringDonation;
  try {
    const campaign = await DonationCampaign.findByPk(parseId(req.params.id, 'Campagne'));
    if (!campaign || campaign.status !== 'active') {
      return res.status(404).json({ message: 'Cette campagne de dons n’est pas disponible.', code: 'CAMPAIGN_UNAVAILABLE' });
    }
    const donations = await paidDonations(campaign.id);
    const state = campaignState(campaign, donations);
    if (!state.canDonate) {
      return res.status(409).json({
        message: state.ended ? 'This campaign has ended.' : state.notStarted ? 'This campaign has not started yet.' : 'This campaign has reached its goal.',
        code: state.ended ? 'CAMPAIGN_ENDED' : state.notStarted ? 'CAMPAIGN_NOT_STARTED' : 'CAMPAIGN_FULL'
      });
    }
    const currency = String(campaign.currency).toUpperCase();
    assertTwoDecimalCurrency(currency);
    let tier = null;
    if (req.body.tierId) {
      tier = await DonationTier.findOne({
        where: { id: req.body.tierId, campaignId: campaign.id, isActive: true }
      });
      if (!tier) return res.status(404).json({ message: 'Donation tier not found for this campaign.', code: 'DONATION_TIER_NOT_FOUND' });
    }
    const resolved = resolveDonationAmount({
      campaign,
      tier,
      amount: req.body.amount,
      currency
    });
    if (req.body.recurring && !campaign.allowRecurring) {
      return res.status(422).json({ message: 'Recurring donations are disabled for this campaign.', code: 'RECURRING_DISABLED' });
    }
    if (req.body.isAnonymous && !campaign.allowAnonymous) {
      return res.status(422).json({ message: 'Anonymous donations are disabled for this campaign.', code: 'ANONYMOUS_DISABLED' });
    }
    const unitAmount = resolved.cents;
    const stripe = createStripeClient();
    const customer = await ensureStripeCustomer(req.user, stripe);
    if (req.body.recurring) {
      recurringDonation = await RecurringDonation.create({
        campaignId: campaign.id,
        userId: req.user.id,
        amount: resolved.amount,
        currency,
        status: 'pending',
        stripeCustomerId: customer
      });
      try {
        const localizedCampaign = campaign.translations?.[req.body.language] || campaign.translations?.ar;
        const baseUrl = `${getClientAppUrl()}/${req.body.language}`;
        const metadata = {
          recurringDonationId: String(recurringDonation.id),
          campaignId: String(campaign.id),
          userId: String(req.user.id)
        };
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer,
          metadata,
          subscription_data: { metadata },
          line_items: [{
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: unitAmount,
              recurring: { interval: 'month' },
              product_data: { name: `Monthly donation: ${localizedCampaign?.title || campaign.slug}` }
            }
          }],
          success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}&donation_id=${recurringDonation.id}`,
          cancel_url: `${baseUrl}/donation-campaigns/${encodeURIComponent(campaign.slug)}?checkout=cancelled`
        }, { idempotencyKey: `recurring-donation-${recurringDonation.id}` });
        if (!session.url) {
          await stripe.checkout.sessions.expire(session.id);
          throw new Error('Stripe did not return a Checkout URL.');
        }
        await recurringDonation.update({ stripeCheckoutSessionId: session.id });
        await recordAudit(req, 'CREATE_RECURRING_DONATION_CHECKOUT', 'RecurringDonation', recurringDonation.id, { campaignId: campaign.id });
        return res.status(201).json({ donationId: recurringDonation.id, checkoutUrl: session.url, recurring: true });
      } catch (error) {
        await recurringDonation.update({ status: 'expired' });
        throw error;
      }
    }
    donation = await Donation.create({
      campaignId: campaign.id,
      userId: req.user.id,
      amount: resolved.amount,
      currency,
      unitsSponsored: resolved.units,
      isRecurring: false,
      isAnonymous: req.body.isAnonymous === true,
      displayName: req.body.isAnonymous ? null : (req.body.displayName || `${req.user.firstName} ${req.user.lastName}`.trim()).slice(0, 120),
      message: req.body.message || null,
      source: 'stripe',
      tierId: tier?.id || null,
      status: 'pending'
    });
    let session;
    try {
      const localizedCampaign = campaign.translations?.[req.body.language] || campaign.translations?.ar;
      const baseUrl = `${getClientAppUrl()}/${req.body.language}`;
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer,
        metadata: { donationId: String(donation.id), campaignId: String(campaign.id), userId: String(req.user.id) },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: { name: `Donation: ${localizedCampaign?.title || campaign.slug}` }
          }
        }],
        success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}&donation_id=${donation.id}`,
        cancel_url: `${baseUrl}/donation-campaigns/${encodeURIComponent(campaign.slug)}?checkout=cancelled`
      }, { idempotencyKey: `donation-${donation.id}` });
    } catch (error) {
      await donation.update({ status: 'failed' });
      throw error;
    }
    if (!session.url) {
      await stripe.checkout.sessions.expire(session.id);
      await donation.update({ status: 'failed' });
      throw new Error('Stripe did not return a Checkout URL.');
    }
    await donation.update({ stripeCheckoutSessionId: session.id });
    await recordAudit(req, 'CREATE_DONATION_CHECKOUT', 'Donation', donation.id, { campaignId: campaign.id });
    res.status(201).json({
      donationId: donation.id,
      checkoutUrl: session.url,
      amount: resolved.amount,
      unitsSponsored: resolved.units
    });
  } catch (error) {
    next(error);
  }
});

router.get('/donations/recurring', ...readers, async (req, res, next) => {
  try {
    const records = await RecurringDonation.findAll({
      where: { userId: req.user.id },
      include: [{ model: DonationCampaign, as: 'campaign', attributes: ['slug', 'translations'] }],
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    const language = requestedLanguage(req.query.lang);
    res.json(records.map((record) => ({
      id: record.id,
      amount: record.amount,
      currency: record.currency,
      status: record.status,
      campaign: record.campaign?.translations?.[language]?.title || record.campaign?.translations?.ar?.title || record.campaign?.slug,
      cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      createdAt: record.createdAt
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/donations/recurring/:id/cancel', ...readers, async (req, res, next) => {
  try {
    const record = await RecurringDonation.findOne({
      where: { id: parseId(req.params.id, 'Recurring donation'), userId: req.user.id }
    });
    if (!record) return res.status(404).json({ message: 'Recurring donation not found.' });
    if (!record.stripeSubscriptionId || !['active', 'past_due'].includes(record.status)) {
      return res.status(409).json({ message: 'This recurring donation cannot be canceled.' });
    }
    const updated = await createStripeClient().subscriptions.update(record.stripeSubscriptionId, {
      cancel_at_period_end: true
    });
    await record.update({
      status: recurringDonationStatus(updated.status),
      cancelAtPeriodEnd: Boolean(updated.cancel_at_period_end)
    });
    await recordAudit(req, 'CANCEL_RECURRING_DONATION', 'RecurringDonation', record.id);
    res.json({ id: record.id, cancelAtPeriodEnd: updated.cancel_at_period_end });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/money/recurring-donations', ...admins, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await RecurringDonation.findAndCountAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: DonationCampaign, as: 'campaign', attributes: ['slug'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/orders', ...readers, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const result = await StoreOrder.findAndCountAll({
      where: { userId: req.user.id },
      include: orderItemsInclude(),
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true
    });
    res.set('Cache-Control', 'private, no-store');
    res.json({ items: result.rows.map((order) => serializeOrder(order)), total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:id/status', ...readers, async (req, res, next) => {
  try {
    const orderId = parseId(req.params.id, 'Order');
    let order = await loadOrderForUser(orderId, req.user.id);
    if (!order) return res.status(404).json({ message: 'Order not found.', code: 'ORDER_NOT_FOUND' });
    let reconciliation = null;
    if (['pending', 'pending_payment', 'amount_mismatch'].includes(normalizeOrderStatus(order.status))) {
      try {
        reconciliation = await reconcileOrderWithStripe(order, req);
      } catch (error) {
        console.error(`Order ${order.id} reconciliation failed:`, error.message);
        reconciliation = { reconciled: false, reason: 'stripe_unavailable' };
      }
      order = await loadOrderForUser(orderId, req.user.id);
    }
    res.set('Cache-Control', 'private, no-store');
    res.json({
      order: serializeOrder(order),
      reconciliation: reconciliation || { reconciled: false, reason: 'not_needed' }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:id', ...readers, async (req, res, next) => {
  try {
    const order = await loadOrderForUser(parseId(req.params.id, 'Order'), req.user.id);
    if (!order) return res.status(404).json({ message: 'Order not found.', code: 'ORDER_NOT_FOUND' });
    res.set('Cache-Control', 'private, no-store');
    res.json(serializeOrder(order));
  } catch (error) {
    next(error);
  }
});

router.get('/payments/session/:sessionId', authenticate, async (req, res, next) => {
  try {
    const order = await StoreOrder.findOne({
      where: { stripeCheckoutSessionId: req.params.sessionId, userId: req.user.id }
    });
    if (order) {
      let reconciliation = null;
      try {
        reconciliation = await reconcileOrderWithStripe(order, req);
      } catch (error) {
        console.error(`Checkout session reconciliation failed:`, error.message);
        reconciliation = { reconciled: false, reason: 'stripe_unavailable' };
      }
      const fresh = await loadOrderForUser(order.id, req.user.id);
      return res.json({
        kind: 'book',
        status: fresh.status,
        orderId: fresh.id,
        order: serializeOrder(fresh),
        reconciliation: reconciliation || { reconciled: false }
      });
    }
    const subscription = await Subscription.findOne({
      where: { stripeCheckoutSessionId: req.params.sessionId, userId: req.user.id },
      include: [{ model: Plan, as: 'plan', attributes: ['name', 'interval', 'translations'] }]
    });
    if (!subscription) {
      const donation = await RecurringDonation.findOne({
        where: { stripeCheckoutSessionId: req.params.sessionId, userId: req.user.id }
      });
      if (donation) return res.json({ kind: 'donation', status: donation.status, recurring: true });
      let oneTimeDonation = await Donation.findOne({
        where: { stripeCheckoutSessionId: req.params.sessionId, userId: req.user.id }
      });
      if (!oneTimeDonation) return res.status(404).json({ message: 'Checkout session not found.' });
      if (oneTimeDonation.status === 'pending') {
        try {
          const stripe = createStripeClient();
          const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
          const expected = toMinorUnits(oneTimeDonation.amount, oneTimeDonation.currency);
          if (session.payment_status === 'paid' && Number(session.amount_total) === expected && String(session.currency).toUpperCase() === String(oneTimeDonation.currency).toUpperCase()) {
            await oneTimeDonation.update({
              status: 'paid',
              paidAt: new Date(),
              stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null
            });
            if (oneTimeDonation.campaignId) await recomputeCampaignProgress(oneTimeDonation.campaignId);
          } else if (session.status === 'expired') {
            await oneTimeDonation.update({ status: 'canceled' });
          }
        } catch (error) {
          if (error.status !== 503) console.error('Donation session reconciliation failed:', error.message);
        }
        oneTimeDonation = await Donation.findByPk(oneTimeDonation.id);
      }
      return res.json({ kind: 'donation', status: oneTimeDonation.status, recurring: false });
    }
    const value = subscription.toJSON();
    res.json({
      kind: 'subscription',
      status: value.status,
      accessActive: subscriptionIsActive(value),
      plan: value.plan
    });
  } catch (error) {
    next(error);
  }
});

router.post('/subscriptions/:id/cancel', ...readers, async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({
      where: { id: parseId(req.params.id, 'Subscription'), userId: req.user.id }
    });
    if (!subscription) return res.status(404).json({ message: 'Subscription not found.' });
    await setSubscriptionRenewal(subscription, true);
    await recordAudit(req, 'CANCEL_SUBSCRIPTION', 'Subscription', subscription.id);
    res.json({ id: subscription.id, cancelAtPeriodEnd: true, expiresAt: subscription.expiresAt });
  } catch (error) {
    next(error);
  }
});

router.post('/subscriptions/:id/resume', ...readers, async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({
      where: { id: parseId(req.params.id, 'Subscription'), userId: req.user.id }
    });
    if (!subscription) return res.status(404).json({ message: 'Subscription not found.' });
    if (!subscription.stripeSubscriptionId || !subscription.cancelAtPeriodEnd) {
      return res.status(409).json({ message: 'This subscription cannot be resumed.' });
    }
    await setSubscriptionRenewal(subscription, false);
    await recordAudit(req, 'RESUME_SUBSCRIPTION', 'Subscription', subscription.id);
    res.json({ id: subscription.id, cancelAtPeriodEnd: false, expiresAt: subscription.expiresAt });
  } catch (error) {
    next(error);
  }
});

async function uniquePlanSlug(body) {
  const base = body.slug || slugFromLocalized(body.name || body.translations?.ar?.name, body.translations) || 'plan';
  let candidate = base;
  for (let suffix = 2; await Plan.findOne({ where: { slug: candidate } }); suffix += 1) {
    candidate = `${base.slice(0, 110)}-${suffix}`;
  }
  return candidate;
}

router.post('/admin/plans', ...admins, validateBody(schemas.planSchema), async (req, res, next) => {
  try {
    const plan = await Plan.create({ ...req.body, slug: await uniquePlanSlug(req.body) });
    await recordAudit(req, 'CREATE_SUBSCRIPTION_PLAN', 'Plan', plan.id);
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/store-orders', ...admins, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.status && req.query.status !== 'all') {
      const status = String(req.query.status);
      where.status = status === 'pending_payment' ? { [Op.in]: ['pending', 'pending_payment'] }
        : status === 'canceled' ? { [Op.in]: ['canceled', 'cancelled'] }
          : status;
    }
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.createdAt[Op.lte] = new Date(req.query.to);
    }
    if (req.query.q) {
      const q = `%${String(req.query.q).trim()}%`;
      where[Op.or] = [
        { orderNumber: { [Op.like]: q } },
        { customerEmail: { [Op.like]: q } },
        { stripeCheckoutSessionId: { [Op.like]: q } },
        { stripePaymentIntentId: { [Op.like]: q } }
      ];
    }
    const result = await StoreOrder.findAndCountAll({
      where,
      include: [
        ...orderItemsInclude(),
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: StoreOrderEvent, as: 'events', separate: true, order: [['createdAt', 'ASC']], limit: 100 }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true
    });
    const orderIds = result.rows.map((order) => order.id);
    const approvals = orderIds.length
      ? await OrderRefundApproval.findAll({
        where: { orderId: { [Op.in]: orderIds } },
        order: [['createdAt', 'DESC']]
      })
      : [];
    const latestApproval = new Map();
    for (const approval of approvals) {
      if (!latestApproval.has(approval.orderId)) latestApproval.set(approval.orderId, approval);
    }
    const items = result.rows
      .filter((order) => {
        if (!req.query.type || req.query.type === 'all') return true;
        const formats = new Set((order.items || []).map((item) => item.formatSnapshot || item.book?.format));
        const physical = formats.has('print');
        const digital = formats.has('ebook');
        return req.query.type === 'physical' ? physical : req.query.type === 'digital' ? digital && !physical : physical && digital;
      })
      .map((order) => serializeOrder(order, { admin: true, refundApproval: latestApproval.get(order.id) || null }));
    res.set('Cache-Control', 'private, no-store');
    res.json({ items, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/store-orders/:id', ...admins, async (req, res, next) => {
  try {
    const order = await StoreOrder.findByPk(parseId(req.params.id, 'Order'), {
      include: [
        ...orderItemsInclude(),
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: StoreOrderEvent, as: 'events', separate: true, order: [['createdAt', 'ASC']] }
      ]
    });
    if (!order) return res.status(404).json({ message: 'Store order not found.' });
    const refundApproval = await OrderRefundApproval.findOne({
      where: { orderId: order.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(serializeOrder(order, { admin: true, refundApproval }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/store-orders/:id/sync', ...admins, async (req, res, next) => {
  try {
    const order = await StoreOrder.findByPk(parseId(req.params.id, 'Order'));
    if (!order) return res.status(404).json({ message: 'Store order not found.' });
    const result = await reconcileOrderWithStripe(order, req);
    await recordAudit(req, 'SYNC_STORE_ORDER_STRIPE', 'StoreOrder', order.id, { result: result.reason || result.status });
    const fresh = await StoreOrder.findByPk(order.id, {
      include: [...orderItemsInclude(), { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }]
    });
    res.json({ reconciliation: result, order: serializeOrder(fresh, { admin: true }) });
  } catch (error) {
    next(error);
  }
});

const refundApprovalStore = {
  findPending: (orderId) => OrderRefundApproval.findOne({ where: { orderId, status: 'pending' } }),
  create: (values) => OrderRefundApproval.create({ ...values, status: 'pending' }),
  markApproved: (approval, approver) => approval.update({
    status: 'approved',
    approvedByAdminId: approver.id,
    approvedAt: new Date()
  }),
  markExecuted: (approval, result) => approval.update({
    status: 'executed',
    executedAt: new Date(),
    stripeRefundId: result?.refundId || null,
    failureReason: null
  }),
  recordFailure: (approval, error) => approval.update({
    status: 'pending',
    failureReason: String(error?.message || 'Stripe refund failed').slice(0, 1000)
  }),
  markRejected: (approval, approver, note) => approval.update({
    status: 'rejected',
    approvedByAdminId: approver.id,
    rejectedAt: new Date(),
    note: note || null
  })
};

/** Stripe capture of a paid order; only reached below the threshold or after approval. */
async function executeStoreOrderRefund(order, { admin, req, refundApprovalId = null } = {}) {
  const fromStatus = normalizeOrderStatus(order.status);
  if (!['paid', 'fulfilled', 'partially_refunded'].includes(fromStatus)) {
    throw apiError(409, 'Only paid orders can be refunded through Stripe.', 'ORDER_NOT_REFUNDABLE');
  }
  if (!order.stripePaymentIntentId) {
    throw apiError(409, 'This order has no Stripe payment intent.', 'STRIPE_PAYMENT_MISSING');
  }
  const stripe = createStripeClient();
  const refund = await stripe.refunds.create({
    payment_intent: order.stripePaymentIntentId,
    reason: 'requested_by_customer',
    metadata: {
      orderId: String(order.id),
      adminId: String(admin.id),
      ...(refundApprovalId ? { refundApprovalId: String(refundApprovalId) } : {})
    }
  }, { idempotencyKey: `store-order-refund-${order.id}` });
  const items = await StoreOrderItem.findAll({ where: { orderId: order.id }, attributes: ['id'] });
  if (items.length) {
    await Entitlement.update({ revokedAt: new Date() }, {
      where: { orderItemId: { [Op.in]: items.map((item) => item.id) }, revokedAt: null }
    });
  }
  await order.update({ status: 'refunded', lastStripeSyncAt: new Date() });
  await recordOrderEvent(order, 'admin_refund', {
    fromStatus,
    toStatus: 'refunded',
    metadata: { refundId: refund.id, adminId: admin.id, ...(refundApprovalId ? { refundApprovalId } : {}) }
  });
  await recordAudit(req, 'REFUND_STORE_ORDER', 'StoreOrder', order.id, {
    refundId: refund.id,
    ...(refundApprovalId ? { refundApprovalId } : {})
  });
  return { id: order.id, status: 'refunded', refundId: refund.id };
}

router.post('/admin/store-orders/:id/refund', ...admins, async (req, res, next) => {
  try {
    const order = await StoreOrder.findByPk(parseId(req.params.id, 'Order'));
    if (!order) return res.status(404).json({ message: 'Store order not found.' });
    const fromStatus = normalizeOrderStatus(order.status);
    if (!['paid', 'fulfilled', 'partially_refunded'].includes(fromStatus)) {
      return res.status(409).json({ message: 'Only paid orders can be refunded through Stripe.', code: 'ORDER_NOT_REFUNDABLE' });
    }
    if (!order.stripePaymentIntentId) {
      return res.status(409).json({ message: 'This order has no Stripe payment intent.', code: 'STRIPE_PAYMENT_MISSING' });
    }
    // Four-eyes circuit: a large refund is only recorded here, never sent to Stripe.
    const gate = await requestRefundApproval({
      store: refundApprovalStore,
      order,
      amountMinor: orderRefundableAmountMinor(order),
      currency: order.currency,
      admin: req.user
    });
    if (gate.approvalRequired) {
      await recordAudit(req, 'REQUEST_STORE_ORDER_REFUND', 'StoreOrder', order.id, {
        approvalId: gate.approval.id,
        amount: gate.approval.amount,
        threshold: gate.thresholdMinor
      });
      const approval = await OrderRefundApproval.findByPk(gate.approval.id);
      return res.status(202).json({
        id: order.id,
        status: order.status,
        refundId: null,
        approvalRequired: true,
        approval: serializeRefundApproval(approval || gate.approval)
      });
    }
    res.json(await executeStoreOrderRefund(order, { admin: req.user, req }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/store-orders/:id/refund/approval', ...admins, async (req, res, next) => {
  try {
    const order = await StoreOrder.findByPk(parseId(req.params.id, 'Order'));
    if (!order) return res.status(404).json({ message: 'Store order not found.' });
    const approval = await refundApprovalStore.findPending(order.id);
    if (!approval) {
      return res.status(404).json({ message: 'No refund is awaiting approval.', code: 'REFUND_APPROVAL_NOT_FOUND' });
    }
    const decision = String(req.body?.decision || 'approve');
    if (decision === 'reject') {
      const note = String(req.body?.note || '').trim() || null;
      const rejected = await rejectRefundApproval({ store: refundApprovalStore, approval, approver: req.user, note });
      await recordAudit(req, 'REJECT_STORE_ORDER_REFUND', 'StoreOrder', order.id, { approvalId: approval.id, note });
      return res.json({ ...rejected, refundId: null, approvalRequired: false });
    }
    if (decision !== 'approve') {
      return res.status(422).json({ message: 'Invalid approval decision.', code: 'REFUND_APPROVAL_DECISION_INVALID' });
    }
    const result = await approveRefundApproval({
      store: refundApprovalStore,
      approval,
      approver: req.user,
      execute: (approved) => executeStoreOrderRefund(order, { admin: req.user, req, refundApprovalId: approved.id })
    });
    res.json({ ...result, approvalId: approval.id, approvalRequired: false });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/store-orders/:id/resend-confirmation', ...admins, async (req, res, next) => {
  try {
    const order = await StoreOrder.findByPk(parseId(req.params.id, 'Order'), { include: [{ model: User, as: 'user' }] });
    if (!order) return res.status(404).json({ message: 'Store order not found.' });
    if (!['paid', 'fulfilled', 'partially_refunded'].includes(normalizeOrderStatus(order.status))) {
      return res.status(409).json({ message: 'Only paid orders have a confirmation email.', code: 'ORDER_NOT_PAID' });
    }
    if (!order.user?.email) return res.status(409).json({ message: 'The reader has no email address.', code: 'EMAIL_MISSING' });
    await sendRequiredTemplateEmail({
      templateCode: 'order_confirmation',
      to: order.user.email,
      language: requestedLanguage(order.user.language),
      variables: { firstName: order.user.firstName, orderId: order.id, total: order.total, currency: order.currency },
      purpose: 'order confirmation resend'
    });
    await recordAudit(req, 'RESEND_ORDER_CONFIRMATION', 'StoreOrder', order.id);
    res.json({ id: order.id, sent: true });
  } catch (error) {
    next(error);
  }
});

function requiredEntitlementReason(body) {
  const reason = String(body?.reason || '').trim();
  if (reason.length < 3 || reason.length > 500) return null;
  return reason;
}

router.post('/admin/store-orders/:id/entitlements/grant', ...admins, async (req, res, next) => {
  try {
    const reason = requiredEntitlementReason(req.body);
    if (!reason) return res.status(422).json({ message: 'A grant reason is required.', code: 'GRANT_REASON_REQUIRED' });
    const orderId = parseId(req.params.id, 'Order');
    const orderItemId = parseId(req.body?.orderItemId, 'Order item');
    const order = await StoreOrder.findByPk(orderId, { attributes: ['id', 'userId'] });
    if (!order) return res.status(404).json({ message: 'Store order not found.' });
    const item = await StoreOrderItem.findOne({
      where: { id: orderItemId, orderId },
      include: [{ model: Book, as: 'book', attributes: ['id', 'format'] }]
    });
    if (!item) return res.status(404).json({ message: 'Order item not found.' });
    if (item.book?.format !== 'ebook') return res.status(422).json({ message: 'Only e-book lines have entitlements.' });
    const existing = await Entitlement.findOne({ where: { orderItemId: item.id } });
    const entitlement = existing
      ? await existing.update({ revokedAt: null, startsAt: new Date(), downloadCount: 0, downloadLimit: 1 })
      : await Entitlement.create({
        userId: order.userId,
        orderItemId: item.id,
        resourceType: 'book',
        resourceId: item.bookId,
        source: 'purchase',
        startsAt: new Date(),
        expiresAt: null,
        downloadCount: 0,
        downloadLimit: 1
      });
    await recordAudit(req, 'GRANT_ENTITLEMENT', 'Entitlement', entitlement.id, { orderId, orderItemId, reason });
    res.json({ id: entitlement.id, orderItemId: item.id, active: true });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/entitlements/:id/reset-downloads', ...admins, async (req, res, next) => {
  try {
    const entitlement = await Entitlement.findByPk(parseId(req.params.id, 'Entitlement'));
    if (!entitlement) return res.status(404).json({ message: 'Entitlement not found.' });
    await entitlement.update({ downloadCount: 0 });
    await recordAudit(req, 'RESET_ENTITLEMENT_DOWNLOADS', 'Entitlement', entitlement.id);
    res.json({ id: entitlement.id, downloadCount: 0, downloadLimit: entitlement.downloadLimit });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/entitlements/:id/revoke', ...admins, async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3 || reason.length > 500) {
      return res.status(422).json({ message: 'A revocation reason is required.', code: 'REVOCATION_REASON_REQUIRED' });
    }
    const entitlement = await Entitlement.findByPk(parseId(req.params.id, 'Entitlement'));
    if (!entitlement) return res.status(404).json({ message: 'Entitlement not found.' });
    await entitlement.update({ revokedAt: new Date() });
    await recordAudit(req, 'REVOKE_ENTITLEMENT', 'Entitlement', entitlement.id, { reason });
    res.json({ id: entitlement.id, revokedAt: entitlement.revokedAt });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/payments/health', ...admins, async (req, res, next) => {
  try {
    const stripeKey = String(process.env.STRIPE_SECRET_KEY || '');
    const [lastEvent, failedEvents, pendingOrders, amountMismatch, recentSecurity] = await Promise.all([
      StripeEvent.findOne({ order: [['receivedAt', 'DESC']] }),
      StripeEvent.count({ where: { status: 'failed' } }),
      StoreOrder.count({ where: { status: { [Op.in]: ['pending', 'pending_payment'] } } }),
      StoreOrder.count({ where: { status: 'amount_mismatch' } }),
      require('../models').SecurityEvent.count({ where: { severity: { [Op.in]: ['high', 'critical'] } } })
    ]);
    res.set('Cache-Control', 'private, no-store');
    res.json({
      stripeConfigured: Boolean(stripeKey),
      stripeMode: stripeKey.startsWith('sk_live_') ? 'live' : stripeKey.startsWith('sk_test_') ? 'test' : stripeKey ? 'unknown' : 'not_configured',
      webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      lastWebhookAt: lastEvent?.receivedAt || null,
      lastWebhookType: lastEvent?.type || null,
      failedEvents,
      pendingOrders,
      amountMismatchOrders: amountMismatch,
      highSeveritySecurityEvents: recentSecurity
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/store-orders/:id/fulfillment', ...admins, validateBody(schemas.adminOrderUpdateSchema), async (req, res, next) => {
  try {
    const order = await StoreOrder.findByPk(parseId(req.params.id, 'Order'), {
      include: [{
        model: StoreOrderItem,
        as: 'items',
        include: [{ model: Book, as: 'book', attributes: ['id', 'format'] }]
      }]
    });
    if (!order) return res.status(404).json({ message: 'Store order not found.' });
    if (!['paid', 'fulfilled'].includes(order.status)) return res.status(409).json({ message: 'Only paid orders can be fulfilled.' });
    if (!order.items.some((item) => item.book?.format === 'print')) {
      return res.status(409).json({ message: 'This order does not contain printed books.' });
    }

    const transitions = { unfulfilled: 0, processing: 1, shipped: 2, delivered: 3 };
    if (req.body.fulfillmentStatus &&
      transitions[req.body.fulfillmentStatus] < transitions[order.fulfillmentStatus]) {
      return res.status(409).json({ message: 'Order fulfillment cannot move to an earlier state.' });
    }
    const values = { ...req.body };
    if (values.fulfillmentStatus === 'shipped' && !order.shippedAt) values.shippedAt = new Date();
    if (values.fulfillmentStatus === 'delivered' && !order.deliveredAt) values.deliveredAt = new Date();
    await order.update(values);
    await recordOrderEvent(order, 'fulfillment_updated', {
      fromStatus: order.status,
      toStatus: order.status === 'paid' && values.fulfillmentStatus === 'delivered' ? 'fulfilled' : order.status,
      metadata: { fulfillmentStatus: values.fulfillmentStatus, trackingNumber: values.trackingNumber || null }
    });
    if (order.status === 'paid' && values.fulfillmentStatus === 'delivered') {
      await order.update({ status: 'fulfilled' });
    }
    await recordAudit(req, 'UPDATE_STORE_ORDER_FULFILLMENT', 'StoreOrder', order.id, {
      fulfillmentStatus: order.fulfillmentStatus
    });
    res.json(order);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/plans/:id', ...admins, validateBody(schemas.planUpdateSchema), async (req, res, next) => {
  try {
    const plan = await Plan.findByPk(parseId(req.params.id, 'Plan'));
    if (!plan) return res.status(404).json({ message: 'Subscription plan not found.' });
    await plan.update(req.body);
    await recordAudit(req, 'UPDATE_SUBSCRIPTION_PLAN', 'Plan', plan.id);
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/subscriptions/:id', ...admins, validateBody(schemas.adminSubscriptionUpdateSchema), async (req, res, next) => {
  try {
    const subscription = await Subscription.findByPk(parseId(req.params.id, 'Subscription'));
    if (!subscription) return res.status(404).json({ message: 'Subscription not found.' });
    if (subscription.stripeSubscriptionId) {
      return res.status(409).json({
        message: 'Stripe-managed subscription states must be changed through the payment provider.',
        code: 'STRIPE_MANAGED_SUBSCRIPTION'
      });
    }
    const values = { ...req.body };
    for (const key of ['startedAt', 'expiresAt', 'gracePeriodEndsAt']) {
      if (values[key]) values[key] = new Date(values[key]);
    }
    if (values.status === 'active' && !subscription.startedAt && !values.startedAt) {
      values.startedAt = new Date();
    }
    await subscription.update(values);
    await recordAudit(req, 'ADMIN_UPDATE_SUBSCRIPTION', 'Subscription', subscription.id, {
      fields: Object.keys(values)
    });
    res.json({
      ...subscription.toJSON(),
      accessActive: subscriptionIsActive(subscription.toJSON())
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/subscriptions/:id/cancel', ...admins, async (req, res, next) => {
  try {
    const subscription = await Subscription.findByPk(parseId(req.params.id, 'Subscription'));
    if (!subscription) return res.status(404).json({ message: 'Subscription not found.' });
    await setSubscriptionRenewal(subscription, true);
    await recordAudit(req, 'ADMIN_CANCEL_SUBSCRIPTION', 'Subscription', subscription.id);
    res.json({ id: subscription.id, cancelAtPeriodEnd: true, expiresAt: subscription.expiresAt });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/subscriptions/:id/resume', ...admins, async (req, res, next) => {
  try {
    const subscription = await Subscription.findByPk(parseId(req.params.id, 'Subscription'));
    if (!subscription) return res.status(404).json({ message: 'Subscription not found.' });
    await setSubscriptionRenewal(subscription, false);
    await recordAudit(req, 'ADMIN_RESUME_SUBSCRIPTION', 'Subscription', subscription.id);
    res.json({ id: subscription.id, cancelAtPeriodEnd: false, expiresAt: subscription.expiresAt });
  } catch (error) {
    next(error);
  }
});

async function reconcileStalePayments({ olderThanMinutes = 10 } = {}) {
  if (!process.env.STRIPE_SECRET_KEY) return { skipped: 'stripe_not_configured', orders: 0, donations: 0 };
  const cutoff = new Date(Date.now() - Math.max(1, Number(olderThanMinutes) || 10) * 60 * 1000);
  const stripe = createStripeClient();
  const systemReq = { method: 'SYSTEM', originalUrl: '/jobs/reconcile-payments', ip: null };
  const orders = await StoreOrder.findAll({
    where: {
      status: { [Op.in]: ['pending', 'pending_payment'] },
      stripeCheckoutSessionId: { [Op.ne]: null },
      createdAt: { [Op.lt]: cutoff }
    },
    order: [['createdAt', 'ASC']],
    limit: 25
  });
  let orderCount = 0;
  for (const order of orders) {
    try {
      const result = await reconcileOrderWithStripe(order, systemReq);
      if (result.reconciled) orderCount += 1;
    } catch (error) {
      console.error(`Scheduled reconciliation failed for order ${order.id}:`, error.message);
    }
  }

  const donations = await Donation.findAll({
    where: {
      status: 'pending',
      stripeCheckoutSessionId: { [Op.ne]: null },
      createdAt: { [Op.lt]: cutoff }
    },
    order: [['createdAt', 'ASC']],
    limit: 25
  });
  let donationCount = 0;
  for (const donation of donations) {
    try {
      const session = await stripe.checkout.sessions.retrieve(donation.stripeCheckoutSessionId);
      if (session.status === 'expired') {
        await donation.update({ status: 'canceled' });
        continue;
      }
      if (!['paid', 'no_payment_required'].includes(session.payment_status)) continue;
      const expected = toMinorUnits(donation.amount, String(donation.currency).toUpperCase());
      const actual = Number(session.amount_total);
      if (expected !== actual || String(donation.currency).toUpperCase() !== String(session.currency || '').toUpperCase()) {
        await donation.update({ status: 'amount_mismatch' });
        await logSecurityEvent(systemReq, {
          type: 'donation_amount_mismatch',
          severity: 'critical',
          reason: `Scheduled reconciliation found a donation amount mismatch for donation ${donation.id}.`,
          metadata: { donationId: donation.id, expected, actual },
          userId: donation.userId
        });
        continue;
      }
      const campaign = donation.campaignId ? await DonationCampaign.findByPk(donation.campaignId) : null;
      const costMinor = campaign?.costPerUnit ? toMinorUnits(campaign.costPerUnit, String(donation.currency).toUpperCase()) : 0;
      await donation.update({
        status: 'paid',
        paidAt: new Date(),
        unitsSponsored: donation.unitsSponsored > 0 ? donation.unitsSponsored : (costMinor > 0 ? Math.floor(actual / costMinor) : 0),
        stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null
      });
      if (donation.campaignId) await recomputeCampaignProgress(donation.campaignId);
      donationCount += 1;
    } catch (error) {
      console.error(`Scheduled reconciliation failed for donation ${donation.id}:`, error.message);
    }
  }
  return { orders: orderCount, donations: donationCount };
}

module.exports = {
  router,
  stripeWebhookHandler,
  verifyStripeWebhookSignature,
  handleStripeEvent,
  settleStoreOrder,
  reconcileOrderWithStripe,
  reconcileStalePayments
};
