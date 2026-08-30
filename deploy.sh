#!/usr/bin/env bash
# Deploy to GitHub Pages.
# The actual build + publish is handled by the GitHub Actions workflow
# (.github/workflows/deploy.yml) on every push to main. This script just
# triggers a manual run if you want to redeploy without a new commit.
set -e
cd "$(dirname "$0")"
echo "== pushing current commit to main (auto-deploys via Actions) =="
git push origin main
echo "== or trigger a manual workflow run =="
gh workflow run deploy.yml --ref main || true
