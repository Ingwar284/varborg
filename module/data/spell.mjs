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
import { SPELL_LISTS_OF_SPELLS } from "../rules/spells.mjs";

const { NumberField, StringField, BooleanField, SchemaField } = foundry.data.fields;

export default class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const text = () => new StringField({ required: true, initial: "" });
    return {
      description: text(),
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
      }),
      // As for powers: being sustained now, kept this turn, and the one free
      // use outside combat (rules 3.10).
      sustaining: new BooleanField({ initial: false }),
      kept: new BooleanField({ initial: false }),
      usedOutside: new BooleanField({ initial: false })
    };
  }

  static SPELL_LISTS = Object.fromEntries(SPELL_LISTS_OF_SPELLS.map(key => [key, `VARBORG.Class.SpellList.${key}`]));
}
