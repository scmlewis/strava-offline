import Dexie, { type Table } from 'dexie';
import type { Activity, ZonesConfig, Units, Goals } from './types';
import { DEFAULT_ZONES } from './zones';

export class StravaDB extends Dexie {
  activities!: Table<Activity, string>;
  constructor() {
    super('strava-offline');
    this.version(1).stores({ activities: 'id, ts, type, date' });
  }
}

export const db = new StravaDB();

export async function saveActivities(acts: Activity[]): Promise<void> {
  await db.activities.bulkPut(acts);
}

export async function loadActivities(): Promise<Activity[]> {
  return db.activities.orderBy('ts').reverse().toArray();
}

export async function clearActivities(): Promise<void> {
  await db.activities.clear();
}

const SETTINGS_KEYS = ['strava-offline:zones', 'goals', 'unitPref', 'filterCollapsed'] as const;

/** Remove all activities from IndexedDB and all settings from localStorage. */
export async function clearAllData(): Promise<void> {
  await db.activities.clear();
  for (const key of SETTINGS_KEYS) {
    localStorage.removeItem(key);
  }
}

export interface BackupBundle {
  version: 1;
  exportedAt: string;
  zones: ZonesConfig;
  goals: Goals;
  units: Units;
  activities: Activity[];
}

const ZONES_KEY = 'strava-offline:zones';
const GOALS_KEY = 'goals';
const UNITS_KEY = 'unitPref';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota or disabled storage — non-fatal for a backup import */
  }
}

export async function exportBackup(): Promise<BackupBundle> {
  const activities = await db.activities.toArray();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    zones: readJson<ZonesConfig>(ZONES_KEY) ?? DEFAULT_ZONES,
    goals: readJson<Goals>(GOALS_KEY) ?? { weeklyKm: null, easyPct: 80 },
    units: readJson<Units>(UNITS_KEY) ?? { dist: 'km', pace: 'min/km' },
    activities,
  };
}

/** Validate a parsed backup object. Throws a user-facing message on any problem. */
export function validateBackup(bundle: unknown): asserts bundle is BackupBundle {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Backup not recognised — not a JSON object');
  }
  const b = bundle as Record<string, unknown>;
  if (b.version !== 1) {
    throw new Error('Backup not recognised — unsupported version');
  }
  if (!Array.isArray(b.activities)) {
    throw new Error('Backup not recognised — missing activities array');
  }
  // Every activity must at least have a string id we can bulkPut on.
  for (const a of b.activities as unknown[]) {
    if (!a || typeof a !== 'object' || typeof (a as Record<string, unknown>).id !== 'string') {
      throw new Error('Backup not recognised — an activity is missing its id');
    }
  }
}

export async function importBackup(bundle: BackupBundle): Promise<number> {
  validateBackup(bundle);
  if (bundle.zones) writeJson(ZONES_KEY, bundle.zones);
  if (bundle.goals) writeJson(GOALS_KEY, bundle.goals);
  if (bundle.units) writeJson(UNITS_KEY, bundle.units);
  await db.activities.bulkPut(bundle.activities);
  return bundle.activities.length;
}
