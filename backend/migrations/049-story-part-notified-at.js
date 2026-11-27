'use strict';

/**
 * The "new episode" email used to be queued while the story was still published,
 * then the part edit immediately sent the story back to review: readers received
 * a link to a page that was no longer readable. The notification is now queued
 * when the story is published again, and this column records it so a part is
 * never announced twice.
 */
async function columnExists(queryInterface, table, column) {
  try {
    const description = await queryInterface.describeTable(table);
    return Boolean(description[column]);
  } catch {
    return false;
  }
}

module.exports = {
  async up({ queryInterface }) {
    if (await columnExists(queryInterface, 'story_parts', 'publishNotifiedAt')) return;
    await queryInterface.addColumn('story_parts', 'publishNotifiedAt', {
      type: queryInterface.sequelize.Sequelize.DATE,
      allowNull: true,
      defaultValue: queryInterface.sequelize.Sequelize.NOW
    });
    // Existing parts are considered already handled: no backlog of emails.
    await queryInterface.sequelize.query('UPDATE story_parts SET publishNotifiedAt = NOW()');
  },

  async down({ queryInterface }) {
    if (!await columnExists(queryInterface, 'story_parts', 'publishNotifiedAt')) return;
    await queryInterface.removeColumn('story_parts', 'publishNotifiedAt');
  }
};
