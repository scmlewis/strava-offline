import Dexie, { type Table } from 'dexie';
import type { Activity, ZonesConfig } from './types';
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

export interface BackupBundle {
  version: 1;
  exportedAt: string;
  zones: ZonesConfig;
  activities: Activity[];
}

export async function exportBackup(): Promise<BackupBundle> {
  const activities = await db.activities.toArray();
  let zones = DEFAULT_ZONES;
  try {
    const raw = localStorage.getItem('strava-offline:zones');
    if (raw) zones = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    zones,
    activities,
  };
}

export async function importBackup(bundle: BackupBundle): Promise<number> {
  if (!bundle.activities || !Array.isArray(bundle.activities)) {
    throw new Error('backup 格式唔啱：搵唔到 activities');
  }
  if (bundle.zones) {
    try {
      localStorage.setItem('strava-offline:zones', JSON.stringify(bundle.zones));
    } catch {
      /* ignore */
    }
  }
  await db.activities.bulkPut(bundle.activities);
  return bundle.activities.length;
}
