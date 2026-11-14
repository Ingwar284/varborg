/**
 * The Scholar's Field journal: a styled journal for Field notes (GAPS 214).
 *
 * When Field notes' Record button records a kind, a "Field notes: <name>"
 * journal gets one Field journal page for that kind, with the creature's
 * picture, its description, the day it was recorded and room for the
 * player's own notes. It is for flavour only: the feat's list stays what
 * the rules read, so editing or losing the journal changes nothing.
 *
 * - The journal belongs to the character's owners. It is found again by a
 *   flag holding the character's id, so renaming it is fine.
 * - A kind already in the journal (same name, any case) is not added twice.
 * - Players usually cannot create journals, so the first time the Dark
 *   Master's Foundry makes the journal and page, through the system socket.
 *   After that the player owns the journal and adds pages themselves.
 * - When a combat ends, every creature the Scholar studied in it with a
 *   Success or Triumph on Study the specimen is recorded by itself: on the
 *   feat and in the journal, with one chat card saying so.
 */

import { currentDay, formatDate } from "./days.mjs";
import { withNotedKind } from "./rules/item-effects.mjs";

const SOCKET = "system.var-borg";
const SYSTEM = "var-borg";
const FLAG = "fieldNotes";
const DEFAULT_IMG = "icons/svg/mystery-man.svg";

/** Listen for the Dark Master's part of the work. */
export function registerFieldJournal() {
  Hooks.once("ready", () => game.socket.on(SOCKET, onSocketMessage));
}

/** The character's Field notes feat: the item with a Record (recordKind) effect. */
export function fieldNotesFeat(actor) {
  return actor?.items?.find(item => (item.system.effects ?? []).some(effect => effect.action === "recordKind")) ?? null;
}

/**
 * Add a kind to the feat's list of noted kinds.
 * @returns {Promise<string|null>} The new list, or null if the feat has no list.
 */
export async function writeKindOnFeat(feat, name) {
  const effects = foundry.utils.deepClone(feat.toObject().system.effects);
  const index = effects.findIndex(entry => entry.kind === "choice" && entry.choose === "text");
  if (index < 0) return null;
  const list = withNotedKind(effects[index].chosen, name);
  if (list !== effects[index].chosen) {
    effects[index].chosen = list;
    effects[index].chosenName = list;
    await feat.update({ "system.effects": effects });
  }
  return list;
}

/**
 * The combat is over: record what each Scholar studied in it. Run by the
 * Dark Master's Foundry, which may change every character and journal.
 * @param {Combat} combat
 */
export async function recordStudied(combat) {
  const i18n = game.i18n;
  const scholars = game.actors.filter(actor => actor.type === "character" && actor.getFlag(SYSTEM, "studied")?.combat === combat.id);
  for (const actor of scholars) {
    const { kinds = [] } = actor.getFlag(SYSTEM, "studied");
    await actor.unsetFlag(SYSTEM, "studied");
    const feat = fieldNotesFeat(actor);
    if (!feat || !kinds.length) continue;
    const lines = [];
    let list = null;
    for (const kind of kinds) {
      list = (await writeKindOnFeat(feat, kind.name)) ?? list;
      const creature = (await fromUuid(kind.uuid).catch(() => null)) ?? game.actors.get(kind.actorId)
        ?? { name: kind.name, img: kind.img, system: {} };
      const line = await addFieldJournalEntry(actor, creature, kind.name);
      if (line) lines.push(line);
    }
    if (list === null) continue;
    lines.unshift(i18n.format("VARBORG.FieldJournal.AutoRecorded", { item: feat.name, kinds: kinds.map(kind => kind.name).join(", "), list }));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: game.users.filter(user => user.isGM || actor.testUserPermission(user, "OWNER")).map(user => user.id),
      content: `<div class="var-borg-card">${lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("")}</div>`
    });
  }
}

/** This character's Field journal, if it has one. */
export function fieldJournalOf(actor) {
  return game.journal.find(journal => journal.getFlag(SYSTEM, FLAG) === actor.id) ?? null;
}

/**
 * Write a page for the recorded creature into the character's Field journal.
 * @param {Actor} actor   The Scholar.
 * @param {Actor} target  The creature recorded.
 * @param {string} [name] The kind's name, if not the creature's own.
 * @returns {Promise<string>} A chat line about it, or "" if nothing was written.
 */
export async function addFieldJournalEntry(actor, target, name = target?.name) {
  const i18n = game.i18n;
  const kind = String(name ?? "").trim();
  if (!kind) return "";
  const journal = fieldJournalOf(actor);
  const existing = journal ? findPage(journal, kind) : null;
  if (existing) return i18n.format("VARBORG.FieldJournal.Already", { link: existing.link });
  const pageData = pageFor(target, kind);

  // The player already owns the journal: add the page themselves.
  if (journal?.isOwner) {
    const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [pageData]);
    return page ? i18n.format("VARBORG.FieldJournal.Written", { link: page.link }) : "";
  }
  // The Dark Master (or anyone allowed to make journals) does it here.
  if (!journal && game.user.can("JOURNAL_CREATE")) {
    const page = await writeEntry(actor, pageData);
    return page ? i18n.format("VARBORG.FieldJournal.Written", { link: page.link }) : "";
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(i18n.localize("VARBORG.FieldJournal.NeedGM"));
    return "";
  }
  game.socket.emit(SOCKET, { action: "fieldJournal", actorUuid: actor.uuid, pageData, userId: game.user.id });
  return i18n.format("VARBORG.FieldJournal.WrittenNew", { name: journalName(actor) });
}

/** The journal's name for this character. */
function journalName(actor) {
  return game.i18n.format("VARBORG.FieldJournal.Name", { name: actor.name });
}

/** The page already written for this kind, if any. */
function findPage(journal, kind) {
  const wanted = kind.toLowerCase();
  return journal.pages.find(page => page.name.trim().toLowerCase() === wanted) ?? null;
}

/** The new page: picture, description, date and an empty Notes section. */
function pageFor(target, kind) {
  const i18n = game.i18n;
  const escape = foundry.utils.escapeHTML;
  const img = target.img && target.img !== DEFAULT_IMG ? target.img : "";
  const description = String(target.system?.description ?? "").trim();
  const body = /<[a-z][\s\S]*>/i.test(description)
    ? description
    : description.split(/\n{2,}/).filter(Boolean).map(text => `<p>${escape(text)}</p>`).join("");
  const parts = [];
  if (img) parts.push(`<figure class="vb-field-specimen"><img src="${escape(img)}" alt="${escape(kind)}"><figcaption>${escape(kind)}</figcaption></figure>`);
  if (body) parts.push(body);
  parts.push(`<h3>${escape(i18n.localize("VARBORG.FieldJournal.Notes"))}</h3>`, "<p></p>");
  return {
    name: kind,
    type: "document",
    system: {
      style: "fieldJournal",
      subtitle: i18n.format("VARBORG.FieldJournal.RecordedOn", { date: formatDate(currentDay()) })
    },
    text: { content: parts.join("") }
  };
}

/** Find or make the journal, then add the page. Run by someone allowed to make journals. */
async function writeEntry(actor, pageData) {
  let journal = fieldJournalOf(actor);
  if (!journal) {
    const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    for (const user of game.users) {
      if (!user.isGM && actor.testUserPermission(user, "OWNER")) ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }
    journal = await JournalEntry.implementation.create({
      name: journalName(actor),
      ownership,
      flags: { [SYSTEM]: { [FLAG]: actor.id } }
    });
  }
  if (!journal || findPage(journal, pageData.name)) return null;
  const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [pageData]);
  return page ?? null;
}

/** The Dark Master's Foundry: make the journal and page for a player who owns the character. */
async function onSocketMessage(message) {
  if (message?.action !== "fieldJournal" || game.user !== game.users.activeGM) return;
  const user = game.users.get(message.userId);
  const actor = await fromUuid(message.actorUuid);
  if (!user || !(actor instanceof foundry.documents.Actor) || !actor.testUserPermission(user, "OWNER")) return;
  const data = message.pageData ?? {};
  const pageData = {
    name: String(data.name ?? "").trim(),
    type: "document",
    system: { style: "fieldJournal", subtitle: String(data.system?.subtitle ?? "") },
    text: { content: String(data.text?.content ?? "") }
  };
  if (!pageData.name) return;
  await writeEntry(actor, pageData);
}
