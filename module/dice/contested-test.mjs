/**
 * Contested tests in Foundry (rule 3.3, GAPS 10 and 33).
 *
 * Opens a dialog (your ability, Boon, Bane, and the opponent: a foe rolling a
 * plain d20, or another character with an ability), rolls both sides with
 * Foundry, lets module/rules/contested.mjs pick the winner, and posts one
 * chat card. An Encumbered character gets Bane on Strength and Agility
 * (rules 3.13), and armour's Agility penalty comes off the total (GAPS 51),
 * as does Fatigued's +2 DR per level.
 * All the maths lives in the rules files.
 */

import { ABILITIES } from "../rules/abilities.mjs";
import { MODE, diceMode, diceFormula } from "../rules/test-roll.mjs";
import { WINNER, resolveContest } from "../rules/contested.mjs";
import { testConditions, totalModifiers } from "../rules/conditions.mjs";
import { signed, modeLabel, actorTestModifiers } from "./ability-test.mjs";
import { conditionsOf, conditionNotes } from "../conditions.mjs";
import { useUpNextTest } from "../panic.mjs";
import { itemRollMods } from "../effects.mjs";
import { VB_DIALOG_CLASSES } from "../dialog.mjs";

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

  const first = characterSide(actor, options.ability, options.boon, options.bane);
  // A foe rolls its d20 plain and adds nothing (GAPS 33).
  const second = opponentActor
    ? characterSide(opponentActor, options.opponentAbility, options.opponentBoon, options.opponentBane)
    : { name: opponentName, abilityKey: null, ability: 0, modifier: 0, armourDr: 0, conditionMods: [], mode: MODE.NORMAL, boons: 0, banes: 0 };

  const firstRoll = await rollSide(first);
  const secondRoll = await rollSide(second);
  const result = resolveContest(
    { dice: diceOf(firstRoll), mode: first.mode, ability: first.ability, modifier: first.modifier },
    { dice: diceOf(secondRoll), mode: second.mode, ability: second.ability, modifier: second.modifier }
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
  await useUpNextTest(actor);
  if (opponentActor) await useUpNextTest(opponentActor);
}

/**
 * One character's side: its ability, Boon and Bane, plus Bane if Encumbered,
 * minus armour's Agility penalty and minus Fatigued's DR. Adrenaline Rush
 * and Rattled add Boon or Bane (GAPS 80).
 */
function characterSide(actor, abilityKey, boon, bane) {
  const { encumberedBane, armourDr, armourName } = actorTestModifiers(actor, abilityKey);
  const { conditions, fatigue } = conditionsOf(actor);
  // A contested test is an ability test too: item effects on either count (PLAN step 49c).
  const conditionMods = [...testConditions(conditions, fatigue, abilityKey), ...itemRollMods(actor, { roll: ["contest", "test"], ability: abilityKey })];
  const fromConditions = totalModifiers(conditionMods);
  const boons = (boon ? 1 : 0) + fromConditions.boons;
  const banes = (bane ? 1 : 0) + (encumberedBane ? 1 : 0) + fromConditions.banes;
  return {
    name: actor.name,
    abilityKey,
    ability: actor.system.abilities[abilityKey],
    modifier: -armourDr - fromConditions.dr,
    armourDr,
    armourName,
    conditionMods,
    mode: diceMode(boons, banes),
    boons,
    banes,
    encumbered: encumberedBane
  };
}

/** Roll one side's d20 (or two, for Boon or Bane) plus its ability and armour. */
async function rollSide(side) {
  const roll = new Roll(`${diceFormula(side.mode)} + @ability + @modifier`,
    { ability: side.ability, modifier: side.modifier });
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
    modeLabel: modeLabel(side.mode, side.boons, side.banes),
    encumberedNote: side.encumbered ? game.i18n.localize("VARBORG.Test.EncumberedBane") : null,
    // Such as "Rattled: Bane, added for you."
    modeNotes: conditionNotes(side.conditionMods.filter(mod => mod.dr === undefined)),
    kept: result.kept,
    abilityLabel: side.abilityKey
      ? game.i18n.localize(`VARBORG.Ability.${side.abilityKey}`)
      : game.i18n.localize("VARBORG.Contest.PlainD20"),
    ability: side.abilityKey ? signed(side.ability) : null,
    armour: side.armourDr ? signed(-side.armourDr) : null,
    armourName: side.armourName,
    // Such as "Fatigued 1 −2".
    conditions: side.conditionMods.filter(mod => mod.dr !== undefined).map(mod => game.i18n.format("VARBORG.Contest.ConditionPart", {
      condition: game.i18n.format("VARBORG.Condition.WithLevel", { name: game.i18n.localize(`VARBORG.Condition.${mod.condition}`), level: mod.level }),
      value: signed(-mod.dr)
    })),
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
    classes: VB_DIALOG_CLASSES,
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
