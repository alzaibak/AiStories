const crypto = require('node:crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { sequelize } = require('../models');
const {
  Collection,
  Story,
  StoryPart,
  StoryVideo,
  Quiz,
  Question,
  QuizAttempt,
  ReadingProgress,
  Book,
  MediaAsset,
  StyleGuide,
  Subscription,
  Plan,
  Entitlement,
  ReviewerNote,
  User
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

const router = express.Router();
const contentEditors = [authenticate, allowRoles('ADMIN', 'SUPER_ADMIN', 'EDITOR')];
const reviewers = [authenticate, allowRoles('ADMIN', 'REVIEWER')];
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

async function canAccessMedia(media, user) {
  let accessible = isPrivileged(user);
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
      part: accessPart
    }));
  }
  return accessible;
}

async function findPublishedStory(slug) {
  return Story.findOne({
    where: { slug, status: 'published' },
    include: [
      { model: Collection, as: 'collection' },
      { model: StoryPart, as: 'parts', order: [['partNumber', 'ASC']] },
      { model: StoryVideo, as: 'videos' },
      { model: User, as: 'reviewer', attributes: ['firstName', 'lastName'], required: false }
    ]
  });
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
    where: { id: quizId, validationStatus: 'validated' },
    include: [
      {
        model: Story,
        as: 'story',
        where: { status: 'published' },
        include: [{ model: Collection, as: 'collection' }, { model: StoryPart, as: 'parts' }]
      },
      { model: StoryPart, as: 'part' },
      { model: Question, as: 'questions', order: [['sortOrder', 'ASC']] }
    ]
  });
  if (!quiz) throw notFound('Quiz publié introuvable.');
  return quiz;
}

function publicQuestion(question) {
  return {
    id: question.id,
    text: question.text,
    options: shuffle(question.options)
  };
}

async function checkQuizAccess(quiz, user) {
  const part = quiz.part || quiz.story.parts.sort((a, b) => a.partNumber - b.partNumber)[0];
  if (!part || !await canAccessPart({ userId: user?.id, role: user?.role, story: quiz.story, part })) {
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
    const collection = await Collection.findOne({
      where: { slug: req.params.slug, isActive: true },
      include: [{
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
      }]
    });
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
    const videos = await Promise.all(story.videos.map(async (video) => {
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
        partId: video.partId,
        episodeNumber: video.episodeNumber,
        durationSeconds: video.durationSeconds,
        thumbnail: video.thumbnail,
        isFree: video.isFree,
        ...(accessible ? { videoUrl: video.videoUrl } : {})
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
    const part = await findAccessiblePart(story, partNumber, req.user);
    const quiz = await Quiz.findOne({
      where: { storyId: story.id, partId: part.id, validationStatus: 'validated' },
      include: [{ model: Question, as: 'questions', order: [['sortOrder', 'ASC']] }]
    });
    if (!quiz) return res.status(404).json({ message: 'Quiz validé introuvable.' });
    res.json({
      id: quiz.id,
      title: quiz.title,
      difficulty: quiz.difficulty,
      passingScore: quiz.passingScore,
      timeLimitSeconds: quiz.timeLimitSeconds,
      questions: shuffle(quiz.questions).map(publicQuestion)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/books', async (req, res, next) => {
  try {
    const language = requestedLanguage(req.query.lang);
    const books = await Book.findAll({
      where: { isPublished: true },
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
    const book = await Book.findOne({
      where: { slug: req.params.slug, isPublished: true },
      attributes: ['id', 'collectionId', 'storyId', 'title', 'slug', 'description', 'translations', 'cover', 'format', 'price', 'currency', 'stockQuantity']
    });
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
    const book = await Book.findOne({ where: { slug: req.params.slug, isPublished: true } });
    if (!book || book.format !== 'ebook') return res.status(404).json({ message: 'Livre numérique introuvable.' });
    res.json({ canDownload: await canAccessBook({ userId: req.user.id, role: req.user.role, book }) });
  } catch (error) {
    next(error);
  }
});

router.get('/books/:slug/download', authenticate, async (req, res, next) => {
  try {
    const book = await Book.findOne({ where: { slug: req.params.slug, isPublished: true } });
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
    const book = await Book.findOne({ where: { slug: req.params.slug, isPublished: true } });
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
    const book = await Book.findOne({ where: { slug: req.params.slug, isPublished: true } });
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
    if (quiz.questions.length < 3 || quiz.questions.length > 5) {
      return res.status(409).json({ message: 'Le quiz publié doit contenir entre 3 et 5 questions.' });
    }
    const startedAt = new Date();
    const attempt = await QuizAttempt.create({
      userId: req.user.id,
      quizId: quiz.id,
      score: null,
      answers: {},
      startedAt
    });
    res.status(201).json({
      attemptId: attempt.id,
      startedAt,
      timeLimitSeconds: quiz.timeLimitSeconds,
      questions: shuffle(quiz.questions).map(publicQuestion)
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
    let correctCount = 0;
    const feedback = questions.map((question) => {
      const selectedAnswer = answers[question.id] || '';
      const correct = selectedAnswer === question.correctAnswer;
      if (correct) correctCount += 1;
      return {
        questionId: question.id,
        selectedAnswer,
        correct,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        source: question.source
      };
    });
    const score = Math.round((correctCount / questions.length) * 100);
    attempt.score = score;
    attempt.answers = answers;
    attempt.completedAt = new Date();
    await attempt.save();
    res.json({
      attemptId: attempt.id,
      score,
      correctCount,
      totalQuestions: questions.length,
      passed: score >= quiz.passingScore,
      feedback
    });
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
    const collection = await Collection.create(req.body);
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
    await collection.update(req.body);
    await recordAudit(req, 'UPDATE_COLLECTION', 'Collection', collection.id);
    res.json(collection);
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
    const story = await Story.create({ ...req.body, status: 'draft' });
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
    await story.update({
      ...req.body,
      ...(story.status === 'published' ? { status: 'in_review', approvedAt: null } : {})
    });
    await recordAudit(req, 'UPDATE_STORY', 'Story', story.id);
    res.json(story);
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
    story.status = 'in_review';
    story.approvedAt = null;
    await story.save();
    await recordAudit(req, 'SUBMIT_STORY_FOR_REVIEW', 'Story', story.id);
    res.json(story);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/review', ...reviewers, validateBody(schemas.reviewSchema), async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'));
    if (!story || story.status !== 'in_review') {
      return res.status(404).json({ message: 'Histoire en attente de révision introuvable.' });
    }
    if (req.user.role === 'REVIEWER' && story.reviewerId !== req.user.id) {
      return res.status(403).json({ message: 'Cette histoire ne vous est pas attribuée.' });
    }
    const reviewerName = `${req.user.firstName} ${req.user.lastName}`.trim();
    story.reviewerId = req.user.id;
    story.reviewerName = reviewerName;
    story.approvedAt = req.body.decision === 'approved' ? new Date() : null;
    if (req.body.decision === 'changes_requested') story.status = 'draft';
    await story.save();
    await ReviewerNote.create({
      storyId: story.id,
      reviewerId: req.user.id,
      status: req.body.decision,
      comments: req.body.comments
    });
    await recordAudit(req, 'REVIEW_STORY', 'Story', story.id, { decision: req.body.decision });
    res.json(story);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/publish', ...reviewers, async (req, res, next) => {
  try {
    const story = await Story.findByPk(parseId(req.params.id, 'Histoire'), {
      include: [{ model: Collection, as: 'collection' }]
    });
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    if (req.user.role === 'REVIEWER' && story.reviewerId !== req.user.id) {
      return res.status(403).json({ message: 'Seul le réviseur assigné peut publier cette histoire.' });
    }
    if (story.status !== 'in_review' || !story.approvedAt ||
      !(story.reviewerName || story.reviewerId)) {
      return res.status(409).json({ message: 'Une approbation par un réviseur nommé est requise avant publication.' });
    }
    if (story.sourceBadge !== 'inspired_story' && story.sourceReferences.length === 0) {
      return res.status(409).json({ message: 'Les références de source sont requises pour cette histoire.' });
    }
    const parts = await StoryPart.findAll({ where: { storyId: story.id } });
    if (parts.length === 0) return res.status(409).json({ message: 'Ajoutez au moins une partie avant publication.' });
    const publishedVideos = await StoryVideo.findAll({
      where: { storyId: story.id, productionStatus: 'published' }
    });
    if (publishedVideos.some((video) => !video.videoUrl || !video.depictionPolicyConfirmed)) {
      return res.status(409).json({ message: 'Chaque vidéo publiée doit avoir une URL et confirmer la politique de représentation.' });
    }
    for (const part of parts) {
      const quiz = await Quiz.findOne({ where: { storyId: story.id, partId: part.id } });
      if (!quiz || quiz.validationStatus !== 'validated') {
        return res.status(409).json({ message: `Le quiz de la partie ${part.partNumber} doit être validé.` });
      }
      const questions = await Question.findAll({ where: { quizId: quiz.id } });
      if (questions.length < 3 || questions.length > 5) {
        return res.status(409).json({ message: `Le quiz de la partie ${part.partNumber} doit contenir de 3 à 5 questions.` });
      }
    }
    story.status = 'published';
    story.publishAt = story.publishAt || new Date();
    await story.save();
    await recordAudit(req, 'PUBLISH_STORY', 'Story', story.id);
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
    if (story.status === 'published') {
      story.status = 'in_review';
      story.approvedAt = null;
      await story.save();
    }
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
    if (story?.status === 'published') {
      story.status = 'in_review';
      story.approvedAt = null;
      await story.save();
    }
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
    if (story?.status === 'published') {
      story.status = 'in_review';
      story.approvedAt = null;
      await story.save();
    }
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
    if (story?.status === 'published') {
      story.status = 'in_review';
      story.approvedAt = null;
      await story.save();
    }
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
    if (story?.status === 'published') {
      story.status = 'in_review';
      story.approvedAt = null;
      await story.save();
    }
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
    if (req.body.productionStatus === 'published' && !req.body.videoUrl) {
      return res.status(400).json({ message: 'Une vidéo doit avoir une URL avant sa publication.' });
    }
    const video = await StoryVideo.create({ ...req.body, storyId });
    await recordAudit(req, 'CREATE_STORY_VIDEO', 'StoryVideo', video.id, { storyId });
    res.status(201).json(video);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/videos/:id', ...contentEditors, validateBody(schemas.videoSchema.partial()), async (req, res, next) => {
  try {
    const video = await StoryVideo.findByPk(parseId(req.params.id, 'Vidéo'));
    if (!video) return res.status(404).json({ message: 'Vidéo introuvable.' });
    if (req.body.partId &&
      !await StoryPart.findOne({ where: { id: req.body.partId, storyId: video.storyId } })) {
      return res.status(400).json({ message: 'La partie vidéo ne correspond pas à cette histoire.' });
    }
    if ((req.body.productionStatus || video.productionStatus) === 'published' &&
      !(req.body.videoUrl || video.videoUrl)) {
      return res.status(400).json({ message: 'Une vidéo doit avoir une URL avant sa publication.' });
    }
    await video.update(req.body);
    const story = await Story.findByPk(video.storyId);
    if (story?.status === 'published') {
      story.status = 'in_review';
      story.approvedAt = null;
      await story.save();
    }
    await recordAudit(req, 'UPDATE_STORY_VIDEO', 'StoryVideo', video.id);
    res.json(video);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/stories/:id/quizzes', ...contentEditors, validateBody(schemas.quizSchema), async (req, res, next) => {
  try {
    const storyId = parseId(req.params.id, 'Histoire');
    const partId = req.body.partId == null ? null : req.body.partId;
    const story = await Story.findByPk(storyId);
    if (!story) return res.status(404).json({ message: 'Histoire introuvable.' });
    if (partId && !await StoryPart.findOne({ where: { id: partId, storyId } })) {
      return res.status(400).json({ message: 'La partie ne correspond pas à cette histoire.' });
    }
    const quiz = await Quiz.create({ ...req.body, storyId, validationStatus: 'draft' });
    await recordAudit(req, 'CREATE_QUIZ', 'Quiz', quiz.id, { storyId });
    res.status(201).json(quiz);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/quizzes/:id/questions', ...contentEditors, validateBody(schemas.questionSchema), async (req, res, next) => {
  try {
    const quizId = parseId(req.params.id, 'Quiz');
    const quiz = await Quiz.findByPk(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    if (!req.body.options.includes(req.body.correctAnswer)) {
      return res.status(400).json({ message: 'La réponse correcte doit figurer parmi les choix.' });
    }
    const count = await Question.count({ where: { quizId } });
    if (count >= 5) return res.status(409).json({ message: 'Un quiz ne peut pas contenir plus de cinq questions.' });
    quiz.validationStatus = 'draft';
    await quiz.save();
    const question = await Question.create({
      ...req.body,
      quizId,
      sortOrder: req.body.sortOrder || count + 1
    });
    await recordAudit(req, 'CREATE_QUIZ_QUESTION', 'Question', question.id, { quizId });
    res.status(201).json(question);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/quizzes/:id', ...contentEditors, validateBody(schemas.quizSchema.partial()), async (req, res, next) => {
  try {
    const quiz = await Quiz.findByPk(parseId(req.params.id, 'Quiz'));
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    const partId = req.body.partId === undefined ? quiz.partId : req.body.partId;
    if (partId && !await StoryPart.findOne({ where: { id: partId, storyId: quiz.storyId } })) {
      return res.status(400).json({ message: 'La partie ne correspond pas à cette histoire.' });
    }
    await quiz.update({ ...req.body, validationStatus: 'draft' });
    const story = await Story.findByPk(quiz.storyId);
    if (story?.status === 'published') {
      story.status = 'in_review';
      story.approvedAt = null;
      await story.save();
    }
    await recordAudit(req, 'UPDATE_QUIZ', 'Quiz', quiz.id);
    res.json(quiz);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/content/questions/:id', ...contentEditors, validateBody(schemas.questionSchema.partial()), async (req, res, next) => {
  try {
    const question = await Question.findByPk(parseId(req.params.id, 'Question'));
    if (!question) return res.status(404).json({ message: 'Question introuvable.' });
    const options = req.body.options || question.options;
    const correctAnswer = req.body.correctAnswer || question.correctAnswer;
    if (!options.includes(correctAnswer)) {
      return res.status(400).json({ message: 'La réponse correcte doit figurer parmi les choix.' });
    }
    await question.update(req.body);
    const quiz = await Quiz.findByPk(question.quizId);
    quiz.validationStatus = 'draft';
    await quiz.save();
    const story = await Story.findByPk(quiz.storyId);
    if (story?.status === 'published') {
      story.status = 'in_review';
      story.approvedAt = null;
      await story.save();
    }
    await recordAudit(req, 'UPDATE_QUIZ_QUESTION', 'Question', question.id, { quizId: quiz.id });
    res.json(question);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/content/quizzes/:id/validate', ...reviewers, validateBody(schemas.quizReviewSchema), async (req, res, next) => {
  try {
    const quiz = await Quiz.findByPk(parseId(req.params.id, 'Quiz'), {
      include: [{ model: Question, as: 'questions' }]
    });
    if (!quiz) return res.status(404).json({ message: 'Quiz introuvable.' });
    if (quiz.questions.length < 3 || quiz.questions.length > 5 ||
      quiz.questions.some((question) => !question.options.includes(question.correctAnswer) ||
        !question.explanation || !question.source)) {
      return res.status(409).json({ message: 'Un quiz validé doit contenir de 3 à 5 questions complètes avec source et explication.' });
    }
    quiz.validationStatus = 'validated';
    await quiz.save();
    await recordAudit(req, 'VALIDATE_QUIZ', 'Quiz', quiz.id);
    res.json(quiz);
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
    if (req.body.isPublished && req.body.format === 'ebook' && !req.body.fileStorageKey) {
      return res.status(400).json({ message: 'Ajoutez le fichier PDF avant de publier le livre numérique.' });
    }
    const book = await Book.create(req.body);
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
    const format = req.body.format || book.format;
    const fileStorageKey = req.body.fileStorageKey === undefined ? book.fileStorageKey : req.body.fileStorageKey;
    if (req.body.isPublished === true && format === 'ebook' && !fileStorageKey) {
      return res.status(400).json({ message: 'Ajoutez le fichier PDF avant de publier le livre numérique.' });
    }
    await book.update(req.body);
    await recordAudit(req, 'UPDATE_BOOK', 'Book', book.id);
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
      metadata: { uploadKey, uploadPending: true }
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
    media.metadata = { uploadPending: false };
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
    res.json(await MediaAsset.findAll({
      order: [['createdAt', 'DESC']],
      limit: 500
    }));
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
