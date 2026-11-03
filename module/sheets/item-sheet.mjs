/**
 * Item sheets (ApplicationV2) for weapons, armour, shields, gear,
 * containers and feats. The carried items share a header (picture, name,
 * price, equipped, cumbersome) and a description; the middle part changes
 * with the item type. Feats have a header of their own.
 * Every change is saved as soon as you leave a field.
 */

import { WeaponData, ShieldData, GearData } from "../data/equipment.mjs";
import FeatData from "../data/feat.mjs";
import { ARMOUR_TIER_MIN, ARMOUR_TIER_MAX } from "../rules/equipment.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const TEMPLATES = "systems/var-borg/templates/item";

class EquipmentSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "item"],
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  /** Each sheet below names its own middle part. */
  static detailsTemplate = "";

  static get PARTS() {
    return {
      header: { template: `${TEMPLATES}/item-header.hbs` },
      details: { template: this.detailsTemplate },
      description: { template: `${TEMPLATES}/item-description.hbs` }
    };
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.document;
    context.system = this.document.system;
    // Gear and containers are carried, never equipped.
    context.canEquip = "equipped" in this.document.system;
    // A foe's attack has no price, traits or expendable die, and is not carried.
    context.forFoe = this.document.actor?.type === "foe";
    return context;
  }
}

export class WeaponSheet extends EquipmentSheet {
  static detailsTemplate = `${TEMPLATES}/weapon-details.hbs`;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.kinds = WeaponData.KINDS;
    // Foe attacks are either melee or ranged (rules 6).
    context.foeKinds = { melee: "VARBORG.Foe.Melee", shoot: "VARBORG.Foe.Ranged" };
    context.damageTypes = WeaponData.DAMAGE_TYPES;
    context.expendableDice = WeaponData.EXPENDABLE_DICE;
    return context;
  }
}

export class ArmourSheet extends EquipmentSheet {
  static detailsTemplate = `${TEMPLATES}/armour-details.hbs`;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.tiers = {};
    for (let tier = ARMOUR_TIER_MIN; tier <= ARMOUR_TIER_MAX; tier++) {
      context.tiers[tier] = `VARBORG.Armour.Tier${tier}`;
    }
    return context;
  }
}

export class ShieldSheet extends EquipmentSheet {
  static detailsTemplate = `${TEMPLATES}/shield-details.hbs`;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.sizes = ShieldData.SIZES;
    return context;
  }
}

export class GearSheet extends EquipmentSheet {
  static detailsTemplate = `${TEMPLATES}/gear-details.hbs`;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.expendableDice = GearData.EXPENDABLE_DICE;
    return context;
  }
}

export class ContainerSheet extends EquipmentSheet {
  static detailsTemplate = `${TEMPLATES}/container-details.hbs`;
}

/**
 * Feats are not carried, so their sheet has its own header (picture, name,
 * source, gained through Improving) and no price or cumbersome box.
 */
export class FeatSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "item"],
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/feat-header.hbs` },
    description: { template: `${TEMPLATES}/item-description.hbs` }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.document;
    context.system = this.document.system;
    context.sources = FeatData.SOURCES;
    // Foes never improve, so their passives can't be gained through Improving.
    context.canImprove = this.document.actor?.type !== "foe" && this.document.system.source !== "passive";
    return context;
  }
}
