/**
 * Tests for the saved example files in content/examples/.
 * They check that every example the importer will create follows the rules.
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ABILITIES, clampAbility } from "../module/rules/abilities.mjs";
import { capHp } from "../module/rules/health.mjs";
import {
  WEAPON_KINDS, DAMAGE_TYPES, EXPENDABLE_DICE, SHIELD_SIZES, ARMOUR_TIER_MIN, ARMOUR_TIER_MAX,
  isDamageFormula, isMetalByDefault, capArmourTier
} from "../module/rules/equipment.mjs";
import { isCumbersomeByDefault } from "../module/rules/carrying.mjs";
import { FOE_TIERS, FOE_CATEGORIES, FOE_ARMOUR_DICE, MORALE_MIN, MORALE_MAX } from "../module/rules/foe.mjs";
import { FEAT_SOURCES } from "../module/rules/feats.mjs";
import { POWER_SOURCES, POWER_TEST_ABILITIES, MAX_POWER_ACTIONS, powerDr, powerAbility } from "../module/rules/powers.mjs";
import { TOKEN_DEFAULTS } from "../module/rules/tokens.mjs";
import { GLOOM_CONDITIONS, gloomTest } from "../module/rules/gloom.mjs";
import { isRoundsFormula } from "../module/rules/timers.mjs";
import { LIGHT_KINDS, lightFromName } from "../module/rules/light.mjs";
import { SPELL_LISTS, STARTING_DICE, wealthFormula } from "../module/rules/origins.mjs";
import { SPELL_LISTS_OF_SPELLS, spellDr } from "../module/rules/spells.mjs";
import { MINION_TIERS, tierStats } from "../module/rules/minions.mjs";
import { FREQUENCIES } from "../module/rules/uses.mjs";
import { SPEEDS } from "../module/rules/vehicles.mjs";

const folder = new URL("../content/examples/", import.meta.url);
const readJson = file => JSON.parse(readFileSync(new URL(file, folder), "utf8"));

const index = readJson("index.json");
const examples = Object.values(index).flat().map(file => ({ file, data: readJson(file) }));

test("every example has a name and a valid Foundry id", () => {
  for (const { file, data } of examples) {
    assert.ok(data.name, `${file} has no name`);
    assert.match(data._id, /^[a-zA-Z0-9]{16}$/, `${file} needs a 16-letter-or-digit _id`);
  }
});

test("no two examples share an id", () => {
  const ids = examples.map(({ data }) => data._id);
  assert.equal(new Set(ids).size, ids.length);
});

test("example characters follow the ability and HP rules", () => {
  for (const { file, data } of examples.filter(({ data }) => data.type === "character")) {
    for (const ability of ABILITIES) {
      const score = data.system.abilities[ability];
      assert.equal(clampAbility(score), score, `${file}: ${ability} must be −3 … +6`);
    }
    assert.equal(capHp(data.system.hp.value, data.system.hp.max), data.system.hp.value,
      `${file}: HP must not be above max HP`);
  }
});

test("example actors carry the token defaults, so importing sets them", () => {
  for (const { file, data } of examples.filter(({ data }) => data.type in TOKEN_DEFAULTS)) {
    assert.deepEqual(data.prototypeToken, TOKEN_DEFAULTS[data.type], `${file}: token settings`);
  }
});

test("Example Hero is in the examples", () => {
  assert.ok(examples.some(({ data }) => data.name === "Example Hero"));
});

const ofType = type => examples.filter(({ data }) => data.type === type);

test("example weapons use real damage dice and allowed choices", () => {
  for (const { file, data } of ofType("weapon")) {
    const system = data.system;
    assert.ok(isDamageFormula(system.damage), `${file}: damage "${system.damage}" is not a die`);
    assert.ok(WEAPON_KINDS.includes(system.kind), `${file}: unknown kind`);
    assert.ok(DAMAGE_TYPES.includes(system.damageType), `${file}: unknown damage type`);
    assert.ok(EXPENDABLE_DICE.includes(system.expendable), `${file}: unknown expendable die`);
  }
});

test("example armour follows the tier and metal rules", () => {
  for (const { file, data } of ofType("armour")) {
    const { tier, originalTier, metal } = data.system;
    assert.ok(originalTier >= ARMOUR_TIER_MIN && originalTier <= ARMOUR_TIER_MAX, `${file}: tier must be t0 … t4`);
    assert.equal(capArmourTier(tier, originalTier), tier, `${file}: tier above original tier`);
    assert.equal(metal, isMetalByDefault(originalTier), `${file}: metal should follow its tier`);
  }
});

test("example shields are light or heavy", () => {
  for (const { file, data } of ofType("shield")) {
    assert.ok(SHIELD_SIZES.includes(data.system.size), `${file}: unknown size`);
  }
});

test("step 8 examples match the prices and stats in rules 4.1", () => {
  const byName = name => examples.find(({ data }) => data.name === name)?.data.system;
  assert.deepEqual(
    ["Dagger", "Flintlock pistol", "Greatsword"].map(name => [byName(name).damage, byName(name).price]),
    [["d4", 10], ["2d4", 50], ["d8", 40]]
  );
  assert.deepEqual(
    ["Leather armour", "Chain shirt", "Breastplate"].map(name => [byName(name).tier, byName(name).price]),
    [[1, 25], [2, 100], [3, 200]]
  );
  assert.equal(byName("Light shield").price, 20);
  assert.equal(byName("Flintlock pistol").reload, 2);
  assert.equal(byName("Flintlock pistol").expendable, "d4");
});

test("example items start with the system's cumbersome suggestion", () => {
  for (const type of ["weapon", "armour", "shield", "gear", "container"]) {
    for (const { file, data } of ofType(type)) {
      assert.equal(data.system.cumbersome, isCumbersomeByDefault(type, data.system), `${file}: cumbersome`);
      assert.equal(data.system.storedIn, "", `${file}: examples start carried loose`);
    }
  }
});

test("example gear uses allowed expendable dice", () => {
  for (const { file, data } of ofType("gear")) {
    assert.ok(EXPENDABLE_DICE.includes(data.system.expendable), `${file}: unknown expendable die`);
  }
});

test("step 9 examples match the prices and effects in rules 4.1", () => {
  const byName = name => examples.find(({ data }) => data.name === name)?.data.system;
  assert.deepEqual(
    ["Rope", "Torch", "Healing potion", "Medicine box", "Satchel"].map(name => byName(name).price),
    [4, 2, 15, 50, 8]
  );
  assert.equal(byName("Healing potion").expendable, "d2");
  assert.equal(byName("Medicine box").expendable, "d6");
  assert.equal(byName("Satchel").capacity, 10);
});

test("step 35 lights match rules 4.1: torch and lantern oil 1 hour, lantern needs oil", () => {
  const byName = name => examples.find(({ data }) => data.name === name)?.data.system;
  for (const { file, data } of ofType("gear")) {
    assert.ok(LIGHT_KINDS.includes(data.system.light ?? ""), `${file}: unknown light kind`);
    const known = lightFromName(data.name);
    assert.equal(data.system.light ?? "", known?.light ?? "", `${file}: light kind`);
  }
  assert.equal(byName("Torch").lightMinutes, 60);
  assert.equal(byName("Lantern oil").lightMinutes, 60);
  // Rules 4.1: torch 40 feet, lantern 60 feet (GAPS 154).
  assert.equal(byName("Torch").lightRange, 40);
  assert.equal(byName("Lantern").lightRange, 60);
  assert.deepEqual(["Lantern", "Lantern oil"].map(name => byName(name).price), [10, 1]);
});

test("step 11 examples start ready to use: weapons loaded, nothing used up", () => {
  for (const { file, data } of [...ofType("weapon"), ...ofType("gear")]) {
    assert.equal(data.system.usedUp, false, `${file}: should not start used up`);
    if (data.type === "gear") assert.ok(data.system.quantity >= 1, `${file}: quantity must be 1 or more`);
    if (data.type === "weapon") assert.equal(data.system.loaded, true, `${file}: should start loaded (GAPS 53)`);
  }
  const byName = name => examples.find(({ data }) => data.name === name)?.data.system;
  assert.equal(byName("Healing potion").expendable, "d2");
  assert.equal(byName("Flintlock pistol").reload, 2);
});

test("example foes follow the foe rules", () => {
  for (const { file, data } of ofType("foe")) {
    const system = data.system;
    assert.ok(FOE_TIERS.includes(system.tier), `${file}: unknown tier`);
    assert.ok(FOE_CATEGORIES.includes(system.category), `${file}: unknown category`);
    assert.ok(FOE_ARMOUR_DICE.includes(system.armour), `${file}: unknown armour die`);
    assert.ok(system.morale === null || (Number.isInteger(system.morale) && system.morale >= MORALE_MIN && system.morale <= MORALE_MAX), `${file}: Morale must be 2 … 11 or null`);
    assert.equal(capHp(system.hp.value, system.hp.max), system.hp.value, `${file}: HP above max HP`);
    for (const item of data.items ?? []) {
      assert.match(item._id, /^[a-zA-Z0-9]{16}$/, `${file}: ${item.name} needs a 16-letter-or-digit _id`);
      assert.ok(["weapon", "feat", "power"].includes(item.type), `${file}: foes carry only attacks, gloom abilities and passives`);
      if (item.type === "power") {
        const s = item.system;
        assert.equal(s.resource, "gloom", `${file}: ${item.name} is a gloom ability`);
        assert.ok([3, 5, 7, 9].includes(s.cost), `${file}: ${item.name} costs 3, 5, 7 or 9 (rules 6)`);
        for (const key of ["damage", "ruinDamage"]) {
          if (s[key]) assert.ok(isDamageFormula(s[key]), `${file}: ${item.name} ${key}`);
        }
        for (const key of ["failure", "ruin"]) {
          assert.ok(GLOOM_CONDITIONS.includes(s.conditions[key]), `${file}: ${item.name} ${key} condition`);
        }
      }
      if (item.type === "weapon") assert.ok(isDamageFormula(item.system.damage), `${file}: ${item.name} damage`);
      if (item.type === "weapon") {
        // Foe attacks have no traits besides reach or range, and no expendable die (GAPS 59).
        const s = item.system;
        assert.ok(!s.agile && !s.finesse && !s.heavy && !s.twoHanded && !s.versatile && !s.thrown && !s.reload,
          `${file}: ${item.name} should have no weapon traits`);
        assert.equal(s.expendable, "", `${file}: ${item.name} should have no expendable die`);
      }
      if (item.type === "feat") {
        assert.ok(FEAT_SOURCES.includes(item.system.source), `${file}: ${item.name} source`);
        assert.equal(item.system.improving, false, `${file}: foes never improve (GAPS 58)`);
      }
    }
  }
});

test("step 12: the Ash-Choked Bellman matches its write-up in rules 6", () => {
  const bellman = examples.find(({ data }) => data.name === "Ash-Choked Bellman")?.data;
  assert.ok(bellman, "the Bellman is in the examples");
  assert.equal(bellman.type, "foe");
  assert.equal(bellman.system.tier, "weak");
  assert.equal(bellman.system.category, "duskborn");
  assert.deepEqual(bellman.system.hp, { value: 15, max: 15 });
  assert.equal(bellman.system.morale, 7);
  assert.equal(bellman.system.armour, "d2");
  assert.equal(bellman.system.mook, false);

  const attacks = bellman.items.filter(item => item.type === "weapon");
  assert.equal(attacks.length, 1);
  assert.deepEqual(
    [attacks[0].name, attacks[0].system.kind, attacks[0].system.damage, attacks[0].system.reach],
    ["Bell-rope lash", "melee", "d6", 10]
  );

  const passives = bellman.items.filter(item => item.type === "feat");
  assert.deepEqual(passives.map(item => [item.name, item.system.source]), [["Ash-lung", "passive"]]);

  // No ids shared with any other example, inside or outside an actor.
  const ids = [...examples.map(({ data }) => data._id), ...examples.flatMap(({ data }) => (data.items ?? []).map(i => i._id))];
  assert.equal(new Set(ids).size, ids.length);
});

test("step 24: example classes, ancestry and background match rules 2.4 and 2.5", () => {
  for (const { file, data } of ofType("class")) {
    assert.ok(ABILITIES.includes(data.system.boostedAbility), `${file}: unknown boosted ability`);
    assert.ok(SPELL_LISTS.includes(data.system.spellList), `${file}: unknown spell list`);
    assert.ok(STARTING_DICE.includes(data.system.startingDie), `${file}: unknown starting die`);
  }
  for (const { file, data } of ofType("background")) {
    assert.ok(wealthFormula(data.system.wealth), `${file}: wealth "${data.system.wealth}" is not dice`);
  }
  const byName = name => examples.find(({ data }) => data.name === name)?.data;
  const pick = ({ system: s }) => [s.boostedAbility, s.hpBase, s.maxWounds, s.spellList, s.startingDie];
  assert.deepEqual(pick(byName("Warrior")), ["strength", 10, 3, "none", "d10"]);
  assert.deepEqual(pick(byName("Wizard")), ["sanity", 6, 1, "arcane", "d6"]);
  assert.equal(byName("Human").type, "ancestry");
  assert.deepEqual([byName("Butcher").system.wealth, byName("Butcher").system.keepsake], ["2d6 × 10 s", "Cleaver"]);
});

test("step 29: Toll for the Departed matches the Bellman's write-up (☾3 ◈◈, Presence DR12)", () => {
  const bellman = examples.find(({ data }) => data.name === "Ash-Choked Bellman").data;
  const toll = bellman.items.find(item => item.name === "Toll for the Departed")?.system;
  assert.ok(toll, "the Bellman has Toll for the Departed");
  assert.equal(toll.resource, "gloom");
  assert.equal(toll.cost, 3);
  assert.equal(toll.actions, 2);
  assert.deepEqual(gloomTest(toll), { ability: "presence", dr: 12, own: true });
  assert.equal(toll.damage, "d6");
  assert.equal(toll.ruinDamage, "2d6");
  assert.deepEqual(toll.conditions, { failure: "deafened", ruin: "deafened" });
  // "until the end of its next turn" is 1 round; Ruin is "for d4 rounds" (GAPS 129).
  assert.deepEqual(toll.durations, { failure: { kind: "rounds", rounds: "1" }, ruin: { kind: "rounds", rounds: "d4" } });
  assert.ok(isRoundsFormula(toll.durations.ruin.rounds));
});

test("example powers follow the power rules", () => {
  const powers = examples.filter(({ data }) => data.type === "power");
  assert.ok(powers.length, "there is at least one example power");
  for (const { file, data } of powers) {
    const system = data.system;
    assert.ok(POWER_SOURCES.includes(system.source), `${file}: source`);
    assert.ok(POWER_TEST_ABILITIES.includes(system.ability), `${file}: tested ability`);
    assert.ok(Number.isInteger(system.actions) && system.actions >= 0 && system.actions <= MAX_POWER_ACTIONS, `${file}: actions`);
    if (system.damage) assert.ok(isDamageFormula(system.damage), `${file}: damage must be dice such as d6`);
  }
});

test("Power strike is 🟒1 ◈◈, an ordinary power: the boosted ability at DR12, weapon damage + d6", () => {
  const strike = examples.find(({ data }) => data.name === "Power strike").data.system;
  assert.equal(strike.cost, 1);
  assert.equal(strike.actions, 2);
  assert.equal(powerDr(strike.cost), 12);
  assert.equal(powerAbility(strike, "strength"), "strength");
  assert.equal(powerAbility(strike, "presence"), "presence");
  assert.equal(strike.damage, "d6");
  assert.equal(strike.addsWeaponDamage, true);
});

test("example spells follow the spell rules", () => {
  const spells = examples.filter(({ data }) => data.type === "spell");
  assert.ok(spells.length, "there is at least one example spell");
  for (const { file, data } of spells) {
    const system = data.system;
    assert.ok(SPELL_LISTS_OF_SPELLS.includes(system.spellList), `${file}: spell list`);
    assert.ok(Number.isInteger(system.actions) && system.actions >= 0 && system.actions <= MAX_POWER_ACTIONS, `${file}: actions`);
    if (system.damage) assert.ok(isDamageFormula(system.damage), `${file}: damage must be dice such as d8`);
  }
});

test("And They Spoke of Fire is an Arcane spell, 🟒3 ◈◈, DR14, d8 damage", () => {
  const fire = examples.find(({ data }) => data.name === "And They Spoke of Fire").data.system;
  assert.equal(fire.spellList, "arcane");
  assert.equal(fire.cost, 3);
  assert.equal(fire.actions, 2);
  assert.equal(spellDr(fire.cost), 14);
  assert.equal(fire.damage, "d8");
});

test("the scroll of And They Spoke of Fire carries the same spell, at the DR14 scroll price", () => {
  const fire = examples.find(({ data }) => data.name === "And They Spoke of Fire").data.system;
  const { data } = examples.find(({ data }) => data.name === "Scroll of And They Spoke of Fire");
  assert.equal(data.type, "scroll");
  for (const key of ["spellList", "cost", "actions", "damage", "sustained"]) assert.equal(data.system[key], fire[key], key);
  assert.deepEqual(data.system.outcomes, fire.outcomes);
  assert.equal(data.system.price, 140, "rules 4. Economy: a DR14 (🟒3) scroll costs 140 s");
});

test("step 42: the small vicious dog is a Pitiful minion (HP 5, Morale 6, d4)", () => {
  const { file, data } = examples.find(({ data }) => data.name === "Small vicious dog");
  assert.equal(data.type, "minion");
  const system = data.system;
  assert.ok(MINION_TIERS.includes(system.tier), `${file}: unknown tier`);
  assert.equal(system.tier, "pitiful");
  const stats = tierStats("pitiful");
  assert.deepEqual(system.hp, { value: stats.hp, max: stats.hp });
  assert.equal(system.morale, stats.morale);
  assert.equal(system.armour, stats.armour);
  const attacks = data.items.filter(item => item.type === "weapon");
  assert.equal(attacks.length, 1);
  assert.equal(attacks[0].system.damage, stats.attack);
  assert.ok(DAMAGE_TYPES.includes(attacks[0].system.damageType), `${file}: damage type`);
});

test("example relics have an effect, a Last Rite, a drawback and allowed choices", () => {
  const relics = ofType("relic");
  assert.ok(relics.length, "there is at least one example relic");
  for (const { file, data } of relics) {
    const system = data.system;
    for (const key of ["description", "lastRite", "drawback"]) assert.ok(system[key], `${file}: ${key}`);
    assert.ok(FREQUENCIES.includes(system.frequency), `${file}: frequency`);
    assert.ok(Number.isInteger(system.emberGain) && system.emberGain >= 0, `${file}: Ember pool gain`);
    assert.equal(system.destroyed, false, `${file}: starts whole`);
  }
});

test("step 43: the Shard of the Great Brazier gives +3 to the Ember pool once per day (rules 4.2)", () => {
  const { data } = examples.find(({ data }) => data.name === "Shard of the Great Brazier");
  assert.equal(data.type, "relic");
  assert.equal(data.system.frequency, "day");
  assert.equal(data.system.emberGain, 3);
  assert.equal(data.system.alwaysOn, false);
  assert.deepEqual([data.system.saleValue, data.system.factionValue], [400, 900]);
});

test("step 44: the steam wagon matches its stat block in Subsystem: Vehicles", () => {
  const { file, data } = examples.find(({ data }) => data.name === "Steam wagon");
  assert.equal(data.type, "vehicle");
  const system = data.system;
  assert.deepEqual(system.hp, { value: 30, max: 30 });
  assert.equal(system.armour, "d4");
  assert.ok(FOE_ARMOUR_DICE.includes(system.armour), `${file}: armour die`);
  assert.deepEqual(SPEEDS.map(speed => system.speed[speed]), [20, 40, 60]);
  assert.equal(system.price, 600);
  assert.deepEqual([system.passengerSeats, system.cargoLimit], [6, 20], "6, or 20 heavy items of cargo");
  assert.deepEqual(system.occupants, []);
  assert.deepEqual(data.items.map(item => item.name), ["Boiler", "Lamps"]);
  for (const item of data.items) {
    assert.equal(item.type, "feat");
    assert.equal(item.system.source, "passive");
    assert.match(item._id, /^[a-zA-Z0-9]{16}$/, `${file}: ${item.name} needs a 16-letter-or-digit _id`);
  }
});
