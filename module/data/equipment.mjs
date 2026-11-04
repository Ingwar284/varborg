/**
 * Data for everything a character carries: weapons, armour, shields, gear
 * and containers (item types "weapon", "armour", "shield", "gear",
 * "container"). They all share a description, a price in silver, whether
 * the item is cumbersome to carry and which container it is stored in.
 * Weapons, armour and shields also record whether they are equipped.
 *
 * Rules: 4.1 Gear (including Carrying), 3.8 Armour and cover,
 * GAPS 15, 27, 48, 52, 53 and 54.
 */

import {
  WEAPON_KINDS, DAMAGE_TYPES, EXPENDABLE_DICE, SHIELD_SIZES,
  ARMOUR_TIER_MIN, ARMOUR_TIER_MAX, isMetalByDefault, capArmourTier
} from "../rules/equipment.mjs";
import { isCumbersomeByDefault } from "../rules/carrying.mjs";
import { LIGHT_KINDS, DEFAULT_LIGHT_MINUTES, DEFAULT_LIGHT_RANGE } from "../rules/light.mjs";
import { frequencyFields, presetFrequency } from "./uses.mjs";

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

/** Fields every item a character carries has. Scrolls use them too. */
export class CarriedData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ required: true, initial: "" }),
      price: wholeNumber(),
      // Counts towards the cumbersome limit (the rules' "heavy items").
      // The Dark Master decides (rules 4.1, GAPS 48).
      cumbersome: new BooleanField({ initial: false }),
      // The id of the container item (on the same character) this is kept in.
      // Blank means carried loose.
      storedIn: new StringField({ required: true, blank: true, initial: "" })
    };
  }

  /**
   * On creation: if nobody said whether the item is cumbersome, start with the
   * system's suggestion (GAPS 48).
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (data.system?.cumbersome === undefined) {
      this.parent.updateSource({ "system.cumbersome": isCumbersomeByDefault(this.parent.type, this) });
    }
  }

  /**
   * When a change makes the item cumbersome by default (for example ticking the
   * Heavy trait), tick "cumbersome" too. Unticking the trait leaves the box
   * alone, so the Dark Master's choice is kept (GAPS 48).
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const system = changes.system;
    if (!system || "cumbersome" in system) return;
    const type = this.parent.type;
    const after = foundry.utils.mergeObject(this.toObject(), system, { inplace: false });
    if (!isCumbersomeByDefault(type, this) && isCumbersomeByDefault(type, after)) system.cumbersome = true;
  }
}

/** Weapons, armour and shields can also be equipped. */
class EquipmentData extends CarriedData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
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
      // Only matters with reload above 0. A new weapon starts loaded (GAPS 53).
      loaded: new BooleanField({ initial: true }),
      expendable: choice(EXPENDABLE_DICE, ""),
      // Out of ammunition: the expendable die rolled a 1 (GAPS 52).
      usedUp: new BooleanField({ initial: false })
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
      size: choice(SHIELD_SIZES),
      // Struck as light cover and broken (rules 3.8, GAPS 66). It stays
      // until someone deletes it, but gives no cover.
      destroyed: new BooleanField({ initial: false })
    };
  }

  static SIZES = labels(SHIELD_SIZES, "Shield.Size");
}

export class GearData extends CarriedData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      // How many of this item: 6 torches, 10 iron nails (GAPS 54).
      quantity: wholeNumber({ min: 1, initial: 1 }),
      expendable: choice(EXPENDABLE_DICE, ""),
      // The expendable die rolled a 1. The item stays until someone deletes
      // or refills it (GAPS 52).
      usedUp: new BooleanField({ initial: false }),
      // A medicine box: gets a Use button on the sheet (rules 4.1, GAPS 149).
      medicine: new BooleanField({ initial: false }),
      // A light source (rules 3.15, 4.1; GAPS 150–153): a torch burns
      // itself, a lantern burns oil. Lit from the sheet onto the light timer.
      light: choice(LIGHT_KINDS, ""),
      // How long one burns: a torch, a candle or one oil (a lantern uses
      // its oil's minutes).
      lightMinutes: wholeNumber({ min: 1, initial: DEFAULT_LIGHT_MINUTES }),
      // How far it lights, in the scene's units (feet); its character's token
      // shines this far while the light timer runs (GAPS 154).
      lightRange: wholeNumber({ min: 1, initial: DEFAULT_LIGHT_RANGE }),
      // Once per round, encounter or day, and whether it is used (GAPS 161).
      ...frequencyFields()
    };
  }

  /** On creation, "Once per day" in the text sets the frequency (GAPS 164). */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    presetFrequency(this, data);
  }

  static EXPENDABLE_DICE = labels(EXPENDABLE_DICE, "Expendable");
  static LIGHT_KINDS = labels(LIGHT_KINDS, "Light.Kind");
}

/**
 * Bandoleer, satchel, backpack: holds that many normal-sized items. It does
 * not raise the cumbersome limit (rules 4.1).
 */
export class ContainerData extends CarriedData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      capacity: wholeNumber()
    };
  }
}
