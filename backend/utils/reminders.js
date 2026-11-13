const { Op } = require('sequelize');
const { ScheduledReminder, User, sequelize } = require('../models');
const { sendTemplateEmail } = require('./email');

async function processDueReminders({ limit = 100, now = new Date() } = {}) {
  const pending = await ScheduledReminder.findAll({
    where: { status: 'pending', scheduledAt: { [Op.lte]: now } },
    attributes: ['id'],
    order: [['scheduledAt', 'ASC']],
    limit
  });
  let sent = 0;
  let processed = 0;

  for (const { id } of pending) {
    const transaction = await sequelize.transaction();
    try {
      const reminder = await ScheduledReminder.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!reminder || reminder.status !== 'pending' || reminder.scheduledAt > now) {
        await transaction.commit();
        continue;
      }

      processed += 1;
      const user = await User.findByPk(reminder.userId, { transaction });
      const preferenceField = reminder.preferenceCategory === 'marketing' ? 'marketing' : 'reminders';
      if (!user || (
        reminder.preferenceCategory !== 'transactional' &&
        user.emailPreferences?.[preferenceField] === false
      )) {
        await reminder.update({ status: 'cancelled' }, { transaction });
        await transaction.commit();
        continue;
      }

      const delivered = await sendTemplateEmail({
        templateCode: reminder.code,
        to: user.email,
        language: user.language,
        variables: {
          ...(reminder.metadata && typeof reminder.metadata === 'object' ? reminder.metadata : {}),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        },
        purpose: `reminder:${reminder.code}`
      });
      if (!delivered) {
        await reminder.update({ status: 'cancelled' }, { transaction });
      } else {
        await reminder.update({ status: 'sent', sentAt: now }, { transaction });
        sent += 1;
      }
      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      throw error;
    }
  }

  return { processed, sent };
}

module.exports = { processDueReminders };
