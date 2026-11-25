import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ORIGIN, adminLogin, attachDiagnostics, dumpPage, login, QA_DATA, QA_DIR, waitForVerificationCode } from '../helpers';

// Exploratory dump used to map real labels/routes before writing the journeys.
const LOG = path.join(QA_DIR, 'artifacts', 'discovery.log');

test('discovery: pages publiques et espace lecteur', async ({ page }) => {
  test.setTimeout(180_000);
  const diagnostics = attachDiagnostics(page);
  const publishedStory = QA_DATA.stories.find((story) => story.status === 'published');
  const publishedBook = QA_DATA.books.find((book) => book.status === 'published');
  const routes = [
    ['home', '/ar'],
    ['stories', '/ar/stories'],
    ['story', `/ar/stories/${publishedStory?.slug}`],
    ['reader', `/ar/stories/${publishedStory?.slug}/read/1`],
    ['books', '/ar/books'],
    ['book', `/ar/books/${publishedBook?.slug}`],
    ['donations', '/ar/donations'],
    ['membership', '/ar/membership'],
    ['pricing', '/ar/pricing'],
    ['events', '/ar/events'],
    ['story-request', '/ar/story-request']
  ];
  fs.writeFileSync(LOG, `# discovery ${new Date().toISOString()}\n`);
  for (const [label, route] of routes) {
    await page.goto(route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
    await dumpPage(page, `public:${label}`, LOG);
  }

  await login(page, QA_DATA.emails.reader);
  for (const [label, route] of [['account', '/ar/account'], ['home-logged', '/ar'], ['story-logged', `/ar/stories/${publishedStory?.slug}`]]) {
    await page.goto(route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
    await dumpPage(page, `reader:${label}`, LOG);
  }
  console.log('discovery public done', diagnostics.consoleErrors.length, 'console errors');
});

test.use({ storageState: path.join(QA_DIR, 'state', 'admin-superadmin.json') });

test('discovery: portail admin', async ({ page }) => {
  test.setTimeout(180_000);
  const routes = [
    ['dashboard', '/ar/admin'],
    ['stories', '/ar/admin/content/stories'],
    ['story-new', '/ar/admin/content/stories/new'],
    ['collections', '/ar/admin/content/collections'],
    ['quizzes', '/ar/admin/content/quizzes'],
    ['review-queue', '/ar/admin/content/review-queue'],
    ['books', '/ar/admin/shop/books'],
    ['mystery-boxes', '/ar/admin/shop/mystery-boxes'],
    ['mystery-box-new', '/ar/admin/shop/mystery-boxes/new'],
    ['orders', '/ar/admin/orders'],
    ['donations', '/ar/admin/money/donations'],
    ['promo-codes', '/ar/admin/money/promo-codes'],
    ['subscriptions', '/ar/admin/subscriptions'],
    ['users', '/ar/admin/system/users'],
    ['emails', '/ar/admin/system/emails'],
    ['policy', '/ar/admin/system/policy'],
    ['system', '/ar/admin/system']
  ];
  for (const [label, route] of routes) {
    await page.goto(`${ADMIN_ORIGIN}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    await dumpPage(page, `admin:${label}`, LOG);
  }
  const box = QA_DATA.boxes[0];
  if (box) {
    await page.goto(`${ADMIN_ORIGIN}/ar/admin/shop/mystery-boxes/${box.id}/edit`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    await dumpPage(page, 'admin:mystery-box-edit', LOG);
    await page.goto(`${ADMIN_ORIGIN}/ar/admin/shop/mystery-boxes/${box.id}/purchases`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    await dumpPage(page, 'admin:mystery-box-purchases', LOG);
  }
  const story = QA_DATA.stories.find((item) => item.status === 'published');
  if (story) {
    await page.goto(`${ADMIN_ORIGIN}/ar/admin/content/stories/${story.id}/edit`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    await dumpPage(page, 'admin:story-edit', LOG);
  }
});
