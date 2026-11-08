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
 * Everything goes on one chat card, a section per step, with all the dice
 * rolled (step 54e).
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
  gatherSources, itemData, rollInto, removeStarting,
  applyClassWithStarting, rollStartingEquipment
} from "./creation.mjs";
import { rollAllDetails } from "./personality.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** The one card the generator posts. */
const CARD_TEMPLATE = "systems/var-borg/templates/chat/random-character-card.hbs";

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

/** Step 1: 3d6 for each ability, written to the character. Returns the card lines. */
async function rollAbilities(actor, rolls) {
  const i18n = game.i18n;
  const sums = {};
  for (const key of ABILITIES) sums[key] = await rollInto(rolls, ROLL_SUM_FORMULA);
  const scores = scoresFromSums(sums);
  await actor.update(Object.fromEntries(ABILITIES.map(key => [`system.abilities.${key}`, scores[key]])));
  return ABILITIES.map(key => i18n.format("VARBORG.Creation.Abilities.Line", {
    ability: i18n.localize(`VARBORG.Ability.${key}`), sum: sums[key], score: signed(scores[key])
  }));
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
async function rollBackground(sources, rolls) {
  const table = await fromUuid(BACKGROUND_TABLE).catch(() => null);
  if (table) {
    const draw = await table.draw({ displayChat: false });
    const result = draw.results[0];
    const data = result?.documentUuid ? await itemData(result.documentUuid) : null;
    if (data?.type === "background") {
      if (draw.roll) rolls.push(draw.roll);
      return { data, roll: draw.roll?.total ?? null };
    }
  }
  return { data: await randomData(uniqueByName(sources.filter(s => s.type === "background"))), roll: null };
}

/**
 * Roll a whole character (GAPS 256) and post one card.
 * @param {Actor} actor  A character the user may edit.
 * @returns {Promise<boolean>} Whether a character was rolled.
 */
export async function randomCharacter(actor) {
  if (actor?.type !== "character" || !actor.isOwner) return false;
  if (!(await confirmReplace(actor))) return false;
  const i18n = game.i18n;
  const sources = await gatherSources();
  const rolls = [];
  const sections = [];
  const section = key => {
    const entry = { heading: i18n.localize(`VARBORG.Random.Heading.${key}`), lines: [] };
    sections.push(entry);
    return entry.lines;
  };
  const none = type => i18n.format("VARBORG.Random.NoneFound", { type: i18n.localize(`TYPES.Item.${type}`) });

  // 1. Abilities come first: the class's HP uses Toughness.
  section("abilities").push(...await rollAbilities(actor, rolls));

  // 2. Ancestry and its one ancestry feat (rules 2.1, Step 2).
  const ancestryLines = section("ancestry");
  const ancestry = await randomData(uniqueByName(sources.filter(s => s.type === "ancestry")));
  if (ancestry) {
    ancestryLines.push(ancestry.name);
    await addOrigin(actor, ancestry, { lines: ancestryLines, rolls });
    const feat = await randomData(uniqueByName(sources.filter(s =>
      s.type === "feat" && s.source === "ancestry" && belongsTo(s.belongsTo, ancestry.name))));
    if (feat) {
      await removeStarting(actor, "feat", "ancestry");
      await actor.createEmbeddedDocuments("Item", [feat]);
      ancestryLines.push(i18n.format("VARBORG.Creation.Ancestry.FeatTaken", { name: actor.name, feat: feat.name }));
    } else ancestryLines.push(i18n.localize("VARBORG.Random.NoAncestryFeat"));
  } else ancestryLines.push(none("ancestry"));

  // 3. Background: wealth and keepsake (rules 2.4).
  const backgroundLines = section("background");
  const background = await rollBackground(sources, rolls);
  if (background.data) {
    backgroundLines.push(background.roll === null
      ? background.data.name
      : i18n.format("VARBORG.Random.BackgroundRolled", { background: background.data.name, roll: background.roll }));
    await addOrigin(actor, background.data, { lines: backgroundLines, rolls });
  } else backgroundLines.push(none("background"));

  // 4. Class with its feature and power, and one spell (rules 2.1, Step 4).
  const classLines = section("class");
  const cls = await randomData(uniqueByName(sources.filter(s => s.type === "class")));
  if (cls) {
    classLines.push(cls.name, ...await applyClassWithStarting(actor, cls, sources, { rolls }));
    const spells = sources.filter(s => s.type === "spell");
    const learnable = new Set(learnableSpells(
      spells.map(s => ({ spellList: s.spellList, cost: s.cost ?? 0, ritual: s.ritual })), cls.system.spellList));
    const spell = await randomData(uniqueByName(spells.filter((s, index) => learnable.has(index))));
    if (spell) {
      await actor.createEmbeddedDocuments("Item", [spell]);
      classLines.push(i18n.format("VARBORG.Creation.Class.SpellLearned", { name: actor.name, spell: spell.name }));
    }

    // 5. Starting equipment needs the class's die (rules 2.6).
    await rollStartingEquipment(actor, { askAgain: false, collect: { lines: section("equipment"), rolls } });
  } else classLines.push(none("class"));

  // 6. Details (rules 2.7).
  const details = await rollAllDetails(actor, { chat: false });
  const detailLines = section("details");
  for (const [field, key] of [["personality", "Personality"], ["physicalMark", "PhysicalMark"],
    ["idiosyncrasy", "Idiosyncrasy"], ["callToAdventure", "CallToAdventure"]]) {
    if (details[field]) detailLines.push(`${i18n.localize(`VARBORG.Sheet.${key}`)}: ${details[field]}`);
  }

  const title = i18n.format("VARBORG.Random.CardTitle", { name: actor.name });
  const content = await renderTemplate(CARD_TEMPLATE, { title, sections: sections.filter(s => s.lines.length) });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content,
    rolls,
    sound: CONFIG.sounds.dice
  });
  return true;
}
