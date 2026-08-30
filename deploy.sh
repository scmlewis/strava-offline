#!/usr/bin/env bash
# Deploy to Cloudflare Pages. Run this yourself after `wrangler login` succeeds
# (the OAuth callback can't bind inside the agent sandbox — you must run it in a normal terminal).
set -e
cd "$(dirname "$0")"
echo "== build =="
npm run build
echo "== deploy to Cloudflare Pages =="
npx wrangler pages deploy dist --project-name strava-offline-analyzer
