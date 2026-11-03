/**
 * Tests for module/rules/tokens.mjs: the token settings new actors get.
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DISPLAY, DISPOSITION, TOKEN_DEFAULTS, missingTokenDefaults } from "../module/rules/tokens.mjs";

test("every token shows its name on hover to anyone", () => {
  for (const type of ["character", "foe"]) assert.equal(TOKEN_DEFAULTS[type].displayName, DISPLAY.HOVER);
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
    "prototypeToken.bar2.attribute": null
  });
});

test("settings the actor already has are kept", () => {
  const missing = missingTokenDefaults("character", { prototypeToken: { actorLink: false, bar1: { attribute: "fortune" } } });
  assert.ok(!("prototypeToken.actorLink" in missing));
  assert.ok(!("prototypeToken.bar1.attribute" in missing));
  assert.equal(missing["prototypeToken.bar2.attribute"], "wounds");
});

test("an unknown actor type gets nothing", () => {
  assert.deepEqual(missingTokenDefaults("vehicle", {}), {});
});
