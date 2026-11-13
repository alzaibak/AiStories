const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../models');

test('les comptes portent les rôles et attributs de la plateforme', () => {
  assert.deepEqual(models.User.rawAttributes.role.values, [
    'SUPER_ADMIN', 'ADMIN', 'EDITOR', 'REVIEWER', 'READER', 'BUYER', 'SELLER'
  ]);
  assert.equal(models.User.rawAttributes.role.defaultValue, 'READER');
  assert.equal(models.User.rawAttributes.language.defaultValue, 'ar');
  assert.ok(models.User.rawAttributes.passwordHash);
  assert.equal(models.User.rawAttributes.password, undefined);
  assert.equal(models.User.rawAttributes.isAdmin, undefined);
  assert.equal(models.User.rawAttributes.subscribe, undefined);
  assert.ok(models.User.rawAttributes.stripeCustomerId);
  assert.ok(models.User.rawAttributes.emailVerifiedAt);
  assert.ok(models.User.rawAttributes.organizationId);
  assert.deepEqual(models.User.rawAttributes.language.values, ['fr', 'en', 'ar']);
  assert.deepEqual(models.EmailAuthChallenge.rawAttributes.role.values, [
    'SUPER_ADMIN', 'ADMIN', 'EDITOR', 'REVIEWER', 'READER', 'BUYER', 'SELLER'
  ]);
});

test('les modèles de contenu, boutique et abonnements exposent les workflows requis', () => {
  assert.deepEqual(models.Story.rawAttributes.sourceBadge.values, [
    'quran_verse', 'authentic_hadith', 'historical_source', 'inspired_story'
  ]);
  assert.deepEqual(models.Story.rawAttributes.status.values, ['draft', 'in_review', 'published', 'rejected', 'archived']);
  assert.ok(models.Story.rawAttributes.reviewerId);
  assert.ok(models.Story.rawAttributes.authorId);
  assert.ok(models.Story.rawAttributes.publishedAt);
  assert.ok(models.Story.rawAttributes.reviewedBy);
  assert.ok(models.Story.rawAttributes.reviewedAt);
  assert.ok(models.Story.rawAttributes.rejectionReason);
  assert.ok(models.StoryPart.rawAttributes.endingHook);
  assert.ok(models.StoryPart.rawAttributes.earlyAccessUntil);
  assert.ok(models.StoryVideo.rawAttributes.depictionPolicyConfirmed);
  assert.deepEqual(models.Quiz.rawAttributes.status.values, ['draft', 'in_review', 'published', 'rejected', 'archived']);
  assert.ok(models.Quiz.rawAttributes.slug);
  assert.ok(models.Quiz.rawAttributes.authorId);
  assert.ok(models.Quiz.rawAttributes.reviewedBy);
  assert.ok(models.Quiz.rawAttributes.publishedAt);
  assert.ok(models.QuizOption.rawAttributes.isCorrect);
  assert.ok(models.Question.rawAttributes.points);
  assert.ok(models.QuizAttempt.rawAttributes.startedAt);
  assert.ok(models.QuizAttempt.rawAttributes.finishedAt);
  assert.ok(models.QuizAttempt.rawAttributes.passed);
  assert.equal(models.QuizAttempt.rawAttributes.score.allowNull, true);
  assert.deepEqual(models.Book.rawAttributes.format.values, ['print', 'ebook']);
  assert.deepEqual(models.Book.rawAttributes.status.values, ['draft', 'published', 'archived']);
  assert.ok(models.Book.rawAttributes.publishedAt);
  assert.ok(models.SlugRedirect.rawAttributes.oldSlug);
  assert.ok(models.AdminPasswordReset.rawAttributes.tokenHash);
  assert.ok(models.Book.rawAttributes.price);
  assert.ok(models.MediaAsset.rawAttributes.depictionPolicyConfirmed);
  assert.ok(models.StyleGuide.rawAttributes.referenceImages);
  assert.ok(models.StoreCartItem.rawAttributes.quantity);
  assert.ok(models.StoreOrder.rawAttributes.stripeCheckoutSessionId);
  assert.ok(models.StoreOrder.rawAttributes.shippingAddress);
  assert.ok(models.StoreOrder.rawAttributes.fulfillmentStatus);
  assert.ok(models.Subscription.rawAttributes.stripeCheckoutSessionId);
  assert.deepEqual(models.Subscription.rawAttributes.status.values, [
    'incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'expired'
  ]);
  assert.ok(models.Entitlement.rawAttributes.expiresAt);
  assert.ok(models.Entitlement.rawAttributes.orderItemId);
  assert.ok(models.ProcessedWebhookEvent.rawAttributes.stripeEventId);
});

test('les associations relient les histoires, leurs parties, quiz et offres de livres', () => {
  assert.equal(models.Story.associations.parts.foreignKey, 'storyId');
  assert.equal(models.Quiz.associations.questions.foreignKey, 'quizId');
  assert.equal(models.Book.associations.orderItems.foreignKey, 'bookId');
  assert.equal(models.StoreCart.associations.items.foreignKey, 'cartId');
  assert.equal(models.User.associations.subscriptions.foreignKey, 'userId');
  assert.equal(models.StoreOrderItem.associations.entitlement.foreignKey, 'orderItemId');
});
