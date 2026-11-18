/**
 * The Dusk Arcana as Foundry Cards (GAPS 320, PLAN step 69c3).
 *
 * With the world setting "Drawing cards" on Foundry Cards, each Cartomancer
 * has three Cards stacks, in a "Dusk Arcana" folder of the Cards sidebar,
 * owned by the character's owners: the deck of twelve trumps, a hand that
 * shows the reading, and a pile for cards drawn for others (Draw for the
 * querent, Read the room). Their ids are kept on the character (flags
 * var-borg.arcanaDeck, arcanaHand, arcanaPile). The Dark Master's client
 * makes them, as for the Razor deck (module/cards.mjs).
 *
 * The reading on the character (module/reading.mjs) stays the rules' record;
 * these stacks give its draws and show it: a reading is drawn into the
 * hand, a turned card is turned face down, Shuffle the fates passes the
 * unturned cards back and draws anew, and the Thirteenth, which is never
 * in the deck, is a card made in the hand. Each card carries its trump
 * number (flag var-borg.trump).
 */

import { TRUMPS, THIRTEENTH } from "./rules/arcana.mjs";
import { foundryCardsMode } from "./settings.mjs";

const SYSTEM = "var-borg";
const STACKS = { deck: "arcanaDeck", hand: "arcanaHand", pile: "arcanaPile" };
const BACK = "icons/sundries/gaming/rune-card.webp";

/** Each trump's picture, from Foundry's own icons. */
const TRUMP_IMAGES = {
  1: "icons/sundries/lights/lantern-iron-yellow.webp",
  2: "icons/magic/light/explosion-star-glow-yellow.webp",
  3: "icons/environment/settlement/graveyard.webp",
  4: "icons/magic/fire/flame-burning-campfire-orange.webp",
  5: "icons/sundries/lights/candle-lit-yellow.webp",
  6: "icons/tools/smithing/furnace-fire-metal-orange.webp",
  7: "icons/tools/navigation/map-chart-tan.webp",
  8: "icons/magic/perception/orb-eye-scrying.webp",
  9: "icons/environment/settlement/abandoned-pier.webp",
  10: "icons/sundries/gaming/dice-runed-brown.webp",
  11: "icons/equipment/head/mask-carved-wood-white.webp",
  12: "icons/magic/unholy/silhouette-robe-evil-glow.webp",
  13: "icons/magic/death/skull-horned-goat-pentagram-red.webp"
};

/** The character's three Arcana stacks, when Foundry Cards is on and they exist. */
export function arcanaStacks(actor) {
  if (!foundryCardsMode() || !actor) return null;
  const get = flag => game.cards?.get(actor.getFlag(SYSTEM, flag) ?? "") ?? null;
  const stacks = { deck: get(STACKS.deck), hand: get(STACKS.hand), pile: get(STACKS.pile) };
  return stacks.deck && stacks.hand && stacks.pile ? stacks : null;
}

/** A trump as a Card's data. */
function trumpCard(trump, sort) {
  const i18n = game.i18n;
  const name = i18n.localize(`VARBORG.Arcana.${TRUMPS[trump]}.Name`);
  return {
    name, type: "base", value: trump, suit: "", width: 2, height: 3, rotation: 0, sort,
    description: i18n.localize(`VARBORG.Arcana.${TRUMPS[trump]}.Meaning`),
    faces: [{ name, img: TRUMP_IMAGES[trump], text: i18n.localize(`VARBORG.Arcana.${TRUMPS[trump]}.Meaning`) }],
    face: 0, back: { name: i18n.localize("VARBORG.Arcana.DeckName"), text: "", img: BACK },
    flags: { [SYSTEM]: { trump } }
  };
}

/** The trump number of a Card. */
function trumpOf(card) {
  return Number(card?.getFlag(SYSTEM, "trump")) || 0;
}

/**
 * Make a Cartomancer's Arcana stacks, if they have none (Dark Master only).
 * @param {Actor} actor
 */
export async function ensureArcanaStacks(actor) {
  if (!game.user.isActiveGM || !foundryCardsMode() || !(actor?.system?.statBonuses?.reading?.set > 0)) return;
  if (arcanaStacks(actor)) return;
  const i18n = game.i18n;
  const folderName = i18n.localize("VARBORG.Arcana.FolderName");
  const folder = game.folders.find(f => f.type === "Cards" && f.name === folderName) ?? await Folder.create({ name: folderName, type: "Cards" });
  const ownership = { ...actor.ownership };
  const flags = { [SYSTEM]: { actor: actor.uuid } };
  const name = key => i18n.format(`VARBORG.Arcana.${key}`, { actor: actor.name });
  const [deck, hand, pile] = await getDocumentClass("Cards").createDocuments([
    { name: name("StackDeck"), type: "deck", img: BACK, width: 2, height: 3, ownership, folder: folder?.id ?? null, flags,
      cards: Array.from({ length: 12 }, (_, i) => trumpCard(i + 1, i)) },
    { name: name("StackHand"), type: "hand", ownership, folder: folder?.id ?? null, flags },
    { name: name("StackPile"), type: "pile", ownership, folder: folder?.id ?? null, flags }
  ]);
  await deck.shuffle({ chatNotification: false });
  await actor.update({
    [`flags.${SYSTEM}.${STACKS.deck}`]: deck.id, [`flags.${SYSTEM}.${STACKS.hand}`]: hand.id, [`flags.${SYSTEM}.${STACKS.pile}`]: pile.id
  });
}

/** Every Cartomancer of the world gets its stacks (Dark Master only). */
async function ensureAllArcanaStacks() {
  if (!game.user.isActiveGM || !foundryCardsMode()) return;
  for (const actor of game.actors) await ensureArcanaStacks(actor);
}

/** Called from the init hook, beside registerCards. */
export function registerArcanaCards() {
  Hooks.once("ready", ensureAllArcanaStacks);
  Hooks.on("varBorgCardDraw", ensureAllArcanaStacks);
  // A character who gains The reading (a class dropped, a feature added).
  Hooks.on("createItem", item => {
    if (item.parent instanceof Actor) setTimeout(() => ensureArcanaStacks(item.parent), 0);
  });
}

/** The Thirteenth, made in the hand: it is never in the deck. */
async function addThirteenthCard(hand) {
  await hand.createEmbeddedDocuments("Card", [trumpCard(THIRTEENTH, 0)]);
}

/**
 * A new reading drawn into the hand: every card comes home, the deck is
 * shuffled and the reading drawn.
 * @returns {Promise<number[]>}  The trumps, in order (the Thirteenth first when it begins the reading).
 */
export async function drawReadingCards(actor, size, { thirteenth = false } = {}) {
  const stacks = arcanaStacks(actor);
  if (!stacks) return null;
  const madeThirteenths = stacks.hand.cards.filter(card => trumpOf(card) === THIRTEENTH).map(card => card.id);
  if (madeThirteenths.length) await stacks.hand.deleteEmbeddedDocuments("Card", madeThirteenths);
  await stacks.deck.recall({ chatNotification: false });
  await stacks.deck.shuffle({ chatNotification: false });
  const trumps = [];
  if (thirteenth) {
    await addThirteenthCard(stacks.hand);
    trumps.push(THIRTEENTH);
  }
  const count = Math.max(0, Math.min(size - trumps.length, stacks.deck.availableCards.length));
  if (count) {
    const drawn = await stacks.hand.draw(stacks.deck, count, { how: CONST.CARD_DRAW_MODES.TOP, chatNotification: false });
    trumps.push(...drawn.map(trumpOf).filter(Boolean));
  }
  return trumps;
}

/**
 * Fresh cards for others (Draw for the querent, Read the room), drawn from
 * what is left in the deck to the pile.
 * @returns {Promise<number[]|null>}  null without the stacks.
 */
export async function drawFreshCards(actor, count) {
  const stacks = arcanaStacks(actor);
  if (!stacks) return null;
  const number = Math.min(count, stacks.deck.availableCards.length);
  if (!number) return [];
  const drawn = await stacks.pile.draw(stacks.deck, number, { how: CONST.CARD_DRAW_MODES.TOP, chatNotification: false });
  return drawn.map(trumpOf).filter(Boolean);
}

/** A card of the reading turned face down (turned, torn, or turned by the Dark Master). */
export async function turnArcanaCard(actor, trump) {
  const stacks = arcanaStacks(actor);
  const card = stacks?.hand.cards.find(found => trumpOf(found) === trump);
  if (card) await card.update({ face: null });
}

/**
 * Shuffle the fates with Cards: the unturned cards but the Thirteenth go
 * back to the deck, which is shuffled, and that many are drawn anew.
 * @returns {Promise<number[]|null>}  The new trumps, in place order; null without the stacks.
 */
export async function reshuffleArcana(actor, unturned) {
  const stacks = arcanaStacks(actor);
  if (!stacks) return null;
  const back = stacks.hand.cards.filter(card => unturned.includes(trumpOf(card))).map(card => card.id);
  if (back.length) await stacks.hand.pass(stacks.deck, back, { chatNotification: false });
  await stacks.deck.shuffle({ chatNotification: false });
  const count = Math.min(unturned.length, stacks.deck.availableCards.length);
  if (!count) return [];
  const drawn = await stacks.hand.draw(stacks.deck, count, { how: CONST.CARD_DRAW_MODES.TOP, chatNotification: false });
  return drawn.map(trumpOf).filter(Boolean);
}

/** The Thirteenth enters the hand in place of a trump, which goes back to the deck. */
export async function thirteenthIntoHand(actor, replaced) {
  const stacks = arcanaStacks(actor);
  if (!stacks) return;
  const card = replaced ? stacks.hand.cards.find(found => trumpOf(found) === replaced) : null;
  if (card) await stacks.hand.pass(stacks.deck, [card.id], { chatNotification: false });
  if (!stacks.hand.cards.some(found => trumpOf(found) === THIRTEENTH)) await addThirteenthCard(stacks.hand);
}
