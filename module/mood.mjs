/**
 * Interface mood: the VÅR BORG windows look hopeful in light and threatening
 * in darkness.
 *
 * - A player's screen follows their own character's In Darkness marker
 *   (module/darkness.mjs), unless they choose otherwise.
 * - The Dark Master's screen turns dark only when every player character on
 *   the scene is In Darkness.
 * - Each person can override it in the settings: always light, or always dark.
 *
 * Only the look changes, on that person's own screen. The mood is worked out
 * here; the look itself comes from the "theme-dark" and "theme-light" classes
 * on each window (see the styles). The pure rules are in module/rules/mood.mjs.
 */

import { IN_DARKNESS } from "./rules/conditions.mjs";
import { chooseMood, allInDarkness } from "./rules/mood.mjs";

const SYSTEM = "var-borg";
const UI_MOOD = "uiMood";

/** How long the screen's colours take to change, in milliseconds (the CSS transition). */
const CHANGE_MS = 900;

let current = "light";
let changeTimer = null;

/** Register the setting, the hooks and the refresh. Called on init. */
export function registerMood() {
  game.settings.register(SYSTEM, UI_MOOD, {
    name: "VARBORG.Settings.UiMood.Name",
    hint: "VARBORG.Settings.UiMood.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      follow: "VARBORG.Settings.UiMood.Follow",
      light: "VARBORG.Settings.UiMood.Light",
      dark: "VARBORG.Settings.UiMood.Dark"
    },
    default: "follow",
    onChange: () => refreshMood()
  });

  Hooks.once("setup", () => applyMood(computeMood(), { initial: true }));
  Hooks.once("ready", () => requestAnimationFrame(() => {
    document.body.dataset.vbMoodReady = "";
  }));

  // Several events can come at once, so wait a moment before checking.
  const refresh = foundry.utils.debounce(refreshMood, 150);
  for (const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
    Hooks.on(hook, effect => {
      if (effect.parent?.type === "character") refresh();
    });
  }
  Hooks.on("updateUser", (user, changes) => {
    if (user.id === game.user.id && "character" in changes) refresh();
  });
  Hooks.on("canvasReady", () => refresh());
  Hooks.on("createToken", () => refresh());
  Hooks.on("deleteToken", () => refresh());

  // A window opened later takes the mood of the screen straight away.
  Hooks.on("renderApplicationV2", (app, element) => {
    if (element?.classList?.contains("var-borg")) setTheme(element, currentMood());
  });
}

/** The character this user plays: their assigned one, or, for a player, their only owned one. */
function myCharacter() {
  if (game.user.character) return game.user.character;
  if (!game.user.isGM) {
    const owned = game.actors.filter(actor => actor.type === "character" && actor.isOwner);
    if (owned.length === 1) return owned[0];
  }
  return null;
}

/** Whether a character is In Darkness, on its own marker or on one of its tokens on this scene. */
function actorInDarkness(actor) {
  if (actor.statuses.has(IN_DARKNESS)) return true;
  if (!canvas?.ready) return false;
  try {
    for (const token of actor.getActiveTokens(false, true)) {
      if (token.actor?.statuses.has(IN_DARKNESS)) return true;
    }
  } catch (error) {
    console.error("VÅR BORG | Could not check darkness for the interface mood", error);
  }
  return false;
}

/** For the Dark Master: whether every player character on the scene is In Darkness. */
function partyInDarkness() {
  if (!canvas?.ready || !canvas.scene) return false;
  const flags = [];
  for (const token of canvas.scene.tokens) {
    if (token.actor?.type === "character" && token.actor.hasPlayerOwner) {
      flags.push(token.actor.statuses.has(IN_DARKNESS));
    }
  }
  return allInDarkness(flags);
}

/** The mood this screen should have right now. */
function computeMood() {
  let setting = "follow";
  try {
    setting = game.settings.get(SYSTEM, UI_MOOD) ?? "follow";
  } catch {
    setting = "follow";
  }
  let inDarkness = false;
  if (game.user.isGM) {
    // The Dark Master always follows the whole party, even with a character assigned.
    inDarkness = partyInDarkness();
  } else {
    const character = myCharacter();
    if (character) inDarkness = actorInDarkness(character);
  }
  return chooseMood(setting, inDarkness);
}

/** The mood the screen has now: "light" or "dark". */
export function currentMood() {
  return current;
}

/** Give a window the look for this mood. */
function setTheme(element, mood) {
  element.classList.add("themed");
  element.classList.toggle("theme-dark", mood === "dark");
  element.classList.toggle("theme-light", mood !== "dark");
}

/**
 * Change the screen to a mood: the page, every open window, and (when it
 * really changed, and not at start-up) a short fade unless the person has
 * asked Foundry for less motion.
 */
function applyMood(mood, { initial = false } = {}) {
  const changed = mood !== current;
  current = mood;
  document.body.dataset.vbMood = mood;
  for (const app of foundry.applications.instances.values()) {
    const element = app.element;
    if (element?.classList?.contains("var-borg")) setTheme(element, mood);
  }
  // No flourish while the game is still loading (the scene is drawn before "ready").
  if (changed && !initial && game.ready && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.remove("vb-mood-to-dark", "vb-mood-to-light");
    document.body.classList.add(`vb-mood-to-${mood}`);
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      document.body.classList.remove("vb-mood-to-dark", "vb-mood-to-light");
      changeTimer = null;
    }, CHANGE_MS);
  }
}

/** Work out the mood again and apply it. */
export function refreshMood() {
  applyMood(computeMood());
}
