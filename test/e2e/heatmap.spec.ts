import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

function gpx(points: Array<[number, number]>, name: string): string {
  const pts = points
    .map(
      ([lat, lon], i) =>
        `<trkpt lat="${lat}" lon="${lon}"><time>2024-06-01T07:${String(i).padStart(2, '0')}:00Z</time></trkpt>`,
    )
    .join('');
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><trkseg>${pts}</trkseg></trk></gpx>`;
}

async function importZip(page: Page, files: Record<string, string>): Promise<void> {
  const zip = new JSZip();
  for (const [path, text] of Object.entries(files)) zip.file(path, text);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await page.goto('/');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#pick-btn').click(),
  ]);
  await chooser.setFiles({ name: 'export.zip', mimeType: 'application/zip', buffer });
  await expect(page.locator('#dashboard')).not.toBeEmpty();
}

const CSV_HEADER =
  'Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence';

test('heatmap tab with no routes shows the hint, not a map', async ({ page }) => {
  await importZip(page, {
    'activities.csv': `${CSV_HEADER}\n9999,2024-06-01 7:00:00 AM,CSV only,Run,5.0,1800,1700,150,175,2.0,50,88`,
  });
  await page.locator('[data-testid="nav-tab-heatmap"]').click();
  await expect(page.locator('[data-testid="heatmap-tab"]')).toBeVisible();
  await expect(page.locator('[data-testid="heatmap-empty"]')).toBeVisible();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('heatmap tab shows the route count with GPX data', async ({ page }) => {
  const run = gpx(
    [
      [51.5, -0.1],
      [51.505, -0.095],
      [51.51, -0.09],
    ],
    'Run',
  );
  await importZip(page, {
    'activities.csv': `${CSV_HEADER}\n9999,2024-06-01 7:00:00 AM,Test Run,Run,5.0,1800,1700,150,175,2.0,50,88`,
    'activities/2024-06-01_Test_Run_9999.gpx': run,
  });
  await page.locator('[data-testid="nav-tab-heatmap"]').click();
  await expect(page.locator('[data-testid="heatmap-count"]')).toHaveText('1 route');
  await expect(page.locator('[data-testid="heatmap-empty"]')).toHaveCount(0);
});

test('renders heat over the dark map and survives blocked tiles', async ({ page }) => {
  await page.route(/basemaps\.cartocdn\.com/, (route) => route.abort());
  const run = gpx(
    [
      [51.5, -0.1],
      [51.505, -0.095],
      [51.51, -0.09],
    ],
    'Run',
  );
  await importZip(page, {
    'activities.csv': `${CSV_HEADER}\n9999,2024-06-01 7:00:00 AM,Test Run,Run,5.0,1800,1700,150,175,2.0,50,88`,
    'activities/2024-06-01_Test_Run_9999.gpx': run,
  });
  await page.locator('[data-testid="nav-tab-heatmap"]').click();

  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.heatmap-overlay')).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator('.heatmap-overlay')
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.locator('[data-testid="heatmap-note"]')).toContainText(
    'Basemap unavailable',
  );
});

test('basemap checkbox toggles the tile layer', async ({ page }) => {
  const run = gpx(
    [
      [51.5, -0.1],
      [51.505, -0.095],
      [51.51, -0.09],
    ],
    'Run',
  );
  await importZip(page, {
    'activities.csv': `${CSV_HEADER}\n9999,2024-06-01 7:00:00 AM,Test Run,Run,5.0,1800,1700,150,175,2.0,50,88`,
    'activities/2024-06-01_Test_Run_9999.gpx': run,
  });
  await page.locator('[data-testid="nav-tab-heatmap"]').click();
  await expect(page.locator('.leaflet-tile-pane img').first()).toBeAttached();
  await page.locator('[data-testid="heatmap-basemap"]').uncheck();
  await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);
  await page.locator('[data-testid="heatmap-basemap"]').check();
  await expect(page.locator('.leaflet-tile-pane img').first()).toBeAttached();
});
