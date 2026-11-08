/**
 * Clicking an item's icon on a sheet (item, feat, power, spell, gloom
 * ability…) posts a chat card with its picture, name and description.
 * Used by the character, foe, minion and vehicle sheets as the "postItem"
 * action.
 */

const { renderTemplate } = foundry.applications.handlebars;

const CARD_TEMPLATE = "systems/var-borg/templates/chat/item-card.hbs";

/**
 * Post an item's description to chat, spoken by the actor that has it.
 * @param {Item} item
 */
export async function postItemCard(item) {
  const actor = item.actor;
  const content = await renderTemplate(CARD_TEMPLATE, {
    name: item.name,
    img: item.img,
    type: game.i18n.localize(CONFIG.Item.typeLabels?.[item.type] ?? ""),
    description: item.system.description ?? ""
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}

/**
 * The sheet action: the icon's row says which item (data-item-id).
 * Called with the sheet as `this`.
 */
export async function onPostItem(event, target) {
  const id = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(id);
  if (item) await postItemCard(item);
}
