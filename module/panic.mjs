/**
 * Panic in Foundry (rules 3.12 Panic and morale, GAPS 79-85).
 *
 * The Panic button on the character sheet makes a Sanity DR12 test. On a
 * Failure the Panic table is rolled with 1d10, on a Ruin with 2d10; a
 * Triumph gives back any lost Sanity (system.sanityLost).
 *
 * A lasting result is an Active Effect on the character, with its result
 * id as a status (so "sluggish" shows on the token and counts in
 * module/rules/conditions.mjs) and its details in flags.var-borg.panic:
 *   result     the result id, such as "sluggish"
 *   turns      turns left (1d10 turns), counted down at the end of the
 *              character's own turns in combat (GAPS 79)
 *   hours      hours (1d10 hours) as rolled (GAPS 83)
 *   endsAt     the world time at which those hours have passed; the
 *              Dark Master's client ends the result then (step 37,
 *              GAPS 162, module/calendar.mjs)
 *   freshTurn  gained during the character's own turn, which does not count
 * Adrenaline Rush and Rattled are used up by the next test (GAPS 80).
 * The Dark Master can also add a result from the sheet, for rules that say
 * "as the Paranoid result on the Panic table".
 * All the maths lives in module/rules/panic.mjs; this file only rolls and
 * shows.
 */

import {
  PANIC_ABILITY, PANIC_DR, PANIC_RESULTS, PANIC_EFFECTS, DURATION_DICE, COMPOUNDING_DICE,
  panicDice, restoresSanity, panicResult, loseSanity, restoreSanity, countDown
} from "./rules/panic.mjs";
import { rollAbilityTest, rollQuietTest } from "./dice/ability-test.mjs";
import { turnState } from "./combat.mjs";
import { AGONY_RESULTS } from "./rules/agony.mjs";
import { endsAfterHours, hoursLeft, hasEnded } from "./rules/calendar.mjs";
import { runItemHooks, itemHooks } from "./effects.mjs";
import { isClaimed, claimOnce } from "./card-once.mjs";
import { postSmallCard } from "./chat-card.mjs";

const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/panic-card.hbs";
const GROUP_TEMPLATE = "systems/var-borg/templates/chat/group-panic-card.hbs";

/** Compounding problems can roll Compounding problems again; stop after this many. */
const MAX_DEPTH = 10;

/** The token icon for each lasting result (Foundry's own icons). */
export const PANIC_ICONS = {
  adrenalineRush: "icons/svg/lightning.svg",
  rattled: "icons/svg/hazard.svg",
  terrified: "icons/svg/terror.svg",
  babbling: "icons/svg/sound-off.svg",
  distracted: "icons/svg/eye.svg",
  sluggish: "icons/svg/clockwork.svg",
  screamingFit: "icons/svg/sound.svg",
  denial: "icons/svg/cancel.svg",
  fitOfViolence: "icons/svg/sword.svg",
  flee: "icons/svg/wing.svg",
  faint: "icons/svg/sleep.svg",
  cowardice: "icons/svg/door-exit.svg",
  paranoid: "icons/svg/mystery-man.svg"
};

/** "Sluggish". */
export function panicName(id) {
  return game.i18n.localize(`VARBORG.Panic.Result.${id}.name`);
}

/**
 * The Panic effects on an actor.
 * @returns {{id: string, result: string, turns?: number, hours?: number, effect: ActiveEffect}[]}
 */
export function panicEffects(actor) {
  return (actor?.effects ?? [])
    .filter(effect => effect.getFlag(SYSTEM, "panic"))
    .map(effect => ({ id: effect.id, ...effect.getFlag(SYSTEM, "panic"), effect }));
}

/**
 * The Panic button: test Sanity DR12, then roll on the Panic table on a
 * Failure (1d10) or Ruin (2d10). A Triumph restores lost Sanity.
 * @param {Actor} actor  A character.
 */
export async function rollPanicTest(actor) {
  const i18n = game.i18n;
  const result = await rollAbilityTest(actor, PANIC_ABILITY, {
    dr: PANIC_DR,
    purpose: i18n.localize("VARBORG.Panic.Purpose"),
    kind: "panic"
  });
  if (!result) return;
  // Item effects after a Panic test (step 49f).
  await runItemHooks(actor, ["failure", "ruin"].includes(result.tier) ? "panicFailure" : "panicSuccess");

  // Dwarven Doughtiness: a Ruin counts as a Failure (step 50b2).
  const doughty = result.tier === "ruin" ? itemHooks(actor, "panicFailure").find(hook => hook.action === "ruinAsFailure") : null;
  if (doughty) {
    await postSmallCard(actor, game.i18n.format("VARBORG.Panic.RuinAsFailure", { item: doughty.item, name: actor.name }));
  }
  const dice = panicDice(doughty ? "failure" : result.tier);
  // Steady nerves, while unspent: the player chooses first (GAPS 197).
  const nerves = dice ? itemHooks(actor, "panicFailure").find(hook => hook.action === "steadyNerves") : null;
  if (nerves) {
    await postNervesChoice(actor, nerves, dice);
    return;
  }
  if (dice) {
    await rollPanicTable(actor, dice);
    return;
  }
  const lines = [i18n.format(result.tier === "triumph" ? "VARBORG.Panic.Unfazed" : "VARBORG.Panic.Calm", { name: actor.name })];
  const lost = actor.system.sanityLost;
  if (restoresSanity(result.tier) && lost > 0) {
    // Only the lost Sanity is stored; the score in use follows it.
    const from = actor.system.abilities.sanity;
    await actor.update({ "system.sanityLost": restoreSanity(from, lost).lost });
    lines.push(i18n.format("VARBORG.Panic.Restored", { from, to: actor.system.abilities.sanity }));
  }
  await postSmallCard(actor, lines);
}

/**
 * A failed Panic test with Steady nerves unspent (step 50a3, GAPS 197): a
 * card with two buttons instead of the table roll. "Steady nerves" makes
 * the test a Success and gives 1 Fatigued; the other rolls the table.
 * @param {Actor} actor
 * @param {object} nerves  The Steady nerves hook (collectEffects).
 * @param {string} dice    "1d10" or "2d10".
 */
async function postNervesChoice(actor, nerves, dice) {
  const i18n = game.i18n;
  const escape = foundry.utils.escapeHTML;
  // The raw item name: the card escapes the lines once, the button labels are escaped once below (REVIEW.md S4, L5).
  const item = nerves.item;
  const lines = [
    i18n.format("VARBORG.Panic.Nerves.Failed", { name: actor.name }),
    i18n.format("VARBORG.Panic.Nerves.Offer", { item })
  ];
  const buttons = `<button type="button" class="text-button" data-action="steadyNerves" data-actor-uuid="${actor.uuid}" data-item-id="${nerves.itemId}">`
    + `<i class="fa-solid fa-hand-fist"></i> ${escape(i18n.format("VARBORG.Panic.Nerves.Use", { item }))}</button>`
    + `<button type="button" class="text-button" data-action="panicTable" data-actor-uuid="${actor.uuid}" data-formula="${dice}">`
    + `<i class="fa-solid fa-dice-d20"></i> ${escape(i18n.format("VARBORG.Panic.Nerves.Roll", { formula: dice }))}</button>`;
  await postSmallCard(actor, lines, {
    heading: i18n.format("VARBORG.Panic.CardTitle", { name: actor.name }),
    classes: "panic-card",
    flavor: i18n.localize("VARBORG.Panic.Title"),
    extraHtml: buttons,
    flags: { [SYSTEM]: { panicChoice: true } }
  });
}

/* -------------------------------------------- */
/*  Group Panic test (playtest feedback)         */
/* -------------------------------------------- */

/**
 * The characters a group Panic test is for: those of the selected tokens,
 * or else every character with a token on the scene.
 * @returns {Actor[]}
 */
function groupPanicActors() {
  const characters = tokens => [...new Set(tokens.map(token => token.actor).filter(actor => actor?.type === "character"))];
  const selected = characters(canvas.tokens?.controlled ?? []);
  return selected.length ? selected : characters(canvas.tokens?.placeables ?? []);
}

/**
 * The Dark Master's group Panic test: every character tests Sanity DR12
 * at once, with no dialogs, and one card shows each result and its Panic
 * table roll. A character with Steady nerves unspent gets the usual choice
 * as two buttons on its row.
 */
export async function rollGroupPanic() {
  const i18n = game.i18n;
  const actors = groupPanicActors();
  if (!actors.length) {
    ui.notifications.warn(i18n.localize("VARBORG.Panic.Group.NoCharacters"));
    return;
  }
  const rows = [];
  const rolls = [];
  for (const actor of actors) {
    const { rolls: rowRolls, ...row } = await groupPanicRow(actor);
    rows.push(row);
    rolls.push(...rowRolls);
  }
  const content = await renderTemplate(GROUP_TEMPLATE, { title: i18n.localize("VARBORG.Panic.Group.Title"), rows });
  await ChatMessage.create({
    speaker: { alias: i18n.localize("VARBORG.Panic.Group.Speaker") },
    flavor: i18n.localize("VARBORG.Panic.Title"),
    content,
    rolls,
    sound: CONFIG.sounds.dice,
    flags: { [SYSTEM]: { groupPanic: true } }
  });
}

/** One character's row on the group Panic card, with its rolls. */
async function groupPanicRow(actor) {
  const i18n = game.i18n;
  const test = await rollQuietTest(actor, PANIC_ABILITY, { dr: PANIC_DR, kind: "panic" });
  const row = {
    actorUuid: actor.uuid,
    name: actor.name,
    img: actor.img,
    total: test.total,
    dr: test.dr,
    modeLabel: test.modeLabel,
    tier: test.tier,
    tierLabel: i18n.localize(`VARBORG.Tier.${test.tier}`),
    notes: test.notes,
    lines: [],
    results: [],
    nerves: null,
    rolls: [test.roll]
  };
  // Item effects after a Panic test (step 49f).
  await runItemHooks(actor, ["failure", "ruin"].includes(test.tier) ? "panicFailure" : "panicSuccess");
  // Dwarven Doughtiness: a Ruin counts as a Failure (step 50b2).
  const doughty = test.tier === "ruin" ? itemHooks(actor, "panicFailure").find(hook => hook.action === "ruinAsFailure") : null;
  if (doughty) row.lines.push(i18n.format("VARBORG.Panic.RuinAsFailure", { item: doughty.item, name: actor.name }));
  const dice = panicDice(doughty ? "failure" : test.tier);
  // Steady nerves, while unspent: the player chooses on the card (GAPS 197).
  const nerves = dice ? itemHooks(actor, "panicFailure").find(hook => hook.action === "steadyNerves") : null;
  if (nerves) {
    row.lines.push(i18n.format("VARBORG.Panic.Nerves.Offer", { item: nerves.item }));
    row.nerves = {
      itemId: nerves.itemId,
      dice,
      use: i18n.format("VARBORG.Panic.Nerves.Use", { item: nerves.item }),
      roll: i18n.format("VARBORG.Panic.Nerves.Roll", { formula: dice })
    };
    return row;
  }
  if (dice) {
    for (const result of await panicTableResults(actor, dice)) {
      row.results.push({ rolled: result.rolled, name: panicName(result.id), text: i18n.localize(`VARBORG.Panic.Result.${result.id}.text`), lines: result.lines });
      row.rolls.push(...result.rolls);
    }
    return row;
  }
  row.lines.push(i18n.format(test.tier === "triumph" ? "VARBORG.Panic.Unfazed" : "VARBORG.Panic.Calm", { name: actor.name }));
  const lost = actor.system.sanityLost;
  if (restoresSanity(test.tier) && lost > 0) {
    const from = actor.system.abilities.sanity;
    await actor.update({ "system.sanityLost": restoreSanity(from, lost).lost });
    row.lines.push(i18n.format("VARBORG.Panic.Restored", { from, to: actor.system.abilities.sanity }));
  }
  return row;
}

/** The Dark Master's Group Panic test button in the token controls. */
function addGroupPanicButton(controls) {
  const tools = controls.tokens?.tools;
  if (!tools || !game.user.isGM) return;
  tools.varBorgGroupPanic = {
    name: "varBorgGroupPanic",
    title: "VARBORG.Panic.Group.Button",
    icon: "fa-solid fa-face-dizzy",
    order: Object.keys(tools).length,
    button: true,
    visible: true,
    onChange: () => rollGroupPanic()
  };
}

/**
 * The Steady nerves buttons on a group Panic card: each character's owner
 * chooses once, remembered per character on the message.
 */
function activateGroupPanicButtons(message, html) {
  if (!message.getFlag(SYSTEM, "groupPanic")) return;
  for (const button of html.querySelectorAll("button[data-action='groupNerves'], button[data-action='groupTable']")) {
    const actor = fromUuidSync(button.dataset.actorUuid);
    const key = actor?.id ?? "";
    if (!actor?.isOwner || isClaimed(message, "groupPanicChosen", key)) {
      button.disabled = true;
      continue;
    }
    button.addEventListener("click", async () => {
      const row = [...(button.closest("[data-panic-row]")?.querySelectorAll("button") ?? [button])];
      for (const other of row) other.disabled = true;
      // Record this character's choice first, by the Dark Master's client when a player presses it (REVIEW.md B6).
      const claim = await claimOnce(message, "groupPanicChosen", { actor, sub: key });
      if (!claim) {
        for (const other of row) other.disabled = isClaimed(message, "groupPanicChosen", key);
        return;
      }
      if (button.dataset.action === "groupTable") await rollPanicTable(actor, button.dataset.formula);
      // Steady nerves that turns out to be spent did nothing: give the choice back.
      else if (!await useSteadyNerves(actor, button.dataset.itemId)) await claim.release();
    });
  }
}

/** Watch the buttons on Steady nerves cards (step 50a3), and add the group Panic button. */
export function registerPanicButtons() {
  Hooks.on("getSceneControlButtons", addGroupPanicButton);
  Hooks.on("renderChatMessageHTML", activateGroupPanicButtons);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM, "panicChoice")) return;
    const buttons = [...html.querySelectorAll("button[data-action='steadyNerves'], button[data-action='panicTable']")];
    if (!buttons.length) return;
    const actor = fromUuidSync(buttons[0].dataset.actorUuid);
    if (!actor?.isOwner || isClaimed(message, "panicChosen")) {
      for (const button of buttons) button.disabled = true;
      return;
    }
    for (const button of buttons) {
      button.addEventListener("click", async () => {
        for (const other of buttons) other.disabled = true;
        // Record the choice first, by the Dark Master's client when a player presses it (REVIEW.md B6).
        const claim = await claimOnce(message, "panicChosen", { actor });
        if (!claim) {
          for (const other of buttons) other.disabled = isClaimed(message, "panicChosen");
          return;
        }
        if (button.dataset.action === "panicTable") await rollPanicTable(actor, button.dataset.formula);
        // Steady nerves that turns out to be spent did nothing: give the choice back.
        else if (!await useSteadyNerves(actor, button.dataset.itemId)) await claim.release();
      });
    }
  });
}

/**
 * Steady nerves: the failed Panic test counts as a Success, the character
 * gains 1 Fatigued and the feat is spent for the day (GAPS 197).
 * @returns {Promise<boolean>}  false when the feat was already spent or is gone
 *   and nothing happened, so the card's choice can be given back.
 */
async function useSteadyNerves(actor, itemId) {
  const i18n = game.i18n;
  const item = actor.items.get(itemId);
  if (!item || item.system.frequencyUsed) {
    ui.notifications.warn(i18n.localize("VARBORG.Panic.Nerves.Spent"));
    return false;
  }
  await item.update({ "system.frequencyUsed": true });
  const fatigue = (actor.system.fatigue ?? 0) + 1;
  await actor.update({ "system.fatigue": fatigue });
  const lines = [
    i18n.format("VARBORG.Panic.Nerves.Held", { item: item.name, name: actor.name }),
    i18n.format("VARBORG.Panic.Calm", { name: actor.name }),
    i18n.format("VARBORG.Panic.Nerves.Fatigued", { level: fatigue }),
    i18n.format("VARBORG.Effects.HookUsed", { item: item.name })
  ];
  await postSmallCard(actor, lines, { flavor: i18n.localize("VARBORG.Panic.Title") });
  return true;
}

/**
 * Roll on the Panic table and apply the result. Compounding problems rolls
 * 2d10 twice more.
 * @param {Actor} actor
 * @param {string} formula  "1d10" or "2d10".
 * @param {number} [depth]  How many Compounding problems led here.
 */
export async function rollPanicTable(actor, formula, depth = 0) {
  for (const result of await panicTableResults(actor, formula, depth)) {
    await postResult(actor, result.id, result.lines, result.rolls, result.rolled);
  }
}

/**
 * Roll on the Panic table and apply each result (Compounding problems
 * rolls 2d10 twice more), without posting.
 * @returns {Promise<{id: string, rolled: string, lines: string[], rolls: Roll[]}[]>}
 */
async function panicTableResults(actor, formula, depth = 0) {
  const roll = new Roll(formula);
  await roll.evaluate();
  const id = panicResult(roll.total);
  const { lines, rolls } = await applyPanicResult(actor, id);
  const results = [{ id, lines, rolls: [roll, ...rolls], rolled: game.i18n.format("VARBORG.Panic.Rolled", { formula, roll: roll.total }) }];

  const again = PANIC_RESULTS[id].rollsAgain ?? 0;
  if (!again) return results;
  if (depth >= MAX_DEPTH) {
    ui.notifications.warn(game.i18n.localize("VARBORG.Panic.TooDeep"));
    return results;
  }
  for (let i = 0; i < again; i++) results.push(...await panicTableResults(actor, COMPOUNDING_DICE, depth + 1));
  return results;
}

/**
 * Do what a result does: add its effect, change Fortune or Sanity.
 * Results that change nothing the system tracks (phobias, Psychological
 * Collapse, Heart Attack) only explain what to do.
 * @returns {Promise<{lines: string[], rolls: Roll[]}>}  What happened, for the card.
 */
async function applyPanicResult(actor, id) {
  const i18n = game.i18n;
  const rules = PANIC_RESULTS[id];
  const lines = [];
  const rolls = [];

  if (rules.turns || rules.hours) {
    const duration = new Roll(DURATION_DICE);
    await duration.evaluate();
    rolls.push(duration);
    const count = duration.total;
    await createPanicEffect(actor, id, rules.turns ? { turns: count } : { hours: count });
    lines.push(rules.turns ? turnsText("VARBORG.Panic.LastsTurns", count) : hoursText("VARBORG.Panic.LastsHours", count));
    if (rules.turns) lines.push(i18n.localize("VARBORG.Panic.CountsInCombat"));
    else lines.push(i18n.localize("VARBORG.Panic.EndsByClock"));
  }
  if (rules.next) {
    await createPanicEffect(actor, id, {});
    lines.push(i18n.localize("VARBORG.Panic.NextTest"));
  }
  if (rules.fortune) {
    const from = actor.system.fortune;
    await actor.update({ "system.fortune": from + rules.fortune });
    lines.push(i18n.format("VARBORG.Panic.Fortune", { from, to: from + rules.fortune }));
  }
  if (rules.sanity) {
    const from = actor.system.abilities.sanity;
    const lowered = loseSanity(from, actor.system.sanityLost, rules.sanity);
    if (lowered.sanity === from) lines.push(i18n.localize("VARBORG.Panic.SanityAtMinimum"));
    else {
      // Only the lost Sanity is stored; the score in use follows it.
      await actor.update({ "system.sanityLost": lowered.lost });
      lines.push(i18n.format("VARBORG.Panic.SanityLost", { from, to: lowered.sanity, lost: lowered.lost }));
    }
  }
  if (rules.phobias) lines.push(i18n.localize(rules.phobias === 1 ? "VARBORG.Panic.NewPhobia" : "VARBORG.Panic.NewPhobias"));
  if (rules.rollsAgain) lines.push(i18n.localize("VARBORG.Panic.RollsAgain"));
  if (id === "psychologicalCollapse" || id === "heartAttack") lines.push(i18n.localize("VARBORG.Panic.ByHand"));
  return { lines, rolls };
}

/** Add a lasting result's effect. Gained on the character's own turn: that turn does not count. */
async function createPanicEffect(actor, id, duration) {
  const freshTurn = Boolean(duration.turns) && turnState(actor).onOwnTurn;
  if (duration.hours) duration = { ...duration, endsAt: endsAfterHours(game.time.worldTime, duration.hours) };
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: panicName(id),
    img: PANIC_ICONS[id],
    statuses: [id],
    description: game.i18n.localize(`VARBORG.Panic.Result.${id}.text`),
    flags: { [SYSTEM]: { panic: { result: id, ...duration, freshTurn } } }
  }]);
}

/** One card per table result: its name, its rules text and what happened. */
async function postResult(actor, id, lines, rolls, rolled = null) {
  const i18n = game.i18n;
  const content = await renderTemplate(CARD_TEMPLATE, {
    title: i18n.format("VARBORG.Panic.CardTitle", { name: actor.name }),
    rolled,
    result: panicName(id),
    text: i18n.localize(`VARBORG.Panic.Result.${id}.text`),
    lines
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: i18n.localize("VARBORG.Panic.Title"),
    content,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : undefined
  });
}

/**
 * At the end of the character's own turn in combat, each result that
 * lasts for turns loses one; at 0 it ends (GAPS 79).
 * @param {Actor} actor
 */
export async function countDownPanic(actor) {
  for (const { result, turns, freshTurn, effect } of panicEffects(actor)) {
    if (!turns) continue;
    const next = countDown(turns, freshTurn);
    if (next.ends) {
      await effect.delete();
      await postLine(actor, game.i18n.format("VARBORG.Panic.Ends", { name: actor.name, result: panicName(result) }));
    } else {
      await effect.update({ [`flags.${SYSTEM}.panic.turns`]: next.turnsLeft, [`flags.${SYSTEM}.panic.freshTurn`]: false });
    }
  }
}

/** Whether the actor has a Panic result timed on the world clock. */
export function hasClockPanic(actor) {
  return panicEffects(actor).some(({ endsAt }) => Number.isFinite(endsAt));
}

/**
 * The world clock has moved: Panic results whose hours have passed end
 * (Cowardice, Paranoid; GAPS 162). Dark Master only.
 * @param {Actor} actor
 * @param {number} now  World time in seconds.
 */
export async function endPanicByClock(actor, now) {
  for (const { result, endsAt, effect } of panicEffects(actor)) {
    if (!hasEnded(endsAt, now)) continue;
    await effect.delete();
    await postLine(actor, game.i18n.format("VARBORG.Panic.Ends", { name: actor.name, result: panicName(result) }));
  }
}

/**
 * After an ability test, contest, attack or defence: Adrenaline Rush and
 * Rattled are used up (GAPS 80), and so are Singed and Vomit from the
 * Table of Agony (GAPS 88).
 * @param {Actor} actor
 */
export async function useUpNextTest(actor, { quiet = false } = {}) {
  const used = (actor?.effects ?? []).filter(effect => {
    const panic = effect.getFlag(SYSTEM, "panic");
    const agony = effect.getFlag(SYSTEM, "agony");
    return PANIC_RESULTS[panic?.result]?.next || AGONY_RESULTS[agony?.result]?.next;
  });
  if (!used.length) return null;
  await actor.deleteEmbeddedDocuments("ActiveEffect", used.map(effect => effect.id));
  const line = game.i18n.format("VARBORG.Panic.UsedUp", {
    name: actor.name, result: used.map(effect => effect.name).join(", ")
  });
  // A quiet test (the group Panic card) shows the line itself.
  if (!quiet) await postLine(actor, line);
  return line;
}

/** A one-line card. The text is plain: the card escapes it (REVIEW.md S4). */
async function postLine(actor, text) {
  await postSmallCard(actor, text);
}

/** "4 turns", "1 turn". */
function turnsText(key, count) {
  return game.i18n.format(key, { count, unit: game.i18n.localize(count === 1 ? "VARBORG.Panic.Turn" : "VARBORG.Panic.Turns") });
}

/** "6 hours", "1 hour". */
function hoursText(key, count) {
  return game.i18n.format(key, { count, unit: game.i18n.localize(count === 1 ? "VARBORG.Panic.Hour" : "VARBORG.Panic.Hours") });
}

/** The Panic rows of a character's Conditions section, or null for a foe. */
export function sheetPanic(actor) {
  if (actor.type !== "character") return null;
  const i18n = game.i18n;
  return {
    list: panicEffects(actor).map(({ id, result, turns, hours, endsAt, effect }) => ({
      id,
      img: effect.img,
      label: turns ? `${effect.name} (${turnsText("VARBORG.Panic.Left", turns)})`
        : hours ? `${effect.name} (${hoursText("VARBORG.Panic.Left", Number.isFinite(endsAt) ? hoursLeft(endsAt, game.time.worldTime) : hours)})`
        : effect.name,
      text: i18n.localize(`VARBORG.Panic.Result.${result}.text`)
    })),
    choices: game.user.isGM ? PANIC_EFFECTS.map(id => ({ id, label: panicName(id) })) : null
  };
}

/**
 * The sheet's Panic controls: each row's remove button and the Dark
 * Master's "Add a Panic result" menu. Called from activateConditionControls.
 */
export function activatePanicControls(element, actor) {
  for (const button of element.querySelectorAll("[data-remove-panic]")) {
    button.addEventListener("click", () => actor.effects.get(button.dataset.removePanic)?.delete());
  }
  element.querySelector("select[data-add-panic]")?.addEventListener("change", async event => {
    const id = event.currentTarget.value;
    if (!PANIC_EFFECTS.includes(id)) return;
    const { lines, rolls } = await applyPanicResult(actor, id);
    await postResult(actor, id, lines, rolls);
  });
}
