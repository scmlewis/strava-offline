import { defineConfig } from '@playwright/test';

// 5200 avoids Vite's dev port (5173) and the Windows excluded TCP ranges
// (4110–4209, 4210–4309) that made 4173 unusable. Override with PLAYWRIGHT_PORT.
const parsedPort = Number(process.env.PLAYWRIGHT_PORT);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5200;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    screenshot: 'only-on-failure',
    // The production build registers the PWA service worker, whose CacheFirst
    // handler for CARTO tiles sits in front of `page.route`. Without this, a
    // test that aborts tile requests would still receive (watermarked) tiles,
    // because Playwright does not intercept fetches made by a service worker.
    // Blocking service workers keeps the e2e suite hermetic and deterministic.
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    port,
    reuseExistingServer: true,
  },
});
