/**
 * Dropping a class, ancestry or background on a character sheet (rules 2.1,
 * Steps 2–4). A character has one of each: a new one replaces the old.
 *
 * Class: the boosted ability goes up 1, HP becomes X + Toughness (full),
 * max wounds is set. Replacing or deleting a class takes its +1 back
 * (ClassData._preDelete in module/data/origins.mjs, GAPS 99).
 * Background: its wealth is rolled and added to silver (GAPS 101), and its
 * keepsake becomes a gear item (GAPS 100).
 * Each drop posts a card saying what changed.
 */

import { applyClass, removeClassBoost, wealthFormula, ORIGIN_TYPES } from "./rules/origins.mjs";

const { renderTemplate } = foundry.applications.handlebars;

const CARD_TEMPLATE = "systems/var-borg/templates/chat/origin-card.hbs";

/** Where a class item remembers how much it really raised its ability (0 at +6). */
export const BOOST_FLAG = "classBoost";

/** Is this item type a class, ancestry or background? */
export function isOrigin(type) {
  return ORIGIN_TYPES.includes(type);
}

/** Format a score as the sheet shows it: +1, 0, −2. */
function signed(score) {
  if (score > 0) return `+${score}`;
  return score < 0 ? `−${-score}` : "0";
}

/**
 * Add a class, ancestry or background to a character, replacing the one it
 * already has, and post a card.
 * @param {Actor} actor  A character.
 * @param {object} data  The item data to create (as from Item#toObject).
 * @returns {Promise<Item|null>} The new item.
 */
export async function addOrigin(actor, data) {
  const i18n = game.i18n;
  // Replace the old one. Deleting an old class takes its +1 back first.
  const old = actor.itemTypes[data.type] ?? [];
  if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map(item => item.id));

  const lines = [];
  if (old.length) lines.push(i18n.format("VARBORG.Origin.Replaced", { name: old.map(item => item.name).join(", ") }));

  if (data.type === "class") {
    const result = applyClass(actor.system.abilities, data.system);
    await actor.update({
      "system.abilities": result.abilities,
      "system.hp.max": result.hp,
      "system.hp.value": result.hp,
      "system.wounds.max": result.maxWounds
    });
    foundry.utils.setProperty(data, `flags.var-borg.${BOOST_FLAG}`, result.boost);
    const ability = i18n.localize(`VARBORG.Ability.${data.system.boostedAbility}`);
    lines.push(result.boost
      ? i18n.format("VARBORG.Origin.Boost", { ability, score: signed(result.abilities[data.system.boostedAbility]) })
      : i18n.format("VARBORG.Origin.BoostCapped", { ability }));
    lines.push(i18n.format("VARBORG.Origin.Hp", {
      base: data.system.hpBase, toughness: signed(result.abilities.toughness), hp: result.hp
    }));
    lines.push(i18n.format("VARBORG.Origin.Wounds", { wounds: result.maxWounds }));
    lines.push(i18n.format("VARBORG.Origin.SpellList", {
      list: i18n.localize(`VARBORG.Class.SpellList.${data.system.spellList}`)
    }));
    lines.push(i18n.format("VARBORG.Origin.StartingDie", { die: data.system.startingDie }));
  }

  const [item] = await actor.createEmbeddedDocuments("Item", [data]);

  if (data.type === "background") {
    const keepsake = data.system.keepsake.trim();
    if (keepsake) {
      await actor.createEmbeddedDocuments("Item", [{ name: keepsake, type: "gear", img: "icons/svg/item-bag.svg" }]);
      lines.push(i18n.format("VARBORG.Origin.Keepsake", { name: keepsake }));
    }
    const formula = wealthFormula(data.system.wealth);
    if (formula) {
      const roll = await new Roll(formula).evaluate();
      await actor.update({ "system.silver": actor.system.silver + roll.total });
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: i18n.format("VARBORG.Origin.WealthFlavour", { name: data.name, wealth: data.system.wealth })
      });
      lines.push(i18n.format("VARBORG.Origin.Wealth", { silver: roll.total, total: actor.system.silver }));
    } else {
      lines.push(i18n.localize("VARBORG.Origin.NoWealth"));
    }
  }

  const title = i18n.format(`VARBORG.Origin.Title.${data.type}`, { actor: actor.name, name: data.name });
  const content = await renderTemplate(CARD_TEMPLATE, { title, lines });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor: title, content });
  return item ?? null;
}

/**
 * Take a class's +1 back from its character, just before the class is
 * deleted (GAPS 99). HP and max wounds stay as they are (GAPS 102). A class
 * that was never applied by dropping it has no flag and changes nothing.
 * @param {Item} item  A class item on a character.
 */
export async function undoClassBoost(item) {
  const actor = item.actor;
  const boost = item.getFlag("var-borg", BOOST_FLAG);
  if (actor?.type !== "character" || !boost) return;
  const abilities = removeClassBoost(actor.system.abilities, item.system.boostedAbility, boost);
  await actor.update({ "system.abilities": abilities });
}
