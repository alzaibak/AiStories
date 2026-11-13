const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEmailQueueRows } = require('../utils/emailQueue');

test('email queue applies recipient preferences and stable deduplication keys', () => {
  const rows = buildEmailQueueRows({
    recipients: [
      { id: 1, emailPreferences: { marketing: true } },
      { id: 2, emailPreferences: { marketing: false } },
      { id: 3, emailPreferences: {} }
    ],
    code: 'story_published',
    preferenceCategory: 'marketing',
    dedupeKeyPrefix: 'story-published:7',
    metadata: (user) => ({ readerId: user.id })
  });
  assert.deepEqual(rows.map(({ userId, dedupeKey, metadata }) => [userId, dedupeKey, metadata.readerId]), [
    [1, 'story-published:7:1', 1],
    [3, 'story-published:7:3', 3]
  ]);
});

test('transactional emails are not removed by marketing opt-out', () => {
  const rows = buildEmailQueueRows({
    recipients: [{ id: 8, emailPreferences: { marketing: false, reminders: false } }],
    code: 'quiz_result',
    preferenceCategory: 'transactional',
    dedupeKeyPrefix: 'quiz-result:12',
    metadata: { score: 90 }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].preferenceCategory, 'transactional');
});
