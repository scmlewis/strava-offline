import { defineConfig } from '@playwright/test';

// 5200 avoids Vite's dev port (5173) and the Windows excluded TCP ranges
// (4110–4209, 4210–4309) that made 4173 unusable. Override with PLAYWRIGHT_PORT.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 5200);

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    port,
    reuseExistingServer: true,
  },
});
