import { test, expect } from '@playwright/test';
import { attachDiagnostics, dumpDiagnostics, PUBLIC_ROUTES, QA_DATA, QA_DIR, resetDiagnostics, textAnomalies } from '../helpers';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACTS = path.join(QA_DIR, 'artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });
const logFile = path.join(ARTIFACTS, 'sweep-public.log');

function log(line: string) {
  fs.appendFileSync(logFile, `${line}\n`);
}

const publishedStory = QA_DATA.stories.find((story) => story.status === 'published');
const publishedBook = QA_DATA.books.find((book) => book.status === 'published');
const collection = QA_DATA.collections[0];

const routes = [
  ...PUBLIC_ROUTES,
  ...(publishedStory ? [`/ar/stories/${publishedStory.slug}`, `/ar/stories/${publishedStory.slug}/read/1`] : []),
  ...(publishedBook ? [`/ar/books/${publishedBook.slug}`] : []),
  ...(collection ? [`/ar/collections/${collection.slug}`] : []),
  '/ar/mystery-box/success?session_id=qa-fake'
];

test('sweep visiteur: chaque route publique répond sans erreur JS, 5xx ni texte cassé', async ({ page }) => {
  test.setTimeout(240_000);
  const diagnostics = attachDiagnostics(page);
  fs.writeFileSync(logFile, `# public sweep ${new Date().toISOString()}\n`);

  for (const route of routes) {
    resetDiagnostics(diagnostics);
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(600);

    const status = response?.status() ?? 0;
    const url = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const title = await page.title();
    const anomalies = await textAnomalies(page);
    const blank = bodyText.trim().length < 40;
    const serverError = diagnostics.httpErrors.filter((line) => line.startsWith('5'));
    const notFound = diagnostics.httpErrors.filter((line) => line.startsWith('404'));

    log(`ROUTE ${route}`);
    log(`  status=${status} final=${url.replace('http://127.0.0.1:5173', '')} title="${title}" text=${bodyText.trim().length}`);
    if (blank) log('  BLANK_PAGE');
    if (anomalies.length) log(`  ANOMALIES ${JSON.stringify(anomalies)}`);
    if (diagnostics.pageErrors.length) log(`  PAGE_ERROR ${JSON.stringify(diagnostics.pageErrors)}`);
    if (serverError.length) log(`  5XX ${JSON.stringify(serverError)}`);
    if (notFound.length) log(`  404 ${JSON.stringify(notFound)}`);
    if (diagnostics.consoleErrors.length) log(`  CONSOLE ${JSON.stringify(diagnostics.consoleErrors.map((e) => e.slice(0, 200)))}`);
    if (diagnostics.requestFailures.length) log(`  REQ_FAIL ${JSON.stringify(diagnostics.requestFailures)}`);

    expect.soft(diagnostics.pageErrors, `erreur JS sur ${route}`).toEqual([]);
    expect.soft(serverError, `réponse 5xx sur ${route}`).toEqual([]);
    expect.soft(blank, `page blanche sur ${route}`).toBe(false);
  }
  dumpDiagnostics('public-sweep', diagnostics);
});

test('crawl des liens de navigation du site public', async ({ page }) => {
  test.setTimeout(180_000);
  const diagnostics = attachDiagnostics(page);
  await page.goto('/ar', { waitUntil: 'networkidle' });

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((anchor) => (anchor as HTMLAnchorElement).href)
  );
  const sameOrigin = [...new Set(links)]
    .filter((href) => href.startsWith('http://127.0.0.1:5173'))
    .map((href) => href.replace('http://127.0.0.1:5173', ''))
    .filter((href) => !href.startsWith('/api'));

  log(`\n# nav links found on /ar (${sameOrigin.length})`);
  for (const href of sameOrigin) {
    resetDiagnostics(diagnostics);
    const response = await page.goto(href, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const status = response?.status() ?? 0;
    const text = await page.evaluate(() => document.body?.innerText?.trim().length || 0);
    const problems = diagnostics.httpErrors.filter((line) => !/favicon/.test(line));
    log(`LINK ${href} status=${status} text=${text} problems=${JSON.stringify(problems)}`);
    expect.soft(problems.filter((line) => line.startsWith('5')), `5xx sur le lien ${href}`).toEqual([]);
  }
});
