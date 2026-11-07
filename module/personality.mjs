/**
 * Rolling a character's details on the rules 2.7 tables (GAPS 255):
 * personality traits (2× d100), physical mark, idiosyncrasy and call to
 * adventure (d100 each). The tables are in the Roll Tables compendium
 * (content/tables). Each roll replaces the field and is shown in chat.
 *
 * The plain maths is in module/rules/random.mjs.
 */

import { DETAIL_FIELDS, DETAIL_DRAWS, DETAIL_SEPARATOR, MAX_DETAIL_TRIES, detailText, keepResult } from "./rules/random.mjs";

/** The roll table for each Details field. */
const DETAIL_TABLES = {
  personality: "Compendium.var-borg.tables.RollTable.vbTablePersona00",
  physicalMark: "Compendium.var-borg.tables.RollTable.vbTableMark00000",
  idiosyncrasy: "Compendium.var-borg.tables.RollTable.vbTableIdiosyn00",
  callToAdventure: "Compendium.var-borg.tables.RollTable.vbTableCall00000"
};

/**
 * Roll one Details field on its table and write it to the character.
 * @param {Actor} actor  A character.
 * @param {string} field One of DETAIL_FIELDS.
 * @param {object} [options]
 * @param {boolean} [options.chat=true]  Show each draw in chat.
 * @returns {Promise<string|null>} The new text, or null if nothing was rolled.
 */
export async function rollDetail(actor, field, { chat = true } = {}) {
  if (actor?.type !== "character" || !actor.isOwner || !DETAIL_FIELDS.includes(field)) return null;
  const table = await fromUuid(DETAIL_TABLES[field]).catch(() => null);
  if (!table) {
    ui.notifications.warn("VARBORG.Personality.TableMissing", { localize: true });
    return null;
  }

  // Draw the results first (without chat), so a repeated trait can be rolled again.
  const draws = [];
  const nextText = async () => {
    const draw = await table.draw({ displayChat: false });
    const result = draw.results[0];
    const text = detailText(result?.description || result?.name || "");
    draws.push({ draw, text });
    return text;
  };
  const texts = [];
  for (let tries = 0; texts.length < DETAIL_DRAWS[field] && tries < MAX_DETAIL_TRIES; tries++) {
    const text = await nextText();
    if (keepResult(texts, text)) texts.push(text);
  }
  if (!texts.length) return null;

  const value = texts.join(DETAIL_SEPARATOR);
  await actor.update({ [`system.details.${field}`]: value });

  if (chat) {
    const speaker = ChatMessage.getSpeaker({ actor });
    for (const { draw, text } of draws) {
      if (!texts.includes(text)) continue;
      await table.toMessage(draw.results, { roll: draw.roll, messageData: { speaker } });
    }
  }
  return value;
}

/**
 * Roll all four Details fields.
 * @param {Actor} actor  A character.
 * @param {object} [options]  As for rollDetail.
 * @returns {Promise<Record<string, string|null>>} The new text of each field.
 */
export async function rollAllDetails(actor, options = {}) {
  const values = {};
  for (const field of DETAIL_FIELDS) values[field] = await rollDetail(actor, field, options);
  return values;
}
