// Single-language build: English only. The zh dictionary and language toggle
// were removed at the user's request. `t()` resolves keys from the EN dict and
// falls back to the key itself, so a missing key never breaks the UI.

type Dict = Record<string, string>;

const EN: Dict = {
  // ---- shell ----
  app_title: 'Strava Offline Analyzer',
  app_sub: 'Local-first PWA · your data stays on your device',
  dz_full_1: 'Drop your Strava activities.csv or export zip here',
  dz_full_2:
    '(Strava → Settings → Export, you’ll get a zip containing activities.csv plus a GPX for each activity)',
  choose_file: 'Choose file',

  // ---- nav ----
  nav_overview: 'Overview',
  nav_volume: 'Volume / Routes',
  nav_load: 'Load / Pace',
  nav_zones: 'HR Zones',
  nav_perf: 'PR / Predict',
  nav_log: 'Activity Log',

  // ---- toolbar ----
  filter: 'Filter',
  reset: 'Reset',
  search_placeholder: 'Search name / type…',
  type: 'Type',
  all_types: 'All types',
  time_range: 'Time range',
  all_time: 'All time',
  last_90: 'Last 90 days',
  last_180: 'Last 180 days',
  last_365: 'Last 1 year',
  weekday: 'Weekday',
  weekday_any: 'Any weekday',
  weekday_weekday: 'Weekdays',
  weekday_weekend: 'Weekends',
  weekday_sat: 'Saturday',
  weekday_sun: 'Sunday',
  weekday_mon: 'Monday',
  weekday_tue: 'Tuesday',
  weekday_wed: 'Wednesday',
  weekday_thu: 'Thursday',
  weekday_fri: 'Friday',
  intensity: 'Intensity',
  intensity_any: 'Any intensity',
  intensity_easy: 'Easy',
  intensity_hard: 'Hard',
  route: 'Route',
  route_any: 'Any route',
  route_yes: 'Has GPX',
  route_no: 'No GPX',
  distance: 'Distance',
  min: 'min',
  max: 'max',
  elev_gain: 'Min elevation',
  pace: 'Pace',
  slower: 'slower than',
  faster: 'faster than',
  sec_per_km: 'sec/km',
  from: 'From',
  to: 'To',
  unit: 'Unit',
  backup: 'Export backup',
  restore: 'Import backup',
  clear_data: 'Clear all data',
  zones: 'HR zone settings',
  goals: 'Goal settings',
  about: 'About',
  diagnostics: 'Export diagnostics JSON',

  // ---- overview cards ----
  card_activities: 'Activities',
  card_total_dist: 'Total distance',
  card_avg: 'avg',
  card_moving_time: 'Moving time',
  card_total_elev: 'Total climb',
  card_easy_pct: 'Easy %',
  goal_met: 'Met',
  goal_unmet: 'Not met',
  basis_histogram: 'HR-based',
  basis_avg: 'estimated',
  form_fresh: 'Fresh / Peaking',
  form_fatigued: 'Fatigued',
  form_optimal: 'Optimal',
  card_form: 'Form (TSB)',
  card_ctl: 'CTL',
  card_date_range: 'Date range',
  weekly_goal: 'Weekly goal',
  weekly_distance: 'Weekly distance',

  // ---- heatmap ----
  training_calendar: 'Training calendar',
  import_to_show: 'Shown after importing data.',
  hm_less: 'Less',
  hm_more: 'More (km)',
  hm_hint:
    'Color = total km that day (quantile-based 5 levels, so a long run does not wash out daily bars). Columns = weekday (Sun→Sat). Activities with no distance (manual logs / some rides) count as 0 km — uncolored but still included in analysis.',

  // ---- charts ----
  weekly_volume: 'Last {n} weeks volume ({unit})',
  training_load: 'Training load: CTL / ATL / TSB',
  pace_trend: 'Running pace trend ({unit}, lower = faster)',
  routes_shape: 'Route shapes ({n} with GPX)',
  routes_hint: 'Import the GPX files from your Strava zip to see routes.',
  zones_by_time: 'HR zone distribution (by time)',
  zones_by_activity: 'HR zone distribution (by activity)',
  personal_records: 'Personal best (PR)',
  col_distance: 'Distance',
  col_best_time: 'Best time',
  col_date: 'Date',
  race_predictions: 'Race prediction (Riegel)',
  col_predicted: 'Predicted',
  col_anchor: 'Anchor',
  vo2max: 'Effective VO₂max (VDOT)',
  vo2need: 'Needs at least one running PR (5K/10K/Half/Marathon).',
  vo2anchor: 'Anchor: {label} · Daniels &amp; Gilbert formula estimate, not a lab value',
  col_training_pace: 'Train pace',
  col_target_per_km: 'Target /km',
  vdot_zones: 'E easy · M marathon · T tempo · I interval · R repeat',
  climb_score: 'Climb Score (estimate · {n} with climb)',
  climb_need: 'Needs activities with Elevation Gain.',
  col_score: 'Score',
  col_gain: 'Climb',
  col_grade: 'Gradient',
  climb_formula:
    'Estimate = climb(m) × (1 + min(gradient,15%)×6); ranking only, not Strava’s proprietary formula.',
  streak_title: 'Streak',
  streak_current: 'Current (today)',
  streak_longest: 'Longest',
  activity_log: 'Activity log ({n})',
  col_name: 'Name',
  col_type: 'Type',
  col_moving: 'Moving',
  col_pace: 'Pace',
  col_moving_time: 'Moving time',
  col_elevation_gain: 'Elevation gain',
  col_avg_hr: 'Avg HR',
  col_max_hr: 'Max HR',
  col_tss: 'TSS',
  prev: 'Prev',
  next: 'Next',
  jump_to: 'Jump to',
  page_info: 'Page {cur} / {total}',
  page_noun: 'page',
  jump: 'Go',
  unit_min: 'min',

  // ---- detail drawer ----
  close: 'Close',
  activity: 'Activity',
  det_hr_zones: 'HR zone distribution',
  det_route: 'Route',
  det_no_hr: 'This activity has no HR data (CSV without HR or no GPX).',
  det_avg_hr_only: 'Only average HR ({hr} bpm → Z{z}), no per-second distribution.',
  det_no_route: 'This activity has no GPS route (no GPX or indoor).',

  // ---- about ----
  about_title: 'About Strava Offline Analyzer',
  about_p1:
    'A pure front-end, zero-backend local running/cycling analytics tool. Your Strava data (activities.csv / GPX) stays only in this browser’s IndexedDB — never uploaded to any server.',
  about_how: 'How to use',
  about_step1: 'Strava → Settings → Export data, you get a zip.',
  about_step2: 'Drag that zip or activities.csv onto the top upload area (or click “Choose file”).',
  about_step3: 'Once cached locally, it works offline.',
  about_step4:
    'Use the left tabs: Overview / Volume·Routes / Load·Pace / HR Zones / PR·Predict / Activity Log.',
  about_step5:
    'The top “Filter” toggles; supports type, date, weekday, intensity, distance, climb, pace.',
  about_features: 'Features',
  about_f1: 'Training load: CTL / ATL / TSB (Form), TSS',
  about_f2: 'HR zone distribution, Easy% stats',
  about_f3: 'VO₂max (VDOT) estimate + Jack Daniels training paces',
  about_f4: 'Personal best (PR) + Riegel race prediction',
  about_f5: 'Annual training calendar heatmap, streak',
  about_f6: 'Custom HR zones, weekly goal, units (km/mi)',
  about_safe:
    'Data safety: backup export makes a JSON; import can restore. This app connects to no network server; all computation runs on your machine.',
  about_ok: 'Got it',

  // ---- zones modal ----
  zones_title: 'Zone settings',
  zones_hrmax: 'HRmax',
  zones_rest: 'Resting HR',
  zones_fthr: 'FTHR (optional)',
  zones_hint: 'Z1–Z5 upper bounds (fraction of HRmax):',
  zones_save: 'Save',
  zones_reset: 'Reset defaults',
  zones_cancel: 'Cancel',
  zones_reset_done: 'Reset to default zones',
  zones_saved: 'Zone settings saved (all charts recomputed)',
  training_model: 'Training model',
  ctl_tau: 'CTL time constant (days)',
  atl_tau: 'ATL time constant (days)',
  tss_factor: 'TSS factor',
  zone_names_and_bounds: 'Zone names & bounds (fraction of HRmax):',

  // ---- goals modal ----
  goals_title: 'Goal settings',
  goals_weekly: 'Weekly distance goal (km, blank = off)',
  goals_easy: 'Easy % goal',
  goals_saved: 'Goals saved',
  riegel_exp: 'Riegel exponent',
  easy_zones: 'Easy zones (how many low zones count as easy)',

  // ---- preferences ----
  week_start: 'Week start',
  week_sun: 'Sun',
  week_mon: 'Mon',

  // ---- statuses ----
  st_parsing: 'Parsing…',
  st_no_acts: 'No parseable activities found — is this a Strava export?',
  st_imported: 'Imported {n} activities · stored locally (offline)',
  st_imported_skip:
    'Imported {n} activities · {skipped} skipped (details in console) · stored locally',
  st_progress: 'Importing… {done}/{total}',
  st_import_fail: 'Import failed: {e}',
  backup_done: 'Backup JSON exported',
  restore_done: 'Imported {n} activities + settings',
  restore_fail: 'Import failed: {e}',
  restore_bad_version: 'Backup not recognised — unsupported version',
  restore_bad_shape: 'Backup not recognised — missing activities array',
  st_loaded: 'Loaded {n} activities (offline cache)',
  diag_done: 'Diagnostics: {total} total, {withDist} with distance',

  // ---- clear data modal ----
  clear_title: 'Clear all data',
  clear_confirm:
    'This will permanently delete all {n} activities and settings (zones, goals, units). This cannot be undone.',
  clear_backup_first: 'Export backup first',
  clear_go: 'Clear everything',
  clear_done: 'All data cleared',

  // ---- global error boundary ----
  error_generic: 'Something went wrong: {message}',
};

export function t(key: string, params?: Record<string, string | number>): string {
  let s = EN[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}
