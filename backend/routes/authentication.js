const router = require('express').Router();
const sequelize = require('../config/database');
const { User, Organization } = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const {
  validateBody,
  buyerOnboardingSchema,
  organizationVerificationSchema
} = require('../middleware/validation');
const { recordAudit } = require('../utils/audit');
const { notifyOrganization } = require('../utils/notifications');

function publicUser(user) {
  const result = user.toJSON();
  delete result.passwordHash;
  return result;
}

router.patch('/onboarding', authenticate, allowRoles('BUYER'), validateBody(buyerOnboardingSchema), async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    if (req.user.organizationId) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Une organisation est déjà associée à ce compte.' });
    }
    const organization = await Organization.create({
      type: 'BUYER',
      legalName: req.body.legalName,
      country: req.body.country,
      address: req.body.address,
      registrationNumber: req.body.registrationNumber,
      verificationStatus: 'PENDING'
    }, { transaction });
    req.user.organizationId = organization.id;
    await req.user.save({ transaction });
    await transaction.commit();
    await recordAudit(req, 'COMPLETE_BUYER_ONBOARDING', 'Organization', organization.id);
    res.status(201).json({ user: publicUser(req.user), organization });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.get('/organizations', authenticate, allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const organizations = await Organization.findAll({
      where: req.query.status ? { verificationStatus: req.query.status } : undefined,
      order: [['createdAt', 'DESC']]
    });
    res.json(organizations);
  } catch (error) {
    next(error);
  }
});

router.patch('/organizations/:id/verification', authenticate, allowRoles('ADMIN'), validateBody(organizationVerificationSchema), async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const organization = await Organization.findByPk(req.params.id, { transaction });
    if (!organization) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Organisation introuvable.' });
    }
    organization.verificationStatus = req.body.verificationStatus;
    if (req.body.internalAdminNote !== undefined) {
      organization.internalAdminNote = req.body.internalAdminNote;
    }
    await organization.save({ transaction });
    await notifyOrganization(
      organization.id,
      'Vérification de votre organisation',
      `Le statut de votre organisation est maintenant : ${organization.verificationStatus}.`,
      '/workspace',
      organization.verificationStatus === 'APPROVED' ? 'success' : 'warning',
      transaction
    );
    await transaction.commit();
    await recordAudit(req, 'VERIFY_ORGANIZATION', 'Organization', organization.id, {
      verificationStatus: organization.verificationStatus
    });
    res.json(organization);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(error);
  }
});

module.exports = router;
