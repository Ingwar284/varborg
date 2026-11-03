/**
 * Expendable dice, firing and reloading in Foundry (rules 4.1 Weapon Traits,
 * GAPS 52, 53 and 54).
 *
 * The Expendable button rolls the item's die. On a 1 one of a stack is used
 * up, and the last one (or a weapon's ammunition) is marked used up.
 * A weapon with Reload is loaded or empty: Fire empties it, Reload fills it
 * and the card lists the Interact actions it costs. The actions are counted
 * on the card only; action pips arrive with turns (PLAN step 13).
 */

import {
  expendableFormula, expendableOutcome, canRollExpendable, canFire, canReload, actionSymbols
} from "../rules/expendable.mjs";
import { markFired } from "../ammunition.mjs";

const { renderTemplate } = foundry.applications.handlebars;

const EXPENDABLE_TEMPLATE = "systems/var-borg/templates/chat/expendable-card.hbs";
const WEAPON_TEMPLATE = "systems/var-borg/templates/chat/weapon-card.hbs";

/**
 * Roll an item's expendable die and post the chat card. On a 1 one of a
 * stack is used up; the last one is marked used up (for a weapon: out of
 * ammunition).
 * @param {Actor} actor  The character using the item.
 * @param {Item} item    The item with an expendable die.
 */
export async function rollExpendable(actor, item) {
  if (!canRollExpendable(item.system)) return;
  const die = item.system.expendable;
  const roll = new Roll(expendableFormula(die));
  await roll.evaluate();
  const result = roll.total;
  const after = expendableOutcome(result, item.system.quantity ?? 1);
  if (after.spent) {
    const changes = { "system.usedUp": after.usedUp };
    if ("quantity" in item.system) changes["system.quantity"] = after.quantity;
    await item.update(changes);
  }

  const i18n = game.i18n;
  const isWeapon = item.type === "weapon";
  const title = i18n.format("VARBORG.Expendable.CardTitle", { name: item.name, die });
  let outcome;
  if (after.usedUp) outcome = i18n.localize(isWeapon ? "VARBORG.Expendable.OutOfAmmo" : "VARBORG.Expendable.UsedUp");
  else if (after.spent) outcome = i18n.format("VARBORG.Expendable.OneUsedUp", { count: after.quantity });
  else outcome = i18n.localize(isWeapon ? "VARBORG.Expendable.AmmoLeft" : "VARBORG.Expendable.Remains");
  const content = await renderTemplate(EXPENDABLE_TEMPLATE, { title, result, spent: after.spent, outcome });

  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: title, content });
}

/**
 * Fire a loaded weapon without an attack roll: it becomes empty. In combat,
 * its ammunition is rolled for when the combat ends (GAPS 39).
 */
export async function fireWeapon(actor, item) {
  if (!canFire(item.system)) return;
  await item.update({ "system.loaded": false });
  await markFired(actor, item);
  await postWeaponCard(actor, item, {
    title: game.i18n.format("VARBORG.Reload.FireTitle", { name: item.name }),
    text: game.i18n.localize("VARBORG.Reload.NowEmpty")
  });
}

/**
 * Reload an empty weapon: it becomes loaded, and the card shows the Interact
 * actions spent (rules 4.1: "an indicated number of Interact actions").
 */
export async function reloadWeapon(actor, item) {
  if (!canReload(item.system)) return;
  const actions = item.system.reload;
  await item.update({ "system.loaded": true });
  await postWeaponCard(actor, item, {
    title: game.i18n.format("VARBORG.Reload.ReloadTitle", { name: item.name }),
    symbols: actionSymbols(actions),
    text: game.i18n.format("VARBORG.Reload.ActionsSpent", { count: actions })
  });
}

async function postWeaponCard(actor, item, data) {
  const content = await renderTemplate(WEAPON_TEMPLATE, data);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor: data.title, content });
}
