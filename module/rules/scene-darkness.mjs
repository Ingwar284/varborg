/**
 * How dark a scene that follows the time of day is (GAPS 311).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Designer rulings (GAPS 311):
 * - Full daylight (darkness 0) by day, full night (darkness 1) at night.
 * - A one-hour twilight centred on dawn (6) and on dusk (18): the darkness
 *   fades out from 5:30 to 6:30 and in from 17:30 to 18:30 (GAPS 158).
 * - The darkness is a look. Whether night counts as darkness for the rules
 *   (the In Darkness marker) is up to each scene's Global Illumination
 *   setting in Foundry, as for any scene.
 */

import { DAWN, DUSK, dayFraction, HOURS_PER_DAY } from "./calendar.mjs";

/** How long the twilight lasts, in hours, centred on dawn and on dusk. */
export const TWILIGHT_HOURS = 1;

/** Darkness is kept to two decimals, so the clock ticking by seconds does not update the scene every time. */
const STEP = 100;

/**
 * The scene darkness at a world time: 0 (day) to 1 (night).
 * @param {number} time  World time in seconds.
 */
export function darknessAt(time) {
  const hour = dayFraction(time) * HOURS_PER_DAY;
  const half = TWILIGHT_HOURS / 2;
  let darkness;
  if (hour < DAWN - half) darkness = 1;
  else if (hour < DAWN + half) darkness = (DAWN + half - hour) / TWILIGHT_HOURS;
  else if (hour < DUSK - half) darkness = 0;
  else if (hour < DUSK + half) darkness = (hour - (DUSK - half)) / TWILIGHT_HOURS;
  else darkness = 1;
  return Math.round(darkness * STEP) / STEP;
}
