### Task 3: Styles split — same pixels, layered files

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/shell.css`, `src/styles/nav.css`, `src/styles/toolbar.css`, `src/styles/cards.css`, `src/styles/modals.css`, `src/styles/responsive.css`
- Modify: `src/styles.css` (becomes import index only)
- Test: build + E2E smoke (no unit test — CSS output verified by byte-identical compiled bundle and Playwright)

**Interfaces:**
- Consumes: current `src/styles.css` (1648 lines) — content moves verbatim, zero rule edits.
- Produces: `src/styles.css` containing only:
```css
@import './styles/tokens.css';
@import './styles/shell.css';
@import './styles/nav.css';
@import './styles/toolbar.css';
@import './styles/cards.css';
@import './styles/modals.css';
@import './styles/responsive.css';
```
Split map (by current section): `:root` + `html[data-theme]` + `prefers-color-scheme` blocks → `tokens.css`; `.topbar/.brand/.layout/.content/.dropzone/.status/.progress` → `shell.css`; `.nav/.nav-tab` → `nav.css`; `.toolbar/.tb-*` → `toolbar.css`; `.dashboard/.card/.chart-wrap` → `cards.css`; `.overlay/.modal/.zfield/.zrow` → `modals.css`; all `@media (max-width: 900px)` / `(max-width: 600px)` blocks → `responsive.css`.

- [ ] **Step 1: Write the failing check (bundle diff baseline)**

Run: `npm run build`
Expected: PASS — then record baseline: `node -e "const fs=require('fs');const f=fs.readdirSync('dist/assets').find(x=>x.endsWith('.css'));console.log(f+':'+fs.statSync('dist/assets/'+f).size)"` prints e.g. `index-AbC123.css:33508`. Save that filename+size; the post-split bundle must be byte-comparable in size (±50 bytes for import-header whitespace).

- [ ] **Step 2: Perform the verbatim split**

Move each rule block from `src/styles.css` into its target file per the split map above without editing selectors, values, or order within each file. Replace `src/styles.css` with the 7-line import index shown above.

- [ ] **Step 3: Verify identical output**

Run: `npm run build`
Expected: PASS. Re-run the size command — Expected: same size ±50 bytes.
Run: `npm run format:check`
Expected: PASS (run `npx prettier --write src/styles/ src/styles.css` first if needed).

- [ ] **Step 4: Run E2E smoke**

Run: `npm run test:e2e`
Expected: all 4 tests in `test/e2e/app.spec.ts` PASS (dropzone visible, nav attached, `?` overlay, CSV import renders dashboard).

- [ ] **Step 5: Commit**

```bash
git add src/styles/ src/styles.css
git commit -m "refactor: split styles.css into layered modules (no visual change)"
```

---

