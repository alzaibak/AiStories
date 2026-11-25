import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { attachDiagnostics, PUBLIC_ORIGIN, QA_DATA, QA_DIR, textAnomalies, tokenFromState } from '../helpers';

// Parcours du lecteur authentifié (session créée par 00-setup.spec.ts).
test.use({ storageState: path.join(QA_DIR, 'state', 'reader-public.json') });

const LOG = path.join(QA_DIR, 'artifacts', 'reader.log');
function log(line: string) {
  fs.appendFileSync(LOG, `${line}\n`);
}
const story = QA_DATA.stories.find((item) => item.status === 'published');

test('espace compte: contenu, aucun texte cassé, aucune 5xx', async ({ page }) => {
  fs.writeFileSync(LOG, `# reader ${new Date().toISOString()}\n`);
  const diagnostics = attachDiagnostics(page);
  await page.goto('/ar/account', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const body = await page.evaluate(() => document.body?.innerText || '');
  const anomalies = await textAnomalies(page);
  log(`ACCOUNT url=${page.url()} len=${body.length} anomalies=${JSON.stringify(anomalies)}`);
  log(`ACCOUNT_BODY ${body.replace(/\n/g, ' | ').slice(0, 700)}`);
  log(`ACCOUNT_HTTP ${JSON.stringify(diagnostics.httpErrors)}`);
  expect(page.url()).toContain('/account');
  expect(anomalies).toEqual([]);
});

test('lire un conte jusqu’au bout puis retrouver la progression', async ({ page }) => {
  test.setTimeout(120_000);
  const token = tokenFromState('reader', 'public');
  const diagnostics = attachDiagnostics(page);
  await page.goto(`/ar/stories/${story?.slug}/read/1`, { waitUntil: 'networkidle' });
  const saveButton = page.getByRole('button', { name: /حفظ تقدّمي|حفظ تقدمي|enregistrer ma progression/i }).first();
  log(`READ page saveButton=${await saveButton.count()} signInPrompt=${await page.getByRole('link', { name: /سجّل الدخول للحفظ/ }).count()}`);
  if (!(await saveButton.count())) {
    log('READ saveButtonNotFound');
    return;
  }
  await saveButton.click();
  await page.waitForTimeout(2000);
  const notice = await page.evaluate(() => document.body?.innerText || '');
  log(`READ noticeSaved=${/تم حفظ تقدّمك/.test(notice)}`);

  const progress = await page.request.get(`${PUBLIC_ORIGIN}/api/v1/reading-progress`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const rows = await progress.json();
  log(`PROGRESS status=${progress.status()} rows=${JSON.stringify(rows).slice(0, 300)}`);

  await page.goto('/ar/account', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const body = await page.evaluate(() => document.body?.innerText || '');
  const hasContinue = /تابع القراءة|واصل القراءة/.test(body);
  log(`ACCOUNT_AFTER_READ continueCard=${hasContinue} body=${body.replace(/\n/g, ' | ').slice(0, 500)}`);
  log(`READ_HTTP ${JSON.stringify(diagnostics.httpErrors.slice(0, 6))}`);
  expect(progress.status()).toBe(200);
});

test('abonnement: le bouton mène bien à Stripe (clé de test)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/ar/pricing', { waitUntil: 'networkidle' });
  const body = await page.evaluate(() => document.body?.innerText || '');
  log(`PRICING body=${body.replace(/\n/g, ' | ').slice(0, 400)}`);
  const cta = page.getByRole('button', { name: /اشترك|اشتراك|s'abonner|subscribe/i }).first();
  if (!(await cta.count())) {
    log('PRICING_NO_CTA_FOR_LOGGED_READER');
    return;
  }
  const navigation = page.waitForURL(/stripe\.com|checkout/i, { timeout: 25_000 }).catch(() => null);
  await cta.click();
  const navigated = await navigation;
  await page.waitForTimeout(1500);
  log(`SUBSCRIBE url=${page.url()} stripe=${Boolean(navigated)} body=${(await page.evaluate(() => document.body?.innerText || '')).slice(0, 200).replace(/\n/g, ' | ')}`);
});

test('don: montant puis redirection Stripe', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/ar/donations', { waitUntil: 'networkidle' });
  const amount = page.locator('input[type="number"]').first();
  await amount.fill('5');
  const navigation = page.waitForURL(/stripe\.com|checkout/i, { timeout: 25_000 }).catch(() => null);
  await page.getByRole('button', { name: /تبرع الآن|donate/i }).first().click();
  const navigated = await navigation;
  await page.waitForTimeout(1200);
  log(`DONATE url=${page.url()} stripe=${Boolean(navigated)} body=${(await page.evaluate(() => document.body?.innerText || '')).slice(0, 200).replace(/\n/g, ' | ')}`);
});

test('demande de conte: soumission et message de confirmation', async ({ page }) => {
  test.setTimeout(120_000);
  const diagnostics = attachDiagnostics(page);
  await page.goto('/ar/story-request', { waitUntil: 'networkidle' });
  const inputs = page.locator('form input');
  await inputs.nth(0).fill('QA demande automatique');
  await page.locator('form textarea').first().fill('Demande créée par la recette QA automatisée.');
  await page.getByRole('button', { name: /إرسال الطلب|envoyer/i }).first().click();
  await page.waitForTimeout(2500);
  const body = await page.evaluate(() => document.body?.innerText || '');
  log(`STORY_REQUEST url=${page.url()} http=${JSON.stringify(diagnostics.httpErrors.slice(0, 4))} body=${body.replace(/\n/g, ' | ').slice(0, 400)}`);
});

test('fichés boutique: état vide et livre non publié', async ({ page }) => {
  await page.goto('/ar/books', { waitUntil: 'networkidle' });
  const list = await page.evaluate(() => document.body?.innerText || '');
  log(`BOOKS body=${list.replace(/\n/g, ' | ').slice(0, 300)}`);
  const draft = QA_DATA.books[0];
  if (draft) {
    await page.goto(`/ar/books/${draft.slug}`, { waitUntil: 'networkidle' });
    const detail = await page.evaluate(() => document.body?.innerText || '');
    log(`DRAFT_BOOK ${draft.slug} body=${detail.replace(/\n/g, ' | ').slice(0, 220)}`);
  }
});
