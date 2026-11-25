/*
 * Pure refund math for physical-book returns. Every amount is handled in minor
 * units (cents) so the customer preview, the admin screen and the Stripe refund
 * always agree to the cent. No database or Stripe access lives here.
 */

const DEDUCTION_MODES = ['defined_fee', 'fee_paid'];

function toMinor(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function fromMinor(minor) {
  return (Math.round(Number(minor) || 0) / 100).toFixed(2);
}

function clampInteger(value, min, max) {
  const rounded = Math.round(Number(value) || 0);
  return Math.min(Math.max(rounded, min), max);
}

/**
 * @param {object} input
 * @param {number} input.pricePaidMinor Item value actually paid for the returned quantity (after discount).
 * @param {number} [input.definedShippingFeeMinor] Delivery fee defined for that book/order at purchase.
 * @param {number} [input.shippingFeeChargedMinor] Delivery fee the customer actually paid (0 when free shipping).
 * @param {'defined_fee'|'fee_paid'} [input.deliveryDeductionMode]
 * @param {number} [input.orderReturnableValueMinor] Paid value of every returnable item of the order.
 * @param {number} [input.returnedValueMinor] Paid value of the items returned in this request.
 * @param {boolean} [input.allReturnableReturned] True when this request covers every returnable item.
 * @param {number} [input.alreadyDeductedFeeMinor] Delivery fee already deducted by previous refunds of that order.
 * @param {number} [input.daysSinceDelivery]
 * @param {number} [input.legalWithdrawalDays]
 * @param {boolean} [input.applyLegalWithdrawalRules]
 * @param {boolean} [input.sellerFault] Defective, wrong or lost item: full refund, fee included.
 * @param {number|null} [input.manualRefundMinor] Partial refund decided by the admin after inspection.
 * @param {number} [input.orderPaidMinor] Total paid for the order, used as an absolute cap.
 * @param {number} [input.alreadyRefundedMinor] Amount already refunded on that order.
 */
function calculateRefund(input = {}) {
  const pricePaid = Math.max(0, Math.round(Number(input.pricePaidMinor) || 0));
  const mode = DEDUCTION_MODES.includes(input.deliveryDeductionMode)
    ? input.deliveryDeductionMode
    : 'defined_fee';
  const definedFee = Math.max(0, Math.round(Number(input.definedShippingFeeMinor) || 0));
  const feeCharged = Math.max(0, Math.round(Number(input.shippingFeeChargedMinor) || 0));
  const feeBase = mode === 'fee_paid' ? feeCharged : definedFee;

  const orderValue = Math.max(0, Math.round(Number(input.orderReturnableValueMinor) || 0));
  const returnedValue = Math.max(0, Math.round(Number(input.returnedValueMinor) || pricePaid));
  const allReturned = input.allReturnableReturned === true ||
    (orderValue > 0 && returnedValue >= orderValue);

  const proportionalShare = allReturned || orderValue === 0
    ? 1
    : Math.min(1, Math.max(0, returnedValue / orderValue));

  const alreadyDeducted = Math.max(0, Math.round(Number(input.alreadyDeductedFeeMinor) || 0));
  const feeRemaining = Math.max(0, feeBase - alreadyDeducted);

  const daysSinceDelivery = Number.isFinite(Number(input.daysSinceDelivery))
    ? Math.max(0, Math.floor(Number(input.daysSinceDelivery)))
    : Number.POSITIVE_INFINITY;
  const legalDays = Number.isFinite(Number(input.legalWithdrawalDays))
    ? Math.max(0, Math.floor(Number(input.legalWithdrawalDays)))
    : 0;

  const legalPeriodApplied = input.applyLegalWithdrawalRules !== false &&
    daysSinceDelivery <= legalDays;
  const sellerFaultOverride = input.sellerFault === true;

  const feeShare = Math.round(feeBase * proportionalShare);
  const deductibleShare = Math.min(feeShare, feeRemaining);
  const deliveryFeeDeduction = (legalPeriodApplied || sellerFaultOverride)
    ? 0
    : Math.min(deductibleShare, pricePaid);

  let refund = Math.max(0, pricePaid - deliveryFeeDeduction);

  let manualAdjustment = 0;
  if (input.manualRefundMinor !== null && input.manualRefundMinor !== undefined) {
    const manual = clampInteger(input.manualRefundMinor, 0, refund);
    manualAdjustment = refund - manual;
    refund = manual;
  }

  const orderPaid = Math.max(0, Math.round(Number(input.orderPaidMinor) || 0));
  const alreadyRefunded = Math.max(0, Math.round(Number(input.alreadyRefundedMinor) || 0));
  const payable = orderPaid > 0 ? Math.max(0, orderPaid - alreadyRefunded) : refund;
  const cappedByAmountPaid = refund > payable;
  refund = Math.min(refund, payable);

  return {
    pricePaidMinor: pricePaid,
    deliveryFeeBaseMinor: feeBase,
    deliveryFeeShareMinor: feeShare,
    deliveryFeeDeductionMinor: deliveryFeeDeduction,
    manualAdjustmentMinor: manualAdjustment,
    refundMinor: refund,
    refundAmount: fromMinor(refund),
    deliveryDeductionAmount: fromMinor(deliveryFeeDeduction),
    pricePaidAmount: fromMinor(pricePaid),
    legalPeriodApplied,
    sellerFaultOverride,
    deductionMode: mode,
    allReturnableReturned: allReturned,
    proportionalShare: Number(proportionalShare.toFixed(4)),
    cappedByAmountPaid,
    neverNegative: refund >= 0,
    breakdown: {
      pricePaidMinor: pricePaid,
      deliveryFeeDefinedMinor: definedFee,
      deliveryFeeChargedMinor: feeCharged,
      deliveryFeeDeductedMinor: deliveryFeeDeduction,
      deliveryFeeShareMinor: feeShare,
      alreadyDeductedFeeMinor: alreadyDeducted,
      manualAdjustmentMinor: manualAdjustment,
      legalWithdrawalDays: legalDays,
      daysSinceDelivery: Number.isFinite(daysSinceDelivery) ? daysSinceDelivery : null,
      alreadyRefundedMinor: alreadyRefunded,
      refundMinor: refund
    }
  };
}

const COPY = {
  fr: {
    paid: 'Prix payé',
    deduction: 'Frais de livraison déduits',
    legal: 'Période de rétractation légale : les frais de livraison sont remboursés',
    sellerFault: 'Article défectueux, erroné ou perdu : remboursement intégral, frais de livraison inclus',
    commercial: 'Période commerciale : les frais de livraison ne sont pas remboursés',
    share: 'Part des frais de livraison correspondant aux livres retournés',
    manual: 'Ajustement après inspection',
    cap: 'Limit\u00e9 au montant encore remboursable de la commande',
    total: 'Montant remboursé'
  },
  en: {
    paid: 'Price paid',
    deduction: 'Delivery fee deducted',
    legal: 'Legal withdrawal period: the delivery fee is refunded',
    sellerFault: 'Defective, wrong or lost item: full refund including the delivery fee',
    commercial: 'Commercial return period: the delivery fee is not refunded',
    share: 'Share of the delivery fee matching the returned books',
    manual: 'Adjustment after inspection',
    cap: 'Capped to the amount still refundable on this order',
    total: 'Refund amount'
  },
  ar: {
    paid: 'السعر المدفوع',
    deduction: 'تُخصم رسوم التوصيل',
    legal: 'فترة العدول القانونية: تُرد رسوم التوصيل',
    sellerFault: 'منتج معيب أو خاطئ أو مفقود: استرداد كامل بما فيه رسوم التوصيل',
    commercial: 'فترة الإرجاع التجارية: لا تُرد رسوم التوصيل',
    share: 'حصة رسوم التوصيل المقابلة للكتب المُرجعة',
    manual: 'تعديل بعد الفحص',
    cap: 'محدود بالمبلغ القابل للاسترداد في الطلب',
    total: 'المبلغ المسترد'
  }
};

/** Locale-aware, human-readable lines for API responses and emails. */
function explainRefund(result, language = 'fr', { formatMoney } = {}) {
  const copy = COPY[language] || COPY.fr;
  const money = typeof formatMoney === 'function'
    ? formatMoney
    : (minor) => fromMinor(minor);
  const lines = [{ code: 'price_paid', label: copy.paid, amount: money(result.pricePaidMinor) }];

  if (result.sellerFaultOverride) {
    lines.push({ code: 'seller_fault', label: copy.sellerFault, amount: null });
  } else if (result.legalPeriodApplied) {
    lines.push({ code: 'legal_period', label: copy.legal, amount: null });
  } else {
    lines.push({ code: 'delivery_deduction', label: copy.deduction, amount: money(result.deliveryFeeDeductionMinor) });
    if (result.proportionalShare < 1) {
      lines.push({ code: 'delivery_share', label: copy.share, amount: null });
    }
    lines.push({ code: 'commercial_period', label: copy.commercial, amount: null });
  }
  if (result.manualAdjustmentMinor > 0) {
    lines.push({ code: 'manual_adjustment', label: copy.manual, amount: money(result.manualAdjustmentMinor) });
  }
  if (result.cappedByAmountPaid) {
    lines.push({ code: 'amount_cap', label: copy.cap, amount: null });
  }
  lines.push({ code: 'total', label: copy.total, amount: money(result.refundMinor) });

  return { lines, text: lines.map((line) => (line.amount === null ? `• ${line.label}` : `• ${line.label} : ${line.amount}`)).join('\n') };
}

module.exports = { calculateRefund, explainRefund, toMinor, fromMinor, DEDUCTION_MODES };
