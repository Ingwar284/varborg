/**
 * Tests for module/rules/spells.mjs (rules 3.11 Spellcasting).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPELL_ABILITY, CASTING_TIMES, spellDr, outsideSpellList, metalArmourBane, spellModifiers, spellOutcome,
  LIFE_FORCE_ABILITY, lifeForceLeft, lifeForceWounds, castingAbility, lifeForceFormula, lifeForceDr,
  scrollUse, scrollModifiers, RITUAL_DRS, castingDr, ritualUse, ritualModifiers
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

test("life force tests Toughness instead of Sanity", () => {
  assert.equal(LIFE_FORCE_ABILITY, "toughness");
  assert.equal(castingAbility(0), "sanity");
  assert.equal(castingAbility(2), "toughness");
});

test("life force: only the wounds left before your maximum", () => {
  assert.equal(lifeForceLeft(0, 3), 3);
  assert.equal(lifeForceLeft(2, 3), 1);
  assert.equal(lifeForceLeft(3, 3), 0);
  assert.equal(lifeForceLeft(4, 3), 0, "never negative");
  assert.equal(lifeForceWounds(2, 0, 3), 2);
  assert.equal(lifeForceWounds(5, 1, 3), 2, "capped at what is left");
  assert.equal(lifeForceWounds(-1, 0, 3), 0);
  assert.equal(lifeForceWounds("", 0, 3), 0);
  assert.equal(lifeForceWounds(1, 0, 1), 1, "a caster with 1 max wound can spend it once");
  assert.equal(lifeForceWounds(1, 1, 1), 0);
});

test("life force rolls one d4 per wound", () => {
  assert.equal(lifeForceFormula(0), null);
  assert.equal(lifeForceFormula(1), "1d4");
  assert.equal(lifeForceFormula(3), "3d4");
});

test("life force lowers the DR by the d4s, never below 6", () => {
  assert.equal(lifeForceDr(14, 3), 11);
  assert.equal(lifeForceDr(14, 12), 6, "never below DR6");
  assert.equal(lifeForceDr(14, 3, -2), 9, "with 1 minute of casting");
  assert.equal(lifeForceDr(14, 0), 14);
});

test("scrolls: no Ember; actions on your own turn in combat; free outside combat", () => {
  assert.deepEqual(scrollUse({ inCombat: true, onOwnTurn: true, actions: 2 }),
    { allowed: true, reason: null, ember: 0, actions: 2, marksUsed: false });
  assert.equal(scrollUse({ inCombat: true, onOwnTurn: false, actions: 2 }).allowed, false);
  assert.deepEqual(scrollUse({ inCombat: false, actions: 2 }),
    { allowed: true, reason: null, ember: 0, actions: 0, marksUsed: false }, "never marked used: the scroll is gone");
  assert.throws(() => scrollUse({ actions: -1 }), RangeError);
});

test("scrolls never have the other-list Bane, but other modifiers count", () => {
  assert.deepEqual(scrollModifiers({ outsideList: true }), { boons: 0, banes: 0, dr: 0 });
  assert.deepEqual(scrollModifiers({ outsideList: true, metalArmour: true }), { boons: 0, banes: 1, dr: 0 });
  assert.equal(modifiedDr(spellDr(3), scrollModifiers({}).dr), 14, "the spell's normal DR");
});

test("a ritual is cast at its own DR (its tier heading); a spell at 11 + cost", () => {
  assert.deepEqual(RITUAL_DRS, [14, 16, 18, 20]);
  assert.equal(castingDr({ ritual: true, ritualDr: 16, cost: 1 }), 16);
  assert.equal(castingDr({ ritual: false, ritualDr: 16, cost: 3 }), 14);
  assert.equal(castingDr({ cost: 5 }), 16, "a scroll or older spell without the ritual box");
});

test("a ritual is cast only outside combat, with no Ember, no actions and no once-only limit", () => {
  const free = { allowed: true, reason: null, ember: 0, actions: 0, reactions: 0, marksUsed: false };
  assert.deepEqual(ritualUse({ inCombat: false }), free);
  assert.deepEqual(ritualUse({ inCombat: true }), { ...free, allowed: false, reason: "combat" });
});

test("a ritual's casting time gives no Boon or −2 DR; the other modifiers still apply", () => {
  assert.deepEqual(ritualModifiers({ castingTime: "hour" }), { boons: 0, banes: 0, dr: 0 });
  assert.deepEqual(ritualModifiers({ castingTime: "minute" }), { boons: 0, banes: 0, dr: 0 });
  assert.deepEqual(ritualModifiers({ outsideList: true, metalArmour: true, severalCasters: true }), { boons: 1, banes: 2, dr: 0 });
});
