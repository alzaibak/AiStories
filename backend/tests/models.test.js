const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../models');

test('les comptes et organisations portent les rôles et statuts métier', () => {
  assert.deepEqual(models.User.rawAttributes.role.values, ['SUPER_ADMIN', 'ADMIN', 'BUYER', 'SELLER']);
  assert.ok(models.User.rawAttributes.passwordHash);
  assert.equal(models.User.rawAttributes.password, undefined);
  assert.equal(models.User.rawAttributes.isAdmin, undefined);
  assert.equal(models.User.rawAttributes.subscribe, undefined);
  assert.ok(models.User.rawAttributes.emailVerifiedAt);
  assert.ok(models.User.rawAttributes.organizationId);
  assert.deepEqual(models.User.rawAttributes.language.values, ['fr', 'en', 'ar']);
  assert.deepEqual(models.Organization.rawAttributes.verificationStatus.values, [
    'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'
  ]);
});

test('les appels d’offres et offres exposent leurs champs pharmaceutiques et statuts', () => {
  for (const field of ['reference', 'buyerOrgId', 'deadline', 'visibility', 'requiredDocuments']) {
    assert.ok(models.Tender.rawAttributes[field], `Tender.${field} doit exister`);
  }
  assert.equal(models.Tender.rawAttributes.sealedOffers.defaultValue, true);
  for (const field of ['genericName', 'dosage', 'dosageForm', 'quantity', 'unit']) {
    assert.ok(models.TenderItem.rawAttributes[field], `TenderItem.${field} doit exister`);
  }
  assert.deepEqual(models.Offer.rawAttributes.status.values, [
    'DRAFT', 'SUBMITTED', 'SHORTLISTED', 'REJECTED', 'WON', 'WITHDRAWN'
  ]);
  assert.equal(models.Tender.options.paranoid, true);
  assert.equal(models.Offer.options.paranoid, true);
  assert.equal(models.Product.options.paranoid, true);
});

test('les associations relient l’organisation et ses appels d’offres', () => {
  assert.equal(models.User.associations.organization.foreignKey, 'organizationId');
  assert.equal(models.Organization.associations.tenders.foreignKey, 'buyerOrgId');
  assert.equal(models.Tender.associations.items.foreignKey, 'tenderId');
  assert.equal(models.Offer.associations.items.foreignKey, 'offerId');
});

test('les documents utilisent des clés privées et conservent la date de téléversement', () => {
  assert.ok(models.Document.rawAttributes.storageKey);
  assert.ok(models.Document.rawAttributes.uploadedAt);
  assert.equal(models.Document.rawAttributes.fileUrl.allowNull, true);
});

test('le catalogue contient uniquement les attributs pharmaceutiques et vendeurs', () => {
  for (const field of ['sellerOrgId', 'tradeName', 'genericName', 'dosage', 'dosageForm', 'originCountry', 'rcpUrl']) {
    assert.ok(models.Product.rawAttributes[field], `Product.${field} doit exister`);
  }
  for (const field of ['price', 'DiscountPrice', 'img', 'stockByVariant']) {
    assert.equal(models.Product.rawAttributes[field], undefined, `Product.${field} ne doit plus exister`);
  }
});
