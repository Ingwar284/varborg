/**
 * Tests for the Cartomancer's reading (module/rules/arcana.mjs, GAPS 319, 325).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRUMPS, THIRTEENTH, layReading, readReading, canTurn, turnCard, withThirteenth, roundKey, trumpMeaning
} from "../module/rules/arcana.mjs";

/** A d12 that gives these rolls in turn. */
const rolls = (...values) => () => values.shift();

test("the Dusk Arcana has twelve trumps and the Thirteenth", () => {
  assert.equal(Object.keys(TRUMPS).length, 13);
  assert.equal(TRUMPS[1], "lamplighter");
  assert.equal(TRUMPS[THIRTEENTH], "thirteenth");
});

test("a reading is three trumps, repeats rolled again; Wider spread makes four", () => {
  assert.deepEqual(layReading(3, rolls(5, 5, 2, 9)), [
    { trump: 5, turned: false }, { trump: 2, turned: false }, { trump: 9, turned: false }
  ]);
  assert.equal(layReading(4, rolls(1, 2, 3, 4)).length, 4);
});

test("Booth in the Ironwall: a reading can begin with the Thirteenth", () => {
  const reading = layReading(3, rolls(7, 8), { thirteenth: true });
  assert.deepEqual(reading.map(card => card.trump), [13, 7, 8]);
});

test("a broken roller does not loop for ever", () => {
  assert.equal(layReading(3, () => 99).length, 0);
});

test("a stored reading is made safe", () => {
  assert.deepEqual(readReading([{ trump: 2, turned: 1 }, { trump: 2 }, { trump: 40 }, null]), [{ trump: 2, turned: true }]);
  assert.deepEqual(readReading("bad"), []);
});

test("a card can be turned once; the Thirteenth cannot be turned by the Cartomancer", () => {
  const reading = [{ trump: 3, turned: false }, { trump: 13, turned: false }];
  assert.ok(canTurn(reading, 0));
  assert.ok(!canTurn(reading, 1));
  assert.ok(!canTurn(reading, 5));
  const after = turnCard(reading, 0);
  assert.ok(!canTurn(after, 0));
  assert.equal(reading[0].turned, false, "the old reading is not changed");
});

test("the Thirteenth replaces an unturned card, and never comes twice", () => {
  const reading = [{ trump: 1, turned: true }, { trump: 2, turned: false }, { trump: 3, turned: false }];
  assert.deepEqual(withThirteenth(reading).map(card => card.trump), [1, 2, 13]);
  assert.deepEqual(withThirteenth(reading, 1).map(card => card.trump), [1, 13, 3]);
  assert.deepEqual(withThirteenth(withThirteenth(reading)).map(card => card.trump), [1, 2, 13]);
});

test("once per round is kept by combat and round", () => {
  assert.equal(roundKey("abc", 2), "abc:2");
  assert.equal(roundKey("", 2), "");
});

test("what each trump gives (GAPS 325)", () => {
  assert.equal(trumpMeaning(2).fortune, 1);
  assert.equal(trumpMeaning(3).entries[0].kind, "heal");
  assert.equal(trumpMeaning(3).entries[0].amount, "d6");
  assert.equal(trumpMeaning(9).entries[0].condition, "quickened");
  assert.equal(trumpMeaning(5, { statuses: ["stupefied", "frightened"] }).entries[0].condition, "frightened");
  assert.equal(trumpMeaning(5, { statuses: ["stupefied"] }).entries[0].condition, "stupefied");
  assert.deepEqual(trumpMeaning(5).entries, []);
  assert.ok(trumpMeaning(1).entries[0].nextOnly);
  assert.ok(trumpMeaning(1).buffs.every(buff => buff.grant === "boon"));
  assert.equal(trumpMeaning(8).buffs[0].dr, -2);
  assert.equal(trumpMeaning(6).buffs[0].damage, "d4");
  assert.ok(trumpMeaning(12).manual);
  for (const trump of [4, 7, 10, 11, 13]) assert.ok(trumpMeaning(trump).manual, trump);
});

test("Shuffle the fates redraws only the unturned cards, never the Thirteenth", async () => {
  const { reshuffleUnturned } = await import("../module/rules/arcana.mjs");
  const reading = [{ trump: 1, turned: true }, { trump: 2, turned: false }, { trump: 13, turned: false }];
  assert.deepEqual(reshuffleUnturned(reading, rolls(1, 7)), [{ trump: 1, turned: true }, { trump: 7, turned: false }, { trump: 13, turned: false }]);
});

test("Black sector tears the Thirteenth; an unspent Thirteenth is seen", async () => {
  const { tearThirteenth, hasThirteenth } = await import("../module/rules/arcana.mjs");
  const reading = [{ trump: 13, turned: false }, { trump: 4, turned: false }];
  assert.ok(hasThirteenth(reading));
  assert.ok(!hasThirteenth(tearThirteenth(reading)));
  assert.equal(tearThirteenth(reading)[1].turned, false);
});

test("fresh cards are different trumps", async () => {
  const { freshCards } = await import("../module/rules/arcana.mjs");
  assert.deepEqual(freshCards(3, rolls(4, 4, 9, 1)), [4, 9, 1]);
});
