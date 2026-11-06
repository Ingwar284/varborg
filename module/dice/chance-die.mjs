/**
 * The Chance Die in Foundry (rule 3.2).
 *
 * Rolls 2d6 + the character's Fortune, lets module/rules/chance-die.mjs name
 * the outcome, and posts a chat card. No dialog: there is nothing to choose.
 */

import { CHANCE_FORMULA, resolveChance, chanceOutcome } from "../rules/chance-die.mjs";
import { chanceWithSplit } from "../rules/item-effects.mjs";

const { renderTemplate } = foundry.applications.handlebars;

const CARD_TEMPLATE = "systems/var-borg/templates/chat/chance-card.hbs";

/**
 * Roll the Chance Die for a character and post the chat card.
 * @param {Actor} actor  The character rolling.
 */
export async function rollChanceDie(actor) {
  const fortune = Math.max(0, actor.system.fortune ?? 0);
  const roll = new Roll(`${CHANCE_FORMULA} + @fortune`, { fortune });
  await roll.evaluate();
  const dice = roll.dice[0].results.map(r => r.result);
  const result = resolveChance({ dice, fortune });
  // Go Big or Go Home: no Neutral, 8 or more is Positive (step 50b2).
  const split = actor.system.statBonuses?.chanceSplit;
  result.outcome = chanceWithSplit(result.total, split, chanceOutcome);
  const splitNote = split?.set > 0
    ? game.i18n.format("VARBORG.Chance.SplitNote", { item: split.sources.map(source => source.item).join(", "), split: split.set })
    : null;
  if (result.total !== roll.total) {
    console.warn("VÅR BORG | Foundry's total and the rules total differ", roll.total, result);
  }

  const content = await renderTemplate(CARD_TEMPLATE, {
    title: game.i18n.localize("VARBORG.Chance.CardTitle"),
    dice,
    fortune,
    total: result.total,
    outcome: result.outcome,
    outcomeLabel: game.i18n.localize(`VARBORG.Chance.${result.outcome}`),
    splitNote
  });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.localize("VARBORG.Chance.CardTitle"),
    content
  });
}
