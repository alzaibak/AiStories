import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ORIGIN, attachDiagnostics, PUBLIC_ORIGIN, QA_DATA, QA_DIR, textAnomalies } from '../helpers';

const LOG = path.join(QA_DIR, 'artifacts', 'admin.log');
function log(line: string) {
  fs.appendFileSync(LOG, `${line}\n`);
}

const ADMIN_ROUTES = [
  ['dashboard', '/ar/admin'],
  ['stories', '/ar/admin/content/stories'],
  ['story-new', '/ar/admin/content/stories/new'],
  ['collections', '/ar/admin/content/collections'],
  ['quizzes', '/ar/admin/content/quizzes'],
  ['videos', '/ar/admin/content/videos'],
  ['media', '/ar/admin/content/media'],
  ['review-queue', '/ar/admin/content/review-queue'],
  ['requests', '/ar/admin/content/requests'],
  ['badges', '/ar/admin/community/badges'],
  ['reviews', '/ar/admin/community/reviews'],
  ['events', '/ar/admin/community/events'],
  ['teams', '/ar/admin/community/teams'],
  ['books', '/ar/admin/shop/books'],
  ['mystery-boxes', '/ar/admin/shop/mystery-boxes'],
  ['mystery-box-new', '/ar/admin/shop/mystery-boxes/new'],
  ['orders', '/ar/admin/orders'],
  ['payments', '/ar/admin/money/payments'],
  ['donations', '/ar/admin/money/donations'],
  ['promo-codes', '/ar/admin/money/promo-codes'],
  ['subscriptions', '/ar/admin/subscriptions'],
  ['users', '/ar/admin/system/users'],
  ['emails', '/ar/admin/system/emails'],
  ['policy', '/ar/admin/system/policy'],
  ['system', '/ar/admin/system'],
  ['unknown', '/ar/admin/page-inexistante']
];

test.use({ storageState: path.join(QA_DIR, 'state', 'admin-superadmin.json') });

test('super-admin: balayage de tout le portail', async ({ page }) => {
  test.setTimeout(300_000);
  fs.writeFileSync(LOG, `# admin sweep ${new Date().toISOString()}\n`);
  const diagnostics = attachDiagnostics(page);
  for (const [label, route] of ADMIN_ROUTES) {
    diagnostics.httpErrors.length = 0;
    diagnostics.pageErrors.length = 0;
    diagnostics.consoleErrors.length = 0;
    await page.goto(`${ADMIN_ORIGIN}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(700);
    const body = await page.evaluate(() => document.body?.innerText || '');
    const anomalies = await textAnomalies(page);
    const h1 = await page.locator('h1').allInnerTexts().catch(() => []);
    log(`ROUTE ${label} ${route} final=${page.url().replace(ADMIN_ORIGIN, '')} h1=${JSON.stringify(h1.slice(0, 2))} len=${body.length}`);
    if (anomalies.length) log(`  ANOMALIES ${JSON.stringify(anomalies)}`);
    if (diagnostics.httpErrors.length) log(`  HTTP ${JSON.stringify(diagnostics.httpErrors)}`);
    if (diagnostics.pageErrors.length) log(`  CRASH ${JSON.stringify(diagnostics.pageErrors)}`);
    if (diagnostics.consoleErrors.length) log(`  CONSOLE ${JSON.stringify(diagnostics.consoleErrors.map((e) => e.slice(0, 160)))}`);
    expect.soft(diagnostics.pageErrors, `crash JS sur ${label}`).toEqual([]);
    expect.soft(diagnostics.httpErrors.filter((line) => line.startsWith('5')), `5xx sur ${label}`).toEqual([]);
  }
});

test('mystery box: ouverture de l’éditeur, enregistrement, export CSV', async ({ page }) => {
  test.setTimeout(180_000);
  const diagnostics = attachDiagnostics(page);
  await page.goto(`${ADMIN_ORIGIN}/ar/admin/shop/mystery-boxes`, { waitUntil: 'networkidle' });
  const editLink = page.getByRole('link', { name: /تعديل|modifier/i }).first();
  log(`BOXES editLink=${await editLink.count()}`);
  await editLink.click();
  await page.waitForLoadState('networkidle');
  const boxUrl = page.url();
  log(`BOX_EDIT url=${boxUrl}`);
  await page.getByRole('button', { name: /^حفظ$|^enregistrer$/i }).first().click();
  await page.waitForTimeout(2500);
  const body = await page.evaluate(() => document.body?.innerText || '');
  log(`BOX_SAVE http=${JSON.stringify(diagnostics.httpErrors.slice(0, 5))} body=${body.replace(/\n/g, ' | ').slice(0, 300)}`);

  const boxId = boxUrl.match(/mystery-boxes\/(\d+)\/edit/)?.[1];
  if (boxId) {
    await page.goto(`${ADMIN_ORIGIN}/ar/admin/shop/mystery-boxes/${boxId}/purchases`, { waitUntil: 'networkidle' });
    const download = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    await page.getByRole('button', { name: /تصدير CSV|export/i }).first().click();
    const file = await download;
    log(`BOX_CSV download=${file ? file.suggestedFilename() : 'none'}`);
    if (file) await file.saveAs(path.join(QA_DIR, 'artifacts', 'export-box.csv'));
  }
});

test('livre: publication depuis l’admin puis visible dans la boutique publique', async ({ page }) => {
  test.setTimeout(180_000);
  page.on('dialog', (dialog) => dialog.accept());
  const diagnostics = attachDiagnostics(page);
  await page.goto(`${ADMIN_ORIGIN}/ar/admin/shop/books`, { waitUntil: 'networkidle' });
  const row = page.locator('tr', { hasText: 'kindness-lantern-demo' });
  log(`BOOKS row=${await row.count()}`);
  await row.getByRole('button', { name: /^نشر$|^publier$/i }).first().click();
  await page.waitForTimeout(2500);
  const adminBody = await page.evaluate(() => document.body?.innerText || '');
  log(`BOOK_PUBLISH http=${JSON.stringify(diagnostics.httpErrors.slice(0, 5))} row=${(adminBody.split('kindness-lantern-demo')[1] || '').slice(0, 120).replace(/\n/g, ' | ')}`);

  const response = await page.request.get(`${PUBLIC_ORIGIN}/api/v1/books?lang=ar`);
  const books = await response.json();
  log(`PUBLIC_BOOKS status=${response.status()} count=${Array.isArray(books) ? books.length : 'n/a'} slugs=${JSON.stringify((books || []).map((b: { slug: string }) => b.slug))}`);
  await page.goto(`${PUBLIC_ORIGIN}/ar/books`, { waitUntil: 'networkidle' });
  const publicBody = await page.evaluate(() => document.body?.innerText || '');
  log(`PUBLIC_STORE hasBook=${/مصباح اللطف|kindness/i.test(publicBody)} body=${publicBody.replace(/\n/g, ' | ').slice(150, 500)}`);
});

test('utilisateurs: statuts affichés et confirmation des actions destructrices', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.goto(`${ADMIN_ORIGIN}/ar/admin/system/users`, { waitUntil: 'networkidle' });
  const body = await page.evaluate(() => document.body?.innerText || '');
  log(`USERS hasRawStatus=${/ACTIVE|SUSPENDED|PENDING/.test(body)} body=${body.replace(/\n/g, ' | ').slice(0, 400)}`);
  const targetRow = page.locator('tr', { hasText: 'qa.pending@qa.test' });
  const suspend = targetRow.getByRole('button', { name: /تعليق|suspend/i }).first();
  if (await suspend.count()) {
    await suspend.click();
    await page.waitForTimeout(1500);
    log(`SUSPEND dialogs=${JSON.stringify(dialogs)}`);
  } else {
    log('SUSPEND_BUTTON_NOT_FOUND');
  }
});

for (const role of ['editor', 'reviewer', 'admin'] as const) {
  test(`${role}: accès directs aux pages réservées`, async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ storageState: path.join(QA_DIR, 'state', `admin-${role}.json`) });
    const page = await context.newPage();
    const diagnostics = attachDiagnostics(page);
    for (const route of ['/ar/admin', '/ar/admin/content/stories', '/ar/admin/content/review-queue', '/ar/admin/system/users', '/ar/admin/money/payments', '/ar/admin/orders']) {
      diagnostics.httpErrors.length = 0;
      await page.goto(`${ADMIN_ORIGIN}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(600);
      const body = await page.evaluate(() => document.body?.innerText || '');
      log(`ROLE ${role} ${route} -> ${page.url().replace(ADMIN_ORIGIN, '')} http=${JSON.stringify(diagnostics.httpErrors.slice(0, 3))} text=${body.replace(/\n/g, ' | ').slice(0, 120)}`);
    }
    await context.close();
  });
}
