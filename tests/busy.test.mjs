/**
 * Tests for module/busy.mjs (busy guards, REVIEW.md S2).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { oneAtATime, inOrder } from "../module/busy.mjs";

/** A job that waits until release() is called, and counts how often it started. */
function gate() {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  return { wait, release, started: 0 };
}

test("a second click with the same key is ignored while the first job runs", async () => {
  const g = gate();
  let runs = 0;
  const job = async () => { runs++; await g.wait; return "done"; };
  const first = oneAtATime("light:a", job);
  const second = await oneAtATime("light:a", job);
  assert.equal(second, undefined);
  g.release();
  assert.equal(await first, "done");
  assert.equal(runs, 1);
});

test("the key is free again once the job has finished", async () => {
  let runs = 0;
  await oneAtATime("use:b", async () => { runs++; });
  await oneAtATime("use:b", async () => { runs++; });
  assert.equal(runs, 2);
});

test("different keys do not hold each other up", async () => {
  const g = gate();
  const first = oneAtATime("light:one", () => g.wait);
  const other = await oneAtATime("light:two", async () => "ran");
  assert.equal(other, "ran");
  g.release();
  await first;
});

test("a job that throws frees the key and the error reaches the caller", async () => {
  await assert.rejects(oneAtATime("boom", async () => { throw new Error("no"); }), /no/);
  assert.equal(await oneAtATime("boom", async () => "again"), "again");
});

test("a job that is not async also works, and its result comes back", async () => {
  assert.equal(await oneAtATime("plain", () => 7), 7);
});

test("inOrder: clicks wait their turn and each one sees the last one's result", async () => {
  // Two + clicks that read, wait, then write: both must count.
  const state = { value: 0 };
  const plusOne = async () => {
    const read = state.value;
    await new Promise(resolve => setTimeout(resolve, 5));
    state.value = read + 1;
  };
  await Promise.all([inOrder("ability:x", plusOne), inOrder("ability:x", plusOne)]);
  assert.equal(state.value, 2);
});

test("inOrder: the same two clicks without it lose a step (why it exists)", async () => {
  const state = { value: 0 };
  const plusOne = async () => {
    const read = state.value;
    await new Promise(resolve => setTimeout(resolve, 5));
    state.value = read + 1;
  };
  await Promise.all([plusOne(), plusOne()]);
  assert.equal(state.value, 1);
});

test("inOrder: jobs run in the order they were asked", async () => {
  const seen = [];
  await Promise.all([
    inOrder("order", async () => { await new Promise(resolve => setTimeout(resolve, 10)); seen.push(1); }),
    inOrder("order", async () => { seen.push(2); }),
    inOrder("order", async () => { seen.push(3); })
  ]);
  assert.deepEqual(seen, [1, 2, 3]);
});

test("inOrder: a failed job does not stop the next one, and its caller sees the error", async () => {
  const bad = inOrder("fail", async () => { throw new Error("broken"); });
  const good = inOrder("fail", async () => "fine");
  await assert.rejects(bad, /broken/);
  assert.equal(await good, "fine");
});

test("inOrder: different keys run side by side", async () => {
  const g = gate();
  const slow = inOrder("slow", () => g.wait);
  assert.equal(await inOrder("quick", async () => "quick"), "quick");
  g.release();
  await slow;
});
