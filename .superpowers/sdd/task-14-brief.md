### Task 14: Improve empty state

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: existing dropzone HTML, M3 design tokens
- Produces: Richer empty state with feature highlights

- [ ] **Step 1: Update the dropzone content in `index.html`**

Replace the dropzone inner content with feature highlights:
```html
<div id="dropzone" class="dropzone">
  <div class="dropzone-inner">
    <div class="dropzone-icon" id="dropzone-icon">
      <!-- SVG upload icon inserted by JS -->
    </div>
    <h2 id="dropzone-title">Drop your Strava export here</h2>
    <p id="dropzone-sub">or</p>
    <button id="pick-btn" class="btn primary">Choose file</button>
    <input type="file" id="file-input" accept=".csv,.zip" multiple hidden>
    <div class="dropzone-features">
      <div class="feature"><span class="feature-icon">&#127939;</span> Training load (TSS/CTL/ATL/TSB)</div>
      <div class="feature"><span class="feature-icon">&#127942;</span> Personal records & race predictions</div>
      <div class="feature"><span class="feature-icon">&#128202;</span> HR zone analysis & charts</div>
      <div class="feature"><span class="feature-icon">&#128506;</span> Route mini-maps</div>
      <div class="feature"><span class="feature-icon">&#128274;</span> 100% offline — data stays on your device</div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add feature grid styles to `src/styles.css`**

Add after dropzone styles:
```css
.dropzone-features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 24px;
  max-width: 400px;
}

.feature {
  font-size: 0.85em;
  color: var(--on-surface-variant);
  display: flex;
  align-items: center;
  gap: 6px;
}

.feature-icon {
  font-size: 1.1em;
}

@media (max-width: 500px) {
  .dropzone-features {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Add i18n keys for empty state (if customizable)**

Add to `EN` dictionary if the title/subtitle should be i18n-able:
```ts
dropzone_title: 'Drop your Strava export here',
dropzone_sub: 'or',
dropzone_features_title: 'What you get',
```

- [ ] **Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: Clean pass.

- [ ] **Step 5: Commit**

```bash
git add index.html src/styles.css src/i18n.ts
git commit -m "feat: improve empty state with feature highlights"
```

---
