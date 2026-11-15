/**
 * Clicking an item's icon on a sheet (item, feat, power, spell, gloom
 * ability…) posts a chat card with its picture, name and description.
 * Used by the character, foe, minion, vehicle and chest sheets as the "postItem"
 * action.
 */

const { renderTemplate } = foundry.applications.handlebars;

const CARD_TEMPLATE = "systems/var-borg/templates/chat/item-card.hbs";

/** The four results, best first. */
const TIERS = ["triumph", "success", "failure", "ruin"];

/**
 * A power's, spell's or scroll's own result texts (its Triumph, Success,
 * Failure and Ruin boxes), for the sheet's opened description and the
 * icon's chat card. Only the boxes filled in; empty when none are.
 * @param {Item} item
 * @returns {{tier: string, label: string, text: string}[]}
 */
export function ownOutcomeLines(item) {
  const outcomes = item?.system?.outcomes;
  if (!outcomes) return [];
  return TIERS
    .filter(tier => typeof outcomes[tier] === "string" && outcomes[tier].trim())
    .map(tier => ({
      tier,
      label: game.i18n.localize(`VARBORG.Tier.${tier}`),
      text: outcomes[tier].trim()
    }));
}

/** Lets the sheets' description row list the result texts: {{#each (varborgOutcomes item)}}. */
export function registerItemChatHelpers() {
  Handlebars.registerHelper("varborgOutcomes", item => ownOutcomeLines(item));
}

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
    description: item.system.description ?? "",
    outcomes: ownOutcomeLines(item)
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
