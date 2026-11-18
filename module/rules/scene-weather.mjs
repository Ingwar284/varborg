/**
 * Which scene weather effect shows today's weather (step 63).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Every weather kind of the hex flower and every hazard has a VÅR BORG
 * scene effect (module/weather-fx/), except Perfect day and Clear sky,
 * which show none. Precipitation and storms fall as rain or snow, as the
 * scene chooses.
 *
 * Designer ruling (GAPS 308): the effects are looks only. They never change
 * a rule; the rules stay on the weather card and in the five automated
 * hazards (module/rules/weather-effects.mjs).
 */

import { HAZARDS } from "./weather.mjs";

/** Every effect id starts with this, so ours never clash with Foundry's or a module's. */
export const PREFIX = "varborg-";

/** What precipitation can fall as. Rain is the default. */
export const PRECIPITATION = ["rain", "snow"];

/** The effect of each weather kind; precipitation kinds have one per form. */
const KIND_EFFECTS = {
  perfectDay: "",
  clearSky: "",
  clouded: "clouded",
  lightPrecipitation: { rain: "lightRain", snow: "lightSnow" },
  heavyPrecipitation: { rain: "heavyRain", snow: "heavySnow" },
  storm: { rain: "rainStorm", snow: "blizzard" }
};

/** Every hazard event, minor and major. */
export const ALL_HAZARDS = [...HAZARDS.minor, ...HAZARDS.major];

/** The full id of an effect name: "siltRain" → "varborg-siltRain". */
export function effectId(name) {
  return name ? PREFIX + name : "";
}

/** The names of all VÅR BORG effects (without the prefix), kinds first, then hazards. */
export function effectNames() {
  const names = [];
  for (const effect of Object.values(KIND_EFFECTS)) {
    if (typeof effect === "string") { if (effect) names.push(effect); }
    else names.push(...PRECIPITATION.map(form => effect[form]));
  }
  return [...names, ...ALL_HAZARDS];
}

/** "rain" or "snow"; anything else counts as rain. */
export function cleanPrecipitation(value) {
  return PRECIPITATION.includes(value) ? value : "rain";
}

/**
 * The scene effect for today's weather.
 * @param {object} weather
 * @param {string} weather.kind           The kind of the hex the weather is on.
 * @param {string|null} weather.hazard    Today's hazard event, if any.
 * @param {string} [weather.precipitation] "rain" (default) or "snow".
 * @returns {string} The effect id, or "" for no effect.
 */
export function sceneEffectFor({ kind, hazard = null, precipitation = "rain" }) {
  if (hazard && ALL_HAZARDS.includes(hazard)) return effectId(hazard);
  const effect = KIND_EFFECTS[kind];
  if (!effect) return "";
  if (typeof effect === "string") return effectId(effect);
  return effectId(effect[cleanPrecipitation(precipitation)]);
}

/* -------------------------------------------- */
/*  Weather playlists (step 63)                  */
/* -------------------------------------------- */

/** The start of every VÅR BORG effect's name in the Weather menu. */
export const LABEL_PREFIX = "VÅR BORG: ";

/** Names compared without case, extra spaces or accent differences. */
export function sameName(name) {
  return String(name ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The names a playlist may have to belong to a weather effect: the effect's
 * name in the Weather menu, and for ours also without "VÅR BORG: ".
 * "VÅR BORG: Silt rain" → ["vår borg: silt rain", "silt rain"].
 */
export function playlistNamesFor(label) {
  const names = [sameName(label)];
  if (label?.startsWith(LABEL_PREFIX)) names.push(sameName(label.slice(LABEL_PREFIX.length)));
  return names;
}

/**
 * Which playlists to start and stop when a scene's weather changes.
 * A playlist named after the new weather effect plays (unless it already
 * is); every other playing playlist named after any weather effect stops.
 * Playlists with other names are never touched.
 * @param {object} options
 * @param {Object<string, string>} options.labels  Every weather effect: id → name in the Weather menu.
 * @param {string} options.weather                 The scene's new effect id ("" for none).
 * @param {{id: string, name: string, playing: boolean}[]} options.playlists
 * @returns {{play: string|null, stop: string[]}} Playlist ids.
 */
export function weatherPlaylistPlan({ labels, weather, playlists }) {
  const weatherNames = new Set(Object.values(labels).flatMap(playlistNamesFor));
  const wanted = new Set(weather && labels[weather] ? playlistNamesFor(labels[weather]) : []);
  const match = playlists.find(p => wanted.has(sameName(p.name)));
  const stop = playlists
    .filter(p => p.playing && p !== match && weatherNames.has(sameName(p.name)))
    .map(p => p.id);
  return { play: match && !match.playing ? match.id : null, stop };
}

/**
 * The playlists the "Create weather playlists" button makes: one per
 * weather effect that has no playlist yet, named as in the Weather menu
 * but without "VÅR BORG: " ("Silt rain", "Rain"), in the order given.
 * @param {object} options
 * @param {Object<string, string>} options.labels  Every weather effect: id → name in the Weather menu.
 * @param {string[]} options.playlistNames         The names of the world's playlists.
 * @returns {string[]} The names of the playlists to create.
 */
export function missingWeatherPlaylists({ labels, playlistNames }) {
  const taken = new Set(playlistNames.map(sameName));
  const missing = [];
  for (const label of Object.values(labels)) {
    const names = playlistNamesFor(label);
    if (names.some(name => taken.has(name))) continue;
    const name = label.startsWith(LABEL_PREFIX) ? label.slice(LABEL_PREFIX.length).trim() : label.trim();
    if (!name) continue;
    missing.push(name);
    names.forEach(n => taken.add(n));
  }
  return missing;
}
