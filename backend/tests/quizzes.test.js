const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../middleware/storyValidation');
const quizMigration = require('../migrations/018-expand-quiz-workflow');
const { publicQuestion } = require('../utils/quizPresentation');
const Sequelize = require('sequelize');

test('quiz content accepts localized Arabic questions and answer options', () => {
  const parsed = schemas.quizContentSchema.safeParse({
    storyId: 7,
    title: 'اختبار القصة',
    slug: 'story-quiz',
    translations: {
      ar: { title: 'اختبار القصة', description: '' },
      en: { title: 'Story quiz', description: '' },
      fr: { title: 'Quiz de l’histoire', description: '' }
    },
    difficulty: 'kids',
    passingScore: 70,
    questions: [{
      type: 'single_choice',
      text: 'ما الإجابة الصحيحة؟',
      translations: { ar: { text: 'ما الإجابة الصحيحة؟' } },
      answerOptions: [
        { text: 'الإجابة الأولى', translations: { ar: 'الإجابة الأولى', en: 'First answer', fr: 'Première réponse' }, isCorrect: true },
        { text: 'الإجابة الثانية', translations: { ar: 'الإجابة الثانية', en: 'Second answer', fr: 'Deuxième réponse' }, isCorrect: false }
      ]
    }]
  });

  assert.equal(parsed.success, true);
});

test('single-choice questions require exactly one correct option', () => {
  const parsed = schemas.questionSchema.safeParse({
    type: 'single_choice',
    text: 'السؤال',
    answerOptions: [
      { text: 'الأول', isCorrect: true },
      { text: 'الثاني', isCorrect: true }
    ]
  });

  assert.equal(parsed.success, false);
});

test('quiz rejection requires a review comment', () => {
  assert.equal(schemas.quizReviewSchema.safeParse({ decision: 'rejected' }).success, false);
  assert.equal(schemas.quizReviewSchema.safeParse({ decision: 'rejected', comments: 'أضف المصادر.' }).success, true);
});

test('public quiz questions never include correctness or source metadata', () => {
  const result = publicQuestion({
    id: 5,
    type: 'single_choice',
    text: 'سؤال',
    translations: { ar: { text: 'سؤال' }, en: { text: 'Question' } },
    correctAnswer: 'secret answer',
    explanation: 'private explanation',
    source: 'private source',
    answerOptions: [
      { id: 11, text: 'إجابة', translations: { ar: 'إجابة', en: 'Answer' }, isCorrect: true, sortOrder: 0 }
    ]
  }, 'en', false);

  assert.deepEqual(result, {
    id: 5,
    type: 'single_choice',
    points: 1,
    text: 'Question',
    options: [{ id: 11, text: 'Answer' }]
  });
});

test('legacy quiz options migrate once and retain the correct answer marker', async () => {
  const inserted = [];
  const queryInterface = {
    sequelize: {
      async query(sql, options = {}) {
        if (sql.includes('SELECT id, options, correctAnswer')) {
          assert.equal(options.type, Sequelize.QueryTypes.SELECT);
          return [{ id: 12, options: '["اختيار أ","اختيار ب"]', correctAnswer: 'اختيار ب' }];
        }
        if (sql.includes('SELECT id FROM quiz_options')) return [];
        throw new Error(`Unexpected SQL in migration test: ${sql}`);
      }
    },
    async bulkInsert(table, rows) {
      inserted.push({ table, rows });
    }
  };

  await quizMigration.migrateLegacyOptions(queryInterface, Sequelize);

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].table, 'quiz_options');
  assert.deepEqual(inserted[0].rows.map((option) => option.isCorrect), [false, true]);
});

test('rolling back quiz options restores the legacy JSON answer fields', async () => {
  const updates = [];
  const queryInterface = {
    sequelize: {
      async query(sql) {
        assert.match(sql, /SELECT questionId, text, isCorrect/);
        return [
          { questionId: 12, text: 'اختيار أ', isCorrect: false },
          { questionId: 12, text: 'اختيار ب', isCorrect: true }
        ];
      }
    },
    async bulkUpdate(table, values, where) {
      updates.push({ table, values, where });
    }
  };

  await quizMigration.restoreLegacyOptions(queryInterface, Sequelize);

  assert.deepEqual(updates, [{
    table: 'questions',
    values: { options: '["اختيار أ","اختيار ب"]', correctAnswer: 'اختيار ب' },
    where: { id: 12 }
  }]);
});
