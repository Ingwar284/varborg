/**
 * Data for a foe (actor type "foe"). A foe's attacks are weapon items and
 * its passives are feat items, both kept on the foe.
 *
 * Rules: 6. Designing Foes (tier, category, HP, Morale, armour, mooks),
 * 3.4 Violence (initiative bonus), GAPS 11, 12 and 44.
 * Foes have HP only: no abilities, wounds or Fortune. They never roll
 * on the wound table (rules 6, "Set its statistics").
 */

import {
  FOE_TIERS, FOE_CATEGORIES, FOE_ARMOUR_DICE, MORALE_MIN, MORALE_MAX, foeMaxHp
} from "../rules/foe.mjs";
import { capHp } from "../rules/health.mjs";

const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

/** A whole number that can never go below `min`. */
function wholeNumber({ min = 0, max, initial = 0 } = {}) {
  return new NumberField({ required: true, nullable: false, integer: true, min, max, initial });
}

/** A text field that must be one of `choices`. */
function choice(choices, initial = choices[0]) {
  return new StringField({ required: true, blank: choices.includes(""), choices, initial });
}

/** Turn a list of keys into { key: "VARBORG.<prefix>.<key>" } for selects. */
function labels(keys, prefix) {
  return Object.fromEntries(keys.map(key => [key, `VARBORG.${prefix}.${key || "none"}`]));
}

export default class FoeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      tier: choice(FOE_TIERS, "weak"),
      category: choice(FOE_CATEGORIES, ""),
      description: new StringField({ required: true, initial: "" }),
      hp: new SchemaField({
        value: wholeNumber(),
        max: wholeNumber()
      }),
      // 2 … 11, or null for Morale "–" (never rolls Morale).
      morale: new NumberField({ required: true, nullable: true, integer: true, min: MORALE_MIN, max: MORALE_MAX, initial: 6 }),
      // Subtracted from damage that hits the foe. "" means none.
      armour: choice(FOE_ARMOUR_DICE, ""),
      // What the armour is, such as "Rusted mail". Text only.
      armourName: new StringField({ required: true, blank: true, initial: "" }),
      // Added to the foe's d6 initiative roll. It comes from the foe's
      // passives (GAPS 11), so the Dark Master types it in.
      initiative: new NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      // A mook has 1 HP, fails every test and never rolls Morale.
      mook: new BooleanField({ initial: false })
    };
  }

  static TIERS = labels(FOE_TIERS, "Foe.Tier");
  static CATEGORIES = labels(FOE_CATEGORIES, "Foe.Category");
  static ARMOUR_DICE = labels(FOE_ARMOUR_DICE, "Foe.Armour");

  /** A mook has 1 HP, whatever max HP is written for it. */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.hp.max = foeMaxHp(this.hp.max, this.mook);
    this.hp.value = capHp(this.hp.value, this.hp.max);
  }

  /** On creation, HP can never start above max HP (GAPS 44). */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const capped = capHp(this.hp.value, this.hp.max);
    if (capped !== this.hp.value) this.parent.updateSource({ "system.hp.value": capped });
  }

  /**
   * When HP or max HP changes, keep HP at or below max HP (GAPS 44).
   * For a mook, max HP counts as 1.
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const hp = changes.system?.hp;
    if (!hp || !("value" in hp || "max" in hp)) return;
    const mook = changes.system.mook ?? this.mook;
    const max = foeMaxHp(hp.max ?? this._source.hp.max, mook);
    hp.value = capHp(hp.value ?? this._source.hp.value, max);
  }
}
