/**
 * Ability tests in Foundry (rules 3.2 and 3.3).
 *
 * Opens a dialog (DR, Boon, Bane, aid), rolls the dice with Foundry, lets
 * module/rules/test-roll.mjs decide the outcome, and posts a chat card.
 * All the maths lives in the rules file; this file only asks, rolls and shows.
 */

import {
  DR_TABLE, DR_DEFAULT, MODE,
  diceMode, diceFormula, aidModifier, resolveTest
} from "../rules/test-roll.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/ability-test-dialog.hbs";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/test-card.hbs";

/**
 * Ask for the test's options, roll it and post the chat card.
 * @param {Actor} actor     The character making the test.
 * @param {string} ability  One of ABILITIES, such as "strength".
 */
export async function rollAbilityTest(actor, ability) {
  const abilityLabel = game.i18n.localize(`VARBORG.Ability.${ability}`);
  const options = await askTestOptions(abilityLabel);
  if (!options) return;

  const mode = diceMode(options.boon ? 1 : 0, options.bane ? 1 : 0);
  const aid = aidModifier(options.aidSuccesses, options.aidFailures);
  const abilityScore = actor.system.abilities[ability];

  const roll = new Roll(`${diceFormula(mode)} + @ability + @aid`, { ability: abilityScore, aid });
  await roll.evaluate();
  const dice = roll.dice[0].results.map(r => r.result);
  const result = resolveTest({ dice, mode, ability: abilityScore, dr: options.dr, aid });
  if (result.total !== roll.total) {
    console.warn("VÅR BORG | Foundry's total and the rules total differ", roll.total, result);
  }

  const content = await renderTemplate(CARD_TEMPLATE, {
    title: game.i18n.format("VARBORG.Test.CardTitle", { ability: abilityLabel }),
    dice: roll.dice[0].results.map(r => ({ value: r.result, kept: r.active })),
    modeLabel: modeLabel(mode, options),
    kept: result.kept,
    ability: signed(abilityScore),
    abilityLabel,
    aid: aid === 0 ? null : signed(aid),
    total: result.total,
    dr: options.dr,
    tier: result.tier,
    tierLabel: game.i18n.localize(`VARBORG.Tier.${result.tier}`),
    naturalNote: naturalNote(result)
  });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format("VARBORG.Test.CardTitle", { ability: abilityLabel }),
    content
  });
}

/**
 * The test dialog. Returns the chosen options, or null if it was closed.
 * @returns {Promise<{dr: number, boon: boolean, bane: boolean, aidSuccesses: number, aidFailures: number}|null>}
 */
async function askTestOptions(abilityLabel) {
  const content = await renderTemplate(DIALOG_TEMPLATE, {
    drs: DR_TABLE.map(dr => ({
      value: dr,
      label: game.i18n.format("VARBORG.Test.DROption", { dr, name: game.i18n.localize(`VARBORG.DR.${dr}`) }),
      selected: dr === DR_DEFAULT
    }))
  });

  const data = await DialogV2.input({
    window: { title: game.i18n.format("VARBORG.Test.DialogTitle", { ability: abilityLabel }) },
    content,
    ok: { label: "VARBORG.Test.Roll", icon: "fa-solid fa-dice-d20" },
    rejectClose: false
  });
  if (!data) return null;

  return {
    dr: Number(data.dr),
    boon: Boolean(data.boon),
    bane: Boolean(data.bane),
    aidSuccesses: wholeCount(data.aidSuccesses),
    aidFailures: wholeCount(data.aidFailures)
  };
}

/** An empty or odd number field counts as 0. */
function wholeCount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** "+2", "0" or "−1" for the card. */
export function signed(number) {
  if (number > 0) return `+${number}`;
  if (number < 0) return `−${Math.abs(number)}`;
  return "0";
}

/** "Boon", "Bane", "Boon and Bane cancel" or nothing. */
function modeLabel(mode, options) {
  if (mode === MODE.BOON) return game.i18n.localize("VARBORG.Test.Boon");
  if (mode === MODE.BANE) return game.i18n.localize("VARBORG.Test.Bane");
  if (options.boon && options.bane) return game.i18n.localize("VARBORG.Test.Cancelled");
  return null;
}

/** The line explaining a natural 20 or 1, or nothing. */
function naturalNote(result) {
  if (!result.natural) return null;
  const moved = result.tier !== result.baseTier;
  const key = result.natural === 20
    ? (moved ? "Natural20Up" : "Natural20")
    : (moved ? "Natural1Down" : "Natural1");
  return game.i18n.format(`VARBORG.Test.${key}`, {
    from: game.i18n.localize(`VARBORG.Tier.${result.baseTier}`),
    to: game.i18n.localize(`VARBORG.Tier.${result.tier}`)
  });
}
