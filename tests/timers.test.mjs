/**
 * Tests for condition timers (GAPS 129–131).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIMER_KINDS, isRoundsFormula, newTimer, timerAtEndOfTurn, timerAtStartOfTurn, timerEndsWithCombat,
  timerEndsWithNewDay, longerTimer
} from "../module/rules/timers.mjs";

test("timer kinds: rounds, until the start of its next turn, until the end of the encounter, until the next day", () => {
  assert.deepEqual(TIMER_KINDS, ["rounds", "startOfTurn", "encounter", "nextDay"]);
  assert.throws(() => newTimer("minutes"), RangeError);
  assert.throws(() => newTimer("rounds", { rounds: 0 }), RangeError);
  assert.throws(() => newTimer("rounds"), RangeError);
});

test("rounds can be a number or dice", () => {
  for (const ok of ["1", "3", "d4", "2d6", " d10 "]) assert.ok(isRoundsFormula(ok), ok);
  for (const bad of ["", "0", "d0", "d", "1 hour", "-1", "1.5", "d4+1"]) assert.ok(!isRoundsFormula(bad), bad);
});

test("'until the end of its next turn' (1 round) gained on someone else's turn ends at the end of its next turn", () => {
  const timer = newTimer("rounds", { rounds: 1, ownTurn: false });
  assert.equal(timerAtEndOfTurn(timer).ends, true);
});

test("the turn it was gained in does not count (GAPS 79, 129)", () => {
  let timer = newTimer("rounds", { rounds: 1, ownTurn: true });
  let step = timerAtEndOfTurn(timer);
  assert.equal(step.ends, false);
  assert.equal(step.timer.freshTurn, false);
  assert.equal(timerAtEndOfTurn(step.timer).ends, true);
});

test("'for d4 rounds' rolled 3 lasts three of its own turns", () => {
  let timer = newTimer("rounds", { rounds: 3 });
  const ends = [];
  for (let turn = 0; turn < 3; turn++) {
    const step = timerAtEndOfTurn(timer);
    ends.push(step.ends);
    timer = step.timer;
  }
  assert.deepEqual(ends, [false, false, true]);
  assert.equal(timer.rounds, 0);
});

test("'until the start of its next turn' ends when its turn starts, not at the end", () => {
  const timer = newTimer("startOfTurn");
  assert.equal(timerAtEndOfTurn(timer).ends, false);
  assert.equal(timerAtStartOfTurn(timer).ends, true);
  assert.equal(timerAtStartOfTurn(newTimer("rounds", { rounds: 2 })).ends, false);
});

test("'until the end of the encounter' only ends with combat; every timer ends with combat (GAPS 130)", () => {
  const timer = newTimer("encounter");
  assert.equal(timerAtEndOfTurn(timer).ends, false);
  assert.equal(timerAtStartOfTurn(timer).ends, false);
  for (const kind of TIMER_KINDS.filter(kind => kind !== "nextDay")) {
    assert.equal(timerEndsWithCombat(newTimer(kind, { rounds: 2 })), true);
  }
  assert.equal(timerEndsWithCombat(null), false);
});

test("'until the next day begins' outlasts combat and ends with the new day (GAPS 161)", () => {
  const day = newTimer("nextDay");
  assert.equal(timerEndsWithCombat(day), false);
  assert.equal(timerAtEndOfTurn(day).ends, false);
  assert.equal(timerAtStartOfTurn(day).ends, false);
  assert.equal(timerEndsWithNewDay(day), true);
  assert.equal(timerEndsWithNewDay(newTimer("encounter")), false);
  assert.equal(timerEndsWithNewDay(null), false);
  assert.equal(longerTimer(newTimer("encounter"), day), day);
  assert.equal(longerTimer(day, newTimer("rounds", { rounds: 9 })), day);
});

test("gained again: the longer lasting one stays; no timer stays no timer (GAPS 131)", () => {
  const one = newTimer("rounds", { rounds: 1 });
  const four = newTimer("rounds", { rounds: 4 });
  const start = newTimer("startOfTurn");
  const encounter = newTimer("encounter");
  assert.equal(longerTimer(one, four), four);
  assert.equal(longerTimer(four, one), four);
  assert.equal(longerTimer(start, one), one);
  assert.equal(longerTimer(four, encounter), encounter);
  assert.equal(longerTimer(null, encounter), null);
});
