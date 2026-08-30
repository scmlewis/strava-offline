import type { ManualZone, ZonesConfig } from './types';

export type { ZonesConfig } from './types';

// Default anchors: Lewis's real measured numbers (U9) — HRmax 206, rest 60.
// Z2 upper bound = 154 bpm (75% HRmax) is the Easy ceiling for his base work.
export const DEFAULT_ZONES: ZonesConfig = {
  hrMax: 206,
  restHr: 60,
  zones: [
    { name: 'Z1 Recovery', lo: 0.0, hi: 0.6 },
    { name: 'Z2 Easy', lo: 0.6, hi: 0.75 }, // <= 154 bpm @ HRmax 206
    { name: 'Z3 Tempo', lo: 0.75, hi: 0.85 },
    { name: 'Z4 Threshold', lo: 0.85, hi: 0.95 },
    { name: 'Z5 VO2', lo: 0.95, hi: 1.01 },
  ],
  // HR TSS factor: 1h fully in Z4 (~threshold) ≈ 100 TSS
  // using HRmax%: Z4 center ≈ 90% -> 60 min * (90/100)^2 ≈ 48.6 min => factor ~2.06
  tssFactor: 2.06,
};

const STORE_KEY = 'strava-offline:zones';

export function loadZones(): ZonesConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.zones)) {
        return { ...DEFAULT_ZONES, ...parsed } as ZonesConfig;
      }
    }
  } catch {
    console.warn('Strava Offline: corrupt zone config in localStorage, resetting to defaults');
  }
  return { ...DEFAULT_ZONES, zones: DEFAULT_ZONES.zones.map((z) => ({ ...z })) };
}

export function saveZones(cfg: ZonesConfig): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

/** zone index 1..5 for a heart rate, or null if hr missing */
export function zoneForHr(hr: number | null | undefined, cfg: ZonesConfig): number | null {
  if (hr == null || !isFinite(hr)) return null;
  const frac = hr / cfg.hrMax;
  for (let i = 0; i < cfg.zones.length; i++) {
    if (frac >= cfg.zones[i].lo && frac < cfg.zones[i].hi) return i + 1;
  }
  return frac >= 1 ? cfg.zones.length : null;
}

/** lower/upper bpm bounds for display */
export function zoneBpm(z: ManualZone, cfg: ZonesConfig): [number, number] {
  return [Math.round(z.lo * cfg.hrMax), Math.round(z.hi * cfg.hrMax)];
}

/** intensity factor for a given HR, using HRR when fthr present, else HRmax% */
export function intensityForHr(hr: number, cfg: ZonesConfig): number {
  if (cfg.fthr) {
    const hrr = (hr - cfg.restHr) / (cfg.fthr - cfg.restHr);
    return Math.max(hrr, 0);
  }
  return hr / cfg.hrMax;
}
