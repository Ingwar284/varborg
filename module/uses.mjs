/**
 * Limited uses in Foundry: "once per round", "once per encounter" and
 * "once per day" (rules 3.16, GAPS 161, 164).
 *
 * A feat or gear item with a frequency gets a Use button on the character
 * and foe sheets. Pressing it marks the item used and posts a card with the
 * item's text; the button stays off until the use comes back:
 * - once per round: at the start of each round, and when combat ends
 *   (module/combat.mjs);
 * - once per encounter: when combat ends (module/combat.mjs);
 * - once per day: at each new day (module/days.mjs), with a line on the
 *   chat saying what came back.
 * The Dark Master can untick "Used" on the item's sheet at any time.
 *
 * The maths lives in module/rules/uses.mjs.
 */

import { canUseOnce, hasFrequency, itemsToReset } from "./rules/uses.mjs";

/** Load the Use button the sheets share. */
export function registerUses() {
  foundry.applications.handlebars.loadTemplates(["systems/var-borg/templates/actor/use-button.hbs"]);
}

/** Item types that can have a limited use. */
const TYPES = ["feat", "gear"];

/** Whether the sheet shows a Use button for this item. */
export function hasLimitedUse(item) {
  return TYPES.includes(item.type) && hasFrequency(item.system);
}

/** Whether the Use button can be pressed now. */
export function canUseItem(item) {
  return TYPES.includes(item.type) && canUseOnce(item.system);
}

/** "Once per day". */
export function frequencyLabel(item) {
  return game.i18n.localize(`VARBORG.Uses.Frequency.${item.system.frequency || "none"}`);
}

/**
 * What a sheet needs for the Use button: shown when the item has a
 * frequency, off while it is used.
 */
export function useButton(item) {
  if (!hasLimitedUse(item)) return { hasUse: false };
  const i18n = game.i18n;
  const usable = canUseItem(item);
  return {
    hasUse: true,
    canUse: usable,
    useTooltip: usable
      ? i18n.format("VARBORG.Uses.Tooltip", { frequency: frequencyLabel(item).toLowerCase() })
      : i18n.localize("VARBORG.Uses.UsedTooltip")
  };
}

/** An item's text for a chat card: escaped, line breaks kept. */
function cardText(text) {
  return foundry.utils.escapeHTML(String(text ?? "").trim()).replace(/\n/g, "<br>");
}

/**
 * The Use button: mark the item used and post its card.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function useLimitedItem(actor, item) {
  if (!actor.isOwner || !hasLimitedUse(item)) return;
  const i18n = game.i18n;
  if (!canUseItem(item)) {
    ui.notifications.warn(i18n.format("VARBORG.Uses.AlreadyUsed", { item: item.name, frequency: frequencyLabel(item).toLowerCase() }));
    return;
  }
  await item.update({ "system.frequencyUsed": true });
  const esc = foundry.utils.escapeHTML;
  const text = cardText(item.system.description);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card uses-card"><h3>${i18n.format("VARBORG.Uses.CardTitle", { name: esc(actor.name), item: esc(item.name) })}</h3>`
      + `<p class="sum">${i18n.format("VARBORG.Uses.CardLine", { frequency: frequencyLabel(item) })}</p>`
      + (text ? `<p>${text}</p>` : "") + `</div>`
  });
}

/**
 * Bring back the used items of these actors at a moment (roundStart,
 * combatEnd or newDay). Dark Master only.
 * @param {Actor[]} actors
 * @param {string} event
 * @returns {Promise<Map<Actor, string[]>>}  For each actor, the names of the items that came back.
 */
export async function resetLimitedUses(actors, event) {
  const back = new Map();
  if (!game.user.isGM) return back;
  for (const actor of new Set(actors)) {
    if (!actor) continue;
    const items = actor.items.filter(item => TYPES.includes(item.type));
    const ids = itemsToReset(items, event);
    if (!ids.length) continue;
    await actor.updateEmbeddedDocuments("Item", ids.map(_id => ({ _id, "system.frequencyUsed": false })));
    back.set(actor, ids.map(id => actor.items.get(id)?.name).filter(Boolean));
  }
  return back;
}

/**
 * Every actor a new day reaches for uses and timers: the actors in the
 * Actors tab, and the foes on scenes that are not linked to one (each
 * token is its own copy).
 */
export function actorsForNewDay() {
  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (!token.actorLink && token.actor) actors.push(token.actor);
    }
  }
  return actors;
}
