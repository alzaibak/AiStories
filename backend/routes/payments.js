const express = require('express');
const { Op } = require('sequelize');
const {
  Book,
  Entitlement,
  Plan,
  ProcessedWebhookEvent,
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

const router = express.Router();
const readers = [authenticate, allowRoles('READER')];
const admins = [authenticate, allowRoles('ADMIN')];

function apiError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function parseId(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw apiError(400, `${label} is invalid.`);
  return parsed;
}

function decimalFromMinor(amount) {
  return (amount / 100).toFixed(2);
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
      where: { id: { [Op.in]: requestedIds }, isPublished: true },
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
  if (order.status !== 'pending') return;

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
    return;
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

async function handleStripeEvent(event, transaction) {
  const object = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (object.mode === 'payment' && object.metadata?.orderId &&
        ['paid', 'no_payment_required'].includes(object.payment_status)) {
        await settleStoreOrder(object, 'paid', transaction);
      } else if (object.mode === 'subscription' && object.subscription) {
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
      }
      break;
    case 'checkout.session.expired':
      if (object.mode === 'payment' && object.metadata?.orderId) await settleStoreOrder(object, 'cancelled', transaction);
      if (object.mode === 'subscription') {
        await Subscription.update({ status: 'expired' }, {
          where: { stripeCheckoutSessionId: object.id, status: 'incomplete' },
          transaction
        });
      }
      break;
    case 'checkout.session.async_payment_failed':
      if (object.mode === 'payment' && object.metadata?.orderId) await settleStoreOrder(object, 'failed', transaction);
      if (object.mode === 'subscription') {
        await Subscription.update({ status: 'expired' }, {
          where: { stripeCheckoutSessionId: object.id, status: 'incomplete' },
          transaction
        });
      }
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncStripeSubscription(object, transaction);
      break;
    case 'invoice.paid':
      await syncInvoiceStatus(object, 'active', transaction);
      break;
    case 'invoice.payment_failed':
      await syncInvoiceStatus(object, 'past_due', transaction);
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
    await handleStripeEvent(event, transaction);
    await transaction.commit();
    return res.json({ received: true });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error('Échec du traitement du webhook Stripe :', error);
    return res.status(500).json({ message: 'Le webhook Stripe n’a pas pu être traité.' });
  }
}

router.get('/plans', async (req, res, next) => {
  try {
    const plans = await Plan.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'slug', 'price', 'currency', 'interval', 'features', 'isFamily'],
      order: [['price', 'ASC']]
    });
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

router.post('/payments/books/checkout', ...readers, validateBody(schemas.bookCheckoutSchema), async (req, res, next) => {
  let reservation;
  try {
    const stripe = createStripeClient();
    const customer = await ensureStripeCustomer(req.user, stripe);
    reservation = await createPendingOrder({
      userId: req.user.id,
      items: req.body.items,
      shippingAddress: req.body.shippingAddress
    });
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
    if (reservation.shippingMinor > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: reservation.order.currency.toLowerCase(),
          unit_amount: reservation.shippingMinor,
          product_data: { name: 'Shipping' }
        }
      });
    }
    const baseUrl = `${getClientAppUrl()}/${req.body.language}`;
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer,
        client_reference_id: String(reservation.order.id),
        metadata: { orderId: String(reservation.order.id), userId: String(req.user.id) },
        line_items: lineItems,
        success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/books?checkout=cancelled`
      }, { idempotencyKey: `store-order-${reservation.order.id}` });
    } catch (error) {
      await failPendingOrder(reservation.order.id);
      throw error;
    }
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
    next(error);
  }
});

router.post('/payments/subscriptions/checkout', ...readers, validateBody(schemas.subscriptionCheckoutSchema), async (req, res, next) => {
  let subscription;
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
    const stripe = createStripeClient();
    const customer = await ensureStripeCustomer(req.user, stripe);
    subscription = await Subscription.create({
      userId: req.user.id,
      planId: plan.id,
      status: 'incomplete',
      stripeCustomerId: customer
    });
    const metadata = {
      subscriptionId: String(subscription.id),
      userId: String(req.user.id),
      planId: String(plan.id)
    };
    let session;
    try {
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
        success_url: `${baseUrl}/checkout/result?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/account?subscription=cancelled`
      }, { idempotencyKey: `reader-subscription-${subscription.id}` });
    } catch (error) {
      await subscription.update({ status: 'expired' });
      throw error;
    }
    if (!session.url) {
      await stripe.checkout.sessions.expire(session.id);
      await subscription.update({ status: 'expired' });
      throw new Error('Stripe did not return a Checkout URL.');
    }
    await subscription.update({ stripeCheckoutSessionId: session.id });
    await recordAudit(req, 'CREATE_SUBSCRIPTION_CHECKOUT', 'Subscription', subscription.id, { planId: plan.id });
    res.status(201).json({ subscriptionId: subscription.id, checkoutUrl: session.url });
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
      include: [{ model: Plan, as: 'plan', attributes: ['name', 'interval'] }]
    });
    if (!subscription) return res.status(404).json({ message: 'Checkout session not found.' });
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
