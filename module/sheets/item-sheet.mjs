/**
 * Item sheets (ApplicationV2) for weapons, armour, shields, gear,
 * containers, feats, classes, ancestries and backgrounds. The carried items
 * share a header (picture, name, price, equipped, cumbersome) and a
 * description; the middle part changes with the item type. Feats, and
 * classes, ancestries and backgrounds, have headers of their own.
 * Every change is saved as soon as you leave a field.
 */

import { WeaponData, ShieldData, GearData } from "../data/equipment.mjs";
import FeatData from "../data/feat.mjs";
import PowerData from "../data/power.mjs";
import SpellData from "../data/spell.mjs";
import { powerDr } from "../rules/powers.mjs";
import { gloomTest } from "../rules/gloom.mjs";
import { spellDr } from "../rules/spells.mjs";
import { ClassData } from "../data/origins.mjs";
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
    context.lightKinds = GearData.LIGHT_KINDS;
    context.showLightMinutes = ["burns", "fuel"].includes(this.document.system.light);
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

/**
 * Powers (rules 3.10): the feat header (picture, name, source), then the
 * resource, cost, actions, test, damage, Sustained and the outcome texts,
 * then a description. A gloom ability (resource Gloom, rules 6) shows its
 * own fields instead: the test (Agility DR12 defence or its own), DR,
 * Failure and Ruin damage, and the condition each gives.
 */
export class PowerSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "item"],
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/feat-header.hbs` },
    details: { template: `${TEMPLATES}/power-details.hbs` },
    description: { template: `${TEMPLATES}/item-description.hbs` }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.item = this.document;
    context.system = system;
    context.sources = PowerData.SOURCES;
    context.canImprove = false;
    context.resources = PowerData.RESOURCES;
    context.isGloom = system.resource === "gloom";
    if (context.isGloom) return this.#gloomContext(context, system);
    context.testAbilities = PowerData.TEST_ABILITIES;
    const named = system.ability !== "usual";
    context.drHint = game.i18n.format(named ? "VARBORG.Power.DrHintNamed" : "VARBORG.Power.DrHint", {
      dr: powerDr(system.cost),
      ability: named ? game.i18n.localize(`VARBORG.Ability.${system.ability}`) : ""
    });
    context.outcomes = ["triumph", "success", "failure", "ruin"].map(key => ({
      key,
      label: `VARBORG.Tier.${key}`,
      value: system.outcomes[key],
      placeholder: game.i18n.localize(`VARBORG.Power.Outcome.${key}`)
    }));
    return context;
  }

  /** The fields a gloom ability shows. */
  #gloomContext(context, system) {
    const i18n = game.i18n;
    const test = gloomTest(system);
    const kind = test.own ? "own" : "defence";
    context.gloomTests = PowerData.GLOOM_TESTS;
    context.gloomConditions = PowerData.GLOOM_CONDITIONS;
    context.timerKinds = PowerData.TIMER_KINDS;
    context.ownTest = test.own;
    context.drHint = i18n.format(test.own ? "VARBORG.Gloom.OwnTest" : "VARBORG.Gloom.DefenceTest", {
      ability: i18n.localize(`VARBORG.Ability.${test.ability}`), dr: test.dr
    });
    context.outcomes = ["triumph", "success", "failure", "ruin"].map(key => ({
      key,
      label: `VARBORG.Tier.${key}`,
      value: system.outcomes[key],
      placeholder: i18n.localize(`VARBORG.Gloom.Outcome.${kind}.${key}`)
    }));
    return context;
  }
}

/**
 * Spells (rules 3.11): picture and name, then the spell list, cost,
 * actions, damage, Sustained and the outcome texts, then a description.
 */
export class SpellSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "item"],
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/origin-header.hbs` },
    details: { template: `${TEMPLATES}/spell-details.hbs` },
    description: { template: `${TEMPLATES}/item-description.hbs` }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.item = this.document;
    context.system = system;
    context.hint = "VARBORG.Spell.SheetHint";
    return spellContext(context, system, "VARBORG.Spell.DrHint");
  }
}

/**
 * The spell's fields on its sheet: list, DR hint and outcome boxes. Shared
 * by spells and scrolls.
 */
function spellContext(context, system, drHintKey) {
  context.spellLists = SpellData.SPELL_LISTS;
  context.drHint = game.i18n.format(drHintKey, { dr: spellDr(system.cost) });
  context.outcomes = ["triumph", "success", "failure", "ruin"].map(key => ({
    key,
    label: `VARBORG.Tier.${key}`,
    value: system.outcomes[key],
    placeholder: game.i18n.localize(`VARBORG.Spell.Outcome.${key}`)
  }));
  return context;
}

/**
 * Scrolls (rules 3.11 Scrolls): carried like gear (price, cumbersome),
 * with the spell's fields written on it.
 */
export class ScrollSheet extends EquipmentSheet {
  static detailsTemplate = `${TEMPLATES}/spell-details.hbs`;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.scrollHint = "VARBORG.Spell.ScrollSheetHint";
    return spellContext(context, this.document.system, "VARBORG.Spell.ScrollDrHint");
  }
}

/**
 * Class, ancestry and background: not carried, so a header with only the
 * picture, name and a hint, then the type's own fields and a description.
 */
class OriginSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "item"],
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  /** Each sheet below names its own middle part, if it has one. */
  static detailsTemplate = "";

  static get PARTS() {
    return {
      header: { template: `${TEMPLATES}/origin-header.hbs` },
      ...(this.detailsTemplate ? { details: { template: this.detailsTemplate } } : {}),
      description: { template: `${TEMPLATES}/item-description.hbs` }
    };
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.document;
    context.system = this.document.system;
    context.hint = `VARBORG.Origin.Hint.${this.document.type}`;
    return context;
  }
}

export class ClassSheet extends OriginSheet {
  static detailsTemplate = `${TEMPLATES}/class-details.hbs`;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.abilities = ClassData.ABILITIES;
    context.spellLists = ClassData.SPELL_LISTS;
    context.startingDice = ClassData.STARTING_DICE;
    return context;
  }
}

export class AncestrySheet extends OriginSheet {}

export class BackgroundSheet extends OriginSheet {
  static detailsTemplate = `${TEMPLATES}/background-details.hbs`;
}
