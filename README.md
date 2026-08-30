# Strava Offline Analyzer

A local-first PWA — drag in your Strava export and analyze your running data offline. Zero backend: your data stays on your own machine (browser IndexedDB).

## Run locally (development)
```bash
npm install
npm run dev        # dev server, http://localhost:5173
npm run build      # production build to dist/ (includes PWA service worker)
npm run preview    # preview the production build
npm test           # run core-logic unit tests (zones / csv / gpx / TSS / PR / Riegel)
```

## Data source
Strava → Settings → Export data → you get a zip containing `activities.csv` plus a GPX file per activity. Just drag the zip (or the csv) onto the app.

- **CSV**: weekly volume, pace trend, average-HR trend; Easy% uses average HR as a proxy.
- **GPX** (with `gpxtpx:hr` per-second heart rate): true **time-in-zone** (histogram). The app automatically merges the GPX histogram over the CSV proxy, matched by activity ID.

## Features
- Cards: total distance / time / climb, Easy% vs your 80% goal, **Form (TSB)** training state
- Charts: last 16 weeks volume, **training load CTL/ATL/TSB**, running pace trend, HR-zone distribution
- Analysis: **TSS / CTL / ATL / TSB** (HR-based), **Personal Records** (5K/10K/Half/Marathon), **Riegel race prediction**
- Route shape mini-map (GPX polyline, no basemap tiles)
- Filters (type / time range / weekday / intensity / distance / climb / pace), **Zone settings panel** (localStorage-persisted; changing HRmax/rest/FTHR recomputes everything), **backup/restore JSON export**

## Zone model (anchored to measured data)
| Zone | HRmax% | Heart rate (HRmax 206) |
|---|---|---|
| Z1 Recovery | <60% | <124 |
| Z2 Easy | 60–75% | 124–154 (your base target ~148) |
| Z3 Tempo | 75–85% | 155–175 |
| Z4 Threshold | 85–95% | 176–196 |
| Z5 VO2 | >95% | >196 |

Edit `DEFAULT_ZONES` in `src/data/zones.ts`, or use the in-app Zone settings panel.

## Deploy to GitHub Pages (PWA install needs HTTPS)
This repo deploys automatically via GitHub Actions (see `.github/workflows/deploy.yml`): every push to `main` builds and publishes to GitHub Pages.

Live site: `https://scmlewis.github.io/strava-offline/`

To deploy manually instead:
```bash
npm install
npm run build
# then publish the dist/ folder to GitHub Pages (e.g. via the Actions workflow)
```

## Limitations (honest)
- Cross-device sync: no backend, so switching machines requires re-import (use the backup JSON to move data).
- GPX HR namespace uses several common tags as fallbacks; an individual device's export with a different namespace may not yield a true histogram and will fall back to the avg-HR proxy.
- Routes are polyline shapes — no map basemap, no navigation (deliberate MVP scope).
- TSS/CTL are HR-based estimates (no power meter); with FTHR they switch to HRR-based intensity.
