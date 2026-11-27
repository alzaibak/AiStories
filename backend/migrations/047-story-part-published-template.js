'use strict';

/**
 * Template for the optional "a new episode is out" email, queued when a
 * coming-soon part is published and the reader had finished everything before.
 */
const translations = {
  ar: {
    subject: 'جزء جديد من {{storyTitle}}',
    body: 'مرحبًا {{firstName}}،\nالجزء {{partNumber}} من {{storyTitle}} متاح الآن: {{partTitle}}\n{{actionUrl}}'
  },
  en: {
    subject: 'A new episode of {{storyTitle}}',
    body: 'Hello {{firstName}},\nPart {{partNumber}} of {{storyTitle}} is out now: {{partTitle}}\n{{actionUrl}}'
  },
  fr: {
    subject: 'Un nouvel épisode de {{storyTitle}}',
    body: 'Bonjour {{firstName}},\nLa partie {{partNumber}} de {{storyTitle}} est disponible : {{partTitle}}\n{{actionUrl}}'
  }
};

async function tableExists(queryInterface, table) {
  const tables = (await queryInterface.showAllTables()).map((entry) =>
    (typeof entry === 'string' ? entry : String(Object.values(entry)[0])).toLowerCase()
  );
  return tables.includes(table.toLowerCase());
}

module.exports = {
  async up({ queryInterface }) {
    if (!await tableExists(queryInterface, 'email_templates')) return;
    const [existing] = await queryInterface.sequelize.query(
      "SELECT code FROM email_templates WHERE code = 'story_part_published'"
    );
    if (existing.length) return;
    const now = new Date();
    await queryInterface.bulkInsert('email_templates', [{
      code: 'story_part_published',
      translations: JSON.stringify(translations),
      isActive: true,
      createdAt: now,
      updatedAt: now
    }]);
  },

  async down({ queryInterface }) {
    if (!await tableExists(queryInterface, 'email_templates')) return;
    await queryInterface.sequelize.query(
      "DELETE FROM email_templates WHERE code = 'story_part_published'"
    );
  }
};
