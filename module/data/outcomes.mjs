/**
 * The outcome fields of powers and spells (step 51c, GAPS 219–221): what
 * each result gives the targets or the user, and the buff's effects.
 * The rules live in module/rules/outcomes.mjs.
 */

import { OUTCOME_KINDS, OUTCOME_WHO, OUTCOME_WHEN, OUTCOME_PERSISTENT, THRALL_DESTROY } from "../rules/outcomes.mjs";
import { CONDITIONS } from "../rules/conditions.mjs";
import { TIMER_KINDS } from "../rules/timers.mjs";
import { effectFields } from "./effects.mjs";

const { ArrayField, SchemaField, StringField, BooleanField, NumberField } = foundry.data.fields;

/**
 * outcomeEffects: the entries (see rules/outcomes.mjs).
 * buffEffects: the item effects a buff entry gives, as a temporary item.
 * They are never the power's own effects, so they never work on its owner.
 */
export function outcomeFields() {
  return {
    outcomeEffects: new ArrayField(new SchemaField({
      kind: new StringField({ required: true, choices: OUTCOME_KINDS, initial: OUTCOME_KINDS[0] }),
      who: new StringField({ required: true, choices: OUTCOME_WHO, initial: OUTCOME_WHO[0] }),
      tiers: new SchemaField({
        triumph: new BooleanField({ initial: true }),
        success: new BooleanField({ initial: true }),
        failure: new BooleanField({ initial: false }),
        ruin: new BooleanField({ initial: false })
      }),
      condition: new StringField({ required: true, blank: true, choices: ["", ...CONDITIONS], initial: "" }),
      // How long a condition or buff lasts: "" no timer, or a timer kind (GAPS 129).
      duration: new SchemaField({
        kind: new StringField({ required: true, blank: true, choices: ["", ...TIMER_KINDS], initial: "" }),
        rounds: new StringField({ required: true, blank: true, initial: "1" })
      }),
      // HP regained, such as d6.
      amount: new StringField({ required: true, blank: true, initial: "" }),
      // Step 51d: the option it belongs to (GAPS 224), when it is given,
      // the persistent damage's type, whether armour soaks its damage,
      // and a buff that lasts only until the creature's next attack (GAPS 223).
      option: new StringField({ required: true, blank: true, initial: "" }),
      when: new StringField({ required: true, choices: OUTCOME_WHEN, initial: OUTCOME_WHEN[0] }),
      damageType: new StringField({ required: true, blank: true, choices: ["", ...OUTCOME_PERSISTENT], initial: "" }),
      soaked: new BooleanField({ initial: false }),
      nextOnly: new BooleanField({ initial: false }),
      // A wound with the usual Toughness test (Overcharge, GAPS 232).
      test: new BooleanField({ initial: false }),
      note: new StringField({ required: true, blank: true, initial: "" })
    })),
    // Thralls the power destroys when used (GAPS 225): none, one, as many
    // as the player asks, or all; the damage each adds, at most how many,
    // and how many first ones add nothing (Flesh Tide: "beyond the first").
    thrallDestroy: new StringField({ required: true, blank: true, choices: THRALL_DESTROY, initial: "" }),
    thrallDamage: new StringField({ required: true, blank: true, initial: "" }),
    thrallMax: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    thrallSkip: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    // Its damage ignores armour (Sacred flame, step 51e).
    ignoresArmour: new BooleanField({ initial: false }),
    // How many options a Triumph lets the user choose (Daring Stunt: 2, GAPS 224).
    triumphPicks: new NumberField({ required: true, nullable: false, integer: true, min: 1, max: 2, initial: 1 }),
    buffEffects: effectFields().effects
  };
}
