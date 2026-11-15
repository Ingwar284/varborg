/**
 * The day log in Foundry: each day's weather and Misery, shown in the
 * Calendar & Time panel's month grid looking back.
 *
 * A world setting. The active Dark Master's client records today's entry
 * when the world loads and whenever the day, the weather or the Misery
 * changes (a new day, Set weather, Set Misery, a sudden shift on the
 * road), so each day keeps the last weather and Misery it had. Days from
 * before the log began show nothing. A table aid, with no rules effect.
 *
 * The maths lives in module/rules/day-log.mjs.
 */

import { cleanLog, logEntry, sameEntry, withEntry } from "./rules/day-log.mjs";
import { currentDay } from "./days.mjs";
import { currentWeather, hexName, hazardName } from "./weather.mjs";
import { currentMisery, miseryName } from "./misery.mjs";
import { weatherOn } from "./settings.mjs";
import { hexById } from "./rules/weather.mjs";

const SYSTEM = "var-borg";
const SETTING = "dayLog";

/**
 * Register the log setting, and record today once the world is ready.
 * @param {Function} onChange  Redraws the Calendar & Time panel.
 */
export function registerDayLog(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange
  });
  Hooks.once("ready", recordToday);
}

function savedLog() {
  return cleanLog(game.settings.get(SYSTEM, SETTING));
}

/**
 * Active Dark Master only: record today's weather and Misery, if they
 * changed. Called when the day, the weather or the Misery changes.
 */
export async function recordToday() {
  if (!game.ready || !game.user.isActiveGM) return;
  const day = currentDay();
  const entry = logEntry(weatherOn() ? currentWeather() : null, currentMisery());
  const log = savedLog();
  if (sameEntry(log[day], entry)) return;
  await game.settings.set(SYSTEM, SETTING, withEntry(log, day, entry));
}

/**
 * A day's log entry, ready for the panel, or null if the day has none.
 * @param {number} day
 * @returns {{weather: string, kind: string, hazard: string, misery: string}|null}
 */
export function loggedDay(day) {
  const entry = savedLog()[day];
  if (!entry) return null;
  const kind = entry.weather ? hexById(entry.weather)?.kind ?? "" : "";
  return {
    weather: kind ? hexName(entry.weather) : "",
    kind,
    hazard: entry.hazard ? hazardName(entry.hazard) : "",
    misery: miseryName(entry.misery)
  };
}

/** The weather kind for each logged day ({ [day]: kind }), for the grid's icons. */
export function loggedKinds() {
  const kinds = {};
  for (const [day, entry] of Object.entries(savedLog())) {
    const kind = entry.weather ? hexById(entry.weather)?.kind : null;
    if (kind) kinds[day] = kind;
  }
  return kinds;
}
