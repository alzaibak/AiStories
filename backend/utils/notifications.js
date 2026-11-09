const { Notification, User } = require('../models');

async function notifyUser(userId, title, message, link, type = 'info', transaction) {
  if (!userId) return null;
  return Notification.create({
    userId,
    title,
    message,
    link,
    type
  }, { transaction });
}

async function notifyOrganization(organizationId, title, message, link, type = 'info', transaction) {
  const users = await User.findAll({
    where: { organizationId, status: 'ACTIVE' },
    attributes: ['id'],
    transaction
  });
  if (!users.length) return [];
  return Notification.bulkCreate(users.map((user) => ({
    userId: user.id,
    title,
    message,
    link,
    type
  })), { transaction });
}

module.exports = { notifyUser, notifyOrganization };
