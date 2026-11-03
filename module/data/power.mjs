/**
 * Data for a power (item type "power"): an ember ability such as the
 * Warrior's Power strike (🟒1 ◈◈).
 *
 * Rules: 3.10 Feats and powers, "The price of the light"; 3.4 Sustain;
 * GAPS 116–121. The maths lives in module/rules/powers.mjs.
 */

import { POWER_SOURCES, POWER_TEST_ABILITIES, MAX_POWER_ACTIONS } from "../rules/powers.mjs";

const { NumberField, StringField, BooleanField, SchemaField } = foundry.data.fields;

/** Turn a list of keys into { key: "VARBORG.<prefix>.<key>" } for selects. */
function labels(keys, prefix) {
  return Object.fromEntries(keys.map(key => [key, `VARBORG.${prefix}.${key}`]));
}

export default class PowerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const text = () => new StringField({ required: true, initial: "" });
    return {
      description: text(),
      source: new StringField({ required: true, choices: POWER_SOURCES, initial: POWER_SOURCES[0] }),
      // The listed ember cost (🟒1, 🟒3 ...). The DR is always 11 + this.
      cost: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
      // Actions it takes (◈◈ = 2).
      actions: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: MAX_POWER_ACTIONS, initial: 2 }),
      // "usual", or the ability the power names ("Test Agility (DR18)").
      ability: new StringField({ required: true, choices: POWER_TEST_ABILITIES, initial: "usual" }),
      // Its own damage dice, such as "d6". Empty when it deals none.
      damage: text(),
      // Also rolls a chosen weapon's damage dice, such as Power strike's
      // "additional d6" (GAPS 121). Only the dice: no traits, not an attack.
      addsWeaponDamage: new BooleanField({ initial: false }),
      sustained: new BooleanField({ initial: false }),
      // What each result does, when the power says. Empty uses the usual text.
      outcomes: new SchemaField({
        triumph: text(),
        success: text(),
        failure: text(),
        ruin: text()
      }),
      // Being sustained right now, and whether it was started or sustained this turn.
      sustaining: new BooleanField({ initial: false }),
      kept: new BooleanField({ initial: false })
    };
  }

  static SOURCES = labels(POWER_SOURCES, "Power.Source");
  static TEST_ABILITIES = Object.fromEntries(POWER_TEST_ABILITIES.map(key => [
    key, key === "usual" ? "VARBORG.Power.UsualAbility" : `VARBORG.Ability.${key}`
  ]));
}
