/**
 * Tests for module/rules/tokens.mjs: the token settings new actors get.
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DISPLAY, DISPOSITION, TOKEN_DEFAULTS, missingTokenDefaults } from "../module/rules/tokens.mjs";

test("every token shows its name on hover to anyone", () => {
  for (const type of ["character", "foe", "minion", "vehicle"]) assert.equal(TOKEN_DEFAULTS[type].displayName, DISPLAY.HOVER);
});

test("characters: linked, friendly, HP and Wounds bars always shown", () => {
  const c = TOKEN_DEFAULTS.character;
  assert.equal(c.actorLink, true);
  assert.equal(c.disposition, DISPOSITION.FRIENDLY);
  assert.equal(c.displayBars, DISPLAY.ALWAYS);
  assert.equal(c.bar1.attribute, "hp");
  assert.equal(c.bar2.attribute, "wounds");
});

test("foes: not linked, hostile, HP bar on hover, no second bar", () => {
  const f = TOKEN_DEFAULTS.foe;
  assert.equal(f.actorLink, false);
  assert.equal(f.disposition, DISPOSITION.HOSTILE);
  assert.equal(f.displayBars, DISPLAY.HOVER);
  assert.equal(f.bar1.attribute, "hp");
  assert.equal(f.bar2.attribute, null);
});

test("a new actor with no token settings gets them all", () => {
  assert.deepEqual(missingTokenDefaults("foe", {}), {
    "prototypeToken.actorLink": false,
    "prototypeToken.disposition": -1,
    "prototypeToken.displayName": 30,
    "prototypeToken.displayBars": 30,
    "prototypeToken.bar1.attribute": "hp",
    "prototypeToken.bar2.attribute": null,
    "prototypeToken.sight.enabled": true,
    "prototypeToken.sight.range": 0
  });
});

test("settings the actor already has are kept", () => {
  const missing = missingTokenDefaults("character", { prototypeToken: { actorLink: false, bar1: { attribute: "fortune" } } });
  assert.ok(!("prototypeToken.actorLink" in missing));
  assert.ok(!("prototypeToken.bar1.attribute" in missing));
  assert.equal(missing["prototypeToken.bar2.attribute"], "wounds");
});

test("minions: linked, friendly, HP bar always shown", () => {
  const m = TOKEN_DEFAULTS.minion;
  assert.equal(m.actorLink, true);
  assert.equal(m.disposition, DISPOSITION.FRIENDLY);
  assert.equal(m.displayBars, DISPLAY.ALWAYS);
  assert.equal(m.bar1.attribute, "hp");
  assert.equal(m.bar2.attribute, null);
});

test("vehicles: linked, neutral, HP bar on hover", () => {
  const v = TOKEN_DEFAULTS.vehicle;
  assert.equal(v.actorLink, true);
  assert.equal(v.disposition, DISPOSITION.NEUTRAL);
  assert.equal(v.displayBars, DISPLAY.HOVER);
  assert.equal(v.bar1.attribute, "hp");
});

test("an unknown actor type gets nothing", () => {
  assert.deepEqual(missingTokenDefaults("airship", {}), {});
});

test("chests: not linked, neutral, no bars", () => {
  const c = TOKEN_DEFAULTS.chest;
  assert.equal(c.actorLink, false);
  assert.equal(c.disposition, DISPOSITION.NEUTRAL);
  assert.equal(c.displayBars, DISPLAY.NONE);
  assert.equal(c.bar1.attribute, null);
});

test("every token but a chest has vision, range 0 (sees only lit areas)", () => {
  for (const type of ["character", "foe", "minion", "vehicle"]) assert.deepEqual(TOKEN_DEFAULTS[type].sight, { enabled: true, range: 0 });
  assert.equal(TOKEN_DEFAULTS.chest.sight.enabled, false);
});
