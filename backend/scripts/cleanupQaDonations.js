/* Removes the seeded QA campaign and its non-financial test donation rows. */
const { DonationCampaign, Donation, RecurringDonation, sequelize } = require('../models');

async function cleanup() {
  const transaction = await sequelize.transaction();
  try {
    const campaigns = await DonationCampaign.findAll({ where: { slug: 'qa-campagne' }, transaction });
    const ids = campaigns.map((campaign) => campaign.id);
    if (!ids.length) {
      await transaction.commit();
      return { campaigns: 0, donations: 0, recurring: 0 };
    }
    const donations = await Donation.destroy({ where: { campaignId: ids }, transaction });
    const recurring = await RecurringDonation.destroy({ where: { campaignId: ids }, transaction });
    await DonationCampaign.destroy({ where: { id: ids }, transaction });
    await transaction.commit();
    return { campaigns: ids.length, donations, recurring };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

if (require.main === module) {
  cleanup()
    .then((result) => console.log(`QA donation cleanup: ${JSON.stringify(result)}`))
    .then(() => sequelize.close())
    .catch(async (error) => {
      console.error(error);
      await sequelize.close();
      process.exitCode = 1;
    });
}

module.exports = cleanup;