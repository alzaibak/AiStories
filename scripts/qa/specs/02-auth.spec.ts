import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { attachDiagnostics, QA_DATA, QA_DIR, waitForVerificationCode } from '../helpers';

// Statuts de compte et parcours d'authentification (visiteur non connecté).
test.use({ storageState: { cookies: [], origins: [] } });

const LOG = path.join(QA_DIR, 'artifacts', 'auth.log');
function log(line: string) {
  fs.appendFileSync(LOG, `${line}\n`);
}

async function attemptLogin(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/ar/login', { waitUntil: 'networkidle' });
  await page.locator('form input[type="email"]').fill(email);
  await page.locator('form input[type="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1800);
  const errorText = await page.locator('[role="alert"], .text-red-700, .text-red-800').allInnerTexts().catch(() => []);
  const body = await page.evaluate(() => document.body?.innerText || '');
  return { url: page.url(), errorText: errorText.join(' | '), body };
}

test('mot de passe erroné, compte suspendu, compte non vérifié', async ({ page }) => {
  test.setTimeout(120_000);
  fs.writeFileSync(LOG, `# auth ${new Date().toISOString()}\n`);
  const diagnostics = attachDiagnostics(page);

  const wrong = await attemptLogin(page, QA_DATA.emails.reader, 'MauvaisMotDePasse!1');
  log(`WRONG_PASSWORD url=${wrong.url} error="${wrong.errorText}"`);
  expect(wrong.url).toContain('/login');

  const suspended = await attemptLogin(page, QA_DATA.emails.suspended, QA_DATA.password);
  log(`SUSPENDED url=${suspended.url} error="${suspended.errorText}"`);
  expect(suspended.url).toContain('/login');

  const unverified = await attemptLogin(page, QA_DATA.emails.unverified, QA_DATA.password);
  log(`UNVERIFIED url=${unverified.url} error="${unverified.errorText}"`);
  expect(unverified.url).toContain('/login');

  log(`HTTP ${JSON.stringify(diagnostics.httpErrors.slice(0, 6))}`);
});

test('inscription complète d’un lecteur avec code email capturé localement', async ({ page }) => {
  test.setTimeout(120_000);
  const email = `qa.${Date.now()}@qa.test`;
  await page.goto('/ar/register', { waitUntil: 'networkidle' });
  await page.locator('form input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').click();

  await page.locator('form input[inputmode="numeric"]').waitFor({ state: 'visible', timeout: 20_000 });
  const code = await waitForVerificationCode(email, 20_000, 6);
  log(`REGISTER email=${email} code=${code}`);
  await page.locator('form input[inputmode="numeric"]').fill(code);
  await page.locator('form button[type="submit"]').click();

  await page.locator('form input[autocomplete="given-name"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('form input[autocomplete="given-name"]').fill('Qa');
  await page.locator('form input[autocomplete="family-name"]').fill('Nouveau');
  const passwords = page.locator('form input[type="password"]');
  await passwords.nth(0).fill(QA_DATA.password);
  await passwords.nth(1).fill(QA_DATA.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(2500);
  const body = await page.evaluate(() => document.body?.innerText || '');
  log(`REGISTER_RESULT url=${page.url()} body="${body.slice(0, 300).replace(/\n/g, ' | ')}"`);
  expect(page.url()).toContain('/login');
});

test('déconnexion depuis l’espace compte', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/ar/account', { waitUntil: 'networkidle' });
  const body = await page.evaluate(() => document.body?.innerText || '');
  log(`ACCOUNT url=${page.url()} text=${body.slice(0, 400).replace(/\n/g, ' | ')}`);
  const logout = page.getByRole('button', { name: /خروج|déconnexion|logout|sign out/i }).first();
  if (await logout.count()) {
    await logout.click();
    await page.waitForTimeout(1200);
    log(`LOGOUT url=${page.url()} token=${await page.evaluate(() => localStorage.getItem('storiesToken'))}`);
  } else {
    log('LOGOUT_BUTTON_NOT_FOUND');
  }
});
