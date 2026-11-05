/**
 * Ability tests in Foundry (rules 3.2 and 3.3).
 *
 * Opens a dialog (DR, Boon, Bane, aid), rolls the dice with Foundry, lets
 * module/rules/test-roll.mjs decide the outcome, and posts a chat card.
 * Armour and Encumbered are added on their own (module/rules/test-modifiers.mjs),
 * and so is Fatigued (module/rules/conditions.mjs). Situational Bane from
 * other conditions is shown as a reminder (GAPS 75). The Panic results
 * Adrenaline Rush and Rattled give Boon or Bane and are then used up
 * (GAPS 80). Injuries from the Table of Agony count too (GAPS 88).
 * Fortune (rule 3.9): the dialog can buy a Boon or Bane, and a test from
 * the sheet gets Fortune buttons on its card (module/fortune.mjs). Tests
 * that other features start (Panic, wounds...) do not, because what they
 * did with the result cannot be taken back yet (GAPS 107).
 * All the maths lives in the rules files; this file only asks, rolls and shows.
 */

import {
  DR_TABLE, DR_DEFAULT, MODE,
  diceMode, diceFormula, aidModifier, resolveTest
} from "../rules/test-roll.mjs";
import { carrying } from "../rules/carrying.mjs";
import { wornArmour, testModifiers, modifiedDr } from "../rules/test-modifiers.mjs";
import { testConditions, totalModifiers, carryingWithConditions } from "../rules/conditions.mjs";
import { CARD, softenTier } from "../rules/fortune.mjs";
import { conditionsOf, conditionNotes, reminderNotes } from "../conditions.mjs";
import { useUpNextTest } from "../panic.mjs";
import { newFortuneData, fortuneFlags, fortuneSection, fortuneFields, payDialogFortune } from "../fortune.mjs";
import { itemRollMods, itemReminderNotes, itemOptionalMods, optionalEffectsField, tickedMods } from "../effects.mjs";

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
 * @param {boolean} [options.fortune] Put Fortune buttons on the card (tests from the sheet).
 * @param {boolean} [options.boon]    Start with the Boon box ticked (such as a driving Triumph's Boon).
 * @param {boolean} [options.bane]    Start with the Bane box ticked (such as an Encumbered vehicle's driving test).
 * @param {string} [options.kind]     The feature's own kind of roll for item effects, such as "panic" or "driving" (PLAN step 49c).
 * @returns {Promise<object|null>}    The rules result (with its tier), or null if closed.
 */
export async function rollAbilityTest(actor, ability, { dr: startDr = DR_DEFAULT, purpose = null, fortune = false, boon = false, bane = false, kind = null } = {}) {
  const abilityLabel = game.i18n.localize(`VARBORG.Ability.${ability}`);
  const automatic = actorTestModifiers(actor, ability);
  const { conditions, fatigue } = conditionsOf(actor);
  // Item effects count like conditions (PLAN step 49c).
  const effectContext = { roll: kind ? ["test", kind] : "test", ability };
  const conditionMods = [...testConditions(conditions, fatigue, ability), ...itemRollMods(actor, effectContext)];
  const reminders = [...reminderNotes(actor, "test"), ...itemReminderNotes(actor, effectContext)];
  // Item effects for the player to tick when they apply (PLAN step 49d).
  const optional = itemOptionalMods(actor, effectContext);
  const options = await askTestOptions(actor, abilityLabel, automatic, conditionNotes(conditionMods), reminders, startDr, purpose, boon, bane,
    await optionalEffectsField(optional));
  if (!options) return null;
  const allMods = [...conditionMods, ...tickedMods(optional, options.data)];
  const fromConditions = totalModifiers(allMods);
  const notes = conditionNotes(allMods);
  // A Boon or Bane bought with Fortune is paid before rolling (rule 3.9).
  const paid = await payDialogFortune(actor, options.data);
  if (!paid) return null;

  const boons = (options.boon ? 1 : 0) + (paid.boon ? 1 : 0) + fromConditions.boons;
  const banes = (options.bane ? 1 : 0) + (paid.bane ? 1 : 0) + (automatic.encumberedBane ? 1 : 0) + fromConditions.banes;
  const mode = diceMode(boons, banes);
  const aid = aidModifier(options.aidSuccesses, options.aidFailures);
  const abilityScore = actor.system.abilities[ability];
  const dr = modifiedDr(options.dr, automatic.armourDr + fromConditions.dr);
  const title = game.i18n.format("VARBORG.Test.CardTitle", { ability: abilityLabel });

  // Everything the card needs that Fortune cannot change.
  const inputs = {
    formula: `${diceFormula(mode)} + @ability + @aid`,
    rollData: { ability: abilityScore, aid },
    mode, abilityScore, aid, dr,
    context: {
      title,
      purpose,
      modeLabel: modeLabel(mode, boons, banes),
      ability: signed(abilityScore),
      abilityLabel,
      aid: aid === 0 ? null : signed(aid),
      drNote: automatic.armourDr ? game.i18n.format("VARBORG.Test.ArmourDRNote", {
        dr: options.dr, armour: signed(automatic.armourDr), name: automatic.armourName
      }) : null,
      encumberedNote: automatic.encumberedBane ? game.i18n.localize("VARBORG.Test.EncumberedBane") : null,
      conditionNotes: [...notes, paid.note].filter(Boolean)
    }
  };

  const roll = await new Roll(inputs.formula, inputs.rollData).evaluate();
  const data = newFortuneData(CARD.TEST, actor, inputs, { dice: diceOf(roll) });
  const { content, result } = await renderTestCard(data, fortune);

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content,
    flags: fortune ? fortuneFlags(data) : {}
  });
  await useUpNextTest(actor);
  return result;
}

/**
 * Work a test card out again after Fortune was burned on it: new dice for a
 * reroll, or the same dice with a softened tier. A plain test changes
 * nothing else. Registered with module/fortune.mjs.
 * @returns {Promise<{content: string, rolls: Roll[]}>}
 */
export async function settleTestCard(actor, data) {
  const rolls = [];
  if (!data.state.dice) {
    const roll = await new Roll(data.inputs.formula, data.inputs.rollData).evaluate();
    rolls.push(roll);
    data.state.dice = diceOf(roll);
  }
  const { content } = await renderTestCard(data, true);
  return { content, rolls };
}

/**
 * The test card from its stored inputs and dice.
 * @returns {Promise<{content: string, result: object}>} result.tier is the final tier.
 */
async function renderTestCard(data, withFortune) {
  const { inputs, state } = data;
  const rules = resolveTest({
    dice: state.dice.map(die => die.value), mode: inputs.mode, ability: inputs.abilityScore, dr: inputs.dr, aid: inputs.aid
  });
  const result = { ...rules, tier: fortuneTier(rules.tier, state.softened) };
  state.tier = result.tier;
  const content = await renderTemplate(CARD_TEMPLATE, {
    ...inputs.context,
    dice: state.dice,
    kept: result.kept,
    total: result.total,
    dr: inputs.dr,
    tier: result.tier,
    tierLabel: game.i18n.localize(`VARBORG.Tier.${result.tier}`),
    naturalNote: naturalNote(rules),
    fortune: withFortune ? await fortuneSection(data, { tier: result.tier }) : null
  });
  return { content, result };
}

/** The d20s as the card shows them: each value, and whether it was kept. */
export function diceOf(roll) {
  return roll.dice[0].results.map(r => ({ value: r.result, kept: r.active }));
}

/** The tier after Fortune: Triumph → Success, Ruin → Failure when softened. */
export function fortuneTier(tier, softened) {
  return softened ? softenTier(tier) ?? tier : tier;
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
  const { state } = carrying(items, actor.system.abilities.toughness, actor.system.statBonuses);
  const carryingState = carryingWithConditions(actor.statuses, state);
  const modifiers = testModifiers({ ability, armour, carryingState });
  return { ...modifiers, armourName: armour ? actor.items.get(armour.id)?.name ?? null : null };
}

/**
 * The test dialog. Returns the chosen options, or null if it was closed.
 * @param {Actor} actor               The character, for its Fortune.
 * @param {string} abilityLabel
 * @param {{armourDr: number, armourName: string|null, encumberedBane: boolean}} automatic
 *   The armour and Encumbered modifiers, shown so the player knows they apply.
 * @param {string[]} conditionNotes  Conditions added for you, such as "Fatigued 1: +2 DR".
 * @param {string[]} reminders       Situational Bane for the player to judge.
 * @param {number} startDr            The DR selected when the dialog opens.
 * @param {string|null} purpose       What the test is for, if anything.
 * @param {boolean} boon              Start with Boon ticked.
 * @param {boolean} bane              Start with Bane ticked.
 * @param {string} optionalEffects   The item effects' boxes (optionalEffectsField), or "".
 * @returns {Promise<{dr: number, boon: boolean, bane: boolean, aidSuccesses: number, aidFailures: number, data: object}|null>}
 *   data is the whole form, for the Fortune boxes.
 */
async function askTestOptions(actor, abilityLabel, automatic, conditionNotes = [], reminders = [], startDr = DR_DEFAULT, purpose = null, boon = false, bane = false, optionalEffects = "") {
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
    optionalEffects,
    purpose,
    boon,
    bane,
    fortuneFields: await fortuneFields(actor, "test")
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
    aidFailures: wholeCount(data.aidFailures),
    data
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
