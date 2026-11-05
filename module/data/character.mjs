/**
 * Data for a player character (actor type "character").
 *
 * Rules: 2.1 Creating your PC, 2.2 Abilities, 2.5 Pick a class, 3.5 Health and wounds,
 * 3.9 Fortune, 3.12 Panic, 4. Economy. Foundry keeps every number inside its min/max,
 * so typing +9 for an ability saves +6. HP is also kept at or below max HP.
 *
 * The abilities stored are the scores as rolled. The scores in use add the
 * class's +1 and take off lost Sanity (currentAbilities, GAPS 111), so
 * everything that reads actor.system.abilities gets the scores in use.
 */

import { ABILITIES, ABILITY_MIN, ABILITY_MAX } from "../rules/abilities.mjs";
import { capHp } from "../rules/health.mjs";
import { currentAbilities, followHp } from "../rules/origins.mjs";
import { atZeroHp, strikesZero } from "../rules/agony.mjs";
import { postWoundCard, WOUND_OPTION, AGONY_TYPE_OPTION } from "../agony.mjs";
import { missingTokenDefaults } from "../rules/tokens.mjs";
import { rollStartingFortune, postStartingFortune } from "../fortune.mjs";
import { wakesFromHealing } from "../rules/deaths-door.mjs";
import { atDeathsDoor, isDead, healedAtDeathsDoor } from "../deaths-door.mjs";
import { collectEffects, statBonuses, withStat, withAbilityBonuses } from "../rules/item-effects.mjs";

/** Passes "gained HP at Death's Door" from _preUpdate to _onUpdate (GAPS 163). */
const HEALED_AT_DOOR_OPTION = "varBorgHealedAtDeathsDoor";

/** An update that changes how scores are stored, not the scores in use (module/migrate.mjs). */
export const MIGRATION_OPTION = "varBorgMigration";

/** Passes a new character's rolled Fortune from _preCreate to _onCreate. */
const STARTING_FORTUNE_OPTION = "varBorgStartingFortune";

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
      // Max HP follows X + Toughness until the first Long Rest or Improving
      // sets this (GAPS 111). After that max HP is fixed (GAPS 3).
      hpFixed: new BooleanField({ required: true, initial: false }),
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
      // Days in a row without food or drink; more than 2 is starving (rules 3.16, GAPS 142).
      daysWithoutFood: wholeNumber(),
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
   * The key ability for powers is the class's boosted ability (GAPS 2), or
   * null without a class. The scores in use are worked out from the stored
   * (rolled) scores every time, so working them out twice changes nothing.
   * rolledAbilities keeps the scores as rolled.
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.keyAbility = this.parent.itemTypes.class?.[0]?.system.boostedAbility ?? null;
    this.rolledAbilities = { ...this._source.abilities };
    // Sheet numbers from item effects (PLAN step 49b), such as Mountain of
    // Meat's +4 max HP. Max HP and max wounds are stored without them.
    this.statBonuses = statBonuses(collectEffects(this.parent.items));
    const inUse = currentAbilities(this.rolledAbilities, this.keyAbility, this.sanityLost);
    Object.assign(this.abilities, withAbilityBonuses(inUse, this.statBonuses));
    this.hp.max = this.#withBonus("hpMax", this._source.hp.max);
    this.wounds.max = this.#withBonus("woundsMax", this._source.wounds.max);
    this.hp.value = capHp(this.hp.value, this.hp.max);
  }

  /** A stored max (HP or wounds) with its item effects, never below 0. */
  #withBonus(target, stored) {
    return Math.max(0, withStat(stored, this.statBonuses?.[target]));
  }

  /**
   * On creation, HP can never start above max HP (GAPS 44), and the
   * character's tokens get their defaults (module/rules/tokens.mjs): linked
   * to the character, friendly, name on hover, HP and Wounds bars always
   * shown. A character copied with its own token settings keeps them.
   * A character created without Fortune rolls its d3 (rules 3.9, GAPS 110).
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const capped = capHp(this.hp.value, this.hp.max);
    if (capped !== this.hp.value) this.parent.updateSource({ "system.hp.value": capped });
    this.parent.updateSource(missingTokenDefaults("character", data));
    const fortune = await rollStartingFortune(data);
    if (fortune !== null) {
      this.parent.updateSource({ "system.fortune": fortune });
      options[STARTING_FORTUNE_OPTION] = fortune;
    }
  }

  /** The client that created the character posts its starting Fortune. */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (userId === game.user.id && options[STARTING_FORTUNE_OPTION]) postStartingFortune(this.parent, options[STARTING_FORTUNE_OPTION]);
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
    if (!options[MIGRATION_OPTION]) this.#followToughness(changes);
    const hp = changes.system?.hp;
    if (!hp || !("value" in hp || "max" in hp)) return;
    // A typed max is stored without item effects; HP is kept within the max in use.
    const max = hp.max !== undefined ? this.#withBonus("hpMax", hp.max) : this.hp.max;
    hp.value = capHp(hp.value ?? this.hp.value, max);
    if (wakesFromHealing({ atDeathsDoor: atDeathsDoor(this.parent), dead: isDead(this.parent), from: this.hp.value, to: hp.value })) {
      options[HEALED_AT_DOOR_OPTION] = true;
    }
    if (!strikesZero(this.hp.value, hp.value)) return;

    const wounds = changes.system.wounds ?? {};
    const maxWounds = wounds.max !== undefined ? this.#withBonus("woundsMax", wounds.max) : this.wounds.max;
    const outcome = atZeroHp(wounds.value ?? this.wounds.value, maxWounds, max);
    if (outcome.wounded) {
      hp.value = outcome.hp;
      foundry.utils.setProperty(changes, "system.wounds.value", outcome.wounds);
    }
    options[WOUND_OPTION] = { ...outcome, agonyType: options[AGONY_TYPE_OPTION] ?? null };
  }

  /**
   * While max HP is not fixed, a change of Toughness moves max HP to
   * X + Toughness, and HP by the same amount (GAPS 111). Max HP typed in the
   * same change wins.
   */
  #followToughness(changes) {
    const cls = this.parent.itemTypes.class?.[0];
    const toughness = changes.system?.abilities?.toughness;
    if (!cls || this.hpFixed || toughness === undefined || toughness === this._source.abilities.toughness) return;
    const hp = changes.system.hp ?? {};
    if (hp.max !== undefined && hp.max !== this._source.hp.max) return;
    const rolled = { ...this._source.abilities, toughness };
    const followed = followHp({
      hpBase: cls.system.hpBase,
      toughness: currentAbilities(rolled, cls.system.boostedAbility).toughness,
      hp: hp.value ?? this.hp.value,
      // The stored max, without item effects (PLAN step 49b).
      max: this._source.hp.max
    });
    foundry.utils.setProperty(changes, "system.hp", { ...hp, ...followed });
  }

  /**
   * After HP struck zero, the client that made the change posts the wound
   * card. After HP was gained at Death's Door, it wakes the character.
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user.id) return;
    if (options[WOUND_OPTION]) postWoundCard(this.parent, options[WOUND_OPTION]);
    if (options[HEALED_AT_DOOR_OPTION]) healedAtDeathsDoor(this.parent);
  }
}
