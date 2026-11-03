/**
 * Data for a player character (actor type "character").
 *
 * Rules: 2.1 Creating your PC, 2.2 Abilities, 3.5 Health and wounds,
 * 3.9 Fortune, 3.12 Panic, 4. Economy. Foundry keeps every number inside its min/max,
 * so typing +9 for an ability saves +6. HP is also kept at or below max HP.
 */

import { ABILITIES, ABILITY_MIN, ABILITY_MAX } from "../rules/abilities.mjs";
import { capHp } from "../rules/health.mjs";
import { atZeroHp, strikesZero } from "../rules/agony.mjs";
import { postWoundCard, WOUND_OPTION, AGONY_TYPE_OPTION } from "../agony.mjs";
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
      // Dark Vessels since the last Long Rest; the second kills (rules 3.6, GAPS 93).
      darkVessels: wholeNumber(),
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
   * When HP drops from above 0 to 0, below max wounds: gain a wound and HP
   * returns to max in the same change; at max wounds HP stays at 0 (Death's
   * Door). The card follows in _onUpdate (rules 3.5, GAPS 87).
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const hp = changes.system?.hp;
    if (!hp || !("value" in hp || "max" in hp)) return;
    const max = hp.max ?? this.hp.max;
    hp.value = capHp(hp.value ?? this.hp.value, max);
    if (!strikesZero(this.hp.value, hp.value)) return;

    const wounds = changes.system.wounds ?? {};
    const outcome = atZeroHp(wounds.value ?? this.wounds.value, wounds.max ?? this.wounds.max, max);
    if (outcome.wounded) {
      hp.value = outcome.hp;
      foundry.utils.setProperty(changes, "system.wounds.value", outcome.wounds);
    }
    options[WOUND_OPTION] = { ...outcome, agonyType: options[AGONY_TYPE_OPTION] ?? null };
  }

  /** After HP struck zero, the client that made the change posts the wound card. */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId === game.user.id && options[WOUND_OPTION]) postWoundCard(this.parent, options[WOUND_OPTION]);
  }
}
