const crypto = require('node:crypto');
const { Op } = require('sequelize');
const {
  BadgeAward,
  BadgeType,
  Book,
  Certificate,
  DonationCampaign,
  Entitlement,
  MysteryBox,
  MysteryBoxAppearance,
  MysteryBoxItem,
  MysteryBoxPurchase,
  MysteryBoxShipping,
  PromoCode,
  User,
  sequelize
} = require('../models');
const {
  DEFAULT_DIGITAL_CONSENT,
  computeMysteryBoxState,
  effectivePrice,
  isPhysicalItem,
  localizedBoxField,
  localizedItemField,
  money,
  physicalCheckoutIssue,
  remainingStock,
  shippingFeeFor
} = require('./mysteryBox');
const { getClientAppUrl } = require('./stripe');
const { sendTemplateEmail } = require('./email');

// Stripe Checkout requires expires_at to be at least 30 minutes ahead, so the
// reservation lasts 31 minutes to absorb the session-creation round trip.
const RESERVATION_MINUTES = 31;
const ACTIVE_PURCHASE_STATUSES = ['paid', 'fulfilled', 'partially_fulfilled'];
const PAID_OR_PENDING = [...ACTIVE_PURCHASE_STATUSES, 'pending'];

function serviceError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days) * 24 * 60 * 60 * 1000);
}

function normalizeStripeAddress(session) {
  const details = session?.collected_information?.shipping_details || session?.shipping_details || null;
  const address = details?.address || session?.customer_details?.address || null;
  if (!details && !address) return null;
  return {
    name: details?.name || session?.customer_details?.name || '',
    line1: address?.line1 || '',
    line2: address?.line2 || '',
    postalCode: address?.postal_code || '',
    city: address?.city || '',
    country: address?.country || '',
    phone: session?.customer_details?.phone || ''
  };
}

function snapshotItem(item) {
  return {
    itemId: item.id,
    type: item.type,
    referenceId: item.referenceId,
    quantity: item.quantity,
    durationDays: item.durationDays,
    displayName: item.displayName,
    teaserText: item.teaserText,
    translations: item.translations || {},
    estimatedValue: item.estimatedValue === null ? null : money(item.estimatedValue),
    imageUrl: item.imageUrl,
    weightGrams: item.weightGrams,
    sku: item.sku,
    tracksStock: isPhysicalItem(item) && item.itemStock !== null && item.itemStock !== undefined,
    isPhysical: isPhysicalItem(item)
  };
}

async function restoreItemStock(itemsSnapshot = [], transaction) {
  for (const item of itemsSnapshot) {
    if (!item.tracksStock || !item.itemId) continue;
    const row = await MysteryBoxItem.findByPk(item.itemId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!row || row.itemStock === null) continue;
    row.itemStock += Number(item.quantity || 1);
    await row.save({ transaction });
  }
}

async function cancelPendingPurchase(purchase, transaction) {
  const box = await MysteryBox.findByPk(purchase.boxId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (box) {
    box.stockReserved = Math.max(0, Number(box.stockReserved || 0) - 1);
    await box.save({ transaction });
  }
  await restoreItemStock(purchase.boxSnapshot?.items || [], transaction);
  await purchase.update({
    status: 'cancelled',
    reservationExpiresAt: null
  }, { transaction });
  return purchase;
}

async function createMysteryBoxReservation({
  boxId,
  userId,
  country,
  consent = false,
  language = 'ar',
  now = new Date()
}) {
  const transaction = await sequelize.transaction();
  try {
    const box = await MysteryBox.findByPk(boxId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!box) throw serviceError(404, 'Mystery box not found.', 'BOX_NOT_FOUND');

    const items = await MysteryBoxItem.findAll({
      where: { boxId },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const shipping = await MysteryBoxShipping.findOne({ where: { boxId }, transaction });

    const state = computeMysteryBoxState(box, now);
    if (state === 'sold_out') throw serviceError(409, 'This box is sold out.', 'BOX_SOLD_OUT');
    if (state !== 'active') throw serviceError(409, 'This box is not on sale.', 'BOX_NOT_ACTIVE');

    const physicalIssue = physicalCheckoutIssue({ items, box, shipping });
    if (physicalIssue) {
      throw serviceError(physicalIssue.status, physicalIssue.message, physicalIssue.code);
    }

    const digitalCount = items.filter((item) => !isPhysicalItem(item)).length;
    if (digitalCount && consent !== true) {
      throw serviceError(400, 'Digital content consent is required.', 'DIGITAL_CONSENT_REQUIRED');
    }
    if (remainingStock(box) !== null && remainingStock(box) <= 0) {
      throw serviceError(409, 'This box is sold out.', 'BOX_SOLD_OUT');
    }

    const limit = Math.max(1, Number(box.perUserLimit || 1));
    const previous = await MysteryBoxPurchase.count({
      where: {
        userId,
        boxId,
        [Op.or]: [
          { status: { [Op.in]: ACTIVE_PURCHASE_STATUSES } },
          { status: 'pending', reservationExpiresAt: { [Op.gt]: now } }
        ]
      },
      transaction
    });
    if (previous >= limit) {
      throw serviceError(409, 'The per-person limit for this box has been reached.', 'PER_USER_LIMIT');
    }

    const price = effectivePrice(box, now);
    const requiresShipping = Boolean(box.requiresShipping) || items.some(isPhysicalItem);
    let shippingFee = { amountMinor: 0, amount: '0.00', freeShipping: true, country: null };
    if (requiresShipping) {
      if (!country) throw serviceError(400, 'A shipping country is required.', 'COUNTRY_REQUIRED');
      shippingFee = shippingFeeFor({
        shipping,
        country,
        subtotal: price.amount,
        currency: price.currency
      });
    }

    for (const item of items) {
      if (!isPhysicalItem(item) || item.itemStock === null || item.itemStock === undefined) continue;
      if (Number(item.itemStock) < Number(item.quantity || 1)) {
        throw serviceError(409, 'A physical item in this box is out of stock.', 'ITEM_OUT_OF_STOCK');
      }
    }
    for (const item of items) {
      if (!isPhysicalItem(item) || item.itemStock === null || item.itemStock === undefined) continue;
      item.itemStock = Number(item.itemStock) - Number(item.quantity || 1);
      await item.save({ transaction });
    }

    box.stockReserved = Number(box.stockReserved || 0) + 1;
    await box.save({ transaction });

    const totalMinor = price.amountMinor + shippingFee.amountMinor;
    const reservationExpiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000);
    const purchase = await MysteryBoxPurchase.create({
      boxId: box.id,
      userId,
      status: 'pending',
      amountItems: price.amount,
      amountShipping: shippingFee.amount,
      amountTotal: (totalMinor / 100).toFixed(2),
      currency: price.currency,
      priceTier: price.tier,
      returnPolicySnapshot: box.returnPolicy || 'none',
      digitalContentConsent: consent === true,
      digitalContentConsentAt: consent === true ? now : null,
      shippingAddress: null,
      itemsFulfillment: [],
      boxSnapshot: {
        slug: box.slug,
        title: box.title,
        translations: box.translations || {},
        seasonLabel: box.seasonLabel,
        language,
        priceTier: price.tier,
        currency: price.currency,
        digitalConsentText: (language !== 'ar' && box.translations?.[language]?.digitalConsentText) ||
          box.digitalConsentText || DEFAULT_DIGITAL_CONSENT[language] || DEFAULT_DIGITAL_CONSENT.ar,
        requiresShipping,
        items: items.map(snapshotItem),
        shipping: shipping ? {
          shippingFee: money(shipping.shippingFee),
          freeShippingThreshold: shipping.freeShippingThreshold === null ? null : money(shipping.freeShippingThreshold),
          estimatedDeliveryMinDays: shipping.estimatedDeliveryMinDays,
          estimatedDeliveryMaxDays: shipping.estimatedDeliveryMaxDays,
          carrier: shipping.carrier || null,
          shipsFrom: shipping.shipsFrom || null,
          shippingStartDate: shipping.shippingStartDate,
          note: shipping.shippingNote || null,
          translations: shipping.translations || {}
        } : null
      },
      reservationExpiresAt
    }, { transaction });

    await transaction.commit();
    return { purchase, box, items, shipping, price, shippingFee };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function releaseMysteryBoxReservation(purchaseId) {
  const transaction = await sequelize.transaction();
  try {
    const purchase = await MysteryBoxPurchase.findByPk(purchaseId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!purchase || purchase.status !== 'pending') {
      await transaction.commit();
      return null;
    }
    await cancelPendingPurchase(purchase, transaction);
    await transaction.commit();
    return purchase;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function fulfillItem(item, purchase, transaction) {
  const now = new Date();
  switch (item.type) {
    case 'ebook': {
      if (!item.referenceId) break;
      const book = await Book.findByPk(item.referenceId, { transaction });
      if (!book) break;
      const [entitlement] = await Entitlement.findOrCreate({
        where: {
          userId: purchase.userId,
          mysteryBoxPurchaseId: purchase.id,
          resourceType: 'book',
          resourceId: book.id
        },
        defaults: {
          userId: purchase.userId,
          mysteryBoxPurchaseId: purchase.id,
          resourceType: 'book',
          resourceId: book.id,
          source: 'mystery_box',
          startsAt: now,
          expiresAt: null
        },
        transaction
      });
      return entitlement ? { entitlementId: entitlement.id } : null;
    }
    case 'story_rental': {
      if (!item.referenceId) break;
      const days = Math.max(1, Number(item.durationDays || 30));
      const entitlement = await Entitlement.create({
        userId: purchase.userId,
        mysteryBoxPurchaseId: purchase.id,
        resourceType: 'story',
        resourceId: item.referenceId,
        source: 'rental',
        startsAt: now,
        expiresAt: addDays(now, days)
      }, { transaction });
      return { entitlementId: entitlement.id };
    }
    case 'premium_access_days': {
      const days = Math.max(1, Number(item.durationDays || 30));
      const current = await Entitlement.findAll({
        where: {
          userId: purchase.userId,
          resourceType: 'premium',
          revokedAt: null,
          [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }]
        },
        transaction
      });
      const latest = current.reduce((max, entitlement) =>
        entitlement.expiresAt && new Date(entitlement.expiresAt) > max ? new Date(entitlement.expiresAt) : max, now);
      const entitlement = await Entitlement.create({
        userId: purchase.userId,
        mysteryBoxPurchaseId: purchase.id,
        resourceType: 'premium',
        resourceId: 0,
        source: 'mystery_box',
        startsAt: now,
        expiresAt: addDays(latest, days)
      }, { transaction });
      return { entitlementId: entitlement.id };
    }
    case 'badge': {
      if (!item.referenceId) break;
      const badgeType = await BadgeType.findByPk(item.referenceId, { transaction });
      if (!badgeType) break;
      const [award] = await BadgeAward.findOrCreate({
        where: {
          userId: purchase.userId,
          badgeTypeId: badgeType.id,
          sourceType: 'custom',
          sourceId: purchase.boxId
        },
        defaults: {
          userId: purchase.userId,
          badgeTypeId: badgeType.id,
          sourceType: 'custom',
          sourceId: purchase.boxId,
          awardedAt: now,
          metadata: { mysteryBoxPurchaseId: purchase.id }
        },
        transaction
      });
      return award ? { badgeAwardId: award.id } : null;
    }
    case 'certificate': {
      const certificate = await Certificate.create({
        userId: purchase.userId,
        title: localizedItemField(item, 'ar', 'displayName') || item.displayName,
        verificationCode: crypto.randomBytes(16).toString('hex').toUpperCase(),
        issuedAt: now
      }, { transaction });
      return { certificateId: certificate.id };
    }
    case 'promo_coupon': {
      const code = `BOX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const promo = await PromoCode.create({
        code,
        kind: 'fixed',
        appliesTo: 'all',
        value: item.estimatedValue === null ? 0 : money(item.estimatedValue),
        currency: purchase.currency,
        maxUses: 1,
        usedCount: 0,
        perUserLimit: 1,
        isActive: true
      }, { transaction });
      return { promoCodeId: promo.id, promoCode: promo.code };
    }
    case 'sponsored_book_donation': {
      if (!item.referenceId) break;
      const campaign = await DonationCampaign.findByPk(item.referenceId, { transaction });
      if (!campaign) break;
      campaign.sponsoredBooksCount = Number(campaign.sponsoredBooksCount || 0) + Number(item.quantity || 1);
      await campaign.save({ transaction });
      return { donationCampaignId: campaign.id };
    }
    default:
      break;
  }
  return null;
}

async function settleMysteryBoxPurchase(session, nextStatus, transaction) {
  const purchaseId = Number(session?.metadata?.mysteryBoxPurchaseId);
  const purchase = Number.isSafeInteger(purchaseId) && purchaseId > 0
    ? await MysteryBoxPurchase.findByPk(purchaseId, { transaction, lock: transaction.LOCK.UPDATE })
    : await MysteryBoxPurchase.findOne({
      where: { stripeCheckoutSessionId: session?.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
  if (!purchase) {
    throw new Error(`Mystery box purchase for Stripe session ${session?.id} was not found.`);
  }
  if (purchase.status !== 'pending') return null;

  if (nextStatus !== 'paid') {
    await cancelPendingPurchase(purchase, transaction);
    return purchase;
  }

  const now = new Date();
  const box = await MysteryBox.findByPk(purchase.boxId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (box) {
    box.stockReserved = Math.max(0, Number(box.stockReserved || 0) - 1);
    box.stockSold = Number(box.stockSold || 0) + 1;
    await box.save({ transaction });
  }

  const snapshotItems = purchase.boxSnapshot?.items || [];
  const fulfillment = [];
  for (const item of snapshotItems) {
    const record = {
      itemId: item.itemId,
      type: item.type,
      displayName: item.displayName,
      isPhysical: Boolean(item.isPhysical),
      status: 'pending',
      deliveredAt: null
    };
    if (!item.isPhysical) {
      const result = await fulfillItem(item, purchase, transaction);
      record.status = 'delivered';
      record.deliveredAt = now.toISOString();
      if (result) Object.assign(record, result);
    }
    fulfillment.push(record);
  }
  const hasPhysical = Boolean(purchase.boxSnapshot?.requiresShipping) ||
    fulfillment.some((item) => item.isPhysical);
  const shippingAddress = normalizeStripeAddress(session);

  await purchase.update({
    status: hasPhysical ? 'partially_fulfilled' : 'fulfilled',
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null,
    revealedAt: purchase.revealedAt || now,
    reservationExpiresAt: null,
    itemsFulfillment: fulfillment,
    shippingStatus: hasPhysical ? 'to_ship' : null,
    ...(shippingAddress ? { shippingAddress } : {})
  }, { transaction });

  return purchase;
}

async function refundMysteryBoxPurchase(charge, transaction) {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!charge.refunded || !paymentIntentId) return null;
  const purchase = await MysteryBoxPurchase.findOne({
    where: {
      stripePaymentIntentId: paymentIntentId,
      status: { [Op.in]: ['paid', 'fulfilled', 'partially_fulfilled'] }
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!purchase) return null;

  await Entitlement.update({ revokedAt: new Date() }, {
    where: { mysteryBoxPurchaseId: purchase.id, revokedAt: null },
    transaction
  });
  const promoIds = (purchase.itemsFulfillment || []).map((item) => item.promoCodeId).filter(Boolean);
  if (promoIds.length) {
    await PromoCode.update({ isActive: false }, {
      where: { id: { [Op.in]: promoIds } },
      transaction
    });
  }

  const hasPhysical = Boolean(purchase.boxSnapshot?.requiresShipping) ||
    (purchase.boxSnapshot?.items || []).some((item) => item.isPhysical);
  const alreadyShipped = ['shipped', 'delivered'].includes(purchase.shippingStatus);
  if (!hasPhysical || !alreadyShipped) {
    await restoreItemStock(purchase.boxSnapshot?.items || [], transaction);
    const box = await MysteryBox.findByPk(purchase.boxId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (box) {
      box.stockSold = Math.max(0, Number(box.stockSold || 0) - 1);
      await box.save({ transaction });
    }
  }

  await purchase.update({
    status: 'refunded',
    returnNeeded: alreadyShipped
  }, { transaction });
  return purchase;
}

async function releaseExpiredMysteryBoxReservations(limit = 50) {
  const expired = await MysteryBoxPurchase.findAll({
    where: {
      status: 'pending',
      reservationExpiresAt: { [Op.lt]: new Date() }
    },
    order: [['reservationExpiresAt', 'ASC']],
    limit
  });
  let released = 0;
  for (const row of expired) {
    const transaction = await sequelize.transaction();
    try {
      const purchase = await MysteryBoxPurchase.findByPk(row.id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (purchase?.status === 'pending') {
        await cancelPendingPurchase(purchase, transaction);
        released += 1;
      }
      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      console.error('Échec de la libération d’une réservation Mystery Box :', error);
    }
  }
  return released;
}

async function refreshMysteryBoxStatuses() {
  const now = new Date();
  const [activated] = await MysteryBox.update({ status: 'active' }, {
    where: {
      status: 'scheduled',
      startAt: { [Op.lte]: now },
      endAt: { [Op.gt]: now }
    }
  });
  const [ended] = await MysteryBox.update({ status: 'ended' }, {
    where: {
      status: { [Op.in]: ['scheduled', 'active'] },
      endAt: { [Op.lte]: now }
    }
  });
  return { activated, ended };
}

function deliveryEstimateFor(language, shipping) {
  if (!shipping) return '';
  const min = Number(shipping.estimatedDeliveryMinDays);
  const max = Number(shipping.estimatedDeliveryMaxDays);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '';
  if (language === 'en') return `${min}–${max} business days`;
  if (language === 'fr') return `${min} à ${max} jours ouvrés`;
  return `من ${min} إلى ${max} أيام عمل`;
}

function purchaseLanguage(user) {
  return ['ar', 'en', 'fr'].includes(user?.language) ? user.language : 'ar';
}

async function sendMysteryBoxPurchaseEmail(purchaseId) {
  const purchase = await MysteryBoxPurchase.findByPk(purchaseId, {
    include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'language', 'email'] }]
  });
  if (!purchase?.user) return false;
  const language = purchaseLanguage(purchase.user);
  const snapshot = purchase.boxSnapshot || {};
  const items = (snapshot.items || [])
    .map((item) => `${localizedItemField(item, language, 'displayName') || item.displayName} ×${item.quantity || 1}`)
    .join(' · ');
  const sent = await sendTemplateEmail({
    templateCode: 'mystery_box_purchase',
    to: purchase.user.email,
    language,
    variables: {
      firstName: purchase.user.firstName,
      boxTitle: localizedBoxField(snapshot, language, 'title') || snapshot.title || '',
      items,
      total: purchase.amountTotal,
      currency: purchase.currency,
      deliveryEstimate: deliveryEstimateFor(language, snapshot.shipping) || '—',
      actionUrl: `${getClientAppUrl()}/${language}/profile?tab=mystery-boxes`
    },
    purpose: 'mystery box purchase confirmation'
  });
  if (!sent) throw new Error('The mystery_box_purchase email template is missing or inactive.');
  return true;
}

async function sendMysteryBoxShippingEmail(purchaseId) {
  const purchase = await MysteryBoxPurchase.findByPk(purchaseId, {
    include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'language', 'email'] }]
  });
  if (!purchase?.user) return false;
  const language = purchaseLanguage(purchase.user);
  const snapshot = purchase.boxSnapshot || {};
  const sent = await sendTemplateEmail({
    templateCode: 'mystery_box_shipping',
    to: purchase.user.email,
    language,
    variables: {
      firstName: purchase.user.firstName,
      boxTitle: localizedBoxField(snapshot, language, 'title') || snapshot.title || '',
      carrier: purchase.carrier || '—',
      trackingNumber: purchase.trackingNumber || '—',
      actionUrl: `${getClientAppUrl()}/${language}/profile?tab=mystery-boxes`
    },
    purpose: 'mystery box shipping confirmation'
  });
  if (!sent) throw new Error('The mystery_box_shipping email template is missing or inactive.');
  return true;
}

async function markMysteryBoxShipped(purchaseId, { trackingNumber, carrier, shippingStatus = 'shipped' }) {
  const transaction = await sequelize.transaction();
  let purchase;
  try {
    purchase = await MysteryBoxPurchase.findByPk(purchaseId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!purchase) throw serviceError(404, 'Mystery box purchase not found.', 'PURCHASE_NOT_FOUND');
    if (!ACTIVE_PURCHASE_STATUSES.includes(purchase.status)) {
      throw serviceError(409, 'Only paid purchases can be shipped.', 'PURCHASE_NOT_PAID');
    }
    if (!purchase.shippingStatus || ['delivered', 'returned'].includes(purchase.shippingStatus)) {
      throw serviceError(409, 'This purchase has no pending shipment.', 'NO_PENDING_SHIPMENT');
    }
    await purchase.update({
      shippingStatus,
      trackingNumber: trackingNumber || purchase.trackingNumber,
      carrier: carrier || purchase.carrier,
      shippedAt: shippingStatus === 'shipped' ? (purchase.shippedAt || new Date()) : purchase.shippedAt,
      deliveredAt: shippingStatus === 'delivered' ? (purchase.deliveredAt || new Date()) : purchase.deliveredAt,
      status: shippingStatus === 'delivered' ? 'fulfilled' : purchase.status
    }, { transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }

  let emailSent = false;
  if (shippingStatus === 'shipped') {
    try {
      emailSent = await sendMysteryBoxShippingEmail(purchase.id);
    } catch (error) {
      console.error('Échec de l’e-mail d’expédition Mystery Box :', error);
    }
  }
  return { purchase: await MysteryBoxPurchase.findByPk(purchase.id), emailSent };
}

function serializePurchase(purchase, { language = 'ar', reveal = false, box = null } = {}) {
  const snapshot = purchase.boxSnapshot || {};
  const records = purchase.itemsFulfillment || [];
  const statusByItem = new Map(records.map((record) => [Number(record.itemId), record]));
  const items = (snapshot.items || []).map((item) => {
    const record = statusByItem.get(Number(item.itemId));
    return {
      id: item.itemId,
      type: item.type,
      displayName: reveal ? localizedItemField(item, language, 'displayName') : null,
      teaserText: localizedItemField(item, language, 'teaserText') || null,
      quantity: item.quantity,
      isPhysical: Boolean(item.isPhysical),
      estimatedValue: reveal && item.estimatedValue !== null ? money(item.estimatedValue) : null,
      imageUrl: reveal ? item.imageUrl : null,
      fulfillmentStatus: record?.status || 'pending',
      deliveredAt: record?.deliveredAt || null,
      promoCode: record?.promoCode || null
    };
  });
  return {
    id: purchase.id,
    status: purchase.status,
    amountItems: money(purchase.amountItems),
    amountShipping: money(purchase.amountShipping),
    amountTotal: money(purchase.amountTotal),
    currency: purchase.currency,
    priceTier: purchase.priceTier,
    digitalContentConsent: purchase.digitalContentConsent,
    items,
    itemCount: items.length,
    shippingAddress: purchase.shippingAddress,
    shippingStatus: purchase.shippingStatus,
    trackingNumber: purchase.trackingNumber,
    carrier: purchase.carrier,
    shippedAt: purchase.shippedAt,
    returnNeeded: purchase.returnNeeded,
    revealedAt: purchase.revealedAt,
    createdAt: purchase.createdAt,
    box: {
      id: purchase.boxId,
      slug: box?.slug || snapshot.slug,
      title: localizedBoxField(box || snapshot, language, 'title') || snapshot.title,
      tagline: localizedBoxField(box || snapshot, language, 'tagline') || '',
      seasonLabel: box?.seasonLabel || snapshot.seasonLabel || '',
      appearance: box?.appearance ? {
        headerLabel: box.appearance.headerLabel,
        icon: box.appearance.icon,
        colorFrom: box.appearance.colorFrom,
        colorTo: box.appearance.colorTo,
        accentColor: box.appearance.accentColor,
        animationStyle: box.appearance.animationStyle
      } : null
    }
  };
}

async function loadPublicBoxBySlug(slug) {
  return MysteryBox.findOne({
    where: { slug },
    include: [
      { model: MysteryBoxItem, as: 'items' },
      { model: MysteryBoxShipping, as: 'shipping' },
      { model: MysteryBoxAppearance, as: 'appearance' }
    ]
  });
}

module.exports = {
  RESERVATION_MINUTES,
  ACTIVE_PURCHASE_STATUSES,
  PAID_OR_PENDING,
  createMysteryBoxReservation,
  releaseMysteryBoxReservation,
  settleMysteryBoxPurchase,
  refundMysteryBoxPurchase,
  releaseExpiredMysteryBoxReservations,
  refreshMysteryBoxStatuses,
  markMysteryBoxShipped,
  sendMysteryBoxPurchaseEmail,
  sendMysteryBoxShippingEmail,
  serializePurchase,
  deliveryEstimateFor,
  normalizeStripeAddress,
  loadPublicBoxBySlug
};
