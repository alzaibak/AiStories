import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ORIGIN, attachDiagnostics, QA_DATA, QA_DIR } from '../helpers';

const LOG = path.join(QA_DIR, 'artifacts', 'crosscheck.log');
function log(line: string) {
  fs.appendFileSync(LOG, `${line}\n`);
}

test.describe('visiteur', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('héros Mystery Box et liens retour Stripe', async ({ page }) => {
    test.setTimeout(120_000);
    const diagnostics = attachDiagnostics(page);
    await page.goto('/ar', { waitUntil: 'networkidle' });
    const heroLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="mystery-box"]')).map((node) => node.getAttribute('href'))
    );
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((node) => (node.textContent || '').trim()).filter(Boolean)
    );
    log(`HERO mysteryBoxLinks=${JSON.stringify(heroLinks)} buttons=${JSON.stringify(buttons)}`);
    log(`HERO_404 ${JSON.stringify(diagnostics.httpErrors.filter((line) => line.includes('404')))}`);

    for (const route of ['/ar/mystery-box', '/ar/mystery-box/success', '/ar/profile?tab=mystery-boxes']) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const text = await page.evaluate(() => document.body?.innerText || '');
      log(`ROUTE ${route} final=${new URL(page.url()).pathname} is404Page=${/غير موجودة|introuvable|not found/i.test(text)} len=${text.length}`);
    }
  });
});

test.describe('lecteur', () => {
  test.use({ storageState: path.join(QA_DIR, 'state', 'reader-public.json') });

  test('déconnexion et lien email « mes mystery boxes »', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/ar/account', { waitUntil: 'networkidle' });
    const accountBody = await page.evaluate(() => document.body?.innerText || '');
    log(`ACCOUNT mentionsMysteryBox=${/glموض|الغموض|mystery/i.test(accountBody)}`);
    const logout = page.getByRole('button', { name: /تسجيل الخروج|خروج|déconnexion|logout/i }).first();
    log(`LOGOUT_BUTTON count=${await logout.count()}`);
    if (await logout.count()) {
      await logout.click();
      await page.waitForTimeout(1500);
      log(`LOGOUT url=${new URL(page.url()).pathname} token=${await page.evaluate(() => localStorage.getItem('storiesToken'))}`);
    }
  });
});

test.describe('admin: cohérence des écrans', () => {
  test.use({ storageState: path.join(QA_DIR, 'state', 'admin-superadmin.json') });

  test('deux entrées de menu, même page', async ({ page }) => {
    test.setTimeout(120_000);
    const titles: string[] = [];
    for (const route of ['/ar/admin/orders', '/ar/admin/money/payments']) {
      await page.goto(`${ADMIN_ORIGIN}${route}`, { waitUntil: 'networkidle' });
      const h1 = await page.locator('h1').first().innerText().catch(() => '');
      titles.push(`${route} -> "${h1}"`);
    }
    log(`DUPLICATE_PAGES ${JSON.stringify(titles)}`);
  });

  test('bascule de langue du portail admin', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${ADMIN_ORIGIN}/ar/admin`, { waitUntil: 'networkidle' });
    const select = page.locator('select#admin-language, select[name="admin-language"]').first();
    if (!(await select.count())) {
      log('LANG_SWITCH not found');
      return;
    }
    await select.selectOption('fr');
    await page.waitForTimeout(1500);
    const body = await page.evaluate(() => document.body?.innerText || '');
    const arabicChars = (body.match(/[\u0600-\u06FF]/g) || []).length;
    log(`LANG_FR url=${new URL(page.url()).pathname} arabicChars=${arabicChars} body=${body.replace(/\n/g, ' | ').slice(0, 260)}`);
  });

  test('création puis suppression d’un brouillon de histoire (aller-retour API)', async ({ page }) => {
    test.setTimeout(150_000);
    page.on('dialog', (dialog) => dialog.accept());
    const diagnostics = attachDiagnostics(page);
    await page.goto(`${ADMIN_ORIGIN}/ar/admin/content/stories/new`, { waitUntil: 'networkidle' });
    const token = await page.evaluate(() => localStorage.getItem('storiesToken'));
    const response = await page.request.get(`${ADMIN_ORIGIN}/api/v1/admin/content/stories?lang=ar`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    log(`STORIES_API status=${response.status()} body=${(await response.text()).slice(0, 200)}`);
    const before = await page.locator('form input').first().inputValue().catch(() => '');
    log(`STORY_NEW firstInput="${before}" http=${JSON.stringify(diagnostics.httpErrors.slice(0, 3))}`);
  });
});
