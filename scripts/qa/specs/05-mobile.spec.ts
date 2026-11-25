import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ORIGIN, attachDiagnostics, QA_DATA, QA_DIR } from '../helpers';

const LOG = path.join(QA_DIR, 'artifacts', 'mobile.log');
function log(line: string) {
  fs.appendFileSync(LOG, `${line}\n`);
}

const story = QA_DATA.stories.find((item) => item.status === 'published');

const PAGES = [
  ['home', '/ar'],
  ['stories', '/ar/stories'],
  ['story', `/ar/stories/${story?.slug}`],
  ['reader', `/ar/stories/${story?.slug}/read/1`],
  ['pricing', '/ar/pricing'],
  ['donations', '/ar/donations'],
  ['login', '/ar/login'],
  ['register', '/ar/register']
];

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('mobile 390px: débordement horizontal, cibles tactiles, erreurs JS', async ({ page }) => {
  test.setTimeout(240_000);
  fs.writeFileSync(LOG, `# mobile ${new Date().toISOString()}\n`);
  const diagnostics = attachDiagnostics(page);

  for (const [label, route] of PAGES) {
    diagnostics.httpErrors.length = 0;
    diagnostics.pageErrors.length = 0;
    await page.goto(route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    const metrics = await page.evaluate(() => {
      const overflowing = Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && (rect.right > window.innerWidth + 2 || rect.left < -2);
        })
        .slice(0, 6)
        .map((node) => `${node.tagName.toLowerCase()}.${(node.className || '').toString().split(' ').slice(0, 2).join('.')}`);
      const smallTargets = Array.from(document.querySelectorAll<HTMLElement>('a,button,input[type="checkbox"],select'))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.height < 24 || rect.width < 24);
        })
        .slice(0, 6)
        .map((node) => `${node.tagName.toLowerCase()} "${(node.textContent || '').trim().slice(0, 24)}" ${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        overflowing,
        smallTargets
      };
    });
    const overflow = metrics.scrollWidth - metrics.innerWidth;
    log(`MOBILE ${label} ${route} scrollWidth=${metrics.scrollWidth} viewport=${metrics.innerWidth} overflow=${overflow}px`);
    if (metrics.overflowing.length) log(`  OUT_OF_BOUNDS ${JSON.stringify(metrics.overflowing)}`);
    if (metrics.smallTargets.length) log(`  SMALL_TARGETS ${JSON.stringify(metrics.smallTargets)}`);
    if (diagnostics.pageErrors.length) log(`  CRASH ${JSON.stringify(diagnostics.pageErrors)}`);
    expect.soft(overflow, `débordement horizontal sur ${label}`).toBeLessThanOrEqual(2);
  }
});

test('mobile 390px: tableau de bord admin', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${ADMIN_ORIGIN}/ar/admin`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(900);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  log(`MOBILE admin scrollWidth=${metrics.scrollWidth} viewport=${metrics.innerWidth} overflow=${metrics.scrollWidth - metrics.innerWidth}px url=${page.url()}`);
});
