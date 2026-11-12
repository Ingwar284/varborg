/**
 * In Darkness (rules 3.15 Darkness and light, GAPS 274).
 *
 * "Being in complete darkness gives Bane on all tests." The system watches
 * the scene's lighting and puts an In Darkness marker on each player
 * character whose token no light reaches, and takes it off again when one
 * does. The Bane itself is counted in module/rules/conditions.mjs.
 *
 * Designer's rulings (GAPS 274):
 * - It is a marker, not one of the conditions of rules 3.13.
 * - Any light counts as light, dim light too. Only no light is darkness.
 * - Player characters only: foes do not roll.
 *
 * How it works:
 * - Only the Dark Master's client checks, on the scene the Dark Master is
 *   looking at, so the players' clients never fight over the marker.
 * - A token is in light when Foundry's lighting reaches its centre: the
 *   scene's global illumination, a placed light or any token's light
 *   (a lit torch, lantern or candle, module/light.mjs). Magical darkness
 *   (a darkness source) over that spot wins.
 * - It checks when the canvas is drawn and whenever the lighting is
 *   refreshed (tokens moving, lights lit, put out or moved, the darkness
 *   level changing), a moment after things settle down.
 * - A scene without token vision is left alone: its lighting means
 *   nothing, so the Dark Master can set the marker by hand there from the
 *   token's status menu.
 */

import { IN_DARKNESS } from "./rules/conditions.mjs";

/** How long to wait for the lighting to settle before checking. */
const SETTLE_MS = 300;

/** Add In Darkness to the status effects and hook up the checks. Called on init. */
export function registerDarkness() {
  CONFIG.statusEffects.push({ id: IN_DARKNESS, name: `VARBORG.Condition.${IN_DARKNESS}`, img: "icons/svg/eye.svg" });
  const check = foundry.utils.debounce(checkScene, SETTLE_MS);
  Hooks.on("canvasReady", check);
  Hooks.on("lightingRefresh", check);
  Hooks.on("createToken", check);
  // A token without a light of its own walking into or out of the light.
  Hooks.on("updateToken", (token, changes) => {
    if (["x", "y", "elevation"].some(key => key in changes)) check();
  });
}

/** Whether light reaches a token's centre. */
function tokenInLight(token) {
  const point = token.getCenterPoint();
  point.elevation = token.elevation;
  return canvas.effects.testInsideLight(point) && !canvas.effects.testInsideDarkness(point);
}

let checking = false;
let again = false;

/**
 * Put In Darkness on each player character in the dark on the viewed
 * scene, and take it off those in light. Dark Master only.
 */
async function checkScene() {
  if (!game.user.isActiveGM || !canvas.ready || !canvas.scene?.tokenVision) return;
  // Something changed while checking: check once more afterwards.
  if (checking) {
    again = true;
    return;
  }
  checking = true;
  again = false;
  try {
    // One answer per character: a character with several tokens here is
    // in darkness only when all of them are.
    const dark = new Map();
    for (const token of canvas.scene.tokens) {
      const actor = token.actor;
      if (actor?.type !== "character") continue;
      const inDark = !tokenInLight(token);
      dark.set(actor, (dark.get(actor) ?? true) && inDark);
    }
    for (const [actor, inDark] of dark) {
      if (actor.statuses.has(IN_DARKNESS) !== inDark) await actor.toggleStatusEffect(IN_DARKNESS, { active: inDark });
    }
  } catch (error) {
    console.error("VÅR BORG | Could not check darkness", error);
  } finally {
    checking = false;
  }
  if (again) checkScene();
}
