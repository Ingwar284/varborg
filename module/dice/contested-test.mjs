/**
 * Contested tests in Foundry (rule 3.3, GAPS 10 and 33).
 *
 * Opens a dialog (your ability, Boon, Bane, and the opponent: a foe rolling a
 * plain d20, or another character with an ability), rolls both sides with
 * Foundry, lets module/rules/contested.mjs pick the winner, and posts one
 * chat card. All the maths lives in the rules file.
 */

import { ABILITIES } from "../rules/abilities.mjs";
import { MODE, diceMode, diceFormula } from "../rules/test-roll.mjs";
import { WINNER, resolveContest } from "../rules/contested.mjs";
import { signed } from "./ability-test.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/contested-test-dialog.hbs";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/contested-card.hbs";

/** The opponent choice for "a foe rolling a plain d20". */
const FOE = "foe";

/**
 * Ask for the contest's options, roll both sides and post the chat card.
 * @param {Actor} actor  The character starting the contest.
 */
export async function rollContestedTest(actor) {
  const options = await askContestOptions(actor);
  if (!options) return;

  const opponentActor = options.opponent === FOE ? null : game.actors.get(options.opponent);
  const opponentName = opponentActor?.name
    ?? (options.foeName || game.i18n.localize("VARBORG.Contest.FoeDefaultName"));

  const first = {
    name: actor.name,
    abilityKey: options.ability,
    ability: actor.system.abilities[options.ability],
    mode: diceMode(options.boon ? 1 : 0, options.bane ? 1 : 0),
    cancelled: options.boon && options.bane
  };
  // A foe rolls its d20 plain and adds nothing (GAPS 33).
  const second = opponentActor
    ? {
      name: opponentName,
      abilityKey: options.opponentAbility,
      ability: opponentActor.system.abilities[options.opponentAbility],
      mode: diceMode(options.opponentBoon ? 1 : 0, options.opponentBane ? 1 : 0),
      cancelled: options.opponentBoon && options.opponentBane
    }
    : { name: opponentName, abilityKey: null, ability: 0, mode: MODE.NORMAL, cancelled: false };

  const firstRoll = await rollSide(first);
  const secondRoll = await rollSide(second);
  const result = resolveContest(
    { dice: diceOf(firstRoll), mode: first.mode, ability: first.ability },
    { dice: diceOf(secondRoll), mode: second.mode, ability: second.ability }
  );

  const winnerName = result.winner === WINNER.FIRST ? first.name
    : result.winner === WINNER.SECOND ? second.name
    : null;

  const content = await renderTemplate(CARD_TEMPLATE, {
    title: game.i18n.localize("VARBORG.Contest.CardTitle"),
    sides: [
      cardSide(first, firstRoll, result.first, result.winner === WINNER.FIRST),
      cardSide(second, secondRoll, result.second, result.winner === WINNER.SECOND)
    ],
    tie: result.winner === WINNER.TIE,
    verdict: winnerName
      ? game.i18n.format("VARBORG.Contest.Wins", { name: winnerName })
      : game.i18n.localize("VARBORG.Contest.Tie")
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.localize("VARBORG.Contest.CardTitle"),
    content,
    rolls: [firstRoll, secondRoll],
    sound: CONFIG.sounds.dice
  });
}

/** Roll one side's d20 (or two, for Boon or Bane) plus its ability. */
async function rollSide(side) {
  const roll = new Roll(`${diceFormula(side.mode)} + @ability`, { ability: side.ability });
  await roll.evaluate();
  return roll;
}

/** The d20 results of a roll. */
function diceOf(roll) {
  return roll.dice[0].results.map(r => r.result);
}

/** What the card shows for one side. */
function cardSide(side, roll, result, won) {
  return {
    name: side.name,
    won,
    dice: roll.dice[0].results.map(r => ({ value: r.result, kept: r.active })),
    modeLabel: side.mode === MODE.BOON ? game.i18n.localize("VARBORG.Test.Boon")
      : side.mode === MODE.BANE ? game.i18n.localize("VARBORG.Test.Bane")
      : side.cancelled ? game.i18n.localize("VARBORG.Test.Cancelled")
      : null,
    kept: result.kept,
    abilityLabel: side.abilityKey
      ? game.i18n.localize(`VARBORG.Ability.${side.abilityKey}`)
      : game.i18n.localize("VARBORG.Contest.PlainD20"),
    ability: side.abilityKey ? signed(side.ability) : null,
    naturalNote: result.natural === 20 ? game.i18n.localize("VARBORG.Contest.Natural20")
      : result.natural === 1 ? game.i18n.localize("VARBORG.Contest.Natural1")
      : null,
    total: result.total
  };
}

/**
 * The contest dialog. Returns the chosen options, or null if it was closed.
 */
async function askContestOptions(actor) {
  const abilities = ABILITIES.map(key => ({ key, label: `VARBORG.Ability.${key}` }));
  const characters = game.actors
    .filter(a => a.type === "character" && a.id !== actor.id)
    .map(a => ({ id: a.id, name: a.name }));

  const content = await renderTemplate(DIALOG_TEMPLATE, { abilities, characters, foe: FOE });

  const data = await DialogV2.input({
    window: { title: game.i18n.format("VARBORG.Contest.DialogTitle", { name: actor.name }) },
    content,
    ok: { label: "VARBORG.Test.Roll", icon: "fa-solid fa-dice-d20" },
    rejectClose: false
  });
  if (!data) return null;

  return {
    ability: ABILITIES.includes(data.ability) ? data.ability : ABILITIES[0],
    boon: Boolean(data.boon),
    bane: Boolean(data.bane),
    opponent: data.opponent || FOE,
    foeName: String(data.foeName ?? "").trim(),
    opponentAbility: ABILITIES.includes(data.opponentAbility) ? data.opponentAbility : ABILITIES[0],
    opponentBoon: Boolean(data.opponentBoon),
    opponentBane: Boolean(data.opponentBane)
  };
}
