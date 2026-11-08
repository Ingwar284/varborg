/**
 * Random names (GAPS 258): a given name and a family name rolled on the
 * ancestry's two d20 name tables in the Roll Tables compendium
 * (content/tables/names-*.json). The tables were drafted for the system,
 * not taken from the rules, and the Dark Master may change them.
 *
 * The plain maths is in module/rules/random.mjs.
 */

import { nameTableIds, joinName, plainText } from "./rules/random.mjs";

/** Draw one table's text, keeping its roll. */
async function drawPart(id, rolls) {
  const table = await fromUuid(`Compendium.var-borg.tables.RollTable.${id}`).catch(() => null);
  if (!table) return "";
  const draw = await table.draw({ displayChat: false });
  if (draw.roll) rolls.push(draw.roll);
  return plainText(draw.results[0]?.description || draw.results[0]?.name || "");
}

/**
 * Roll a name for an ancestry.
 * @param {string} ancestry  The ancestry's name (another ancestry uses human names).
 * @param {Roll[]} [rolls]   The rolls are added here, for a card.
 * @returns {Promise<string>} The name, or "" if the tables are missing.
 */
export async function rollName(ancestry, rolls = []) {
  const ids = nameTableIds(ancestry);
  return joinName(await drawPart(ids.given, rolls), await drawPart(ids.family, rolls));
}
