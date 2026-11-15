/**
 * Interface mood: the VÅR BORG windows look hopeful in light and threatening
 * in darkness.
 *
 * - A player's screen follows their own character's In Darkness marker
 *   (module/darkness.mjs), unless they choose otherwise.
 * - The Dark Master's screen turns dark only when every player character on
 *   the scene is In Darkness.
 * - Each person can override it in the settings: always light, or always dark.
 * - Night on the side panels: from dusk to dawn (the Night phase on the
 *   world clock) the five table panels (Calendar & Time, Weather, Misery,
 *   Light, Ember and Gloom) take the dark mood, whatever the rest of the
 *   screen shows. They carry the class "vb-night", which switches on the
 *   dark tokens for that window alone (styles/tokens.css). "Always light"
 *   in the settings keeps them light.
 *
 * Only the look changes, on that person's own screen. The mood is worked out
 * here; the look itself comes from the "theme-dark" and "theme-light" classes
 * on each window (see the styles). The pure rules are in module/rules/mood.mjs.
 */

import { IN_DARKNESS } from "./rules/conditions.mjs";
import { chooseMood, allInDarkness } from "./rules/mood.mjs";
import { phaseAt } from "./rules/calendar.mjs";

const SYSTEM = "var-borg";
const UI_MOOD = "uiMood";

/** How long the flourish lasts, in milliseconds (the CSS animation in stage.css). */
const CHANGE_MS = 900;

/**
 * How long the colour fade class stays on the body, in milliseconds: the
 * 900 ms fade in base.css plus a little room, so the fade is never cut short.
 */
const FADE_MS = 1000;

let current = "light";
let night = false;
let changeTimer = null;
let fadeTimer = null;

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

  // Dusk and dawn: the side panels change with the clock.
  Hooks.on("updateWorldTime", () => refreshNight());

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
  const setting = moodSetting();
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

/** The mood setting: "follow", "light" or "dark". */
function moodSetting() {
  try {
    return game.settings.get(SYSTEM, UI_MOOD) ?? "follow";
  } catch {
    return "follow";
  }
}

/** Whether the world clock is in the Night phase, and this screen lets the side panels show it. */
function computeNight() {
  if (moodSetting() === "light") return false;
  try {
    return phaseAt(game.time.worldTime) === "night";
  } catch {
    return false;
  }
}

/** Give a window the look for this mood. A side panel at night is dark. */
function setTheme(element, mood) {
  const nightPanel = night && element.classList.contains("table-panel");
  element.classList.toggle("vb-night", nightPanel);
  if (nightPanel) mood = "dark";
  element.classList.add("themed");
  element.classList.toggle("theme-dark", mood === "dark");
  element.classList.toggle("theme-light", mood !== "dark");
}

/**
 * Change the screen to a mood: the page, every open window, and (when it
 * really changed, and not at start-up) a colour fade, plus a short flourish
 * unless the person has asked for less motion.
 */
function applyMood(mood, { initial = false } = {}) {
  const changed = mood !== current;
  current = mood;
  night = computeNight();
  // The colour fade class goes on before the colours change, in the same step,
  // so the browser fades them rather than switching.
  if (changed && !initial && game.ready) {
    document.body.classList.add("vb-mood-changing");
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      document.body.classList.remove("vb-mood-changing");
      fadeTimer = null;
    }, FADE_MS);
  }
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

/**
 * The clock moved: if night began or ended, the side panels change, with
 * the same colour fade as a change of mood (no flourish: the screen itself
 * keeps its mood).
 */
function refreshNight() {
  const now = computeNight();
  if (now === night) return;
  night = now;
  if (game.ready) {
    document.body.classList.add("vb-mood-changing");
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      document.body.classList.remove("vb-mood-changing");
      fadeTimer = null;
    }, FADE_MS);
  }
  for (const app of foundry.applications.instances.values()) {
    const element = app.element;
    if (element?.classList?.contains("table-panel")) setTheme(element, current);
  }
}
