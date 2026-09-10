### Task 9: Exclude dist/ from git — Report

- **Status:** DONE
- **Commit:** `b8e2175` — `chore: exclude dist/ from git (deployed via CI only)`

**Summary:** Updated `.gitignore` from `dist` to `dist/` for directory-specific matching. The `dist/` directory was already not tracked in git (no files to untrack via `git rm --cached`). The directory exists on disk and is correctly ignored.

- **Test:** Verified `git ls-files --cached dist/` returns empty; `dist/` exists on disk and is gitignored.
- **Concerns:** None.
