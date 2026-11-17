/**
 * Scenes that follow today's weather (step 63, GAPS 308).
 *
 * Scene Configuration gets two fields under Foundry's Weather menu:
 * - Follows today's weather (flags.var-borg.followWeather, off by default);
 * - Precipitation falls as rain or snow (flags.var-borg.precipitation).
 *
 * Whenever the weather changes (a new day, a Long Rest, Downtime, a travel
 * shift, Set weather), the active Dark Master's client gives every following
 * scene the VÅR BORG effect for today's weather (module/weather-fx/), all in
 * one update. The same happens to one scene when it is set to follow, or its
 * precipitation changes, and to all following scenes when the Weather
 * subsystem is switched back on. A hand pick in the Weather menu lasts until
 * the next change. With the Weather subsystem off, scenes are left alone.
 *
 * Weather playlists: when the active scene's weather effect changes (by
 * following or by hand), or another scene is activated, a playlist named
 * after the new effect starts playing ("Silt rain" or "VÅR BORG: Silt rain";
 * also Foundry's own, such as "Rain"), and every other playing playlist
 * named after a weather effect stops. Other playlists are left alone. This
 * works whether or not the Weather subsystem is in use.
 *
 * The Dark Master's "Create weather playlists" button in Configure Settings
 * makes an empty playlist for every weather effect that has none yet, in a
 * playlist folder called "Weather". The Dark Master then adds the sounds.
 *
 * The effects are looks only; they never change a rule. Which effect goes
 * with which weather, and the playlist names, are in
 * module/rules/scene-weather.mjs.
 */

import {
  sceneEffectFor, cleanPrecipitation, PRECIPITATION, weatherPlaylistPlan, missingWeatherPlaylists
} from "./rules/scene-weather.mjs";
import { hexById } from "./rules/weather.mjs";
import { currentWeather } from "./weather.mjs";
import { weatherOn } from "./settings.mjs";

const SYSTEM = "var-borg";
const FOLLOW = "followWeather";
const PRECIP = "precipitation";

/** Set up the scene fields and the following. Called at init. */
export function registerSceneWeather() {
  Hooks.on("renderSceneConfig", addSceneFields);
  Hooks.on("updateScene", onSceneUpdated);
  Hooks.on("updateSetting", setting => {
    if (setting.key === `${SYSTEM}.useWeather` && weatherOn()) followTodaysWeather();
  });

  /** The menu "window": it asks, creates the playlists and opens nothing else. */
  class CreateWeatherPlaylists extends foundry.applications.api.ApplicationV2 {
    /** @override */
    async render() {
      await createWeatherPlaylists();
      return this;
    }
  }
  game.settings.registerMenu(SYSTEM, "weatherPlaylists", {
    name: "VARBORG.WeatherFx.PlaylistsMenuName",
    label: "VARBORG.WeatherFx.PlaylistsLabel",
    hint: "VARBORG.WeatherFx.PlaylistsHint",
    icon: "fa-solid fa-music",
    type: CreateWeatherPlaylists,
    restricted: true
  });
}

/* -------------------------------------------- */
/*  Following                                    */
/* -------------------------------------------- */

/** Whether a scene follows today's weather. */
function follows(scene) {
  return Boolean(scene.getFlag(SYSTEM, FOLLOW));
}

/** The effect id today's weather gives this scene ("" for none). */
function effectForScene(scene) {
  const { hex, hazard } = currentWeather();
  return sceneEffectFor({
    kind: hexById(hex)?.kind,
    hazard,
    precipitation: cleanPrecipitation(scene.getFlag(SYSTEM, PRECIP))
  });
}

/**
 * Give every following scene today's weather effect. Only the active Dark
 * Master's client writes, so the scenes are updated once.
 * @param {Scene[]} [scenes]  Only these scenes (default: all).
 */
export async function followTodaysWeather(scenes = game.scenes.contents) {
  if (!game.user.isActiveGM || !weatherOn()) return;
  const updates = [];
  for (const scene of scenes) {
    if (!follows(scene)) continue;
    const weather = effectForScene(scene);
    if (scene.weather !== weather) updates.push({ _id: scene.id, weather });
  }
  if (updates.length) await Scene.updateDocuments(updates);
}

/**
 * A scene set to follow, or its precipitation changed: give it today's weather now.
 * The active scene's weather changed, or a scene was activated: its weather playlist.
 */
function onSceneUpdated(scene, changes) {
  if (scene.active && (("weather" in changes) || changes.active)) playWeatherPlaylist(scene.weather);
  const flags = changes.flags?.[SYSTEM];
  if (!flags || !((FOLLOW in flags) || (PRECIP in flags))) return;
  followTodaysWeather([scene]);
}

/* -------------------------------------------- */
/*  Weather playlists                            */
/* -------------------------------------------- */

/**
 * Play the playlist named after a weather effect and stop the other weather
 * playlists. Only the active Dark Master's client does it.
 * @param {string} weather  The effect id ("" for none).
 */
async function playWeatherPlaylist(weather) {
  if (!game.user.isActiveGM) return;
  const labels = weatherLabels();
  const playlists = game.playlists.contents;
  const { play, stop } = weatherPlaylistPlan({
    labels,
    weather,
    playlists: playlists.map(p => ({ id: p.id, name: p.name, playing: p.playing }))
  });
  for (const id of stop) await game.playlists.get(id)?.stopAll();
  if (play) await game.playlists.get(play)?.playAll();
}

/** Every weather effect: id → its name in the Weather menu. */
function weatherLabels() {
  const labels = {};
  for (const [id, effect] of Object.entries(CONFIG.weatherEffects)) labels[id] = game.i18n.localize(effect.label);
  return labels;
}

/**
 * Make an empty playlist for every weather effect that has none, in the
 * "Weather" playlist folder (made if missing), after asking the Dark Master.
 * @returns {Promise<number>} How many playlists were made.
 */
export async function createWeatherPlaylists() {
  if (!game.user.isGM) return 0;
  const i18n = game.i18n;
  const names = missingWeatherPlaylists({
    labels: weatherLabels(),
    playlistNames: game.playlists.contents.map(p => p.name)
  });
  if (!names.length) {
    ui.notifications.info(i18n.localize("VARBORG.WeatherFx.PlaylistsNone"));
    return 0;
  }
  const folderName = i18n.localize("VARBORG.WeatherFx.PlaylistsFolder");
  const sure = await foundry.applications.api.DialogV2.confirm({
    window: { title: "VARBORG.WeatherFx.PlaylistsTitle", icon: "fa-solid fa-music" },
    content: `<p>${foundry.utils.escapeHTML(i18n.format("VARBORG.WeatherFx.PlaylistsConfirm",
      { count: names.length, folder: folderName }))}</p>`
  });
  if (!sure) return 0;
  let folder = game.folders.find(f => f.type === "Playlist" && f.name === folderName && !f.folder);
  folder ??= await Folder.create({ name: folderName, type: "Playlist" });
  await Playlist.createDocuments(names.map(name => ({ name, folder: folder.id })));
  ui.notifications.info(i18n.format("VARBORG.WeatherFx.PlaylistsDone", { count: names.length, folder: folderName }));
  return names.length;
}

/* -------------------------------------------- */
/*  The fields in Scene Configuration            */
/* -------------------------------------------- */

/** Add the two fields under the Weather menu. */
function addSceneFields(app, element) {
  const scene = app.document;
  if (!scene || element.querySelector(".var-borg-scene-weather")) return;
  const weatherGroup = element.querySelector('select[name="weather"]')?.closest(".form-group");
  if (!weatherGroup) return;

  const t = key => foundry.utils.escapeHTML(game.i18n.localize(`VARBORG.WeatherFx.${key}`));
  const following = follows(scene);
  const precipitation = cleanPrecipitation(scene.getFlag(SYSTEM, PRECIP));
  const options = PRECIPITATION.map(form => {
    const label = t(form === "snow" ? "Snow" : "Rain");
    return `<option value="${form}" ${form === precipitation ? "selected" : ""}>${label}</option>`;
  }).join("");

  weatherGroup.insertAdjacentHTML("afterend", `
    <div class="form-group var-borg-scene-weather">
      <label for="${app.id}-vb-follow">${t("Follow")}</label>
      <div class="form-fields">
        <input type="checkbox" id="${app.id}-vb-follow" name="flags.${SYSTEM}.${FOLLOW}" ${following ? "checked" : ""}>
      </div>
      <p class="hint">${t("FollowHint")}</p>
    </div>
    <div class="form-group var-borg-scene-weather">
      <label for="${app.id}-vb-precipitation">${t("Precipitation")}</label>
      <div class="form-fields">
        <select id="${app.id}-vb-precipitation" name="flags.${SYSTEM}.${PRECIP}">${options}</select>
      </div>
      <p class="hint">${t("PrecipitationHint")}</p>
    </div>`);
}
