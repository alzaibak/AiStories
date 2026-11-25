const { Op } = require('sequelize');
const {
  sequelize,
  StoreOrder,
  StoreOrderItem,
  Book,
  User,
  ReturnRequest,
  ReturnItem,
  ReturnRefund,
  ReturnEvent,
  RETURN_STATUSES,
  AuditLog,
  MysteryBoxPurchase,
  MysteryBox,
  PromoCodeRedemption
} = require('../../models');
const { createStripeClient } = require('../stripe');
const { calculateRefund, explainRefund, toMinor, fromMinor } = require('./refundCalculator');
const { allocateDiscount, resolveOrderPaidMinor } = require('./orderAmounts');
const policy = require('./policy');
const { notifyReturn } = require('./emails');

const DAY_MS = policy.DAY_MS;
const INACTIVE_STATUSES = ['cancelled', 'rejected', 'expired'];
const OPEN_STATUSES = ['requested', 'approved', 'awaiting_shipment', 'shipped_back', 'received', 'inspected', 'refund_pending'];
const ELIGIBLE_AFTER_SHIP = ['approved', 'awaiting_shipment'];
const REMINDER_DAYS_BEFORE = 3;

function serviceError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

const { formatMoney, formatDate, returnActionUrl, tokenFor } = require('./format');

function returnUrl(request, language = 'ar') {
  return returnActionUrl(request.id, language);
}

function moneyString(minor) {
  return fromMinor(minor);
}

async function nextRmaNumber(transaction) {
  const year = new Date().getFullYear();
  const prefix = `RET-${year}-`;
  const last = await ReturnRequest.findOne({
    where: { rmaNumber: { [Op.like]: `${prefix}%` } },
    attributes: ['rmaNumber'],
    order: [['rmaNumber', 'DESC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  const next = last ? Number(String(last.rmaNumber).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(next) ? next : 1).padStart(5, '0')}`;
}

async function recordEvent(returnRequestId, { actorType, actorId = null, eventType, note = null, metadata = {} }, transaction) {
  return ReturnEvent.create({
    returnRequestId,
    actorType,
    actorId,
    eventType,
    note,
    metadata
  }, { transaction });
}

function loadOrder(orderId, { userId = null, transaction = null } = {}) {
  return StoreOrder.findOne({
    where: { id: orderId, ...(userId ? { userId } : {}) },
    include: [
      {
        model: StoreOrderItem,
        as: 'items',
        include: [{ model: Book, as: 'book', attributes: ['id', 'title', 'format', 'isReturnable', 'returnWindowDays', 'cover'] }]
      },
      { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'language', 'returnsBlocked'] }
    ],
    transaction
  });
}

/**
 * Real discount of an order: the stored discount first, then the promo
 * redemption as a fallback for orders created before discountAmount was kept.
 */
async function orderDiscountMinor(order, transaction = null) {
  const subtotal = Math.max(0, toMinor(order.subtotal));
  const stored = Math.max(0, toMinor(order.discountAmount));
  if (stored > 0) return Math.min(stored, subtotal);
  const redemption = await PromoCodeRedemption.findOne({
    where: { orderId: order.id, status: { [Op.in]: ['pending', 'redeemed'] } },
    attributes: ['amountDiscounted'],
    order: [['id', 'DESC']],
    transaction
  });
  return redemption ? Math.min(Math.max(0, toMinor(redemption.amountDiscounted)), subtotal) : 0;
}

/** Amount Stripe captured for the order (snapshot at settlement, else derived). */
async function orderPaidMinor(order, items, discountMinor, transaction = null) {
  const printItems = (items || []).filter((item) => item.book?.format === 'print');
  const amounts = resolveOrderPaidMinor({
    subtotalMinor: toMinor(order.subtotal),
    totalMinor: toMinor(order.total),
    discountMinor,
    shippingChargedMinor: orderFeeSnapshot(order, printItems, 'shippingFeeCharged', null),
    capturedMinor: order.paidAmount === null || order.paidAmount === undefined ? null : toMinor(order.paidAmount)
  });
  return amounts;
}

async function submittedReturnTotals({ orderId = null, mysteryBoxPurchaseId = null, transaction = null }) {
  const where = { status: { [Op.notIn]: INACTIVE_STATUSES } };
  if (orderId) where.orderId = orderId;
  if (mysteryBoxPurchaseId) where.mysteryBoxPurchaseId = mysteryBoxPurchaseId;
  const requests = await ReturnRequest.findAll({
    where,
    include: [{ model: ReturnItem, as: 'items', attributes: ['id', 'sourceType', 'orderItemId', 'mysteryBoxItemId', 'quantity', 'deliveryFeeDeduction', 'refundAmount'] }],
    transaction
  });
  const quantities = new Map();
  let deductedFeeMinor = 0;
  let submittedRefundMinor = 0;
  for (const request of requests) {
    for (const item of request.items) {
      const key = item.sourceType === 'mystery_box_item'
        ? `box:${item.mysteryBoxItemId}`
        : `item:${item.orderItemId}`;
      quantities.set(key, (quantities.get(key) || 0) + Number(item.quantity || 0));
      deductedFeeMinor += toMinor(item.deliveryFeeDeduction);
      submittedRefundMinor += toMinor(item.refundAmount);
    }
  }
  return { quantities, deductedFeeMinor, submittedRefundMinor, requests };
}

function orderFeeSnapshot(order, printItems, key, fallbackMinor) {
  const snapshot = printItems
    .map((item) => item[key])
    .find((value) => value !== null && value !== undefined);
  if (snapshot !== null && snapshot !== undefined) return toMinor(snapshot);
  return fallbackMinor;
}

function normalizeSelection(selection, defaults) {
  const wanted = Array.isArray(selection) && selection.length ? selection : defaults;
  const quantities = new Map();
  for (const entry of wanted) {
    const key = Number(entry.orderItemId ?? entry.mysteryBoxItemId ?? entry.id);
    const quantity = Math.max(0, Math.floor(Number(entry.quantity ?? 1)));
    if (!Number.isSafeInteger(key) || key < 1 || quantity < 1) continue;
    quantities.set(key, (quantities.get(key) || 0) + quantity);
  }
  return quantities;
}

/**
 * Eligibility + exact refund preview for every physical book of an order.
 * `selection` (optional) limits the request to some items and quantities.
 */
async function orderReturnQuote({
  orderId,
  userId = null,
  selection = null,
  sellerFault = false,
  settings = null,
  language = 'fr',
  now = new Date(),
  transaction = null
}) {
  const activeSettings = settings || await policy.getReturnPolicy();
  const order = await loadOrder(orderId, { userId, transaction });
  if (!order) throw serviceError(404, 'Order not found.');

  const items = order.items || [];
  const printItems = items.filter((item) => item.book?.format === 'print');
  const discountMinor = await orderDiscountMinor(order, transaction);
  // The discount belongs to the whole cart, so allocate it over every line and
  // use the net value of each item from then on: gross prices must never reach
  // the refund math on a discounted order.
  const allocatedNet = allocateDiscount(
    items.map((item) => toMinor(item.unitPrice) * Math.max(0, Number(item.quantity) || 0)),
    discountMinor
  );
  const netByItemId = new Map(items.map((item, index) => [item.id, allocatedNet[index]]));
  const paidAmounts = await orderPaidMinor(order, items, discountMinor, transaction);
  const orderPaidMinorValue = paidAmounts.paidMinor;
  const definedFeeMinor = orderFeeSnapshot(order, printItems, 'definedShippingFee', paidAmounts.shippingMinor);
  const chargedFeeMinor = orderFeeSnapshot(order, printItems, 'shippingFeeCharged', paidAmounts.shippingMinor);

  const totals = await submittedReturnTotals({ orderId: order.id, transaction });
  const delivery = policy.resolveDeliveryDate({
    deliveredAt: order.deliveredAt,
    shippedAt: order.shippedAt,
    fallbackDays: activeSettings.defaultDeliveryEstimateDays,
    now
  });
  const daysSinceDelivery = delivery.date ? policy.daysBetween(delivery.date, now) : null;

  const baseEligibility = [];
  if (!activeSettings.returnsEnabled) baseEligibility.push('returns_disabled');
  if (order.status !== 'paid') baseEligibility.push('order_not_paid');
  if (!delivery.date) baseEligibility.push('delivery_date_unknown');

  const candidates = items.map((item) => {
    const totalQuantity = Number(item.quantity || 0);
    const returnedQuantity = totals.quantities.get(`item:${item.id}`) || 0;
    const remainingQuantity = Math.max(0, totalQuantity - returnedQuantity);
    const allocatedNetMinor = netByItemId.get(item.id) ?? toMinor(item.unitPrice) * totalQuantity;
    const snapshotMinor = item.pricePaidAfterDiscount === null || item.pricePaidAfterDiscount === undefined
      ? null
      : Math.max(0, toMinor(item.pricePaidAfterDiscount));
    // A stored snapshot is trusted only when it is lower than the allocated net
    // value (previous manual adjustment); a legacy gross snapshot never wins.
    const pricePaidMinor = snapshotMinor !== null && snapshotMinor < allocatedNetMinor
      ? snapshotMinor
      : allocatedNetMinor;
    const unitPaidMinor = totalQuantity > 0 ? Math.round(pricePaidMinor / totalQuantity) : 0;
    const isPhysical = item.book?.format === 'print';
    const snapshotReturnable = item.isReturnable === null || item.isReturnable === undefined
      ? item.book?.isReturnable !== false
      : item.isReturnable === true;
    const windowDays = policy.itemWindowDays(item, activeSettings);
    const legalDays = policy.itemLegalDays(item, activeSettings);
    const windowEndAt = delivery.date ? policy.addDays(delivery.date, windowDays) : null;
    const reasons = [...baseEligibility];
    if (!isPhysical) reasons.push('not_physical');
    if (isPhysical && !snapshotReturnable) reasons.push('not_returnable');
    if (remainingQuantity < 1) reasons.push('already_returned');
    if (delivery.date && windowEndAt && now > windowEndAt) reasons.push('window_closed');

    return {
      orderItem: item,
      id: item.id,
      title: item.titleSnapshot || item.book?.title || '',
      cover: item.book?.cover || null,
      format: item.book?.format || null,
      quantity: totalQuantity,
      remainingQuantity,
      returnedQuantity,
      unitPaidMinor,
      pricePaidMinor,
      windowDays,
      legalDays,
      windowEndAt,
      isPhysical,
      eligible: reasons.length === 0,
      reasons,
      daysLeft: windowEndAt ? Math.max(0, Math.ceil((windowEndAt.getTime() - now.getTime()) / DAY_MS)) : 0
    };
  });

  const returnableCandidates = candidates.filter((candidate) => candidate.isPhysical && candidate.remainingQuantity > 0 &&
    (candidate.orderItem.isReturnable !== false) && candidate.orderItem.book?.isReturnable !== false);
  const defaults = returnableCandidates.map((candidate) => ({ orderItemId: candidate.id, quantity: candidate.remainingQuantity }));
  const selectionMap = normalizeSelection(selection, defaults);
  const orderReturnableValueMinor = returnableCandidates.reduce((sum, candidate) => sum + candidate.pricePaidMinor, 0);
  const selectedValueMinor = returnableCandidates.reduce((sum, candidate) => {
    const quantity = Math.min(candidate.remainingQuantity, selectionMap.get(candidate.id) || 0);
    return sum + candidate.unitPaidMinor * quantity;
  }, 0);
  const allReturnableReturned = returnableCandidates.every((candidate) => {
    const quantity = Math.min(candidate.remainingQuantity, selectionMap.get(candidate.id) || 0);
    return quantity >= candidate.remainingQuantity;
  });
  let runningRefundedMinor = totals.submittedRefundMinor;

  const previewItems = candidates.map((candidate) => {
    const requestedQuantity = Math.min(candidate.remainingQuantity, selectionMap.get(candidate.id) || 0);
    const selected = requestedQuantity > 0;
    const pricePaidForSelectionMinor = candidate.unitPaidMinor * requestedQuantity;
    const calculation = candidate.eligible && selected
      ? calculateRefund({
        pricePaidMinor: pricePaidForSelectionMinor,
        definedShippingFeeMinor: definedFeeMinor,
        shippingFeeChargedMinor: chargedFeeMinor,
        deliveryDeductionMode: activeSettings.deliveryDeductionMode,
        orderReturnableValueMinor,
        returnedValueMinor: selectedValueMinor,
        allReturnableReturned,
        alreadyDeductedFeeMinor: totals.deductedFeeMinor,
        daysSinceDelivery: daysSinceDelivery === null ? undefined : daysSinceDelivery,
        legalWithdrawalDays: candidate.legalDays,
        applyLegalWithdrawalRules: activeSettings.applyLegalWithdrawalRules,
        sellerFault,
        orderPaidMinor: orderPaidMinorValue,
        alreadyRefundedMinor: runningRefundedMinor
      })
      : null;
    if (calculation) runningRefundedMinor += calculation.refundMinor;
    return {
      orderItemId: candidate.id,
      title: candidate.title,
      cover: candidate.cover,
      format: candidate.format,
      quantity: requestedQuantity,
      availableQuantity: candidate.remainingQuantity,
      unitPrice: moneyString(candidate.unitPaidMinor),
      pricePaid: moneyString(pricePaidForSelectionMinor),
      eligible: candidate.eligible,
      reasons: candidate.reasons,
      windowDays: candidate.windowDays,
      windowStartAt: delivery.date,
      windowEndAt: candidate.windowEndAt,
      daysLeft: candidate.daysLeft,
      refund: calculation ? {
        amount: calculation.refundAmount,
        amountMinor: calculation.refundMinor,
        deduction: calculation.deliveryDeductionAmount,
        deductionMinor: calculation.deliveryFeeDeductionMinor,
        legalPeriodApplied: calculation.legalPeriodApplied,
        sellerFaultOverride: calculation.sellerFaultOverride,
        deductionMode: calculation.deductionMode,
        proportionalShare: calculation.proportionalShare,
        breakdown: calculation.breakdown,
        explanation: explainRefund(calculation, tokenFor(language), {
          formatMoney: (minor) => formatMoney(minor, order.currency, tokenFor(language))
        })
      } : null
    };
  });

  const selectedItems = previewItems.filter((item) => item.quantity > 0 && item.eligible);
  const refundMinor = selectedItems.reduce((sum, item) => sum + (item.refund?.amountMinor || 0), 0);
  const deductionMinor = selectedItems.reduce((sum, item) => sum + (item.refund?.deductionMinor || 0), 0);

  return {
    orderId: order.id,
    currency: order.currency,
    orderStatus: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    returnsEnabled: activeSettings.returnsEnabled,
    deliveryDate: delivery.date,
    deliveryDateSource: delivery.source,
    windowStartAt: delivery.date,
    windowEndAt: candidates.reduce((latest, candidate) => (
      candidate.windowEndAt && (!latest || candidate.windowEndAt > latest) ? candidate.windowEndAt : latest
    ), null),
    daysSinceDelivery,
    items: previewItems,
    totals: {
      refundAmount: moneyString(refundMinor),
      refundMinor,
      deduction: moneyString(deductionMinor),
      deductionMinor,
      discountAmount: moneyString(discountMinor),
      discountMinor,
      amountPaid: moneyString(orderPaidMinorValue),
      amountPaidMinor: orderPaidMinorValue,
      itemCount: selectedItems.length,
      allReturnableReturned
    },
    settings: {
      legalWithdrawalDays: activeSettings.legalWithdrawalDays,
      applyLegalWithdrawalRules: activeSettings.applyLegalWithdrawalRules,
      deliveryDeductionMode: activeSettings.deliveryDeductionMode,
      defaultReturnWindowDays: activeSettings.defaultReturnWindowDays,
      refundDeadlineDays: activeSettings.refundDeadlineDays,
      shipBackDeadlineDays: activeSettings.shipBackDeadlineDays,
      returnShippingPayer: activeSettings.returnShippingPayer
    }
  };
}

/** Eligibility and preview for the physical books of a mystery box purchase. */
async function boxReturnQuote({
  purchaseId,
  userId = null,
  selection = null,
  sellerFault = false,
  settings = null,
  language = 'fr',
  now = new Date()
}) {
  const activeSettings = settings || await policy.getReturnPolicy();
  const purchase = await MysteryBoxPurchase.findOne({
    where: { id: purchaseId, ...(userId ? { userId } : {}) },
    include: [
      { model: MysteryBox, as: 'box', attributes: ['id', 'title', 'returnPolicy', 'translations'] },
      { model: User, as: 'user', attributes: ['id', 'firstName', 'email', 'language', 'returnsBlocked'] }
    ]
  });
  if (!purchase) throw serviceError(404, 'Mystery box purchase not found.');

  const boxPolicy = purchase.returnPolicySnapshot || purchase.box?.returnPolicy || 'none';
  const snapshotItems = (purchase.boxSnapshot?.items || []).filter((item) => item.isPhysical || item.type === 'printed_book');
  const totals = await submittedReturnTotals({ mysteryBoxPurchaseId: purchase.id });
  const delivery = policy.resolveDeliveryDate({
    deliveredAt: purchase.deliveredAt,
    shippedAt: purchase.shippedAt,
    fallbackDays: activeSettings.defaultDeliveryEstimateDays,
    now
  });
  const daysSinceDelivery = delivery.date ? policy.daysBetween(delivery.date, now) : null;
  const windowDays = Number(activeSettings.defaultReturnWindowDays) || 30;
  const windowEndAt = delivery.date ? policy.addDays(delivery.date, windowDays) : null;
  const legalDays = Number(activeSettings.legalWithdrawalDays) || 14;

  const baseReasons = [];
  if (!activeSettings.returnsEnabled) baseReasons.push('returns_disabled');
  if (purchase.status !== 'paid' && purchase.status !== 'fulfilled' && purchase.status !== 'partially_fulfilled') {
    baseReasons.push('order_not_paid');
  }
  if (boxPolicy !== 'standard') baseReasons.push('box_not_returnable');
  if (!delivery.date) baseReasons.push('delivery_date_unknown');

  const physicalValueMinor = snapshotItems.reduce((sum, item) => (
    sum + toMinor(item.estimatedValue) * Math.max(1, Number(item.quantity || 1))
  ), 0);
  const amountItemsMinor = toMinor(purchase.amountItems);
  const shippingMinor = toMinor(purchase.amountShipping);
  const currency = purchase.currency;

  const candidates = snapshotItems.map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const returnedQuantity = totals.quantities.get(`box:${item.itemId}`) || 0;
    const remainingQuantity = Math.max(0, quantity - returnedQuantity);
    const valueShare = physicalValueMinor > 0
      ? (toMinor(item.estimatedValue) * quantity) / physicalValueMinor
      : 0;
    const itemPricePaidMinor = Math.round(amountItemsMinor * valueShare);
    const itemShippingMinor = Math.round(shippingMinor * valueShare);
    const reasons = [...baseReasons];
    if (remainingQuantity < 1) reasons.push('already_returned');
    if (delivery.date && windowEndAt && now > windowEndAt) reasons.push('window_closed');
    return {
      mysteryBoxItemId: item.itemId,
      title: item.displayName,
      cover: item.imageUrl || null,
      quantity,
      remainingQuantity,
      returnedQuantity,
      unitPaidMinor: quantity > 0 ? Math.round(itemPricePaidMinor / quantity) : 0,
      pricePaidMinor: itemPricePaidMinor,
      shippingMinor: itemShippingMinor,
      windowDays,
      legalDays,
      eligible: reasons.length === 0,
      reasons
    };
  });

  const defaults = candidates
    .filter((candidate) => candidate.remainingQuantity > 0)
    .map((candidate) => ({ mysteryBoxItemId: candidate.mysteryBoxItemId, quantity: candidate.remainingQuantity }));
  const selectionMap = normalizeSelection(selection, defaults);
  const returnableCandidates = candidates.filter((candidate) => candidate.remainingQuantity > 0);
  const orderReturnableValueMinor = returnableCandidates.reduce((sum, candidate) => sum + candidate.pricePaidMinor, 0);
  const selectedValueMinor = returnableCandidates.reduce((sum, candidate) => (
    sum + candidate.unitPaidMinor * Math.min(candidate.remainingQuantity, selectionMap.get(candidate.mysteryBoxItemId) || 0)
  ), 0);
  const allReturnableReturned = returnableCandidates.every((candidate) => (
    Math.min(candidate.remainingQuantity, selectionMap.get(candidate.mysteryBoxItemId) || 0) >= candidate.remainingQuantity
  ));
  let runningRefundedMinor = totals.submittedRefundMinor;

  const previewItems = candidates.map((candidate) => {
    const requestedQuantity = Math.min(candidate.remainingQuantity, selectionMap.get(candidate.mysteryBoxItemId) || 0);
    const pricePaidForSelectionMinor = candidate.unitPaidMinor * requestedQuantity;
    const calculation = candidate.eligible && requestedQuantity > 0
      ? calculateRefund({
        pricePaidMinor: pricePaidForSelectionMinor,
        definedShippingFeeMinor: candidate.shippingMinor,
        shippingFeeChargedMinor: candidate.shippingMinor,
        deliveryDeductionMode: activeSettings.deliveryDeductionMode,
        orderReturnableValueMinor,
        returnedValueMinor: selectedValueMinor,
        allReturnableReturned,
        alreadyDeductedFeeMinor: totals.deductedFeeMinor,
        daysSinceDelivery: daysSinceDelivery === null ? undefined : daysSinceDelivery,
        legalWithdrawalDays: candidate.legalDays,
        applyLegalWithdrawalRules: activeSettings.applyLegalWithdrawalRules,
        sellerFault,
        orderPaidMinor: toMinor(purchase.amountTotal),
        alreadyRefundedMinor: runningRefundedMinor
      })
      : null;
    if (calculation) runningRefundedMinor += calculation.refundMinor;
    return {
      mysteryBoxItemId: candidate.mysteryBoxItemId,
      title: candidate.title,
      cover: candidate.cover,
      quantity: requestedQuantity,
      availableQuantity: candidate.remainingQuantity,
      pricePaid: moneyString(pricePaidForSelectionMinor),
      eligible: candidate.eligible,
      reasons: candidate.reasons,
      windowEndAt,
      daysLeft: windowEndAt ? Math.max(0, Math.ceil((windowEndAt.getTime() - now.getTime()) / DAY_MS)) : 0,
      refund: calculation ? {
        amount: calculation.refundAmount,
        amountMinor: calculation.refundMinor,
        deduction: calculation.deliveryDeductionAmount,
        deductionMinor: calculation.deliveryFeeDeductionMinor,
        legalPeriodApplied: calculation.legalPeriodApplied,
        sellerFaultOverride: calculation.sellerFaultOverride,
        breakdown: calculation.breakdown,
        explanation: explainRefund(calculation, tokenFor(language), {
          formatMoney: (minor) => formatMoney(minor, currency, tokenFor(language))
        })
      } : null
    };
  });

  const selected = previewItems.filter((item) => item.quantity > 0 && item.eligible);
  return {
    mysteryBoxPurchaseId: purchase.id,
    currency,
    orderStatus: purchase.status,
    returnsEnabled: activeSettings.returnsEnabled,
    boxReturnPolicy: boxPolicy,
    deliveryDate: delivery.date,
    deliveryDateSource: delivery.source,
    windowStartAt: delivery.date,
    windowEndAt,
    daysSinceDelivery,
    items: previewItems,
    totals: {
      refundAmount: moneyString(selected.reduce((sum, item) => sum + (item.refund?.amountMinor || 0), 0)),
      refundMinor: selected.reduce((sum, item) => sum + (item.refund?.amountMinor || 0), 0),
      itemCount: selected.length,
      allReturnableReturned
    },
    settings: {
      legalWithdrawalDays: legalDays,
      applyLegalWithdrawalRules: activeSettings.applyLegalWithdrawalRules,
      deliveryDeductionMode: activeSettings.deliveryDeductionMode,
      defaultReturnWindowDays: windowDays,
      refundDeadlineDays: activeSettings.refundDeadlineDays,
      shipBackDeadlineDays: activeSettings.shipBackDeadlineDays,
      returnShippingPayer: activeSettings.returnShippingPayer
    }
  };
}

async function countUserReturnsThisYear(userId, now = new Date()) {
  return ReturnRequest.count({
    where: {
      userId,
      status: { [Op.notIn]: INACTIVE_STATUSES },
      requestedAt: { [Op.gte]: new Date(now.getTime() - 365 * DAY_MS) }
    }
  });
}

function assertReturnAllowed({ settings, user, existingReturns }) {
  if (!settings.returnsEnabled) throw serviceError(409, 'Returns are currently disabled.', 'RETURNS_DISABLED');
  if (user?.returnsBlocked) throw serviceError(403, 'Returns are blocked for this account.', 'RETURNS_BLOCKED');
  const limit = Number(settings.maxReturnsPerUserPerYear);
  if (Number.isFinite(limit) && limit > 0 && existingReturns >= limit) {
    throw serviceError(429, 'Return limit for this account has been reached.', 'RETURN_LIMIT_REACHED');
  }
}

async function createReturnRequest({ userId, payload, actor = null, now = new Date() }) {
  const settings = await policy.getReturnPolicy();
  const user = await User.findByPk(userId);
  if (!user) throw serviceError(404, 'Reader not found.');
  const language = tokenFor(payload.language || user.language);
  const reason = policy.reasonByCode(settings, payload.reason);
  if (!reason) throw serviceError(400, 'Unknown return reason.', 'RETURN_REASON_INVALID');
  const photos = Array.isArray(payload.photos) ? payload.photos.filter((photo) => typeof photo === 'string' && photo.trim()).slice(0, 8) : [];
  const adminActor = actor && actor.id !== userId ? actor : null;
  const sellerFault = reason.isSellerFault === true || (adminActor && payload.isSellerFault === true);
  if (adminActor && String(payload.overrideReason || '').trim().length < 10) {
    throw serviceError(400, 'A written reason is required when an admin files a return for a customer.', 'RETURN_OVERRIDE_REASON_REQUIRED');
  }

  if (reason.requiresPhotos && settings.requirePhotosForDefects && !photos.length) {
    throw serviceError(400, 'Photos are required for this reason.', 'RETURN_PHOTOS_REQUIRED');
  }
  if (reason.requiresDetails && !String(payload.reasonDetails || '').trim()) {
    throw serviceError(400, 'Please describe the problem.', 'RETURN_DETAILS_REQUIRED');
  }
  if (!adminActor) {
    const existing = await countUserReturnsThisYear(userId, now);
    assertReturnAllowed({ settings, user, existingReturns: existing });
  }

  const isBox = Number.isSafeInteger(Number(payload.mysteryBoxPurchaseId)) && Number(payload.mysteryBoxPurchaseId) > 0;
  const quote = isBox
    ? await boxReturnQuote({
      purchaseId: Number(payload.mysteryBoxPurchaseId),
      userId: adminActor ? null : userId,
      selection: payload.items,
      sellerFault,
      settings,
      language,
      now
    })
    : await orderReturnQuote({
      orderId: Number(payload.orderId),
      userId: adminActor ? null : userId,
      selection: payload.items,
      sellerFault,
      settings,
      language,
      now
    });

  if (isBox) {
    if (quote.boxReturnPolicy !== 'standard') {
      throw serviceError(409, 'This mystery box is not returnable.', 'BOX_NOT_RETURNABLE');
    }
  } else if (quote.orderStatus !== 'paid') {
    throw serviceError(409, 'Only paid orders can be returned.', 'ORDER_NOT_PAID');
  }

  const selected = quote.items.filter((item) => item.quantity > 0);
  if (!selected.length) throw serviceError(400, 'Select at least one returnable book.', 'NO_RETURNABLE_ITEM');
  const blocked = selected.find((item) => !item.eligible);
  if (blocked) {
    throw serviceError(409, `"${blocked.title}" is not eligible for a return.`, 'ITEM_NOT_ELIGIBLE');
  }

  const currency = quote.currency;
  const totalRefundMinor = selected.reduce((sum, item) => sum + (item.refund?.amountMinor || 0), 0);
  if (totalRefundMinor < 1) {
    throw serviceError(409, 'The refund for this selection is zero.', 'REFUND_ZERO');
  }

  const transaction = await sequelize.transaction();
  try {
    const order = isBox ? null : await StoreOrder.findByPk(quote.orderId, { transaction, lock: transaction.LOCK.UPDATE });
    const purchase = isBox ? await MysteryBoxPurchase.findByPk(quote.mysteryBoxPurchaseId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
    const rmaNumber = await nextRmaNumber(transaction);
    const autoApproved = settings.autoApproveRequests === true;
    const nowDate = new Date(now);
    const request = await ReturnRequest.create({
      rmaNumber,
      orderId: order ? order.id : null,
      mysteryBoxPurchaseId: purchase ? purchase.id : null,
      userId,
      reason: reason.code,
      reasonDetails: String(payload.reasonDetails || '').trim() || null,
      isSellerFault: sellerFault,
      status: autoApproved ? 'awaiting_shipment' : 'requested',
      requestedAt: nowDate,
      windowStartAt: quote.windowStartAt,
      windowEndAt: quote.windowEndAt,
      approvedAt: autoApproved ? nowDate : null,
      shipBackDeadline: autoApproved ? policy.addDays(nowDate, settings.shipBackDeadlineDays) : null,
      photos,
      currency,
      refundAmount: fromMinor(totalRefundMinor),
      createdByAdminId: adminActor ? adminActor.id : null
    }, { transaction });

    for (const item of selected) {
      await ReturnItem.create({
        returnRequestId: request.id,
        sourceType: isBox ? 'mystery_box_item' : 'order_item',
        orderItemId: isBox ? null : item.orderItemId,
        mysteryBoxItemId: isBox ? item.mysteryBoxItemId : null,
        titleSnapshot: item.title,
        quantity: item.quantity,
        itemPricePaid: item.pricePaid,
        deliveryFeeDeduction: item.refund.deduction,
        refundAmount: item.refund.amount,
        calculationBreakdown: {
          ...item.refund.breakdown,
          explanation: item.refund.explanation,
          legalPeriodApplied: item.refund.legalPeriodApplied,
          sellerFaultOverride: item.refund.sellerFaultOverride,
          deductionMode: quote.settings.deliveryDeductionMode
        }
      }, { transaction });
    }

    await recordEvent(request.id, {
      actorType: adminActor ? 'admin' : 'customer',
      actorId: adminActor ? adminActor.id : userId,
      eventType: 'requested',
      note: payload.reasonDetails || null,
      metadata: { reason: reason.code, itemCount: selected.length, sellerFault }
    }, transaction);
    if (autoApproved) {
      await recordEvent(request.id, {
        actorType: 'system',
        eventType: 'auto_approved',
        metadata: { shipBackDeadlineDays: settings.shipBackDeadlineDays }
      }, transaction);
    }
    if (adminActor) {
      await recordEvent(request.id, {
        actorType: 'admin',
        actorId: adminActor.id,
        eventType: 'created_for_customer',
        note: String(payload.overrideReason).trim()
      }, transaction);
    }

    if (order) {
      await order.update({ returnStatus: 'requested' }, { transaction });
    }

    await transaction.commit();

    await notifyReturn({
      code: autoApproved ? 'return_approved' : 'return_requested',
      request,
      settings,
      language,
      extra: { actionUrl: returnUrl(request, language) }
    }).catch((error) => console.error('Échec de l’e-mail de retour :', error));

    return getReturnRequest(request.id, { admin: Boolean(adminActor) });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function getReturnRequest(id, { admin = false, userId = null } = {}) {
  const request = await ReturnRequest.findOne({
    where: { id, ...(admin || !userId ? {} : { userId }) },
    include: [
      { model: ReturnItem, as: 'items' },
      { model: ReturnRefund, as: 'refunds' },
      { model: ReturnEvent, as: 'events', separate: true, order: [['createdAt', 'ASC']] },
      {
        model: StoreOrder,
        as: 'order',
        required: false,
        include: [{ model: StoreOrderItem, as: 'items', include: [{ model: Book, as: 'book', attributes: ['id', 'title', 'format', 'cover'] }] }]
      },
      { model: MysteryBoxPurchase, as: 'mysteryBoxPurchase', required: false },
      { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'language', 'returnsBlocked', 'returnsBlockedReason'] }
    ]
  });
  if (!request) throw serviceError(404, 'Return request not found.');
  return request;
}

async function listUserReturns(userId, { limit = 100 } = {}) {
  return ReturnRequest.findAll({
    where: { userId },
    include: [{ model: ReturnItem, as: 'items' }],
    order: [['requestedAt', 'DESC']],
    limit
  });
}

async function loadForUpdate(id, transaction, { userId = null } = {}) {
  const request = await ReturnRequest.findOne({
    where: { id, ...(userId ? { userId } : {}) },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!request) throw serviceError(404, 'Return request not found.');
  return request;
}

async function addEvent(request, { actorType, actorId = null, eventType, note = null, metadata = {} }) {
  return recordEvent(request.id, { actorType, actorId, eventType, note, metadata });
}

async function approveReturn({ returnId, admin, settings = null }) {
  const activeSettings = settings || await policy.getReturnPolicy();
  const transaction = await sequelize.transaction();
  try {
    const request = await loadForUpdate(returnId, transaction);
    if (request.status !== 'requested') {
      throw serviceError(409, 'Only requested returns can be approved.', 'RETURN_STATUS_INVALID');
    }
    const now = new Date();
    await request.update({
      status: 'awaiting_shipment',
      approvedAt: now,
      shipBackDeadline: policy.addDays(now, activeSettings.shipBackDeadlineDays)
    }, { transaction });
    await recordEvent(request.id, {
      actorType: 'admin',
      actorId: admin?.id || null,
      eventType: 'approved',
      metadata: { shipBackDeadlineDays: activeSettings.shipBackDeadlineDays }
    }, transaction);
    await transaction.commit();
    const user = await User.findByPk(request.userId);
    const language = tokenFor(user?.language);
    await notifyReturn({ code: 'return_approved', request, settings: activeSettings, language })
      .catch((error) => console.error('Échec de l’e-mail de retour :', error));
    return getReturnRequest(returnId, { admin: true });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function rejectReturn({ returnId, admin, reason, settings = null }) {
  const note = String(reason || '').trim();
  if (note.length < 3) throw serviceError(400, 'A rejection reason is required.', 'RETURN_REASON_REQUIRED');
  const transaction = await sequelize.transaction();
  try {
    const request = await loadForUpdate(returnId, transaction);
    if (!['requested', 'approved', 'awaiting_shipment'].includes(request.status)) {
      throw serviceError(409, 'This return can no longer be rejected.', 'RETURN_STATUS_INVALID');
    }
    await request.update({
      status: 'rejected',
      rejectedAt: new Date(),
      rejectionReason: note
    }, { transaction });
    await recordEvent(request.id, {
      actorType: 'admin',
      actorId: admin?.id || null,
      eventType: 'rejected',
      note
    }, transaction);
    await transaction.commit();
    const activeSettings = settings || await policy.getReturnPolicy();
    const user = await User.findByPk(request.userId);
    await notifyReturn({
      code: 'return_rejected',
      request,
      settings: activeSettings,
      language: tokenFor(user?.language),
      extra: { reason: note }
    }).catch((error) => console.error('Échec de l’e-mail de retour :', error));
    return getReturnRequest(returnId, { admin: true });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function addTracking({ returnId, userId, trackingNumber, carrier, settings = null }) {
  const tracking = String(trackingNumber || '').trim();
  if (tracking.length < 4) throw serviceError(400, 'A tracking number is required.', 'RETURN_TRACKING_REQUIRED');
  const transaction = await sequelize.transaction();
  try {
    const request = await loadForUpdate(returnId, transaction, { userId });
    if (!ELIGIBLE_AFTER_SHIP.includes(request.status)) {
      throw serviceError(409, 'This return is not awaiting a shipment.', 'RETURN_STATUS_INVALID');
    }
    await request.update({
      trackingNumber: tracking,
      carrier: String(carrier || '').trim().slice(0, 120) || null,
      shippedBackAt: new Date(),
      status: 'shipped_back'
    }, { transaction });
    await recordEvent(request.id, {
      actorType: 'customer',
      actorId: userId,
      eventType: 'shipped_back',
      metadata: { trackingNumber: tracking, carrier: request.carrier }
    }, transaction);
    await transaction.commit();
    return getReturnRequest(returnId, { admin: false, userId });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function markReceived({ returnId, admin, note = null, settings = null }) {
  const transaction = await sequelize.transaction();
  try {
    const request = await loadForUpdate(returnId, transaction);
    if (!['approved', 'awaiting_shipment', 'shipped_back'].includes(request.status)) {
      throw serviceError(409, 'This return cannot be marked as received.', 'RETURN_STATUS_INVALID');
    }
    await request.update({ status: 'received', receivedAt: new Date() }, { transaction });
    await recordEvent(request.id, {
      actorType: 'admin',
      actorId: admin?.id || null,
      eventType: 'received',
      note
    }, transaction);
    await transaction.commit();
    const activeSettings = settings || await policy.getReturnPolicy();
    const user = await User.findByPk(request.userId);
    await notifyReturn({
      code: 'return_received',
      request,
      settings: activeSettings,
      language: tokenFor(user?.language)
    }).catch((error) => console.error('Échec de l’e-mail de retour :', error));
    return getReturnRequest(returnId, { admin: true });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function inspectReturn({ returnId, admin, result, notes, refundAmount = null, settings = null, language = null }) {
  if (!['accepted', 'partial', 'rejected'].includes(result)) {
    throw serviceError(400, 'Invalid inspection result.', 'RETURN_INSPECTION_INVALID');
  }
  const note = String(notes || '').trim();
  if (result !== 'accepted' && note.length < 3) {
    throw serviceError(400, 'Inspections notes are required for this result.', 'RETURN_NOTES_REQUIRED');
  }
  const activeSettings = settings || await policy.getReturnPolicy();
  const transaction = await sequelize.transaction();
  try {
    const request = await loadForUpdate(returnId, transaction);
    if (!['received', 'inspected'].includes(request.status)) {
      throw serviceError(409, 'Only received returns can be inspected.', 'RETURN_STATUS_INVALID');
    }
    const items = await ReturnItem.findAll({ where: { returnRequestId: request.id }, transaction });
    const computedTotalMinor = items.reduce((sum, item) => sum + toMinor(item.refundAmount), 0);

    if (result === 'partial') {
      const requestedMinor = refundAmount === null || refundAmount === undefined
        ? null
        : toMinor(refundAmount);
      if (!Number.isInteger(requestedMinor) || requestedMinor < 1 || requestedMinor >= computedTotalMinor) {
        throw serviceError(400, 'A partial refund must be positive and lower than the computed amount.', 'RETURN_PARTIAL_AMOUNT_INVALID');
      }
      // Spread the manual adjustment over the items proportionally to their computed refund.
      let allocated = 0;
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const isLast = index === items.length - 1;
        const share = isLast
          ? requestedMinor - allocated
          : Math.round(requestedMinor * (toMinor(item.refundAmount) / computedTotalMinor));
        allocated += share;
        await item.update({
          refundAmount: fromMinor(share),
          calculationBreakdown: {
            ...(item.calculationBreakdown || {}),
            manualPartialTotalMinor: requestedMinor,
            computedRefundMinor: toMinor(item.refundAmount),
            finalRefundMinor: share
          }
        }, { transaction });
      }
      await request.update({
        status: 'inspected',
        inspectionResult: 'partial',
        inspectedAt: new Date(),
        inspectionNotes: note,
        refundAmount: fromMinor(requestedMinor)
      }, { transaction });
    } else {
      await request.update({
        status: 'inspected',
        inspectionResult: result,
        inspectedAt: new Date(),
        inspectionNotes: note || null,
        refundAmount: result === 'rejected' ? fromMinor(0) : fromMinor(computedTotalMinor)
      }, { transaction });
    }

    await recordEvent(request.id, {
      actorType: 'admin',
      actorId: admin?.id || null,
      eventType: 'inspected',
      note: note || null,
      metadata: { result, refundAmount: result === 'rejected' ? '0.00' : String(request.refundAmount) }
    }, transaction);
    await transaction.commit();

    const user = await User.findByPk(request.userId);
    const targetLanguage = tokenFor(language || user?.language);
    const code = result === 'accepted'
      ? 'return_inspection_accepted'
      : result === 'partial'
        ? 'return_inspection_partial'
        : 'return_inspection_rejected';
    await notifyReturn({
      code,
      request,
      settings: activeSettings,
      language: targetLanguage,
      extra: {
        inspectionNotes: note,
        refundAmount: formatMoney(toMinor(request.refundAmount), request.currency, targetLanguage)
      }
    }).catch((error) => console.error('Échec de l’e-mail de retour :', error));

    if (result === 'accepted' && activeSettings.autoRefundAfterAcceptance) {
      try {
        return await issueRefund({ returnId, admin, settings: activeSettings });
      } catch (error) {
        console.error('Remboursement automatique impossible :', error.message);
      }
    }
    return getReturnRequest(returnId, { admin: true });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function paymentIntentForRequest(request, transaction) {
  if (request.orderId) {
    const order = await StoreOrder.findByPk(request.orderId, { transaction });
    return order?.stripePaymentIntentId || null;
  }
  const purchase = await MysteryBoxPurchase.findByPk(request.mysteryBoxPurchaseId, { transaction });
  return purchase?.stripePaymentIntentId || null;
}

/** Captured amount of an order using the same derivation as the preview. */
async function paidMinorForOrderId(orderId, transaction = null) {
  const order = await StoreOrder.findByPk(orderId, { transaction });
  if (!order) return 0;
  const items = await StoreOrderItem.findAll({
    where: { orderId: order.id },
    attributes: ['id', 'shippingFeeCharged'],
    include: [{ model: Book, as: 'book', attributes: ['id', 'format'] }],
    transaction
  });
  const discount = await orderDiscountMinor(order, transaction);
  const amounts = await orderPaidMinor(order, items, discount, transaction);
  return amounts.paidMinor;
}

async function alreadyRefundedMinorFor(request, transaction) {
  const refunds = await ReturnRefund.findAll({
    where: { status: 'succeeded' },
    include: [{
      model: ReturnRequest,
      as: 'returnRequest',
      required: true,
      where: request.orderId ? { orderId: request.orderId } : { mysteryBoxPurchaseId: request.mysteryBoxPurchaseId },
      attributes: []
    }],
    transaction
  });
  return refunds.reduce((sum, refund) => sum + toMinor(refund.amount), 0);
}

async function issueRefund({ returnId, admin, settings = null, language = null }) {
  const activeSettings = settings || await policy.getReturnPolicy();
  const transaction = await sequelize.transaction();
  let refundRow;
  let request;
  try {
    request = await loadForUpdate(returnId, transaction);
    if (!['inspected', 'refund_pending'].includes(request.status) || request.inspectionResult === 'rejected') {
      throw serviceError(409, 'Only an accepted inspection can be refunded.', 'RETURN_STATUS_INVALID');
    }
    const already = await ReturnRefund.findOne({
      where: { returnRequestId: request.id, status: { [Op.in]: ['pending', 'succeeded'] } },
      transaction
    });
    if (already) {
      throw serviceError(409, 'A refund was already issued for this return.', 'REFUND_ALREADY_ISSUED');
    }
    const amountMinor = toMinor(request.refundAmount);
    if (amountMinor < 1) throw serviceError(409, 'Nothing left to refund.', 'REFUND_ZERO');
    const paymentIntentId = await paymentIntentForRequest(request, transaction);
    if (!paymentIntentId) {
      throw serviceError(409, 'This purchase has no Stripe payment to refund.', 'PAYMENT_INTENT_MISSING');
    }
    const alreadyRefunded = await alreadyRefundedMinorFor(request, transaction);
    const paidMinor = request.orderId
      ? await paidMinorForOrderId(request.orderId, transaction)
      : toMinor((await MysteryBoxPurchase.findByPk(request.mysteryBoxPurchaseId, { transaction }))?.amountTotal);
    if (alreadyRefunded + amountMinor > paidMinor) {
      throw serviceError(409, 'The refund would exceed the amount paid.', 'REFUND_AMOUNT_TOO_HIGH');
    }

    const previousAttempts = await ReturnRefund.count({ where: { returnRequestId: request.id }, transaction });
    refundRow = await ReturnRefund.create({
      returnRequestId: request.id,
      amount: fromMinor(amountMinor),
      currency: request.currency,
      paymentIntentId,
      idempotencyKey: previousAttempts
        ? `return-refund-${request.id}-r${previousAttempts + 1}`
        : `return-refund-${request.id}`,
      status: 'pending',
      createdByAdminId: admin?.id || null
    }, { transaction });

    await request.update({ status: 'refund_pending' }, { transaction });
    await recordEvent(request.id, {
      actorType: 'admin',
      actorId: admin?.id || null,
      eventType: 'refund_pending',
      metadata: { amount: fromMinor(amountMinor), currency: request.currency }
    }, transaction);
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }

  let stripeRefund;
  try {
    const stripe = createStripeClient();
    stripeRefund = await stripe.refunds.create({
      payment_intent: refundRow.paymentIntentId,
      amount: toMinor(refundRow.amount),
      reason: 'requested_by_customer',
      metadata: {
        returnRequestId: String(request.id),
        rmaNumber: request.rmaNumber
      }
    }, { idempotencyKey: refundRow.idempotencyKey });
  } catch (error) {
    await refundRow.update({
      status: 'failed',
      failureReason: String(error.message || 'Stripe refund failed').slice(0, 1000)
    });
    await ReturnRequest.update({ status: 'inspected' }, { where: { id: request.id } });
    await recordEvent(request.id, {
      actorType: 'system',
      eventType: 'refund_failed',
      note: String(error.message || '').slice(0, 1000)
    }).catch(() => {});
    const wrapped = serviceError(502, 'The refund could not be issued. You can retry.', 'REFUND_FAILED');
    wrapped.cause = error;
    throw wrapped;
  }

  const followUp = await sequelize.transaction();
  try {
    await refundRow.update({
      stripeRefundId: stripeRefund.id,
      status: stripeRefund.status === 'failed' ? 'failed' : 'succeeded',
      issuedAt: new Date(),
      failureReason: stripeRefund.status === 'failed' ? 'Rejected by Stripe' : null
    }, { transaction: followUp });
    const refreshed = await ReturnRequest.findByPk(request.id, { transaction: followUp });
    await refreshed.update({
      status: stripeRefund.status === 'failed' ? 'inspected' : 'refunded',
      refundedAt: stripeRefund.status === 'failed' ? null : new Date()
    }, { transaction: followUp });
    await recordEvent(request.id, {
      actorType: 'system',
      eventType: stripeRefund.status === 'failed' ? 'refund_failed' : 'refunded',
      metadata: { stripeRefundId: stripeRefund.id, amount: refundRow.amount }
    }, followUp);
    if (refreshed.orderId && stripeRefund.status !== 'failed') {
      await StoreOrder.update({ returnStatus: 'completed' }, { where: { id: refreshed.orderId }, transaction: followUp });
    }
    await followUp.commit();

    const user = await User.findByPk(refreshed.userId);
    const targetLanguage = tokenFor(language || user?.language);
    await notifyReturn({
      code: 'return_refunded',
      request: refreshed,
      settings: activeSettings,
      language: targetLanguage,
      extra: {
        refundAmount: formatMoney(toMinor(refundRow.amount), refreshed.currency, targetLanguage),
        bankDelay: activeSettings.refundDeadlineDays
      }
    }).catch((error) => console.error('Échec de l’e-mail de retour :', error));
  } catch (error) {
    if (!followUp.finished) await followUp.rollback();
    throw error;
  }

  return getReturnRequest(request.id, { admin: true });
}

async function closeReturn({ returnId, admin, note = null }) {
  const transaction = await sequelize.transaction();
  try {
    const request = await loadForUpdate(returnId, transaction);
    if (['closed', 'cancelled'].includes(request.status)) {
      throw serviceError(409, 'This return is already closed.', 'RETURN_STATUS_INVALID');
    }
    await request.update({ status: 'closed', closedAt: new Date(), internalNotes: note || request.internalNotes }, { transaction });
    await recordEvent(request.id, {
      actorType: 'admin',
      actorId: admin?.id || null,
      eventType: 'closed',
      note
    }, transaction);
    await transaction.commit();
    return getReturnRequest(returnId, { admin: true });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function cancelReturn({ returnId, userId, note = null, settings = null }) {
  const transaction = await sequelize.transaction();
  try {
    const request = await loadForUpdate(returnId, transaction, { userId });
    if (!['requested', 'approved', 'awaiting_shipment'].includes(request.status) || request.shippedBackAt) {
      throw serviceError(409, 'This return can no longer be cancelled.', 'RETURN_STATUS_INVALID');
    }
    await request.update({ status: 'cancelled', cancelledAt: new Date() }, { transaction });
    await recordEvent(request.id, {
      actorType: 'customer',
      actorId: userId,
      eventType: 'cancelled',
      note
    }, transaction);
    await transaction.commit();
    return getReturnRequest(returnId, { admin: false, userId });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

/** Admin override: status, refund amount or window start, always with a written reason. */
async function overrideReturn({ returnId, admin, note, status = null, refundAmount = null, windowStartAt = null }) {
  const reason = String(note || '').trim();
  if (reason.length < 10) {
    throw serviceError(400, 'A written reason (10 characters minimum) is required for an override.', 'RETURN_OVERRIDE_REASON_REQUIRED');
  }
  const transaction = await sequelize.transaction();
  try {
    const request = await loadForUpdate(returnId, transaction);
    const values = {};
    if (status) {
      if (!RETURN_STATUSES.includes(status)) {
        throw serviceError(400, 'Invalid return status.', 'RETURN_STATUS_INVALID');
      }
      values.status = status;
    }
    if (refundAmount !== null && refundAmount !== undefined) {
      const amountMinor = toMinor(refundAmount);
      if (amountMinor < 0) throw serviceError(400, 'Invalid refund amount.', 'REFUND_AMOUNT_INVALID');
      values.refundAmount = fromMinor(amountMinor);
    }
    if (windowStartAt) {
      const date = new Date(windowStartAt);
      if (Number.isNaN(date.getTime())) throw serviceError(400, 'Invalid window start date.', 'RETURN_WINDOW_INVALID');
      values.windowStartAt = date;
    }
    if (!Object.keys(values).length) throw serviceError(400, 'Nothing to override.', 'RETURN_OVERRIDE_EMPTY');
    await request.update(values, { transaction });
    await recordEvent(request.id, {
      actorType: 'admin',
      actorId: admin?.id || null,
      eventType: 'admin_override',
      note: reason,
      metadata: { previous: { status: request.previous('status'), refundAmount: request.previous('refundAmount') }, values }
    }, transaction);
    await transaction.commit();
    return getReturnRequest(returnId, { admin: true });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

/** Admin changes the delivery date used to open the return window (audited). */
async function overrideDeliveryDate({ orderId, admin, deliveredAt, note }) {
  const reason = String(note || '').trim();
  if (reason.length < 10) {
    throw serviceError(400, 'A written reason is required when changing the delivery date.', 'ORDER_DELIVERY_OVERRIDE_REASON_REQUIRED');
  }
  const date = deliveredAt ? new Date(deliveredAt) : null;
  if (deliveredAt && Number.isNaN(date.getTime())) {
    throw serviceError(400, 'Invalid delivery date.', 'ORDER_DELIVERY_DATE_INVALID');
  }
  const order = await StoreOrder.findByPk(orderId);
  if (!order) throw serviceError(404, 'Order not found.');
  const previous = order.deliveredAt;
  await order.update({ deliveredAt: date });
  await AuditLog.create({
    userId: admin?.id || null,
    action: 'OVERRIDE_ORDER_DELIVERY_DATE',
    entityType: 'StoreOrder',
    entityId: String(order.id),
    metadata: { previous, deliveredAt: date, reason }
  });
  return order;
}

/** Expires approved returns that were never shipped back and sends reminders. */
async function processReturnDeadlines({ now = new Date(), settings = null } = {}) {
  const activeSettings = settings || await policy.getReturnPolicy();
  const candidates = await ReturnRequest.findAll({
    where: {
      status: { [Op.in]: ['approved', 'awaiting_shipment'] },
      shipBackDeadline: { [Op.ne]: null }
    }
  });
  let expired = 0;
  let reminded = 0;
  for (const request of candidates) {
    const deadline = new Date(request.shipBackDeadline);
    const language = tokenFor((await User.findByPk(request.userId))?.language);
    if (deadline <= now) {
      await request.update({ status: 'expired', expiredAt: now });
      await addEvent(request, {
        actorType: 'system',
        eventType: 'expired',
        metadata: { shipBackDeadline: deadline }
      });
      await notifyReturn({
        code: 'return_expired',
        request,
        settings: activeSettings,
        language
      }).catch((error) => console.error('Échec de l’e-mail de retour :', error));
      expired += 1;
      continue;
    }
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft > REMINDER_DAYS_BEFORE) continue;
    const alreadyReminded = await ReturnEvent.count({
      where: { returnRequestId: request.id, eventType: 'ship_reminder_sent' }
    });
    if (alreadyReminded) continue;
    await addEvent(request, {
      actorType: 'system',
      eventType: 'ship_reminder_sent',
      metadata: { daysLeft }
    });
    await notifyReturn({
      code: 'return_ship_reminder',
      request,
      settings: activeSettings,
      language,
      extra: { daysLeft: String(daysLeft) }
    }).catch((error) => console.error('Échec de l’e-mail de retour :', error));
    reminded += 1;
  }
  return { processed: candidates.length, expired, reminded };
}

async function returnsDashboard({ now = new Date() } = {}) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [open, refundedThisMonth, totalReturns, refunds, reasons, ordersThisMonth] = await Promise.all([
    ReturnRequest.count({ where: { status: { [Op.in]: OPEN_STATUSES } } }),
    ReturnRequest.count({ where: { status: 'refunded', refundedAt: { [Op.gte]: monthStart } } }),
    ReturnRequest.count({ where: { requestedAt: { [Op.gte]: monthStart } } }),
    ReturnRefund.findAll({ where: { status: 'succeeded' }, attributes: ['amount', 'issuedAt'] }),
    ReturnRequest.findAll({ attributes: ['reason'], where: { requestedAt: { [Op.gte]: monthStart } } }),
    StoreOrder.count({ where: { createdAt: { [Op.gte]: monthStart }, status: 'paid' } })
  ]);
  const averageRefundDays = refunds.length
    ? refunds.reduce((sum, refund) => sum + (refund.issuedAt ? (now.getTime() - new Date(refund.issuedAt).getTime()) / DAY_MS : 0), 0) / refunds.length
    : 0;
  const reasonCounts = reasons.reduce((counts, row) => {
    counts[row.reason] = (counts[row.reason] || 0) + 1;
    return counts;
  }, {});
  return {
    openReturns: open,
    refundsThisMonth: refundedThisMonth,
    returnsThisMonth: totalReturns,
    ordersThisMonth,
    returnRate: ordersThisMonth > 0 ? Number(((totalReturns / ordersThisMonth) * 100).toFixed(1)) : 0,
    averageRefundDays: Number(averageRefundDays.toFixed(1)),
    topReasons: Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count }))
  };
}

function toCsv(rows) {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return rows.map((row) => row.map(escape).join(',')).join('\n');
}

module.exports = {
  OPEN_STATUSES,
  INACTIVE_STATUSES,
  serviceError,
  formatMoney,
  formatDate,
  returnUrl,
  orderReturnQuote,
  boxReturnQuote,
  createReturnRequest,
  getReturnRequest,
  listUserReturns,
  approveReturn,
  rejectReturn,
  addTracking,
  markReceived,
  inspectReturn,
  issueRefund,
  closeReturn,
  cancelReturn,
  overrideReturn,
  overrideDeliveryDate,
  processReturnDeadlines,
  returnsDashboard,
  toCsv,
  nextRmaNumber
};
