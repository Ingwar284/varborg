/**
 * How dark a scene that follows the time of day is (GAPS 311).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Designer rulings (GAPS 311):
 * - Full daylight (darkness 0) by day, full night (darkness 1) at night.
 * - A one-hour twilight just before dawn (6) and just before dusk (18):
 *   the darkness fades out from 5:00 to 6:00 and in from 17:00 to 18:00
 *   (GAPS 158). So Morning starts fully light and Night fully dark, even
 *   when Next phase jumps the clock straight there (player feedback,
 *   19 November 2026; it was centred on 6 and 18 before).
 * - The darkness is a look. Whether night counts as darkness for the rules
 *   (the In Darkness marker) is up to each scene's Global Illumination
 *   setting in Foundry, as for any scene.
 */

import { DAWN, DUSK, dayFraction, HOURS_PER_DAY } from "./calendar.mjs";

/** How long the twilight lasts, in hours, ending at dawn and at dusk. */
export const TWILIGHT_HOURS = 1;

/** Darkness is kept to two decimals, so the clock ticking by seconds does not update the scene every time. */
const STEP = 100;

/**
 * The scene darkness at a world time: 0 (day) to 1 (night).
 * @param {number} time  World time in seconds.
 */
export function darknessAt(time) {
  const hour = dayFraction(time) * HOURS_PER_DAY;
  let darkness;
  if (hour < DAWN - TWILIGHT_HOURS) darkness = 1;
  else if (hour < DAWN) darkness = (DAWN - hour) / TWILIGHT_HOURS;
  else if (hour < DUSK - TWILIGHT_HOURS) darkness = 0;
  else if (hour < DUSK) darkness = (hour - (DUSK - TWILIGHT_HOURS)) / TWILIGHT_HOURS;
  else darkness = 1;
  return Math.round(darkness * STEP) / STEP;
}
