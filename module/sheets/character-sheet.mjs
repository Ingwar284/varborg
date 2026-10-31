/**
 * The character sheet (ApplicationV2). Every change is saved as soon as
 * you leave a field.
 */

import { ABILITIES } from "../rules/abilities.mjs";
import { rollAbilityTest } from "../dice/ability-test.mjs";
import { rollContestedTest } from "../dice/contested-test.mjs";
import { rollChanceDie } from "../dice/chance-die.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "character"],
    position: { width: 560, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAbility: CharacterSheet.#onRollAbility,
      rollContest: CharacterSheet.#onRollContest,
      rollChance: CharacterSheet.#onRollChance
    }
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

  /** Clicking an ability name opens the test dialog for that ability. */
  static async #onRollAbility(event, button) {
    await rollAbilityTest(this.document, button.dataset.ability);
  }

  /** The Contested test button opens the contest dialog. */
  static async #onRollContest(event, button) {
    await rollContestedTest(this.document);
  }

  /** The Chance Die button rolls 2d6 + Fortune straight away. */
  static async #onRollChance(event, button) {
    await rollChanceDie(this.document);
  }
}
