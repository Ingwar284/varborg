/**
 * Data for weapons, armour and shields (item types "weapon", "armour",
 * "shield"). They share a description, a price in silver and whether the
 * character has the item equipped.
 *
 * Rules: 4.1 Gear, 3.8 Armour and cover, GAPS 15 and 27.
 */

import {
  WEAPON_KINDS, DAMAGE_TYPES, EXPENDABLE_DICE, SHIELD_SIZES,
  ARMOUR_TIER_MIN, ARMOUR_TIER_MAX, isMetalByDefault, capArmourTier
} from "../rules/equipment.mjs";

const { NumberField, StringField, BooleanField } = foundry.data.fields;

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

/** Fields every piece of equipment has. */
class EquipmentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ required: true, initial: "" }),
      price: wholeNumber(),
      equipped: new BooleanField({ initial: false })
    };
  }
}

export class WeaponData extends EquipmentData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      damage: new StringField({ required: true, initial: "d4" }),
      kind: choice(WEAPON_KINDS),
      // The damage type the system suggests for the Table of Agony (GAPS 15).
      damageType: choice(DAMAGE_TYPES, "blunt"),
      agile: new BooleanField({ initial: false }),
      finesse: new BooleanField({ initial: false }),
      heavy: new BooleanField({ initial: false }),
      twoHanded: new BooleanField({ initial: false }),
      versatile: new BooleanField({ initial: false }),
      // Distances in feet. 0 means the weapon lacks the trait.
      reach: wholeNumber(),
      thrown: wholeNumber(),
      ranged: wholeNumber(),
      // Number of Interact actions to reload. 0 means no reload.
      reload: wholeNumber(),
      expendable: choice(EXPENDABLE_DICE, "")
    };
  }

  static KINDS = labels(WEAPON_KINDS, "Weapon.Kind");
  static DAMAGE_TYPES = labels(DAMAGE_TYPES, "DamageType");
  static EXPENDABLE_DICE = labels(EXPENDABLE_DICE, "Expendable");
}

export class ArmourData extends EquipmentData {
  static defineSchema() {
    const tier = () => wholeNumber({ min: ARMOUR_TIER_MIN, max: ARMOUR_TIER_MAX });
    return {
      ...super.defineSchema(),
      tier: tier(),
      originalTier: tier(),
      metal: new BooleanField({ initial: false })
    };
  }

  /**
   * On creation: if nobody said whether the armour is metal, tier 2 and up
   * is metal (GAPS 27). The current tier can't start above the original.
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const changes = { "system.tier": capArmourTier(this.tier, this.originalTier) };
    if (data.system?.metal === undefined) changes["system.metal"] = isMetalByDefault(this.originalTier);
    this.parent.updateSource(changes);
  }

  /**
   * Armour can never be repaired above its original tier (rules 4.1).
   * Lowering the original tier lowers the current tier with it.
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const system = changes.system;
    if (!system || !("tier" in system || "originalTier" in system)) return;
    system.tier = capArmourTier(system.tier ?? this.tier, system.originalTier ?? this.originalTier);
  }
}

export class ShieldData extends EquipmentData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      size: choice(SHIELD_SIZES)
    };
  }

  static SIZES = labels(SHIELD_SIZES, "Shield.Size");
}
