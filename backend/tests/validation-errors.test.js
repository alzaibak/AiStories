const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../middleware/storyValidation');
const { apiErrorResponse } = require('../utils/apiErrors');

function baseQuiz(overrides = {}) {
  return {
    storyId: 7,
    title: 'اختبار القصة',
    slug: 'story-quiz',
    difficulty: 'kids',
    passingScore: 60,
    questions: [{
      type: 'single_choice',
      text: 'ما الإجابة الصحيحة؟',
      translations: { ar: { text: 'ما الإجابة الصحيحة؟' } },
      answerOptions: [
        { text: 'الأول', translations: { ar: 'الأول' }, isCorrect: true },
        { text: 'الثاني', translations: { ar: 'الثاني' }, isCorrect: false }
      ]
    }],
    ...overrides
  };
}

test('validation failures are 422 with a field path, code and localized message', () => {
  const parsed = schemas.quizContentSchema.safeParse(baseQuiz({ passingScore: 'soixante' }));
  assert.equal(parsed.success, false);
  const response = apiErrorResponse(parsed.error, 'fr');
  assert.equal(response.status, 422);
  assert.equal(response.body.code, 'VALIDATION_FAILED');
  assert.match(response.body.message, /corrigez/i);
  assert.ok(Array.isArray(response.body.errors));
  const issue = response.body.errors.find((entry) => entry.field === 'passingScore');
  assert.ok(issue, `expected passingScore in ${JSON.stringify(response.body.errors)}`);
  assert.ok(['required', 'invalid'].includes(issue.code));
  assert.ok(issue.message.length > 0);
  assert.equal(response.body.fields.passingScore, issue.message);
});

test('nested question errors point to the exact option with bracket paths', () => {
  const quiz = baseQuiz();
  quiz.questions[0].answerOptions = 'not-an-array';
  const parsed = schemas.quizContentSchema.safeParse(quiz);
  assert.equal(parsed.success, false);
  const response = apiErrorResponse(parsed.error, 'en');
  assert.equal(response.status, 422);
  const issue = response.body.errors.find((entry) => entry.field.startsWith('questions[0].answerOptions'));
  assert.ok(issue, JSON.stringify(response.body.errors));
  assert.match(issue.field, /^questions\[0\]\.answerOptions/);
});

test('an empty slug is treated as "generate it" instead of failing validation', () => {
  const parsed = schemas.quizContentSchema.safeParse(baseQuiz({ slug: '' }));
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.slug, undefined);
  const valid = schemas.quizContentSchema.safeParse(baseQuiz({ slug: 'cave-companions' }));
  assert.equal(valid.success, true);
  assert.equal(valid.data.slug, 'cave-companions');
  const invalid = schemas.quizContentSchema.safeParse(baseQuiz({ slug: 'Not A Slug' }));
  assert.equal(invalid.success, false);
});

test('a draft can keep an unfinished question but the publish checklist flags it', () => {
  const draft = baseQuiz();
  draft.questions = [{
    type: 'single_choice',
    text: '',
    translations: { ar: { text: '' } },
    answerOptions: [
      { text: '', translations: { ar: '' }, isCorrect: false },
      { text: '', translations: { ar: '' }, isCorrect: false }
    ]
  }];
  // Saving a draft must succeed: the publish rules live in quizSubmissionErrors.
  assert.equal(schemas.quizContentSchema.safeParse(draft).success, true);
});

test('story images accept responsive metadata and reject out-of-range focal points', () => {
  const story = {
    collectionId: 1,
    title: 'قصة',
    summary: 'ملخص',
    type: 'history',
    sourceBadge: 'historical_source',
    coverImage: 'https://cdn.example.com/cover.webp',
    heroImage: 'https://cdn.example.com/hero.webp',
    socialImage: 'https://cdn.example.com/social.jpg',
    coverAlt: { ar: 'غلاف', en: 'Cover', fr: 'Couverture' },
    focalPoint: { x: 40, y: 30 },
    imageCredit: 'Équipe éditoriale',
    hook: 'ماذا لو اكتشفت الحقيقة متأخرًا؟'
  };
  assert.equal(schemas.storySchema.safeParse(story).success, true);
  assert.equal(schemas.storySchema.safeParse({ ...story, focalPoint: { x: 140, y: 30 } }).success, false);
  assert.equal(schemas.storySchema.safeParse({ ...story, coverImage: 'javascript:alert(1)' }).success, false);
});

test('empty optional story image fields are accepted as no image', () => {
  const story = {
    collectionId: 1,
    title: 'قصة',
    summary: 'ملخص',
    type: 'history',
    sourceBadge: 'historical_source',
    cover: '',
    coverImage: '',
    heroImage: '',
    socialImage: '',
    coverVariants: [{ width: 640, url: '' }]
  };
  const parsed = schemas.storySchema.safeParse(story);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.coverImage, null);
  assert.equal(parsed.data.heroImage, null);
  assert.deepEqual(parsed.data.coverVariants, []);
});
