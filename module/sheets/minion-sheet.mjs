/**
 * The minion sheet (ApplicationV2), laid out like the minion write-ups in
 * rules 3.14: name and tier, owner, description, HP, Morale and armour,
 * then conditions, attacks (weapon items) and abilities (feat items: its
 * passives and its ◈◈ active ability). Every change is saved as soon as
 * you leave a field.
 *
 * A minion attacks and tests like a character whose abilities are all 0
 * (GAPS 169), so its Attack button opens the usual attack dialog.
 */

import MinionData from "../data/minion.mjs";
import { moraleChoices } from "../rules/foe.mjs";
import { canRollMorale } from "../rules/morale.mjs";
import { tierStats } from "../rules/minions.mjs";
import { rollMorale } from "../dice/morale.mjs";
import { rollAttack, recoverFromRuin } from "../dice/attack.mjs";
import { sheetConditions, activateConditionControls } from "../conditions.mjs";
import { useLimitedItem, hasLimitedUse, frequencyLabel, useButton } from "../uses.mjs";
import { minionCount } from "../minions.mjs";
import { VB_DIALOG_CLASSES } from "../dialog.mjs";
import { onPostItem } from "../item-chat.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TEMPLATES = "systems/var-borg/templates/actor";

/** "Melee · d4" or "Ranged · d4 · 30′", as on the foe sheet. */
function attackSummary(weapon) {
  const i18n = game.i18n;
  const { kind, damage, reach, ranged } = weapon.system;
  const melee = kind === "melee";
  let distance = "";
  if (melee && reach > 0) distance = i18n.format("VARBORG.Trait.reachValue", { value: reach });
  if (!melee && ranged > 0) distance = i18n.format("VARBORG.Carrying.Feet", { value: ranged });
  return [i18n.localize(melee ? "VARBORG.Foe.Melee" : "VARBORG.Foe.Ranged"), damage, distance]
    .filter(Boolean).join(" · ");
}

export default class MinionSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "themed", "theme-light", "foe", "minion"],
    position: { width: 560, height: 660 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      postItem: onPostItem,
      createItem: MinionSheet.#onCreateItem,
      editItem: MinionSheet.#onEditItem,
      deleteItem: MinionSheet.#onDeleteItem,
      attack: MinionSheet.#onAttack,
      recover: MinionSheet.#onRecover,
      rollMorale: MinionSheet.#onRollMorale,
      useLimited: MinionSheet.#onUseLimited,
      applyTier: MinionSheet.#onApplyTier,
      openOwner: MinionSheet.#onOpenOwner
    }
  };

  static PARTS = {
    main: { template: `${TEMPLATES}/minion-sheet.hbs`, scrollable: [""] }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const i18n = game.i18n;
    const actor = this.document;
    const system = actor.system;
    context.actor = actor;
    context.system = system;
    context.tiers = MinionData.TIERS;
    context.armourDice = MinionData.ARMOUR_DICE;
    const stats = tierStats(system.tier);
    context.tierHint = i18n.format("VARBORG.Minion.TierHint", {
      hp: stats.hp, morale: stats.morale,
      armour: i18n.localize(`VARBORG.Foe.Armour.${stats.armour || "none"}`),
      attack: stats.attack,
      abilities: i18n.localize(`VARBORG.Minion.TierAbilities.${system.tier}`)
    });
    // The characters it can serve, and how many minions the owner has.
    context.ownerOptions = {
      "": i18n.localize("VARBORG.Minion.NoOwner"),
      ...Object.fromEntries(game.actors.filter(a => a.type === "character").map(a => [a.id, a.name]))
    };
    const owner = system.ownerActor;
    context.owner = owner;
    if (owner) {
      const { count, limit, over } = minionCount(owner);
      context.ownerLine = i18n.format("VARBORG.Minion.OwnerCount", { name: owner.name, count, limit });
      context.ownerOver = over;
    }
    context.moraleOptions = Object.fromEntries(moraleChoices().map(value => [
      value ?? "",
      i18n.localize(`VARBORG.Foe.Morale.${value ?? "none"}`)
    ]));
    context.morale = String(system.morale ?? "");
    context.canRollMorale = canRollMorale(system);
    context.moraleTooltip = i18n.localize(context.canRollMorale ? "VARBORG.MoraleRoll.Tooltip" : "VARBORG.MoraleRoll.NeverTooltip");
    context.attacks = actor.itemTypes.weapon
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({ item, summary: attackSummary(item) }));
    context.abilityItems = actor.itemTypes.feat
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({ item, frequency: hasLimitedUse(item) ? frequencyLabel(item) : "", ...useButton(item) }));
    context.conditions = sheetConditions(actor);
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    activateConditionControls(this.element, this.document);
  }

  /** Morale "–" comes from the menu as "", which is saved as nothing (null). */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    if (data.system?.morale === "") data.system.morale = null;
    return data;
  }

  /** The Add buttons make a new attack (weapon) or ability (feat) and open it. */
  static async #onCreateItem(event, button) {
    const type = button.dataset.type;
    const name = game.i18n.localize(type === "weapon" ? "VARBORG.Foe.NewAttack" : "VARBORG.Minion.NewAbility");
    const system = type === "weapon"
      ? { kind: "melee", damage: tierStats(this.document.system.tier).attack }
      : { source: "passive" };
    const [item] = await this.document.createEmbeddedDocuments("Item", [{ name, type, system }]);
    item?.sheet.render(true);
  }

  /**
   * The Use tier button: HP, Morale, armour and the first attack's damage
   * from the tier (rules 3.14), after asking.
   */
  static async #onApplyTier() {
    const i18n = game.i18n;
    const actor = this.document;
    const stats = tierStats(actor.system.tier);
    const ok = await DialogV2.confirm({
      classes: VB_DIALOG_CLASSES,
      window: { title: i18n.localize("VARBORG.Minion.ApplyTier") },
      content: `<p>${i18n.format("VARBORG.Minion.ApplyTierAsk", { tier: i18n.localize(`VARBORG.Minion.Tier.${actor.system.tier}`) })}</p>`,
      rejectClose: false
    });
    if (!ok) return;
    await actor.update({
      "system.hp.max": stats.hp,
      "system.hp.value": stats.hp,
      "system.morale": stats.morale,
      "system.armour": stats.armour
    });
    const attack = actor.itemTypes.weapon.toSorted((a, b) => a.sort - b.sort)[0];
    if (attack) await attack.update({ "system.damage": stats.attack });
    else {
      await actor.createEmbeddedDocuments("Item", [{
        name: i18n.localize("VARBORG.Minion.DefaultAttack"), type: "weapon", system: { kind: "melee", damage: stats.attack }
      }]);
    }
  }

  /** The sword button: the attack dialog, testing at +0 (GAPS 169). */
  static async #onAttack(event, button) {
    const item = this.#itemFor(button);
    if (item) await rollAttack(this.document, item);
  }

  /** The Recover button ends an attack Ruin, spending an action in combat. */
  static async #onRecover() {
    await recoverFromRuin(this.document);
  }

  /** The Use button marks a once-per-round, -encounter or -day ability used. */
  static async #onUseLimited(event, button) {
    const item = this.#itemFor(button);
    if (item) await useLimitedItem(this.document, item);
  }

  /** The Morale button rolls 2d6 against the minion's Morale (rules 3.12). */
  static async #onRollMorale() {
    await rollMorale(this.document);
  }

  /** The owner's name opens the owner's sheet. */
  static #onOpenOwner() {
    this.document.system.ownerActor?.sheet.render(true);
  }

  /** The pencil button opens the item's own sheet. */
  static #onEditItem(event, button) {
    this.#itemFor(button)?.sheet.render(true);
  }

  /** The bin button asks first, then deletes the item. */
  static async #onDeleteItem(event, button) {
    await this.#itemFor(button)?.deleteDialog();
  }

  /** The item a button in a list belongs to. */
  #itemFor(element) {
    return this.document.items.get(element.closest("[data-item-id]")?.dataset.itemId);
  }
}
