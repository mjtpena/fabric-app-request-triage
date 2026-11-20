// Dry run of demo/walkthrough.ts against the dev server (no recording): npx tsx scripts/dry-run.ts
import { chromium, type Locator } from '@playwright/test';
import { script } from '../demo/walkthrough';

const BASE = 'http://localhost:5208';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
let first = true;
const loc = (t: Locator | string) => (typeof t === 'string' ? page.locator(t) : t);
const h = {
  page,
  async goto(path: string, persona?: string) {
    const as = persona ?? (first ? script.persona : undefined);
    await page.goto(`${BASE}/${as ? `?as=${as}` : ''}#${path}`);
    first = false;
    await page.getByTestId('demo-banner').waitFor();
  },
  click: async (t: Locator | string) => loc(t).click({ timeout: 5000 }),
  type: async (t: Locator | string, s: string) => loc(t).fill(s, { timeout: 5000 }),
  fill: async (t: Locator | string, s: string) => loc(t).fill(s, { timeout: 5000 }),
  select: async (t: Locator | string, l: string) => void (await loc(t).selectOption({ label: l }, { timeout: 5000 })),
  hover: async (t: Locator | string) => loc(t).hover({ timeout: 5000 }),
  scrollTo: async (t: Locator | string) => loc(t).scrollIntoViewIfNeeded({ timeout: 5000 }),
  spotlight: async (t: Locator | string) => loc(t).first().waitFor({ timeout: 5000 }),
  pause: async (ms: number) => page.waitForTimeout(Math.min(ms, 300)),
};
for (const s of script.scenes) {
  await s.run(h as never);
  console.log('ok', s.id);
}
await browser.close();
