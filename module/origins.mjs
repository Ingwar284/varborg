/**
 * Dropping a class, ancestry or background on a character sheet (rules 2.1,
 * Steps 2–4). A character has one of each: a new one replaces the old.
 *
 * Class: HP becomes X + Toughness (full) and max wounds is set. The boosted
 * ability's +1 is not written into the scores: it is added on top while the
 * class is on the character (CharacterData.prepareDerivedData), so replacing
 * or deleting a class takes it away by itself (GAPS 99, 111).
 * Background: its wealth is rolled and added to silver (GAPS 101), and its
 * keepsake becomes a gear item (GAPS 100).
 * Each drop posts a card saying what changed.
 */

import { applyClass, wealthFormula, ORIGIN_TYPES } from "./rules/origins.mjs";

const { renderTemplate } = foundry.applications.handlebars;

const CARD_TEMPLATE = "systems/var-borg/templates/chat/origin-card.hbs";

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
 * @param {object} [collect]  Give arrays here to collect the card's lines
 *   and the wealth roll instead of posting them (the random character
 *   generator puts everything on one card).
 * @param {string[]} [collect.lines]
 * @param {Roll[]} [collect.rolls]
 * @returns {Promise<Item|null>} The new item.
 */
export async function addOrigin(actor, data, collect = null) {
  const i18n = game.i18n;
  // Replace the old one. An old class's +1 goes with it.
  const old = actor.itemTypes[data.type] ?? [];
  if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map(item => item.id));

  const lines = [];
  if (old.length) lines.push(i18n.format("VARBORG.Origin.Replaced", { name: old.map(item => item.name).join(", ") }));

  if (data.type === "class") {
    const result = applyClass(actor.system.rolledAbilities, data.system);
    await actor.update({
      "system.hp.max": result.hp,
      "system.hp.value": result.hp,
      "system.wounds.max": result.maxWounds
    });
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
    const fixed = data.system.startingWeapons ?? [];
    lines.push(fixed.length
      ? i18n.format("VARBORG.Origin.StartingDieFixed", {
        die: data.system.startingDie,
        weapons: fixed.map(key => i18n.localize(`VARBORG.Creation.Item.${key}`)).join(", ")
      })
      : i18n.format("VARBORG.Origin.StartingDie", { die: data.system.startingDie }));
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
      if (collect) collect.rolls?.push(roll);
      else await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: i18n.format("VARBORG.Origin.WealthFlavour", { name: data.name, wealth: data.system.wealth })
      });
      lines.push(i18n.format("VARBORG.Origin.Wealth", { silver: roll.total, total: actor.system.silver }));
    } else {
      lines.push(i18n.localize("VARBORG.Origin.NoWealth"));
    }
  }

  if (collect) {
    collect.lines?.push(...lines);
    return item ?? null;
  }
  const title = i18n.format(`VARBORG.Origin.Title.${data.type}`, { actor: actor.name, name: data.name });
  const content = await renderTemplate(CARD_TEMPLATE, { title, lines });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor: title, content });
  return item ?? null;
}
