const LANGUAGES = ['ar', 'en', 'fr'];

async function tableExists(queryInterface, name) {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    (typeof table === 'string' ? table : String(Object.values(table)[0])).toLowerCase()
  );
  return tables.includes(name.toLowerCase());
}

function splitParagraphs(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const byBlankLine = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;
  const byLine = text.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  return byLine.length > 1 ? byLine : byBlankLine;
}

function parseTranslations(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/**
 * Ordered blocks for a story part. The legacy `story_parts.content` column is
 * kept untouched: it stays the Arabic master text and the source for search.
 */
async function up({ queryInterface, Sequelize }) {
  if (!await tableExists(queryInterface, 'story_parts')) return;

  if (!await tableExists(queryInterface, 'story_part_blocks')) {
    await queryInterface.createTable('story_part_blocks', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      partId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'story_parts', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      type: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'text' },
      text: { type: Sequelize.JSON, allowNull: true },
      image: { type: Sequelize.JSON, allowNull: true },
      alt: { type: Sequelize.JSON, allowNull: true },
      caption: { type: Sequelize.JSON, allowNull: true },
      reference: { type: Sequelize.JSON, allowNull: true },
      credit: { type: Sequelize.STRING(300), allowNull: false, defaultValue: '' },
      layout: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'full' },
      decorative: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('story_part_blocks', ['partId', 'position'], {
      name: 'story_part_blocks_part_position'
    });
  }

  // Turn any existing part text into text blocks, once, keeping every word.
  const sequelize = queryInterface.sequelize;
  const parts = await sequelize.query(
    'SELECT id, content, translations FROM story_parts ORDER BY id',
    { type: Sequelize.QueryTypes.SELECT }
  );
  const existing = await sequelize.query(
    'SELECT partId FROM story_part_blocks GROUP BY partId',
    { type: Sequelize.QueryTypes.SELECT }
  );
  const withBlocks = new Set(existing.map((row) => Number(row.partId)));
  const now = new Date();
  const rows = [];

  for (const part of parts) {
    if (withBlocks.has(Number(part.id))) continue;
    const baseParagraphs = splitParagraphs(part.content);
    if (!baseParagraphs.length) continue;
    const translations = parseTranslations(part.translations);
    const translated = {};
    for (const language of LANGUAGES) {
      if (language === 'ar') continue;
      const paragraphs = splitParagraphs(translations[language]?.content);
      if (paragraphs.length) translated[language] = paragraphs;
    }
    baseParagraphs.forEach((paragraph, index) => {
      const text = { ar: paragraph };
      for (const [language, paragraphs] of Object.entries(translated)) {
        if (paragraphs[index]) text[language] = paragraphs[index];
        else if (paragraphs.length === 1) text[language] = paragraphs[0];
        else text[language] = '';
      }
      rows.push({
        partId: part.id,
        position: index + 1,
        type: 'text',
        text: JSON.stringify(text),
        image: null,
        alt: null,
        caption: null,
        reference: null,
        credit: '',
        layout: 'full',
        decorative: false,
        createdAt: now,
        updatedAt: now
      });
    });
  }

  if (rows.length) await queryInterface.bulkInsert('story_part_blocks', rows);
}

async function down({ queryInterface }) {
  if (!await tableExists(queryInterface, 'story_part_blocks')) return;
  await queryInterface.dropTable('story_part_blocks');
}

module.exports = { up, down };
