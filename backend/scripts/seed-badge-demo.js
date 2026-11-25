/*
 * Seeds three demo readers so the profile, badges and certificates screens can be
 * reviewed with realistic data. Idempotent: running it twice changes nothing.
 *
 *   node scripts/seed-badge-demo.js
 *
 * All passwords are "DemoReader2026!" — remove these accounts before production.
 */
require('dotenv').config();
const {
  sequelize,
  User,
  Story,
  StoryPart,
  Quiz,
  QuizAttempt,
  ReadingProgress,
  Certificate,
  Plan,
  Subscription
} = require('../models');
const { hashPassword } = require('../utils/security');
const engine = require('../utils/badges/engine');

const DEMO_PASSWORD = 'DemoReader2026!';
const DEMO_USERS = [
  { email: 'demo.new@recis-islamiques.test', firstName: 'Nour', lastName: 'Débutante' },
  { email: 'demo.reader@recis-islamiques.test', firstName: 'Samir', lastName: 'Lecteur' },
  { email: 'demo.premium@recis-islamiques.test', firstName: 'Amina', lastName: 'Fidèle' }
];

async function ensureUser({ email, firstName, lastName }) {
  const [user, created] = await User.findOrCreate({
    where: { email },
    defaults: {
      firstName,
      lastName,
      email,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      role: 'READER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      language: 'ar',
      emailPreferences: { marketing: true, reminders: true }
    }
  });
  return { user, created };
}

async function completeStory(userId, story, daysAgo) {
  const parts = await StoryPart.findAll({ where: { storyId: story.id }, attributes: ['id'] });
  if (!parts.length) return null;
  const readAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const [progress] = await ReadingProgress.findOrCreate({
    where: { userId, storyId: story.id },
    defaults: { userId, storyId: story.id, completedParts: [], lastReadAt: readAt }
  });
  await progress.update({
    completedParts: parts.map((part) => part.id),
    lastPartId: parts[parts.length - 1].id,
    lastReadAt: readAt
  });
  return progress;
}

async function passQuiz(userId, quiz, daysAgo, score = 100) {
  const finishedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const [attempt] = await QuizAttempt.findOrCreate({
    where: { userId, quizId: quiz.id },
    defaults: {
      userId,
      quizId: quiz.id,
      score,
      passed: true,
      answers: {},
      startedAt: finishedAt,
      completedAt: finishedAt,
      finishedAt
    }
  });
  if (!attempt.passed) {
    await attempt.update({ score, passed: true, finishedAt, completedAt: finishedAt });
  }
  return attempt;
}

async function main() {
  await sequelize.authenticate();
  const password = await hashPassword(DEMO_PASSWORD);
  const users = [];
  for (const definition of DEMO_USERS) {
    const { user, created } = await ensureUser(definition);
    if (!created) await user.update({ passwordHash: password });
    users.push(user);
    console.log(`${created ? 'created' : 'kept'} ${user.email}`);
  }

  const stories = await Story.findAll({ where: { status: 'published' }, order: [['id', 'ASC']], limit: 6 });
  const quizzes = await Quiz.findAll({ order: [['id', 'ASC']], limit: 4 });

  const [, reader, premium] = users;

  // Active reader: a five-day streak, three stories finished and two quizzes passed.
  for (let index = 0; index < Math.min(5, stories.length); index += 1) {
    await completeStory(reader.id, stories[index], 4 - index);
  }
  for (const quiz of quizzes.slice(0, 2)) {
    await passQuiz(reader.id, quiz, 1);
  }

  // Long-term subscriber: many stories, perfect quizzes and two certificates.
  for (let index = 0; index < stories.length; index += 1) {
    await completeStory(premium.id, stories[index], index);
  }
  for (const [index, quiz] of quizzes.entries()) {
    await passQuiz(premium.id, quiz, index, index % 2 === 0 ? 100 : 85);
  }
  for (const story of stories.slice(0, 2)) {
    await Certificate.findOrCreate({
      where: { userId: premium.id, storyId: story.id },
      defaults: {
        userId: premium.id,
        storyId: story.id,
        title: `Certificate: ${story.title}`,
        verificationCode: `DEMO-${premium.id}-${story.id}`.toUpperCase(),
        issuedAt: new Date()
      }
    });
  }

  const plan = await Plan.findOne({ where: { isActive: true }, order: [['id', 'ASC']] });
  if (plan) {
    await Subscription.findOrCreate({
      where: { userId: premium.id, planId: plan.id, status: 'active' },
      defaults: {
        userId: premium.id,
        planId: plan.id,
        status: 'active',
        startedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      }
    });
  }

  for (const user of [reader, premium]) {
    const result = await engine.evaluateUserBadges(user.id, { trigger: 'demo_seed' });
    console.log(`${user.email}: ${result.newAwards.length} new badge(s), ${result.totalPoints} points, level ${result.level.level}`);
  }

  await sequelize.close();
}

main().catch(async (error) => {
  console.error('Demo seed failed:', error);
  try {
    await sequelize.close();
  } catch (closeError) {
    // ignore
  }
  process.exitCode = 1;
});
