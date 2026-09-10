### Task 1: Add ESLint with TypeScript strict rules

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing TypeScript source in `src/` and `test/`
- Produces: `npm run lint` script that exits 0 on clean, 1 on errors

- [ ] **Step 1: Install ESLint dependencies**

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-unicorn
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'scripts/', '*.mjs'],
  },
);
```

- [ ] **Step 3: Add lint script to `package.json`**

Add to `"scripts"`:
```json
"lint": "eslint src/ test/"
```

- [ ] **Step 4: Run `npm run lint` and fix any errors**

Run: `npm run lint`
Expected: Some warnings/errors. Fix each one. Common expected fixes:
- Unused variables: prefix with `_` or remove
- `any` types: add proper type annotations
- Missing type imports: add `import type` where needed

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js package.json package-lock.json src/ test/
git commit -m "chore: add ESLint with TypeScript strict rules"
```

---
