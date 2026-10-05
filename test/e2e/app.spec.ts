import { test, expect } from '@playwright/test';

test.describe('Strava Offline Analyzer', () => {
  test('loads and shows dropzone', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#dropzone')).toBeVisible();
    await expect(page.locator('#pick-btn')).toBeVisible();
  });

  test('nav tabs render', async ({ page }) => {
    await page.goto('/');
    // Even before data, nav should be present
    const nav = page.locator('#nav');
    await expect(nav).toBeAttached();
  });

  test('keyboard shortcut ? opens help overlay', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.type('?');
    await expect(page.locator('.overlay')).toBeVisible();
    await expect(page.locator('.overlay .modal h3')).toContainText('Keyboard Shortcuts');
    await page.keyboard.press('Escape');
    await expect(page.locator('.overlay')).not.toBeVisible();
  });

  test('can pick a CSV file', async ({ page }) => {
    await page.goto('/');
    // Create a minimal CSV in the browser context
    const csvContent = `Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence
9999,2024-06-01 7:00:00 AM,Test Run,Run,5.0,1800,1700,150,175,2.0,50,88`;
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#pick-btn').click(),
    ]);
    await fileChooser.setFiles({
      name: 'activities.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });
    // After import, dashboard should render
    await expect(page.locator('#dashboard')).not.toBeEmpty();
  });

  test('hash route deep-links to load tab', async ({ page }) => {
    await page.goto('/#/load');
    await expect(page.locator('#nav .nav-tab.active')).toContainText('Load');
  });

  test('keyboard number switches tab via hash route', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/#\/load/);
    await expect(page.locator('#nav .nav-tab.active')).toContainText('Load');
  });
});
