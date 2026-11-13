const { ScheduledReminder } = require('../models');

const preferenceFields = {
  reminders: 'reminders',
  marketing: 'marketing'
};

function buildEmailQueueRows({ recipients, code, preferenceCategory, dedupeKeyPrefix, metadata, scheduledAt = new Date() }) {
  if (!['reminders', 'marketing', 'transactional'].includes(preferenceCategory)) {
    throw new Error(`Unsupported email preference category: ${preferenceCategory}`);
  }
  const preferenceField = preferenceFields[preferenceCategory];
  return recipients
    .filter((user) => user && (!preferenceField || user.emailPreferences?.[preferenceField] !== false))
    .map((user) => ({
      userId: user.id,
      code,
      preferenceCategory,
      dedupeKey: `${dedupeKeyPrefix}:${user.id}`,
      scheduledAt,
      metadata: typeof metadata === 'function' ? metadata(user) : metadata
    }));
}

async function enqueueTemplateEmails(options) {
  const rows = buildEmailQueueRows(options);
  for (let offset = 0; offset < rows.length; offset += 500) {
    await ScheduledReminder.bulkCreate(rows.slice(offset, offset + 500), {
      ignoreDuplicates: true,
      validate: true
    });
  }
  return rows.length;
}

module.exports = { buildEmailQueueRows, enqueueTemplateEmails };
