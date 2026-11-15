/**
 * The day log: what each day's weather and Misery were, so the month grid
 * can show them looking back. Plain JavaScript, no Foundry, so it can be
 * tested on its own.
 *
 * Kept as { [dayNumber]: { weather, hazard, misery } }:
 * - weather: the hex id on the weather flower, or null with the Weather
 *   subsystem off;
 * - hazard: the weather hazard's key, or null;
 * - misery: the Misery level (0 for none).
 * Only days from when the log began are recorded. A table aid, with no
 * rules effect.
 */

/**
 * One clean log entry.
 * @param {*} entry
 * @returns {{weather: string|null, hazard: string|null, misery: number}|null}
 */
export function cleanEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const text = value => (typeof value === "string" && value ? value : null);
  const misery = Number(entry.misery);
  return {
    weather: text(entry.weather),
    hazard: text(entry.weather) ? text(entry.hazard) : null,
    misery: Number.isInteger(misery) && misery >= 0 ? misery : 0
  };
}

/**
 * The whole log, cleaned: only whole day numbers and real entries.
 * @param {*} log
 */
export function cleanLog(log) {
  const clean = {};
  if (!log || typeof log !== "object") return clean;
  for (const [key, entry] of Object.entries(log)) {
    const day = Number(key);
    const kept = cleanEntry(entry);
    if (Number.isInteger(day) && day >= 1 && kept) clean[day] = kept;
  }
  return clean;
}

/**
 * The log entry for today's weather and Misery.
 * @param {{hex: string, hazard: string|null}|null} weather  Null with the Weather subsystem off.
 * @param {{level: number}} misery
 */
export function logEntry(weather, misery) {
  return cleanEntry({ weather: weather?.hex ?? null, hazard: weather?.hazard ?? null, misery: misery?.level ?? 0 });
}

/** Whether two entries say the same. */
export function sameEntry(a, b) {
  if (!a || !b) return a === b;
  return a.weather === b.weather && a.hazard === b.hazard && a.misery === b.misery;
}

/**
 * The log with a day's entry set.
 * @param {object} log
 * @param {number} day
 * @param {object} entry
 */
export function withEntry(log, day, entry) {
  const clean = cleanLog(log);
  const kept = cleanEntry(entry);
  if (kept && Number.isInteger(day) && day >= 1) clean[day] = kept;
  return clean;
}
