### Task 18: Add Playwright E2E tests

**Files:**
- Create: `playwright.config.ts`
- Create: `test/e2e/app.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: production build (`npm run build`), `vite preview` server
- Produces: `npm run test:e2e` script, browser E2E tests

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 3: Create `test/e2e/app.spec.ts`**

```ts
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
    await page.keyboard.press('Shift+/'); // ? key
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-overlay h3')).toContainText('Keyboard Shortcuts');
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
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
});
```

- [ ] **Step 4: Add e2e script to `package.json`**

```json
"test:e2e": "npx playwright test",
"test:all": "npm test && npm run test:e2e"
```

- [ ] **Step 5: Run E2E tests**

Run: `npm run build && npm run test:e2e`
Expected: All 4 tests pass.

- [ ] **Step 6: Add E2E to CI**

Update `.github/workflows/deploy.yml` — add after `npm run build`:
```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts test/e2e/ package.json .github/workflows/deploy.yml
git commit -m "test: add Playwright E2E tests for critical user flows"
```

---
