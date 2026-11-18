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
  SLEEVE_ACE, NAMEABLE_CARDS, suitFromText, drawCards, drawUntilKnave, loseCards, shuffleKeepingLost, cardDie,
  betterCardIndex, pairedCards, cardsDamageFormula, CARD_POWER_DRAWS, cardHitEffects, SUITS, ownedStackIds
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
  const [card] = await drawManyFromDeck(item, 1);
  return card ?? null;
}

/**
 * Draw up to this many cards from the top (the card powers, step 69b3b).
 * @returns {Promise<string[]>}  Fewer when the deck runs out.
 */
export async function drawManyFromDeck(item, count) {
  if (foundryCardsMode()) {
    const stacks = cardsStacks(item);
    const number = Math.min(count, stacks?.deck.availableCards.length ?? 0);
    if (!number) return [];
    const cards = await stacks.pile.draw(stacks.deck, number, { how: CONST.CARD_DRAW_MODES.TOP, chatNotification: false });
    return cards.map(cardIdOf).filter(Boolean);
  }
  const drawn = drawCards(deckOf(item), count);
  if (drawn.cards.length) await item.setFlag(SYSTEM, FLAG, drawn.deck);
  return drawn.cards;
}

/**
 * The Council's knave: turn over cards until a knave comes up.
 * @returns {Promise<{knave: string|null, turned: string[]}>}
 */
export async function drawUntilKnaveFromDeck(item) {
  if (foundryCardsMode()) {
    const turned = [];
    for (;;) {
      const card = await drawFromDeck(item);
      if (!card) return { knave: null, turned };
      if (rankOf(card) === "J") return { knave: card, turned };
      turned.push(card);
    }
  }
  const found = drawUntilKnave(deckOf(item));
  await item.setFlag(SYSTEM, FLAG, found.deck);
  return { knave: found.knave, turned: found.turned };
}

/**
 * These drawn cards are lost until the encounter ends: a hand shuffle
 * leaves them out. With Foundry Cards they are marked in the discard pile.
 */
export async function loseFromDeck(item, cards) {
  if (!cards?.length) return;
  if (foundryCardsMode()) {
    const stacks = cardsStacks(item);
    if (!stacks) return;
    const ids = new Set(cards);
    const updates = stacks.pile.cards.filter(card => ids.has(cardIdOf(card)))
      .map(card => ({ _id: card.id, [`flags.${SYSTEM}.lost`]: true }));
    if (updates.length) await stacks.pile.updateEmbeddedDocuments("Card", updates);
    return;
  }
  await item.setFlag(SYSTEM, FLAG, loseCards(deckOf(item), cards));
}

/**
 * Shuffle the deck back together. By hand (keepLost), lost cards stay out;
 * when an encounter ends, every card comes back.
 */
export async function shuffleDeck(item, { keepLost = false } = {}) {
  if (foundryCardsMode()) {
    const stacks = cardsStacks(item);
    if (!stacks) return;
    if (keepLost) {
      const back = stacks.pile.cards.filter(card => !card.getFlag(SYSTEM, "lost")).map(card => card.id);
      if (back.length) await stacks.pile.pass(stacks.deck, back, { chatNotification: false });
    } else await stacks.deck.recall({ chatNotification: false });
    await stacks.deck.shuffle({ chatNotification: false });
    return;
  }
  await item.setFlag(SYSTEM, FLAG, keepLost ? shuffleKeepingLost(deckOf(item), random) : reshuffle(random));
}

/**
 * A drawn card, as thrown: Wild card may name a Joker as another card,
 * and a Joker that stays a Joker bites the thrower (GAPS 321, 322).
 * Court cards sets the die. Used by attacks and the card powers.
 * @param {Actor} actor
 * @param {string} drawn
 * @param {object} feats  From cardFeats.
 * @returns {Promise<{card: string, label: string, die: string, bite: object|null}>}
 */
export async function throwCard(actor, drawn, feats) {
  const named = isJoker(drawn) && feats.wildCard ? await askWildCard() : "";
  const card = named || drawn;
  const bite = isJoker(card) ? await jokerBite(actor) : null;
  const label = named ? game.i18n.format("VARBORG.Cards.NamedJoker", { card: cardName(named) }) : cardName(card);
  return { card, label, die: cardDie(card, { courtCards: feats.courtCards }), bite };
}

/** A deck weapon the character carries: an equipped one first (for the card powers). */
export function deckWeaponOf(actor) {
  return actor.itemTypes.weapon.filter(isDeckWeapon)
    .toSorted((a, b) => Number(b.system.equipped) - Number(a.system.equipped))[0] ?? null;
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
  await shuffleDeck(item, { keepLost: true });
  const title = i18n.format("VARBORG.Cards.ShuffleTitle", { name: item.name });
  const content = await renderTemplate(WEAPON_TEMPLATE, {
    title,
    symbols: actionSymbols(1),
    text: i18n.format(turn.combatant ? "VARBORG.Cards.Shuffled" : "VARBORG.Cards.ShuffledOutside", { count: deckCount(item).left })
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

// ---------------------------------------------------------------------------
// Card powers (step 69b3b, GAPS 323).

/** The "On a hit" lines of The blue knave and Marked suit for a thrown card. */
function hitLines(card, feats, label) {
  const i18n = game.i18n;
  return cardHitEffects(card, feats).map(key => `${label}: ${i18n.format("VARBORG.Cards.OnHit", { text: i18n.localize(`VARBORG.Cards.Effect.${key}`) })}`);
}

/** The choices of suit for Call the suit. */
export function suitChoices() {
  return SUITS.map(suit => ({ value: suit, label: `VARBORG.Cards.Suit.${suit}` }));
}

/**
 * Royal flush with several foes: the player chooses the foe each card is
 * thrown at. Without an answer, the cards go round the foes in turn.
 * @returns {Promise<number[]>}  For each card, the index of its foe.
 */
async function assignCards(thrown, targets) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const rows = thrown.map((t, i) => `<div class="form-group"><label>${esc(t.label)} (${t.die})</label><select name="card${i}">${
    targets.map((target, j) => `<option value="${j}"${j === i % targets.length ? " selected" : ""}>${esc(target.name)}</option>`).join("")
  }</select></div>`).join("");
  const { DialogV2 } = foundry.applications.api;
  const { VB_DIALOG_CLASSES } = await import("./dialog.mjs");
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.localize("VARBORG.Cards.AssignTitle") },
    content: `<p>${esc(i18n.localize("VARBORG.Cards.AssignAsk"))}</p>${rows}`,
    ok: { label: "VARBORG.Cards.AssignOk", icon: "fa-solid fa-hand" },
    rejectClose: false
  });
  return thrown.map((t, i) => {
    const j = Math.trunc(Number(data?.[`card${i}`]));
    return Number.isInteger(j) && j >= 0 && j < targets.length ? j : i % targets.length;
  });
}

/**
 * Draw and throw the cards of a card power.
 * @param {Actor} actor
 * @param {string} kind  "deal", "cut", "suit", "flush" or "knave".
 * @param {Item} item    The deck.
 * @param {{suit?: string, targets?: {uuid, name, type, armour}[]}} [options]
 *   targets: every targeted creature but the user.
 * @returns {Promise<{dice: string, perTarget: object[]|null, notes: string[], loseOnRuin: string[]}>}
 *   dice: the card dice for a single damage roll ("" for none); perTarget:
 *   with two or more targets, each one's formula (Deal the table, Royal flush).
 */
export async function throwPowerCards(actor, kind, item, { suit = "", targets = [] } = {}) {
  const i18n = game.i18n;
  const feats = cardFeats(actor);
  const notes = [];
  const result = { dice: "", perTarget: null, notes, loseOnRuin: [], outcomeEntries: [] };
  // Conditions are given for you when one foe is targeted; with several,
  // each card's foe differs, so they stay notes (step 69b3c).
  const single = targets.length <= 1;
  const give = (card, extra = []) => { if (single) result.outcomeEntries.push(...cardOutcomeEntries([...cardHitEffects(card, feats), ...extra])); };
  const thrownNote = t => {
    notes.push(i18n.format("VARBORG.Cards.ThrownNote", { card: t.label, die: t.die }));
    if (t.bite) notes.push(t.bite.line);
  };

  if (kind === "knave") {
    const { knave, turned } = await drawUntilKnaveFromDeck(item);
    await loseFromDeck(item, turned);
    if (!knave) {
      notes.push(i18n.localize("VARBORG.Cards.NoKnave"));
      result.noThrow = true;
      return result;
    }
    notes.push(i18n.format("VARBORG.Cards.Turned", { count: turned.length }));
    notes.push(i18n.format("VARBORG.Cards.ThrownNote", { card: cardName(knave), die: "2d10" }));
    notes.push(...hitLines(knave, feats, cardName(knave)));
    give(knave);
    return result;
  }

  const want = CARD_POWER_DRAWS[kind] ?? 1;
  const drawn = await drawManyFromDeck(item, want);
  if (drawn.length < want) notes.push(i18n.format("VARBORG.Cards.ShortDraw", { count: drawn.length }));
  if (!drawn.length) return result;

  if (kind === "cut") {
    const best = betterCardIndex(drawn.map(card => cardDie(card, { courtCards: feats.courtCards })));
    drawn.forEach((card, i) => { if (i !== best) notes.push(i18n.format("VARBORG.Cards.Discarded", { card: cardName(card) })); });
    const t = await throwCard(actor, drawn[best], feats);
    thrownNote(t);
    notes.push(...hitLines(t.card, feats, t.label));
    give(t.card);
    result.dice = t.die;
    return result;
  }

  if (kind === "suit") {
    const t = await throwCard(actor, drawn[0], feats);
    thrownNote(t);
    const named = i18n.localize(`VARBORG.Cards.Suit.${suit}`);
    const right = suitOf(t.card) === suit;
    notes.push(i18n.format(right ? (single ? "VARBORG.Cards.SuitRightAuto" : "VARBORG.Cards.SuitRight") : "VARBORG.Cards.SuitWrong", { suit: named }));
    notes.push(...hitLines(t.card, feats, t.label));
    give(t.card, right ? ["suitRight"] : []);
    return result;
  }

  // Deal the table and Royal flush: each card at a foe.
  const thrown = [];
  for (const card of drawn) {
    const t = await throwCard(actor, card, feats);
    if (t.bite) notes.push(t.bite.line);
    thrown.push(t);
  }
  const paired = kind === "flush" ? pairedCards(thrown.map(t => t.card)) : thrown.map(() => false);
  thrown.forEach((t, i) => { if (paired[i]) notes.push(i18n.format("VARBORG.Cards.Paired", { card: t.label })); });
  // Deal the table: one card to each of up to three foes, in the order targeted.
  // Royal flush: divided as the player chooses.
  let foeOf;
  if (kind === "deal") foeOf = thrown.map((t, i) => (i < targets.length ? i : -1));
  else if (targets.length >= 2) foeOf = await assignCards(thrown, targets);
  else foeOf = thrown.map(() => (targets.length ? 0 : -1));
  thrown.forEach((t, i) => {
    const target = targets[foeOf[i]];
    notes.push(target ? i18n.format("VARBORG.Cards.DealtTo", { card: t.label, name: target.name, die: paired[i] ? `${t.die} (max)` : t.die })
      : i18n.format("VARBORG.Cards.Discarded", { card: t.label }));
    if (target) notes.push(...hitLines(t.card, feats, t.label));
    if (target) give(t.card);
  });
  if (!single && thrown.some((t, i) => targets[foeOf[i]] && cardHitEffects(t.card, feats).length)) notes.push(i18n.localize("VARBORG.Cards.ByHand"));
  if (kind === "deal") result.loseOnRuin = [...drawn];
  const formulaFor = j => cardsDamageFormula(thrown.map((t, i) => ({ die: t.die, max: paired[i] })).filter((c, i) => foeOf[i] === j));
  if (targets.length >= 2) result.perTarget = targets.map((target, j) => ({ uuid: target.uuid, name: target.name, formula: formulaFor(j) }));
  else result.dice = targets.length ? formulaFor(0) : cardsDamageFormula([{ die: thrown[0].die, max: paired[0] }]);
  return result;
}

// ---------------------------------------------------------------------------
// Conditions the cards give (step 69b3c): as power outcome entries, so the
// usual outcome code puts them on the target (module/outcomes.mjs).

/** One outcome entry on the target, on a hit (Triumph or Success). */
function targetEntry(fields) {
  return {
    kind: "condition", who: "target", tiers: { triumph: true, success: true, failure: false, ruin: false },
    condition: "", duration: { kind: "", rounds: "1" }, amount: "", option: "", when: "result", damageType: "",
    soaked: false, nextOnly: false, test: false, whileSustained: false, note: "", ...fields
  };
}

const ONE_ROUND = { kind: "rounds", rounds: "1" };

/**
 * The outcome entries for a thrown card's effects: The blue knave
 * (Stupefied), Marked suit (hearts d4 persistent bleed, spades Frightened)
 * and Call the suit's named suit (Slowed). Diamonds and clubs stay notes.
 * @param {string[]} keys  From cardHitEffects, plus "suitRight".
 */
export function cardOutcomeEntries(keys) {
  const entries = [];
  for (const key of keys) {
    if (key === "blueKnave") entries.push(targetEntry({ condition: "stupefied", duration: ONE_ROUND, note: "The blue knave" }));
    if (key === "markS") entries.push(targetEntry({ condition: "frightened", duration: ONE_ROUND, note: "Marked suit: of you" }));
    if (key === "markH") entries.push(targetEntry({ kind: "persistent", damageType: "bleed", amount: "d4", note: "Marked suit" }));
    if (key === "suitRight") entries.push(targetEntry({ condition: "slowed", duration: ONE_ROUND, note: "Call the suit" }));
  }
  return entries;
}

/** The outcome inputs for a deck attack's card (a weapon attack has none of its own). */
export function cardAttackOutcomes(actor, item, entries) {
  if (!entries.length) return null;
  const targets = [...game.user.targets].map(token => token.actor).filter(Boolean);
  return {
    entries, buffEffects: [], name: item.name, morph: false, sustained: false,
    source: `${actor.uuid}|${item.id}`,
    targets: targets.map(other => other.uuid),
    allyTargets: targets.filter(other => ["character", "minion"].includes(other.type)).map(other => other.uuid),
    foeTargets: targets.filter(other => other.type === "foe").map(other => other.uuid),
    user: actor.uuid, partner: "", chosen: []
  };
}

// ---------------------------------------------------------------------------
// Clean-up (step 71): a character's Foundry Cards stacks go with them.

/** Every Cards stack with its owner flags, for ownedStackIds. */
function stackOwners() {
  return (game.cards?.contents ?? []).map(stack => ({
    id: stack.id, item: stack.getFlag(SYSTEM, "item") ?? "", actor: stack.getFlag(SYSTEM, "actor") ?? ""
  }));
}

/** Delete these Cards stacks (Dark Master only). */
async function deleteStacks(ids) {
  if (!ids.length) return;
  await getDocumentClass("Cards").deleteDocuments(ids);
}

/**
 * Called from the init hook. The Dark Master's client deletes:
 * - a Razor deck's Cards deck and pile when the weapon is deleted (a
 *   character rerolled deletes every item);
 * - a Cartomancer's Dusk Arcana stacks when they no longer read it (the
 *   class feature deleted, or the class changed);
 * - everything a character had when the character is deleted.
 */
export function registerCardsCleanup() {
  Hooks.on("deleteItem", async item => {
    if (!game.user.isActiveGM || !(item.parent instanceof Actor)) return;
    await deleteStacks(ownedStackIds(stackOwners(), { itemUuid: item.uuid }));
    const actor = item.parent;
    if (actor.system?.statBonuses?.reading?.set > 0) return;
    const arcana = ownedStackIds(stackOwners(), { actorUuid: actor.uuid, arcana: true });
    if (!arcana.length) return;
    await deleteStacks(arcana);
    for (const flag of ["arcanaDeck", "arcanaHand", "arcanaPile"]) {
      if (actor.getFlag(SYSTEM, flag) !== undefined) await actor.unsetFlag(SYSTEM, flag);
    }
  });
  Hooks.on("deleteActor", async actor => {
    if (!game.user.isActiveGM) return;
    await deleteStacks(ownedStackIds(stackOwners(), { actorUuid: actor.uuid }));
  });
}
