const router = require('express').Router();
const { Op } = require('sequelize');
const { z } = require('zod');
const {
  Book,
  CampaignItem,
  CampaignUpdate,
  Collection,
  DistributionPlace,
  Donation,
  DonationCampaign,
  DonationTier,
  Story,
  User,
  sequelize
} = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const { validateBody } = require('../middleware/validation');
const schemas = require('../middleware/storyValidation');
const { requestedLanguage } = require('../utils/contentLocalization');
const { campaignState, totalCost, toCents, fromCents } = require('../utils/donations');
const { paidDonations, recomputeCampaignProgress } = require('../utils/donationService');
const { recordAudit } = require('../utils/audit');
const { createStripeClient } = require('../utils/stripe');
const { slugFromLocalized } = require('../utils/slug');

const admins = [authenticate, allowRoles('ADMIN', 'SUPER_ADMIN')];

function apiError(status, message, code) {
  const error = new Error(message);
  if (code) error.code = code;
  error.status = status;
  return error;
}

function localized(value, language, field, fallback = '') {
  return value?.[language]?.[field] || value?.ar?.[field] || fallback;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function uniqueCampaignSlug(body) {
  const base = body.slug || slugFromLocalized(body.translations?.ar?.title || body.title, body.translations) || 'campaign';
  let candidate = base;
  for (let suffix = 2; await DonationCampaign.findOne({ where: { slug: candidate } }); suffix += 1) {
    candidate = `${base.slice(0, 240)}-${suffix}`;
  }
  return candidate;
}

function campaignValues(body, { creating = false } = {}) {
  const allowed = [
    'slug', 'translations', 'summary', 'goalAmount', 'currency', 'coverImage', 'bannerImage',
    'campaignType', 'targetUnits', 'unitName', 'costPerUnit', 'extraCosts', 'allowRecurring',
    'allowAnonymous', 'allowCustomAmount', 'minAmount', 'maxAmount', 'overfundingPolicy',
    'taxReceiptsEnabled', 'linkedStoryId', 'linkedBookId', 'linkedCollectionId', 'startsAt',
    'endsAt', 'status'
  ];
  const values = {};
  for (const key of allowed) {
    if (body[key] !== undefined) values[key] = body[key];
  }
  if (creating) {
    values.raisedAmount = 0;
    values.sponsoredUnits = 0;
    values.donorCount = 0;
  }
  if (values.goalAmount !== undefined) values.goalAmount = Number(values.goalAmount);
  if (values.targetUnits !== undefined) values.targetUnits = numberOrNull(values.targetUnits);
  if (values.costPerUnit !== undefined) values.costPerUnit = numberOrNull(values.costPerUnit);
  if (values.extraCosts !== undefined) values.extraCosts = Number(values.extraCosts) || 0;
  if (values.minAmount !== undefined) values.minAmount = Number(values.minAmount);
  if (values.maxAmount !== undefined) values.maxAmount = numberOrNull(values.maxAmount);
  return values;
}

function applyTotalCost(values, existing = null) {
  const merged = { ...(existing ? existing.toJSON() : {}), ...values };
  values.totalCost = fromCents(totalCost(merged));
  return values;
}

async function campaignDto(campaign, language) {
  const donations = await paidDonations(campaign.id);
  const state = campaignState(campaign, donations);
  const [tiers, items, places, updates] = await Promise.all([
    DonationTier.findAll({ where: { campaignId: campaign.id, isActive: true }, order: [['sortOrder', 'ASC'], ['amount', 'ASC']] }),
    CampaignItem.findAll({
      where: { campaignId: campaign.id },
      include: [{ model: Book, as: 'book', attributes: ['id', 'slug', 'title', 'cover'] }],
      order: [['id', 'ASC']]
    }),
    DistributionPlace.findAll({
      where: { campaignId: campaign.id, isPublic: true },
      order: [['plannedQuantity', 'DESC'], ['id', 'ASC']]
    }),
    CampaignUpdate.findAll({
      where: { campaignId: campaign.id, publishedAt: { [Op.ne]: null, [Op.lte]: new Date() } },
      order: [['publishedAt', 'DESC']],
      limit: 20
    })
  ]);
  const supporters = donations
    .filter((donation) => !donation.isAnonymous && donation.displayName)
    .slice(0, 50)
    .map((donation) => ({ name: donation.displayName, units: donation.unitsSponsored, date: donation.paidAt || donation.createdAt }));
  return {
    id: campaign.id,
    slug: campaign.slug,
    status: campaign.status,
    title: localized(campaign.translations, language, 'title'),
    description: localized(campaign.translations, language, 'description'),
    summary: campaign.summary?.[language] || campaign.summary?.ar || '',
    coverImage: campaign.coverImage,
    bannerImage: campaign.bannerImage,
    currency: campaign.currency,
    goalAmount: campaign.goalAmount,
    raisedAmount: state.raisedAmount,
    campaignType: campaign.campaignType,
    targetUnits: campaign.targetUnits,
    sponsoredUnits: state.sponsoredUnits,
    unitName: campaign.unitName?.[language] || campaign.unitName?.ar || '',
    costPerUnit: campaign.costPerUnit,
    extraCosts: campaign.extraCosts,
    totalCost: fromCents(totalCost(campaign)),
    donorCount: state.donorCount,
    amountPercent: state.amountPercent,
    unitsPercent: state.unitsPercent,
    amountReached: state.amountReached,
    unitsReached: state.unitsReached,
    canDonate: state.canDonate,
    allowRecurring: campaign.allowRecurring,
    allowAnonymous: campaign.allowAnonymous,
    allowCustomAmount: campaign.allowCustomAmount,
    minAmount: campaign.minAmount,
    maxAmount: campaign.maxAmount,
    overfundingPolicy: campaign.overfundingPolicy,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    linked: {
      story: campaign.story ? { slug: campaign.story.slug, title: campaign.story.title } : null,
      book: campaign.book ? { slug: campaign.book.slug, title: campaign.book.title } : null,
      collection: campaign.collection ? { slug: campaign.collection.slug, title: campaign.collection.title } : null
    },
    tiers: tiers.map((tier) => ({
      id: tier.id,
      amount: tier.amount,
      units: tier.units,
      label: tier.label?.[language] || tier.label?.ar || `${tier.amount} ${campaign.currency}`,
      isActive: tier.isActive
    })),
    items: items.map((item) => ({
      id: item.id,
      book: item.book ? { slug: item.book.slug, title: item.book.title, cover: item.book.cover } : null,
      label: item.label?.[language] || item.label?.ar || item.book?.title || '',
      quantityTarget: item.quantityTarget,
      unitCost: item.unitCost,
      quantitySponsored: item.quantitySponsored,
      quantityDistributed: item.quantityDistributed
    })),
    places: places.map((place) => ({
      id: place.id,
      name: place.name,
      type: place.type,
      city: place.city,
      country: place.country,
      plannedQuantity: place.plannedQuantity,
      status: place.status,
      distributionDate: place.distributionDate,
      notes: place.notes,
      reportText: place.reportText,
      images: place.images || [],
      consentConfirmed: place.consentConfirmed
    })),
    updates: updates.map((update) => ({
      id: update.id,
      title: localized(update.translations, language, 'title'),
      body: localized(update.translations, language, 'body'),
      images: update.images || [],
      publishedAt: update.publishedAt
    })),
    supporters
  };
}

function publicInclude() {
  return [
    { model: Story, as: 'story', attributes: ['id', 'slug', 'title', 'cover'], required: false },
    { model: Book, as: 'book', attributes: ['id', 'slug', 'title', 'cover'], required: false },
    { model: Collection, as: 'collection', attributes: ['id', 'slug', 'title', 'cover'], required: false }
  ];
}

router.get('/donation-campaigns', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const campaigns = await DonationCampaign.findAll({
      where: { status: { [Op.in]: ['active', 'completed'] } },
      include: publicInclude(),
      order: [['createdAt', 'DESC']],
      limit
    });
    res.set('Cache-Control', 'public, max-age=30');
    res.json(await Promise.all(campaigns.map((campaign) => campaignDto(campaign, language))));
  } catch (error) {
    next(error);
  }
});

router.get('/donation-campaigns/:slug', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const campaign = await DonationCampaign.findOne({
      where: {
        [Op.or]: [
          { slug: req.params.slug },
          ...(Number.isSafeInteger(Number(req.params.slug)) ? [{ id: Number(req.params.slug) }] : [])
        ],
        status: { [Op.in]: ['active', 'completed'] }
      },
      include: publicInclude()
    });
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.', code: 'CAMPAIGN_NOT_FOUND' });
    res.set('Cache-Control', 'public, max-age=15');
    res.json(await campaignDto(campaign, language));
  } catch (error) {
    next(error);
  }
});

router.get('/my-donations', authenticate, async (req, res, next) => {
  try {
    const donations = await Donation.findAll({
      where: { userId: req.user.id },
      include: [{ model: DonationCampaign, as: 'campaign', attributes: ['slug', 'translations'] }],
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.set('Cache-Control', 'private, no-store');
    res.json(donations.map((donation) => ({
      id: donation.id,
      amount: donation.amount,
      currency: donation.currency,
      unitsSponsored: donation.unitsSponsored,
      status: donation.status,
      source: donation.source,
      isRecurring: donation.isRecurring,
      createdAt: donation.createdAt,
      paidAt: donation.paidAt,
      campaign: donation.campaign ? {
        slug: donation.campaign.slug,
        title: localized(donation.campaign.translations, requestedLanguage(req.query.lang), 'title')
      } : null
    })));
  } catch (error) {
    next(error);
  }
});

router.get('/admin/money/donation-campaigns', ...admins, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.q) where.slug = { [Op.like]: `%${String(req.query.q).trim()}%` };
    const result = await DonationCampaign.findAndCountAll({
      where,
      include: publicInclude(),
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true
    });
    const language = requestedLanguage(req.query.lang);
    const items = await Promise.all(result.rows.map(async (campaign) => {
      const donations = await paidDonations(campaign.id);
      const state = campaignState(campaign, donations);
      return {
        ...campaign.toJSON(),
        ...state,
        totalCost: fromCents(totalCost(campaign)),
        unitName: campaign.unitName?.[language] || campaign.unitName?.ar || '',
        title: localized(campaign.translations, language, 'title'),
        description: localized(campaign.translations, language, 'description')
      };
    }));
    res.json({ items, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donation-campaigns', ...admins, validateBody(schemas.donationCampaignSchema), async (req, res, next) => {
  try {
    const values = applyTotalCost(campaignValues(req.body, { creating: true }));
    values.slug = await uniqueCampaignSlug(req.body);
    values.createdBy = req.user.id;
    if (values.status === 'active' && !values.startsAt) values.startsAt = new Date();
    if (values.startsAt) values.startsAt = new Date(values.startsAt);
    if (values.endsAt) values.endsAt = new Date(values.endsAt);
    const campaign = await DonationCampaign.create(values);
    await recordAudit(req, 'CREATE_DONATION_CAMPAIGN', 'DonationCampaign', campaign.id);
    res.status(201).json(campaign);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/money/donation-campaigns/:id', ...admins, validateBody(schemas.donationCampaignSchema.partial()), async (req, res, next) => {
  try {
    const campaign = await DonationCampaign.findByPk(Number(req.params.id));
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });
    const values = applyTotalCost(campaignValues(req.body), campaign);
    if (values.startsAt) values.startsAt = new Date(values.startsAt);
    if (values.endsAt) values.endsAt = new Date(values.endsAt);
    await campaign.update(values);
    await recomputeCampaignProgress(campaign.id);
    await recordAudit(req, 'UPDATE_DONATION_CAMPAIGN', 'DonationCampaign', campaign.id);
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donation-campaigns/:id/recompute', ...admins, async (req, res, next) => {
  try {
    const result = await recomputeCampaignProgress(Number(req.params.id));
    if (!result) return res.status(404).json({ message: 'Campaign not found.' });
    await recordAudit(req, 'RECOMPUTE_DONATION_CAMPAIGN', 'DonationCampaign', Number(req.params.id));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donation-campaigns/:id/duplicate', ...admins, async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const source = await DonationCampaign.findByPk(Number(req.params.id), {
      include: [{ model: DonationTier, as: 'tiers' }, { model: CampaignItem, as: 'items' }, { model: DistributionPlace, as: 'places' }],
      transaction
    });
    if (!source) throw apiError(404, 'Campaign not found.');
    const copy = await DonationCampaign.create({
      ...campaignValues(source.toJSON(), { creating: true }),
      slug: `${source.slug}-copie-${Date.now().toString(36)}`,
      status: 'draft',
      startsAt: null,
      endsAt: null,
      createdBy: req.user.id
    }, { transaction });
    for (const tier of source.tiers || []) {
      await DonationTier.create({
        campaignId: copy.id,
        amount: tier.amount,
        units: tier.units,
        label: tier.label,
        sortOrder: tier.sortOrder,
        isActive: tier.isActive
      }, { transaction });
    }
    for (const item of source.items || []) {
      await CampaignItem.create({
        campaignId: copy.id,
        bookId: item.bookId,
        label: item.label,
        quantityTarget: item.quantityTarget,
        unitCost: item.unitCost,
        quantityDistributed: 0
      }, { transaction });
    }
    for (const place of source.places || []) {
      await DistributionPlace.create({
        campaignId: copy.id,
        name: place.name,
        type: place.type,
        city: place.city,
        country: place.country,
        plannedQuantity: place.plannedQuantity,
        status: 'planned',
        notes: place.notes,
        consentConfirmed: place.consentConfirmed,
        isPublic: false
      }, { transaction });
    }
    await transaction.commit();
    await recordAudit(req, 'DUPLICATE_DONATION_CAMPAIGN', 'DonationCampaign', copy.id, { sourceId: source.id });
    res.status(201).json(copy);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.get('/admin/money/donation-campaigns/:id/full', ...admins, async (req, res, next) => {
  try {
    const campaign = await DonationCampaign.findByPk(Number(req.params.id), {
      include: [
        ...publicInclude(),
        { model: DonationTier, as: 'tiers', separate: true, order: [['sortOrder', 'ASC']] },
        { model: CampaignItem, as: 'items', separate: true, include: [{ model: Book, as: 'book', attributes: ['id', 'slug', 'title'] }] },
        { model: DistributionPlace, as: 'places', separate: true, order: [['id', 'ASC']] },
        { model: CampaignUpdate, as: 'updates', separate: true, order: [['createdAt', 'DESC']] }
      ]
    });
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donation-campaigns/:id/tiers', ...admins, validateBody(schemas.donationTierSchema), async (req, res, next) => {
  try {
    const tier = await DonationTier.create({ ...req.body, campaignId: Number(req.params.id) });
    await recordAudit(req, 'CREATE_DONATION_TIER', 'DonationTier', tier.id);
    res.status(201).json(tier);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/money/donation-campaigns/:id/tiers/:tierId', ...admins, validateBody(schemas.donationTierSchema.partial()), async (req, res, next) => {
  try {
    const tier = await DonationTier.findOne({ where: { id: Number(req.params.tierId), campaignId: Number(req.params.id) } });
    if (!tier) return res.status(404).json({ message: 'Donation tier not found.' });
    await tier.update(req.body);
    res.json(tier);
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/money/donation-campaigns/:id/tiers/:tierId', ...admins, async (req, res, next) => {
  try {
    const count = await DonationTier.destroy({ where: { id: Number(req.params.tierId), campaignId: Number(req.params.id) } });
    if (!count) return res.status(404).json({ message: 'Donation tier not found.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donation-campaigns/:id/items', ...admins, validateBody(schemas.campaignItemSchema), async (req, res, next) => {
  try {
    const item = await CampaignItem.create({ ...req.body, campaignId: Number(req.params.id) });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/money/donation-campaigns/:id/items/:itemId', ...admins, validateBody(schemas.campaignItemSchema.partial()), async (req, res, next) => {
  try {
    const item = await CampaignItem.findOne({ where: { id: Number(req.params.itemId), campaignId: Number(req.params.id) } });
    if (!item) return res.status(404).json({ message: 'Campaign item not found.' });
    await item.update(req.body);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donation-campaigns/:id/places', ...admins, validateBody(schemas.distributionPlaceSchema), async (req, res, next) => {
  try {
    const campaign = await DonationCampaign.findByPk(Number(req.params.id));
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });
    const requested = Number(req.body.plannedQuantity) || 0;
    if (campaign.targetUnits) {
      const current = await DistributionPlace.sum('plannedQuantity', { where: { campaignId: campaign.id } }) || 0;
      if (current + requested > Number(campaign.targetUnits)) {
        return res.status(422).json({ message: 'The planned quantities exceed the campaign target.', code: 'PLACES_EXCEED_TARGET' });
      }
    }
    const place = await DistributionPlace.create({
      ...req.body,
      campaignId: campaign.id,
      distributionDate: req.body.distributionDate ? new Date(req.body.distributionDate) : null
    });
    await recordAudit(req, 'CREATE_DISTRIBUTION_PLACE', 'DistributionPlace', place.id);
    res.status(201).json(place);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/money/donation-campaigns/:id/places/:placeId', ...admins, validateBody(schemas.distributionPlaceSchema.partial()), async (req, res, next) => {
  try {
    const place = await DistributionPlace.findOne({ where: { id: Number(req.params.placeId), campaignId: Number(req.params.id) } });
    if (!place) return res.status(404).json({ message: 'Distribution place not found.' });
    const values = { ...req.body };
    if (values.distributionDate) values.distributionDate = new Date(values.distributionDate);
    await place.update(values);
    res.json(place);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donation-campaigns/:id/updates', ...admins, validateBody(schemas.campaignUpdateSchema), async (req, res, next) => {
  try {
    const update = await CampaignUpdate.create({
      ...req.body,
      campaignId: Number(req.params.id),
      publishedAt: req.body.publishedAt ? new Date(req.body.publishedAt) : null
    });
    res.status(201).json(update);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/money/donations', ...admins, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.campaignId) where.campaignId = Number(req.query.campaignId);
    if (req.query.q) {
      where[Op.or] = [
        { displayName: { [Op.like]: `%${String(req.query.q).trim()}%` } },
        { stripeCheckoutSessionId: { [Op.like]: `%${String(req.query.q).trim()}%` } }
      ];
    }
    const result = await Donation.findAndCountAll({
      where,
      include: [
        { model: DonationCampaign, as: 'campaign', attributes: ['id', 'slug', 'translations'], required: false },
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'], required: false },
        { model: DonationTier, as: 'tier', attributes: ['id', 'amount', 'units'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donations/manual', ...admins, validateBody(schemas.manualDonationSchema), async (req, res, next) => {
  try {
    const campaign = req.body.campaignId ? await DonationCampaign.findByPk(req.body.campaignId) : null;
    if (req.body.campaignId && !campaign) return res.status(404).json({ message: 'Campaign not found.' });
    if (req.body.userId) {
      const user = await User.findByPk(req.body.userId);
      if (!user) return res.status(404).json({ message: 'Reader not found.' });
    }
    const currency = String(req.body.currency || campaign?.currency || 'EUR').toUpperCase();
    if (campaign && currency !== String(campaign.currency).toUpperCase()) {
      return res.status(422).json({ message: 'The donation currency must match the campaign.', code: 'DONATION_CURRENCY_MISMATCH' });
    }
    const amountMinor = toCents(req.body.amount);
    const unitCostMinor = campaign?.costPerUnit ? toCents(campaign.costPerUnit) : 0;
    const donation = await Donation.create({
      campaignId: campaign?.id || null,
      userId: req.body.userId || null,
      amount: req.body.amount.toFixed(2),
      currency,
      unitsSponsored: unitCostMinor > 0 ? Math.floor(amountMinor / unitCostMinor) : 0,
      isRecurring: false,
      isAnonymous: req.body.isAnonymous === true,
      displayName: req.body.isAnonymous ? null : req.body.displayName || null,
      message: req.body.message || null,
      source: req.body.source,
      status: 'paid',
      paidAt: new Date()
    });
    if (campaign) await recomputeCampaignProgress(campaign.id);
    await recordAudit(req, 'RECORD_MANUAL_DONATION', 'Donation', donation.id, { source: req.body.source, campaignId: campaign?.id || null });
    res.status(201).json(donation);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donations/:id/refund', ...admins, async (req, res, next) => {
  try {
    const donation = await Donation.findByPk(Number(req.params.id));
    if (!donation) return res.status(404).json({ message: 'Donation not found.', code: 'DONATION_NOT_FOUND' });
    if (donation.status !== 'paid') {
      return res.status(409).json({ message: 'Only paid donations can be refunded.', code: 'DONATION_NOT_REFUNDABLE' });
    }
    if (donation.source === 'stripe') {
      if (!donation.stripePaymentIntentId) {
        return res.status(422).json({ message: 'This donation has no Stripe payment intent to refund.', code: 'DONATION_PAYMENT_MISSING' });
      }
      const stripe = createStripeClient();
      await stripe.refunds.create({ payment_intent: donation.stripePaymentIntentId }, { idempotencyKey: `donation-refund-${donation.id}` });
    }
    await donation.update({ status: 'refunded' });
    if (donation.campaignId) await recomputeCampaignProgress(donation.campaignId);
    await recordAudit(req, 'REFUND_DONATION', 'Donation', donation.id, { source: donation.source, campaignId: donation.campaignId });
    res.json({ id: donation.id, status: donation.status });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/money/donations/export.csv', ...admins, async (req, res, next) => {
  try {
    const donations = await Donation.findAll({
      include: [
        { model: DonationCampaign, as: 'campaign', attributes: ['slug'], required: false },
        { model: User, as: 'user', attributes: ['email'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10000
    });
    const cell = (value) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const lines = ['id,campaign,donor_email,amount,currency,units,status,source,created_at,paid_at'];
    for (const donation of donations) {
      lines.push([
        donation.id,
        donation.campaign?.slug || '',
        donation.user?.email || '',
        donation.amount,
        donation.currency,
        donation.unitsSponsored,
        donation.status,
        donation.source,
        donation.createdAt?.toISOString?.() || '',
        donation.paidAt?.toISOString?.() || ''
      ].map(cell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="donations.csv"');
    res.send(`\uFEFF${lines.join('\n')}`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
