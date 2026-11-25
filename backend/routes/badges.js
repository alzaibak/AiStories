const router = require('express').Router();
const { Op } = require('sequelize');
const {
  BadgeType,
  BadgeAward,
  BadgeSettings,
  Collection,
  Story,
  User
} = require('../models');
const { authenticate, allowRoles } = require('../middleware/authorization');
const engine = require('../utils/badges/engine');
const {
  CRITERIA_TYPES,
  TIERS,
  CATEGORIES,
  MAX_FEATURED_BADGES,
  DEFAULT_LEVELS,
  levelForPoints
} = require('../utils/badges/criteria');
const { recordAudit } = require('../utils/audit');
const { buildCertificatePdf } = require('../utils/certificatePdf');

const readers = [authenticate, allowRoles('READER')];
const admins = [authenticate, allowRoles('ADMIN', 'SUPER_ADMIN')];
const LANGUAGES = ['ar', 'en', 'fr'];

function parseId(value, label = 'Identifiant') {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    const error = new Error(`${label} invalide.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function badRequest(message, details) {
  const error = new Error(message);
  error.status = 400;
  if (details) error.details = details;
  return error;
}

function requestLanguage(req) {
  const requested = req.query.lang || req.body?.language || req.user?.language;
  return LANGUAGES.includes(requested) ? requested : 'ar';
}

function cleanText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeTranslations(input = {}) {
  const translations = {};
  for (const language of LANGUAGES) {
    const source = input[language] || {};
    translations[language] = {
      name: cleanText(source.name, 120),
      description: cleanText(source.description, 600),
      howToEarn: cleanText(source.howToEarn, 600)
    };
  }
  return translations;
}

function slugifyCode(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function normalizeCriteria(input = {}) {
  const type = CRITERIA_TYPES.includes(input.type) ? input.type : 'manual';
  const criteria = { type };
  if (['stories_completed', 'parts_read', 'streak_days', 'quizzes_completed', 'perfect_quiz_scores', 'weekly_challenge_rank'].includes(type)) {
    const threshold = Number(input.threshold);
    criteria.threshold = Number.isFinite(threshold) ? Math.max(1, Math.min(1000000, Math.round(threshold))) : 1;
  }
  if (type === 'collection_completed' && input.collectionId) {
    criteria.collectionId = parseId(input.collectionId, 'Collection');
  }
  if (type === 'event_participation') {
    criteria.eventTag = cleanText(input.eventTag, 120) || null;
  }
  return criteria;
}

function badgePayload(body, { partial = false, current = null } = {}) {
  const translations = normalizeTranslations(body.translations || (
    current ? current.translations : {}
  ));
  if (!partial && !translations.ar.name) throw badRequest('Le nom arabe est obligatoire.', { translations: 'ar.name' });
  const code = slugifyCode(body.code || (partial ? current?.code : '') || translations.en.name || translations.ar.name);
  if (!partial && code.length < 2) throw badRequest('Le code du badge est obligatoire.', { code: true });
  const iconType = body.iconType === 'upload' ? 'upload' : 'library';
  const imageUrl = cleanText(body.imageUrl, 400000) || null;
  if (iconType === 'upload' && !imageUrl) throw badRequest('Une image est requise pour un badge téléversé.', { imageUrl: true });
  if (imageUrl && !/^(https?:\/\/|\/|data:image\/(png|svg\+xml|jpeg|webp);base64,)/.test(imageUrl)) {
    throw badRequest('L’URL de l’image est invalide.', { imageUrl: true });
  }
  const tier = TIERS.includes(body.tier) ? body.tier : 'bronze';
  const category = CATEGORIES.includes(body.category) ? body.category : 'reading';
  const points = Number(body.points);
  const colorTheme = {
    preset: cleanText(body.colorTheme?.preset, 40) || 'emerald',
    from: cleanText(body.colorTheme?.from, 20) || '',
    to: cleanText(body.colorTheme?.to, 20) || ''
  };
  return {
    code,
    name: translations.ar.name || translations.en.name,
    description: translations.ar.description || translations.en.description,
    translations,
    howToEarn: {
      ar: translations.ar.howToEarn,
      en: translations.en.howToEarn,
      fr: translations.fr.howToEarn
    },
    icon: cleanText(body.iconKey, 120) || (partial ? current?.icon : null),
    iconType,
    iconKey: cleanText(body.iconKey, 120) || (partial ? current?.iconKey : null),
    imageUrl,
    tier,
    category,
    colorTheme,
    criteria: body.criteria ? normalizeCriteria(body.criteria) : (partial ? current?.criteria : { type: 'manual' }),
    points: Number.isFinite(points) ? Math.max(0, Math.min(100000, Math.round(points))) : (partial ? current?.points ?? 0 : 0),
    isSecret: Boolean(body.isSecret),
    isActive: body.isActive === undefined ? (partial ? current?.isActive ?? true : true) : Boolean(body.isActive),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.round(Number(body.sortOrder)) : (partial ? current?.sortOrder ?? 0 : 0),
    eventTag: cleanText(body.eventTag, 120) || null
  };
}

/* ------------------------------------------------------------------ */
/* Reader API                                                          */
/* ------------------------------------------------------------------ */

router.get('/me/badges', ...readers, async (req, res, next) => {
  try {
    const payload = await engine.userBadgePayload(req.user.id, { language: requestLanguage(req) });
    res.set('Cache-Control', 'private, no-store');
    res.json({
      badges: payload.badges,
      level: payload.level,
      points: payload.totalPoints,
      earnedCount: payload.earnedCount,
      totalCount: payload.totalCount,
      featuredLimit: MAX_FEATURED_BADGES,
      categories: CATEGORIES,
      tiers: TIERS
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/me/badges/:id/feature', ...readers, async (req, res, next) => {
  try {
    const badgeId = parseId(req.params.id, 'Badge');
    const result = await engine.toggleFeatured(req.user.id, badgeId);
    res.set('Cache-Control', 'private, no-store');
    res.json({ ...result, featuredLimit: MAX_FEATURED_BADGES });
  } catch (error) {
    next(error);
  }
});

router.get('/me/profile-summary', ...readers, async (req, res, next) => {
  try {
    const summary = await engine.profileSummary(req.user.id, { language: requestLanguage(req) });
    res.set('Cache-Control', 'private, no-store');
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/me/notifications', ...readers, async (req, res, next) => {
  try {
    const notifications = await require('../models').Notification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    res.set('Cache-Control', 'private, no-store');
    res.json({ notifications });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* Admin API                                                           */
/* ------------------------------------------------------------------ */

router.get('/admin/community/badges', ...admins, async (req, res, next) => {
  try {
    const language = requestLanguage(req);
    const badges = await BadgeType.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] });
    const counts = await BadgeAward.findAll({
      attributes: ['badgeTypeId', [BadgeAward.sequelize.fn('COUNT', BadgeAward.sequelize.col('id')), 'total']],
      group: ['badgeTypeId'],
      raw: true
    });
    const countByBadge = new Map(counts.map((row) => [row.badgeTypeId, Number(row.total)]));
    const { levels } = await engine.getBadgeSettings();
    res.json({
      badges: badges.map((badge) => ({
        ...engine.serializeBadge(badge, { language, isAdmin: true, earnedCount: countByBadge.get(badge.id) || 0 }),
        translations: badge.translations,
        howToEarnTranslations: badge.howToEarn
      })),
      levels,
      filters: { tiers: TIERS, categories: CATEGORIES, criteriaTypes: CRITERIA_TYPES },
      totalAwards: [...countByBadge.values()].reduce((total, value) => total + value, 0)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/community/badges', ...admins, async (req, res, next) => {
  try {
    const payload = badgePayload(req.body);
    const existing = await BadgeType.findOne({ where: { code: payload.code } });
    if (existing) throw badRequest('Ce code est déjà utilisé.', { code: true });
    const badge = await BadgeType.create(payload);
    await recordAudit(req, 'CREATE_BADGE', 'BadgeType', badge.id, { code: badge.code });
    res.status(201).json(engine.serializeBadge(badge, { language: requestLanguage(req), isAdmin: true }));
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/community/badges/:id', ...admins, async (req, res, next) => {
  try {
    const badge = await BadgeType.findByPk(parseId(req.params.id, 'Badge'));
    if (!badge) {
      const error = new Error('Badge introuvable.');
      error.status = 404;
      throw error;
    }
    if (req.body.code) {
      const code = slugifyCode(req.body.code);
      const clash = await BadgeType.findOne({ where: { code, id: { [Op.ne]: badge.id } } });
      if (clash) throw badRequest('Ce code est déjà utilisé.', { code: true });
    }
    const payload = badgePayload(req.body, { partial: true, current: badge });
    await badge.update(payload);
    await recordAudit(req, 'UPDATE_BADGE', 'BadgeType', badge.id, { code: badge.code });
    res.json(engine.serializeBadge(badge, { language: requestLanguage(req), isAdmin: true }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/community/badges/:id/duplicate', ...admins, async (req, res, next) => {
  try {
    const badge = await BadgeType.findByPk(parseId(req.params.id, 'Badge'));
    if (!badge) {
      const error = new Error('Badge introuvable.');
      error.status = 404;
      throw error;
    }
    let code = `${badge.code}-copie`;
    let index = 2;
    while (await BadgeType.findOne({ where: { code } })) {
      code = `${badge.code}-copie-${index}`;
      index += 1;
    }
    const duplicate = await BadgeType.create({
      code,
      name: badge.name,
      description: badge.description,
      translations: badge.translations,
      howToEarn: badge.howToEarn,
      icon: badge.icon,
      iconType: badge.iconType,
      iconKey: badge.iconKey,
      imageUrl: badge.imageUrl,
      tier: badge.tier,
      category: badge.category,
      colorTheme: badge.colorTheme,
      criteria: badge.criteria,
      points: badge.points,
      isSecret: badge.isSecret,
      isActive: false,
      sortOrder: (badge.sortOrder || 0) + 1,
      eventTag: badge.eventTag
    });
    await recordAudit(req, 'DUPLICATE_BADGE', 'BadgeType', duplicate.id, { sourceId: badge.id });
    res.status(201).json(engine.serializeBadge(duplicate, { language: requestLanguage(req), isAdmin: true }));
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/community/badges/:id', ...admins, async (req, res, next) => {
  try {
    const badge = await BadgeType.findByPk(parseId(req.params.id, 'Badge'));
    if (!badge) {
      const error = new Error('Badge introuvable.');
      error.status = 404;
      throw error;
    }
    const earned = await BadgeAward.count({ where: { badgeTypeId: badge.id } });
    const force = req.query.force === 'true';
    if (earned > 0 && !force) {
      const error = new Error(`${earned} lecteur(s) ont déjà ce badge. Confirmez la suppression.`);
      error.status = 409;
      error.code = 'BADGE_IN_USE';
      error.earnedCount = earned;
      throw error;
    }
    if (earned > 0) await BadgeAward.destroy({ where: { badgeTypeId: badge.id } });
    await badge.destroy();
    await recordAudit(req, 'DELETE_BADGE', 'BadgeType', badge.id, { code: badge.code, earned });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/admin/community/badges/:id/award', ...admins, async (req, res, next) => {
  try {
    const badgeId = parseId(req.params.id, 'Badge');
    const reason = cleanText(req.body.reason, 500);
    if (!reason) throw badRequest('Une raison est obligatoire pour une attribution manuelle.', { reason: true });
    let userId = req.body.userId ? parseId(req.body.userId, 'Utilisateur') : null;
    if (!userId && req.body.email) {
      const user = await User.findOne({ where: { email: String(req.body.email).trim().toLowerCase() } });
      if (!user) throw badRequest('Aucun lecteur ne correspond à cet email.', { email: true });
      userId = user.id;
    }
    if (!userId) throw badRequest('Lecteur requis.', { userId: true });
    const result = await engine.awardManual({ userId, badgeId, adminId: req.user.id, reason });
    await recordAudit(req, 'AWARD_BADGE', 'BadgeType', badgeId, { userId, reason, created: result.created });
    res.status(result.created ? 201 : 200).json({ created: result.created, award: result.award });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/community/badges/:id/award/:userId', ...admins, async (req, res, next) => {
  try {
    const badgeId = parseId(req.params.id, 'Badge');
    const userId = parseId(req.params.userId, 'Utilisateur');
    const reason = cleanText(req.body?.reason || req.query.reason, 500);
    if (!reason) throw badRequest('Une raison est obligatoire pour un retrait.', { reason: true });
    await engine.revokeAward({ userId, badgeId, adminId: req.user.id, reason });
    await recordAudit(req, 'REVOKE_BADGE', 'BadgeType', badgeId, { userId, reason });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.put('/admin/community/badges/settings', ...admins, async (req, res, next) => {
  try {
    const levels = Array.isArray(req.body.levels) ? req.body.levels : null;
    if (!levels || !levels.length) throw badRequest('Au moins un niveau est requis.', { levels: true });
    const normalized = levels
      .map((entry, index) => ({
        level: Number(entry.level) || index + 1,
        points: Math.max(0, Number(entry.points) || 0),
        names: {
          ar: cleanText(entry.names?.ar, 80),
          en: cleanText(entry.names?.en, 80),
          fr: cleanText(entry.names?.fr, 80)
        }
      }))
      .sort((a, b) => a.points - b.points);
    for (let index = 1; index < normalized.length; index += 1) {
      if (normalized[index].points <= normalized[index - 1].points) {
        throw badRequest('Les paliers doivent être strictement croissants.', { levels: true });
      }
    }
    const { settings } = await engine.getBadgeSettings();
    await settings.update({ levels: normalized, updatedBy: req.user.id });
    await recordAudit(req, 'UPDATE_BADGE_LEVELS', 'BadgeSettings', settings.id);
    res.json({ levels: normalized, preview: levelForPoints(0, normalized) });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/community/certificates', ...admins, async (req, res, next) => {
  try {
    const { settings } = await engine.getBadgeSettings();
    const collections = await Collection.findAll({ order: [['title', 'ASC']] });
    const counts = await Story.findAll({
      attributes: ['collectionId', [Story.sequelize.fn('COUNT', Story.sequelize.col('id')), 'total']],
      where: { collectionId: { [Op.ne]: null } },
      group: ['collectionId'],
      raw: true
    });
    const countByCollection = new Map(counts.map((row) => [row.collectionId, Number(row.total)]));
    const certificateSettings = settings.certificateSettings || {};
    res.json({
      enabled: certificateSettings.enabled !== false,
      collections: collections.map((collection) => {
        const config = (certificateSettings.collections || {})[String(collection.id)] || {};
        return {
          id: collection.id,
          title: collection.title,
          slug: collection.slug,
          storiesCount: countByCollection.get(collection.id) || 0,
          enabled: config.enabled !== false,
          certificateTitle: config.title || collection.title
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/community/certificates/sample.pdf', ...admins, (req, res) => {
  const language = requestLanguage(req);
  const pdf = buildCertificatePdf({
    name: language === 'ar' ? 'اسم القارئ' : language === 'en' ? 'Reader name' : 'Nom du lecteur',
    title: language === 'ar' ? 'شهادة إتمام مجموعة' : language === 'en' ? 'Collection completion certificate' : 'Certificat de collection',
    date: new Date().toISOString().slice(0, 10),
    code: 'CERT-SAMPLE-0001'
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="certificate-sample.pdf"');
  res.send(pdf);
});

router.put('/admin/community/certificates', ...admins, async (req, res, next) => {
  try {
    const { settings } = await engine.getBadgeSettings();
    const collections = {};
    for (const [key, value] of Object.entries(req.body.collections || {})) {
      collections[key] = {
        enabled: value.enabled !== false,
        title: cleanText(value.title, 160)
      };
    }
    await settings.update({
      certificateSettings: { enabled: req.body.enabled !== false, collections },
      updatedBy: req.user.id
    });
    await recordAudit(req, 'UPDATE_CERTIFICATE_SETTINGS', 'BadgeSettings', settings.id);
    res.json({ enabled: req.body.enabled !== false, collections });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/community/badges/recompute', ...admins, async (req, res, next) => {
  try {
    const userId = req.body.userId ? parseId(req.body.userId, 'Utilisateur') : null;
    if (userId) {
      const result = await engine.evaluateUserBadges(userId, { trigger: 'admin_recompute' });
      await recordAudit(req, 'RECOMPUTE_BADGES', 'User', userId, { awarded: result.newAwards.length });
      return res.json(result);
    }
    const users = await User.findAll({ where: { role: 'READER' }, attributes: ['id'], limit: 500 });
    let awarded = 0;
    for (const user of users) {
      const result = await engine.evaluateUserBadges(user.id, { trigger: 'admin_recompute' });
      awarded += result.newAwards.length;
    }
    await recordAudit(req, 'RECOMPUTE_BADGES', 'User', null, { awarded, users: users.length });
    res.json({ users: users.length, awarded });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.DEFAULT_LEVELS = DEFAULT_LEVELS;
