### Task 7: Add bundle analysis support

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing Vite config
- Produces: `ANALYZE=true npm run build` generates bundle report

- [ ] **Step 1: Install rollup-plugin-visualizer**

```bash
npm install -D rollup-plugin-visualizer
```

- [ ] **Step 2: Update `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Strava Offline Analyzer',
        short_name: 'Strava Analyzer',
        description: 'Local-first PWA — analyze your running data offline',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        start_url: './',
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
    ...(process.env.ANALYZE
      ? [
          visualizer({
            open: true,
            filename: 'dist/stats.html',
            gzipSize: true,
          }),
        ]
      : []),
  ],
});
```

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds (no visualizer since ANALYZE is not set).

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts package.json package-lock.json
git commit -m "chore: add bundle analysis via rollup-plugin-visualizer"
```

---
