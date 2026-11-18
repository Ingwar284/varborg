/**
 * Tests for the Card Slinger's razor deck (module/rules/cards.mjs, GAPS 318, 320).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FULL_DECK, isCard, isJoker, rankOf, suitOf, isFace, cardDie, shuffled, newDeck, readDeck, cardsLeft, drawCard, reshuffle
} from "../module/rules/cards.mjs";

/** A repeatable "random" number source for tests. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

test("the deck has fifty-four different cards, two of them Jokers", () => {
  assert.equal(FULL_DECK.length, 54);
  assert.equal(new Set(FULL_DECK).size, 54);
  assert.equal(FULL_DECK.filter(isJoker).length, 2);
  assert.ok(FULL_DECK.every(isCard));
  assert.equal(isCard("1H"), false);
  assert.equal(isCard("QX"), false);
});

test("rank and suit are read from the card", () => {
  assert.deepEqual([rankOf("10S"), suitOf("10S")], ["10", "S"]);
  assert.deepEqual([rankOf("QD"), suitOf("QD")], ["Q", "D"]);
  assert.deepEqual([rankOf("X1"), suitOf("X1")], ["", ""]);
  assert.ok(isFace("JH") && isFace("QH") && isFace("KH"));
  assert.ok(!isFace("AH") && !isFace("10H") && !isFace("X2"));
});

test("the card sets the damage: 2–5 d4, 6–10 d6, court d8, ace d10, Joker d12 (rules, Razor deck)", () => {
  for (const rank of ["2", "3", "4", "5"]) assert.equal(cardDie(`${rank}C`), "d4", rank);
  for (const rank of ["6", "7", "8", "9", "10"]) assert.equal(cardDie(`${rank}C`), "d6", rank);
  for (const rank of ["J", "Q", "K"]) assert.equal(cardDie(`${rank}C`), "d8", rank);
  assert.equal(cardDie("AS"), "d10");
  assert.equal(cardDie("X1"), "d12");
  assert.equal(cardDie("nothing"), "");
});

test("shuffling keeps every card once, and a seed gives the same order", () => {
  const one = shuffled(FULL_DECK, seeded(7));
  assert.deepEqual([...one].sort(), [...FULL_DECK].sort());
  assert.notDeepEqual(one, [...FULL_DECK]);
  assert.deepEqual(shuffled(FULL_DECK, seeded(7)), one);
});

test("a new deck is all fifty-four cards, with nothing discarded", () => {
  const deck = newDeck(seeded(3));
  assert.equal(cardsLeft(deck), 54);
  assert.deepEqual(deck.discard, []);
});

test("drawing takes the top card and puts it on the discard pile", () => {
  const deck = { draw: ["AS", "7H", "X2"], discard: ["2C"] };
  const drawn = drawCard(deck);
  assert.equal(drawn.card, "AS");
  assert.deepEqual(drawn.deck, { draw: ["7H", "X2"], discard: ["2C", "AS"] });
  assert.equal(cardsLeft(drawn.deck), 2);
  assert.deepEqual(deck.draw, ["AS", "7H", "X2"], "the old deck is not changed");
});

test("an empty deck draws nothing until it is shuffled", () => {
  assert.equal(drawCard({ draw: [], discard: [...FULL_DECK] }), null);
  assert.equal(cardsLeft(reshuffle(seeded(2))), 54);
});

test("a stored deck is made safe; nothing stored is a new deck", () => {
  assert.equal(cardsLeft(readDeck(undefined, seeded(1))), 54);
  assert.equal(cardsLeft(readDeck({ draw: "bad" }, seeded(1))), 54);
  assert.deepEqual(readDeck({ draw: ["AS", "AS", "ZZ", "7H"], discard: ["7H", "2C"] }), { draw: ["AS", "7H"], discard: ["2C"] });
});

test("Foundry's poker deck cards read as card ids (step 69b2)", async () => {
  const { presetCardId } = await import("../module/rules/cards.mjs");
  assert.equal(presetCardId(1, "clubs"), "AC");
  assert.equal(presetCardId(10, "Hearts"), "10H");
  assert.equal(presetCardId(11, "spades"), "JS");
  assert.equal(presetCardId(13, "diamonds"), "KD");
  assert.equal(presetCardId(0, ""), "");
  assert.equal(presetCardId(14, "clubs"), "");
  assert.equal(presetCardId(5, "stars"), "");
});

test("Court cards: knaves, queens and kings d10, aces d12; others as usual (step 69b3a)", async () => {
  const { cardDie, SLEEVE_ACE } = await import("../module/rules/cards.mjs");
  assert.equal(cardDie("QH", { courtCards: true }), "d10");
  assert.equal(cardDie("AH", { courtCards: true }), "d12");
  assert.equal(cardDie("7H", { courtCards: true }), "d6");
  assert.equal(cardDie("X1", { courtCards: true }), "d12");
  assert.equal(cardDie(SLEEVE_ACE), "d10");
  assert.equal(cardDie(SLEEVE_ACE, { courtCards: true }), "d12");
});

test("the ace up the sleeve is an ace with no suit (GAPS 322)", async () => {
  const { rankOf, suitOf, SLEEVE_ACE } = await import("../module/rules/cards.mjs");
  assert.deepEqual([rankOf(SLEEVE_ACE), suitOf(SLEEVE_ACE)], ["A", ""]);
});

test("a Wild card Joker can be named as any of the 52 other cards", async () => {
  const { NAMEABLE_CARDS } = await import("../module/rules/cards.mjs");
  assert.equal(NAMEABLE_CARDS.length, 52);
  assert.ok(!NAMEABLE_CARDS.includes("X1"));
});

test("Marked suit reads the suit the player wrote", async () => {
  const { suitFromText } = await import("../module/rules/cards.mjs");
  assert.equal(suitFromText("Hearts"), "H");
  assert.equal(suitFromText("my suit: spades"), "S");
  assert.equal(suitFromText("club"), "C");
  assert.equal(suitFromText(""), "");
  assert.equal(suitFromText("stars"), "");
});

test("a knave with The blue knave, and a card of the marked suit, add their effects", async () => {
  const { cardHitEffects, SLEEVE_ACE } = await import("../module/rules/cards.mjs");
  assert.deepEqual(cardHitEffects("JH", { blueKnave: true, markedSuit: "H" }), ["blueKnave", "markH"]);
  assert.deepEqual(cardHitEffects("JH", { markedSuit: "S" }), []);
  assert.deepEqual(cardHitEffects("2S", { blueKnave: true, markedSuit: "S" }), ["markS"]);
  assert.deepEqual(cardHitEffects(SLEEVE_ACE, { markedSuit: "S" }), []);
  assert.deepEqual(cardHitEffects("X1", { blueKnave: true, markedSuit: "H" }), []);
});
