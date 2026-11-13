const { slugFromLocalized } = require('../utils/slug');

async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

async function addColumnIfMissing(queryInterface, table, column, definition) {
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) await queryInterface.addColumn(table, column, definition);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function addIndexIfMissing(queryInterface, table, fields, name, unique = false) {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(table, fields, { name, unique });
  }
}

async function repairQuizSlugs(queryInterface, Sequelize) {
  const rows = await queryInterface.sequelize.query(
    'SELECT id, slug, title, translations FROM quizzes ORDER BY id',
    { type: Sequelize.QueryTypes.SELECT }
  );
  const used = new Set();
  for (const row of rows) {
    let slug = String(row.slug || '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || used.has(slug)) {
      slug = slugFromLocalized(row.title, parseJson(row.translations, {})) || `quiz-${row.id}`;
      const base = slug.slice(0, 240);
      let suffix = 1;
      while (used.has(slug)) {
        const ending = `-${suffix++}`;
        slug = `${base.slice(0, 255 - ending.length)}${ending}`;
      }
      await queryInterface.bulkUpdate('quizzes', { slug }, { id: row.id });
    }
    used.add(slug);
  }
}

async function migrateLegacyOptions(queryInterface, Sequelize) {
  const rows = await queryInterface.sequelize.query(
    'SELECT id, options, correctAnswer FROM questions ORDER BY id',
    { type: Sequelize.QueryTypes.SELECT }
  );
  const now = new Date();
  for (const row of rows) {
    const options = parseJson(row.options, []);
    if (!Array.isArray(options) || !options.length) continue;
    const existing = await queryInterface.sequelize.query(
      'SELECT id FROM quiz_options WHERE questionId = ? LIMIT 1',
      { replacements: [row.id], type: Sequelize.QueryTypes.SELECT }
    );
    if (existing.length) continue;
    const entries = options.map((option, index) => {
      const text = typeof option === 'string' ? option : String(option?.text || '');
      return {
        questionId: row.id,
        text,
        translations: JSON.stringify({ ar: text }),
        isCorrect: text === row.correctAnswer,
        sortOrder: index,
        createdAt: now,
        updatedAt: now
      };
    }).filter((option) => option.text);
    if (entries.length) await queryInterface.bulkInsert('quiz_options', entries);
  }
}

async function restoreLegacyOptions(queryInterface, Sequelize) {
  const rows = await queryInterface.sequelize.query(
    'SELECT questionId, text, isCorrect FROM quiz_options ORDER BY questionId, sortOrder',
    { type: Sequelize.QueryTypes.SELECT }
  );
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.questionId)) grouped.set(row.questionId, []);
    grouped.get(row.questionId).push(row);
  }
  for (const [questionId, options] of grouped) {
    const correct = options.find((option) => option.isCorrect);
    await queryInterface.bulkUpdate('questions', {
      options: JSON.stringify(options.map((option) => option.text)),
      ...(correct ? { correctAnswer: correct.text } : {})
    }, { id: questionId });
  }
}

async function up({ queryInterface, Sequelize }) {
  if (!await tableExists(queryInterface, 'quizzes')) return;
  for (const [column, definition] of Object.entries({
    slug: { type: Sequelize.STRING(255), allowNull: true },
    description: { type: Sequelize.TEXT, allowNull: true },
    translations: { type: Sequelize.JSON, allowNull: true },
    maxAttempts: { type: Sequelize.INTEGER, allowNull: true },
    shuffleQuestions: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    shuffleAnswers: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    showCorrectAnswersAfterSubmit: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    accessMode: {
      type: Sequelize.ENUM('follow_part', 'free', 'premium'),
      allowNull: false,
      defaultValue: 'follow_part'
    },
    status: {
      type: Sequelize.ENUM('draft', 'in_review', 'published', 'rejected', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    },
    authorId: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL'
    },
    reviewedBy: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL'
    },
    reviewedAt: { type: Sequelize.DATE, allowNull: true },
    publishedAt: { type: Sequelize.DATE, allowNull: true },
    rejectionReason: { type: Sequelize.TEXT, allowNull: true }
  })) await addColumnIfMissing(queryInterface, 'quizzes', column, definition);

  await queryInterface.sequelize.query(
    "UPDATE quizzes SET status = 'published' WHERE status = 'draft' AND validationStatus = 'validated'"
  );
  await queryInterface.sequelize.query(
    "UPDATE quizzes SET publishedAt = updatedAt WHERE validationStatus = 'validated' AND publishedAt IS NULL"
  );
  await repairQuizSlugs(queryInterface, Sequelize);
  await addIndexIfMissing(queryInterface, 'quizzes', ['slug'], 'quizzes_slug_unique', true);

  if (await tableExists(queryInterface, 'questions')) {
    for (const [column, definition] of Object.entries({
      type: { type: Sequelize.ENUM('single_choice', 'multiple_choice', 'true_false'), allowNull: false, defaultValue: 'single_choice' },
      translations: { type: Sequelize.JSON, allowNull: true },
      points: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      explanationTranslations: { type: Sequelize.JSON, allowNull: true },
      sourceTranslations: { type: Sequelize.JSON, allowNull: true }
    })) await addColumnIfMissing(queryInterface, 'questions', column, definition);
    await queryInterface.changeColumn('questions', 'source', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  }

  if (!await tableExists(queryInterface, 'quiz_options')) {
    await queryInterface.createTable('quiz_options', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      questionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'questions', key: 'id' },
        onDelete: 'CASCADE'
      },
      text: { type: Sequelize.STRING(500), allowNull: false },
      translations: { type: Sequelize.JSON, allowNull: true },
      isCorrect: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      sortOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  }
  await addIndexIfMissing(queryInterface, 'quiz_options', ['questionId', 'sortOrder'], 'quiz_options_question_order_unique', true);
  await migrateLegacyOptions(queryInterface, Sequelize);

  if (await tableExists(queryInterface, 'quiz_attempts')) {
    await addColumnIfMissing(queryInterface, 'quiz_attempts', 'passed', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });
    await addColumnIfMissing(queryInterface, 'quiz_attempts', 'finishedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.sequelize.query(
      'UPDATE quiz_attempts SET finishedAt = completedAt WHERE finishedAt IS NULL AND completedAt IS NOT NULL'
    );
    await queryInterface.sequelize.query(
      "UPDATE quiz_attempts AS qa INNER JOIN quizzes AS q ON q.id = qa.quizId SET qa.passed = (qa.score >= q.passingScore) WHERE qa.passed IS NULL AND qa.score IS NOT NULL"
    );
  }
}

async function down({ queryInterface, Sequelize }) {
  if (await tableExists(queryInterface, 'quiz_attempts')) {
    for (const column of ['finishedAt', 'passed']) {
      const columns = await queryInterface.describeTable('quiz_attempts');
      if (columns[column]) await queryInterface.removeColumn('quiz_attempts', column);
    }
  }
  if (await tableExists(queryInterface, 'quiz_options')) {
    await restoreLegacyOptions(queryInterface, Sequelize);
    await queryInterface.dropTable('quiz_options');
  }
  if (await tableExists(queryInterface, 'questions')) {
    for (const column of ['sourceTranslations', 'explanationTranslations', 'points', 'translations', 'type']) {
      const columns = await queryInterface.describeTable('questions');
      if (columns[column]) await queryInterface.removeColumn('questions', column);
    }
  }
  if (await tableExists(queryInterface, 'quizzes')) {
    for (const column of [
      'rejectionReason', 'publishedAt', 'reviewedAt', 'reviewedBy', 'authorId', 'status', 'accessMode',
      'showCorrectAnswersAfterSubmit', 'shuffleAnswers', 'shuffleQuestions', 'maxAttempts',
      'translations', 'description', 'slug'
    ]) {
      const columns = await queryInterface.describeTable('quizzes');
      if (columns[column]) await queryInterface.removeColumn('quizzes', column);
    }
  }
}

module.exports = { up, down, migrateLegacyOptions, restoreLegacyOptions, repairQuizSlugs };
