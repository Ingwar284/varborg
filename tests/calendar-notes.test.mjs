/**
 * Tests for notes on calendar days.
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_MAX_LENGTH, cleanNote, cleanNotes, notesFor, daysWithNotes, withNote, withoutNote, findNote
} from "../module/rules/calendar-notes.mjs";

const hidden = { id: "a", text: "The Directorate arrives", shown: false, recurring: false };
const shown = { id: "b", text: "Market day", shown: true, recurring: false };
/** As notesFor gives them back: with the day they are kept under. */
const on = (note, day, repeat = false) => ({ ...note, day, repeat });

test("a note needs an id and some text", () => {
  assert.equal(cleanNote(null), null);
  assert.equal(cleanNote({ id: "a", text: "   " }), null);
  assert.equal(cleanNote({ text: "No id" }), null);
  assert.deepEqual(cleanNote({ id: "a", text: "  Hi  " }), { id: "a", text: "Hi", shown: false, recurring: false });
  assert.equal(cleanNote({ id: "a", text: "x".repeat(NOTE_MAX_LENGTH + 5) }).text.length, NOTE_MAX_LENGTH);
});

test("cleaning drops bad days and empty days", () => {
  assert.deepEqual(cleanNotes(undefined), {});
  assert.deepEqual(cleanNotes({ 0: [hidden], "x": [hidden], 2.5: [hidden], 3: [], 4: [hidden] }), { 4: [hidden] });
});

test("players see only shown notes; the Dark Master sees all", () => {
  const all = { 5: [hidden, shown], 6: [hidden] };
  assert.deepEqual(notesFor(all, 5, true), [on(hidden, 5), on(shown, 5)]);
  assert.deepEqual(notesFor(all, 5, false), [on(shown, 5)]);
  assert.deepEqual(notesFor(all, 7, true), []);
  assert.deepEqual([...daysWithNotes(all, [4, 5, 6, 7], true)], [5, 6]);
  assert.deepEqual([...daysWithNotes(all, [4, 5, 6, 7], false)], [5]);
});

test("adding, changing and removing a note", () => {
  let all = withNote({}, 5, hidden);
  all = withNote(all, 5, shown);
  assert.deepEqual(all[5], [hidden, shown]);
  all = withNote(all, 5, { ...hidden, shown: true });
  assert.equal(all[5][0].shown, true);
  assert.equal(all[5].length, 2);
  assert.deepEqual(findNote(all, 5, "b"), shown);
  assert.equal(findNote(all, 5, "z"), null);
  all = withoutNote(all, 5, "a");
  assert.deepEqual(all[5], [shown]);
  all = withoutNote(all, 5, "b");
  assert.equal(5 in all, false);
  // An empty note is not added.
  assert.deepEqual(withNote({}, 5, { id: "c", text: "" }), {});
});

test("a recurring note comes back every year on the same date, from its own year on", () => {
  const feast = { id: "f", text: "Feast of Lun", shown: true, recurring: true };
  const all = { 310: [feast, hidden] };
  // Year 2, day 10 of Dawning: kept there.
  assert.deepEqual(notesFor(all, 310, true), [on(feast, 310), on(hidden, 310)]);
  // Year 3 and year 5: only the recurring note, as a repeat.
  assert.deepEqual(notesFor(all, 610, true), [on(feast, 310, true)]);
  assert.deepEqual(notesFor(all, 1510, false), [on(feast, 310, true)]);
  // Not in year 1, before it was written, nor on other days.
  assert.deepEqual(notesFor(all, 10, true), []);
  assert.deepEqual(notesFor(all, 611, true), []);
  assert.deepEqual([...daysWithNotes(all, [10, 310, 609, 610], false)], [310, 610]);
});
