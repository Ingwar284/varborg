/**
 * Putting items on and taking them off (GAPS 287). The Equipment tab, the
 * Inventory tab's equip tick and "Stored in" menu, and the item sheet's
 * Equipped box all come through here, so they always agree. The rules
 * themselves (which slot, what must come off) are in rules/slots.mjs.
 */

import { planPlace, defaultSlot, HANDS } from "./rules/slots.mjs";
import { isDropped, droppedContainerIds } from "./rules/dropped.mjs";
import { effectiveWeapon } from "./effects.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

/** Items that can be worn or held: everything a character carries. */
export const SLOT_ITEM_TYPES = ["weapon", "armour", "shield", "gear", "container", "scroll", "relic"];

/**
 * An item as the slot rules see it: its place, its "Worn as" tag and its
 * hand traits after effects (Titan's grip makes a two-handed weapon
 * versatile).
 */
export function slotView(item) {
  const traits = item.type === "weapon" ? effectiveWeapon(item) : item.system;
  return {
    id: item.id,
    type: item.type,
    place: item.system.place ?? "",
    wornAs: item.system.wornAs ?? "",
    twoHanded: Boolean(traits.twoHanded),
    versatile: Boolean(traits.versatile)
  };
}

/** The character's carried items that are not dropped. */
export function carriedItems(actor) {
  const droppedIds = droppedContainerIds(actor.items.contents);
  return actor.items.filter(item => SLOT_ITEM_TYPES.includes(item.type) && !isDropped(item, droppedIds));
}

/**
 * Put an item in a slot, taking off whatever is in the way (the swap).
 * A versatile item put in a hand asks: one hand or both?
 * @param {Item} item  An item on a character.
 * @param {string} slot  "left", "right", "both", "worn" or a worn tag.
 * @param {{ bothHands?: boolean }} [options]  Skip the question.
 * @returns {Promise<boolean>}  Whether anything changed.
 */
export async function putOn(item, slot, { bothHands } = {}) {
  const actor = item.actor;
  if (!actor) return false;
  const view = slotView(item);
  if (view.versatile && HANDS.includes(slot) && bothHands === undefined) {
    const answer = await askHands(item);
    if (!answer) return false;
    bothHands = answer === "both";
  }
  const views = carriedItems(actor).map(slotView);
  const plan = planPlace(views, view, slot, bothHands);
  if (!plan) {
    ui.notifications.warn(game.i18n.format("VARBORG.Equipment.DoesNotFit", { name: item.name }));
    return false;
  }
  const updates = [
    { _id: item.id, "system.place": plan.place, "system.storedIn": "" },
    ...plan.remove.map(id => ({ _id: id, "system.place": "" }))
  ];
  await actor.updateEmbeddedDocuments("Item", updates);
  if (plan.remove.length) {
    const names = plan.remove.map(id => actor.items.get(id)?.name).filter(Boolean).join(", ");
    ui.notifications.info(game.i18n.format("VARBORG.Equipment.TakenOff", { names, name: item.name }));
  }
  return true;
}

/**
 * Put an item where it usually goes (the Inventory tick, "Stored in →
 * Equipped", the item sheet's Equipped box): worn if it is wearable,
 * otherwise in a free hand.
 */
export function putOnUsual(item) {
  const actor = item.actor;
  if (!actor) return item.update({ "system.equipped": true });
  const view = slotView(item);
  return putOn(item, defaultSlot(carriedItems(actor).map(slotView), view));
}

/** Take an item off: it stays carried, loose. */
export function takeOff(item) {
  return item.update({ "system.place": "" });
}

/**
 * Switch a versatile item between one hand and both. From both hands it
 * goes to the right hand.
 */
export function switchHands(item) {
  const place = item.system.place;
  if (place === "both") return putOn(item, "right", { bothHands: false });
  return putOn(item, place || "right", { bothHands: true });
}

/** Ask how to hold a versatile item. Returns "one", "both" or null. */
async function askHands(item) {
  const i18n = game.i18n;
  return foundry.applications.api.DialogV2.wait({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.format("VARBORG.Equipment.HowToHold", { name: item.name }) },
    content: `<p>${i18n.localize("VARBORG.Equipment.VersatileHint")}</p>`,
    buttons: [
      { action: "one", label: i18n.localize("VARBORG.Equipment.OneHand"), default: true },
      { action: "both", label: i18n.localize("VARBORG.Equipment.BothHands") }
    ],
    rejectClose: false
  });
}
