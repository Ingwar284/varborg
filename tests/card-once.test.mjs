/**
 * Tests for module/rules/card-once.mjs (once-only chat card buttons, REVIEW.md S1).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCOPE, CLAIMS, checkClaimRequest, isClaimed, claimChange, cardHasButton, nextSlot
} from "../module/rules/card-once.mjs";

const MESSAGE = "MmMmMmMmMmMmMmMm";
const ACTOR = "AaAaAaAaAaAaAaAa";
const UUID = `Actor.${ACTOR}`;
const TOKEN_UUID = `Scene.SsSsSsSsSsSsSsSs.Token.TtTtTtTtTtTtTtTt.Actor.${ACTOR}`;

const ask = (extra = {}) => checkClaimRequest({ op: "claim", messageId: MESSAGE, flag: "stayed", actorUuid: UUID, ...extra });

test("a request for a known flag with the right shape is accepted", () => {
  assert.equal(ask().spec, CLAIMS.stayed);
  assert.equal(ask({ op: "release" }).spec, CLAIMS.stayed);
  assert.equal(ask({ flag: "groupPanicChosen", sub: ACTOR }).spec, CLAIMS.groupPanicChosen);
  assert.equal(ask({ flag: "poisonResisted", sub: UUID }).spec, CLAIMS.poisonResisted);
  assert.equal(ask({ flag: "poisonResisted", sub: TOKEN_UUID, actorUuid: TOKEN_UUID }).spec, CLAIMS.poisonResisted);
  assert.equal(ask({ flag: "shadowblightRolled", sub: "2" }).spec, CLAIMS.shadowblightRolled);
});

test("anything else is refused: unknown flags, odd names, odd ids, wrong shapes", () => {
  const bad = { error: "bad" };
  for (const flag of ["notAFlag", "__proto__", "constructor", "toString", "", 3, null]) {
    assert.deepEqual(ask({ flag }), bad, String(flag));
  }
  assert.deepEqual(ask({ op: "delete" }), bad);
  assert.deepEqual(ask({ messageId: "short" }), bad);
  assert.deepEqual(ask({ messageId: "../../etc/passwd" }), bad);
  assert.deepEqual(ask({ actorUuid: "Item.AaAaAaAaAaAaAaAa" }), bad);
  assert.deepEqual(ask({ actorUuid: undefined }), bad);
  assert.deepEqual(checkClaimRequest(null), bad);
  assert.deepEqual(checkClaimRequest("stayed"), bad);
  // A "flag" shape takes no key; a "map" or "list" shape needs a valid one.
  assert.deepEqual(ask({ sub: "x" }), bad);
  assert.deepEqual(ask({ flag: "groupPanicChosen" }), bad);
  assert.deepEqual(ask({ flag: "groupPanicChosen", sub: "a.b" }), bad);
  assert.deepEqual(ask({ flag: "groupPanicChosen", sub: "flags.x" }), bad);
  assert.deepEqual(ask({ flag: "shadowblightRolled", sub: "3" }), bad);
  assert.deepEqual(ask({ flag: "poisonResisted", sub: "Actor.short" }), bad);
});

test("a bound key must belong to the actor named in the request", () => {
  assert.deepEqual(ask({ flag: "groupPanicChosen", sub: "ZzZzZzZzZzZzZzZz" }), { error: "bad" });
  assert.deepEqual(ask({ flag: "poisonResisted", sub: "Actor.ZzZzZzZzZzZzZzZz" }), { error: "bad" });
  // A token actor's id is its last uuid part.
  assert.equal(ask({ flag: "groupPanicChosen", sub: ACTOR, actorUuid: TOKEN_UUID }).spec, CLAIMS.groupPanicChosen);
});

test("every table entry has a known shape, actions, and a key pattern when it needs one", () => {
  for (const [flag, spec] of Object.entries(CLAIMS)) {
    assert.ok(["flag", "map", "list"].includes(spec.shape), flag);
    assert.ok(spec.actions.length > 0, flag);
    if (spec.shape !== "flag") assert.ok(spec.sub instanceof RegExp, flag);
  }
  // The shapes the old buttons stored (kept so old cards still read).
  assert.equal(CLAIMS.stayed.shape, "flag");
  assert.equal(CLAIMS.panicChosen.shape, "flag");
  assert.equal(CLAIMS.groupPanicChosen.shape, "map");
  assert.equal(CLAIMS.poisonResisted.shape, "list");
});

test("old cards read as used or not, whatever the stored value is", () => {
  assert.equal(isClaimed(true, CLAIMS.stayed), true);
  assert.equal(isClaimed(undefined, CLAIMS.stayed), false);
  assert.equal(isClaimed(false, CLAIMS.stayed), false);
  // An old poison card: an array of uuids.
  assert.equal(isClaimed([UUID], CLAIMS.poisonResisted, UUID), true);
  assert.equal(isClaimed([UUID], CLAIMS.poisonResisted, TOKEN_UUID), false);
  assert.equal(isClaimed(undefined, CLAIMS.poisonResisted, UUID), false);
  assert.equal(isClaimed({ not: "a list" }, CLAIMS.poisonResisted, UUID), false);
  // An old group Panic card: an object keyed by actor id.
  assert.equal(isClaimed({ [ACTOR]: true }, CLAIMS.groupPanicChosen, ACTOR), true);
  assert.equal(isClaimed({ other: true }, CLAIMS.groupPanicChosen, ACTOR), false);
  assert.equal(isClaimed(undefined, CLAIMS.groupPanicChosen, ACTOR), false);
  assert.equal(isClaimed([ACTOR], CLAIMS.groupPanicChosen, ACTOR), false);
});

test("the update only touches one entry under flags.var-borg", () => {
  assert.equal(SCOPE, "var-borg");
  assert.deepEqual(claimChange(CLAIMS.stayed, "stayed", undefined, undefined, "claim"), { "flags.var-borg.stayed": true });
  assert.deepEqual(claimChange(CLAIMS.stayed, "stayed", true, undefined, "release"), { "flags.var-borg.-=stayed": null });
  // A map is written one key at a time, so two characters' choices never overwrite each other.
  assert.deepEqual(claimChange(CLAIMS.groupPanicChosen, "groupPanicChosen", { other: true }, ACTOR, "claim"), { [`flags.var-borg.groupPanicChosen.${ACTOR}`]: true });
  assert.deepEqual(claimChange(CLAIMS.groupPanicChosen, "groupPanicChosen", { [ACTOR]: true }, ACTOR, "release"), { [`flags.var-borg.groupPanicChosen.-=${ACTOR}`]: null });
  // A list keeps the entries already there.
  assert.deepEqual(claimChange(CLAIMS.poisonResisted, "poisonResisted", [TOKEN_UUID], UUID, "claim"), { "flags.var-borg.poisonResisted": [TOKEN_UUID, UUID] });
  assert.deepEqual(claimChange(CLAIMS.poisonResisted, "poisonResisted", undefined, UUID, "claim"), { "flags.var-borg.poisonResisted": [UUID] });
  assert.deepEqual(claimChange(CLAIMS.poisonResisted, "poisonResisted", [TOKEN_UUID, UUID], UUID, "release"), { "flags.var-borg.poisonResisted": [TOKEN_UUID] });
  for (const flag of Object.keys(CLAIMS)) {
    for (const key of Object.keys(claimChange(CLAIMS[flag], flag, undefined, "1", "claim"))) {
      assert.ok(key.startsWith("flags.var-borg."), key);
    }
  }
});

test("the card must have a button for that flag and that actor, in one tag", () => {
  const card = `<div><button type="button" data-action="stayAtOne" data-actor-uuid="${UUID}" data-item-id="x">Stay</button></div>`;
  assert.equal(cardHasButton(card, CLAIMS.stayed, UUID), true);
  assert.equal(cardHasButton(card, CLAIMS.stayed, `Actor.ZzZzZzZzZzZzZzZz`), false);
  assert.equal(cardHasButton(card, CLAIMS.panicChosen, UUID), false);
  // The action on one button and the actor on another does not count.
  const split = `<button data-action="stayAtOne"></button><button data-actor-uuid="${UUID}"></button>`;
  assert.equal(cardHasButton(split, CLAIMS.stayed, UUID), false);
  assert.equal(cardHasButton(undefined, CLAIMS.stayed, UUID), false);
  assert.equal(cardHasButton("<p>No buttons</p>", CLAIMS.stayed, UUID), false);
});

test("the Shadowblight roll numbers: one roll, or two with Wild surge", () => {
  assert.equal(nextSlot(undefined, 1), "1");
  assert.equal(nextSlot({ 1: true }, 1), null);
  assert.equal(nextSlot({ 1: true }, 2), "2");
  assert.equal(nextSlot({ 2: true }, 2), "1");
  assert.equal(nextSlot({ 1: true, 2: true }, 2), null);
  assert.equal(nextSlot({ 1: true, 2: true }, 9), null);
  assert.equal(nextSlot("junk", 1), "1");
  assert.equal(nextSlot([true], 1), "1");
});
