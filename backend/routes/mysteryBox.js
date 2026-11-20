const express = require('express');
const { Op, fn, col } = require('sequelize');
const {
  MysteryBox,
  MysteryBoxAppearance,
  MysteryBoxItem,
  MysteryBoxNotifyRequest,
  MysteryBoxPurchase,
  MysteryBoxShipping,
  User,
  sequelize
} = require('../models');
const { authenticate, optionalAuthenticate, allowRoles } = require('../middleware/authorization');
const { validateBody } = require('../middleware/validation');
const schemas = require('../middleware/mysteryBoxValidation');
const { recordAudit } = require('../utils/audit');
const { requestedLanguage } = require('../utils/contentLocalization');
const { slugFromLocalized, slugify } = require('../utils/slug');
const { createStripeClient, getClientAppUrl } = require('../utils/stripe');
const {
  ACTIVE_PURCHASE_STATUSES,
  createMysteryBoxReservation,
  releaseMysteryBoxReservation,
  serializePurchase,
  markMysteryBoxShipped
} = require('../utils/mysteryBoxService');
const {
  checkoutShippingCountries,
  computeMysteryBoxState,
  duplicateBoxFields,
  isPhysicalItem,
  itemsValue,
  money,
  remainingStock,
  serializeHeader,
  serializePublicBox,
  validateBoxForActivation
} = require('../utils/mysteryBox');

const router = express.Router();
const admins = [authenticate, allowRoles('ADMIN', 'SUPER_ADMIN')];
const readers = [authenticate, allowRoles('READER')];

function apiError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function parseId(value, label = 'Identifier') {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw apiError(400, `${label} is invalid.`);
  return parsed;
}

function fullBoxInclude() {
  return [
    { model: MysteryBoxItem, as: 'items' },
    { model: MysteryBoxShipping, as: 'shipping' },
    { model: MysteryBoxAppearance, as: 'appearance' }
  ];
}

function sortedItems(box) {
  return [...(box.items || [])].sort((a, b) =>
    Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || Number(a.id) - Number(b.id));
}

function serializeAdminBox(box, extras = {}) {
  const json = typeof box.toJSON === 'function' ? box.toJSON() : { ...box };
  json.items = sortedItems(box).map((item) => item.toJSON ? item.toJSON() : item);
  json.state = computeMysteryBoxState(box);
  json.remainingStock = remainingStock(box);
  json.itemsValue = money(itemsValue(box.items || []));
  json.requiresShipping = Boolean(box.requiresShipping) ||
    (box.items || []).some(isPhysicalItem);
  return { ...json, ...extras };
}

async function findFullBox(where, { transaction } = {}) {
  return MysteryBox.findOne({ where, include: fullBoxInclude(), transaction });
}

async function uniqueSlug(base) {
  const cleaned = slugify(base) || 'mystery-box';
  let candidate = cleaned.slice(0, 240) || 'mystery-box';
  let suffix = 1;
  while (await MysteryBox.count({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${cleaned.slice(0, 230)}-${suffix}`;
  }
  return candidate;
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

async function replaceItems(boxId, items, transaction) {
  await MysteryBoxItem.destroy({ where: { boxId }, transaction });
  if (!items?.length) return [];
  return MysteryBoxItem.bulkCreate(items.map((item, index) => ({
    ...item,
    boxId,
    quantity: item.quantity || 1,
    isHiddenBeforePurchase: item.isHiddenBeforePurchase !== false,
    sortOrder: index,
    translations: item.translations || {}
  })), { transaction });
}

async function upsertShipping(boxId, values, transaction) {
  if (!values) return null;
  const existing = await MysteryBoxShipping.findOne({ where: { boxId }, transaction });
  if (existing) {
    await existing.update(values, { transaction });
    return existing;
  }
  return MysteryBoxShipping.create({ ...values, boxId }, { transaction });
}

async function upsertAppearance(boxId, values, transaction) {
  if (!values) return null;
  const existing = await MysteryBoxAppearance.findOne({ where: { boxId }, transaction });
  if (existing) {
    await existing.update(values, { transaction });
    return existing;
  }
  return MysteryBoxAppearance.create({ ...values, boxId }, { transaction });
}

function currentPurchaseRevealed(purchase) {
  return Boolean(purchase && ACTIVE_PURCHASE_STATUSES.includes(purchase.status));
}

async function findUserPurchase(userId, boxId) {
  return MysteryBoxPurchase.findOne({
    where: {
      userId,
      boxId,
      status: { [Op.in]: [...ACTIVE_PURCHASE_STATUSES, 'pending'] }
    },
    order: [['createdAt', 'DESC']]
  });
}

/* ------------------------------- public API ------------------------------- */

router.get('/mystery-box/active', async (req, res, next) => {
  try {
    const now = new Date();
    const language = requestedLanguage(req.query.lang);
    const boxes = await MysteryBox.findAll({
      where: {
        status: { [Op.in]: ['scheduled', 'active'] },
        startAt: { [Op.lte]: now },
        endAt: { [Op.gt]: now }
      },
      include: [
        { model: MysteryBoxItem, as: 'items', attributes: ['id', 'type'] },
        { model: MysteryBoxAppearance, as: 'appearance' }
      ],
      order: [['priority', 'DESC'], ['endAt', 'ASC']]
    });
    let header = null;
    for (const box of boxes) {
      header = serializeHeader(box, { items: box.items, appearance: box.appearance, language });
      if (header) break;
    }
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=30');
    res.json({ box: header });
  } catch (error) {
    next(error);
  }
});

router.get('/mystery-box/purchases/:id', ...readers, async (req, res, next) => {
  try {
    const purchase = await MysteryBoxPurchase.findOne({
      where: { id: parseId(req.params.id, 'Purchase'), userId: req.user.id },
      include: [{ model: MysteryBox, as: 'box', include: [{ model: MysteryBoxAppearance, as: 'appearance' }] }]
    });
    if (!purchase) return res.status(404).json({ message: 'Mystery box purchase not found.' });
    const language = requestedLanguage(req.query.lang || req.user.language);
    res.json({
      purchase: serializePurchase(purchase, {
        language,
        reveal: currentPurchaseRevealed(purchase),
        box: purchase.box
      })
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me/mystery-boxes', ...readers, async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang || req.user.language);
    const purchases = await MysteryBoxPurchase.findAll({
      where: { userId: req.user.id },
      include: [{ model: MysteryBox, as: 'box', include: [{ model: MysteryBoxAppearance, as: 'appearance' }] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({
      purchases: purchases.map((purchase) => serializePurchase(purchase, {
        language,
        reveal: currentPurchaseRevealed(purchase),
        box: purchase.box
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mystery-box/:slug/notify', optionalAuthenticate, validateBody(schemas.notifySchema), async (req, res, next) => {
  try {
    const box = await MysteryBox.findOne({ where: { slug: req.params.slug } });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const email = req.body.email.trim().toLowerCase();
    const language = req.body.language || requestedLanguage(req.user?.language);
    const [request, created] = await MysteryBoxNotifyRequest.findOrCreate({
      where: { boxId: box.id, email },
      defaults: {
        boxId: box.id,
        email,
        userId: req.user?.id || null,
        language
      }
    });
    if (!created && req.user && !request.userId) {
      await request.update({ userId: req.user.id });
    }
    res.status(created ? 201 : 200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/mystery-box/:slug/track', validateBody(schemas.trackSchema), async (req, res, next) => {
  try {
    const box = await MysteryBox.findOne({ where: { slug: req.params.slug }, attributes: ['id'] });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const field = req.body.event === 'header_click' ? 'headerClickCount' : 'viewCount';
    await MysteryBox.increment(field, { by: 1, where: { id: box.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/mystery-box/:slug', optionalAuthenticate, async (req, res, next) => {
  try {
    const box = await findFullBox({ slug: req.params.slug });
    if (!box || ['draft', 'archived'].includes(box.status)) {
      return res.status(404).json({ message: 'Mystery box not found.' });
    }
    const language = requestedLanguage(req.query.lang || req.user?.language);
    const purchase = req.user ? await findUserPurchase(req.user.id, box.id) : null;
    const revealed = currentPurchaseRevealed(purchase);
    const payload = serializePublicBox({
      box,
      items: box.items,
      shipping: box.shipping,
      appearance: box.appearance,
      language,
      revealed
    });
    let perUserPurchaseCount = 0;
    if (req.user) {
      perUserPurchaseCount = await MysteryBoxPurchase.count({
        where: {
          userId: req.user.id,
          boxId: box.id,
          [Op.or]: [
            { status: { [Op.in]: ACTIVE_PURCHASE_STATUSES } },
            { status: 'pending', reservationExpiresAt: { [Op.gt]: new Date() } }
          ]
        }
      });
    }
    let blockedReason = null;
    if (payload.state === 'scheduled') blockedReason = 'not_started';
    else if (payload.state === 'ended') blockedReason = 'ended';
    else if (payload.state === 'sold_out') blockedReason = 'sold_out';
    else if (req.user && perUserPurchaseCount >= payload.perUserLimit) blockedReason = 'per_user_limit';
    MysteryBox.increment('viewCount', { by: 1, where: { id: box.id } }).catch(() => {});
    res.json({
      box: payload,
      purchase: purchase ? { id: purchase.id, status: purchase.status } : null,
      perUserPurchaseCount,
      canPurchase: !blockedReason,
      blockedReason
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mystery-box/:slug/checkout', ...readers, validateBody(schemas.checkoutSchema), async (req, res, next) => {
  let reservation;
  let stripe;
  let session;
  try {
    const box = await findFullBox({ slug: req.params.slug });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const language = req.body.language || requestedLanguage(req.user.language);
    reservation = await createMysteryBoxReservation({
      boxId: box.id,
      userId: req.user.id,
      country: req.body.country,
      consent: req.body.digitalContentConsent === true,
      language
    });
    stripe = createStripeClient();
    const customer = await ensureStripeCustomer(req.user, stripe);
    const baseUrl = `${getClientAppUrl()}/${language}`;
    const title = reservation.box.translations?.[language]?.title || reservation.box.title;
    const tagline = reservation.box.translations?.[language]?.tagline || reservation.box.tagline;
    const requiresShipping = Boolean(reservation.box.requiresShipping) || reservation.items.some(isPhysicalItem);
    const metadata = {
      mysteryBoxPurchaseId: String(reservation.purchase.id),
      boxId: String(reservation.box.id),
      userId: String(req.user.id)
    };
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer,
      client_reference_id: String(reservation.purchase.id),
      metadata,
      payment_intent_data: { metadata },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: reservation.price.currency.toLowerCase(),
          unit_amount: reservation.price.amountMinor,
          product_data: {
            name: title,
            ...(tagline ? { description: tagline.slice(0, 500) } : {})
          }
        }
      }],
      ...(requiresShipping ? {
        shipping_options: [{
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: reservation.shippingFee.amountMinor,
              currency: reservation.price.currency.toLowerCase()
            },
            display_name: reservation.shippingFee.freeShipping ? 'Free shipping' : 'Shipping'
          }
        }],
        shipping_address_collection: {
          allowed_countries: checkoutShippingCountries(reservation.shippingFee)
        },
        phone_number_collection: { enabled: true }
      } : {}),
      expires_at: Math.floor(reservation.purchase.reservationExpiresAt.getTime() / 1000),
      success_url: `${baseUrl}/mystery-box/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/mystery-box/${box.slug}?checkout=cancelled`
    }, { idempotencyKey: `mystery-box-purchase-${reservation.purchase.id}` });

    if (!session.url) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } finally {
        await releaseMysteryBoxReservation(reservation.purchase.id);
      }
      throw new Error('Stripe did not return a Checkout URL.');
    }
    await reservation.purchase.update({ stripeCheckoutSessionId: session.id });
    await recordAudit(req, 'CREATE_MYSTERY_BOX_CHECKOUT', 'MysteryBoxPurchase', reservation.purchase.id, {
      boxId: reservation.box.id
    });
    res.status(201).json({
      purchaseId: reservation.purchase.id,
      checkoutUrl: session.url,
      summary: {
        amountItems: reservation.purchase.amountItems,
        amountShipping: reservation.purchase.amountShipping,
        amountTotal: reservation.purchase.amountTotal,
        currency: reservation.purchase.currency,
        priceTier: reservation.purchase.priceTier,
        expiresAt: reservation.purchase.reservationExpiresAt
      }
    });
  } catch (error) {
    if (session && stripe && !['complete', 'expired'].includes(session.status)) {
      await stripe.checkout.sessions.expire(session.id).catch(() => {});
    }
    if (reservation?.purchase) {
      await releaseMysteryBoxReservation(reservation.purchase.id).catch(() => {});
    }
    next(error);
  }
});

/* -------------------------------- admin API -------------------------------- */

router.get('/admin/mystery-boxes', ...admins, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.q) {
      const q = `%${String(req.query.q).trim()}%`;
      where[Op.or] = [
        { title: { [Op.like]: q } },
        { slug: { [Op.like]: q } },
        { seasonLabel: { [Op.like]: q } }
      ];
    }
    const boxes = await MysteryBox.findAll({
      where,
      include: fullBoxInclude(),
      order: [['priority', 'DESC'], ['createdAt', 'DESC']]
    });
    const totals = await MysteryBoxPurchase.findAll({
      attributes: [
        'boxId',
        [fn('COUNT', col('id')), 'sales'],
        [fn('SUM', col('amountTotal')), 'revenue']
      ],
      where: { status: { [Op.in]: ACTIVE_PURCHASE_STATUSES } },
      group: ['boxId'],
      raw: true
    });
    const totalsByBox = new Map(totals.map((row) => [Number(row.boxId), row]));
    const stateFilter = req.query.state ? String(req.query.state) : null;
    const serialized = boxes.map((box) => {
      const stats = totalsByBox.get(box.id);
      return serializeAdminBox(box, {
        salesCount: Number(stats?.sales || 0),
        revenue: money(stats?.revenue || 0)
      });
    }).filter((box) => !stateFilter || box.state === stateFilter);
    const start = (page - 1) * limit;
    res.json({
      items: serialized.slice(start, start + limit),
      total: serialized.length,
      page,
      limit
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/mystery-boxes', ...admins, validateBody(schemas.boxCreateSchema), async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { items = [], shipping, appearance, requiresShipping, ...fields } = req.body;
    const slug = await uniqueSlug(fields.slug || slugFromLocalized(fields.title, fields.translations));
    const box = await MysteryBox.create({
      ...fields,
      slug,
      title: fields.title,
      tagline: fields.tagline || '',
      seasonLabel: fields.seasonLabel || '',
      translations: fields.translations || {},
      status: 'draft',
      createdBy: req.user.id,
      requiresShipping: requiresShipping === true || items.some(isPhysicalItem)
    }, { transaction });
    await replaceItems(box.id, items, transaction);
    await upsertShipping(box.id, shipping, transaction);
    await upsertAppearance(box.id, {
      headerLabel: fields.title.slice(0, 80),
      ...appearance
    }, transaction);
    await transaction.commit();
    const full = await findFullBox({ id: box.id });
    await recordAudit(req, 'CREATE_MYSTERY_BOX', 'MysteryBox', box.id, { slug });
    res.status(201).json({ box: serializeAdminBox(full) });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.get('/admin/mystery-boxes/:id', ...admins, async (req, res, next) => {
  try {
    const box = await findFullBox({ id: parseId(req.params.id, 'Mystery box') });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const sales = await MysteryBoxPurchase.count({
      where: { boxId: box.id, status: { [Op.in]: ACTIVE_PURCHASE_STATUSES } }
    });
    res.json({ box: serializeAdminBox(box, { salesCount: sales }) });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/mystery-boxes/:id', ...admins, validateBody(schemas.boxUpdateSchema), async (req, res, next) => {
  let transaction;
  try {
    const boxId = parseId(req.params.id, 'Mystery box');
    const existing = await findFullBox({ id: boxId });
    if (!existing) return res.status(404).json({ message: 'Mystery box not found.' });
    const sales = await MysteryBoxPurchase.count({
      where: { boxId, status: { [Op.in]: ACTIVE_PURCHASE_STATUSES } }
    });
    const touchesCommercial = ['items', 'price', 'earlyBirdPrice', 'earlyBirdEndsAt', 'stockLimit']
      .some((field) => req.body[field] !== undefined);
    if (sales > 0 && touchesCommercial && !req.body.acknowledgeSales) {
      return res.status(409).json({
        message: 'This box already has sales. Confirm the change explicitly.',
        code: 'BOX_HAS_SALES',
        sales
      });
    }
    if (sales > 0 && req.body.slug && req.body.slug !== existing.slug) {
      return res.status(409).json({ message: 'The slug is locked after the first sale.', code: 'SLUG_LOCKED' });
    }

    transaction = await sequelize.transaction();
    const { items, shipping, appearance, acknowledgeSales, requiresShipping, ...fields } = req.body;
    if (fields.slug) {
      const slugOwner = await MysteryBox.findOne({ where: { slug: fields.slug }, transaction });
      if (slugOwner && slugOwner.id !== boxId) {
        throw apiError(409, 'This slug is already used.', 'SLUG_CONFLICT');
      }
    }
    await existing.update(fields, { transaction });
    if (items !== undefined) await replaceItems(boxId, items, transaction);
    if (shipping !== undefined) await upsertShipping(boxId, shipping, transaction);
    if (appearance !== undefined) await upsertAppearance(boxId, appearance, transaction);
    const finalItems = await MysteryBoxItem.findAll({ where: { boxId }, transaction });
    const nextRequiresShipping = requiresShipping === undefined
      ? Boolean(existing.requiresShipping)
      : requiresShipping === true;
    await existing.update({
      requiresShipping: nextRequiresShipping || finalItems.some(isPhysicalItem)
    }, { transaction });
    await transaction.commit();
    const full = await findFullBox({ id: boxId });
    await recordAudit(req, 'UPDATE_MYSTERY_BOX', 'MysteryBox', boxId, {
      acknowledgeSales: acknowledgeSales === true
    });
    res.json({ box: serializeAdminBox(full) });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.delete('/admin/mystery-boxes/:id', ...admins, async (req, res, next) => {
  try {
    const box = await MysteryBox.findByPk(parseId(req.params.id, 'Mystery box'));
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const sales = await MysteryBoxPurchase.count({ where: { boxId: box.id } });
    if (sales > 0) {
      return res.status(409).json({
        message: 'A box with purchases cannot be deleted. Archive it instead.',
        code: 'BOX_HAS_SALES'
      });
    }
    await recordAudit(req, 'DELETE_MYSTERY_BOX', 'MysteryBox', box.id, { slug: box.slug });
    await box.destroy();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/admin/mystery-boxes/:id/duplicate', ...admins, async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const source = await findFullBox({ id: parseId(req.params.id, 'Mystery box') }, { transaction });
    if (!source) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Mystery box not found.' });
    }
    const slug = await uniqueSlug(`${source.slug}-copy`);
    const copy = await MysteryBox.create({
      slug,
      ...duplicateBoxFields(source, req.user.id)
    }, { transaction });
    if (source.items?.length) {
      await MysteryBoxItem.bulkCreate(sortedItems(source).map((item, index) => ({
        boxId: copy.id,
        type: item.type,
        referenceId: item.referenceId,
        quantity: item.quantity,
        durationDays: item.durationDays,
        displayName: item.displayName,
        teaserText: item.teaserText,
        translations: item.translations,
        estimatedValue: item.estimatedValue,
        imageUrl: item.imageUrl,
        isHiddenBeforePurchase: item.isHiddenBeforePurchase,
        sortOrder: index,
        weightGrams: item.weightGrams,
        itemStock: item.itemStock,
        sku: item.sku
      })), { transaction });
    }
    if (source.shipping) {
      const shipping = source.shipping.toJSON();
      delete shipping.id;
      delete shipping.boxId;
      delete shipping.createdAt;
      delete shipping.updatedAt;
      await MysteryBoxShipping.create({ ...shipping, boxId: copy.id }, { transaction });
    }
    if (source.appearance) {
      const appearance = source.appearance.toJSON();
      delete appearance.id;
      delete appearance.boxId;
      delete appearance.createdAt;
      delete appearance.updatedAt;
      await MysteryBoxAppearance.create({ ...appearance, boxId: copy.id }, { transaction });
    }
    await transaction.commit();
    const full = await findFullBox({ id: copy.id });
    await recordAudit(req, 'DUPLICATE_MYSTERY_BOX', 'MysteryBox', copy.id, { sourceId: source.id });
    res.status(201).json({ box: serializeAdminBox(full) });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.post('/admin/mystery-boxes/:id/activate', ...admins, async (req, res, next) => {
  try {
    const box = await findFullBox({ id: parseId(req.params.id, 'Mystery box') });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const now = new Date();
    if (!box.endAt || new Date(box.endAt) <= now) {
      return res.status(409).json({
        message: 'Set an end date in the future before activating this box.',
        code: 'END_IN_PAST'
      });
    }
    const updates = { status: 'active' };
    if (!box.startAt || new Date(box.startAt) > now) {
      box.startAt = now;
      updates.startAt = now;
    }
    const check = validateBoxForActivation({
      box,
      items: box.items || [],
      shipping: box.shipping,
      appearance: box.appearance
    });
    if (!check.valid) {
      return res.status(409).json({
        message: 'This box is not ready to be activated.',
        code: 'ACTIVATION_REQUIREMENTS',
        missing: check.missing
      });
    }
    await box.update(updates);
    await recordAudit(req, 'ACTIVATE_MYSTERY_BOX', 'MysteryBox', box.id);
    res.json({ box: serializeAdminBox(await findFullBox({ id: box.id })) });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/mystery-boxes/:id/schedule', ...admins, async (req, res, next) => {
  try {
    const box = await findFullBox({ id: parseId(req.params.id, 'Mystery box') });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const now = new Date();
    if (!box.startAt || new Date(box.startAt) <= now) {
      return res.status(409).json({
        message: 'Set a start date in the future before scheduling this box.',
        code: 'START_IN_PAST'
      });
    }
    const check = validateBoxForActivation({
      box,
      items: box.items || [],
      shipping: box.shipping,
      appearance: box.appearance
    });
    if (!check.valid) {
      return res.status(409).json({
        message: 'This box is not ready to be scheduled.',
        code: 'ACTIVATION_REQUIREMENTS',
        missing: check.missing
      });
    }
    await box.update({ status: 'scheduled' });
    await recordAudit(req, 'SCHEDULE_MYSTERY_BOX', 'MysteryBox', box.id, { startAt: box.startAt });
    res.json({ box: serializeAdminBox(await findFullBox({ id: box.id })) });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/mystery-boxes/:id/deactivate', ...admins, async (req, res, next) => {
  try {
    const box = await findFullBox({ id: parseId(req.params.id, 'Mystery box') });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    await box.update({ status: 'draft' });
    await recordAudit(req, 'DEACTIVATE_MYSTERY_BOX', 'MysteryBox', box.id);
    res.json({ box: serializeAdminBox(await findFullBox({ id: box.id })) });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/mystery-boxes/:id/archive', ...admins, async (req, res, next) => {
  try {
    const box = await findFullBox({ id: parseId(req.params.id, 'Mystery box') });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    await box.update({ status: 'archived' });
    await recordAudit(req, 'ARCHIVE_MYSTERY_BOX', 'MysteryBox', box.id);
    res.json({ box: serializeAdminBox(await findFullBox({ id: box.id })) });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/mystery-boxes/:id/stats', ...admins, async (req, res, next) => {
  try {
    const box = await findFullBox({ id: parseId(req.params.id, 'Mystery box') });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const purchases = await MysteryBoxPurchase.findAll({
      where: { boxId: box.id, status: { [Op.in]: ACTIVE_PURCHASE_STATUSES } },
      attributes: ['id', 'amountTotal', 'amountShipping', 'boxSnapshot'],
      raw: true
    });
    const revenue = purchases.reduce((sum, row) => sum + Number(row.amountTotal || 0), 0);
    const shippingRevenue = purchases.reduce((sum, row) => sum + Number(row.amountShipping || 0), 0);
    const itemsSold = purchases.reduce((sum, row) => {
      const items = row.boxSnapshot?.items || [];
      return sum + items.reduce((count, item) => count + Number(item.quantity || 1), 0);
    }, 0);
    const views = Number(box.viewCount || 0);
    const clicks = Number(box.headerClickCount || 0);
    res.json({
      boxId: box.id,
      state: computeMysteryBoxState(box),
      stock: {
        limit: box.stockLimit,
        sold: box.stockSold,
        reserved: box.stockReserved,
        remaining: remainingStock(box)
      },
      sales: purchases.length,
      revenue: money(revenue),
      shippingRevenue: money(shippingRevenue),
      itemsSold,
      detailViews: views,
      headerClicks: clicks,
      conversion: {
        headerClickToView: clicks ? Math.round((views / clicks) * 100) : 0,
        viewToPurchase: views ? Math.round((purchases.length / views) * 100) : 0
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/mystery-boxes/:id/purchases', ...admins, async (req, res, next) => {
  try {
    const box = await MysteryBox.findByPk(parseId(req.params.id, 'Mystery box'), {
      include: [{ model: MysteryBoxAppearance, as: 'appearance' }]
    });
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const where = { boxId: box.id };
    const shippingStatus = req.query.shippingStatus || req.query.tab;
    if (shippingStatus) where.shippingStatus = shippingStatus;
    if (req.query.status) where.status = req.query.status;
    const purchases = await MysteryBoxPurchase.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'language'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({
      items: purchases.map((purchase) => ({
        ...serializePurchase(purchase, { language: requestedLanguage(req.query.lang), reveal: true, box }),
        user: purchase.user ? {
          id: purchase.user.id,
          name: `${purchase.user.firstName} ${purchase.user.lastName}`.trim(),
          email: purchase.user.email
        } : null
      })),
      total: purchases.length
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/mystery-boxes/purchases/:purchaseId/shipping', ...admins, validateBody(schemas.purchaseShippingSchema), async (req, res, next) => {
  try {
    const result = await markMysteryBoxShipped(parseId(req.params.purchaseId, 'Purchase'), {
      trackingNumber: req.body.trackingNumber,
      carrier: req.body.carrier,
      shippingStatus: req.body.shippingStatus || 'shipped'
    });
    await recordAudit(req, 'SHIP_MYSTERY_BOX', 'MysteryBoxPurchase', result.purchase.id, {
      carrier: req.body.carrier,
      shippingStatus: req.body.shippingStatus || 'shipped'
    });
    res.json({
      purchase: serializePurchase(result.purchase, { reveal: true }),
      emailSent: result.emailSent
    });
  } catch (error) {
    next(error);
  }
});

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

router.get('/admin/mystery-boxes/:id/export.csv', ...admins, async (req, res, next) => {
  try {
    const box = await MysteryBox.findByPk(parseId(req.params.id, 'Mystery box'));
    if (!box) return res.status(404).json({ message: 'Mystery box not found.' });
    const purchases = await MysteryBoxPurchase.findAll({
      where: { boxId: box.id, status: { [Op.in]: ACTIVE_PURCHASE_STATUSES } },
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'ASC']]
    });
    const header = [
      'purchase_id', 'created_at', 'status', 'buyer', 'email', 'phone', 'address', 'city',
      'postal_code', 'country', 'total', 'currency', 'price_tier', 'shipping_status',
      'carrier', 'tracking_number', 'items'
    ];
    const lines = purchases.map((purchase) => {
      const address = purchase.shippingAddress || {};
      const items = (purchase.boxSnapshot?.items || [])
        .map((item) => `${item.displayName} x${item.quantity || 1}`)
        .join(' | ');
      return [
        purchase.id,
        purchase.createdAt?.toISOString?.() || purchase.createdAt,
        purchase.status,
        purchase.user ? `${purchase.user.firstName} ${purchase.user.lastName}`.trim() : '',
        purchase.user?.email || '',
        address.phone || '',
        [address.line1, address.line2].filter(Boolean).join(' '),
        address.city || '',
        address.postalCode || '',
        address.country || '',
        purchase.amountTotal,
        purchase.currency,
        purchase.priceTier,
        purchase.shippingStatus || '',
        purchase.carrier || '',
        purchase.trackingNumber || '',
        items
      ].map(csvCell).join(',');
    });
    const body = `\uFEFF${[header.join(','), ...lines].join('\r\n')}\r\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mystery-box-${box.slug}-buyers.csv"`);
    res.send(body);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.serializeAdminBox = serializeAdminBox;
module.exports.findFullBox = findFullBox;
