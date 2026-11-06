/**
 * The outcome fields of powers and spells (step 51c, GAPS 219–221): what
 * each result gives the targets or the user, and the buff's effects.
 * The rules live in module/rules/outcomes.mjs.
 */

import { OUTCOME_KINDS, OUTCOME_WHO } from "../rules/outcomes.mjs";
import { CONDITIONS } from "../rules/conditions.mjs";
import { TIMER_KINDS } from "../rules/timers.mjs";
import { effectFields } from "./effects.mjs";

const { ArrayField, SchemaField, StringField, BooleanField } = foundry.data.fields;

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
      note: new StringField({ required: true, blank: true, initial: "" })
    })),
    buffEffects: effectFields().effects
  };
}
