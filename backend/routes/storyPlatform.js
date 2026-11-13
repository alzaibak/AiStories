const crypto = require('node:crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const {
  Collection,
  Story,
  StoryPart,
  StoryVideo,
  Quiz,
  Question,
  QuizOption,
  QuizAttempt,
  ReadingProgress,
  Book,
  SlugRedirect,
  MediaAsset,
  StyleGuide,
  Subscription,
  Plan,
  Entitlement,
  StoreOrderItem,
  ReviewerNote,
  User,
  BadgeType,
  BadgeAward,
  Certificate,
  StoryReview,
  StoryRequest,
  CommunityEvent,
  EventEntry,
  Team,
  TeamMember,
  DonationCampaign,
  Donation,
  EmailTemplate,
  ScheduledReminder,
  PolicyPage
} = require('../models');
const { authenticate, optionalAuthenticate, allowRoles } = require('../middleware/authorization');
const { validateBody } = require('../middleware/validation');
const schemas = require('../middleware/storyValidation');
const { canAccessPart, canAccessBook, subscriptionIsActive } = require('../utils/contentAccess');
const {
  getMaxDocumentBytes,
  getStorageDriver,
  ensureLocalStorageDirectories,
  getLocalUploadDirectory,
  storeLocalUploadFile,
  localStoragePath,
  mediaUploadMatches,
  isLocalStorageKey,
  createDownloadUrl,
  createMediaUrl,
  createMediaUploadKey,
  createMediaKey,
  createMediaUploadForm,
  getDocumentMetadata,
  promoteUploadedMedia,
  deleteDocumentObject
} = require('../utils/documentStorage');
const { SAMPLE_EBOOK_STORAGE_KEY, SAMPLE_EBOOK_PATH } = require('../utils/sampleEbook');
const { recordAudit } = require('../utils/audit');
const { requestedLanguage, localizeFields } = require('../utils/contentLocalization');
const { slugFromLocalized } = require('../utils/slug');
const { deliverEmail } = require('../utils/email');
const { processDueReminders } = require('../utils/reminders');
const {
  localizedQuizValue,
  localizedTextValue,
  localizedOptionValue,
  publicQuestion
} = require('../utils/quizPresentation');

const router = express.Router();
const contentEditors = [authenticate, allowRoles('ADMIN', 'SUPER_ADMIN', 'EDITOR')];
const reviewers = [authenticate, allowRoles('ADMIN', 'REVIEWER')];
const publishers = [authenticate, allowRoles('ADMIN', 'SUPER_ADMIN')];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const quizAttemptRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});
function uploadError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function uploadLocalMedia(req, res, next) {
  const fileUpload = multer({
    storage: multer.diskStorage({
      destination(_request, _file, callback) {
        ensureLocalStorageDirectories()
          .then(() => callback(null, getLocalUploadDirectory()))
          .catch(callback);
      },
      filename(_request, _file, callback) {
        callback(null, crypto.randomUUID());
      }
    }),
    limits: { fileSize: getMaxDocumentBytes(), files: 1 }
  }).single('file');
  fileUpload(req, res, next);
}

function partNumberConflict(part) {
  const error = uploadError(
    `Part ${part.partNumber} already exists for this story.`,
    409,
    'PART_NUMBER_CONFLICT'
  );
  error.partNumber = part.partNumber;
  error.fields = { partNumber: error.message };
  error.existingPart = { id: part.id, partNumber: part.partNumber };
  return error;
}

function isPartNumberUniqueError(error) {
  return error.name === 'SequelizeUniqueConstraintError' &&
    (error.errors || []).some((item) => item.path === 'partNumber' || item.path === 'storyId');
}

function parseId(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    const error = new Error(`${label} invalide.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function isPrivileged(user) {
  return ['ADMIN', 'SUPER_ADMIN', 'EDITOR', 'REVIEWER'].includes(user?.role);
}

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function generateVerificationCode() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`.toUpperCase();
}

function escapePdfText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildCertificatePdf({ name, title, date, code }) {
  const lines = [
    'Récits Islamiques',
    'Certificate of Completion',
    `Awarded to: ${name}`,
    `For: ${title}`,
    `Date: ${date}`,
    `Verification code: ${code}`
  ];
  const stream = lines.map((line, index) => {
    const y = 760 - (index * 36);
    return `BT /F1 18 Tf 72 ${y} Td (${escapePdfText(line)}) Tj ET`;
  }).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function ensureBadgeAward(userId, badgeCode, sourceType, sourceId, metadata = {}) {
  let badgeType = await BadgeType.findOne({ where: { code: badgeCode, isActive: true } });
  if (!badgeType) {
    badgeType = await BadgeType.create({
      code: badgeCode,
      name: badgeCode.replace(/[-_]+/g, ' '),
      description: 'Awarded automatically by the platform.',
      translations: { ar: badgeCode, en: badgeCode, fr: badgeCode },
      icon: 'award',
      criteria: { type: sourceType },
      isActive: true
    });
  }
  const existing = await BadgeAward.findOne({ where: { userId, badgeTypeId: badgeType.id, sourceType, sourceId } });
  if (existing) return existing;
  return BadgeAward.create({ userId, badgeTypeId: badgeType.id, sourceType, sourceId, metadata });
}

async function maybeIssueCertificate({ userId, badgeTypeId, title, storyId = null, quizId = null }) {
  const user = await User.findByPk(userId, { attributes: ['id', 'firstName', 'lastName', 'email'] });
  if (!user) return null;
  const existing = await Certificate.findOne({ where: { userId, ...(storyId ? { storyId } : {}), ...(quizId ? { quizId } : {}) } });
  if (existing) return existing;
  const code = generateVerificationCode();
  const certificate = await Certificate.create({
    userId,
    badgeTypeId,
    title,
    storyId,
    quizId,
    verificationCode: code,
    issuedAt: new Date()
  });
  const pdf = buildCertificatePdf({
    name: `${user.firstName} ${user.lastName}`.trim() || user.email,
    title,
    date: new Date().toISOString().slice(0, 10),
    code
  });
  certificate.pdfPath = `certificates/${certificate.id}.pdf`;
  await certificate.save();
  return { certificate, pdf };
}

function contentSlug(requestedSlug, title, translations) {
  const slug = requestedSlug || slugFromLocalized(title, translations);
  if (!slug || slug.length < 2 || !slugPattern.test(slug)) {
    throw httpError('Un titre anglais ou arabe pouvant être converti en URL est requis pour créer le slug.', 400, 'INVALID_SLUG');
  }
  return slug;
}

async function assertUniqueSlug(Model, slug, id) {
  for (const Candidate of [Collection, Story, Book]) {
    const existing = await Candidate.findOne({ where: { slug } });
    if (existing && !(Candidate === Model && existing.id === id)) {
      throw httpError('Ce slug est déjà utilisé. Choisissez un autre lien public.', 409, 'SLUG_CONFLICT');
    }
  }
}

async function assertUniqueQuizSlug(slug, id) {
  for (const Candidate of [Collection, Story, Book, Quiz]) {
    const existing = await Candidate.findOne({ where: { slug } });
    if (existing && !(Candidate === Quiz && existing.id === id)) {
      throw httpError('Ce slug est déjà utilisé. Choisissez un autre lien public.', 409, 'SLUG_CONFLICT');
    }
  }
}

function quizSubmissionRequirements(quiz, questions) {
  const missing = [];
  if (!quiz.translations?.ar?.title?.trim()) missing.push('Arabic quiz title');
  if (!quiz.slug || quiz.slug.length < 2 || !slugPattern.test(quiz.slug)) missing.push('valid slug');
  if (!questions.length) missing.push('at least one question');
  questions.forEach((question, index) => {
    const prefix = `question ${index + 1}`;
    if (!question.translations?.ar?.text?.trim()) missing.push(`${prefix}: Arabic text`);
    const options = question.answerOptions || [];
    if (options.length < 2) missing.push(`${prefix}: at least two options`);
    if (options.some((option) => !option.translations?.ar?.trim())) missing.push(`${prefix}: Arabic option text`);
    if (!options.some((option) => option.isCorrect)) missing.push(`${prefix}: at least one correct answer`);
    if (question.type === 'single_choice' && options.filter((option) => option.isCorrect).length !== 1) {
      missing.push(`${prefix}: exactly one correct answer`);
    }
  });
  return missing;
}

function questionRecordValues(question, quizId, sortOrder) {
  const translations = question.translations || { ar: { text: question.text } };
  const answerOptions = question.answerOptions || (question.options || []).map((text, index) => ({
    text,
    translations: { ar: text, en: '', fr: '' },
    isCorrect: text === question.correctAnswer,
    sortOrder: index
  }));
  const correctOption = answerOptions.find((option) => option.isCorrect);
  return {
    question: {
      quizId,
      type: question.type || 'single_choice',
      text: translations.ar?.text || question.text,
      translations,
      options: answerOptions.map((option) => option.translations?.ar || option.text),
      correctAnswer: correctOption?.translations?.ar || correctOption?.text || question.correctAnswer || '',
      points: question.points || 1,
      explanation: question.explanationTranslations?.ar || question.explanation || '',
      explanationTranslations: question.explanationTranslations || {},
      source: question.sourceTranslations?.ar || question.source || '',
      sourceTranslations: question.sourceTranslations || {},
      sortOrder: question.sortOrder ?? sortOrder
    },
    answerOptions
  };
}

async function saveQuizQuestions(quizId, questions, transaction) {
  const existingQuestions = await Question.findAll({
    where: { quizId },
    include: [{ model: QuizOption, as: 'answerOptions' }],
    transaction
  });
  const questionsById = new Map(existingQuestions.map((question) => [question.id, question]));
  const retainedQuestionIds = new Set();
  for (const [index, item] of questions.entries()) {
    const { question: values, answerOptions } = questionRecordValues(item, quizId, index);
    let question = item.id ? questionsById.get(item.id) : null;
    if (item.id && !question) throw httpError('Une question ne correspond pas à ce quiz.', 400, 'INVALID_QUIZ_QUESTION');
    if (question) {
      await question.update(values, { transaction });
    } else {
      question = await Question.create(values, { transaction });
    }
    retainedQuestionIds.add(question.id);
    const existingOptions = question.answerOptions || [];
    const optionsById = new Map(existingOptions.map((option) => [option.id, option]));
    const retainedOptionIds = new Set(answerOptions.filter((option) => option.id).map((option) => option.id));
    await QuizOption.destroy({
      where: {
        questionId: question.id,
        ...(retainedOptionIds.size ? { id: { [Op.notIn]: [...retainedOptionIds] } } : {})
      },
      transaction
    });
    for (const [optionIndex, option] of answerOptions.entries()) {
      if (option.id) await optionsById.get(option.id).update({ sortOrder: -(optionIndex + 1) }, { transaction });
    }
    for (const [optionIndex, option] of answerOptions.entries()) {
      const optionValues = {
        questionId: question.id,
        text: option.translations?.ar || option.text,
        translations: option.translations || { ar: option.text },
        isCorrect: Boolean(option.isCorrect),
        sortOrder: option.sortOrder ?? optionIndex
      };
      let existingOption = option.id ? optionsById.get(option.id) : null;
      if (option.id && !existingOption) {
        throw httpError('Une option ne correspond pas à cette question.', 400, 'INVALID_QUIZ_OPTION');
      }
      if (existingOption) await existingOption.update(optionValues, { transaction });
      else await QuizOption.create(optionValues, { transaction });
    }
  }
  await Question.destroy({
    where: {
      quizId,
      ...(retainedQuestionIds.size ? { id: { [Op.notIn]: [...retainedQuestionIds] } } : {})
    },
    transaction
  });
}

function quizQuestionInclude() {
  return {
    model: Question,
    as: 'questions',
    include: [{ model: QuizOption, as: 'answerOptions', order: [['sortOrder', 'ASC']] }],
    order: [['sortOrder', 'ASC']]
  };
}

async function publicationRequirements(story) {
  const missing = [];
  if (!story.title?.trim()) missing.push('Arabic title');
  if (!story.summary?.trim()) missing.push('Arabic summary');
  if (!story.collectionId || !await Collection.findByPk(story.collectionId)) missing.push('collection');
  if (!story.slug || story.slug.length < 2 || !slugPattern.test(story.slug)) missing.push('valid unique slug');
  if (story.slug) {
    const conflictingContent = await Promise.all([Collection, Story, Book].map((Model) =>
      Model.findOne({ where: { slug: story.slug } })
    ));
    if (conflictingContent.some((item, index) => item && !(index === 1 && item.id === story.id))) {
      missing.push('unique slug');
    }
  }
  if (!Array.isArray(story.sourceReferences) || story.sourceReferences.length === 0) missing.push('sources/references');
  if (!story.reviewChecklist?.sourcesProvided) missing.push('source review checklist: sources provided');
  if (!story.reviewChecklist?.reviewedBy?.trim()) missing.push('source review checklist: reviewer');
  if (!story.reviewChecklist?.reviewedAt) missing.push('source review checklist: review date');
  if (!story.reviewChecklist?.representationConfirmed) missing.push('representation review checklist');
  const parts = await StoryPart.findAll({ where: { storyId: story.id }, order: [['partNumber', 'ASC']] });
  if (!parts.some((part) => part.title?.trim() && part.content?.trim())) {
    missing.push('at least one episode with Arabic text');
  }
  return missing;
}

async function publishStory(req, story) {
  if (!story || story.status !== 'in_review') {
    throw httpError('La story doit être en révision avant sa publication.', 409);
  }
  if (story.authorId === req.user.id) {
    throw httpError('Vous ne pouvez pas approuver ou publier votre propre contenu.', 403);
  }
  const missing = await publicationRequirements(story);
  if (missing.length) {
    const error = httpError(`Publication impossible. Éléments manquants : ${missing.join(', ')}.`, 409, 'PUBLISH_REQUIREMENTS');
    error.missing = missing;
    throw error;
  }
  const now = new Date();
  story.status = 'published';
  story.reviewedBy = req.user.id;
  story.reviewedAt = now;
  story.reviewerId = req.user.id;
  story.reviewerName = `${req.user.firstName} ${req.user.lastName}`.trim();
  story.approvedAt = now;
  story.publishedAt = story.publishedAt || now;
  story.rejectionReason = null;
  await story.save();
}

async function sendPublishedStoryBackToReview(req, story) {
  if (story?.status !== 'published') return;
  story.status = 'in_review';
  story.approvedAt = null;
  await story.save();
  await recordAudit(req, 'STORY_UNPUBLISHED_FOR_EDIT', 'Story', story.id);
}

async function canAccessMedia(media, user) {
  let accessible = isPrivileged(user);
  const storyVideo = media.mediaType === 'video'
    ? await StoryVideo.findOne({ where: { mediaAssetId: media.id, status: 'published' } })
    : null;
  if (!accessible && media.bookId) {
    const book = await Book.findByPk(media.bookId);
    accessible = Boolean(book && await canAccessBook({ userId: user?.id, role: user?.role, book }));
  } else if (!accessible && (media.storyId || media.partId)) {
    const part = media.partId ? await StoryPart.findByPk(media.partId) : null;
    const storyId = media.storyId || part?.storyId;
    const story = storyId ? await Story.findByPk(storyId, {
      include: [{ model: Collection, as: 'collection' }]
    }) : null;
    const accessPart = part
      ? (part.storyId === story?.id ? part : null)
      : story && await StoryPart.findOne({ where: { storyId: story.id }, order: [['partNumber', 'ASC']] });
    accessible = Boolean(story && accessPart && story.status === 'published' && await canAccessPart({
      userId: user?.id,
      role: user?.role,
      story,
      part: storyVideo?.isFree ? { ...accessPart.toJSON(), isFree: true } : accessPart
    }));
  }
  return accessible;
}

async function findPublishedStory(slug) {
  const include = [
    { model: Collection, as: 'collection' },
    { model: StoryPart, as: 'parts', order: [['partNumber', 'ASC']] },
    { model: StoryVideo, as: 'videos', include: [{ model: MediaAsset, as: 'mediaAsset', required: false }] },
    { model: User, as: 'reviewer', attributes: ['firstName', 'lastName'], required: false }
  ];
  const story = await Story.findOne({ where: { slug, status: 'published' }, include });
  if (story) return story;
  const redirect = await SlugRedirect.findOne({ where: { entityType: 'story', oldSlug: slug } });
  if (!redirect) return null;
  return Story.findOne({ where: { slug: redirect.newSlug, status: 'published' }, include });
}

async function findAccessiblePart(story, partNumber, user) {
  const part = story.parts.find((candidate) => candidate.partNumber === partNumber);
  if (!part) throw notFound('Partie introuvable.');
  if (!await canAccessPart({
    userId: user?.id,
    role: user?.role,
    story,
    part
  })) {
    const error = new Error('Un abonnement actif ou un droit d’accès est requis pour cette partie.');
    error.status = 403;
    error.code = 'CONTENT_LOCKED';
    throw error;
  }
  return part;
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

async function loadPublishedQuiz(quizId) {
  const quiz = await Quiz.findOne({
    where: { id: quizId, status: 'published' },
    include: [
      {
        model: Story,
        as: 'story',
        where: { status: 'published' },
        include: [{ model: Collection, as: 'collection' }, { model: StoryPart, as: 'parts' }]
      },
      { model: StoryPart, as: 'part' },
      {
        model: Question,
        as: 'questions',
        include: [{ model: QuizOption, as: 'answerOptions', order: [['sortOrder', 'ASC']] }],
        order: [['sortOrder', 'ASC']]
      }
    ]
  });
  if (!quiz) throw notFound('Quiz publié introuvable.');
  return quiz;
}

async function checkQuizAccess(quiz, user) {
  const storyParts = [...quiz.story.parts].sort((left, right) => left.partNumber - right.partNumber);
  const part = quiz.part || (quiz.partId ? null : storyParts[storyParts.length - 1]);
  if (!part) {
    const error = new Error('Partie du quiz introuvable.');
    error.status = 404;
    throw error;
  }
  if (quiz.accessMode === 'free') {
    if (part.releaseAt && new Date(part.releaseAt) > new Date()) {
      const error = new Error('Ce quiz n’est pas encore disponible.');
      error.status = 403;
      error.code = 'CONTENT_LOCKED';
      throw error;
    }
    return;
  }
  const story = quiz.accessMode === 'premium'
    ? { ...quiz.story.toJSON(), isFree: false, collection: { ...quiz.story.collection?.toJSON(), isFree: false } }
    : quiz.story;
  const accessPart = quiz.accessMode === 'premium' ? { ...part.toJSON(), isFree: false } : part;
  if (!part || !await canAccessPart({ userId: user?.id, role: user?.role, story, part: accessPart })) {
    const error = new Error('Un abonnement actif ou un droit d’accès est requis pour ce quiz.');
    error.status = 403;
    error.code = 'CONTENT_LOCKED';
    throw error;
  }
}
router.get('/collections', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const collections = await Collection.findAll({
      where: { isActive: true },
      include: [{
        model: Story,
        as: 'stories',
        attributes: ['id', 'title', 'slug', 'summary', 'cover', 'sourceBadge', 'isFree', 'translations'],
        where: { status: 'published' },
        required: false
      }],
      order: [['sortOrder', 'ASC'], ['title', 'ASC']]
    });
    res.json(collections.map((collection) => {
      const localizedCollection = localizeFields(collection, language, ['title', 'description'], ['title']);
      if (!localizedCollection) return null;
      localizedCollection.stories = (localizedCollection.stories || [])
        .map((story) => localizeFields(story, language, ['title', 'summary']))
        .filter(Boolean);
      return localizedCollection;
    }).filter(Boolean));
  } catch (error) {
    next(error);
  }
});

router.get('/collections/:slug', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const include = [{
        model: Story,
        as: 'stories',
        attributes: ['id', 'title', 'slug', 'summary', 'cover', 'sourceBadge', 'sourceReferences', 'isFree', 'translations'],
        where: { status: 'published' },
        required: false,
        include: [{
          model: StoryPart,
          as: 'parts',
          attributes: ['id', 'partNumber', 'title', 'estimatedReadingMinutes', 'isFree', 'translations'],
          order: [['partNumber', 'ASC']]
        }]
      }];
    let collection = await Collection.findOne({
      where: { slug: req.params.slug, isActive: true },
      include
    });
    if (!collection) {
      const redirect = await SlugRedirect.findOne({ where: { entityType: 'collection', oldSlug: req.params.slug } });
      if (redirect) collection = await Collection.findOne({
        where: { slug: redirect.newSlug, isActive: true },
        include
      });
    }
    if (!collection) return res.status(404).json({ message: 'Collection introuvable.' });
    const localizedCollection = localizeFields(collection, language, ['title', 'description'], ['title']);
    if (!localizedCollection) return res.status(404).json({ message: 'Collection introuvable dans cette langue.' });
    localizedCollection.stories = (localizedCollection.stories || [])
      .map((story) => {
        const localizedStory = localizeFields(story, language, ['title', 'summary']);
        if (!localizedStory) return null;
        localizedStory.parts = (localizedStory.parts || [])
          .map((part) => localizeFields(part, language, ['title']))
          .filter(Boolean);
        return localizedStory;
      })
      .filter(Boolean);
    res.json(localizedCollection);
  } catch (error) {
    next(error);
  }
});

router.get('/stories', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const where = { status: 'published' };
    if (req.query.collectionId) where.collectionId = parseId(req.query.collectionId, 'Collection');
    const stories = await Story.findAll({
      where,
      attributes: ['id', 'collectionId', 'title', 'slug', 'summary', 'cover', 'translations', 'type', 'sourceBadge', 'sourceReferences', 'isFree', 'publishAt', 'tags', 'ageGroup', 'isStoryOfTheWeek'],
      include: [
        { model: Collection, as: 'collection', attributes: ['id', 'title', 'slug', 'isFree', 'translations'] },
        {
          model: StoryPart,
          as: 'parts',
          attributes: ['id', 'partNumber', 'title', 'estimatedReadingMinutes', 'isFree', 'translations'],
          order: [['partNumber', 'ASC']]
        },
        { model: User, as: 'reviewer', attributes: ['firstName', 'lastName'], required: false }
      ],
      order: [['isStoryOfTheWeek', 'DESC'], ['publishAt', 'DESC'], ['title', 'ASC']],
      limit: Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
    });
    res.json(stories.map((story) => {
      const localizedStory = localizeFields(story, language, ['title', 'summary']);
      if (!localizedStory) return null;
      if (localizedStory.collection) {
        localizedStory.collection = localizeFields(localizedStory.collection, language, ['title']);
      }
      localizedStory.parts = (localizedStory.parts || [])
        .map((part) => localizeFields(part, language, ['title']))
        .filter(Boolean);
      return localizedStory;
    }).filter(Boolean));
  } catch (error) {
    next(error);
  }
});

router.get('/stories/:slug', optionalAuthenticate, async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const story = await findPublishedStory(req.params.slug);
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    const localizedStory = localizeFields(story, language, ['title', 'summary']);
    if (!localizedStory) return res.status(404).json({ message: 'Histoire introuvable dans cette langue.' });
    const reviewerName = story.reviewerName ||
      (story.reviewer ? `${story.reviewer.firstName} ${story.reviewer.lastName}` : null);
    const parts = await Promise.all(story.parts
      .sort((left, right) => left.partNumber - right.partNumber)
      .map(async (part) => {
        const localizedPart = localizeFields(part, language, ['title']);
        if (!localizedPart) return null;
        return ({
        id: part.id,
        partNumber: part.partNumber,
        title: localizedPart.title,
        estimatedReadingMinutes: part.estimatedReadingMinutes,
        endingHook: part.endingHook,
        isFree: part.isFree,
        accessible: await canAccessPart({
          userId: req.user?.id,
          role: req.user?.role,
          story,
          part
        })
      });
      }));
    const videos = await Promise.all(story.videos.filter((video) => video.status === 'published').map(async (video) => {
      const part = video.partId
        ? story.parts.find((candidate) => candidate.id === video.partId)
        : story.parts[0];
      const accessible = part && video.depictionPolicyConfirmed && await canAccessPart({
        userId: req.user?.id,
        role: req.user?.role,
        story,
        part: video.isFree ? { ...part.toJSON(), isFree: true } : part
      });
      return {
        id: video.id,
        title: localizeFields(video, language, ['title', 'description'])?.title || video.title,
        description: localizeFields(video, language, ['title', 'description'])?.description || '',
        subtitles: video.subtitles?.[language] || null,
        partId: video.partId,
        episodeNumber: video.episodeNumber,
        durationSeconds: video.durationSeconds,
        thumbnail: video.thumbnail,
        isFree: video.isFree,
        ...(accessible ? {
          ...(video.mediaAsset?.storageKey && isLocalStorageKey(video.mediaAsset.storageKey)
            ? { mediaAssetId: video.mediaAsset.id }
            : { videoUrl: video.mediaAsset?.storageKey
              ? await createMediaUrl({ key: video.mediaAsset.storageKey, mimeType: video.mediaAsset.mimeType })
              : video.videoUrl })
        } : {})
      };
    }));
    res.json({
      id: story.id,
      title: localizedStory.title,
      slug: story.slug,
      summary: localizedStory.summary,
      cover: story.cover,
      type: story.type,
      sourceBadge: story.sourceBadge,
      sourceReferences: story.sourceReferences,
      reviewerName,
      isFree: story.isFree || story.collection.isFree,
      collection: {
        id: story.collection.id,
        title: localizeFields(story.collection, language, ['title'])?.title || '',
        slug: story.collection.slug
      },
      parts: parts.filter(Boolean),
      videos
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stories/:slug/parts/:partNumber', optionalAuthenticate, async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const partNumber = parseId(req.params.partNumber, 'Numéro de partie');
    const story = await findPublishedStory(req.params.slug);
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    const part = await findAccessiblePart(story, partNumber, req.user);
    const localizedPart = localizeFields(part, language, ['title', 'content', 'endingHook']);
    if (!localizedPart) return res.status(404).json({ message: 'Cette partie n’est pas encore disponible dans cette langue.' });
    res.json(localizedPart);
  } catch (error) {
    next(error);
  }
});

router.get('/stories/:slug/parts/:partNumber/quiz', optionalAuthenticate, async (req, res, next) => {
  try {
    const partNumber = parseId(req.params.partNumber, 'Numéro de partie');
    const story = await findPublishedStory(req.params.slug);
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    const part = story.parts.find((candidate) => candidate.partNumber === partNumber);
    if (!part) return res.status(404).json({ message: 'Partie introuvable.' });
    const quizzes = await Quiz.findAll({
      where: {
        storyId: story.id,
        status: 'published',
        [Op.or]: [{ partId: part.id }, { partId: null }]
      },
      include: [{
        model: Question,
        as: 'questions',
        include: [{ model: QuizOption, as: 'answerOptions', order: [['sortOrder', 'ASC']] }],
        order: [['sortOrder', 'ASC']]
      }]
    });
    const lastPartNumber = Math.max(...story.parts.map((candidate) => candidate.partNumber));
    const quiz = quizzes.find((candidate) => candidate.partId === part.id) ||
      (part.partNumber === lastPartNumber ? quizzes.find((candidate) => candidate.partId == null) : null);
    if (!quiz) return res.status(404).json({ message: 'Quiz validé introuvable.' });
    await checkQuizAccess(quiz, req.user);
    const language = requestedLanguage(req.query.lang);
    res.json({
      id: quiz.id,
      slug: quiz.slug,
      title: localizedQuizValue(quiz.translations, language, 'title') || quiz.title,
      description: localizedQuizValue(quiz.translations, language, 'description') || quiz.description || '',
      difficulty: quiz.difficulty,
      passingScore: quiz.passingScore,
      timeLimitSeconds: quiz.timeLimitSeconds,
      maxAttempts: quiz.maxAttempts,
      questions: quiz.questions
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((question) => publicQuestion(question, language, false))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/books', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const books = await Book.findAll({
      where: { status: 'published' },
      attributes: ['id', 'collectionId', 'storyId', 'title', 'slug', 'description', 'translations', 'cover', 'format', 'price', 'currency', 'stockQuantity'],
      order: [['createdAt', 'DESC']],
      limit: Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
    });
    res.json(books.map((book) => localizeFields(book, language, ['title', 'description'], ['title']))
      .filter(Boolean));
  } catch (error) {
    next(error);
  }
});

router.get('/books/:slug', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const options = {
      attributes: ['id', 'collectionId', 'storyId', 'title', 'slug', 'description', 'translations', 'cover', 'format', 'price', 'currency', 'stockQuantity']
    };
    let book = await Book.findOne({
      where: { slug: req.params.slug, status: 'published' },
      ...options
    });
    if (!book) {
      const redirect = await SlugRedirect.findOne({ where: { entityType: 'book', oldSlug: req.params.slug } });
      if (redirect) book = await Book.findOne({
        where: { slug: redirect.newSlug, status: 'published' },
        ...options
      });
    }
    if (!book) return res.status(404).json({ message: 'Livre introuvable.' });
    const localizedBook = localizeFields(book, language, ['title', 'description'], ['title']);
    if (!localizedBook) return res.status(404).json({ message: 'Livre introuvable dans cette langue.' });
    res.json(localizedBook);
  } catch (error) {
    next(error);
  }
});

router.get('/books/:slug/access', authenticate, async (req, res, next) => {
  try {
    const book = await Book.findOne({ where: { slug: req.params.slug, status: 'published' } });
    if (!book || book.format !== 'ebook') return res.status(404).json({ message: 'Livre numérique introuvable.' });
    res.json({ canDownload: await canAccessBook({ userId: req.user.id, role: req.user.role, book }) });
  } catch (error) {
    next(error);
  }
});

router.get('/books/:slug/download', authenticate, async (req, res, next) => {
  try {
    const book = await Book.findOne({ where: { slug: req.params.slug, status: 'published' } });
    if (!book || book.format !== 'ebook') return res.status(404).json({ message: 'Livre numérique introuvable.' });
    if (!await canAccessBook({ userId: req.user.id, role: req.user.role, book })) {
      return res.status(403).json({ message: 'Un droit de téléchargement actif est requis.', code: 'CONTENT_LOCKED' });
    }
    if (!book.fileStorageKey) return res.status(404).json({ message: 'Le fichier du livre n’est pas encore disponible.' });
    if (book.fileStorageKey === SAMPLE_EBOOK_STORAGE_KEY) {
      await fs.promises.access(SAMPLE_EBOOK_PATH, fs.constants.R_OK);
      return res.json({
        url: `/books/${encodeURIComponent(book.slug)}/sample-download`,
        requiresAuth: true,
        expiresInSeconds: 300
      });
    }
    if (isLocalStorageKey(book.fileStorageKey)) {
      return res.json({
        url: `/books/${encodeURIComponent(book.slug)}/local-download`,
        requiresAuth: true,
        expiresInSeconds: 300
      });
    }
    res.json({
      url: await createDownloadUrl({
        key: book.fileStorageKey,
        fileName: `${book.slug}.pdf`,
        mimeType: 'application/pdf'
      }),
      expiresInSeconds: 300
    });
  } catch (error) {
    next(error);
  }
});

router.get('/books/:slug/local-download', authenticate, async (req, res, next) => {
  try {
    const book = await Book.findOne({ where: { slug: req.params.slug, status: 'published' } });
    if (!book || book.format !== 'ebook' || !isLocalStorageKey(book.fileStorageKey)) {
      return res.status(404).json({ message: 'Fichier ebook introuvable.' });
    }
    if (!await canAccessBook({ userId: req.user.id, role: req.user.role, book })) {
      return res.status(403).json({ message: 'Un droit de téléchargement actif est requis.', code: 'CONTENT_LOCKED' });
    }
    res.download(localStoragePath(book.fileStorageKey), `${book.slug}.pdf`, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

router.get('/books/:slug/sample-download', authenticate, async (req, res, next) => {
  try {
    const book = await Book.findOne({ where: { slug: req.params.slug, status: 'published' } });
    if (!book || book.format !== 'ebook' || book.fileStorageKey !== SAMPLE_EBOOK_STORAGE_KEY) {
      return res.status(404).json({ message: 'Fichier de démonstration introuvable.' });
    }
    if (!await canAccessBook({ userId: req.user.id, role: req.user.role, book })) {
      return res.status(403).json({ message: 'Un droit de téléchargement actif est requis.', code: 'CONTENT_LOCKED' });
    }
    res.download(SAMPLE_EBOOK_PATH, `${book.slug}.pdf`, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

router.get('/media-assets/:id/url', optionalAuthenticate, async (req, res, next) => {
  try {
    const media = await MediaAsset.findByPk(parseId(req.params.id, 'Média'));
    if (!media) return res.status(404).json({ message: 'Média introuvable.' });
    if (!media.depictionPolicyConfirmed) {
      return res.status(403).json({ message: 'La politique de représentation doit être confirmée pour ce média.' });
    }
    if (media.metadata?.uploadPending) {
      return res.status(409).json({ message: 'Le téléversement du média n’est pas encore finalisé.' });
    }
    const accessible = await canAccessMedia(media, req.user);
    if (!accessible) return res.status(403).json({ message: 'Accès au média non autorisé.', code: 'CONTENT_LOCKED' });
    if (media.externalUrl) return res.json({ url: media.externalUrl });
    if (!media.storageKey) return res.status(404).json({ message: 'Le fichier du média est indisponible.' });
    if (isLocalStorageKey(media.storageKey)) {
      return res.json({ url: `/media-assets/${media.id}/file`, requiresAuth: true });
    }
    res.json({
      url: await createMediaUrl({ key: media.storageKey, mimeType: media.mimeType }),
      expiresInSeconds: 300
    });
  } catch (error) {
    next(error);
  }
});

router.get('/media-assets/:id/file', optionalAuthenticate, async (req, res, next) => {
  try {
    const media = await MediaAsset.findByPk(parseId(req.params.id, 'Média'));
    if (!media || !isLocalStorageKey(media.storageKey) || media.metadata?.uploadPending) {
      return res.status(404).json({ message: 'Fichier média introuvable.' });
    }
    if (!media.depictionPolicyConfirmed) {
      return res.status(403).json({ message: 'La politique de représentation doit être confirmée pour ce média.' });
    }
    if (!await canAccessMedia(media, req.user)) {
      return res.status(403).json({ message: 'Accès au média non autorisé.', code: 'CONTENT_LOCKED' });
    }
    res.type(media.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(localStoragePath(media.storageKey), (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

router.post('/quizzes/:id/start', authenticate, quizAttemptRateLimit, async (req, res, next) => {
  try {
    const quiz = await loadPublishedQuiz(parseId(req.params.id, 'Quiz'));
    await checkQuizAccess(quiz, req.user);
    if (!quiz.questions.length) {
      return res.status(409).json({ message: 'Le quiz publié ne contient pas encore de questions.' });
    }
    const startedAt = new Date();
    const attempt = await sequelize.transaction(async (transaction) => {
      const lockedQuiz = await Quiz.findByPk(quiz.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!lockedQuiz) throw notFound('Quiz publié introuvable.');
      const attemptCount = await QuizAttempt.count({
        where: { quizId: quiz.id, userId: req.user.id },
        transaction
      });
      if (lockedQuiz.maxAttempts && attemptCount >= lockedQuiz.maxAttempts) {
        throw httpError('Vous avez atteint le nombre maximal de tentatives.', 409, 'QUIZ_ATTEMPTS_EXHAUSTED');
      }
      return QuizAttempt.create({
        userId: req.user.id,
        quizId: quiz.id,
        score: null,
        answers: {},
        startedAt
      }, { transaction });
    });
    res.status(201).json({
      attemptId: attempt.id,
      startedAt,
      timeLimitSeconds: quiz.timeLimitSeconds,
      questions: (quiz.shuffleQuestions ? shuffle(quiz.questions) : quiz.questions)
        .map((question) => publicQuestion(question, requestedLanguage(req.query.lang), quiz.shuffleAnswers, shuffle))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/quizzes/:id/attempts', authenticate, quizAttemptRateLimit, validateBody(schemas.quizAnswersSchema), async (req, res, next) => {
  try {
    const quiz = await loadPublishedQuiz(parseId(req.params.id, 'Quiz'));
    await checkQuizAccess(quiz, req.user);
    const attemptId = parseId(req.body.attemptId, 'Tentative');
    const attempt = await QuizAttempt.findOne({
      where: { id: attemptId, quizId: quiz.id, userId: req.user.id }
    });
    if (!attempt || attempt.completedAt) {
      return res.status(409).json({ message: 'Cette tentative est introuvable ou déjà terminée.' });
    }
    if (quiz.timeLimitSeconds && Date.now() > new Date(attempt.startedAt).getTime() + quiz.timeLimitSeconds * 1000) {
      return res.status(409).json({ message: 'Le temps imparti pour ce quiz est écoulé.', code: 'QUIZ_TIME_EXPIRED' });
    }
    const answers = req.body.answers;
    const questions = quiz.questions;
    const validIds = new Set(questions.map((question) => String(question.id)));
    if (Object.keys(answers).some((questionId) => !validIds.has(questionId))) {
      return res.status(400).json({ message: 'La réponse contient une question qui n’appartient pas à ce quiz.' });
    }
    let earnedPoints = 0;
    let totalPoints = 0;
    const language = requestedLanguage(req.query.lang);
    const feedback = questions.map((question) => {
      const selectedValue = answers[question.id] ?? answers[String(question.id)] ?? '';
      const selectedIds = (Array.isArray(selectedValue) ? selectedValue : [selectedValue]).map(String).sort();
      const options = question.answerOptions || [];
      const optionIds = new Set(options.map((option) => String(option.id)));
      if (selectedIds.some((id) => !optionIds.has(id)) || new Set(selectedIds).size !== selectedIds.length) {
        throw httpError('الإجابة تحتوي على خيار غير صالح لهذا السؤال.', 400, 'INVALID_QUIZ_ANSWER');
      }
      const correctIds = options.filter((option) => option.isCorrect).map((option) => String(option.id)).sort();
      const correct = correctIds.length
        ? selectedIds.length === correctIds.length && selectedIds.every((id, index) => id === correctIds[index])
        : selectedIds.length === 1 && selectedIds[0] === question.correctAnswer;
      const points = question.points || 1;
      totalPoints += points;
      if (correct) earnedPoints += points;
      const selectedOptions = options.filter((option) => selectedIds.includes(String(option.id)));
      const correctOptions = options.filter((option) => option.isCorrect);
      return {
        questionId: question.id,
        selectedAnswer: selectedOptions.map((option) => localizedOptionValue(option, language)),
        correct,
        ...(quiz.showCorrectAnswersAfterSubmit ? {
          correctAnswer: correctOptions.map((option) => localizedOptionValue(option, language))
        } : {}),
        explanation: localizedTextValue(question.explanationTranslations, language) || question.explanation || '',
        source: localizedTextValue(question.sourceTranslations, language) || question.source || ''
      };
    });
    const score = totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= quiz.passingScore;
    const finishedAt = new Date();
    attempt.score = score;
    attempt.answers = answers;
    attempt.passed = passed;
    attempt.finishedAt = finishedAt;
    attempt.completedAt = finishedAt;
    await attempt.save();
    const totalAttempts = await QuizAttempt.count({
      where: { quizId: quiz.id, userId: req.user.id }
    });
    if (passed) {
      const awarded = await ensureBadgeAward(req.user.id, 'quiz-passed', 'quiz', quiz.id, { quizId: quiz.id, score });
      const certificate = await maybeIssueCertificate({
        userId: req.user.id,
        badgeTypeId: awarded.badgeTypeId,
        title: `Certificate: ${quiz.title || quiz.slug}`,
        quizId: quiz.id
      });
      if (certificate) {
        await ensureBadgeAward(req.user.id, 'quiz-certificate', 'quiz', quiz.id, { certificateId: certificate.certificate.id, score });
      }
    }
    res.json({
      attemptId: attempt.id,
      score,
      correctCount: feedback.filter((item) => item.correct).length,
      totalQuestions: questions.length,
      passed,
      canRetry: !quiz.maxAttempts || totalAttempts < quiz.maxAttempts,
      feedback
    });
  } catch (error) {
    next(error);
  }
});

router.get('/quiz-attempts', authenticate, async (req, res, next) => {
  try {
    const attempts = await QuizAttempt.findAll({
      where: { userId: req.user.id, completedAt: { [Op.ne]: null } },
      include: [{
        model: Quiz,
        as: 'quiz',
        attributes: ['id', 'slug', 'title', 'translations', 'storyId', 'partId'],
        include: [{ model: Story, as: 'story', attributes: ['id', 'slug', 'title', 'translations'] }]
      }],
      order: [['finishedAt', 'DESC'], ['completedAt', 'DESC']],
      limit: 100
    });
    const language = requestedLanguage(req.query.lang);
    res.json(attempts.map((attempt) => ({
      id: attempt.id,
      quizId: attempt.quizId,
      score: attempt.score,
      passed: attempt.passed,
      finishedAt: attempt.finishedAt || attempt.completedAt,
      quiz: attempt.quiz ? {
        id: attempt.quiz.id,
        slug: attempt.quiz.slug,
        title: localizedQuizValue(attempt.quiz.translations, language, 'title') || attempt.quiz.title,
        story: attempt.quiz.story ? {
          slug: attempt.quiz.story.slug,
          title: localizeFields(attempt.quiz.story, language, ['title'])?.title || attempt.quiz.story.title
        } : null
      } : null
    })));
  } catch (error) {
    next(error);
  }
});

router.get('/badges', authenticate, async (req, res, next) => {
  try {
    const awards = await BadgeAward.findAll({
      where: { userId: req.user.id },
      include: [{ model: BadgeType, as: 'badgeType', attributes: ['id', 'code', 'name', 'translations', 'icon'] }],
      order: [['awardedAt', 'DESC']]
    });
    res.json(awards.map((award) => ({
      id: award.id,
      code: award.badgeType?.code,
      name: award.badgeType?.translations?.ar || award.badgeType?.name,
      icon: award.badgeType?.icon || 'award',
      awardedAt: award.awardedAt,
      metadata: award.metadata || {}
    })));
  } catch (error) {
    next(error);
  }
});

router.get('/certificates', authenticate, async (req, res, next) => {
  try {
    const certificates = await Certificate.findAll({
      where: { userId: req.user.id },
      include: [{ model: BadgeType, as: 'badgeType', attributes: ['id', 'code', 'name', 'translations'] }],
      order: [['issuedAt', 'DESC']]
    });
    res.json(certificates.map((certificate) => ({
      id: certificate.id,
      title: certificate.title,
      verificationCode: certificate.verificationCode,
      issuedAt: certificate.issuedAt,
      badge: certificate.badgeType ? { code: certificate.badgeType.code, name: certificate.badgeType.name } : null,
      downloadUrl: `/api/v1/certificates/${certificate.id}/pdf`
    })));
  } catch (error) {
    next(error);
  }
});

router.get('/certificates/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const certificate = await Certificate.findOne({ where: { id: parseId(req.params.id, 'Certificat'), userId: req.user.id } });
    if (!certificate) return res.status(404).json({ message: 'Certificat introuvable.' });
    const user = await User.findByPk(req.user.id, { attributes: ['firstName', 'lastName', 'email'] });
    const pdf = buildCertificatePdf({
      name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Reader',
      title: certificate.title,
      date: new Date(certificate.issuedAt).toISOString().slice(0, 10),
      code: certificate.verificationCode
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${certificate.id}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

router.get('/stories/:id/reviews', async (req, res, next) => {
  try {
    const storyId = parseId(req.params.id, 'Histoire');
    const reviews = await StoryReview.findAll({
      where: { storyId, status: 'approved' },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json(reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      user: review.user ? { id: review.user.id, name: `${review.user.firstName} ${review.user.lastName}`.trim() } : null,
      createdAt: review.createdAt
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/stories/:id/reviews', authenticate, async (req, res, next) => {
  try {
    const storyId = parseId(req.params.id, 'Histoire');
    const rating = Number(req.body.rating || 5);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'La note doit être comprise entre 1 et 5.' });
    }
    const review = await StoryReview.create({
      storyId,
      userId: req.user.id,
      title: String(req.body.title || '').slice(0, 255),
      body: String(req.body.body || '').trim(),
      rating,
      status: 'pending'
    });
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
});

router.get('/books/:id/reviews', async (req, res, next) => {
  try {
    const bookId = parseId(req.params.id, 'Livre');
    const reviews = await StoryReview.findAll({
      where: { bookId, status: 'approved' },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json(reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      user: review.user ? { id: review.user.id, name: `${review.user.firstName} ${review.user.lastName}`.trim() } : null,
      createdAt: review.createdAt
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/books/:id/reviews', authenticate, async (req, res, next) => {
  try {
    const bookId = parseId(req.params.id, 'Livre');
    const rating = Number(req.body.rating || 5);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'La note doit être comprise entre 1 et 5.' });
    }
    const review = await StoryReview.create({
      bookId,
      userId: req.user.id,
      title: String(req.body.title || '').slice(0, 255),
      body: String(req.body.body || '').trim(),
      rating,
      status: 'pending'
    });
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
});

router.post('/story-requests', async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    if (!title || !description) {
      return res.status(400).json({ message: 'Le titre et la description de la demande sont requis.' });
    }
    const request = await StoryRequest.create({
      userId: req.user ? req.user.id : null,
      title,
      description,
      source: String(req.body.source || '').trim() || null,
      contactEmail: String(req.body.contactEmail || '').trim() || null,
      status: 'new'
    });
    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
});

router.get('/events', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const events = await CommunityEvent.findAll({
      where: { status: 'published' },
      order: [['startsAt', 'ASC']],
      limit: Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    });
    res.json(events.map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.translations?.[language]?.title || event.translations?.ar?.title || '',
      rules: event.translations?.[language]?.rules || event.translations?.ar?.rules || '',
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      quizId: event.quizId,
      winnerDisplayName: event.winnerDisplayName,
      winnerAnnouncement: event.winnerAnnouncement?.[language] || event.winnerAnnouncement?.ar || ''
    })));
  } catch (error) {
    next(error);
  }
});

router.get('/events/:id/leaderboard', async (req, res, next) => {
  try {
    const eventId = parseId(req.params.id, 'Événement');
    const event = await CommunityEvent.findOne({ where: { id: eventId, status: 'published' } });
    if (!event) return res.status(404).json({ message: 'Événement introuvable.' });
    const entries = await EventEntry.findAll({
      where: { eventId },
      include: [{ model: User, as: 'user', attributes: ['firstName'] }],
      order: [['score', 'DESC'], ['createdAt', 'ASC']],
      limit: 100
    });
    res.json(entries.map((entry, index) => ({
      rank: index + 1,
      displayName: entry.user?.firstName || 'Lecteur',
      score: entry.score
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/events/:id/entries', authenticate, async (req, res, next) => {
  try {
    const event = await CommunityEvent.findOne({
      where: { id: parseId(req.params.id, 'Événement'), status: 'published' }
    });
    if (!event || new Date() < event.startsAt || new Date() > event.endsAt) {
      return res.status(404).json({ message: 'Cet événement n’est pas ouvert aux participations.' });
    }
    let score = Number.isSafeInteger(req.body.score) && req.body.score >= 0 ? req.body.score : 0;
    if (event.quizId) {
      const attempt = await QuizAttempt.findOne({
        where: { quizId: event.quizId, userId: req.user.id, passed: true, finishedAt: { [Op.ne]: null } },
        order: [['score', 'DESC']]
      });
      if (!attempt) return res.status(409).json({ message: 'Réussissez le quiz lié pour participer.' });
      score = attempt.score;
    }
    const [entry, created] = await EventEntry.findOrCreate({
      where: { eventId: event.id, userId: req.user.id },
      defaults: { eventId: event.id, userId: req.user.id, score }
    });
    if (!created && score > entry.score) await entry.update({ score });
    res.status(created ? 201 : 200).json({ id: entry.id, score: Math.max(score, entry.score) });
  } catch (error) {
    next(error);
  }
});

router.post('/teams', authenticate, async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const name = String(req.body.name || '').trim();
    const displayName = String(req.body.displayName || req.user.firstName || '').trim();
    if (!name || name.length > 120 || !displayName || displayName.length > 80) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Un nom d’équipe et un pseudonyme sont requis.' });
    }
    if (await TeamMember.findOne({ where: { userId: req.user.id }, transaction })) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Vous faites déjà partie d’une équipe.' });
    }
    const team = await Team.create({
      ownerId: req.user.id,
      name,
      inviteCode: crypto.randomBytes(9).toString('base64url')
    }, { transaction });
    await TeamMember.create({
      teamId: team.id,
      userId: req.user.id,
      displayName,
      role: 'owner'
    }, { transaction });
    await transaction.commit();
    res.status(201).json({ id: team.id, name: team.name, inviteCode: team.inviteCode });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
});

router.post('/teams/join', authenticate, async (req, res, next) => {
  try {
    const inviteCode = String(req.body.inviteCode || '').trim();
    const displayName = String(req.body.displayName || req.user.firstName || '').trim().slice(0, 80);
    if (!inviteCode || !displayName) return res.status(400).json({ message: 'Le code d’invitation et un pseudonyme sont requis.' });
    if (await TeamMember.findOne({ where: { userId: req.user.id } })) {
      return res.status(409).json({ message: 'Vous faites déjà partie d’une équipe.' });
    }
    const team = await Team.findOne({ where: { inviteCode, isActive: true } });
    if (!team) return res.status(404).json({ message: 'Code d’invitation introuvable.' });
    const member = await TeamMember.create({ teamId: team.id, userId: req.user.id, displayName });
    res.status(201).json({ id: team.id, name: team.name, memberId: member.id });
  } catch (error) {
    next(error);
  }
});

router.get('/teams/me', authenticate, async (req, res, next) => {
  try {
    const membership = await TeamMember.findOne({
      where: { userId: req.user.id },
      include: [{ model: Team, as: 'team', include: [{ model: TeamMember, as: 'members' }] }]
    });
    if (!membership?.team) return res.json(null);
    const members = await Promise.all(membership.team.members.map(async (member) => {
      const progress = await ReadingProgress.findAll({
        where: { userId: member.userId },
        attributes: ['completedParts']
      });
      return {
        displayName: member.displayName,
        completedParts: progress.reduce((total, item) => total + (Array.isArray(item.completedParts) ? item.completedParts.length : 0), 0)
      };
    }));
    res.json({
      id: membership.team.id,
      name: membership.team.name,
      inviteCode: membership.role === 'owner' ? membership.team.inviteCode : undefined,
      members
    });
  } catch (error) {
    next(error);
  }
});

router.get('/donation-campaigns', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const campaigns = await DonationCampaign.findAll({
      where: { status: 'active' },
      order: [['createdAt', 'DESC']],
      limit: Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    });
    const results = await Promise.all(campaigns.map(async (campaign) => {
      const paid = await Donation.sum('amount', { where: { campaignId: campaign.id, status: 'paid' } });
      return {
        id: campaign.id,
        slug: campaign.slug,
        title: campaign.translations?.[language]?.title || campaign.translations?.ar?.title || '',
        description: campaign.translations?.[language]?.description || campaign.translations?.ar?.description || '',
        goalAmount: campaign.goalAmount,
        raisedAmount: paid || 0,
        currency: campaign.currency,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt
      };
    }));
    res.json(results);
  } catch (error) {
    next(error);
  }
});

router.get('/policy/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim();
    const page = await PolicyPage.findOne({ where: { code } });
    const language = requestedLanguage(req.query.lang);
    res.json({
      code,
      ...(page?.translations?.[language] || page?.translations?.ar || { title: '', body: '' })
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/community/badges', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const badges = await BadgeType.findAll({ order: [['createdAt', 'DESC']] });
    res.json(badges);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/community/events', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.q) where.slug = { [Op.like]: `%${String(req.query.q).trim()}%` };
    const result = await CommunityEvent.findAndCountAll({
      where,
      order: [['startsAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/community/events', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), validateBody(schemas.communityEventSchema), async (req, res, next) => {
  try {
    const event = await CommunityEvent.create(req.body);
    await recordAudit(req, 'CREATE_COMMUNITY_EVENT', 'CommunityEvent', event.id);
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/community/events/:id', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), validateBody(schemas.communityEventUpdateSchema), async (req, res, next) => {
  try {
    const event = await CommunityEvent.findByPk(parseId(req.params.id, 'Événement'));
    if (!event) return res.status(404).json({ message: 'Événement introuvable.' });
    const startsAt = req.body.startsAt ? new Date(req.body.startsAt) : new Date(event.startsAt);
    const endsAt = req.body.endsAt ? new Date(req.body.endsAt) : new Date(event.endsAt);
    if (endsAt <= startsAt) return res.status(400).json({ message: 'La fin doit être postérieure au début.' });
    await event.update(req.body);
    await recordAudit(req, 'UPDATE_COMMUNITY_EVENT', 'CommunityEvent', event.id);
    res.json(event);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/community/events/:id/entries', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await EventEntry.findAndCountAll({
      where: { eventId: parseId(req.params.id, 'Événement') },
      include: [{ model: User, as: 'user', attributes: ['firstName'] }],
      order: [['score', 'DESC'], ['createdAt', 'ASC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({
      items: result.rows.map((entry) => ({
        id: entry.id,
        displayName: entry.user?.firstName || 'Lecteur',
        score: entry.score,
        createdAt: entry.createdAt
      })),
      total: result.count,
      page,
      limit
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/community/teams', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await Team.findAndCountAll({
      where: req.query.q ? { name: { [Op.like]: `%${String(req.query.q).trim()}%` } } : {},
      include: [{ model: TeamMember, as: 'members', attributes: ['displayName', 'role'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({
      items: result.rows.map((team) => ({
        id: team.id,
        name: team.name,
        isActive: team.isActive,
        memberCount: team.members.length,
        members: team.members.map((member) => ({ displayName: member.displayName, role: member.role }))
      })),
      total: result.count,
      page,
      limit
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/money/donation-campaigns', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await DonationCampaign.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    const items = await Promise.all(result.rows.map(async (campaign) => ({
      ...campaign.toJSON(),
      raisedAmount: await Donation.sum('amount', { where: { campaignId: campaign.id, status: 'paid' } }) || 0
    })));
    res.json({ items, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/money/donation-campaigns', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), validateBody(schemas.donationCampaignSchema), async (req, res, next) => {
  try {
    const campaign = await DonationCampaign.create(req.body);
    await recordAudit(req, 'CREATE_DONATION_CAMPAIGN', 'DonationCampaign', campaign.id);
    res.status(201).json(campaign);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/money/donation-campaigns/:id', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), validateBody(schemas.donationCampaignSchema.partial()), async (req, res, next) => {
  try {
    const campaign = await DonationCampaign.findByPk(parseId(req.params.id, 'Campagne'));
    if (!campaign) return res.status(404).json({ message: 'Campagne introuvable.' });
    await campaign.update(req.body);
    await recordAudit(req, 'UPDATE_DONATION_CAMPAIGN', 'DonationCampaign', campaign.id);
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/money/donations', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await Donation.findAndCountAll({
      include: [
        { model: DonationCampaign, as: 'campaign', attributes: ['id', 'slug', 'translations'] },
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/system/email-templates', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const result = await EmailTemplate.findAndCountAll({
      order: [['code', 'ASC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/system/email-templates', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), validateBody(schemas.emailTemplateSchema), async (req, res, next) => {
  try {
    const [template, created] = await EmailTemplate.findOrCreate({
      where: { code: req.body.code },
      defaults: req.body
    });
    if (!created) return res.status(409).json({ message: 'Ce modèle de courriel existe déjà.' });
    await recordAudit(req, 'CREATE_EMAIL_TEMPLATE', 'EmailTemplate', template.id);
    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/system/email-templates/:id', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), validateBody(schemas.emailTemplateSchema.partial()), async (req, res, next) => {
  try {
    const template = await EmailTemplate.findByPk(parseId(req.params.id, 'Modèle'));
    if (!template) return res.status(404).json({ message: 'Modèle de courriel introuvable.' });
    await template.update(req.body);
    await recordAudit(req, 'UPDATE_EMAIL_TEMPLATE', 'EmailTemplate', template.id);
    res.json(template);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/system/email-templates/:id/test', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const template = await EmailTemplate.findByPk(parseId(req.params.id, 'Modèle'));
    if (!template) return res.status(404).json({ message: 'Modèle de courriel introuvable.' });
    const language = requestedLanguage(req.body.language || req.user.language);
    const content = template.translations?.[language] || template.translations?.ar;
    if (!content?.subject || !content?.body) return res.status(409).json({ message: 'Le modèle ne contient pas de texte pour cette langue.' });
    const safeBody = content.body
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\{\{\s*firstName\s*\}\}/g, req.user.firstName)
      .replace(/\{\{\s*lastName\s*\}\}/g, req.user.lastName)
      .replace(/\{\{\s*email\s*\}\}/g, req.user.email)
      .replace(/\n/g, '<br>');
    await deliverEmail({
      to: req.user.email,
      subject: content.subject.replace(/\{\{\s*firstName\s*\}\}/g, req.user.firstName),
      html: safeBody,
      purpose: `template-test:${template.code}`
    });
    res.json({ sent: true, email: req.user.email });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/system/policy', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    res.json(await PolicyPage.findAll({ order: [['code', 'ASC']] }));
  } catch (error) {
    next(error);
  }
});

router.put('/admin/system/policy/:code', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), validateBody(schemas.policyPageSchema), async (req, res, next) => {
  try {
    const code = String(req.params.code).trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,80}$/.test(code)) return res.status(400).json({ message: 'Code de politique invalide.' });
    const [page, created] = await PolicyPage.findOrCreate({
      where: { code },
      defaults: { code, translations: req.body.translations, updatedBy: req.user.id }
    });
    if (!created) await page.update({ translations: req.body.translations, updatedBy: req.user.id });
    await recordAudit(req, created ? 'CREATE_POLICY_PAGE' : 'UPDATE_POLICY_PAGE', 'PolicyPage', page.id);
    res.json(page);
  } catch (error) {
    next(error);
  }
});

router.post('/reminders', authenticate, async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim();
    const scheduledAt = new Date(req.body.scheduledAt);
    if (!/^[a-z0-9_-]{2,100}$/.test(code) || Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      return res.status(400).json({ message: 'Le modèle et une date future valide sont requis.' });
    }
    if (req.user.emailPreferences?.reminders === false) {
      return res.status(403).json({ message: 'Les rappels par e-mail sont désactivés dans vos préférences.' });
    }
    const reminder = await ScheduledReminder.create({
      userId: req.user.id,
      code,
      scheduledAt,
      metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}
    });
    res.status(201).json({ id: reminder.id, code: reminder.code, scheduledAt: reminder.scheduledAt });
  } catch (error) {
    next(error);
  }
});

router.patch('/account/email-preferences', authenticate, async (req, res, next) => {
  try {
    const { marketing, reminders } = req.body || {};
    if (typeof marketing !== 'boolean' || typeof reminders !== 'boolean') {
      return res.status(400).json({ message: 'Les préférences marketing et rappels doivent être booléennes.' });
    }
    await req.user.update({ emailPreferences: { marketing, reminders } });
    res.json({ emailPreferences: req.user.emailPreferences });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/system/reminders/process', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    res.json(await processDueReminders());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/community/badges', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const badge = await BadgeType.create({
      code: String(req.body.code || '').trim(),
      name: String(req.body.name || '').trim(),
      description: String(req.body.description || '').trim(),
      translations: req.body.translations || { ar: String(req.body.name || ''), en: String(req.body.name || ''), fr: String(req.body.name || '') },
      icon: String(req.body.icon || 'award'),
      criteria: req.body.criteria || {},
      isActive: req.body.isActive !== false
    });
    res.status(201).json(badge);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/community/badges/:id', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const badge = await BadgeType.findByPk(parseId(req.params.id, 'Badge'));
    if (!badge) return res.status(404).json({ message: 'Badge introuvable.' });
    await badge.update({
      code: req.body.code ?? badge.code,
      name: req.body.name ?? badge.name,
      description: req.body.description ?? badge.description,
      translations: req.body.translations ?? badge.translations,
      icon: req.body.icon ?? badge.icon,
      criteria: req.body.criteria ?? badge.criteria,
      isActive: req.body.isActive ?? badge.isActive
    });
    res.json(badge);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/community/reviews', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const reviews = await StoryReview.findAll({
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }, { model: Story, as: 'story', attributes: ['id', 'title', 'slug'] }, { model: Book, as: 'book', attributes: ['id', 'title', 'slug'] }],
      order: [['createdAt', 'DESC']],
      limit: 200
    });
    res.json(reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      status: review.status,
      moderationNote: review.moderationNote,
      user: review.user ? { id: review.user.id, name: `${review.user.firstName} ${review.user.lastName}`.trim(), email: review.user.email } : null,
      story: review.story ? { id: review.story.id, title: review.story.title, slug: review.story.slug } : null,
      book: review.book ? { id: review.book.id, title: review.book.title, slug: review.book.slug } : null,
      createdAt: review.createdAt
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/community/reviews/:id/moderate', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const review = await StoryReview.findByPk(parseId(req.params.id, 'Avis'));
    if (!review) return res.status(404).json({ message: 'Avis introuvable.' });
    const status = String(req.body.status || 'approved');
    if (!['approved', 'rejected', 'hidden', 'reported'].includes(status)) {
      return res.status(400).json({ message: 'Statut de modération invalide.' });
    }
    review.status = status;
    review.moderationNote = req.body.moderationNote || review.moderationNote;
    await review.save();
    res.json(review);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/requests', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN', 'EDITOR'), async (req, res, next) => {
  try {
    const requests = await StoryRequest.findAll({
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: 200
    });
    res.json(requests.map((request) => ({
      id: request.id,
      title: request.title,
      description: request.description,
      source: request.source,
      status: request.status,
      adminNotes: request.adminNotes,
      contactEmail: request.contactEmail,
      user: request.user ? { id: request.user.id, name: `${request.user.firstName} ${request.user.lastName}`.trim(), email: request.user.email } : null,
      createdAt: request.createdAt
    })));
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/requests/:id', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN', 'EDITOR'), async (req, res, next) => {
  try {
    const request = await StoryRequest.findByPk(parseId(req.params.id, 'Demande'));
    if (!request) return res.status(404).json({ message: 'Demande introuvable.' });
    if (req.body.status) request.status = req.body.status;
    if (req.body.adminNotes !== undefined) request.adminNotes = req.body.adminNotes;
    await request.save();
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/requests/:id/convert', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN', 'EDITOR'), async (req, res, next) => {
  try {
    const request = await StoryRequest.findByPk(parseId(req.params.id, 'Demande'));
    if (!request) return res.status(404).json({ message: 'Demande introuvable.' });
    const collection = await Collection.findOne({ where: { isActive: true } });
    const story = await Story.create({
      collectionId: collection ? collection.id : 1,
      title: request.title,
      slug: `${request.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story-request'}-${Date.now()}`,
      summary: request.description,
      translations: { ar: { title: request.title, summary: request.description }, en: { title: request.title, summary: request.description }, fr: { title: request.title, summary: request.description } },
      type: 'new',
      sourceBadge: 'historical_source',
      status: 'draft',
      authorId: req.user.id,
      sourceReferences: request.source ? [request.source] : [],
      isFree: false,
      tags: []
    });
    request.status = 'converted';
    request.convertedStoryId = story.id;
    await request.save();
    res.status(201).json({ story, request });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/community/badges/:id/awards', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const badge = await BadgeType.findByPk(parseId(req.params.id, 'Badge'));
    if (!badge) return res.status(404).json({ message: 'Badge introuvable.' });
    const awards = await BadgeAward.findAll({
      where: { badgeTypeId: badge.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['awardedAt', 'DESC']]
    });
    res.json(awards.map((award) => ({ id: award.id, user: award.user, sourceType: award.sourceType, sourceId: award.sourceId, awardedAt: award.awardedAt })));
  } catch (error) {
    next(error);
  }
});

router.get('/admin/community/reports', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const reports = await StoryReview.findAll({ where: { status: 'reported' }, order: [['createdAt', 'DESC']] });
    res.json(reports);
  } catch (error) {
    next(error);
  }
});

router.get('/reading-progress', authenticate, async (req, res, next) => {
  try {
    res.json(await ReadingProgress.findAll({
      where: { userId: req.user.id },
      include: [{ model: Story, as: 'story', attributes: ['id', 'title', 'slug', 'cover'] }],
      order: [['lastReadAt', 'DESC']]
    }));
  } catch (error) {
    next(error);
  }
});

router.put('/reading-progress/:storyId', authenticate, validateBody(schemas.readingProgressSchema), async (req, res, next) => {
  try {
    const storyId = parseId(req.params.storyId, 'Histoire');
    const story = await findPublishedStoryById(storyId);
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    const partIds = [...new Set(req.body.completedParts.map((id) => parseId(id, 'Partie')))];
    if (partIds.length > 500) return res.status(400).json({ message: 'Trop de parties terminées.' });
    const validPartIds = new Set(story.parts.map((part) => part.id));
    if (partIds.some((id) => !validPartIds.has(id))) {
      return res.status(400).json({ message: 'La progression contient une partie qui n’appartient pas à cette histoire.' });
    }
    const lastPartId = req.body.lastPartId == null ? null : parseId(req.body.lastPartId, 'Partie');
    if (lastPartId && !validPartIds.has(lastPartId)) {
      return res.status(400).json({ message: 'La dernière partie ne correspond pas à cette histoire.' });
    }
    for (const partId of [...new Set([...partIds, ...(lastPartId ? [lastPartId] : [])])]) {
      const part = story.parts.find((candidate) => candidate.id === partId);
      if (!await canAccessPart({ userId: req.user.id, role: req.user.role, story, part })) {
        return res.status(403).json({ message: 'La progression ne peut pas inclure une partie sans droit d’accès.' });
      }
    }
    const [progress] = await ReadingProgress.findOrCreate({
      where: { userId: req.user.id, storyId },
      defaults: { userId: req.user.id, storyId, completedParts: [], lastReadAt: new Date() }
    });
    progress.completedParts = partIds;
    progress.lastPartId = lastPartId;
    progress.lastReadAt = new Date();
    await progress.save();
    const isComplete = story.parts.length > 0 && story.parts.every((part) => partIds.includes(part.id));
    if (isComplete) {
      const awarded = await ensureBadgeAward(req.user.id, 'story-complete', 'story', story.id, { storyId: story.id, completedParts: partIds });
      const certificate = await maybeIssueCertificate({
        userId: req.user.id,
        badgeTypeId: awarded.badgeTypeId,
        title: `Certificate: ${story.title}`,
        storyId: story.id
      });
      if (certificate) {
        await ensureBadgeAward(req.user.id, 'story-certificate', 'story', story.id, { certificateId: certificate.certificate.id, storyId: story.id });
      }
    }
    res.json(progress);
  } catch (error) {
    next(error);
  }
});

async function findPublishedStoryById(id) {
  return Story.findOne({
    where: { id, status: 'published' },
    include: [
      { model: Collection, as: 'collection' },
      { model: StoryPart, as: 'parts', attributes: ['id', 'partNumber', 'isFree', 'releaseAt', 'earlyAccessUntil'] }
    ]
  });
}

router.get('/admin/content/collections', ...contentEditors, async (req, res, next) => {
  try {
    res.json(await Collection.findAll({ order: [['sortOrder', 'ASC'], ['title', 'ASC']] }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/collections', ...contentEditors, validateBody(schemas.collectionSchema), async (req, res, next) => {
  try {
    const slug = contentSlug(req.body.slug, req.body.title, req.body.translations);
    await assertUniqueSlug(Collection, slug);
    const collection = await Collection.create({ ...req.body, slug });
    await recordAudit(req, 'CREATE_COLLECTION', 'Collection', collection.id);
    res.status(201).json(collection);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/collections/:id', ...contentEditors, validateBody(schemas.collectionSchema.partial()), async (req, res, next) => {
  try {
    const collection = await Collection.findByPk(parseId(req.params.id, 'Collection'));
    if (!collection) return res.status(404).json({ message: 'Collection introuvable.' });
    const values = { ...req.body };
    if (values.slug !== undefined || values.title !== undefined || values.translations !== undefined) {
      values.slug = contentSlug(values.slug || collection.slug, values.title || collection.title, values.translations || collection.translations);
      if (values.slug !== collection.slug) {
        const publishedContents = await Promise.all([
          Story.count({ where: { collectionId: collection.id, publishedAt: { [require('sequelize').Op.ne]: null } } }),
          Book.count({ where: { collectionId: collection.id, publishedAt: { [require('sequelize').Op.ne]: null } } })
        ]);
        if (publishedContents.some(Boolean)) {
          return res.status(409).json({ message: 'Le slug ne peut plus être modifié après publication de contenu dans cette collection.', code: 'SLUG_LOCKED' });
        }
        await assertUniqueSlug(Collection, values.slug, collection.id);
      }
    }
    await collection.update(values);
    await recordAudit(req, 'UPDATE_COLLECTION', 'Collection', collection.id);
    res.json(collection);
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/content/collections/:id', ...contentEditors, async (req, res, next) => {
  try {
    const collection = await Collection.findByPk(parseId(req.params.id, 'Collection'));
    if (!collection) return res.status(404).json({ message: 'Collection introuvable.' });
    const [storyCount, bookCount] = await Promise.all([
      Story.count({ where: { collectionId: collection.id } }),
      Book.count({ where: { collectionId: collection.id } })
    ]);
    if (storyCount || bookCount) {
      return res.status(409).json({ message: 'Cette collection contient encore des histoires ou des livres. Supprimez ou déplacez-les avant de supprimer la collection.' });
    }
    await recordAudit(req, 'DELETE_COLLECTION', 'Collection', collection.id, { slug: collection.slug });
    await collection.destroy();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/stories', ...contentEditors, async (req, res, next) => {
  try {
    res.json(await Story.findAll({
      include: [
        { model: Collection, as: 'collection' },
        { model: User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'], required: false },
        { model: StoryPart, as: 'parts' }
      ],
      order: [['updatedAt', 'DESC']]
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/review-queue', ...reviewers, async (req, res, next) => {
  try {
    const where = { status: 'in_review' };
    if (req.user.role === 'REVIEWER') where.reviewerId = req.user.id;
    res.json(await Story.findAll({
      where,
      include: [{ model: Collection, as: 'collection' }, { model: StoryPart, as: 'parts' }],
      order: [['updatedAt', 'ASC']]
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories', ...contentEditors, validateBody(schemas.storySchema), async (req, res, next) => {
  try {
    const slug = contentSlug(req.body.slug, req.body.title, req.body.translations);
    await assertUniqueSlug(Story, slug);
    const story = await Story.create({ ...req.body, slug, authorId: req.user.id, status: 'draft' });
    await recordAudit(req, 'CREATE_STORY', 'Story', story.id);
    res.status(201).json(story);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/stories/:id', ...contentEditors, validateBody(schemas.storySchema.partial()), async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'));
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    const values = { ...req.body };
    if (values.slug !== undefined || values.title !== undefined || values.translations !== undefined) {
      values.slug = contentSlug(values.slug || story.slug, values.title || story.title, values.translations || story.translations);
      if (values.slug !== story.slug && story.publishedAt) {
        return res.status(409).json({ message: 'Le slug ne peut plus être modifié après la première publication.', code: 'SLUG_LOCKED' });
      }
      await assertUniqueSlug(Story, values.slug, story.id);
    }
    const previousStatus = story.status;
    await story.update({
      ...values,
      ...(story.status === 'published' ? { status: 'in_review', approvedAt: null, publishedAt: story.publishedAt } : {})
    });
    await recordAudit(req, 'UPDATE_STORY', 'Story', story.id);
    if (previousStatus !== story.status) {
      await recordAudit(req, `STORY_${story.status.toUpperCase()}`, 'Story', story.id, { previousStatus });
    }
    res.json(story);
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/content/stories/:id', ...contentEditors, async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'));
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    if (!['draft', 'rejected', 'archived'].includes(story.status) || story.publishedAt) {
      return res.status(409).json({ message: 'Seules les histoires jamais publiées et hors révision peuvent être supprimées. Les histoires déjà publiées doivent être archivées.' });
    }
    await recordAudit(req, 'DELETE_STORY', 'Story', story.id, { slug: story.slug });
    await story.destroy();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.put('/admin/content/stories/:id/reviewer', ...contentEditors, async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'));
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    const reviewerId = parseId(req.body.reviewerId, 'Réviseur');
    const reviewer = await User.findOne({ where: { id: reviewerId, role: 'REVIEWER', status: 'ACTIVE' } });
    if (!reviewer) return res.status(400).json({ message: 'Le compte indiqué n’est pas un réviseur actif.' });
    story.reviewerId = reviewer.id;
    story.reviewerName = `${reviewer.firstName} ${reviewer.lastName}`;
    story.approvedAt = null;
    await story.save();
    await recordAudit(req, 'ASSIGN_STORY_REVIEWER', 'Story', story.id, { reviewerId });
    res.json(story);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/submit-review', ...contentEditors, async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'));
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    if (!['draft', 'rejected'].includes(story.status)) {
      return res.status(409).json({ message: 'Seules les brouillons ou les histoires rejetées peuvent être envoyées en révision.' });
    }
    story.status = 'in_review';
    story.approvedAt = null;
    await story.save();
    await recordAudit(req, 'SUBMIT_STORY_FOR_REVIEW', 'Story', story.id);
    res.json(story);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/review', ...publishers, validateBody(schemas.reviewSchema), async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'));
    if (!story || story.status !== 'in_review') {
      return res.status(404).json({ message: 'Histoire en attente de révision introuvable.' });
    }
    if (story.authorId === req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez pas réviser votre propre histoire.' });
    }
    const now = new Date();
    story.reviewedBy = req.user.id;
    story.reviewedAt = now;
    story.reviewerId = req.user.id;
    story.reviewerName = `${req.user.firstName} ${req.user.lastName}`.trim();
    if (req.body.decision === 'approved') {
      await publishStory(req, story);
    } else if (req.body.decision === 'rejected') {
      story.status = 'rejected';
      story.rejectionReason = req.body.comments;
      story.approvedAt = null;
      await story.save();
    } else {
      story.status = 'draft';
      story.approvedAt = null;
      story.rejectionReason = null;
      await story.save();
    }
    await ReviewerNote.create({
      storyId: story.id,
      reviewerId: req.user.id,
      status: req.body.decision === 'approved' ? 'approved' : 'changes_requested',
      comments: req.body.comments || ''
    });
    await recordAudit(req, `STORY_${story.status.toUpperCase()}`, 'Story', story.id, { decision: req.body.decision, comments: req.body.comments || null });
    res.json(story);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/publish', ...publishers, async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'), {
      include: [{ model: Collection, as: 'collection' }]
    });
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    await publishStory(req, story);
    await story.save();
    await recordAudit(req, 'PUBLISH_STORY', 'Story', story.id);
    res.json(story);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/unpublish', ...publishers, async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'));
    if (!story || story.status !== 'published') return res.status(404).json({ message: 'Histoire publiée introuvable.' });
    story.status = 'draft';
    story.approvedAt = null;
    await story.save();
    await recordAudit(req, 'STORY_UNPUBLISHED', 'Story', story.id);
    res.json(story);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/archive', ...publishers, async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'));
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    story.status = 'archived';
    await story.save();
    await recordAudit(req, 'STORY_ARCHIVED', 'Story', story.id);
    res.json(story);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/parts', ...contentEditors, validateBody(schemas.partSchema), async (req, res, next) => {
  try {
    const storyId = parseId(req.params.id, 'Histoire');
    const story = await Story.findByPk(storyId);
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    const existing = await StoryPart.findOne({
      where: { storyId, partNumber: req.body.partNumber }
    });
    if (existing) throw partNumberConflict(existing);
    const part = await StoryPart.create({ ...req.body, storyId });
    await sendPublishedStoryBackToReview(req, story);
    await recordAudit(req, 'CREATE_STORY_PART', 'StoryPart', part.id, { storyId });
    res.status(201).json(part);
  } catch (error) {
    if (isPartNumberUniqueError(error) && req.body.partNumber !== undefined) {
      const existing = await StoryPart.findOne({
        where: { storyId: Number(req.params.id), partNumber: req.body.partNumber }
      });
      if (existing) return next(partNumberConflict(existing));
    }
    next(error);
  }
});

router.patch('/admin/content/parts/:id', ...contentEditors, validateBody(schemas.partSchema.partial()), async (req, res, next) => {
  try {
    const part = await StoryPart.findByPk(parseId(req.params.id, 'Partie'));
    if (!part) return res.status(404).json({ message: 'Partie introuvable.' });
    if (req.body.partNumber !== undefined && req.body.partNumber !== part.partNumber) {
      const existing = await StoryPart.findOne({
        where: { storyId: part.storyId, partNumber: req.body.partNumber }
      });
      if (existing) throw partNumberConflict(existing);
    }
    await part.update(req.body);
    const story = await Story.findByPk(part.storyId);
    await sendPublishedStoryBackToReview(req, story);
    await recordAudit(req, 'UPDATE_STORY_PART', 'StoryPart', part.id);
    res.json(part);
  } catch (error) {
    if (isPartNumberUniqueError(error) && req.body.partNumber !== undefined) {
      const part = await StoryPart.findByPk(Number(req.params.id));
      const existing = part && await StoryPart.findOne({
        where: { storyId: part.storyId, partNumber: req.body.partNumber }
      });
      if (existing) return next(partNumberConflict(existing));
    }
    next(error);
  }
});

router.post('/admin/content/parts/:id/move', ...contentEditors, async (req, res, next) => {
  try {
    const partId = parseId(req.params.id, 'Partie');
    if (!['up', 'down'].includes(req.body.direction)) {
      return res.status(400).json({ message: 'Choisissez un déplacement valide.' });
    }
    const result = await sequelize.transaction(async (transaction) => {
      const part = await StoryPart.findByPk(partId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!part) return null;
      const parts = await StoryPart.findAll({
        where: { storyId: part.storyId },
        order: [['partNumber', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const index = parts.findIndex((entry) => entry.id === part.id);
      const targetIndex = index + (req.body.direction === 'up' ? -1 : 1);
      if (index < 0 || targetIndex < 0 || targetIndex >= parts.length) {
        return { parts, storyId: part.storyId, changed: false };
      }
      [parts[index], parts[targetIndex]] = [parts[targetIndex], parts[index]];
      for (let position = 0; position < parts.length; position += 1) {
        await parts[position].update({ partNumber: -(position + 1) }, { transaction });
      }
      for (let position = 0; position < parts.length; position += 1) {
        await parts[position].update({ partNumber: position + 1 }, { transaction });
      }
      return { parts, storyId: part.storyId, changed: true };
    });
    if (!result) return res.status(404).json({ message: 'Partie introuvable.' });
    if (!result.changed) return res.json(result.parts);
    const story = await Story.findByPk(result.storyId);
    await sendPublishedStoryBackToReview(req, story);
    await recordAudit(req, 'REORDER_STORY_PARTS', 'StoryPart', Number(req.params.id), {
      direction: req.body.direction
    });
    res.json(result.parts);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/parts/:id/duplicate', ...contentEditors, async (req, res, next) => {
  try {
    const part = await StoryPart.findByPk(parseId(req.params.id, 'Partie'));
    if (!part) return res.status(404).json({ message: 'Partie introuvable.' });
    const nextPartNumber = (await StoryPart.max('partNumber', { where: { storyId: part.storyId } }) || 0) + 1;
    const duplicate = await StoryPart.create({
      storyId: part.storyId,
      partNumber: nextPartNumber,
      title: part.title,
      content: part.content,
      translations: part.translations,
      estimatedReadingMinutes: part.estimatedReadingMinutes,
      endingHook: part.endingHook,
      isFree: part.isFree,
      releaseAt: part.releaseAt,
      earlyAccessUntil: part.earlyAccessUntil
    });
    const story = await Story.findByPk(part.storyId);
    await sendPublishedStoryBackToReview(req, story);
    await recordAudit(req, 'DUPLICATE_STORY_PART', 'StoryPart', duplicate.id, {
      sourcePartId: part.id
    });
    res.status(201).json(duplicate);
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/content/parts/:id', ...contentEditors, async (req, res, next) => {
  try {
    const partId = parseId(req.params.id, 'Partie');
    const storyId = await sequelize.transaction(async (transaction) => {
      const part = await StoryPart.findByPk(partId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!part) return null;
      await Quiz.destroy({ where: { partId }, transaction });
      await part.destroy({ transaction });
      return part.storyId;
    });
    if (!storyId) return res.status(404).json({ message: 'Partie introuvable.' });
    const story = await Story.findByPk(storyId);
    await sendPublishedStoryBackToReview(req, story);
    await recordAudit(req, 'DELETE_STORY_PART', 'StoryPart', partId, { storyId });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/videos', ...contentEditors, validateBody(schemas.videoSchema), async (req, res, next) => {
  try {
    const storyId = parseId(req.params.id, 'Histoire');
    if (!await Story.findByPk(storyId)) return res.status(404).json({ message: 'Histoire introuvable.' });
    if (req.body.partId && !await StoryPart.findOne({ where: { id: req.body.partId, storyId } })) {
      return res.status(400).json({ message: 'La partie vidéo ne correspond pas à cette histoire.' });
    }
    if (req.body.mediaAssetId) {
      const mediaAsset = await MediaAsset.findByPk(req.body.mediaAssetId);
      if (!mediaAsset || mediaAsset.mediaType !== 'video' || !mediaAsset.storageKey || mediaAsset.metadata?.uploadPending) {
        return res.status(400).json({ message: 'Le fichier vidéo sélectionné est introuvable ou incomplet.' });
      }
      if (mediaAsset.storyId && mediaAsset.storyId !== storyId) {
        return res.status(400).json({ message: 'Le fichier vidéo est déjà associé à une autre histoire.' });
      }
      await mediaAsset.update({ storyId, partId: req.body.partId || null });
    }
    const video = await StoryVideo.create({ ...req.body, storyId, authorId: req.user.id, status: 'draft' });
    await recordAudit(req, 'CREATE_STORY_VIDEO', 'StoryVideo', video.id, { storyId });
    res.status(201).json(video);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/videos/:id', ...contentEditors, validateBody(schemas.videoUpdateSchema), async (req, res, next) => {
  try {
    const video = await StoryVideo.findByPk(parseId(req.params.id, 'Vidéo'));
    if (!video) return res.status(404).json({ message: 'Vidéo introuvable.' });
    if (req.body.partId &&
      !await StoryPart.findOne({ where: { id: req.body.partId, storyId: video.storyId } })) {
      return res.status(400).json({ message: 'La partie vidéo ne correspond pas à cette histoire.' });
    }
    if (req.body.mediaAssetId) {
      const mediaAsset = await MediaAsset.findByPk(req.body.mediaAssetId);
      if (!mediaAsset || mediaAsset.mediaType !== 'video' || !mediaAsset.storageKey || mediaAsset.metadata?.uploadPending) {
        return res.status(400).json({ message: 'Le fichier vidéo sélectionné est introuvable ou incomplet.' });
      }
      if (mediaAsset.storyId && mediaAsset.storyId !== video.storyId) {
        return res.status(400).json({ message: 'Le fichier vidéo est déjà associé à une autre histoire.' });
      }
      await mediaAsset.update({ storyId: video.storyId, partId: req.body.partId || video.partId });
    }
    const videoUrl = req.body.videoUrl === undefined ? video.videoUrl : req.body.videoUrl;
    const mediaAssetId = req.body.mediaAssetId === undefined ? video.mediaAssetId : req.body.mediaAssetId;
    if (!videoUrl && !mediaAssetId) {
      return res.status(400).json({ message: 'Un fichier vidéo ou un lien YouTube/Vimeo est requis.' });
    }
    await video.update(req.body);
    const story = await Story.findByPk(video.storyId);
    await sendPublishedStoryBackToReview(req, story);
    await recordAudit(req, 'UPDATE_STORY_VIDEO', 'StoryVideo', video.id);
    res.json(video);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/videos', ...contentEditors, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.storyId) where.storyId = parseId(req.query.storyId, 'Histoire');
    const query = String(req.query.q || '').trim();
    if (query) {
      where[Op.or] = [
        { title: { [Op.like]: `%${query}%` } },
        { '$story.title$': { [Op.like]: `%${query}%` } }
      ];
    }
    const result = await StoryVideo.findAndCountAll({
      where,
      include: [{
        model: Story,
        as: 'story',
        attributes: ['id', 'title', 'slug']
      }],
      order: [['updatedAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/videos/:id/submit-review', ...contentEditors, async (req, res, next) => {
  try {
    const video = await StoryVideo.findByPk(parseId(req.params.id, 'Vidéo'));
    if (!video) return res.status(404).json({ message: 'Vidéo introuvable.' });
    if (!video.title?.trim() || !video.videoUrl || !video.depictionPolicyConfirmed) {
      return res.status(409).json({ message: 'Le titre arabe, la vidéo et la validation de la politique de représentation sont requis.' });
    }
    video.status = 'in_review';
    video.rejectionReason = null;
    await video.save();
    await recordAudit(req, 'SUBMIT_STORY_VIDEO_FOR_REVIEW', 'StoryVideo', video.id);
    res.json(video);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/videos/:id/review', ...publishers, validateBody(schemas.reviewSchema), async (req, res, next) => {
  try {
    const video = await StoryVideo.findByPk(parseId(req.params.id, 'Vidéo'));
    if (!video) return res.status(404).json({ message: 'Vidéo introuvable.' });
    if (video.status !== 'in_review') return res.status(409).json({ message: 'La vidéo doit être en révision.' });
    if (video.authorId === req.user.id) return res.status(403).json({ message: 'Vous ne pouvez pas approuver votre propre vidéo.' });
    const rejected = req.body.decision === 'rejected';
    if (rejected && !req.body.comments.trim()) return res.status(400).json({ message: 'Un commentaire est obligatoire pour rejeter une vidéo.' });
    video.status = req.body.decision === 'approved' ? 'published' : req.body.decision === 'return_to_draft' ? 'draft' : 'rejected';
    video.reviewedBy = req.user.id;
    video.reviewedAt = new Date();
    video.rejectionReason = rejected ? req.body.comments.trim() : null;
    if (video.status === 'published' && !video.videoUrl) return res.status(409).json({ message: 'Une vidéo doit avoir une URL avant sa publication.' });
    await video.save();
    await recordAudit(req, `STORY_VIDEO_${video.status.toUpperCase()}`, 'StoryVideo', video.id, { comments: req.body.comments || null });
    res.json(video);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/quizzes', ...contentEditors, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.storyId) where.storyId = parseId(req.query.storyId, 'Histoire');
    if (req.query.search) {
      const search = `%${String(req.query.search).trim().slice(0, 100)}%`;
      where[Op.or] = [{ title: { [Op.like]: search } }, { slug: { [Op.like]: search } }];
    }
    const result = await Quiz.findAndCountAll({
      where,
      include: [
        { model: Story, as: 'story', attributes: ['id', 'title', 'slug'] },
        { model: StoryPart, as: 'part', attributes: ['id', 'partNumber', 'title'] }
      ],
      order: [['updatedAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/quizzes/:id/questions', ...contentEditors, validateBody(schemas.questionSchema), async (req, res, next) => {
  try {
    const quiz = await Quiz.findByPk(parseId(req.params.id, 'Quiz'));
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    const count = await Question.count({ where: { quizId: quiz.id } });
    if (count >= 100) return res.status(409).json({ message: 'Un quiz ne peut pas contenir plus de 100 questions.' });
    const { question: values, answerOptions } = questionRecordValues(req.body, quiz.id, count);
    const question = await sequelize.transaction(async (transaction) => {
      const created = await Question.create(values, { transaction });
      await QuizOption.bulkCreate(answerOptions.map((option, index) => ({
        questionId: created.id,
        text: option.translations?.ar || option.text,
        translations: option.translations || { ar: option.text },
        isCorrect: Boolean(option.isCorrect),
        sortOrder: option.sortOrder ?? index
      })), { transaction });
      quiz.status = 'draft';
      quiz.validationStatus = 'draft';
      await quiz.save({ transaction });
      return created;
    });
    await recordAudit(req, 'CREATE_QUIZ_QUESTION', 'Question', question.id, { quizId: quiz.id });
    res.status(201).json(question);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/quizzes/:id', ...contentEditors, async (req, res, next) => {
  try {
    const quiz = await Quiz.findByPk(parseId(req.params.id, 'Quiz'), {
      include: [{ model: Story, as: 'story', attributes: ['id', 'title', 'slug'] }, quizQuestionInclude()]
    });
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    res.json(quiz);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/quizzes/:id/stats', ...contentEditors, async (req, res, next) => {
  try {
    const quiz = await Quiz.findByPk(parseId(req.params.id, 'Quiz'), {
      include: [quizQuestionInclude()]
    });
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    const attempts = await QuizAttempt.findAll({
      where: { quizId: quiz.id, completedAt: { [Op.ne]: null } },
      attributes: ['answers', 'score', 'passed']
    });
    const hardestQuestions = quiz.questions.map((question) => {
      const options = question.answerOptions || [];
      const correctIds = options.filter((option) => option.isCorrect).map((option) => String(option.id)).sort();
      const responses = attempts.filter((attempt) => {
        const answer = attempt.answers?.[question.id] ?? attempt.answers?.[String(question.id)];
        return answer !== undefined;
      });
      const correct = responses.filter((attempt) => {
        const answer = attempt.answers?.[question.id] ?? attempt.answers?.[String(question.id)];
        const selected = (Array.isArray(answer) ? answer : [answer]).map(String).sort();
        return selected.length === correctIds.length && selected.every((id, index) => id === correctIds[index]);
      }).length;
      return {
        questionId: question.id,
        text: question.text,
        attempts: responses.length,
        correctRate: responses.length ? Math.round((correct / responses.length) * 100) : null
      };
    }).sort((left, right) => (left.correctRate ?? 101) - (right.correctRate ?? 101)).slice(0, 5);
    res.json({
      attempts: attempts.length,
      averageScore: attempts.length
        ? Math.round(attempts.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0) / attempts.length)
        : null,
      passRate: attempts.length
        ? Math.round((attempts.filter((attempt) => attempt.passed).length / attempts.length) * 100)
        : null,
      hardestQuestions
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/quizzes', ...contentEditors, validateBody(schemas.quizContentSchema), async (req, res, next) => {
  try {
    const { questions, ...input } = req.body;
    const story = await Story.findByPk(input.storyId);
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    if (input.partId && !await StoryPart.findOne({ where: { id: input.partId, storyId: input.storyId } })) {
      return res.status(400).json({ message: 'La partie ne correspond pas à cette histoire.' });
    }
    const translations = input.translations || { ar: { title: input.title, description: input.description || '' } };
    const title = translations.ar?.title || input.title;
    const slug = contentSlug(input.slug, translations.en?.title || title, translations);
    await assertUniqueQuizSlug(slug);
    const quiz = await sequelize.transaction(async (transaction) => {
      const created = await Quiz.create({
        ...input,
        title,
        description: translations.ar?.description || input.description || '',
        translations,
        slug,
        status: 'draft',
        validationStatus: 'draft',
        authorId: req.user.id
      }, { transaction });
      await saveQuizQuestions(created.id, questions, transaction);
      return created;
    });
    await recordAudit(req, 'CREATE_QUIZ', 'Quiz', quiz.id, { storyId: story.id });
    res.status(201).json(quiz);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/quizzes', ...contentEditors, validateBody(schemas.quizSchema), async (req, res, next) => {
  try {
    const storyId = parseId(req.params.id, 'Histoire');
    const story = await Story.findByPk(storyId);
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    const partId = req.body.partId == null ? null : req.body.partId;
    if (partId && !await StoryPart.findOne({ where: { id: partId, storyId } })) {
      return res.status(400).json({ message: 'La partie ne correspond pas à cette histoire.' });
    }
    const translations = req.body.translations || { ar: { title: req.body.title, description: req.body.description || '' } };
    const slug = contentSlug(req.body.slug, translations.en?.title || req.body.title, translations);
    await assertUniqueQuizSlug(slug);
    const quiz = await Quiz.create({
      ...req.body,
      title: translations.ar?.title || req.body.title,
      description: translations.ar?.description || req.body.description || '',
      translations,
      slug,
      storyId,
      status: 'draft',
      validationStatus: 'draft',
      authorId: req.user.id
    });
    await recordAudit(req, 'CREATE_QUIZ', 'Quiz', quiz.id, { storyId });
    res.status(201).json(quiz);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/quizzes/:id', ...contentEditors, validateBody(schemas.quizContentSchema), async (req, res, next) => {
  try {
    const quizId = parseId(req.params.id, 'Quiz');
    const quiz = await Quiz.findByPk(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    const { questions, ...input } = req.body;
    const story = await Story.findByPk(input.storyId);
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    if (input.partId && !await StoryPart.findOne({ where: { id: input.partId, storyId: input.storyId } })) {
      return res.status(400).json({ message: 'La partie ne correspond pas à cette histoire.' });
    }
    const translations = input.translations || quiz.translations || { ar: { title: input.title, description: input.description || '' } };
    const title = translations.ar?.title || input.title;
    const slug = contentSlug(input.slug, translations.en?.title || title, translations);
    await assertUniqueQuizSlug(slug, quiz.id);
    await sequelize.transaction(async (transaction) => {
      await quiz.update({
        ...input,
        title,
        description: translations.ar?.description || input.description || '',
        translations,
        slug,
        status: 'draft',
        validationStatus: 'draft',
        rejectionReason: null
      }, { transaction });
      await saveQuizQuestions(quiz.id, questions, transaction);
    });
    await recordAudit(req, 'UPDATE_QUIZ', 'Quiz', quiz.id);
    res.json(await Quiz.findByPk(quiz.id, { include: [quizQuestionInclude()] }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/quizzes/:id/submit-review', ...contentEditors, async (req, res, next) => {
  try {
    const quiz = await Quiz.findByPk(parseId(req.params.id, 'Quiz'), {
      include: [quizQuestionInclude()]
    });
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    const missing = quizSubmissionRequirements(quiz, quiz.questions);
    if (missing.length) {
      return res.status(409).json({ message: 'Le quiz ne peut pas être envoyé en révision.', requirements: missing });
    }
    await assertUniqueQuizSlug(quiz.slug, quiz.id);
    quiz.status = 'in_review';
    quiz.validationStatus = 'draft';
    quiz.rejectionReason = null;
    await quiz.save();
    await recordAudit(req, 'QUIZ_SUBMITTED_FOR_REVIEW', 'Quiz', quiz.id);
    res.json(quiz);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/quizzes/:id/review', ...publishers, validateBody(schemas.quizReviewSchema), async (req, res, next) => {
  try {
    const quiz = await Quiz.findByPk(parseId(req.params.id, 'Quiz'), {
      include: [quizQuestionInclude()]
    });
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    if (quiz.status !== 'in_review') return res.status(409).json({ message: 'Seuls les quiz en révision peuvent être examinés.' });
    if (req.body.decision === 'approved' && quiz.authorId === req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez pas approuver votre propre quiz.' });
    }
    if (req.body.decision === 'approved') {
      const missing = quizSubmissionRequirements(quiz, quiz.questions);
      if (missing.length) return res.status(409).json({ message: 'Le quiz ne peut pas être publié.', requirements: missing });
      quiz.status = 'published';
      quiz.validationStatus = 'validated';
      quiz.publishedAt = quiz.publishedAt || new Date();
      quiz.rejectionReason = null;
    } else if (req.body.decision === 'rejected') {
      quiz.status = 'rejected';
      quiz.validationStatus = 'draft';
      quiz.rejectionReason = req.body.comments;
    } else {
      quiz.status = 'draft';
      quiz.validationStatus = 'draft';
      quiz.rejectionReason = null;
    }
    quiz.reviewedBy = req.user.id;
    quiz.reviewedAt = new Date();
    await quiz.save();
    await recordAudit(req, `QUIZ_${quiz.status.toUpperCase()}`, 'Quiz', quiz.id, { comments: req.body.comments || null });
    res.json(quiz);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/quizzes/:id/unpublish', ...publishers, async (req, res, next) => {
  try {
    const quiz = await Quiz.findByPk(parseId(req.params.id, 'Quiz'));
    if (!quiz || quiz.status !== 'published') return res.status(404).json({ message: 'Quiz publié introuvable.' });
    quiz.status = 'archived';
    quiz.validationStatus = 'draft';
    await quiz.save();
    await recordAudit(req, 'QUIZ_UNPUBLISHED', 'Quiz', quiz.id);
    res.json(quiz);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/quizzes/:id/duplicate', ...contentEditors, async (req, res, next) => {
  try {
    const source = await Quiz.findByPk(parseId(req.params.id, 'Quiz'), { include: [quizQuestionInclude()] });
    if (!source) return res.status(404).json({ message: 'Quiz introuvable.' });
    const slugBase = source.slug.slice(0, 240);
    let slug = `${slugBase}-copy`;
    let suffix = 2;
    while (await Quiz.findOne({ where: { slug } }) || await Story.findOne({ where: { slug } }) ||
      await Collection.findOne({ where: { slug } }) || await Book.findOne({ where: { slug } })) {
      slug = `${slugBase}-copy-${suffix++}`;
    }
    const duplicate = await sequelize.transaction(async (transaction) => {
      const attributes = Object.keys(Quiz.rawAttributes).filter((key) =>
        !['id', 'createdAt', 'updatedAt'].includes(key)
      );
      const values = Object.fromEntries(attributes.map((key) => [key, source.get(key)]));
      const created = await Quiz.create({
        ...values,
        slug,
        status: 'draft',
        validationStatus: 'draft',
        authorId: req.user.id,
        reviewedBy: null,
        reviewedAt: null,
        publishedAt: null,
        rejectionReason: null
      }, { transaction });
      await saveQuizQuestions(created.id, source.questions.map((question) => ({
        ...question.toJSON(),
        id: undefined,
        answerOptions: question.answerOptions.map((option) => {
          const { id: _optionId, ...optionValues } = option.toJSON();
          return optionValues;
        })
      })), transaction);
      return created;
    });
    await recordAudit(req, 'DUPLICATE_QUIZ', 'Quiz', duplicate.id, { sourceQuizId: source.id });
    res.status(201).json(duplicate);
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/content/quizzes/:id', ...contentEditors, async (req, res, next) => {
  try {
    const quiz = await Quiz.findByPk(parseId(req.params.id, 'Quiz'));
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    if (quiz.status === 'published' || quiz.publishedAt) {
      return res.status(409).json({ message: 'Un quiz déjà publié ne peut pas être supprimé.' });
    }
    if (await QuizAttempt.count({ where: { quizId: quiz.id } })) {
      return res.status(409).json({ message: 'Un quiz ayant des tentatives ne peut pas être supprimé.' });
    }
    await quiz.destroy();
    await recordAudit(req, 'DELETE_QUIZ', 'Quiz', quiz.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/books', ...contentEditors, async (req, res, next) => {
  try {
    res.json(await Book.findAll({ order: [['createdAt', 'DESC']] }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/books', ...contentEditors, validateBody(schemas.bookSchema), async (req, res, next) => {
  try {
    const slug = contentSlug(req.body.slug, req.body.title, req.body.translations);
    await assertUniqueSlug(Book, slug);
    const bookFields = { ...req.body };
    delete bookFields.isPublished;
    const book = await Book.create({ ...bookFields, slug, isPublished: false, status: 'draft' });
    await recordAudit(req, 'CREATE_BOOK', 'Book', book.id);
    res.status(201).json(book);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/books/:id', ...contentEditors, validateBody(schemas.bookSchema.partial()), async (req, res, next) => {
  try {
    const book = await Book.findByPk(parseId(req.params.id, 'Livre'));
    if (!book) return res.status(404).json({ message: 'Livre introuvable.' });
    const values = { ...req.body };
    if (values.status !== undefined || values.isPublished !== undefined) {
      return res.status(403).json({ message: 'Utilisez les actions de publication du tableau de bord.', code: 'STATUS_ACTION_REQUIRED' });
    }
    if (values.slug !== undefined || values.title !== undefined || values.translations !== undefined) {
      values.slug = contentSlug(values.slug || book.slug, values.title || book.title, values.translations || book.translations);
      if (values.slug !== book.slug && book.publishedAt) {
        return res.status(409).json({ message: 'Le slug ne peut plus être modifié après la première publication.', code: 'SLUG_LOCKED' });
      }
      await assertUniqueSlug(Book, values.slug, book.id);
    }
    await book.update(values);
    await recordAudit(req, 'UPDATE_BOOK', 'Book', book.id);
    res.json(book);
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/content/books/:id', ...contentEditors, async (req, res, next) => {
  try {
    const book = await Book.findByPk(parseId(req.params.id, 'Livre'));
    if (!book) return res.status(404).json({ message: 'Livre introuvable.' });
    if (book.status === 'published' || book.publishedAt || book.isPublished) {
      return res.status(409).json({ message: 'Un livre déjà publié ne peut pas être supprimé. Dépubliez-le ou archivez-le.' });
    }
    if (await StoreOrderItem.count({ where: { bookId: book.id } })) {
      return res.status(409).json({ message: 'Ce livre est référencé dans l’historique des commandes et ne peut pas être supprimé.' });
    }
    await recordAudit(req, 'DELETE_BOOK', 'Book', book.id, { slug: book.slug });
    await book.destroy();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/books/:id/publish', ...publishers, async (req, res, next) => {
  try {
    const book = await Book.findByPk(parseId(req.params.id, 'Livre'));
    if (!book) return res.status(404).json({ message: 'Livre introuvable.' });
    const missing = [];
    if (!book.title?.trim()) missing.push('Arabic title');
    if (book.format === 'ebook' && !book.fileStorageKey) missing.push('PDF file');
    await assertUniqueSlug(Book, book.slug, book.id).catch((error) => {
      if (error.code === 'SLUG_CONFLICT') missing.push('unique slug');
      else throw error;
    });
    if (missing.length) {
      return res.status(409).json({
        message: `Publication impossible. Éléments manquants : ${missing.join(', ')}.`,
        code: 'PUBLISH_REQUIREMENTS',
        missing
      });
    }
    book.status = 'published';
    book.isPublished = true;
    book.publishedAt = book.publishedAt || new Date();
    await book.save();
    await recordAudit(req, 'BOOK_PUBLISHED', 'Book', book.id);
    res.json(book);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/books/:id/unpublish', ...publishers, async (req, res, next) => {
  try {
    const book = await Book.findByPk(parseId(req.params.id, 'Livre'));
    if (!book || book.status !== 'published') return res.status(404).json({ message: 'Livre publié introuvable.' });
    book.status = 'draft';
    book.isPublished = false;
    await book.save();
    await recordAudit(req, 'BOOK_UNPUBLISHED', 'Book', book.id);
    res.json(book);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/books/:id/archive', ...publishers, async (req, res, next) => {
  try {
    const book = await Book.findByPk(parseId(req.params.id, 'Livre'));
    if (!book) return res.status(404).json({ message: 'Livre introuvable.' });
    book.status = 'archived';
    book.isPublished = false;
    await book.save();
    await recordAudit(req, 'BOOK_ARCHIVED', 'Book', book.id);
    res.json(book);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/media', ...contentEditors, validateBody(schemas.mediaSchema), async (req, res, next) => {
  try {
    if (req.body.partId) {
      const part = await StoryPart.findByPk(req.body.partId);
      if (!part || req.body.storyId && part.storyId !== req.body.storyId) {
        return res.status(400).json({ message: 'La partie sélectionnée ne correspond pas à l’histoire indiquée.' });
      }
    }
    if (req.body.storyId && !await Story.findByPk(req.body.storyId)) {
      return res.status(400).json({ message: 'Histoire introuvable.' });
    }
    if (req.body.bookId) {
      const book = await Book.findByPk(req.body.bookId);
      if (!book) return res.status(400).json({ message: 'Livre introuvable.' });
      if (req.body.mediaType === 'ebook' && book.format !== 'ebook') {
        return res.status(400).json({ message: 'Un fichier ebook ne peut être rattaché qu’à un livre numérique.' });
      }
    }
    const media = await MediaAsset.create({ ...req.body, uploadedBy: req.user.id });
    await recordAudit(req, 'CREATE_MEDIA_ASSET', 'MediaAsset', media.id);
    res.status(201).json(media);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/media/upload-url', ...contentEditors, validateBody(schemas.mediaUploadSchema), async (req, res, next) => {
  try {
    const maxBytes = getMaxDocumentBytes();
    if (req.body.partId) {
      const part = await StoryPart.findByPk(req.body.partId);
      if (!part || req.body.storyId && part.storyId !== req.body.storyId) {
        return res.status(400).json({ message: 'La partie sélectionnée ne correspond pas à l’histoire indiquée.' });
      }
    }
    if (req.body.storyId && !await Story.findByPk(req.body.storyId)) {
      return res.status(400).json({ message: 'Histoire introuvable.' });
    }
    if (req.body.bookId) {
      const book = await Book.findByPk(req.body.bookId);
      if (!book) return res.status(400).json({ message: 'Livre introuvable.' });
      if (req.body.mediaType === 'ebook' && book.format !== 'ebook') {
        return res.status(400).json({ message: 'Un fichier ebook ne peut être rattaché qu’à un livre numérique.' });
      }
    }
    const uploadKey = createMediaUploadKey();
    const storageKey = createMediaKey();
    const media = await MediaAsset.create({
      ...req.body,
      storageKey,
      uploadedBy: req.user.id,
      metadata: { uploadKey, uploadPending: true, altText: req.body.altText || {} }
    });
    let upload;
    try {
      upload = await createMediaUploadForm({
        key: uploadKey,
        mimeType: req.body.mimeType,
        localUploadUrl: `/admin/content/media/${media.id}/upload`
      });
    } catch (error) {
      await media.destroy();
      throw error;
    }
    await recordAudit(req, 'REQUEST_MEDIA_UPLOAD', 'MediaAsset', media.id);
    res.status(201).json({
      mediaId: media.id,
      upload,
      completeUrl: `/admin/content/media/${media.id}/complete`,
      maxBytes
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/media/:id/upload', ...contentEditors, uploadLocalMedia, async (req, res, next) => {
  const temporaryPath = req.file?.path;
  try {
    const media = await MediaAsset.findByPk(parseId(req.params.id, 'Média'));
    if (!media || media.uploadedBy !== req.user.id) {
      return res.status(404).json({ message: 'Média introuvable.' });
    }
    if (getStorageDriver() !== 'local' || !isLocalStorageKey(media.storageKey)) {
      return res.status(409).json({ message: 'Ce média doit être envoyé vers le stockage configuré.' });
    }
    if (!media.metadata?.uploadPending || !media.metadata.uploadKey) {
      return res.status(409).json({ message: 'Ce dépôt est déjà finalisé ou ne possède pas de fichier en attente.' });
    }
    if (!req.file) {
      throw uploadError('No file was selected.', 400, 'INVALID_UPLOAD');
    }
    if (!mediaUploadMatches({
      filePath: req.file.path,
      mimeType: media.mimeType,
      mediaType: media.mediaType
    })) {
      throw uploadError('The uploaded file content does not match the selected media type.', 400, 'INVALID_UPLOAD');
    }
    if (req.file.size > getMaxDocumentBytes()) {
      throw uploadError('The uploaded file exceeds the configured limit.', 413, 'UPLOAD_TOO_LARGE');
    }
    await storeLocalUploadFile({ sourcePath: req.file.path, key: media.metadata.uploadKey });
    res.status(201).json({ uploaded: true });
  } catch (error) {
    next(error);
  } finally {
    if (temporaryPath) {
      try {
        await fs.promises.rm(temporaryPath, { force: true });
      } catch (cleanupError) {
        console.error('Échec du nettoyage du fichier temporaire :', cleanupError);
      }
    }
  }
});

router.post('/admin/content/media/:id/complete', ...contentEditors, async (req, res, next) => {
  try {
    const media = await MediaAsset.findByPk(parseId(req.params.id, 'Média'));
    if (!media || media.uploadedBy !== req.user.id) {
      return res.status(404).json({ message: 'Média introuvable.' });
    }
    if (!media.metadata?.uploadPending || !media.metadata.uploadKey) {
      return res.status(409).json({ message: 'Ce dépôt est déjà finalisé ou ne possède pas de fichier en attente.' });
    }
    const metadata = await getDocumentMetadata(media.metadata.uploadKey);
    const fileSize = Number(metadata.ContentLength);
    if (!metadata.ETag || !Number.isFinite(fileSize) || fileSize < 1 ||
      fileSize > getMaxDocumentBytes() || metadata.ContentType !== media.mimeType ||
      metadata.DetectedContentType !== media.mimeType) {
      throw uploadError('The uploaded file failed type or size validation.', 400, 'INVALID_UPLOAD');
    }
    await promoteUploadedMedia({
      sourceKey: media.metadata.uploadKey,
      destinationKey: media.storageKey,
      etag: metadata.ETag
    });
    await deleteDocumentObject(media.metadata.uploadKey);
    media.metadata = { ...media.metadata, uploadPending: false, uploadKey: undefined };
    await media.save();
    if (media.bookId && media.mediaType === 'ebook') {
      const book = await Book.findByPk(media.bookId);
      if (!book) return res.status(409).json({ message: 'Le livre associé à ce dépôt n’existe plus.' });
      const previousStorageKey = book.fileStorageKey;
      book.fileStorageKey = media.storageKey;
      await book.save();
      if (previousStorageKey && previousStorageKey !== media.storageKey &&
        previousStorageKey !== SAMPLE_EBOOK_STORAGE_KEY) {
        const previousMedia = await MediaAsset.findOne({
          where: { bookId: book.id, storageKey: previousStorageKey }
        });
        if (previousMedia) await previousMedia.destroy();
        await deleteDocumentObject(previousStorageKey);
      }
    }
    const storyId = media.storyId || (media.partId && (await StoryPart.findByPk(media.partId))?.storyId);
    if (storyId) {
      const story = await Story.findByPk(storyId);
      if (story?.status === 'published') {
        story.status = 'in_review';
        story.approvedAt = null;
        await story.save();
      }
    }
    await recordAudit(req, 'COMPLETE_MEDIA_UPLOAD', 'MediaAsset', media.id, {
      fileSize: Number(metadata.ContentLength),
      mimeType: metadata.ContentType
    });
    res.json(media);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/media', ...contentEditors, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const where = {};
    if (req.query.mediaType) where.mediaType = req.query.mediaType;
    if (req.query.q) where.fileName = { [Op.like]: `%${String(req.query.q).trim()}%` };
    const result = await MediaAsset.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });
    res.json({ items: result.rows, total: result.count, page, limit });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/content/media/:id', ...contentEditors, async (req, res, next) => {
  try {
    const media = await MediaAsset.findByPk(parseId(req.params.id, 'Média'));
    if (!media) return res.status(404).json({ message: 'Média introuvable.' });
    const usedBy = await Promise.all([
      StoryVideo.count({ where: { mediaAssetId: media.id } }),
      Story.count({ where: { cover: `/media-assets/${media.id}/url` } }),
      Book.count({ where: { cover: `/media-assets/${media.id}/url` } })
    ]);
    if (usedBy.some((count) => count > 0) || media.storyId || media.partId || media.bookId) {
      return res.status(409).json({ message: 'Ce média est utilisé par un contenu et ne peut pas être supprimé.' });
    }
    if (media.storageKey && !media.metadata?.uploadPending) await deleteDocumentObject(media.storageKey);
    await media.destroy();
    await recordAudit(req, 'DELETE_MEDIA_ASSET', 'MediaAsset', media.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/admin/content/style-guides', ...contentEditors, async (req, res, next) => {
  try {
    res.json(await StyleGuide.findAll({ order: [['updatedAt', 'DESC']] }));
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/style-guides/:id', ...contentEditors, validateBody(schemas.styleGuideSchema.partial()), async (req, res, next) => {
  try {
    const guide = await StyleGuide.findByPk(parseId(req.params.id, 'Guide visuel'));
    if (!guide) return res.status(404).json({ message: 'Guide visuel introuvable.' });
    await guide.update(req.body);
    await recordAudit(req, 'UPDATE_STYLE_GUIDE', 'StyleGuide', guide.id);
    res.json(guide);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/style-guides', ...contentEditors, validateBody(schemas.styleGuideSchema), async (req, res, next) => {
  try {
    const guide = await StyleGuide.create(req.body);
    await recordAudit(req, 'CREATE_STYLE_GUIDE', 'StyleGuide', guide.id);
    res.status(201).json(guide);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/subscriptions', authenticate, allowRoles('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const subscriptions = await Subscription.findAll({
      include: [
        { model: Plan, as: 'plan', attributes: ['id', 'name', 'slug', 'price', 'currency', 'interval', 'translations'] },
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 500
    });
    res.json(subscriptions.map((subscription) => {
      const value = subscription.toJSON();
      return { ...value, accessActive: subscriptionIsActive(value) };
    }));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
