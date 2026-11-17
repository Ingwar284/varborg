/**
 * Tests for which scene weather effect shows today's weather
 * (step 63, GAPS 308).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PREFIX, ALL_HAZARDS, effectId, effectNames, cleanPrecipitation, sceneEffectFor,
  sameName, playlistNamesFor, weatherPlaylistPlan, missingWeatherPlaylists
} from "../module/rules/scene-weather.mjs";
import { HEXES } from "../module/rules/weather.mjs";

test("all twenty hazards are covered", () => {
  assert.equal(ALL_HAZARDS.length, 20);
  for (const hazard of ALL_HAZARDS) {
    assert.equal(sceneEffectFor({ kind: "minorHazard", hazard }), `${PREFIX}${hazard}`);
  }
});

test("Perfect day and Clear sky show no effect", () => {
  assert.equal(sceneEffectFor({ kind: "perfectDay" }), "");
  assert.equal(sceneEffectFor({ kind: "clearSky" }), "");
});

test("every other kind on the flower has an effect", () => {
  const kinds = new Set(HEXES.map(hex => hex.kind));
  for (const kind of kinds) {
    if (["perfectDay", "clearSky", "minorHazard", "majorHazard"].includes(kind)) continue;
    assert.ok(sceneEffectFor({ kind }).startsWith(PREFIX), kind);
  }
});

test("precipitation falls as rain by default, or as snow", () => {
  assert.equal(sceneEffectFor({ kind: "lightPrecipitation" }), "varborg-lightRain");
  assert.equal(sceneEffectFor({ kind: "heavyPrecipitation", precipitation: "snow" }), "varborg-heavySnow");
  assert.equal(sceneEffectFor({ kind: "storm", precipitation: "rain" }), "varborg-rainStorm");
  assert.equal(sceneEffectFor({ kind: "storm", precipitation: "snow" }), "varborg-blizzard");
  assert.equal(sceneEffectFor({ kind: "storm", precipitation: "hail" }), "varborg-rainStorm");
  assert.equal(cleanPrecipitation(undefined), "rain");
});

test("a hazard wins over the kind; a hazard hex without an event shows nothing", () => {
  assert.equal(sceneEffectFor({ kind: "majorHazard", hazard: "blackburn" }), "varborg-blackburn");
  assert.equal(sceneEffectFor({ kind: "majorHazard", hazard: null }), "");
  assert.equal(sceneEffectFor({ kind: "clouded", hazard: "notAHazard" }), "varborg-clouded");
});

test("the list of effects has no duplicates and every name makes a full id", () => {
  const names = effectNames();
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, 7 + 20);
  assert.equal(effectId(""), "");
  assert.equal(effectId("fog"), "varborg-fog");
});

/* Weather playlists */

const LABELS = {
  rain: "Rain",
  "varborg-siltRain": "VÅR BORG: Silt rain",
  "varborg-rainStorm": "VÅR BORG: Storm (rain)"
};

test("a playlist named after the effect, with or without VÅR BORG:, belongs to it", () => {
  assert.deepEqual(playlistNamesFor("VÅR BORG: Silt rain"), ["vår borg: silt rain", "silt rain"]);
  assert.deepEqual(playlistNamesFor("Rain"), ["rain"]);
  assert.equal(sameName("  Silt   RAIN "), "silt rain");
});

test("the new weather's playlist plays and other weather playlists stop", () => {
  const playlists = [
    { id: "a", name: "Silt rain", playing: false },
    { id: "b", name: "Rain", playing: true },
    { id: "c", name: "Tavern songs", playing: true },
    { id: "d", name: "VÅR BORG: Storm (rain)", playing: true }
  ];
  assert.deepEqual(weatherPlaylistPlan({ labels: LABELS, weather: "varborg-siltRain", playlists }),
    { play: "a", stop: ["b", "d"] });
});

test("a playlist already playing is left playing", () => {
  const playlists = [{ id: "a", name: "silt rain", playing: true }, { id: "b", name: "Rain", playing: false }];
  assert.deepEqual(weatherPlaylistPlan({ labels: LABELS, weather: "varborg-siltRain", playlists }),
    { play: null, stop: [] });
});

test("weather without a playlist, or no weather, only stops the weather playlists", () => {
  const playlists = [{ id: "b", name: "Rain", playing: true }, { id: "c", name: "Tavern songs", playing: true }];
  assert.deepEqual(weatherPlaylistPlan({ labels: LABELS, weather: "varborg-rainStorm", playlists }),
    { play: null, stop: ["b"] });
  assert.deepEqual(weatherPlaylistPlan({ labels: LABELS, weather: "", playlists }),
    { play: null, stop: ["b"] });
});

test("the button creates a playlist for each weather effect that has none", () => {
  assert.deepEqual(missingWeatherPlaylists({ labels: LABELS, playlistNames: [] }),
    ["Rain", "Silt rain", "Storm (rain)"]);
});

test("the button skips effects that already have a playlist, by either name", () => {
  assert.deepEqual(missingWeatherPlaylists({
    labels: LABELS,
    playlistNames: ["rain", "VÅR BORG: Silt Rain", "Tavern songs"]
  }), ["Storm (rain)"]);
  assert.deepEqual(missingWeatherPlaylists({
    labels: LABELS,
    playlistNames: ["Rain", "Silt rain", "Storm (rain)"]
  }), []);
});
