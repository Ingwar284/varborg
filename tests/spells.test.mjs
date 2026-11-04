/**
 * Tests for module/rules/spells.mjs (rules 3.11 Spellcasting).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPELL_ABILITY, CASTING_TIMES, spellDr, outsideSpellList, metalArmourBane, spellModifiers, spellOutcome
} from "../module/rules/spells.mjs";
import { diceMode, MODE } from "../module/rules/test-roll.mjs";
import { modifiedDr } from "../module/rules/test-modifiers.mjs";

const chainShirt = { metal: true, tier: 2, originalTier: 2 };

test("spells test Sanity against DR 11 + the listed cost", () => {
  assert.equal(SPELL_ABILITY, "sanity");
  assert.deepEqual([1, 3, 5, 7, 9].map(spellDr), [12, 14, 16, 18, 20]);
});

test("casting outside your spell list", () => {
  assert.equal(outsideSpellList("arcane", "arcane"), false);
  assert.equal(outsideSpellList("arcane", "divine"), true);
  assert.equal(outsideSpellList("arcane", "none"), true, "a class with no spell list");
  assert.equal(outsideSpellList("arcane", null), true, "no class at all");
  assert.equal(outsideSpellList("arcane", "choose"), null, "the Hedge Mage: the player decides");
});

test("metal armour of tier 2 or heavier smothers magic", () => {
  assert.equal(metalArmourBane(null), false);
  assert.equal(metalArmourBane(chainShirt), true);
  assert.equal(metalArmourBane({ metal: true, tier: 3, originalTier: 3 }), true, "breastplate");
  assert.equal(metalArmourBane({ metal: false, tier: 1, originalTier: 1 }), false, "leather");
  assert.equal(metalArmourBane({ metal: false, tier: 2, originalTier: 2 }), false, "tier 2 marked not metal");
  assert.equal(metalArmourBane({ metal: true, tier: 1, originalTier: 1 }), false, "metal but only tier 1");
  assert.equal(metalArmourBane({ metal: true, tier: 1, originalTier: 2 }), true, "damaged chain shirt still counts");
  assert.equal(metalArmourBane({ metal: true, tier: 0, originalTier: 2 }), false, "destroyed armour");
});

test("each source of Bane, Boon and DR", () => {
  assert.deepEqual(spellModifiers(), { boons: 0, banes: 0, dr: 0 });
  assert.deepEqual(spellModifiers({ outsideList: true }), { boons: 0, banes: 1, dr: 0 });
  assert.deepEqual(spellModifiers({ metalArmour: true }), { boons: 0, banes: 1, dr: 0 });
  assert.deepEqual(spellModifiers({ duress: true }), { boons: 0, banes: 1, dr: 0 });
  assert.deepEqual(spellModifiers({ castingTime: "minute" }), { boons: 0, banes: 0, dr: -2 });
  assert.deepEqual(spellModifiers({ castingTime: "hour" }), { boons: 1, banes: 0, dr: 0 });
  assert.deepEqual(spellModifiers({ severalCasters: true }), { boons: 1, banes: 0, dr: 0 });
  assert.deepEqual(CASTING_TIMES, ["normal", "minute", "hour"]);
  assert.throws(() => spellModifiers({ castingTime: "day" }), RangeError);
});

test("Boon and Bane cancel, as for every test", () => {
  const both = spellModifiers({ metalArmour: true, severalCasters: true });
  assert.equal(diceMode(both.boons, both.banes), MODE.NORMAL);
  const twoBanes = spellModifiers({ metalArmour: true, outsideList: true });
  assert.equal(diceMode(twoBanes.boons, twoBanes.banes), MODE.BANE, "Bane twice is still just Bane");
});

test("And They Spoke of Fire (🟒3) in a chain shirt: DR14 with Bane", () => {
  const mods = spellModifiers({ outsideList: outsideSpellList("arcane", "arcane"), metalArmour: metalArmourBane(chainShirt) });
  assert.equal(modifiedDr(spellDr(3), mods.dr), 14);
  assert.equal(diceMode(mods.boons, mods.banes), MODE.BANE);
});

test("taking 1 minute lowers the DR by 2, never below 6", () => {
  const minute = spellModifiers({ castingTime: "minute" });
  assert.equal(modifiedDr(spellDr(3), minute.dr), 12);
  assert.equal(modifiedDr(7, minute.dr), 6);
});

test("spell outcomes: as powers, and a Ruin calls for the Shadowblight table", () => {
  assert.deepEqual(spellOutcome("triumph"), { damage: true, multiplier: 2, effect: true, shadowblight: false });
  assert.deepEqual(spellOutcome("failure"), { damage: true, multiplier: 0.5, effect: false, shadowblight: false });
  assert.deepEqual(spellOutcome("ruin"), { damage: false, multiplier: 0, effect: false, shadowblight: true });
});
