/**
 * Notes on calendar days (the Calendar & Time panel's month grid).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * The Dark Master writes notes on any day, past or future: an event, a
 * deadline, a reminder. Each note is hidden from players unless marked
 * shown. A recurring note comes back every year on the same date, from
 * its own year on. Notes are kept as
 * { [dayNumber]: [{ id, text, shown, recurring }] }, under the day they
 * were written on. They are a table aid only, with no rules effect.
 */

import { DAYS_PER_YEAR } from "./calendar.mjs";

/** Longest note kept, in characters. */
export const NOTE_MAX_LENGTH = 2000;

/**
 * One clean note, or null if it holds nothing.
 * @param {*} note
 * @returns {{id: string, text: string, shown: boolean, recurring: boolean}|null}
 */
export function cleanNote(note) {
  if (!note || typeof note !== "object") return null;
  const id = typeof note.id === "string" ? note.id : "";
  const text = typeof note.text === "string" ? note.text.trim().slice(0, NOTE_MAX_LENGTH) : "";
  if (!id || !text) return null;
  return { id, text, shown: note.shown === true, recurring: note.recurring === true };
}

/**
 * All the notes, cleaned: only whole day numbers, only real notes, no
 * empty days.
 * @param {*} all
 * @returns {Record<string, Array<{id: string, text: string, shown: boolean}>>}
 */
export function cleanNotes(all) {
  const clean = {};
  if (!all || typeof all !== "object") return clean;
  for (const [key, notes] of Object.entries(all)) {
    const day = Number(key);
    if (!Number.isInteger(day) || day < 1 || !Array.isArray(notes)) continue;
    const kept = notes.map(cleanNote).filter(Boolean);
    if (kept.length) clean[day] = kept;
  }
  return clean;
}

/**
 * A day's notes that this viewer may see: all for the Dark Master, only
 * the shown ones for players. The day's own notes come first, then
 * recurring notes from the same date in earlier years. Each note says the
 * day it is kept under (`day`) and whether it is a repeat here.
 * @param {object} all
 * @param {number} day
 * @param {boolean} isGM
 * @returns {Array<{id: string, text: string, shown: boolean, recurring: boolean, day: number, repeat: boolean}>}
 */
export function notesFor(all, day, isGM) {
  const clean = cleanNotes(all);
  const found = (clean[day] ?? []).map(note => ({ ...note, day, repeat: false }));
  for (let earlier = day - DAYS_PER_YEAR; earlier >= 1; earlier -= DAYS_PER_YEAR) {
    for (const note of clean[earlier] ?? []) {
      if (note.recurring) found.push({ ...note, day: earlier, repeat: true });
    }
  }
  return isGM ? found : found.filter(note => note.shown);
}

/**
 * Which of some days have notes this viewer may see.
 * @param {object} all
 * @param {number[]} days
 * @param {boolean} isGM
 * @returns {Set<number>}
 */
export function daysWithNotes(all, days, isGM) {
  const clean = cleanNotes(all);
  return new Set(days.filter(day => notesFor(clean, day, isGM).length));
}

/**
 * The notes with one note added to a day (or, with the same id, changed).
 * @param {object} all
 * @param {number} day
 * @param {{id: string, text: string, shown?: boolean}} note
 */
export function withNote(all, day, note) {
  const clean = cleanNotes(all);
  const kept = cleanNote(note);
  if (!kept || !Number.isInteger(day) || day < 1) return clean;
  const notes = clean[day] ?? [];
  const index = notes.findIndex(other => other.id === kept.id);
  clean[day] = index >= 0 ? notes.map((other, i) => (i === index ? kept : other)) : [...notes, kept];
  return clean;
}

/**
 * The notes without one note.
 * @param {object} all
 * @param {number} day
 * @param {string} id
 */
export function withoutNote(all, day, id) {
  const clean = cleanNotes(all);
  const notes = (clean[day] ?? []).filter(note => note.id !== id);
  if (notes.length) clean[day] = notes;
  else delete clean[day];
  return clean;
}

/**
 * One note on a day, or null.
 * @param {object} all
 * @param {number} day
 * @param {string} id
 */
export function findNote(all, day, id) {
  return (cleanNotes(all)[day] ?? []).find(note => note.id === id) ?? null;
}
