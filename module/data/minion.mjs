/**
 * Data for a minion (actor type "minion"). Like a foe, its attacks are
 * weapon items and its passives and active abilities are feat items.
 *
 * Rules: 3.14 Minions; GAPS 32 and 169-172.
 * A minion has HP, Morale, an armour die and an owner (a character). It
 * tests with every ability at 0, has no Fortune and no wounds, and at 0 HP
 * it is dead: it is marked defeated, like a foe (GAPS 169). Its owner can
 * have minions up to their Presence (minimum 1); giving it an owner who is
 * already at the limit is refused (GAPS 171). The owner's players become
 * its owners in Foundry too, so they can command it and roll for it.
 */

import { ABILITIES } from "../rules/abilities.mjs";
import { MINION_TIERS, minionAbilities } from "../rules/minions.mjs";
import { FOE_ARMOUR_DICE, MORALE_MIN, MORALE_MAX } from "../rules/foe.mjs";
import { capHp } from "../rules/health.mjs";
import { missingTokenDefaults } from "../rules/tokens.mjs";
import { refuseOverLimit, ownershipFromOwner, minionFell } from "../minions.mjs";

const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

/** Passes "HP fell to 0" from _preUpdate to _onUpdate. */
const FELL_OPTION = "varBorgMinionFell";

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

export default class MinionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      tier: choice(MINION_TIERS, "pitiful"),
      description: new StringField({ required: true, initial: "" }),
      // The id of the character it serves. Blank: nobody's yet.
      owner: new StringField({ required: true, blank: true, initial: "" }),
      hp: new SchemaField({
        value: wholeNumber({ initial: 5 }),
        max: wholeNumber({ initial: 5 })
      }),
      // 2 … 11, or null for Morale "–" (never rolls Morale).
      morale: new NumberField({ required: true, nullable: true, integer: true, min: MORALE_MIN, max: MORALE_MAX, initial: 6 }),
      // Subtracted from damage that hits the minion. "" means none.
      armour: choice(FOE_ARMOUR_DICE, ""),
      armourName: new StringField({ required: true, blank: true, initial: "" }),
      // Levels of the Fatigued condition, no maximum (rules 3.13, GAPS 20).
      fatigue: wholeNumber(),
      // An attack Ruin: Bane on attacks until Recover (rules 3.4, GAPS 17).
      attackRuin: new BooleanField({ required: true, initial: false }),
      // Feet per Move action for each way of moving (rules 3.7). A blank
      // fly, swim or climb speed means it cannot move that way.
      movement: new SchemaField({
        walk: wholeNumber({ initial: 20 }),
        fly: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
        swim: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
        climb: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null })
      })
    };
  }

  static TIERS = labels(MINION_TIERS, "Minion.Tier");
  static ARMOUR_DICE = labels(FOE_ARMOUR_DICE, "Foe.Armour");

  /** Every ability is 0 (rules 3.14), so tests, attacks and defence work as for a character. */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.abilities = minionAbilities(ABILITIES);
    this.hp.value = capHp(this.hp.value, this.hp.max);
  }

  /** The character it serves, or null. */
  get ownerActor() {
    const owner = this.owner ? game.actors?.get(this.owner) : null;
    return owner?.type === "character" ? owner : null;
  }

  /**
   * On creation: HP no higher than max HP, the token defaults (friendly,
   * linked, HP bar), and no owner over their limit.
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    // Thralls do not count toward the minion limit (GAPS 213).
    const thrall = Boolean(this.parent.flags?.["var-borg"]?.thrall);
    if (this.owner && !thrall && refuseOverLimit(this.owner, null, this.parent.name)) return false;
    const capped = capHp(this.hp.value, this.hp.max);
    if (capped !== this.hp.value) this.parent.updateSource({ "system.hp.value": capped });
    this.parent.updateSource(missingTokenDefaults("minion", data));
    if (this.owner && game.user.isGM) this.parent.updateSource({ ownership: ownershipFromOwner(this.owner, this.parent.ownership) });
  }

  /**
   * HP stays at or below max HP. A new owner must have room under their
   * minion limit (GAPS 171); their players become owners of the minion.
   * HP falling to 0 is passed on to _onUpdate.
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const owner = changes.system?.owner;
    if (owner && owner !== this._source.owner) {
      if (!this.parent.getFlag("var-borg", "thrall") && refuseOverLimit(owner, this.parent.id, this.parent.name)) return false;
      if (game.user.isGM) changes.ownership = ownershipFromOwner(owner, changes.ownership ?? this.parent.ownership);
    }
    const hp = changes.system?.hp;
    if (!hp || !("value" in hp || "max" in hp)) return;
    hp.value = capHp(hp.value ?? this._source.hp.value, hp.max ?? this._source.hp.max);
    if (this._source.hp.value > 0 && hp.value === 0) options[FELL_OPTION] = true;
  }

  /** At 0 HP the minion is dead: marked defeated, with a chat line (GAPS 169). */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId === game.user.id && options[FELL_OPTION]) minionFell(this.parent);
  }
}
