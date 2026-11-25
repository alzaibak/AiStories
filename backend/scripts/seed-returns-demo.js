/*
 * Seeds the return/refund demo described for QA:
 *  - one physical book with a 4.90 EUR delivery fee,
 *  - one delivered order from 5 days ago and one from 20 days ago,
 *  - the default return policy (30-day window, 14-day legal withdrawal).
 *
 *   node scripts/seed-returns-demo.js
 *
 * Idempotent: it reuses the demo reader and the book if they already exist.
 */
require('dotenv').config();
const {
  sequelize,
  User,
  Book,
  StoreOrder,
  StoreOrderItem,
  ReturnPolicySettings
} = require('../models');
const { hashPassword } = require('../utils/security');

const DEMO_EMAIL = 'demo.returns@recis-islamiques.test';
const DEMO_PASSWORD = 'DemoReader2026!';
const BOOK_SLUG = 'livre-retours-demo';
const DELIVERY_FEE = '4.90';
const BOOK_PRICE = '24.90';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

async function ensureReader() {
  const [user, created] = await User.findOrCreate({
    where: { email: DEMO_EMAIL },
    defaults: {
      firstName: 'Yasmine',
      lastName: 'Retours',
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      role: 'READER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      language: 'fr',
      emailPreferences: { marketing: false, reminders: true }
    }
  });
  if (!created) await user.update({ passwordHash: await hashPassword(DEMO_PASSWORD) });
  return { user, created };
}

async function ensureBook() {
  const [book, created] = await Book.findOrCreate({
    where: { slug: BOOK_SLUG },
    defaults: {
      title: 'Livre papier — démonstration des retours',
      description: 'Livre papier vendu avec 4.90 EUR de frais de livraison pour tester les retours.',
      slug: BOOK_SLUG,
      format: 'print',
      price: BOOK_PRICE,
      currency: 'EUR',
      stockQuantity: 50,
      isReturnable: true,
      returnWindowDays: null,
      status: 'published',
      isPublished: true,
      publishedAt: new Date(),
      translations: {
        en: { title: 'Print book — returns demo', description: 'Print book with a 4.90 EUR delivery fee.' },
        fr: { title: 'Livre papier — démonstration des retours', description: 'Livre papier vendu avec 4.90 EUR de frais de livraison.' }
      }
    }
  });
  if (!created) await book.update({ isReturnable: true, format: 'print', status: 'published', isPublished: true });
  return book;
}

async function ensureDeliveredOrder(user, book, days) {
  const deliveredAt = daysAgo(days);
  const shippedAt = daysAgo(days + 4);
  const subtotal = Number(BOOK_PRICE);
  const total = subtotal + Number(DELIVERY_FEE);
  const order = await StoreOrder.findOne({
    where: { userId: user.id, subtotal: BOOK_PRICE, total: total.toFixed(2) },
    order: [['id', 'ASC']]
  });
  if (order) return { order, created: false };

  const created = await StoreOrder.create({
    userId: user.id,
    status: 'paid',
    fulfillmentStatus: 'delivered',
    currency: 'EUR',
    subtotal: BOOK_PRICE,
    discountAmount: '0.00',
    total: total.toFixed(2),
    paidAmount: total.toFixed(2),
    shippingAddress: {
      name: 'Yasmine Retours',
      line1: '12 rue des Tests',
      postalCode: '75001',
      city: 'Paris',
      country: 'FR',
      phone: '+33600000000'
    },
    shippedAt,
    deliveredAt
  });

  await StoreOrderItem.create({
    orderId: created.id,
    bookId: book.id,
    titleSnapshot: book.title,
    unitPrice: BOOK_PRICE,
    quantity: 1,
    pricePaidAfterDiscount: BOOK_PRICE,
    isReturnable: true,
    returnWindowDays: null,
    legalWithdrawalDays: 14,
    definedShippingFee: DELIVERY_FEE,
    shippingFeeCharged: DELIVERY_FEE
  });

  return { order: created, created: true };
}

async function main() {
  await sequelize.authenticate();

  const [policy] = await ReturnPolicySettings.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });
  await policy.update({
    returnsEnabled: true,
    defaultReturnWindowDays: 30,
    legalWithdrawalDays: 14,
    applyLegalWithdrawalRules: true,
    deliveryDeductionMode: 'defined_fee',
    shipBackDeadlineDays: 14,
    refundDeadlineDays: 14
  });
  console.log('return policy: 30-day window, 14-day legal withdrawal');

  const { user, created } = await ensureReader();
  console.log(`${created ? 'created' : 'kept'} reader ${user.email} (password ${DEMO_PASSWORD})`);

  const book = await ensureBook();
  console.log(`book ${book.slug}: ${BOOK_PRICE} EUR + ${DELIVERY_FEE} EUR delivery`);

  for (const days of [5, 20]) {
    const result = await ensureDeliveredOrder(user, book, days);
    console.log(`${result.created ? 'created' : 'kept'} delivered order #${result.order.id} (delivered ${days} days ago)`);
  }

  await sequelize.close();
}

main().catch(async (error) => {
  console.error('Returns demo seed failed:', error);
  try {
    await sequelize.close();
  } catch (closeError) {
    // ignore
  }
  process.exitCode = 1;
});
