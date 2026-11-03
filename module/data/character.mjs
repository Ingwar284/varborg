/**
 * Data for a player character (actor type "character").
 *
 * Rules: 2.1 Creating your PC, 2.2 Abilities, 3.5 Health and wounds,
 * 3.9 Fortune, 3.12 Panic, 4. Economy. Foundry keeps every number inside its min/max,
 * so typing +9 for an ability saves +6. HP is also kept at or below max HP.
 */

import { ABILITIES, ABILITY_MIN, ABILITY_MAX } from "../rules/abilities.mjs";
import { capHp } from "../rules/health.mjs";
import { missingTokenDefaults } from "../rules/tokens.mjs";

const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

/** A whole number that can never go below `min`. */
function wholeNumber({ min = 0, max, initial = 0 } = {}) {
  return new NumberField({ required: true, nullable: false, integer: true, min, max, initial });
}

export default class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const abilities = {};
    for (const ability of ABILITIES) {
      abilities[ability] = wholeNumber({ min: ABILITY_MIN, max: ABILITY_MAX });
    }

    return {
      abilities: new SchemaField(abilities),
      hp: new SchemaField({
        value: wholeNumber(),
        max: wholeNumber()
      }),
      wounds: new SchemaField({
        value: wholeNumber(),
        max: wholeNumber()
      }),
      // No maximum (GAPS 4).
      fortune: wholeNumber(),
      // Silver is the only currency (GAPS 35).
      silver: wholeNumber(),
      // An attack Ruin: Bane on attacks until Recover (rules 3.4, GAPS 17).
      attackRuin: new BooleanField({ required: true, initial: false }),
      // A raised shield: cover until the start of your next turn (rules 3.8).
      shieldRaised: new BooleanField({ required: true, initial: false }),
      // Levels of the Fatigued condition, no maximum (rules 3.13, GAPS 20).
      fatigue: wholeNumber(),
      // Sanity lost for a while (Teetering); a Panic Triumph restores it (rules 3.12, GAPS 81).
      sanityLost: wholeNumber(),
      // Phobias from the Panic table, written by hand (GAPS 82).
      phobias: new StringField({ required: true, initial: "" }),
      // Rules 2.1, Step 6: Details.
      details: new SchemaField({
        personality: new StringField({ required: true, initial: "" }),
        physicalMark: new StringField({ required: true, initial: "" }),
        idiosyncrasy: new StringField({ required: true, initial: "" }),
        callToAdventure: new StringField({ required: true, initial: "" })
      })
    };
  }

  /**
   * On creation, HP can never start above max HP (GAPS 44), and the
   * character's tokens get their defaults (module/rules/tokens.mjs): linked
   * to the character, friendly, name on hover, HP and Wounds bars always
   * shown. A character copied with its own token settings keeps them.
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const capped = capHp(this.hp.value, this.hp.max);
    if (capped !== this.hp.value) this.parent.updateSource({ "system.hp.value": capped });
    this.parent.updateSource(missingTokenDefaults("character", data));
  }

  /**
   * When HP or max HP changes, keep HP at or below max HP (GAPS 44).
   * Lowering max HP below current HP lowers current HP too.
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const hp = changes.system?.hp;
    if (!hp || !("value" in hp || "max" in hp)) return;
    hp.value = capHp(hp.value ?? this.hp.value, hp.max ?? this.hp.max);
  }
}
