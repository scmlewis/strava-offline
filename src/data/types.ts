export interface ZonesConfig {
  hrMax: number;
  restHr: number;
  /** optional FTP/FTHR; if present, intensity can be HRR-based. Falls back to HRmax%. */
  fthr?: number;
  zones: ManualZone[]; // Z1..Z5
  /** factor to convert time-in-zone (seconds) to TSS */
  tssFactor: number;
  /** CTL exponential smoothing time constant (days, default 42) */
  ctlTau: number;
  /** ATL exponential smoothing time constant (days, default 7) */
  atlTau: number;
}

export interface ManualZone {
  name: string;
  /** inclusive lower bound, exclusive upper bound, as fraction of HRmax */
  lo: number;
  hi: number;
}

export interface Units {
  dist: 'km' | 'mi';
  pace: 'min/km' | 'min/mi';
}

export interface Goals {
  weeklyKm: number | null; // null = no target
  easyPct: number; // target easy%, default 80
  /** Riegel race prediction exponent (default 1.06) */
  riegelExp: number;
  /** how many low zones count as "easy" (default 2 = Z1+Z2) */
  easyZones: number;
}

export interface Preferences {
  weekStart: 'sun' | 'mon';
}

export interface TrackPoint {
  t: number; // epoch ms
  hr?: number;
  lat?: number;
  lon?: number;
  ele?: number;
}

export interface Activity {
  id: string; // csv:<stravaId> | gpx:<stravaId> | fit:<stravaId>
  source: 'csv' | 'gpx' | 'fit';
  date: string; // YYYY-MM-DD
  ts: number; // epoch ms
  name: string;
  type: string; // Run, Ride, ...
  distanceKm: number | null;
  movingTimeMin: number | null;
  elapsedTimeMin: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgSpeedKmh: number | null;
  elevationGainM: number | null;
  cadence: number | null;
  /** HR count histogram per 1 bpm bucket (independent of zone config) */
  hrHistogram?: Record<number, number> | null;
  /** decimated polyline [lat, lon] for route mini-map */
  route?: [number, number][] | null;
}
