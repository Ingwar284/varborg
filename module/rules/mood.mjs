/**
 * Interface mood: which look a screen gets, light or dark.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * The setting is what each person chose: "follow" (their own character decides),
 * "light" or "dark" (always that look).
 */

export const MOODS = ["light", "dark"];
export const MOOD_SETTINGS = ["follow", "light", "dark"];

/** The mood for one screen. setting: "follow" | "light" | "dark". inDarkness: boolean. */
export function chooseMood(setting, inDarkness) {
  if (setting === "light") return "light";
  if (setting === "dark") return "dark";
  return inDarkness ? "dark" : "light";
}

/** For the Dark Master: dark only when there is at least one entry and every entry is true. */
export function allInDarkness(flags) {
  return flags.length > 0 && flags.every(Boolean);
}
