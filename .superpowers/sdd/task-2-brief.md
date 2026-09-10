### Task 2: Add Prettier

**Files:**
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing source files
- Produces: `npm run format` and `npm run format:check` scripts

- [ ] **Step 1: Install Prettier**

```bash
npm install -D prettier
```

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
dist/
node_modules/
*.md
package-lock.json
```

- [ ] **Step 4: Add format scripts to `package.json`**

Add to `"scripts"`:
```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 5: Run `npm run format` to format entire codebase**

Run: `npm run format`
Expected: Prettier reformats files. Review the diff to ensure no breaking changes.

- [ ] **Step 6: Run `npm run format:check` to verify**

Run: `npm run format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 7: Run `npm run lint` to verify no conflicts**

Run: `npm run lint`
Expected: Clean pass. If Prettier introduced style that conflicts with ESLint rules, adjust `eslint.config.js` to disable conflicting rules (e.g., `semi`, `quotes`).

- [ ] **Step 8: Run `npm run typecheck` to verify no breakage**

Run: `npm run typecheck`
Expected: Clean pass.

- [ ] **Step 9: Commit**

```bash
git add .prettierrc .prettierignore package.json package-lock.json src/ test/
git commit -m "chore: add Prettier, format codebase"
```

---
