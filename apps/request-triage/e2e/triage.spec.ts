import { expect, test, type Page } from '@playwright/test';

import { openApp, watchConsole } from '@x10/shared/e2e';

const moveButton = (page: Page, title: string) => page.getByRole('button', { name: `Move “${title}” to…` });

test('board offers only the allowed moves and moves a card', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/board');
  const title = 'Overtime hours trend by site';
  await expect(page.getByTestId('column-new').getByRole('link', { name: title })).toBeVisible();

  // Keyboard: focus the menu button and open it with the arrow key.
  await moveButton(page, title).focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', { name: `Move “${title}” to` });
  await expect(menu.getByRole('menuitem')).toHaveText(['Triaged', 'Declined']);
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Move to Triaged' });
  await dialog.getByRole('button', { name: 'Move to Triaged' }).click();
  await expect(dialog.getByText('Choose an effort size to triage this request.')).toBeVisible();
  await dialog.getByLabel('Effort size').selectOption('S');
  await dialog.getByRole('button', { name: 'Move to Triaged' }).click();

  await expect(page.getByTestId('column-triaged').getByRole('link', { name: title })).toBeVisible();
  await expect(page.getByTestId('column-new').getByRole('link', { name: title })).toHaveCount(0);

  // An in-progress card can go to Delivered or back to Planned, nothing else.
  await moveButton(page, 'Supplier on-time delivery scorecard').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Delivered', 'Planned']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Closed cards have no menu at all.
  await expect(page.getByTestId('column-delivered').getByRole('button', { name: /Move/ })).toHaveCount(0);
  consoleWatch.assertClean();
});

test('a move from a stale tab is refused, explained and refreshed', async ({ page, context }) => {
  const title = 'Sales forecast accuracy tracker';
  await openApp(page, '/?view=list');
  await page.getByTestId('queue-list').getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByTestId('triage-panel')).toContainText('Allowed from Triaged');

  // A second tab (same browser, same data) moves the request first.
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole('button', { name: 'Move to Planned…' }).click();
  await other.getByRole('dialog', { name: 'Move to Planned' }).getByRole('button', { name: 'Move to Planned' }).click();
  await expect(other.getByTestId('timeline')).toContainText('by Jordan Lee');
  await expect(other.getByTestId('triage-panel')).toContainText('Allowed from Planned');

  // The first tab still shows "Triaged" and tries to decline.
  await page.getByRole('button', { name: 'Decline…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move to Declined' });
  await dialog.getByLabel('Reason (shown to everyone)').fill('Covered by the CRM forecast report.');
  await dialog.getByRole('button', { name: 'Decline request' }).click();

  await expect(page.getByTestId('stale-alert')).toContainText('This request is now Planned, not Triaged');
  await expect(page.getByTestId('triage-panel')).toContainText('Allowed from Planned');
  await expect(page.getByTestId('decline-reason')).toHaveCount(0);
});

test('declining a request with supporters posts a comment naming them', async ({ page }) => {
  const title = 'Sales pipeline by region with weekly snapshots';
  await openApp(page, '/?view=list');
  await page.getByTestId('queue-list').getByRole('link', { name: title }).click();
  await page.getByRole('button', { name: 'Decline…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move to Declined' });
  await expect(dialog.getByTestId('decline-notice')).toContainText('1 supporter backs this request');
  await dialog.getByRole('button', { name: 'Decline request' }).click();
  await expect(dialog.getByText('A decline reason is required.')).toBeVisible();
  await dialog.getByLabel('Reason (shown to everyone)').fill('Already planned; please back the original.');
  await dialog.getByLabel('Duplicate of (optional)').selectOption({ label: 'Weekly sales pipeline by region (Planned)' });
  await dialog.getByRole('button', { name: 'Decline request' }).click();

  await expect(page.getByTestId('decline-reason')).toContainText('Already planned; please back the original.');
  await expect(page.getByTestId('decline-reason').getByRole('link', { name: 'Weekly sales pipeline by region' })).toBeVisible();
  await expect(page.getByTestId('comments')).toContainText('Declined as a duplicate of "Weekly sales pipeline by region"');
  await expect(page.getByTestId('comments')).toContainText('Notifying 1 supporter');
  await expect(page.getByTestId('timeline')).toContainText('Already planned; please back the original.');
});

test('requesters cannot triage, and edit only the description after triage', async ({ page }) => {
  await openApp(page, '/board', 'demo-priya');
  await expect(page.getByTestId('board-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Move “/ })).toHaveCount(0);

  await page.getByRole('link', { name: 'Invoice processing backlog by approver' }).click();
  await expect(page.getByTestId('triage-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit request' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit request' });
  await expect(dialog.getByText('only the description can change')).toBeVisible();
  await expect(dialog.getByLabel('Title')).toBeDisabled();
  await expect(dialog.getByLabel('Value')).toBeDisabled();
  await dialog.getByLabel('Description').fill('Invoices waiting for approval per approver and age band. Over-threshold invoices only.');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Over-threshold invoices only.')).toBeVisible();
});

test('backing a request toggles the supporter and raises the score', async ({ page }) => {
  await openApp(page, '/?view=list', 'demo-hannah');
  const title = 'Training completion rates by team';
  await page.getByTestId('queue-list').getByRole('link', { name: title }).click();
  await expect(page.getByTestId('detail-score')).toHaveText('5');
  await page.getByRole('button', { name: 'Back this request' }).click();
  await expect(page.getByRole('button', { name: 'You back this' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('detail-score')).toHaveText('5.5');
  await expect(page.getByTestId('supporters')).toContainText('Hannah Okafor (you)');
});
