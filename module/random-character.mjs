/**
 * The random character generator (step 54c, GAPS 256): the baseline way
 * to make a character. One button on the character sheet rolls every step
 * of rules 2.1:
 * 1. Abilities: 3d6 for each ability (rules 2.2, Roll individually).
 * 2. Ancestry, each equally likely, and one ancestry feat of that ancestry.
 * 3. Background: d100 on the Backgrounds table (rules 2.4), which rolls
 *    its wealth and adds its keepsake.
 * 4. Class, each equally likely, with its class feature and class power,
 *    and one learnable spell (cost 3 or less, no rituals) if it has a list.
 * 5. Starting equipment (rules 2.6), taking the rolled carrying item.
 * 6. Details: the four rules 2.7 tables.
 * No difficulty feat is taken, and the name is left as it is.
 *
 * Ancestries, classes, feats and spells come from the world's Items and
 * every Item compendium, like the Creation Helper's lists.
 */

import { ROLL_SUM_FORMULA, scoresFromSums, learnableSpells } from "./rules/creation.mjs";
import { ABILITIES } from "./rules/abilities.mjs";
import { belongsTo } from "./rules/feats.mjs";
import { pickRandom, uniqueByName } from "./rules/random.mjs";
import { signed } from "./dice/ability-test.mjs";
import { addOrigin } from "./origins.mjs";
import {
  gatherSources, itemData, postCard, rollInto, removeStarting,
  applyClassWithStarting, rollStartingEquipment
} from "./creation.mjs";
import { rollAllDetails } from "./personality.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const { DialogV2 } = foundry.applications.api;

/** The d100 Backgrounds table (content/tables/backgrounds.json). */
const BACKGROUND_TABLE = "Compendium.var-borg.tables.RollTable.vbTableBackgrnd0";

/** Ask first when the character already has a class, ancestry or background. */
async function confirmReplace(actor) {
  const hasOrigin = ["class", "ancestry", "background"].some(type => actor.itemTypes[type]?.length);
  if (!hasOrigin) return true;
  const i18n = game.i18n;
  return DialogV2.confirm({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.localize("VARBORG.Random.ReplaceTitle") },
    content: `<p>${i18n.format("VARBORG.Random.Replace", { name: foundry.utils.escapeHTML(actor.name) })}</p>`
  });
}

/** Step 1: 3d6 for each ability, written to the character, on one card. */
async function rollAbilities(actor) {
  const i18n = game.i18n;
  const rolls = [];
  const sums = {};
  for (const key of ABILITIES) sums[key] = await rollInto(rolls, ROLL_SUM_FORMULA);
  const scores = scoresFromSums(sums);
  await actor.update(Object.fromEntries(ABILITIES.map(key => [`system.abilities.${key}`, scores[key]])));
  const lines = ABILITIES.map(key => i18n.format("VARBORG.Creation.Abilities.Line", {
    ability: i18n.localize(`VARBORG.Ability.${key}`), sum: sums[key], score: signed(scores[key])
  }));
  await postCard(actor, i18n.format("VARBORG.Creation.Abilities.CardTitle", { name: actor.name }), lines, rolls);
}

/** A random entry of `list` as item data, or null. */
async function randomData(list) {
  const picked = pickRandom(list);
  return picked ? itemData(picked.uuid) : null;
}

/**
 * Step 3: the background from the d100 table. If the table is missing, or
 * its result has no background, one of all backgrounds, each equally likely.
 * @returns {Promise<{data: object|null, roll: number|null}>}
 */
async function rollBackground(sources) {
  const table = await fromUuid(BACKGROUND_TABLE).catch(() => null);
  if (table) {
    const draw = await table.draw({ displayChat: false });
    const result = draw.results[0];
    const data = result?.documentUuid ? await itemData(result.documentUuid) : null;
    if (data?.type === "background") return { data, roll: draw.roll?.total ?? null };
  }
  return { data: await randomData(uniqueByName(sources.filter(s => s.type === "background"))), roll: null };
}

/**
 * Roll a whole character (GAPS 256).
 * @param {Actor} actor  A character the user may edit.
 * @returns {Promise<boolean>} Whether a character was rolled.
 */
export async function randomCharacter(actor) {
  if (actor?.type !== "character" || !actor.isOwner) return false;
  if (!(await confirmReplace(actor))) return false;
  const i18n = game.i18n;
  const sources = await gatherSources();
  const summary = [];
  const none = type => i18n.format("VARBORG.Random.NoneFound", { type: i18n.localize(`TYPES.Item.${type}`) });

  // 1. Abilities come first: the class's HP uses Toughness.
  await rollAbilities(actor);

  // 2. Ancestry and its one ancestry feat (rules 2.1, Step 2).
  const ancestry = await randomData(uniqueByName(sources.filter(s => s.type === "ancestry")));
  if (ancestry) {
    await addOrigin(actor, ancestry);
    const feat = await randomData(uniqueByName(sources.filter(s =>
      s.type === "feat" && s.source === "ancestry" && belongsTo(s.belongsTo, ancestry.name))));
    if (feat) {
      await removeStarting(actor, "feat", "ancestry");
      await actor.createEmbeddedDocuments("Item", [feat]);
    }
    summary.push(feat
      ? i18n.format("VARBORG.Random.AncestryLine", { ancestry: ancestry.name, feat: feat.name })
      : i18n.format("VARBORG.Random.AncestryNoFeat", { ancestry: ancestry.name }));
  } else summary.push(none("ancestry"));

  // 3. Background: wealth and keepsake (rules 2.4).
  const background = await rollBackground(sources);
  if (background.data) {
    await addOrigin(actor, background.data);
    summary.push(background.roll === null
      ? i18n.format("VARBORG.Random.BackgroundLine", { background: background.data.name })
      : i18n.format("VARBORG.Random.BackgroundRolled", { background: background.data.name, roll: background.roll }));
  } else summary.push(none("background"));

  // 4. Class with its feature and power, and one spell (rules 2.1, Step 4).
  const cls = await randomData(uniqueByName(sources.filter(s => s.type === "class")));
  if (cls) {
    const lines = await applyClassWithStarting(actor, cls, sources);
    const spells = sources.filter(s => s.type === "spell");
    const learnable = new Set(learnableSpells(
      spells.map(s => ({ spellList: s.spellList, cost: s.cost ?? 0, ritual: s.ritual })), cls.system.spellList));
    const spell = await randomData(uniqueByName(spells.filter((s, index) => learnable.has(index))));
    if (spell) {
      await actor.createEmbeddedDocuments("Item", [spell]);
      lines.push(i18n.format("VARBORG.Creation.Class.SpellLearned", { name: actor.name, spell: spell.name }));
    }
    await postCard(actor, i18n.format("VARBORG.Creation.Class.CardTitle", { name: actor.name }), lines);
    summary.push(spell
      ? i18n.format("VARBORG.Random.ClassSpellLine", { cls: cls.name, spell: spell.name })
      : i18n.format("VARBORG.Random.ClassLine", { cls: cls.name }));

    // 5. Starting equipment needs the class's die (rules 2.6).
    await rollStartingEquipment(actor, { askAgain: false });
    summary.push(i18n.localize("VARBORG.Random.EquipmentLine"));
  } else summary.push(none("class"));

  // 6. Details (rules 2.7), shown on the summary instead of five more cards.
  const details = await rollAllDetails(actor, { chat: false });
  for (const [field, key] of [["personality", "Personality"], ["physicalMark", "PhysicalMark"],
    ["idiosyncrasy", "Idiosyncrasy"], ["callToAdventure", "CallToAdventure"]]) {
    if (details[field]) summary.push(`${i18n.localize(`VARBORG.Sheet.${key}`)}: ${details[field]}`);
  }

  await postCard(actor, i18n.format("VARBORG.Random.CardTitle", { name: actor.name }), summary);
  return true;
}
