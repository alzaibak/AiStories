const { Op } = require('sequelize');
const { CampaignItem, Donation, DonationCampaign, sequelize } = require('../models');
const { campaignState, toCents, fromCents } = require('./donations');

async function paidDonations(campaignId, transaction = null) {
  return Donation.findAll({
    where: { campaignId, status: 'paid' },
    attributes: ['id', 'userId', 'amount', 'unitsSponsored', 'currency', 'isAnonymous', 'displayName', 'paidAt', 'createdAt', 'status', 'campaignId'],
    transaction
  });
}

/**
 * Progress is a projection of paid donations, never an incrementing counter.
 * The row is locked so two simultaneous webhooks cannot overwrite each other
 * with stale totals.
 */
async function recomputeCampaignProgress(campaignId, transaction = null) {
  const ownTransaction = !transaction;
  const currentTransaction = transaction || await sequelize.transaction();
  try {
    const campaign = await DonationCampaign.findByPk(campaignId, {
      transaction: currentTransaction,
      lock: currentTransaction.LOCK.UPDATE
    });
    if (!campaign) {
      if (ownTransaction) await currentTransaction.commit();
      return null;
    }
    const donations = await paidDonations(campaign.id, currentTransaction);
    const state = campaignState(campaign, donations);
    const units = state.sponsoredUnits;
    const values = {
      raisedAmount: state.raisedAmount,
      sponsoredUnits: units,
      sponsoredBooksCount: units,
      donorCount: state.donorCount
    };
    if (state.targetReached && campaign.overfundingPolicy === 'close' && campaign.status === 'active') {
      values.status = 'completed';
    }
    await campaign.update(values, { transaction: currentTransaction });

    const items = await CampaignItem.findAll({
      where: { campaignId: campaign.id },
      order: [['id', 'ASC']],
      transaction: currentTransaction,
      lock: currentTransaction.LOCK.UPDATE
    });
    let remaining = units;
    for (const item of items) {
      const share = Math.min(remaining, Math.max(0, Number(item.quantityTarget) || 0));
      await item.update({ quantitySponsored: share }, { transaction: currentTransaction });
      remaining -= share;
    }
    if (ownTransaction) await currentTransaction.commit();
    return {
      campaign,
      ...state,
      currency: campaign.currency,
      totalCost: campaign.costPerUnit
        ? fromCents(toCents(campaign.costPerUnit) * Math.max(0, Number(campaign.targetUnits) || 0) + toCents(campaign.extraCosts))
        : null
    };
  } catch (error) {
    if (ownTransaction && !currentTransaction.finished) await currentTransaction.rollback();
    throw error;
  }
}

async function recomputeAllCampaigns() {
  const campaigns = await DonationCampaign.findAll({ attributes: ['id'] });
  const results = [];
  for (const campaign of campaigns) {
    results.push(await recomputeCampaignProgress(campaign.id));
  }
  return results;
}

async function paidCampaignDonations(campaignId) {
  return Donation.findAll({
    where: { campaignId, status: 'paid' },
    order: [['createdAt', 'DESC']]
  });
}

module.exports = {
  paidDonations,
  paidCampaignDonations,
  recomputeCampaignProgress,
  recomputeAllCampaigns
};
