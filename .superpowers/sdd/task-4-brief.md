### Task 4: Add test coverage reporting

**Files:**
- Modify: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Vitest config from Task 3
- Produces: `npm run test:coverage` script with v8 coverage

- [ ] **Step 1: Update `vitest.config.ts`**

Add coverage config:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/vite-env.d.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

- [ ] **Step 2: Run coverage**

Run: `npm run test:coverage`
Expected: Coverage report generated. Some modules may fall below thresholds initially — that's okay for the first pass.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: add Vitest coverage reporting with v8"
```

---
