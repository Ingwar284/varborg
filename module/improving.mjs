/**
 * Improving in Foundry (rules 2.8, GAPS 16, 111 and 179).
 *
 * The Dark Master decides when a character improves, so only the Dark
 * Master sees the Improve button (Feats section of the character sheet).
 * After asking, it:
 * - fixes max HP, if it still followed X + Toughness (GAPS 111);
 * I.   rolls a d6 for each ability and moves it 1 down or up;
 * II.  leaves the feat to the player: the sheet says to choose one, and the
 *      next feat dropped on the sheet is marked "Gained through Improving"
 *      (only feats count for Death's Door, GAPS 16). A power dropped in its
 *      place ends the choice without a mark, as does the Skip button;
 * III. rolls 6d10 against max HP and, if it is equal or higher, adds a d6
 *      to max HP and to HP;
 * IV.  rolls the find table: on a 4 the 3d10 s is added to silver; the
 *      other finds are named on the card for the Dark Master to hand out.
 * Everything goes on one chat card.
 *
 * The maths lives in module/rules/improving.mjs.
 */

import {
  ABILITY_DIE, HP_ROLL, HP_GAIN_DIE, FIND_DIE, FIND_SILVER,
  improveAbilities, gainsHp, findResult
} from "./rules/improving.mjs";
import { ABILITIES } from "./rules/abilities.mjs";
import { CLASS_BOOST } from "./rules/origins.mjs";
import { signed } from "./dice/ability-test.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/improving-card.hbs";

/** The actor flag that says a feat is still to be chosen. */
const PENDING_FLAG = "improvingFeat";

/** Whether this character still has to choose the feat of an Improving. */
export function choosingFeat(actor) {
  return actor?.type === "character" && Boolean(actor.getFlag(SYSTEM, PENDING_FLAG));
}

/**
 * The Improve button: Dark Master only, after asking.
 * @param {Actor} actor  A character.
 * @returns {Promise<boolean>} Whether the character improved.
 */
export async function improveCharacter(actor) {
  if (!game.user.isGM || actor?.type !== "character") return false;
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const ok = await DialogV2.confirm({
    window: { title: i18n.format("VARBORG.Improving.AskTitle", { name: actor.name }) },
    content: `<p>${i18n.format("VARBORG.Improving.Ask", { name: esc(actor.name) })}</p>`
  });
  if (!ok) return false;

  const rolls = [];
  const roll = async formula => {
    const r = await new Roll(formula).evaluate();
    rolls.push(r);
    return r.total;
  };

  // Improving fixes max HP (GAPS 111), before Toughness changes below.
  const fixesHpNow = !actor.system.hpFixed;
  if (fixesHpNow) await actor.update({ "system.hpFixed": true });

  // I. Ability changes, compared with the score in use without Sanity lost (GAPS 179).
  const d6 = {};
  for (const ability of ABILITIES) d6[ability] = await roll(ABILITY_DIE);
  const abilities = improveAbilities(actor.system.rolledAbilities, actor.system.keyAbility, d6, CLASS_BOOST);
  const abilityChanges = Object.fromEntries(abilities.map(a => [`system.abilities.${a.ability}`, a.rolled]));
  await actor.update(abilityChanges);

  // III. More HP.
  const maxHp = actor.system.hp.max;
  const hpTotal = await roll(HP_ROLL);
  let hpGain = 0;
  if (gainsHp(hpTotal, maxHp)) {
    hpGain = await roll(HP_GAIN_DIE);
    await actor.update({ "system.hp.max": maxHp + hpGain, "system.hp.value": actor.system.hp.value + hpGain });
  }

  // IV. The find table; only the silver is added (GAPS 179).
  const findRoll = await roll(FIND_DIE);
  const find = findResult(findRoll);
  let silver = 0;
  if (find === "silver") {
    silver = await roll(FIND_SILVER);
    await actor.update({ "system.silver": actor.system.silver + silver });
  }

  // II. The feat, chosen by the player afterwards.
  await actor.setFlag(SYSTEM, PENDING_FLAG, true);

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
      treasure: ["trinket", "relic", "spellTome"].includes(find)
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
 * Called from a feat's _preCreate: while a character is choosing the feat
 * of an Improving, the feat is marked "Gained through Improving".
 * @param {foundry.abstract.TypeDataModel} system  The new feat's system data.
 * @returns {boolean} Whether it was marked.
 */
export function markImprovingFeat(system) {
  const item = system.parent;
  if (!choosingFeat(item.actor) || system.source === "passive" || system.improving) return false;
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
