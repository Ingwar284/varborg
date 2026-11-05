/**
 * Data for a spell (item type "spell"), such as And They Spoke of Fire
 * (🟒3 ◈◈, Arcane).
 *
 * Rules: 3.11 Spellcasting. The maths lives in module/rules/spells.mjs;
 * casting is module/dice/spell.mjs. A spell is an ember ability like a
 * power, so it shares the power's Ember, Sustain and once-outside-combat
 * fields.
 */

import { MAX_POWER_ACTIONS } from "../rules/powers.mjs";
import { SPELL_LISTS_OF_SPELLS, RITUAL_DRS } from "../rules/spells.mjs";
import { CarriedData } from "./equipment.mjs";
import { effectFields } from "./effects.mjs";

const { NumberField, StringField, BooleanField, SchemaField } = foundry.data.fields;

/**
 * What every spell says about itself: its list, cost, actions, damage,
 * Sustained and outcome texts. Spells and scrolls both have these.
 */
function spellFields() {
  const text = () => new StringField({ required: true, initial: "" });
  return {
    // Arcane, Divine, Primal, Profane or Bloodline. Casting outside your
    // class's list is at Bane.
    spellList: new StringField({ required: true, choices: SPELL_LISTS_OF_SPELLS, initial: SPELL_LISTS_OF_SPELLS[0] }),
    // The listed ember cost. The DR is always 11 + this.
    cost: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
    // Actions it takes (◈◈ = 2).
    actions: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: MAX_POWER_ACTIONS, initial: 2 }),
    // Its damage dice, such as "d8". Empty when it deals none.
    damage: text(),
    sustained: new BooleanField({ initial: false }),
    // What each result does, when the spell says. Empty uses the usual text.
    outcomes: new SchemaField({
      triumph: text(),
      success: text(),
      failure: text(),
      ruin: text()
    })
  };
}

export default class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ required: true, initial: "" }),
      ...spellFields(),
      // A reaction (↻), such as No: cast on any turn with the reaction
      // instead of actions, as for powers (GAPS 184).
      reaction: new BooleanField({ initial: false }),
      // A ritual (rules 4.7, 7): cast outside combat at its own DR (its tier
      // heading), with no ember and no actions; its casting time is text,
      // such as "10 minutes" (GAPS 186).
      ritual: new BooleanField({ initial: false }),
      ritualDr: new NumberField({ required: true, nullable: false, integer: true, choices: RITUAL_DRS, initial: RITUAL_DRS[0] }),
      castingTime: new StringField({ required: true, initial: "" }),
      // As for powers: being sustained now, kept this turn, and the one free
      // use outside combat (rules 3.10).
      sustaining: new BooleanField({ initial: false }),
      kept: new BooleanField({ initial: false }),
      usedOutside: new BooleanField({ initial: false }),
      // What it does beyond its test and damage (PLAN Milestone 9).
      ...effectFields()
    };
  }

  static SPELL_LISTS = Object.fromEntries(SPELL_LISTS_OF_SPELLS.map(key => [key, `VARBORG.Class.SpellList.${key}`]));
  static RITUAL_DRS = Object.fromEntries(RITUAL_DRS.map(dr => [dr, `DR${dr}`]));
}

/**
 * Data for a scroll (item type "scroll"): a spell written down, carried
 * like gear (price, cumbersome, stored in). Rules 3.11 Scrolls: read once
 * without Ember, testing Sanity against the spell's normal DR, and
 * destroyed even if the spell fails. Not limited to once outside combat,
 * since it is gone after one use.
 */
export class ScrollData extends CarriedData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...spellFields()
    };
  }
}
