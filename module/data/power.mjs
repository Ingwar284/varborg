/**
 * Data for a power (item type "power"): an ember ability such as the
 * Warrior's Power strike (🟒1 ◈◈), or a foe's gloom ability such as the
 * Bellman's Toll for the Departed (☾3 ◈◈).
 *
 * Rules: 3.10 Feats and powers, "The price of the light"; 3.4 Sustain;
 * 6. Designing Foes, Gloom abilities; GAPS 116–128. The maths lives in
 * module/rules/powers.mjs and module/rules/gloom.mjs.
 */

import { POWER_SOURCES, POWER_TEST_ABILITIES, MAX_POWER_ACTIONS } from "../rules/powers.mjs";
import { areaField } from "./area.mjs";
import { POWER_RESOURCES, GLOOM_CONDITIONS, GLOOM_DEFENCE_DR } from "../rules/gloom.mjs";
import { TIMER_KINDS } from "../rules/timers.mjs";
import { endChoiceWith } from "../improving.mjs";
import { effectFields } from "./effects.mjs";
import { outcomeFields } from "./outcomes.mjs";
import { DAMAGE_TYPES, migrateDamageTypes } from "../rules/equipment.mjs";
import { CARD_POWERS } from "../rules/cards.mjs";

const { NumberField, StringField, BooleanField, SchemaField } = foundry.data.fields;

/** Turn a list of keys into { key: "VARBORG.<prefix>.<key>" } for selects. */
function labels(keys, prefix) {
  return Object.fromEntries(keys.map(key => [key, `VARBORG.${prefix}.${key}`]));
}

/** A condition's timer: its kind ("" for none) and, for rounds, how many. */
function duration() {
  return new SchemaField({
    kind: new StringField({ required: true, blank: true, choices: ["", ...TIMER_KINDS], initial: "" }),
    rounds: new StringField({ required: true, blank: true, initial: "1" })
  });
}

export default class PowerData extends foundry.abstract.TypeDataModel {
  /** Old damage type ids become the new ones when loaded (GAPS 289). */
  static migrateData(source) {
    migrateDamageTypes(source);
    return super.migrateData(source);
  }

  static defineSchema() {
    const text = () => new StringField({ required: true, initial: "" });
    return {
      description: text(),
      source: new StringField({ required: true, choices: POWER_SOURCES, initial: POWER_SOURCES[0] }),
      // The ancestry or class it belongs to, by name, such as "Warrior" (GAPS 180).
      belongsTo: new StringField({ required: true, initial: "" }),
      // Ember (a character's power) or Gloom (a foe's gloom ability).
      resource: new StringField({ required: true, choices: POWER_RESOURCES, initial: POWER_RESOURCES[0] }),
      // The listed ember cost (🟒1, 🟒3 ...). The DR is always 11 + this.
      cost: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
      // Actions it takes (◈◈ = 2).
      actions: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: MAX_POWER_ACTIONS, initial: 2 }),
      // "usual", or the ability the power names ("Test Agility (DR18)").
      ability: new StringField({ required: true, choices: POWER_TEST_ABILITIES, initial: "usual" }),
      // Its own damage dice, such as "d6". Empty when it deals none.
      // For a gloom ability with its own test: the Failure damage.
      damage: text(),
      // Its damage type, such as "fire" (step 50b3, GAPS 203). Blank: none.
      damageType: new StringField({ required: true, blank: true, choices: ["", ...DAMAGE_TYPES], initial: "" }),
      // Gloom ability with its own test: the DR ("tests Presence DR12"),
      // the Ruin damage, and the condition each result gives.
      dr: new NumberField({ required: true, nullable: false, integer: true, min: 1, initial: GLOOM_DEFENCE_DR }),
      ruinDamage: text(),
      conditions: new SchemaField({
        failure: new StringField({ required: true, blank: true, choices: GLOOM_CONDITIONS, initial: "" }),
        ruin: new StringField({ required: true, blank: true, choices: GLOOM_CONDITIONS, initial: "" })
      }),
      // How long each result's condition lasts (GAPS 129): "" no timer,
      // or a timer kind; rounds is a number or dice ("1", "d4").
      durations: new SchemaField({
        failure: duration(),
        ruin: duration()
      }),
      // Also rolls a chosen weapon's damage dice, such as Power strike's
      // "additional d6" (GAPS 121). Only the dice: no traits, not an attack.
      addsWeaponDamage: new BooleanField({ initial: false }),
      sustained: new BooleanField({ initial: false }),
      // Its area of effect, if it names one (playtest feedback).
      area: areaField(),
      // How it uses the Card Slinger's deck (step 69b3b): "" none, or
      // "deal", "cut", "suit", "flush" or "knave" (module/rules/cards.mjs).
      cards: new StringField({ required: true, blank: true, choices: CARD_POWERS, initial: "" }),
      // A reaction (↻): used on any turn, with the reaction instead of actions (GAPS 184).
      reaction: new BooleanField({ initial: false }),
      // What each result does, when the power says. Empty uses the usual text.
      outcomes: new SchemaField({
        triumph: text(),
        success: text(),
        failure: text(),
        ruin: text()
      }),
      // What each result gives its targets or user (step 51c).
      ...outcomeFields(),
      // Being sustained right now, and whether it was started or sustained this turn.
      sustaining: new BooleanField({ initial: false }),
      kept: new BooleanField({ initial: false }),
      // Used its one free use outside combat (rules 3.10). Cleared after a
      // combat, a rest, or the Dark Master's reset button.
      usedOutside: new BooleanField({ initial: false }),
      // What it does beyond its test and damage (PLAN Milestone 9).
      ...effectFields()
    };
  }

  /**
   * A power taken in place of the feat of an Improving ends the choice. It
   * is not marked: only feats count for Death's Door (GAPS 16, 179).
   */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    endChoiceWith(this.parent, userId);
  }

  static SOURCES = labels(POWER_SOURCES, "Power.Source");
  static RESOURCES = labels(POWER_RESOURCES, "Power.Resource");
  static GLOOM_TESTS = Object.fromEntries(POWER_TEST_ABILITIES.map(key => [
    key, key === "usual" ? "VARBORG.Gloom.UsualTest" : `VARBORG.Ability.${key}`
  ]));
  static TIMER_KINDS = Object.fromEntries(["", ...TIMER_KINDS].map(key => [
    key, key ? `VARBORG.Timer.Kind.${key}` : "VARBORG.Timer.None"
  ]));
  static GLOOM_CONDITIONS = Object.fromEntries(GLOOM_CONDITIONS.map(key => [
    key, key ? `VARBORG.Condition.${key}` : "VARBORG.Gloom.NoCondition"
  ]));
  static TEST_ABILITIES = Object.fromEntries(POWER_TEST_ABILITIES.map(key => [
    key, key === "usual" ? "VARBORG.Power.UsualAbility" : `VARBORG.Ability.${key}`
  ]));
}
