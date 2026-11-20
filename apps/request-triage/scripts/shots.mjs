// Screenshot helper for the redesign review: node scripts/shots.mjs <outDir> [filter]
// Needs the demo dev server on http://localhost:5208 (npm run dev).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/redesign';
const only = process.argv[3];
mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:5208';

const shots = [
  { name: 'radar', path: '/' },
  { name: 'radar-lens-age', path: '/?lens=age' },
  { name: 'radar-lens-team', path: '/?lens=team' },
  { name: 'radar-focus', path: '/', today: 0 },
  { name: 'radar-list', path: '/?view=list' },
  { name: 'radar-requester', path: '/', persona: 'demo-priya' },
  { name: 'flight-board', path: '/board' },
  { name: 'flight-plan', path: '/submit', type: 'Pipeline by region for finance' },
  { name: 'black-box', path: '/requests/__first__' },
  { name: 'insights', path: '/insights' },
  { name: 'about', path: '/about' },
];
const sizes = [
  { tag: 'desktop', width: 1280, height: 800 },
  { tag: 'mobile', width: 390, height: 844 },
];
const themes = ['light', 'dark'];

const browser = await chromium.launch();
for (const theme of themes)
  for (const size of sizes) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: theme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const s of shots) {
      const name = `${s.name}-${theme}-${size.tag}`;
      if (only && !name.includes(only)) continue;
      let path = s.path;
      if (path.includes('__first__')) {
        await page.goto(`${BASE}/#/?view=list`);
        await page.getByTestId('queue-item').first().waitFor();
        await page.getByLabel('Status').selectOption('all');
        const href = await page.getByTestId('queue-list').getByRole('link', { name: 'Website conversion funnel by device' }).getAttribute('href');
        path = href.replace(/^#/, '');
      }
      const q = `?as=${s.persona ?? 'demo-admin'}`;
      await page.goto(`${BASE}/${q}#${path}`);
      await page.waitForTimeout(900);
      if (s.today !== undefined) {
        if (size.tag === 'mobile') {
          await page.getByRole('button', { name: /^Today/ }).click();
          await page.waitForTimeout(400);
        }
        await page.locator('aside, dialog[open]').getByRole('button').filter({ hasText: /./ }).nth(s.today + (size.tag === 'mobile' ? 1 : 1)).click();
        await page.waitForTimeout(1200);
      }
      if (s.type) {
        await page.getByLabel('Title').fill(s.type);
        await page.waitForTimeout(700);
      }
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: size.tag === 'mobile' && !s.path.startsWith('/?') && s.path !== '/' });
      console.log('shot', name);
    }
    await ctx.close();
  }
await browser.close();
