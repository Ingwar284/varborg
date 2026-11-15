/**
 * Tests for the day log (each day's weather and Misery).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanEntry, cleanLog, logEntry, sameEntry, withEntry } from "../module/rules/day-log.mjs";

test("an entry from today's weather and Misery", () => {
  assert.deepEqual(logEntry({ hex: "0,0", hazard: "blackburn" }, { level: 2 }),
    { weather: "0,0", hazard: "blackburn", misery: 2 });
  // With the Weather subsystem off, no weather.
  assert.deepEqual(logEntry(null, { level: 0 }), { weather: null, hazard: null, misery: 0 });
});

test("cleaning entries and the log", () => {
  assert.equal(cleanEntry(null), null);
  assert.deepEqual(cleanEntry({ hazard: "x", misery: -1 }), { weather: null, hazard: null, misery: 0 });
  assert.deepEqual(cleanLog({ 0: {}, "x": {}, 3: { weather: "1,0", misery: 1 } }),
    { 3: { weather: "1,0", hazard: null, misery: 1 } });
});

test("setting a day's entry, and telling entries apart", () => {
  const a = logEntry({ hex: "0,0", hazard: null }, { level: 1 });
  const b = logEntry({ hex: "0,0", hazard: null }, { level: 2 });
  assert.ok(sameEntry(a, { ...a }));
  assert.ok(!sameEntry(a, b));
  assert.ok(!sameEntry(a, undefined));
  let log = withEntry({}, 4, a);
  log = withEntry(log, 5, b);
  log = withEntry(log, 4, b);
  assert.deepEqual(log, { 4: b, 5: b });
  assert.deepEqual(withEntry({}, 0, a), {});
});
