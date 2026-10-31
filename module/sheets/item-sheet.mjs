/**
 * Item sheets (ApplicationV2) for weapons, armour and shields. They share a
 * header (picture, name, price, equipped) and a description; the middle
 * part changes with the item type. Every change is saved as soon as you
 * leave a field.
 */

import { WeaponData, ShieldData } from "../data/equipment.mjs";
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
    return context;
  }
}

export class WeaponSheet extends EquipmentSheet {
  static detailsTemplate = `${TEMPLATES}/weapon-details.hbs`;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.kinds = WeaponData.KINDS;
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
