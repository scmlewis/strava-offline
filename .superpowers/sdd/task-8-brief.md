### Task 8: Add hidden source maps for production

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: Vite config from Task 7
- Produces: Production builds include hidden source maps for debugging

- [ ] **Step 1: Add `build.sourcemap` to `vite.config.ts`**

Add after `base: './'`:
```ts
build: {
  sourcemap: 'hidden',
},
```

- [ ] **Step 2: Verify build generates .map files**

Run: `npm run build && ls dist/assets/*.map`
Expected: `.map` files present in `dist/assets/`.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: add hidden source maps for production debugging"
```

---
