import type { Page, Response } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const QA_DIR = path.join(process.cwd(), 'scripts', 'qa');

export const QA_DATA = JSON.parse(
  fs.readFileSync(path.join(QA_DIR, 'qa-data.json'), 'utf8')
) as {
  password: string;
  accounts: Record<string, number>;
  emails: Record<string, string>;
  planSlug: string;
  campaignSlug: string;
  stories: Array<{ id: number; slug: string; status: string; isFree: boolean }>;
  collections: Array<{ id: number; slug: string; title: string }>;
  books: Array<{ id: number; slug: string; title: string; status: string; format: string; price: string }>;
  boxes: Array<{ id: number; slug: string; status: string; price: string }>;
};

export type Diagnostics = {
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  httpErrors: string[];
  requestFailures: string[];
};

/** Collects console/page/network problems for the current page. */
export function attachDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    httpErrors: [],
    requestFailures: []
  };
  page.on('console', (message) => {
    const text = `${message.text()}`;
    if (message.type() === 'error') diagnostics.consoleErrors.push(text);
    if (message.type() === 'warning') diagnostics.consoleWarnings.push(text);
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('response', (response: Response) => {
    const status = response.status();
    if (status >= 400) {
      diagnostics.httpErrors.push(`${status} ${response.request().method()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    diagnostics.requestFailures.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
  });
  return diagnostics;
}

export function resetDiagnostics(diagnostics: Diagnostics) {
  diagnostics.consoleErrors.length = 0;
  diagnostics.consoleWarnings.length = 0;
  diagnostics.pageErrors.length = 0;
  diagnostics.httpErrors.length = 0;
  diagnostics.requestFailures.length = 0;
}

const ANOMALY = /(^|\s)(undefined|null|NaN|\[object Object\])(\s|$|[.,;:!?])/;

/** Returns visible-text anomalies such as "undefined", "NaN", "[object Object]". */
export async function textAnomalies(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body?.innerText || '');
  const found: string[] = [];
  for (const line of text.split('\n')) {
    if (ANOMALY.test(line.trim())) found.push(line.trim().slice(0, 160));
  }
  return found;
}

export async function login(page: Page, email: string, password = QA_DATA.password) {
  await page.goto('/ar/login');
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  await page.getByRole('button', { name: /دخول|connexion|login|sign in/i }).first().click();
  await page.waitForLoadState('networkidle');
}

export const ADMIN_ORIGIN = 'http://127.0.0.1:5174';
export const PUBLIC_ORIGIN = 'http://127.0.0.1:5173';

/** Reads the JWT stored by a saved Playwright state file (for API-side checks). */
export function tokenFromState(role: string, app: 'admin' | 'public' = 'admin'): string {
  const file = path.join(QA_DIR, 'state', app === 'admin' ? `admin-${role}.json` : `${role}-public.json`);
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins) {
    const entry = origin.localStorage.find((item) => item.name === 'storiesToken');
    if (entry) return entry.value;
  }
  throw new Error(`Aucun token dans ${file}`);
}

export async function adminLogin(page: Page, email: string, password = QA_DATA.password) {
  await page.goto(`${ADMIN_ORIGIN}/ar/admin/login`);
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  await page.getByRole('button', { name: /دخول|connexion|login|sign in/i }).first().click();
  await page.waitForLoadState('networkidle');
}

const OUTBOX = path.join(QA_DIR, 'outbox');

/** Latest captured email body addressed to `email` (QA SMTP sink). */
export function latestMailFor(email: string): string | null {
  if (!fs.existsSync(OUTBOX)) return null;
  const files = fs.readdirSync(OUTBOX)
    .filter((file) => file.endsWith('.eml'))
    .map((file) => path.join(OUTBOX, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const recipients = content.split('\r\n')[0] || '';
    if (recipients.toLowerCase().includes(email.toLowerCase())) return content;
  }
  return null;
}

export async function waitForVerificationCode(email: string, timeoutMs = 15_000, digits = 8): Promise<string> {
  const startedAt = Date.now();
  const pattern = new RegExp(`\\b\\d{${digits}}\\b`);
  while (Date.now() - startedAt < timeoutMs) {
    const mail = latestMailFor(email);
    // \b keeps digits embedded in a hex token (e.g. c03628014c) from matching.
    const match = mail?.match(pattern);
    if (match) return match[0];
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Aucun code de vérification capturé pour ${email}.`);
}

/** Writes visible text and interactive elements of a page to the discovery log. */
export async function dumpPage(page: Page, label: string, logFile: string) {
  const data = await page.evaluate(() => ({
    url: location.pathname + location.search,
    title: document.title,
    h1: Array.from(document.querySelectorAll('h1,h2')).map((node) => (node.textContent || '').trim()).filter(Boolean).slice(0, 8),
    buttons: Array.from(document.querySelectorAll('button')).map((node) => (node.textContent || '').trim()).filter(Boolean).slice(0, 40),
    links: Array.from(document.querySelectorAll('a[href]'))
      .map((node) => `${(node.textContent || '').trim().slice(0, 40)} -> ${node.getAttribute('href')}`)
      .slice(0, 40),
    inputs: Array.from(document.querySelectorAll('input,select,textarea')).map((node) => {
      const element = node as HTMLInputElement;
      return `${element.type || element.tagName}:${element.name || element.id || element.getAttribute('aria-label') || ''}:${element.placeholder || ''}`;
    }).slice(0, 40),
    text: (document.body?.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 1500)
  }));
  fs.appendFileSync(logFile, `\n===== ${label} =====\n${JSON.stringify(data, null, 2)}\n`);
}

export function dumpDiagnostics(label: string, diagnostics: Diagnostics) {
  const noisy = diagnostics.httpErrors.filter((line) => !/favicon|\.map$/.test(line));
  if (noisy.length || diagnostics.pageErrors.length || diagnostics.consoleErrors.length) {
    console.log(`\n[diagnostics:${label}]`);
    for (const line of noisy) console.log(`  http  ${line}`);
    for (const line of diagnostics.pageErrors) console.log(`  crash ${line}`);
    for (const line of diagnostics.consoleErrors.slice(0, 8)) console.log(`  console ${line.slice(0, 300)}`);
  }
}

export const PUBLIC_ROUTES = [
  '/ar',
  '/fr',
  '/en',
  '/ar/stories',
  '/ar/books',
  '/ar/donations',
  '/ar/events',
  '/ar/membership',
  '/ar/pricing',
  '/ar/login',
  '/ar/register',
  '/ar/story-request',
  '/ar/account',
  '/ar/checkout/result',
  '/ar/policy',
  '/ar/policy/sources',
  '/ar/policy/depiction',
  '/ar/design',
  '/ar/workspace',
  '/ar/route-qui-nexiste-pas'
];
