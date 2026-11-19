/**
 * Scenes whose darkness follows the time of day (GAPS 311).
 *
 * Scene Configuration gets a field under Foundry's Darkness Level slider:
 * Darkness follows the time of day (flags.var-borg.followTimeOfDay, off by
 * default). Meant for outdoor maps.
 *
 * Whenever the world clock moves (Next phase, +1 h, a rest, travel, a
 * module), the active Dark Master's client sets every following scene's
 * darkness for the hour, all in one update: 0 by day, 1 at night, with a
 * one-hour twilight just before dawn and dusk (module/rules/scene-darkness.mjs).
 * The same happens to a scene when it is set to follow, and to all of them
 * when the world loads. Moving the slider by hand lasts until the clock
 * moves again. A following scene with Foundry's Darkness Lock on is left
 * alone, and the Dark Master is warned once per scene (player feedback).
 *
 * Whether night counts as darkness for the rules (In Darkness, Bane) is up
 * to the scene's Global Illumination setting, as for any scene
 * (module/darkness.mjs).
 */

import { darknessAt } from "./rules/scene-darkness.mjs";

const SYSTEM = "var-borg";
const FOLLOW = "followTimeOfDay";

/** Locked scenes the Dark Master has been warned about this session. */
const warnedLocked = new Set();

/** Set up the scene field and the following. Called at init. */
export function registerSceneDarkness() {
  Hooks.on("renderSceneConfig", addSceneField);
  Hooks.on("updateScene", (scene, changes) => {
    if (changes.flags?.[SYSTEM] && (FOLLOW in changes.flags[SYSTEM])) followTimeOfDay([scene]);
  });
  Hooks.on("updateWorldTime", () => followTimeOfDay());
  Hooks.once("ready", () => followTimeOfDay());
}

/** Whether a scene's darkness follows the time of day. */
function follows(scene) {
  return Boolean(scene.getFlag(SYSTEM, FOLLOW));
}

/**
 * Give every following scene the darkness for the current hour. Only the
 * active Dark Master's client writes, so the scenes are updated once.
 * @param {Scene[]} [scenes]  Only these scenes (default: all).
 */
export async function followTimeOfDay(scenes = game.scenes.contents) {
  if (!game.user.isActiveGM) return;
  const darknessLevel = darknessAt(game.time.worldTime);
  const updates = [];
  for (const scene of scenes) {
    if (!follows(scene)) continue;
    // Foundry's Darkness Lock wins; say so once (player feedback).
    if (scene.environment.darknessLock) {
      if (!warnedLocked.has(scene.id)) {
        warnedLocked.add(scene.id);
        ui.notifications.warn(game.i18n.format("VARBORG.SceneDarkness.Locked", { name: scene.name }));
      }
      continue;
    }
    warnedLocked.delete(scene.id);
    if (scene.environment.darknessLevel !== darknessLevel) {
      updates.push({ _id: scene.id, "environment.darknessLevel": darknessLevel });
    }
  }
  try {
    if (updates.length) await Scene.updateDocuments(updates);
  } catch (error) {
    console.error("VÅR BORG | Could not set scene darkness for the time of day", error);
  }
}

/** Add the field under the first Darkness Level slider. */
function addSceneField(app, element) {
  const scene = app.document;
  if (!scene || element.querySelector(".var-borg-scene-darkness")) return;
  const darknessGroup = element.querySelector('[name="environment.darknessLevel"]')?.closest(".form-group");
  if (!darknessGroup) return;

  const t = key => foundry.utils.escapeHTML(game.i18n.localize(`VARBORG.SceneDarkness.${key}`));
  darknessGroup.insertAdjacentHTML("afterend", `
    <div class="form-group var-borg-scene-darkness">
      <label for="${app.id}-vb-time-of-day">${t("Follow")}</label>
      <div class="form-fields">
        <input type="checkbox" id="${app.id}-vb-time-of-day" name="flags.${SYSTEM}.${FOLLOW}" ${follows(scene) ? "checked" : ""}>
      </div>
      <p class="hint">${t("FollowHint")}</p>
    </div>`);
}
