/**
 * Expendable dice, firing and reloading in Foundry (rules 4.1 Weapon Traits,
 * GAPS 52 and 53).
 *
 * The Expendable button rolls the item's die and marks it used up on a 1.
 * A weapon with Reload is loaded or empty: Fire empties it, Reload fills it
 * and the card lists the Interact actions it costs. The actions are counted
 * on the card only; action pips arrive with turns (PLAN step 13).
 */

import {
  expendableFormula, isUsedUpRoll, canRollExpendable, canFire, canReload, actionSymbols
} from "../rules/expendable.mjs";

const { renderTemplate } = foundry.applications.handlebars;

const EXPENDABLE_TEMPLATE = "systems/var-borg/templates/chat/expendable-card.hbs";
const WEAPON_TEMPLATE = "systems/var-borg/templates/chat/weapon-card.hbs";

/**
 * Roll an item's expendable die and post the chat card. On a 1 the item is
 * marked used up (for a weapon: out of ammunition).
 * @param {Actor} actor  The character using the item.
 * @param {Item} item    The item with an expendable die.
 */
export async function rollExpendable(actor, item) {
  if (!canRollExpendable(item.system)) return;
  const die = item.system.expendable;
  const roll = new Roll(expendableFormula(die));
  await roll.evaluate();
  const result = roll.total;
  const usedUp = isUsedUpRoll(result);
  if (usedUp) await item.update({ "system.usedUp": true });

  const i18n = game.i18n;
  const isWeapon = item.type === "weapon";
  const title = i18n.format("VARBORG.Expendable.CardTitle", { name: item.name, die });
  const content = await renderTemplate(EXPENDABLE_TEMPLATE, {
    title,
    result,
    usedUp,
    outcome: i18n.localize(usedUp
      ? (isWeapon ? "VARBORG.Expendable.OutOfAmmo" : "VARBORG.Expendable.UsedUp")
      : (isWeapon ? "VARBORG.Expendable.AmmoLeft" : "VARBORG.Expendable.Remains"))
  });

  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: title, content });
}

/**
 * Fire a loaded weapon: it becomes empty. The attack itself arrives in
 * PLAN step 14, so the card only says the shot is spent.
 */
export async function fireWeapon(actor, item) {
  if (!canFire(item.system)) return;
  await item.update({ "system.loaded": false });
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
