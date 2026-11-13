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
  StoreOrder,
  StoreOrderItem,
  Subscription,
  User,
  sequelize
} = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { validateBody } = require('../middleware/validation');
const schemas = require('../middleware/storyValidation');
const { subscriptionIsActive } = require('../utils/contentAccess');
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

async function failPendingOrder(orderId) {
  const transaction = await sequelize.transaction();
  try {
    const order = await StoreOrder.findByPk(orderId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (order?.status === 'pending') {
      await restoreOrderInventory(order.id, transaction);
      await order.update({ status: 'failed' }, { transaction });
    }
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function createPendingOrder({ userId, items, shippingAddress }) {
  const transaction = await sequelize.transaction();
  try {
    const requestedIds = items.map((item) => item.bookId);
    const books = await Book.findAll({
      where: { id: { [Op.in]: requestedIds }, status: 'published' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (books.length !== items.length) {
      throw apiError(404, 'One or more books are no longer available.');
    }

    const byId = new Map(books.map((book) => [book.id, book]));
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
      status: 'pending',
      currency,
      subtotal: decimalFromMinor(subtotalMinor),
      total: decimalFromMinor(totalMinor),
      shippingAddress: shippingAddress || null
    }, { transaction });
    await StoreOrderItem.bulkCreate(orderItems.map((item) => ({
      orderId: order.id,
      bookId: item.book.id,
      quantity: item.quantity,
      unitPrice: item.book.price,
      titleSnapshot: item.book.title
    })), { transaction });
    await transaction.commit();
    return { order, orderItems, shippingMinor };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
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

async function settleStoreOrder(session, status, transaction) {
  const orderId = Number(session.metadata?.orderId || session.client_reference_id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    throw new Error('Stripe Checkout session is missing its order reference.');
  }
  const order = await StoreOrder.findByPk(orderId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!order) throw new Error(`Store order ${orderId} for Stripe Checkout session was not found.`);
  if (order.status !== 'pending') return false;

  const values = {
    status,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null
  };
  await order.update(values, { transaction });
  if (status !== 'paid') {
    await restoreOrderInventory(order.id, transaction);
    return true;
  }

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
        expiresAt: null
      }, { transaction });
    }
  }
  if (!hasPrint) await order.update({ fulfillmentStatus: 'delivered' }, { transaction });
  return true;
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
    const [donation, created] = await Donation.findOrCreate({
      where: { stripeInvoiceId: invoice.id },
      defaults: {
        campaignId: record.campaignId,
        recurringDonationId: record.id,
        userId: record.userId,
        amount: decimalFromMinor(amountMinor),
        currency,
        status: 'paid',
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: paymentIntentId
      },
      transaction
    });
    await record.update({ status: 'active' }, { transaction });
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
  await Donation.update({ status: 'refunded' }, {
    where: { stripePaymentIntentId: paymentIntentId, status: 'paid' },
    transaction
  });
  const order = await StoreOrder.findOne({
    where: { stripePaymentIntentId: paymentIntentId, status: 'paid' },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!order) return;
  await order.update({ status: 'refunded' }, { transaction });
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

async function handleStripeEvent(event, transaction, postCommitActions = []) {
  const object = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (object.mode === 'payment' && object.metadata?.orderId &&
        ['paid', 'no_payment_required'].includes(object.payment_status)) {
        const orderSettled = await settleStoreOrder(object, 'paid', transaction);
        const orderId = Number(object.metadata.orderId);
        if (orderSettled) postCommitActions.push(['order confirmation', async () => {
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
      } else if (object.mode === 'payment' && object.metadata?.donationId &&
        ['paid', 'no_payment_required'].includes(object.payment_status)) {
        const donationId = Number(object.metadata.donationId);
        const [updatedCount] = await Donation.update({
          status: 'paid',
          stripeCheckoutSessionId: object.id,
          stripePaymentIntentId: typeof object.payment_intent === 'string'
            ? object.payment_intent
            : object.payment_intent?.id || null
        }, { where: { id: donationId, status: 'pending' }, transaction });
        if (updatedCount) postCommitActions.push(['donation receipt', async () => {
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
            stripeCustomerId: typeof object.customer === 'string' ? object.customer : object.customer?.id
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
      if (object.mode === 'payment' && object.metadata?.orderId) await settleStoreOrder(object, 'cancelled', transaction);
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
      if (object.mode === 'payment' && object.metadata?.orderId) await settleStoreOrder(object, 'failed', transaction);
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
      break;
    default:
      break;
  }
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
    const stripe = createStripeClient();
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    if (error.status === 503) {
      return res.status(503).json({ message: 'Stripe payment processing is not configured.', code: 'PAYMENTS_UNAVAILABLE' });
    }
    return res.status(400).json({ message: 'Stripe webhook signature verification failed.' });
  }

  let transaction;
  const postCommitActions = [];
  try {
    transaction = await sequelize.transaction();
    const [, created] = await ProcessedWebhookEvent.findOrCreate({
      where: { stripeEventId: event.id },
      defaults: { stripeEventId: event.id, type: event.type, processedAt: new Date() },
      transaction
    });
    if (!created) {
      await transaction.commit();
      return res.json({ received: true, duplicate: true });
    }
    await handleStripeEvent(event, transaction, postCommitActions);
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
    reservation = await createPendingOrder({
      userId: req.user.id,
      items: req.body.items,
      shippingAddress: req.body.shippingAddress
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
      coupon = await createStripePromoCoupon(stripe, promoReservation);
      await reservation.order.update({
        discountAmount: decimalFromMinor(promoReservation.discountMinor),
        total: decimalFromMinor(subtotalMinor + reservation.shippingMinor - promoReservation.discountMinor)
      });
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
      success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/books?checkout=cancelled`
    }, { idempotencyKey: `store-order-${reservation.order.id}` });
    if (!session.url) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } finally {
        await failPendingOrder(reservation.order.id);
      }
      throw new Error('Stripe did not return a Checkout URL.');
    }
    await reservation.order.update({ stripeCheckoutSessionId: session.id });
    await recordAudit(req, 'CREATE_STORE_CHECKOUT', 'StoreOrder', reservation.order.id);
    res.status(201).json({ orderId: reservation.order.id, checkoutUrl: session.url });
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

router.post('/donation-campaigns/:id/checkout', ...readers, validateBody(schemas.donationCheckoutSchema), async (req, res, next) => {
  let donation;
  let recurringDonation;
  try {
    const campaign = await DonationCampaign.findOne({
      where: { id: parseId(req.params.id, 'Campagne'), status: 'active' }
    });
    if (!campaign || campaign.startsAt && campaign.startsAt > new Date() || campaign?.endsAt && campaign.endsAt < new Date()) {
      return res.status(404).json({ message: 'Cette campagne de dons n’est pas disponible.' });
    }
    const currency = String(campaign.currency).toUpperCase();
    assertTwoDecimalCurrency(currency);
    const unitAmount = toMinorUnits(req.body.amount, currency);
    const stripe = createStripeClient();
    const customer = await ensureStripeCustomer(req.user, stripe);
    if (req.body.recurring) {
      recurringDonation = await RecurringDonation.create({
        campaignId: campaign.id,
        userId: req.user.id,
        amount: req.body.amount.toFixed(2),
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
          success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/donations?checkout=cancelled`
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
      amount: req.body.amount.toFixed(2),
      currency,
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
        success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/donations?checkout=cancelled`
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
    res.status(201).json({ donationId: donation.id, checkoutUrl: session.url });
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

router.get('/payments/session/:sessionId', authenticate, async (req, res, next) => {
  try {
    const order = await StoreOrder.findOne({
      where: { stripeCheckoutSessionId: req.params.sessionId, userId: req.user.id }
    });
    if (order) return res.json({ kind: 'book', status: order.status });
    const subscription = await Subscription.findOne({
      where: { stripeCheckoutSessionId: req.params.sessionId, userId: req.user.id },
      include: [{ model: Plan, as: 'plan', attributes: ['name', 'interval', 'translations'] }]
    });
    if (!subscription) {
      const donation = await RecurringDonation.findOne({
        where: { stripeCheckoutSessionId: req.params.sessionId, userId: req.user.id }
      });
      if (donation) return res.json({ kind: 'donation', status: donation.status, recurring: true });
      const oneTimeDonation = await Donation.findOne({
        where: { stripeCheckoutSessionId: req.params.sessionId, userId: req.user.id }
      });
      if (!oneTimeDonation) return res.status(404).json({ message: 'Checkout session not found.' });
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

router.post('/admin/plans', ...admins, validateBody(schemas.planSchema), async (req, res, next) => {
  try {
    const plan = await Plan.create(req.body);
    await recordAudit(req, 'CREATE_SUBSCRIPTION_PLAN', 'Plan', plan.id);
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/store-orders', ...admins, async (req, res, next) => {
  try {
    const orders = await StoreOrder.findAll({
      where: { status: 'paid' },
      include: [
        {
          model: StoreOrderItem,
          as: 'items',
          include: [{ model: Book, as: 'book', attributes: ['id', 'title', 'format'], where: { format: 'print' } }]
        },
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 500
    });
    res.json(orders);
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
    if (order.status !== 'paid') return res.status(409).json({ message: 'Only paid orders can be fulfilled.' });
    if (!order.items.some((item) => item.book?.format === 'print')) {
      return res.status(409).json({ message: 'This order does not contain printed books.' });
    }

    const transitions = { unfulfilled: 0, processing: 1, shipped: 2, delivered: 3 };
    if (req.body.fulfillmentStatus &&
      transitions[req.body.fulfillmentStatus] < transitions[order.fulfillmentStatus]) {
      return res.status(409).json({ message: 'Order fulfillment cannot move to an earlier state.' });
    }
    await order.update(req.body);
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

module.exports = { router, stripeWebhookHandler, handleStripeEvent };
