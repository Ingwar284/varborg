/**
 * The item effects fields (PLAN Milestone 9), shared by feats, powers,
 * spells, relics, weapons, armour, shields, gear, classes and ancestries.
 * The maths lives in module/rules/item-effects.mjs.
 */

import {
  EFFECT_KINDS, AUTOMATION, STAT_TARGETS, STAT_OPS, ROLL_KINDS, GRANTS, ROLL_MODES, WEAPON_TAGS, DAMAGE_PER,
  HOOK_EVENTS, ALL_ACTIONS, KEEPS, HOOK_REQUIRES, ROLL_REQUIRES, CARD_REQUIRES, FAIL_AGAIN, CHOICE_KINDS, CHOICE_FROM, VERSUS, RESIST_MODES, COMPANIONS, COMPANION_ARMOUR
} from "../rules/item-effects.mjs";
import { ABILITIES } from "../rules/abilities.mjs";
import { CONDITIONS } from "../rules/conditions.mjs";
import { DAMAGE_TYPES } from "../rules/equipment.mjs";

const { ArrayField, SchemaField, StringField, NumberField, BooleanField } = foundry.data.fields;

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
      // Only with this kind of weapon (step 49e).
      weapon: choice(WEAPON_TAGS, ""),
      // Only against foes of the chosen Bestiary category (step 49h).
      vs: choice(VERSUS, ""),
      mode: choice(ROLL_MODES),
      grant: choice(GRANTS, ""),
      dr: new NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      damage: new StringField({ required: true, blank: true, initial: "" }),
      // Extra damage once, or once per wound (step 49e).
      per: choice(DAMAGE_PER, ""),
      // Only with damage of this type (Firebug, step 50b3).
      damageType: choice(["", ...DAMAGE_TYPES], ""),
      // resist (step 50b3b): half, double or reduce damage of a type.
      resist: choice(RESIST_MODES),
      // Companion actions (step 50g): which companion, and the armour it gets.
      companion: choice(COMPANIONS),
      armour: choice(COMPANION_ARMOUR, ""),
      // gift (step 50b4): the UUID of a compendium item given with this one.
      gift: new StringField({ required: true, blank: true, initial: "" }),
      // The weapon's damage dice replaced, such as d10 (Couched Lance, step 50c).
      setDamage: new StringField({ required: true, blank: true, initial: "" }),
      // Reroll damage dice that show 1 (Hawkeye, step 50b).
      rerollOnes: new BooleanField({ required: true, initial: false }),
      // hook (step 49f): when, what, how much, which condition, which roll to keep, only while…
      event: choice(HOOK_EVENTS),
      action: choice(ALL_ACTIONS),
      amount: new StringField({ required: true, blank: true, initial: "" }),
      condition: choice(["", ...CONDITIONS], ""),
      keep: choice(KEEPS),
      requires: choice([...new Set([...HOOK_REQUIRES, ...ROLL_REQUIRES, ...CARD_REQUIRES])], ""),
      // A reroll that fails again: a note, or the note and Shadowblight (step 50b2).
      failAgain: choice(FAIL_AGAIN, ""),
      // choice (step 49h): what is chosen, from where, and what was chosen (an id or key, and its name).
      choose: choice(CHOICE_KINDS),
      from: choice(CHOICE_FROM),
      chosen: new StringField({ required: true, blank: true, initial: "" }),
      chosenName: new StringField({ required: true, blank: true, initial: "" }),
      // Only with the power of this name (Field notes: Study the specimen, step 51a3).
      power: new StringField({ required: true, blank: true, initial: "" }),
      // A power's buff effect for one option only (Morphic Surge, step 51d2).
      option: new StringField({ required: true, blank: true, initial: "" }),
      // Step 52b (foes): a Morale effect's radius in feet and the number of
      // allies it needs within it (Mob Courage: 3 within 10'); a hook held
      // back by damage of these types since its last turn ("fire, acid").
      radius: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      allyCount: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      unlessDamaged: new StringField({ required: true, blank: true, initial: "" }),
      // When it applies, in a few words ("on tests involving balance").
      note: new StringField({ required: true, blank: true, initial: "" })
    })),
    automation: choice(AUTOMATION, "")
  };
}
