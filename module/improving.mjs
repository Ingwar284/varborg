/**
 * Improving in Foundry (rules 2.8, GAPS 16, 111, 179 and 257).
 *
 * The Dark Master decides when a character improves. The Improve button
 * (title bar of the character sheet) is the Dark Master's, and also the
 * owning player's with the "Players can improve" setting on.
 * After asking, it:
 * - fixes max HP, if it still followed X + Toughness (GAPS 111);
 * I.   rolls a d6 for each ability and moves it 1 down or up;
 * II.  rolls the feat (GAPS 257): a d3 for general / ancestry / class (or
 *      the group is chosen, with the "Improving feat group" setting), then
 *      one of that group's feats or powers the character does not have yet.
 *      With the Creation Helper setting on (or nothing left to roll), the
 *      player chooses instead: the sheet says to choose one, and the next
 *      feat dropped on the sheet is marked "Gained through Improving" (only
 *      feats count for Death's Door, GAPS 16). A power dropped in its place
 *      ends the choice without a mark, as do the Skip and Roll a feat buttons;
 * III. rolls 6d10 against max HP and, if it is equal or higher, adds a d6
 *      to max HP and to HP;
 * IV.  rolls the find table and adds the find (GAPS 257): 3d10 s to silver,
 *      a trinket (Trinkets table), a weapon (d10 on the weaponry table), a
 *      relic (Relic table) or a spell tome (a scroll of a random spell).
 * Everything goes on one chat card.
 *
 * The maths lives in module/rules/improving.mjs and module/rules/random.mjs.
 */

import {
  ABILITY_DIE, HP_ROLL, HP_GAIN_DIE, FIND_DIE, FIND_SILVER, FIND_WEAPON_DIE,
  improveAbilities, gainsHp, findResult, findWeapon
} from "./rules/improving.mjs";
import { IMPROVING_GROUPS, improvingCandidates, groupForRoll, pickRandom, uniqueByName, descriptionText } from "./rules/random.mjs";
import { ABILITIES } from "./rules/abilities.mjs";
import { CLASS_BOOST } from "./rules/origins.mjs";
import { canBeImproving } from "./rules/feats.mjs";
import { signed } from "./dice/ability-test.mjs";
import { gatherSources, itemData, equipmentItem } from "./creation.mjs";
import { creationHelperOn, playersImproveOn, improvingGroupChosen } from "./settings.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/improving-card.hbs";

/** The roll tables of the finds (content/tables). */
const TRINKET_TABLE = "Compendium.var-borg.tables.RollTable.vbTableTrinket00";
const RELIC_TABLE = "Compendium.var-borg.tables.RollTable.vbTableRelic0000";

/** The actor flag that says a feat is still to be chosen. */
const PENDING_FLAG = "improvingFeat";

/** Whether this character still has to choose the feat of an Improving. */
export function choosingFeat(actor) {
  return actor?.type === "character" && Boolean(actor.getFlag(SYSTEM, PENDING_FLAG));
}

/** Whether this user may improve this character: the Dark Master, or its owner with the setting on. */
export function canImprove(actor) {
  if (actor?.type !== "character") return false;
  return game.user.isGM || (actor.isOwner && playersImproveOn());
}

/**
 * Ask which group the feat comes from (the "Improving feat group" setting).
 * Only groups with something left are offered.
 * @returns {Promise<string|null>} The group, or null when the dialog was closed.
 */
async function askGroup(actor, groups) {
  const i18n = game.i18n;
  return DialogV2.wait({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.format("VARBORG.Improving.ChooseGroupTitle", { name: actor.name }) },
    content: `<p>${i18n.localize("VARBORG.Improving.ChooseGroup")}</p>`,
    buttons: groups.map((group, index) => ({
      action: group,
      label: `VARBORG.Improving.GroupButton.${group}`,
      default: index === 0
    })),
    rejectClose: false
  });
}

/** Roll a formula, keeping the roll for the card. */
async function rollInto(rolls, formula) {
  const roll = await new Roll(formula).evaluate();
  rolls.push(roll);
  return roll.total;
}

/**
 * II. Roll the feat or power (GAPS 257) and add it to the character.
 * A feat is marked "Gained through Improving".
 * @param {Actor} actor  A character.
 * @param {Roll[]} rolls  The card's rolls; the dice are added to it.
 * @returns {Promise<string[]|null>} Lines for a card, or null when no
 *   group has anything left to gain.
 */
async function rollFeat(actor, rolls) {
  const i18n = game.i18n;
  const sources = await gatherSources();
  const owned = [...actor.itemTypes.feat, ...actor.itemTypes.power].map(item => item.name);
  const character = {
    ancestry: actor.itemTypes.ancestry?.[0]?.name ?? "",
    cls: actor.itemTypes.class?.[0]?.name ?? "",
    owned
  };
  const candidates = Object.fromEntries(IMPROVING_GROUPS.map(group => [group, improvingCandidates(sources, group, character)]));
  const left = IMPROVING_GROUPS.filter(group => candidates[group].length);
  if (!left.length) return null;

  const groupLabel = group => i18n.localize(`VARBORG.Improving.Group.${group}`);
  const lines = [];
  // The group chosen instead of rolled (setting). Closing the dialog rolls it.
  const chosen = improvingGroupChosen() ? await askGroup(actor, left) : null;
  if (chosen && candidates[chosen]?.length) {
    lines.push(i18n.format("VARBORG.Improving.GroupChosen", { group: groupLabel(chosen) }));
    return gainFrom(actor, candidates[chosen], lines);
  }
  const first = await rollInto(rolls, `1d${IMPROVING_GROUPS.length}`);
  let group = groupForRoll(first, IMPROVING_GROUPS);
  if (candidates[group].length) {
    lines.push(i18n.format("VARBORG.Improving.GroupRolled", { die: `d${IMPROVING_GROUPS.length}`, roll: first, group: groupLabel(group) }));
  } else {
    // Nothing left in that group: roll again among the groups that have something.
    const again = left.length > 1 ? await rollInto(rolls, `1d${left.length}`) : 1;
    const emptied = group;
    group = groupForRoll(again, left);
    lines.push(i18n.format("VARBORG.Improving.GroupEmpty", {
      die: `d${IMPROVING_GROUPS.length}`, roll: first, group: groupLabel(emptied), next: groupLabel(group)
    }));
  }
  return gainFrom(actor, candidates[group], lines);
}

/** Add one of the candidates at random, with its card line. */
async function gainFrom(actor, candidates, lines) {
  const i18n = game.i18n;
  const data = await itemData(pickRandom(candidates).uuid);
  if (!data) return null;
  if (data.type === "feat" && canBeImproving(data.system.source)) data.system.improving = true;
  await actor.createEmbeddedDocuments("Item", [data]);
  lines.push(i18n.format(data.type === "feat" ? "VARBORG.Improving.FeatRolled" : "VARBORG.Improving.PowerRolled", { item: data.name }));
  return lines;
}

/**
 * A document drawn from a roll table, following links to other tables
 * (the Relic table's d2 leads to the d12 or d10 + 12 table).
 * @returns {Promise<Document|null>}
 */
async function drawDocument(uuid, rolls) {
  let table = await fromUuid(uuid).catch(() => null);
  for (let depth = 0; table && depth < 3; depth++) {
    const draw = await table.draw({ displayChat: false, recursive: false });
    if (draw.roll) rolls.push(draw.roll);
    const result = draw.results[0];
    const doc = result?.documentUuid ? await fromUuid(result.documentUuid).catch(() => null) : null;
    if (doc?.documentName !== "RollTable") return doc;
    table = doc;
  }
  return null;
}

/** The text of a roll table's text result. */
async function drawText(uuid, rolls) {
  const table = await fromUuid(uuid).catch(() => null);
  if (!table) return null;
  const draw = await table.draw({ displayChat: false });
  if (draw.roll) rolls.push(draw.roll);
  return descriptionText(draw.results[0]?.description || draw.results[0]?.name || "") || null;
}

/**
 * A spell tome as a scroll (GAPS 257): the spell's data on a scroll item,
 * which can be read aloud like a scroll; studying it during Downtime
 * teaches the spell, which is added by hand.
 */
function spellTome(spell) {
  const i18n = game.i18n;
  const fields = CONFIG.Item.dataModels.scroll?.schema?.fields ?? {};
  const system = Object.fromEntries(Object.keys(fields).filter(key => key in spell.system).map(key => [key, spell.system[key]]));
  const note = i18n.format("VARBORG.Improving.Find.TomeNote", { spell: spell.name });
  system.description = `${note}\n${spell.system.description ?? ""}`;
  return {
    name: i18n.format("VARBORG.Improving.Find.TomeName", { spell: spell.name }),
    type: "scroll",
    img: spell.img,
    system
  };
}

/**
 * IV. Add the find to the character (GAPS 257).
 * @returns {Promise<string|null>} A card line, or null for nothing and silver.
 */
async function addFind(actor, find, rolls) {
  const i18n = game.i18n;
  const missing = i18n.localize("VARBORG.Improving.Find.Missing");
  if (find === "trinket") {
    const text = await drawText(TRINKET_TABLE, rolls);
    if (!text) return missing;
    const name = i18n.localize("VARBORG.Improving.Find.TrinketName");
    await actor.createEmbeddedDocuments("Item", [{ name, type: "gear", img: "icons/svg/item-bag.svg", system: { description: text } }]);
    return i18n.format("VARBORG.Improving.Find.TrinketAdded", { text });
  }
  if (find === "weapon") {
    const roll = await rollInto(rolls, FIND_WEAPON_DIE);
    const items = findWeapon(roll).map(equipmentItem);
    await actor.createEmbeddedDocuments("Item", items);
    return i18n.format("VARBORG.Improving.Find.WeaponAdded", { roll, items: items.map(item => item.name).join(", ") });
  }
  if (find === "relic") {
    const relic = await drawDocument(RELIC_TABLE, rolls);
    const data = relic ? await itemData(relic.uuid) : null;
    if (!data) return missing;
    await actor.createEmbeddedDocuments("Item", [data]);
    return i18n.format("VARBORG.Improving.Find.RelicAdded", { name: data.name });
  }
  if (find === "spellTome") {
    const sources = await gatherSources();
    const picked = pickRandom(uniqueByName(sources.filter(s => s.type === "spell")));
    const spell = picked ? await itemData(picked.uuid) : null;
    if (!spell) return missing;
    await actor.createEmbeddedDocuments("Item", [spellTome(spell)]);
    return i18n.format("VARBORG.Improving.Find.TomeAdded", { spell: spell.name });
  }
  return null;
}

/**
 * The Improve button: the Dark Master, or the owner with the setting on; after asking.
 * @param {Actor} actor  A character.
 * @returns {Promise<boolean>} Whether the character improved.
 */
export async function improveCharacter(actor) {
  if (!canImprove(actor)) return false;
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const choosing = creationHelperOn();
  const ok = await DialogV2.confirm({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.format("VARBORG.Improving.AskTitle", { name: actor.name }) },
    content: `<p>${i18n.format(choosing ? "VARBORG.Improving.Ask" : "VARBORG.Improving.AskRandom", { name: esc(actor.name) })}</p>`
  });
  if (!ok) return false;

  const rolls = [];
  const roll = formula => rollInto(rolls, formula);

  // Improving fixes max HP (GAPS 111), before Toughness changes below.
  const fixesHpNow = !actor.system.hpFixed;
  if (fixesHpNow) await actor.update({ "system.hpFixed": true });

  // I. Ability changes, compared with the score in use without Sanity lost (GAPS 179).
  const d6 = {};
  for (const ability of ABILITIES) d6[ability] = await roll(ABILITY_DIE);
  const abilities = improveAbilities(actor.system.rolledAbilities, actor.system.keyAbility, d6, CLASS_BOOST);
  const abilityChanges = Object.fromEntries(abilities.map(a => [`system.abilities.${a.ability}`, a.rolled]));
  await actor.update(abilityChanges);

  // II. The feat: rolled, unless the player chooses (Creation Helper setting, GAPS 257).
  const featLines = choosing ? null : await rollFeat(actor, rolls);

  // III. More HP.
  const maxHp = actor.system.hp.max;
  const hpTotal = await roll(HP_ROLL);
  let hpGain = 0;
  if (gainsHp(hpTotal, maxHp)) {
    hpGain = await roll(HP_GAIN_DIE);
    // Max HP is stored without item effects such as Mountain of Meat (PLAN step 49b).
    const storedMax = actor._source.system.hp.max;
    await actor.update({ "system.hp.max": storedMax + hpGain, "system.hp.value": actor.system.hp.value + hpGain });
  }

  // IV. The find table: silver is added, other finds are rolled and added (GAPS 257).
  const findRoll = await roll(FIND_DIE);
  const find = findResult(findRoll);
  let silver = 0;
  if (find === "silver") {
    silver = await roll(FIND_SILVER);
    await actor.update({ "system.silver": actor.system.silver + silver });
  }
  const findItem = await addFind(actor, find, rolls);

  // II. With nothing rolled, the player chooses the feat afterwards.
  if (!featLines) await actor.setFlag(SYSTEM, PENDING_FLAG, true);

  const title = i18n.format("VARBORG.Improving.Title", { name: actor.name });
  const content = await renderTemplate(CARD_TEMPLATE, {
    title,
    hpFixedNow: fixesHpNow,
    abilities: abilities.map(a => ({
      label: i18n.localize(`VARBORG.Ability.${a.ability}`),
      roll: a.roll,
      from: signed(a.from),
      to: signed(a.to),
      direction: a.to > a.from ? "up" : a.to < a.from ? "down" : "same",
      arrow: a.direction > 0 ? "▲" : "▼"
    })),
    feat: {
      lines: featLines ?? [],
      choose: !featLines,
      chooseLine: i18n.localize(choosing ? "VARBORG.Improving.FeatCard" : "VARBORG.Improving.FeatNone")
    },
    hp: {
      total: hpTotal,
      max: maxHp,
      line: hpGain
        ? i18n.format("VARBORG.Improving.HpGain", { total: hpTotal, max: maxHp, gain: hpGain, newMax: maxHp + hpGain })
        : i18n.format("VARBORG.Improving.HpNone", { total: hpTotal, max: maxHp }),
      gained: hpGain > 0
    },
    find: {
      roll: findRoll,
      line: find === "silver"
        ? i18n.format("VARBORG.Improving.Find.silverRolled", { silver, total: actor.system.silver })
        : i18n.localize(`VARBORG.Improving.Find.${find}`),
      item: findItem
    }
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content,
    rolls,
    sound: CONFIG.sounds.dice
  });
  return true;
}

/**
 * The Roll a feat button, while the player is choosing: roll the feat as
 * Improving does without the setting. The new feat ends the choice by
 * itself (endChoiceWith below) and is marked by markImprovingFeat.
 * @param {Actor} actor  A character choosing an Improving feat.
 */
export async function rollImprovingFeat(actor) {
  if (!actor?.isOwner || !choosingFeat(actor)) return;
  const i18n = game.i18n;
  const rolls = [];
  const lines = await rollFeat(actor, rolls);
  if (!lines) {
    ui.notifications.warn("VARBORG.Improving.FeatNone", { localize: true });
    return;
  }
  const title = i18n.format("VARBORG.Improving.FeatRollTitle", { name: actor.name });
  const content = await renderTemplate("systems/var-borg/templates/chat/origin-card.hbs", { title, lines });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor: title, content, rolls, sound: CONFIG.sounds.dice });
}

/**
 * Called from a feat's _preCreate: while a character is choosing the feat
 * of an Improving, the feat is marked "Gained through Improving".
 * @param {foundry.abstract.TypeDataModel} system  The new feat's system data.
 * @returns {boolean} Whether it was marked.
 */
export function markImprovingFeat(system) {
  const item = system.parent;
  if (!choosingFeat(item.actor) || !canBeImproving(system.source) || system.improving) return false;
  item.updateSource({ "system.improving": true });
  return true;
}

/**
 * Called from a feat's or power's _onCreate: the first feat or power added
 * while choosing ends the choice. The client that added it clears the flag
 * and posts a line.
 * @param {Item} item     The new feat or power.
 * @param {string} userId Who created it.
 */
export async function endChoiceWith(item, userId) {
  const actor = item.actor;
  if (userId !== game.user.id || !choosingFeat(actor)) return;
  // A difficulty feat is never the feat of an Improving (rules 4.6).
  if (item.type === "feat" && !canBeImproving(item.system.source)) return;
  await actor.unsetFlag(SYSTEM, PENDING_FLAG);
  const i18n = game.i18n;
  const key = item.type === "feat" ? "VARBORG.Improving.FeatChosen" : "VARBORG.Improving.PowerChosen";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card improving-card"><p>${i18n.format(key, {
      name: foundry.utils.escapeHTML(actor.name), item: foundry.utils.escapeHTML(item.name)
    })}</p></div>`
  });
}

/** The Skip button: end the choice without adding anything. */
export async function skipFeatChoice(actor) {
  if (!actor?.isOwner || !choosingFeat(actor)) return;
  await actor.unsetFlag(SYSTEM, PENDING_FLAG);
}
