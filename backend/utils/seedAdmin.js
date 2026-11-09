async function ensureSeedAdmin({
  User,
  hashPassword,
  email,
  password,
  previousEmail,
  deletePreviousAdmin = false
}) {
  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL et SEED_ADMIN_PASSWORD sont requis pour créer ou mettre à jour le SUPER_ADMIN.');
  }
  const transaction = await User.sequelize.transaction();
  try {
    const normalizedEmail = email.toLowerCase();
    const normalizedPreviousEmail = previousEmail?.toLowerCase();
    const previousUser = normalizedPreviousEmail
      ? await User.findOne({
        where: { email: normalizedPreviousEmail },
        transaction,
        lock: transaction.LOCK.UPDATE
      })
      : null;
    const targetUser = normalizedEmail === normalizedPreviousEmail
      ? previousUser
      : await User.findOne({
        where: { email: normalizedEmail },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

    if (previousUser && previousUser.role !== 'SUPER_ADMIN') {
      throw new Error('SEED_ADMIN_PREVIOUS_EMAIL ne correspond pas à un compte SUPER_ADMIN.');
    }
    if (previousUser && targetUser && !deletePreviousAdmin &&
      normalizedEmail !== normalizedPreviousEmail) {
      throw new Error('SEED_ADMIN_EMAIL est déjà utilisé par un autre compte. Aucun compte n’a été modifié.');
    }
    if (previousUser && targetUser && deletePreviousAdmin &&
      !['READER', 'SUPER_ADMIN'].includes(targetUser.role)) {
      throw new Error('Le compte de destination doit être READER ou SUPER_ADMIN pour le transfert demandé.');
    }
    const userToUpdate = previousUser || targetUser;
    if (userToUpdate && userToUpdate !== targetUser && userToUpdate.role !== 'SUPER_ADMIN') {
      throw new Error('SEED_ADMIN_EMAIL existe déjà, mais ce compte n’est pas SUPER_ADMIN.');
    }
    if (targetUser && targetUser !== previousUser &&
      !deletePreviousAdmin && targetUser.role !== 'SUPER_ADMIN') {
      throw new Error('SEED_ADMIN_EMAIL existe déjà, mais ce compte n’est pas SUPER_ADMIN.');
    }

    const passwordHash = await hashPassword(password);
    const attributes = {
      email: normalizedEmail,
      passwordHash,
      role: 'SUPER_ADMIN',
      organizationId: null,
      status: 'ACTIVE',
      language: userToUpdate?.language || 'fr',
      emailVerifiedAt: userToUpdate?.emailVerifiedAt || new Date()
    };

    let user;
    if (targetUser && deletePreviousAdmin && previousUser) {
      await targetUser.update(attributes, { transaction });
      await previousUser.destroy({ transaction, force: true });
      user = targetUser;
    } else if (userToUpdate) {
      await userToUpdate.update(attributes, { transaction });
      user = userToUpdate;
    } else {
      user = await User.create({
        ...attributes,
        firstName: 'Administration',
        lastName: 'Plateforme'
      }, { transaction });
    }
    await transaction.commit();
    return {
      user,
      renamed: Boolean(previousUser && normalizedEmail !== normalizedPreviousEmail),
      removedPrevious: Boolean(previousUser && targetUser && deletePreviousAdmin)
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

module.exports = { ensureSeedAdmin };
