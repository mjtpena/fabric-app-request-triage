import { expect, test } from '@playwright/test';

import { openApp, watchConsole } from '@x10/shared/e2e';

test('duplicate suggestions appear for a title sharing two or more words, and "back this instead" works', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/submit', 'demo-priya');
  const panel = page.getByTestId('duplicate-panel');
  await page.getByLabel('Title').fill('Pipeline health');
  await expect(panel).toContainText('None found');

  await page.getByLabel('Title').fill('Pipeline by region for finance');
  const suggestions = panel.getByTestId('duplicate-suggestion');
  await expect(suggestions).toHaveCount(2);
  await expect(suggestions.first()).toContainText('shares 2 words: pipeline, region');

  const weekly = suggestions.filter({ hasText: 'Sales pipeline by region with weekly snapshots' });
  await weekly.getByRole('button', { name: 'Back this instead' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sales pipeline by region with weekly snapshots' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'You back this' })).toBeVisible();
  await expect(page.getByTestId('supporters')).toContainText('Priya Nair (you)');
  consoleWatch.assertClean();
});

test('closed requests are never suggested', async ({ page }) => {
  await openApp(page, '/submit');
  // "Daily cash position feed" is delivered.
  await page.getByLabel('Title').fill('Daily cash position by bank');
  await expect(page.getByTestId('duplicate-panel')).toContainText('None found');
});

test('insights numbers match the seed data', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/insights');
  await expect(page.getByTestId('kpi-total')).toHaveText('25');
  await expect(page.getByTestId('kpi-open')).toHaveText('17');
  await expect(page.getByTestId('kpi-needs-triage')).toHaveText('2');
  await expect(page.getByTestId('kpi-median')).toHaveText('28');
  const funnel = page.getByTestId('funnel-table').locator('tbody tr');
  await expect(funnel).toHaveText([/New\s*25/, /Triaged\s*18/, /Planned\s*13/, /In progress\s*9/, /Delivered\s*5/]);
  const medians = page.getByTestId('median-table').locator('tbody tr');
  await expect(medians).toHaveText([/S .*2\s*5 days/, /M .*2\s*31 days/, /L .*1\s*60 days/, /XL .*0\s*—/]);
  consoleWatch.assertClean();
});

test('queue filters by status, team and mine', async ({ page }) => {
  await openApp(page, '/?view=list', 'demo-hannah');
  await expect(page.getByTestId('queue-item')).toHaveCount(17);
  await page.getByLabel('Status').selectOption('declined');
  await expect(page.getByTestId('queue-item')).toHaveCount(3);
  await page.getByLabel('Status').selectOption('all');
  await page.getByRole('combobox', { name: 'Team', exact: true }).selectOption('People');
  await expect(page.getByTestId('queue-item')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Team', exact: true }).selectOption('');
  await page.getByLabel('Only mine').check();
  await expect(page.getByTestId('queue-item')).toHaveCount(5);
  await page.getByLabel('Search requests').fill('zebra');
  await expect(page.getByText('Nothing matches these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByTestId('queue-item')).toHaveCount(17);
  await expect(page.getByTestId('queue-item').filter({ hasText: 'Needs triage' })).toHaveCount(2);
});
