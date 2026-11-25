/* Pure donation campaign maths. All money is handled in integer cents. */

function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function fromCents(cents) {
  return (Math.round(Number(cents) || 0) / 100).toFixed(2);
}

function totalCost(campaign) {
  const units = Math.max(0, Number(campaign.targetUnits) || 0);
  const unitCost = toCents(campaign.costPerUnit);
  const extra = Math.max(0, toCents(campaign.extraCosts));
  return units * unitCost + extra;
}

function resolveDonationAmount({ campaign, tier = null, amount = null, currency }) {
  const campaignCurrency = String(campaign.currency || 'EUR').toUpperCase();
  if (String(currency || campaignCurrency).toUpperCase() !== campaignCurrency) {
    const error = new Error('The donation currency does not match the campaign.');
    error.status = 400;
    error.code = 'DONATION_CURRENCY_MISMATCH';
    throw error;
  }
  let cents;
  let units = 0;
  if (tier) {
    if (Number(tier.campaignId) !== Number(campaign.id) || tier.isActive === false) {
      const error = new Error('This donation tier does not belong to the campaign.');
      error.status = 404;
      error.code = 'DONATION_TIER_NOT_FOUND';
      throw error;
    }
    cents = toCents(tier.amount);
    const tierCost = toCents(campaign.costPerUnit);
    units = tierCost > 0 ? Math.floor(cents / tierCost) : Math.max(0, Number(tier.units) || 0);
  } else {
    if (!campaign.allowCustomAmount) {
      const error = new Error('Custom donation amounts are disabled for this campaign.');
      error.status = 422;
      error.code = 'CUSTOM_AMOUNT_DISABLED';
      throw error;
    }
    cents = toCents(amount);
    const min = Math.max(1, toCents(campaign.minAmount || 1));
    const max = campaign.maxAmount == null ? null : toCents(campaign.maxAmount);
    if (!Number.isSafeInteger(cents) || cents < min || (max !== null && cents > max)) {
      const error = new Error('The donation amount is outside the allowed range.');
      error.status = 422;
      error.code = 'DONATION_AMOUNT_OUT_OF_RANGE';
      throw error;
    }
    const costPerUnit = toCents(campaign.costPerUnit);
    units = costPerUnit > 0 ? Math.floor(cents / costPerUnit) : 0;
  }
  if (cents < 1) {
    const error = new Error('The donation amount must be positive.');
    error.status = 422;
    error.code = 'DONATION_AMOUNT_INVALID';
    throw error;
  }
  return { cents, amount: fromCents(cents), units };
}

function campaignState(campaign, paidDonations = [], now = new Date()) {
  const amountCents = paidDonations.reduce((sum, donation) => sum + toCents(donation.amount), 0);
  const units = paidDonations.reduce((sum, donation) => sum + Math.max(0, Number(donation.unitsSponsored) || 0), 0);
  const donors = new Set(paidDonations.map((donation) => donation.userId).filter(Boolean)).size;
  const goalCents = Math.max(0, toCents(campaign.goalAmount));
  const targetUnits = Math.max(0, Number(campaign.targetUnits) || 0);
  const amountPercent = goalCents > 0 ? Math.min(100, Math.round((amountCents / goalCents) * 1000) / 10) : 0;
  const unitsPercent = targetUnits > 0 ? Math.min(100, Math.round((units / targetUnits) * 1000) / 10) : 0;
  const amountReached = goalCents > 0 && amountCents >= goalCents;
  const unitsReached = targetUnits > 0 && units >= targetUnits;
  const targetReached = campaign.campaignType === 'items_goal'
    ? unitsReached
    : campaign.campaignType === 'both'
      ? amountReached && unitsReached
      : amountReached;
  const ended = Boolean(campaign.endsAt && new Date(campaign.endsAt) <= now);
  const notStarted = Boolean(campaign.startsAt && new Date(campaign.startsAt) > now);
  const full = targetReached && campaign.overfundingPolicy === 'close';
  return {
    raisedAmount: fromCents(amountCents),
    raisedMinor: amountCents,
    sponsoredUnits: units,
    donorCount: donors,
    amountPercent,
    unitsPercent,
    amountReached,
    unitsReached,
    targetReached,
    ended,
    notStarted,
    full,
    canDonate: campaign.status === 'active' && !ended && !notStarted && !full
  };
}

module.exports = { toCents, fromCents, totalCost, resolveDonationAmount, campaignState };
