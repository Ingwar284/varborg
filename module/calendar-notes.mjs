/**
 * Notes on calendar days in Foundry (the Calendar & Time panel).
 *
 * The notes are a world setting, so everyone's panel redraws when they
 * change. Only the Dark Master adds, edits, shows, hides and deletes them.
 * Players see only the notes marked shown. A table aid, with no rules
 * effect.
 *
 * The maths lives in module/rules/calendar-notes.mjs.
 */

import { cleanNotes, notesFor, daysWithNotes, withNote, withoutNote, findNote } from "./rules/calendar-notes.mjs";
import { formatDate, weekdayName } from "./days.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";
const SETTING = "calendarNotes";

/**
 * Register the notes setting.
 * @param {Function} onChange  Redraws the Calendar & Time panel.
 */
export function registerCalendarNotes(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange
  });
}

function allNotes() {
  return cleanNotes(game.settings.get(SYSTEM, SETTING));
}

async function saveNotes(all) {
  await game.settings.set(SYSTEM, SETTING, cleanNotes(all));
}

/** A day's notes that this user may see. */
export function visibleNotes(day) {
  return notesFor(allNotes(), day, game.user.isGM);
}

/**
 * Which of some days have notes this user may see.
 * @param {number[]} days
 */
export function visibleNoteDays(days) {
  return daysWithNotes(allNotes(), days, game.user.isGM);
}

/**
 * Dark Master only: write a new note on a day, or change one.
 * @param {number} day   The day it is kept under (for a recurring note, the day it was written on).
 * @param {string} [id]  The note to change; none for a new note.
 * @returns {Promise<boolean>}  Whether a note was saved.
 */
export async function editNote(day, id) {
  if (!game.user.isGM) return false;
  const i18n = game.i18n;
  const before = id ? findNote(allNotes(), day, id) : null;
  if (id && !before) return false;
  const text = foundry.utils.escapeHTML(before?.text ?? "");
  const content = `<p class="hint">${i18n.format("VARBORG.Calendar.NoteFor", { date: `${weekdayName(day)}, ${formatDate(day)}` })}</p>`
    + `<textarea name="text" rows="5" autofocus>${text}</textarea>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Calendar.NoteShownLabel")}</label>`
    + `<input type="checkbox" name="shown" ${before?.shown ? "checked" : ""}></div>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Calendar.NoteRecurringLabel")}</label>`
    + `<input type="checkbox" name="recurring" ${before?.recurring ? "checked" : ""}></div>`
    + `<p class="hint">${i18n.localize("VARBORG.Calendar.NoteRecurringHint")}</p>`;
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: before ? "VARBORG.Calendar.NoteEditTitle" : "VARBORG.Calendar.NoteAddTitle", icon: "fa-solid fa-note-sticky" },
    position: { width: 400 },
    content,
    ok: { label: "VARBORG.Calendar.NoteSave", icon: "fa-solid fa-check" },
    rejectClose: false
  });
  if (!data) return false;
  if (!String(data.text ?? "").trim()) {
    ui.notifications.warn("VARBORG.Calendar.NoteEmpty", { localize: true });
    return false;
  }
  await saveNotes(withNote(allNotes(), day, {
    id: before?.id ?? foundry.utils.randomID(),
    text: String(data.text),
    shown: !!data.shown,
    recurring: !!data.recurring
  }));
  return true;
}

/**
 * Dark Master only: show a note to players, or hide it.
 * @param {number} day
 * @param {string} id
 */
export async function toggleNoteShown(day, id) {
  if (!game.user.isGM) return;
  const note = findNote(allNotes(), day, id);
  if (note) await saveNotes(withNote(allNotes(), day, { ...note, shown: !note.shown }));
}

/**
 * Dark Master only: delete a note, after asking.
 * @param {number} day
 * @param {string} id
 */
export async function deleteNote(day, id) {
  if (!game.user.isGM || !findNote(allNotes(), day, id)) return;
  const sure = await DialogV2.confirm({
    classes: VB_DIALOG_CLASSES,
    window: { title: "VARBORG.Calendar.NoteDeleteTitle", icon: "fa-solid fa-trash" },
    content: `<p>${game.i18n.localize("VARBORG.Calendar.NoteDeleteConfirm")}</p>`,
    rejectClose: false
  });
  if (sure) await saveNotes(withoutNote(allNotes(), day, id));
}
