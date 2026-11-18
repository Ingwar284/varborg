/**
 * The Card Slinger's razor deck in Foundry (GAPS 318, 320; PLAN step 69b).
 *
 * The deck lives on its weapon (a weapon with "cardDeck" ticked) as the
 * flag var-borg.deck: { draw, discard }. Each attack with it draws the top
 * card (module/dice/attack.mjs), and the card sets the damage. The Shuffle
 * button on the sheet shuffles the whole deck back together for one
 * Interact action, and every deck is shuffled when an encounter ends.
 * The maths is in module/rules/cards.mjs.
 *
 * Foundry Cards (GAPS 320, step 69b2): with the world setting "Drawing
 * cards" on Foundry Cards, each Razor deck has a Cards deck of its own
 * (Foundry's dark poker deck and two Jokers) and a discard pile, in a
 * "Razor decks" folder of the Cards sidebar, owned by whoever owns the
 * character. Their ids are kept on the weapon (flags var-borg.cardsDeck
 * and var-borg.cardsPile). Drawing passes the top card to the pile;
 * shuffling recalls every card and shuffles. Only the Dark Master's client
 * makes them: when the world is ready, when a deck weapon is added, and
 * when the setting is switched. Each card carries its card id (flag
 * var-borg.card), so the rules read it as they read the system's deck.
 */

import {
  readDeck, drawCard, reshuffle, cardsLeft, isJoker, rankOf, suitOf, FULL_DECK, JOKERS, JOKER_BITE, presetCardId,
  SLEEVE_ACE, NAMEABLE_CARDS, suitFromText
} from "./rules/cards.mjs";
import { actionSymbols } from "./rules/expendable.mjs";
import { killedByDamage } from "./deaths-door.mjs";
import { foundryCardsMode } from "./settings.mjs";

const SYSTEM = "var-borg";
const FLAG = "deck";
const DECK_FLAG = "cardsDeck";
const PILE_FLAG = "cardsPile";
const WEAPON_TEMPLATE = "systems/var-borg/templates/chat/weapon-card.hbs";
const JOKER_IMG = "cards/dark-gold/joker.webp";
const { renderTemplate } = foundry.applications.handlebars;

/** Foundry's dice randomness, so shuffles are as fair as dice rolls. */
const random = () => CONFIG.Dice.randomUniform();

/** Whether this item is a deck of cards (the Razor deck). */
export function isDeckWeapon(item) {
  return item?.type === "weapon" && Boolean(item.system?.cardDeck);
}

/** The deck as stored on the weapon, made safe. */
export function deckOf(item) {
  return readDeck(item.getFlag(SYSTEM, FLAG), random);
}

/** The weapon's Foundry Cards deck and discard pile, when they exist. */
function cardsStacks(item) {
  const deck = game.cards?.get(item.getFlag(SYSTEM, DECK_FLAG) ?? "") ?? null;
  const pile = game.cards?.get(item.getFlag(SYSTEM, PILE_FLAG) ?? "") ?? null;
  return deck && pile ? { deck, pile } : null;
}

/**
 * How many cards are left to draw, and how many the deck holds. With
 * Foundry Cards and no Cards deck made yet, `missing` is true.
 */
export function deckCount(item) {
  if (!foundryCardsMode()) return { left: cardsLeft(deckOf(item)), total: FULL_DECK.length, missing: false };
  const stacks = cardsStacks(item);
  if (!stacks) return { left: 0, total: FULL_DECK.length, missing: true };
  return { left: stacks.deck.availableCards.length, total: stacks.deck.cards.size, missing: false };
}

/** The card id of a Foundry Card: its flag, or its poker value and suit. */
function cardIdOf(card) {
  return card?.getFlag(SYSTEM, "card") || presetCardId(card?.value, card?.suit) || "";
}

/**
 * Draw the top card and keep the deck.
 * @returns {Promise<string|null>}  The card, or null when the deck is empty.
 */
export async function drawFromDeck(item) {
  if (foundryCardsMode()) {
    const stacks = cardsStacks(item);
    if (!stacks?.deck.availableCards.length) return null;
    const [card] = await stacks.pile.draw(stacks.deck, 1, { how: CONST.CARD_DRAW_MODES.TOP, chatNotification: false });
    return cardIdOf(card) || null;
  }
  const drawn = drawCard(deckOf(item));
  if (!drawn) return null;
  await item.setFlag(SYSTEM, FLAG, drawn.deck);
  return drawn.card;
}

/** Shuffle the whole deck back together. */
export async function shuffleDeck(item) {
  if (foundryCardsMode()) {
    const stacks = cardsStacks(item);
    if (!stacks) return;
    await stacks.deck.recall({ chatNotification: false });
    await stacks.deck.shuffle({ chatNotification: false });
    return;
  }
  await item.setFlag(SYSTEM, FLAG, reshuffle(random));
}

/** The "Razor decks" folder of the Cards sidebar, made when first needed. */
async function cardsFolder() {
  const name = game.i18n.localize("VARBORG.Cards.FolderName");
  return game.folders.find(folder => folder.type === "Cards" && folder.name === name)
    ?? Folder.create({ name, type: "Cards" });
}

/**
 * Make a deck weapon's Foundry Cards deck and discard pile, if it has none
 * (Dark Master only). The deck is Foundry's dark poker deck with two Jokers,
 * shuffled; both are owned by the character's owners.
 * @param {Item} item
 */
export async function ensureCardsDeck(item) {
  if (!game.user.isActiveGM || !isDeckWeapon(item) || !(item.parent instanceof Actor) || cardsStacks(item)) return;
  const actor = item.parent;
  const i18n = game.i18n;
  const preset = CONFIG.Cards.presets.pokerDark;
  // Loaded as Foundry loads a preset in its Create Cards dialog.
  const source = await fetch(foundry.utils.getRoute(preset.src)).then(response => response.json());
  const card = (data, id) => {
    const { _id, origin, drawn, ...rest } = data;
    return foundry.utils.mergeObject(rest, { flags: { [SYSTEM]: { card: id } } }, { inplace: false });
  };
  const jokerName = i18n.localize("VARBORG.Cards.JokerName");
  const cards = [
    ...source.cards.map(data => card(data, presetCardId(data.value, data.suit))),
    ...JOKERS.map((id, i) => card({
      name: jokerName, type: "base", value: 0, suit: "", width: 2, height: 3, rotation: 0, sort: source.cards.length + i,
      faces: [{ name: jokerName, img: JOKER_IMG, text: "" }], face: 0, back: { name: "", text: "", img: null }
    }, id))
  ];
  // Whoever owns the character can draw, pass and shuffle its cards.
  const ownership = { ...actor.ownership };
  const folder = (await cardsFolder())?.id ?? null;
  const names = { actor: actor.name, item: item.name };
  const [deck, pile] = await getDocumentClass("Cards").createDocuments([
    { name: i18n.format("VARBORG.Cards.DeckName", names), type: "deck", img: source.img, width: source.width,
      height: source.height, cards, ownership, folder, flags: { [SYSTEM]: { item: item.uuid } } },
    { name: i18n.format("VARBORG.Cards.PileName", names), type: "pile", ownership, folder, flags: { [SYSTEM]: { item: item.uuid } } }
  ]);
  await deck.shuffle({ chatNotification: false });
  await item.update({ [`flags.${SYSTEM}.${DECK_FLAG}`]: deck.id, [`flags.${SYSTEM}.${PILE_FLAG}`]: pile.id });
}

/** Make the Cards decks of every deck weapon the world's actors carry (Dark Master only). */
async function ensureAllCardsDecks() {
  if (!game.user.isActiveGM || !foundryCardsMode()) return;
  for (const actor of game.actors) {
    for (const item of actor.items.filter(isDeckWeapon)) await ensureCardsDeck(item);
  }
}

/**
 * Called from the init hook: the Dark Master's client makes the Foundry
 * Cards decks when the world is ready, when a deck weapon is added or
 * ticked, and when the setting is switched to Foundry Cards.
 */
export function registerCards() {
  Hooks.once("ready", ensureAllCardsDecks);
  Hooks.on("varBorgCardDraw", ensureAllCardsDecks);
  const onItem = item => {
    if (foundryCardsMode() && isDeckWeapon(item)) ensureCardsDeck(item);
  };
  Hooks.on("createItem", onItem);
  Hooks.on("updateItem", (item, change) => {
    if (foundry.utils.hasProperty(change, "system.cardDeck")) onItem(item);
  });
  // Drawing or shuffling a Cards deck does not change the weapon, so the
  // owner's open sheet is redrawn to show the cards left.
  for (const hook of ["createCard", "updateCard", "deleteCard"]) {
    Hooks.on(hook, card => redrawSheetFor(card.parent));
  }
}

/** Redraw the open sheet of the character whose Razor deck this Cards stack is. */
const redrawSheetFor = foundry.utils.debounce(stack => {
  const uuid = stack?.getFlag?.(SYSTEM, "item");
  if (!uuid) return;
  const actor = foundry.utils.parseUuid(uuid)?.primaryId ? game.actors.get(foundry.utils.parseUuid(uuid).primaryId) : null;
  if (actor?.sheet?.rendered) actor.sheet.render();
}, 100);

/**
 * A card's name for the chat card, such as "the queen of hearts" or "a Joker".
 * @param {string} card
 */
export function cardName(card) {
  const i18n = game.i18n;
  if (isJoker(card)) return i18n.localize("VARBORG.Cards.Joker");
  if (card === SLEEVE_ACE) return i18n.localize("VARBORG.Cards.SleeveAceName");
  return i18n.format("VARBORG.Cards.Name", {
    rank: i18n.localize(`VARBORG.Cards.Rank.${rankOf(card)}`),
    suit: i18n.localize(`VARBORG.Cards.Suit.${suitOf(card)}`)
  });
}

/**
 * A Joker bites back (Razor deck): the thrower takes d4 slashing damage.
 * Provisional (GAPS 321): whatever the attack's result, and armour does not
 * soak it. At Death's Door any damage kills.
 * @returns {Promise<{line: string, roll: Roll}>}
 */
export async function jokerBite(actor) {
  const roll = await new Roll(JOKER_BITE).evaluate();
  const name = actor.name;
  if (await killedByDamage(actor, roll.total)) {
    return { roll, line: game.i18n.format("VARBORG.Cards.BiteKilled", { name, amount: roll.total }) };
  }
  const from = actor.system.hp.value;
  const to = Math.max(0, from - roll.total);
  await actor.update({ "system.hp.value": to });
  return { roll, line: game.i18n.format("VARBORG.Cards.Bite", { name, amount: roll.total, from, to }) };
}

/**
 * The Shuffle button: one Interact action in combat, on your own turn.
 * @param {Actor} actor
 * @param {Item} item  The deck.
 */
export async function shuffleDeckAction(actor, item) {
  const i18n = game.i18n;
  const { turnState } = await import("./combat.mjs");
  const turn = turnState(actor);
  if (turn.combatant && !turn.onOwnTurn) {
    ui.notifications.warn(i18n.localize("VARBORG.Cards.NotYourTurn"));
    return;
  }
  if (turn.combatant) {
    if (turn.combatant.actionsLeft < 1) ui.notifications.warn(i18n.localize("VARBORG.Cards.NoActions"));
    await turn.combatant.adjustPips("actions", -1);
  }
  await shuffleDeck(item);
  const title = i18n.format("VARBORG.Cards.ShuffleTitle", { name: item.name });
  const content = await renderTemplate(WEAPON_TEMPLATE, {
    title,
    symbols: actionSymbols(1),
    text: i18n.format(turn.combatant ? "VARBORG.Cards.Shuffled" : "VARBORG.Cards.ShuffledOutside", { count: FULL_DECK.length })
  });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor: title, content });
}

/**
 * The encounter is over: every deck its characters carry is shuffled whole
 * (Razor deck). Called by the Dark Master's client when a combat ends.
 * @param {Actor[]} actors
 */
export async function shuffleDecksAfterCombat(actors) {
  for (const actor of new Set(actors.filter(Boolean))) {
    for (const item of actor.items.filter(isDeckWeapon)) await shuffleDeck(item);
  }
}

// ---------------------------------------------------------------------------
// Card feats on deck attacks (step 69b3a, GAPS 318, 322).

/** Whether an item has a "set" stat effect on this target (a card feat's switch). */
function hasSwitch(item, target) {
  return (item.system.effects ?? []).some(effect => effect.kind === "stat" && effect.target === target);
}

/**
 * The card feats a character has: Court cards, Wild card, The blue knave,
 * Marked suit (its suit from the text chosen on the feat) and the Ace up
 * the sleeve feat, when it is not used this encounter.
 * @param {Actor} actor
 */
export function cardFeats(actor) {
  const bonuses = actor.system.statBonuses ?? {};
  const on = target => bonuses[target]?.set > 0;
  const marked = on("markedSuit") ? actor.items.find(item => hasSwitch(item, "markedSuit")) : null;
  const chosen = marked?.system.effects.find(effect => effect.kind === "choice")?.chosen ?? "";
  const sleeve = on("sleeveAce") ? actor.items.find(item => hasSwitch(item, "sleeveAce")) : null;
  return {
    courtCards: on("courtCards"),
    wildCard: on("wildCard"),
    blueKnave: on("blueKnave"),
    markedSuit: suitFromText(chosen),
    sleeveAce: sleeve && !sleeve.system.frequencyUsed ? sleeve : null
  };
}

/** Ace up the sleeve is used until the encounter ends (its frequency). */
export async function useSleeveAce(feat) {
  await feat.update({ "system.frequencyUsed": true });
}

/**
 * Wild card: a Joker can be named as any other card. Asks the player.
 * @returns {Promise<string>}  The named card, or "" to keep the Joker.
 */
export async function askWildCard() {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const options = [
    `<option value="">${esc(i18n.localize("VARBORG.Cards.KeepJoker"))}</option>`,
    ...NAMEABLE_CARDS.map(card => `<option value="${card}">${esc(cardName(card))}</option>`)
  ].join("");
  const { DialogV2 } = foundry.applications.api;
  const { VB_DIALOG_CLASSES } = await import("./dialog.mjs");
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.localize("VARBORG.Cards.WildTitle") },
    content: `<p>${esc(i18n.localize("VARBORG.Cards.WildAsk"))}</p><div class="form-group"><select name="card">${options}</select></div>`,
    ok: { label: "VARBORG.Cards.WildOk", icon: "fa-solid fa-hand" },
    rejectClose: false
  });
  const card = String(data?.card ?? "");
  return NAMEABLE_CARDS.includes(card) ? card : "";
}
