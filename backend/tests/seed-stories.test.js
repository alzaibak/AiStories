const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sampleStories,
  storySeedDefaults,
  DEMO_REVIEWER_NAME
} = require('../scripts/seedStories');

test('les valeurs de seed gardent la démo publiée, gratuite et rattachée à l’admin', () => {
  const reviewer = { id: 42 };
  const now = new Date('2026-01-02T03:04:05.000Z');
  const publishedSamples = sampleStories.filter((sample) => sample.published);

  assert.deepEqual(publishedSamples.map((sample) => sample.slug), ['companionship-in-the-cave']);

  const demo = sampleStories.find((sample) => sample.slug === 'companionship-in-the-cave');
  const defaults = storySeedDefaults(demo, { reviewer, now });

  assert.equal(defaults.status, 'published');
  assert.equal(defaults.isFree, true);
  assert.equal(defaults.authorId, reviewer.id);
  assert.equal(defaults.reviewerId, reviewer.id);
  assert.equal(defaults.reviewedBy, reviewer.id);
  assert.equal(defaults.reviewerName, DEMO_REVIEWER_NAME);
  assert.equal(defaults.reviewedAt, now);
  assert.equal(defaults.approvedAt, now);
  assert.equal(defaults.publishedAt, now);
  assert.equal(defaults.publishAt, now);
  assert.deepEqual(defaults.reviewChecklist, {
    sourcesProvided: true,
    reviewedBy: DEMO_REVIEWER_NAME,
    reviewedAt: now.toISOString(),
    representationConfirmed: true
  });
});

test('les autres histoires de démonstration restent des brouillons sans propriétaire', () => {
  const reviewer = { id: 42 };
  const now = new Date('2026-01-02T03:04:05.000Z');
  const drafts = sampleStories.filter((sample) => sample.slug !== 'companionship-in-the-cave');

  assert.ok(drafts.length > 0);
  for (const sample of drafts) {
    const defaults = storySeedDefaults(sample, { reviewer, now });
    assert.equal(defaults.status, 'draft', sample.slug);
    assert.equal(defaults.authorId, null, sample.slug);
    assert.equal(defaults.reviewerId, null, sample.slug);
    assert.equal(defaults.reviewerName, null, sample.slug);
    assert.equal(defaults.reviewedAt, null, sample.slug);
    assert.equal(defaults.publishedAt, null, sample.slug);
    assert.deepEqual(defaults.reviewChecklist, {}, sample.slug);
  }
});
