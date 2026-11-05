/**
 * The item effects fields (PLAN Milestone 9), shared by feats, powers,
 * spells, relics, weapons, armour, shields, gear, classes and ancestries.
 * The maths lives in module/rules/item-effects.mjs.
 */

import {
  EFFECT_KINDS, AUTOMATION, STAT_TARGETS, STAT_OPS, ROLL_KINDS, GRANTS, ROLL_MODES
} from "../rules/item-effects.mjs";
import { ABILITIES } from "../rules/abilities.mjs";
import { CONDITIONS } from "../rules/conditions.mjs";

const { ArrayField, SchemaField, StringField, NumberField } = foundry.data.fields;

function choice(choices, initial = choices[0]) {
  return new StringField({ required: true, blank: choices.includes(""), choices, initial });
}

/**
 * effects: the item's list of effects. Every effect has every field; the
 * ones its kind does not use are ignored.
 * automation: how far the item is automated (blank, auto, partial, text,
 * ruling).
 */
export function effectFields() {
  return {
    effects: new ArrayField(new SchemaField({
      kind: choice(EFFECT_KINDS),
      // stat
      target: choice(STAT_TARGETS),
      op: choice(STAT_OPS),
      value: new NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      // roll and reminder
      roll: choice(ROLL_KINDS),
      ability: choice(["", ...ABILITIES], ""),
      against: choice(["", ...CONDITIONS], ""),
      mode: choice(ROLL_MODES),
      grant: choice(GRANTS, ""),
      dr: new NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      damage: new StringField({ required: true, blank: true, initial: "" }),
      // When it applies, in a few words ("on tests involving balance").
      note: new StringField({ required: true, blank: true, initial: "" })
    })),
    automation: choice(AUTOMATION, "")
  };
}
