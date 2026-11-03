/**
 * Ability tests in Foundry (rules 3.2 and 3.3).
 *
 * Opens a dialog (DR, Boon, Bane, aid), rolls the dice with Foundry, lets
 * module/rules/test-roll.mjs decide the outcome, and posts a chat card.
 * Armour and Encumbered are added on their own (module/rules/test-modifiers.mjs),
 * and so is Fatigued (module/rules/conditions.mjs). Situational Bane from
 * other conditions is shown as a reminder (GAPS 75).
 * All the maths lives in the rules files; this file only asks, rolls and shows.
 */

import {
  DR_TABLE, DR_DEFAULT, MODE,
  diceMode, diceFormula, aidModifier, resolveTest
} from "../rules/test-roll.mjs";
import { carrying } from "../rules/carrying.mjs";
import { wornArmour, testModifiers, modifiedDr } from "../rules/test-modifiers.mjs";
import { testConditions, totalModifiers, carryingWithConditions } from "../rules/conditions.mjs";
import { conditionsOf, conditionNotes, reminderNotes } from "../conditions.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/ability-test-dialog.hbs";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/test-card.hbs";

/**
 * Ask for the test's options, roll it and post the chat card.
 * @param {Actor} actor     The character making the test.
 * @param {string} ability  One of ABILITIES, such as "strength".
 * @param {object} [options]
 * @param {number} [options.dr]       The DR the dialog starts at (12 if not given).
 * @param {string} [options.purpose]  What the test is for, shown on the dialog and card.
 * @returns {Promise<object|null>}    The rules result (with its tier), or null if closed.
 */
export async function rollAbilityTest(actor, ability, { dr: startDr = DR_DEFAULT, purpose = null } = {}) {
  const abilityLabel = game.i18n.localize(`VARBORG.Ability.${ability}`);
  const automatic = actorTestModifiers(actor, ability);
  const { conditions, fatigue } = conditionsOf(actor);
  const conditionMods = testConditions(conditions, fatigue);
  const fromConditions = totalModifiers(conditionMods);
  const notes = conditionNotes(conditionMods);
  const options = await askTestOptions(abilityLabel, automatic, notes, reminderNotes(actor, "test"), startDr, purpose);
  if (!options) return null;

  const boons = options.boon ? 1 : 0;
  const banes = (options.bane ? 1 : 0) + (automatic.encumberedBane ? 1 : 0);
  const mode = diceMode(boons, banes);
  const aid = aidModifier(options.aidSuccesses, options.aidFailures);
  const abilityScore = actor.system.abilities[ability];
  const dr = modifiedDr(options.dr, automatic.armourDr + fromConditions.dr);

  const roll = new Roll(`${diceFormula(mode)} + @ability + @aid`, { ability: abilityScore, aid });
  await roll.evaluate();
  const dice = roll.dice[0].results.map(r => r.result);
  const result = resolveTest({ dice, mode, ability: abilityScore, dr, aid });
  if (result.total !== roll.total) {
    console.warn("VÅR BORG | Foundry's total and the rules total differ", roll.total, result);
  }

  const content = await renderTemplate(CARD_TEMPLATE, {
    title: game.i18n.format("VARBORG.Test.CardTitle", { ability: abilityLabel }),
    purpose,
    dice: roll.dice[0].results.map(r => ({ value: r.result, kept: r.active })),
    modeLabel: modeLabel(mode, boons, banes),
    kept: result.kept,
    ability: signed(abilityScore),
    abilityLabel,
    aid: aid === 0 ? null : signed(aid),
    total: result.total,
    dr,
    drNote: automatic.armourDr ? game.i18n.format("VARBORG.Test.ArmourDRNote", {
      dr: options.dr, armour: signed(automatic.armourDr), name: automatic.armourName
    }) : null,
    encumberedNote: automatic.encumberedBane ? game.i18n.localize("VARBORG.Test.EncumberedBane") : null,
    conditionNotes: notes,
    tier: result.tier,
    tierLabel: game.i18n.localize(`VARBORG.Tier.${result.tier}`),
    naturalNote: naturalNote(result)
  });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format("VARBORG.Test.CardTitle", { ability: abilityLabel }),
    content
  });
  return result;
}

/**
 * What the character's worn armour and load do to a test of this ability.
 * The Encumbered condition counts like a heavy load.
 * @param {Actor} actor
 * @param {string} ability
 * @returns {{armourDr: number, armourName: string|null, encumberedBane: boolean}}
 */
export function actorTestModifiers(actor, ability) {
  const items = actor.items.map(item => ({ id: item.id, type: item.type, ...item.system }));
  const armour = wornArmour(items);
  const { state } = carrying(items, actor.system.abilities.toughness);
  const carryingState = carryingWithConditions(actor.statuses, state);
  const modifiers = testModifiers({ ability, armour, carryingState });
  return { ...modifiers, armourName: armour ? actor.items.get(armour.id)?.name ?? null : null };
}

/**
 * The test dialog. Returns the chosen options, or null if it was closed.
 * @param {string} abilityLabel
 * @param {{armourDr: number, armourName: string|null, encumberedBane: boolean}} automatic
 *   The armour and Encumbered modifiers, shown so the player knows they apply.
 * @param {string[]} conditionNotes  Conditions added for you, such as "Fatigued 1: +2 DR".
 * @param {string[]} reminders       Situational Bane for the player to judge.
 * @param {number} startDr            The DR selected when the dialog opens.
 * @param {string|null} purpose       What the test is for, if anything.
 * @returns {Promise<{dr: number, boon: boolean, bane: boolean, aidSuccesses: number, aidFailures: number}|null>}
 */
async function askTestOptions(abilityLabel, automatic, conditionNotes = [], reminders = [], startDr = DR_DEFAULT, purpose = null) {
  const content = await renderTemplate(DIALOG_TEMPLATE, {
    drs: DR_TABLE.map(dr => ({
      value: dr,
      label: game.i18n.format("VARBORG.Test.DROption", { dr, name: game.i18n.localize(`VARBORG.DR.${dr}`) }),
      selected: dr === startDr
    })),
    armourNote: automatic.armourDr ? game.i18n.format("VARBORG.Test.ArmourDialogNote", {
      armour: signed(automatic.armourDr), name: automatic.armourName
    }) : null,
    encumberedNote: automatic.encumberedBane ? game.i18n.localize("VARBORG.Test.EncumberedBane") : null,
    conditionNotes,
    reminders,
    purpose
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
export function wholeCount(value) {
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
export function modeLabel(mode, boons, banes) {
  if (mode === MODE.BOON) return game.i18n.localize("VARBORG.Test.Boon");
  if (mode === MODE.BANE) return game.i18n.localize("VARBORG.Test.Bane");
  if (boons > 0 && banes > 0) return game.i18n.localize("VARBORG.Test.Cancelled");
  return null;
}

/** The line explaining a natural 20 or 1, or nothing. */
export function naturalNote(result) {
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
