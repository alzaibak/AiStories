import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ORIGIN, attachDiagnostics, QA_DATA, QA_DIR, waitForVerificationCode } from '../helpers';

// Establishes one real UI session per role (reader + the four admin roles) and
// saves the browser state so the other specs never consume the login rate limit.
const STATE_DIR = path.join(QA_DIR, 'state');
fs.mkdirSync(STATE_DIR, { recursive: true });

async function readerLogin(page: Page, email: string, password: string) {
  await page.goto('/ar/login', { waitUntil: 'networkidle' });
  await page.locator('form input[type="email"]').fill(email);
  await page.locator('form input[type="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForLoadState('networkidle');
}

async function adminLoginWithCode(page: Page, email: string, password: string) {
  await page.goto(`${ADMIN_ORIGIN}/ar/admin/login`, { waitUntil: 'networkidle' });
  await page.locator('form input[type="email"]').fill(email);
  await page.locator('form input[type="password"]').fill(password);
  await page.locator('form button').last().click();
  const codeInput = page.locator('form input[inputmode="numeric"]');
  await codeInput.waitFor({ state: 'visible', timeout: 20_000 });
  const code = await waitForVerificationCode(email);
  await codeInput.fill(code);
  await page.locator('form button').last().click();
  await page.waitForLoadState('networkidle');
}

test('session lecteur vérifié', async ({ page }) => {
  const diagnostics = attachDiagnostics(page);
  await readerLogin(page, QA_DATA.emails.reader, QA_DATA.password);
  await page.waitForTimeout(1000);
  const stored = await page.evaluate(() => Object.keys(localStorage));
  console.log('[setup] reader url', page.url(), 'storage', stored, 'http', diagnostics.httpErrors.slice(0, 3));
  await page.context().storageState({ path: path.join(STATE_DIR, 'reader-public.json') });
  await expect(page).not.toHaveURL(/\/login/);
});

for (const role of ['editor', 'reviewer', 'admin', 'superadmin'] as const) {
  test(`session ${role} (mot de passe + code email)`, async ({ page }) => {
    const diagnostics = attachDiagnostics(page);
    await adminLoginWithCode(page, QA_DATA.emails[role], QA_DATA.password);
    await page.waitForTimeout(1200);
    console.log(`[setup] ${role} url`, page.url(), 'http', diagnostics.httpErrors.slice(0, 5), 'pageErrors', diagnostics.pageErrors.slice(0, 2));
    await page.context().storageState({ path: path.join(STATE_DIR, `admin-${role}.json`) });
    expect(page.url()).toContain('/admin');
  });
}
