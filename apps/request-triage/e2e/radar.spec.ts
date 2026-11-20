import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** The Today panel: the side panel on desktop, a bottom sheet behind the "Today" button on phones. */
async function today(page: Page) {
  if (isPhone(page)) {
    await page.getByRole('button', { name: /^Today/ }).click();
    return page.getByRole('dialog', { name: 'Today' });
  }
  return page.getByRole('complementary', { name: 'Today' });
}

test('the radar shows every request as a blip, ranked open ones first', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/');
  await expect(page.getByRole('heading', { level: 1, name: 'Request radar' })).toBeVisible();
  const blips = page.getByTestId('radar-blip');
  await expect(blips).toHaveCount(25);
  await expect(page.locator('[data-testid="radar-blip"][data-rank]')).toHaveCount(17);
  await expect(page.locator('[data-testid="radar-blip"][data-rank="1"]')).toHaveAttribute('aria-label', /Rank 1, Weekly sales pipeline by region/);
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('hovering a blip shows its score breakdown', async ({ page }) => {
  test.skip(isPhone(page), 'hover is a pointer interaction');
  await openApp(page, '/');
  await page.locator('[data-testid="radar-blip"][data-rank="1"]').hover();
  const card = page.getByTestId('blip-card');
  await expect(card).toContainText('Weekly sales pipeline by region');
  await expect(card).toContainText('Value 5 × 2');
  await expect(card).toContainText('Score');
});

test('lenses re-paint the radar and switch with number keys', async ({ page }) => {
  await openApp(page, '/');
  const lenses = page.getByRole('radiogroup', { name: 'Lens' });
  await expect(lenses.getByRole('radio', { name: /Score/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('2');
  await expect(lenses.getByRole('radio', { name: /Age/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/lens=age/);
  await expect(page.getByText('Age lens')).toBeVisible();
  await lenses.getByRole('radio', { name: /Status/ }).click();
  await expect(page).toHaveURL(/lens=status/);
  await expect(page.getByText('Status lens')).toBeVisible();
});

test('a Today item flies the radar to its request and switches lens', async ({ page }) => {
  await openApp(page, '/');
  const panel = await today(page);
  const item = panel.getByRole('button', { name: /Training completion rates by team/ });
  await expect(item).toContainText('Waiting for triage');
  await item.click();
  await expect(page).toHaveURL(/focus=/);
  await expect(page).toHaveURL(/lens=age/);
  await expect(page.locator('[data-testid="radar-blip"][aria-current="true"]')).toHaveAttribute('aria-label', /Training completion rates by team/);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('People sector');
  await expect(page.getByTestId('blip-card')).toContainText('Training completion rates by team');
  await page.getByTestId('blip-card').getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Training completion rates by team' })).toBeVisible();
});

test('view as requester changes Today to your own requests', async ({ page }) => {
  await openApp(page, '/', 'demo-priya');
  const viewAs = page.getByRole('radiogroup', { name: 'View as' });
  await expect(viewAs.getByRole('radio', { name: 'Requester' })).toHaveAttribute('aria-checked', 'true');
  let panel = await today(page);
  await expect(panel).toContainText('Quarterly revenue bridge for the board pack');
  await expect(panel).toContainText('Yours');
  if (isPhone(page)) await page.keyboard.press('Escape');
  await viewAs.getByRole('radio', { name: 'Data team' }).click();
  panel = await today(page);
  await expect(panel).toContainText('Waiting for triage');
});

test('the list view shows the same queue and links back to the radar', async ({ page }) => {
  await openApp(page, '/');
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page.getByTestId('queue-item')).toHaveCount(17);
  await expect(page.getByTestId('queue-item').first()).toContainText('Weekly sales pipeline by region');
  await page.getByTestId('queue-item').first().getByRole('button', { name: 'Show on radar' }).click();
  await expect(page.getByTestId('radar-blip').first()).toBeVisible();
  await expect(page.locator('[data-testid="radar-blip"][aria-current="true"]')).toHaveAttribute('data-rank', '1');
});

test('without WebGL the radar still draws (it is SVG) and the list is one click away', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await page.goto('/?nowebgl#/');
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByTestId('radar-blip')).toHaveCount(25);
  await page.keyboard.press('l');
  await expect(page.getByTestId('queue-item')).toHaveCount(17);
  consoleWatch.assertClean();
});

test('keyboard: j steps through the queue, Escape clears, ? opens the cheat sheet', async ({ page }) => {
  await openApp(page, '/');
  await expect(page.getByTestId('radar-blip')).toHaveCount(25);
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('j');
  await expect(page.locator('[data-testid="radar-blip"][aria-current="true"]')).toHaveAttribute('data-rank', '1');
  await page.keyboard.press('j');
  await expect(page.locator('[data-testid="radar-blip"][aria-current="true"]')).toHaveAttribute('data-rank', '2');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="radar-blip"][aria-current="true"]')).toHaveCount(0);
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});

test('the flight plan pulls likely duplicates onto the mini radar', async ({ page }) => {
  await openApp(page, '/submit', 'demo-priya');
  const radar = page.getByRole('img', { name: /Duplicate radar/ });
  await expect(radar).toHaveAttribute('aria-label', /none close/);
  await page.getByLabel('Title').fill('Pipeline by region for finance');
  await expect(radar).toHaveAttribute('aria-label', /2 similar open requests/);
  await expect(page.getByTestId('projection')).toContainText('Projected score');
});
