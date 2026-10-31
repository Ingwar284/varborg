/**
 * The character sheet (ApplicationV2). Every change is saved as soon as
 * you leave a field.
 */

import { ABILITIES } from "../rules/abilities.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "character"],
    position: { width: 560, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  static PARTS = {
    sheet: { template: "systems/var-borg/templates/actor/character-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.actor = this.document;
    context.system = system;
    context.abilities = ABILITIES.map(key => ({
      key,
      label: `VARBORG.Ability.${key}`,
      value: system.abilities[key]
    }));
    return context;
  }
}
