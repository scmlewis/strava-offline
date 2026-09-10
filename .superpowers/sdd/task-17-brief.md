### Task 17: Add responsive chart tooltips for mobile

**Files:**
- Modify: `src/data/dashboard.ts`

**Interfaces:**
- Consumes: uPlot chart instances
- Produces: Charts respond to touch events on mobile

- [ ] **Step 1: Add touch cursor setup in uPlot options**

In the `plotOpts()` function in `dashboard.ts`, add cursor configuration for touch:
```ts
cursor: {
  drag: { x: false, y: false },
  focus: { prox: 20 },
},
```

This enables the crosshair on touch/hover proximity without requiring drag.

- [ ] **Step 2: Verify charts render correctly**

Run: `npm run dev`
Manual check: Open on mobile (or Chrome DevTools device mode). Tap a chart — crosshair should appear.

- [ ] **Step 3: Commit**

```bash
git add src/data/dashboard.ts
git commit -m "fix: enable touch-responsive chart cursors for mobile"
```

---

## Phase 5: Testing & Quality (Priority 5)
