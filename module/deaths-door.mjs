/**
 * Death's Door and Dark Vessel in Foundry (rules 3.6 Death's Door, 3.13
 * Conditions, GAPS 16, 36, 42 and 91-94).
 *
 * A character reaches Death's Door when HP strikes 0 at max wounds
 * (module/data/character.mjs), from a fatal Table of Agony result
 * (module/agony.mjs), or when the Dark Master adds the condition by hand.
 * However it arrives, the Death's Door condition posts a card with a button
 * for the character's owner to roll 2d6 on the table. The Dark Master may
 * choose the result instead (GAPS 94).
 *
 * Where the character stands is kept in flags.var-borg.deathsDoor:
 *   stage      "roll" (roll on the table), "test" (row 2's Sanity test),
 *              "waking" (unconscious) or "dead"
 *   dr         row 2's Sanity DR
 *   turns      unconscious rounds left, counted down at the end of the
 *              character's own turns in combat (GAPS 92)
 *   wakeHp     the HP formula to wake with, such as "1d4"
 *   freshTurn  became unconscious during their own turn, which does not count
 * Removing the Death's Door condition clears it.
 *
 * Any damage at Death's Door kills (Take damage, persistent damage, the
 * token bar). Any HP gained there wakes the character and ends Death's
 * Door (a medicine box, the sheet, the token bar; GAPS 163). A dead character is marked defeated, like a fallen foe
 * (GAPS 91). The Dark Vessel count is system.darkVessels; the Dark Master
 * sets it back to 0 after a Long Rest until resting exists (GAPS 93).
 * All the maths lives in module/rules/deaths-door.mjs; this file only rolls
 * and shows.
 */

import {
  DEATHS_DOOR_DICE, DEATHS_DOOR_MIN, DEATHS_DOOR_MAX, DEATHS_DOOR_RESULTS, DARK_PULL_ABILITY,
  DARK_VESSEL_HP, BODY_PART_DICE, deathsDoorResult, darkPullDr, darkPullOutcome,
  becomeDarkVessel, bodyPart, killingBlow
} from "./rules/deaths-door.mjs";
import { countDown } from "./rules/panic.mjs";
import { rollAbilityTest } from "./dice/ability-test.mjs";
import { markDefeated } from "./dice/morale.mjs";
import { rollTwiceFor, escapeDeath } from "./effects.mjs";
import { turnState } from "./combat.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/deaths-door-card.hbs";
const BODY_PART_ICON = "icons/svg/bones.svg";

/** Watch the Death's Door condition, and the buttons on its cards. */
export function registerDeathsDoor() {
  Hooks.on("createActiveEffect", onDeathsDoorAdded);
  Hooks.on("deleteActiveEffect", onDeathsDoorRemoved);
  Hooks.on("renderChatMessageHTML", addDeathsDoorCardListeners);
}

/** Where a character stands at Death's Door, or null. */
function stateOf(actor) {
  return actor?.getFlag(SYSTEM, "deathsDoor") ?? null;
}

/** A character with the Death's Door condition (dead or not). */
export function atDeathsDoor(actor) {
  return actor?.type === "character" && actor.statuses.has("deathsDoor");
}

/** "Right hand". */
function partName(id) {
  return game.i18n.localize(`VARBORG.DeathsDoor.Part.${id}`);
}

/** "1 round", "4 rounds". */
function roundsText(count) {
  return `${count} ${game.i18n.localize(count === 1 ? "VARBORG.DeathsDoor.Round" : "VARBORG.DeathsDoor.Rounds")}`;
}

/** "1", "d4": a wake-up formula as the rules write it. */
function hpText(formula) {
  return formula.replace(/^1d/, "d");
}

/**
 * HP struck 0 at max wounds: the character is at Death's Door. Called by
 * the character data on the client that made the change. The condition's
 * arrival posts the card.
 */
export async function enterDeathsDoor(actor) {
  if (!actor.statuses.has("deathsDoor")) await actor.toggleStatusEffect("deathsDoor", { active: true });
}

/**
 * The Death's Door condition arrives on a character: Dark Vessel ends,
 * and a card asks for the roll on the table.
 */
async function onDeathsDoorAdded(effect, options, userId) {
  const actor = effect.parent;
  if (userId !== game.user.id || !effect.statuses.has("deathsDoor")) return;
  if (!(actor instanceof foundry.documents.Actor) || actor.type !== "character") return;
  if (stateOf(actor)?.stage === "dead") return;
  const i18n = game.i18n;
  const lines = [i18n.localize("VARBORG.DeathsDoor.KillWarning")];
  if (actor.statuses.has("darkVessel")) {
    await actor.toggleStatusEffect("darkVessel", { active: false });
    lines.unshift(i18n.localize("VARBORG.DeathsDoor.VesselEnds"));
  }
  await actor.setFlag(SYSTEM, "deathsDoor", { stage: "roll" });
  await postCard(actor, {
    title: i18n.format("VARBORG.DeathsDoor.CardTitle", { name: actor.name }),
    text: i18n.localize("VARBORG.Condition.Text.deathsDoor"),
    lines,
    button: { action: "rollDeathsDoor", icon: "fa-solid fa-dice", label: i18n.localize("VARBORG.DeathsDoor.RollButton") }
  });
}

/** The Death's Door condition is removed: the character's stage goes with it. */
async function onDeathsDoorRemoved(effect, options, userId) {
  const actor = effect.parent;
  if (userId !== game.user.id || !effect.statuses.has("deathsDoor")) return;
  if (!(actor instanceof foundry.documents.Actor) || !stateOf(actor)) return;
  await actor.unsetFlag(SYSTEM, "deathsDoor");
}

/**
 * The roll on the table. The Dark Master may choose the result instead of
 * rolling (GAPS 94); players roll 2d6.
 * @returns {Promise<boolean>}  Whether it was rolled.
 */
async function askAndRoll(actor) {
  let chosen = null;
  if (game.user.isGM) {
    const i18n = game.i18n;
    const options = [`<option value="">${i18n.localize("VARBORG.DeathsDoor.RollRandom")}</option>`];
    for (let roll = DEATHS_DOOR_MIN; roll <= DEATHS_DOOR_MAX; roll++) {
      const name = i18n.localize(`VARBORG.DeathsDoor.Result.${deathsDoorResult(roll)}.name`);
      options.push(`<option value="${roll}">${roll}: ${name}</option>`);
    }
    const data = await DialogV2.input({
      window: { title: i18n.format("VARBORG.DeathsDoor.DialogTitle", { name: actor.name }) },
      content: `<div class="form-group"><label>${i18n.localize("VARBORG.DeathsDoor.ResultLabel")}</label>`
        + `<select name="roll">${options.join("")}</select></div>`
        + `<p class="hint">${i18n.localize("VARBORG.DeathsDoor.ChooseHint")}</p>`,
      ok: { label: "VARBORG.DeathsDoor.Roll", icon: "fa-solid fa-dice" },
      rejectClose: false
    });
    if (!data) return false;
    chosen = data.roll ? Number(data.roll) : null;
  }
  await rollDeathsDoor(actor, chosen);
  return true;
}

/**
 * Roll 2d6 on the Death's Door table (or take the Dark Master's choice),
 * do what the row says and post its card.
 * @param {Actor} actor
 * @param {number|null} [chosen]  A result chosen by the Dark Master.
 */
export async function rollDeathsDoor(actor, chosen = null) {
  const i18n = game.i18n;
  // Item effects can roll twice and keep one (Saint's knucklebone,
  // Doomsworn; step 49f, GAPS 192). A Dark Master's choice is never rolled.
  const twice = chosen ? null : await rollTwiceFor(actor, "deathsDoor", DEATHS_DOOR_DICE);
  let total;
  let tableRolls;
  if (twice) {
    total = twice.total;
    tableRolls = twice.rolls;
  } else {
    const roll = new Roll(chosen ? String(chosen) : DEATHS_DOOR_DICE);
    await roll.evaluate();
    total = roll.total;
    tableRolls = [roll];
  }
  const id = deathsDoorResult(total);
  const { lines, rolls, button } = await applyResult(actor, id);
  await postCard(actor, {
    title: i18n.format("VARBORG.DeathsDoor.ResultTitle", { name: actor.name }),
    rolled: i18n.format(chosen ? "VARBORG.DeathsDoor.Chosen" : "VARBORG.DeathsDoor.Rolled", { roll: total }),
    result: i18n.localize(`VARBORG.DeathsDoor.Result.${id}.name`),
    text: i18n.localize(`VARBORG.DeathsDoor.Result.${id}.text`),
    lines: twice ? [twice.line, ...lines] : lines,
    button
  }, [...tableRolls, ...rolls]);
}

/**
 * Do what a row says.
 * @returns {Promise<{lines: string[], rolls: Roll[], button?: object}>}
 */
async function applyResult(actor, id) {
  const i18n = game.i18n;
  const rules = DEATHS_DOOR_RESULTS[id];
  const lines = [];
  const rolls = [];

  if (rules.dies) {
    const death = await kill(actor);
    lines.push(...death.lines);
    rolls.push(...death.rolls);
    return { lines, rolls };
  }
  if (rules.test) {
    const feats = actor.items.filter(item => item.type === "feat").map(item => item.system);
    const dr = darkPullDr(feats);
    await actor.setFlag(SYSTEM, "deathsDoor", { stage: "test", dr });
    lines.push(i18n.format("VARBORG.DeathsDoor.DrFrom", { dr, count: dr - darkPullDr() }));
    const label = i18n.format("VARBORG.DeathsDoor.TestButton", { dr });
    return { lines, rolls, button: { action: "deathsDoorTest", icon: "fa-solid fa-dice-d20", label } };
  }
  if (rules.doomed) {
    if (!actor.statuses.has("doomed")) await actor.toggleStatusEffect("doomed", { active: true });
    lines.push(i18n.localize("VARBORG.DeathsDoor.DoomedAdded"));
  }
  if (rules.infected) {
    if (!actor.statuses.has("infected")) await actor.toggleStatusEffect("infected", { active: true });
    lines.push(i18n.localize("VARBORG.DeathsDoor.InfectedAdded"));
  }
  if (rules.bodyPart) {
    const partRoll = new Roll(BODY_PART_DICE);
    await partRoll.evaluate();
    rolls.push(partRoll);
    const part = bodyPart(partRoll.total);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: i18n.format("VARBORG.DeathsDoor.Lost", { part: partName(part) }),
      img: BODY_PART_ICON,
      description: i18n.localize("VARBORG.DeathsDoor.LostText"),
      flags: { [SYSTEM]: { bodyPart: { part } } }
    }]);
    lines.push(i18n.format("VARBORG.DeathsDoor.BodyPart", { roll: partRoll.total, part: partName(part) }));
  }
  if (rules.unconscious) {
    const { line, roll } = await fallUnconscious(actor, rules.unconscious, rules.wakeHp);
    rolls.push(roll);
    lines.push(...line);
  }
  if (rules.hp) {
    await wake(actor, String(rules.hp), false);
    lines.push(i18n.format("VARBORG.DeathsDoor.AliveAt", { name: actor.name, hp: rules.hp }));
  }
  return { lines, rolls };
}

/**
 * Unconscious for a number of rounds, then wake with some HP. The rounds
 * count down at the end of the character's own turns in combat; outside
 * combat the Dark Master wakes them (GAPS 92).
 * @returns {Promise<{line: string[], roll: Roll}>}
 */
async function fallUnconscious(actor, formula, wakeHp) {
  const i18n = game.i18n;
  const roll = new Roll(formula);
  await roll.evaluate();
  const { combatant, onOwnTurn } = turnState(actor);
  await actor.setFlag(SYSTEM, "deathsDoor", { stage: "waking", turns: roll.total, wakeHp, freshTurn: onOwnTurn });
  return {
    roll,
    line: [
      i18n.format("VARBORG.DeathsDoor.Unconscious", { rounds: roundsText(roll.total), hp: hpText(wakeHp) }),
      i18n.format(combatant ? "VARBORG.DeathsDoor.CountsInCombat" : "VARBORG.DeathsDoor.WakeByHand", { name: actor.name })
    ]
  };
}

/**
 * The character wakes: Death's Door ends and HP is rolled.
 * @param {Actor} actor
 * @param {string} formula   The HP to wake with, such as "1d4".
 * @param {boolean} [post]   Post a line saying so.
 */
export async function wake(actor, formula, post = true) {
  const roll = new Roll(formula);
  await roll.evaluate();
  await actor.toggleStatusEffect("deathsDoor", { active: false });
  await actor.update({ "system.hp.value": roll.total });
  if (!post) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${game.i18n.format("VARBORG.DeathsDoor.Wakes", { name: actor.name, hp: roll.total })}</p></div>`,
    rolls: roll.isDeterministic ? [] : [roll]
  });
}

/**
 * The character gained HP at Death's Door (a medicine box, the sheet, the
 * token bar): they wake and Death's Door ends (GAPS 163). Called by the
 * character data on the client that made the change.
 * @param {Actor} actor
 */
export async function healedAtDeathsDoor(actor) {
  if (!atDeathsDoor(actor) || isDead(actor)) return;
  await actor.toggleStatusEffect("deathsDoor", { active: false });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${game.i18n.format("VARBORG.DeathsDoor.Healed", {
      name: foundry.utils.escapeHTML(actor.name), hp: actor.system.hp.value
    })}</p></div>`
  });
}

/**
 * Row 2's Sanity test. Success: unconscious for d8 rounds, then 1 HP.
 * Failure: Dark Vessel, or death if it is the second before a Long Rest.
 * @returns {Promise<boolean>}  Whether it was rolled.
 */
async function darkPullTest(actor) {
  const i18n = game.i18n;
  const { dr } = stateOf(actor);
  const result = await rollAbilityTest(actor, DARK_PULL_ABILITY, {
    dr,
    purpose: i18n.localize("VARBORG.DeathsDoor.TestPurpose")
  });
  if (!result) return false;

  const lines = [];
  const rolls = [];
  const outcome = darkPullOutcome(result.tier);
  if (outcome === "sleeps") {
    const { line, roll } = await fallUnconscious(actor, DEATHS_DOOR_RESULTS.darkPull.unconscious, DEATHS_DOOR_RESULTS.darkPull.wakeHp);
    rolls.push(roll);
    lines.push(i18n.format("VARBORG.DeathsDoor.Sleeps", { name: actor.name }), ...line);
  } else {
    const vessel = becomeDarkVessel(actor.system.darkVessels);
    await actor.update({ "system.darkVessels": vessel.count });
    if (vessel.dies) {
      const death = await kill(actor);
      if (death.dead) lines.push(i18n.localize("VARBORG.DeathsDoor.SecondVessel"));
      lines.push(...death.lines);
      rolls.push(...death.rolls);
    } else {
      const hpRoll = new Roll(DARK_VESSEL_HP);
      await hpRoll.evaluate();
      rolls.push(hpRoll);
      await actor.toggleStatusEffect("deathsDoor", { active: false });
      await actor.toggleStatusEffect("darkVessel", { active: true });
      await actor.update({ "system.hp.value": hpRoll.total });
      lines.push(
        i18n.format("VARBORG.DeathsDoor.BecomesVessel", { name: actor.name, hp: hpRoll.total, count: vessel.count }),
        i18n.localize("VARBORG.Condition.Text.darkVessel")
      );
    }
  }
  await postCard(actor, {
    title: i18n.format("VARBORG.DeathsDoor.ResultTitle", { name: actor.name }),
    result: i18n.localize(outcome === "sleeps" ? "VARBORG.DeathsDoor.Outcome.sleeps" : "VARBORG.DeathsDoor.Outcome.darkVessel"),
    lines
  }, rolls);
  return true;
}

/**
 * The character dies: marked defeated, like a fallen foe (GAPS 91).
 * Item effects are asked first (step 50a2): Harkin's Reprieve stops it,
 * and reminders such as Diehard's join the card.
 * @returns {Promise<{dead: boolean, lines: string[], rolls: Roll[]}>}  Lines for the card.
 */
async function kill(actor) {
  const escape = await escapeDeath(actor);
  if (escape.saved) return { dead: false, lines: escape.lines, rolls: escape.rolls };
  if (actor.statuses.has("darkVessel")) await actor.toggleStatusEffect("darkVessel", { active: false });
  await actor.setFlag(SYSTEM, "deathsDoor", { stage: "dead" });
  await markDefeated(actor);
  return { dead: true, lines: [game.i18n.format("VARBORG.DeathsDoor.Dead", { name: actor.name }), ...escape.lines], rolls: escape.rolls };
}

/**
 * A character dies from something other than the table, such as "Head
 * explodes" on the Table of Agony. Posts its own card.
 * @param {Actor} actor
 * @param {string} reason  A key under VARBORG.DeathsDoor.Reason.
 * @returns {Promise<boolean>}  Whether the character died.
 */
export async function killCharacter(actor, reason) {
  const i18n = game.i18n;
  const death = await kill(actor);
  await postCard(actor, {
    title: i18n.format(death.dead ? "VARBORG.DeathsDoor.DeadTitle" : "VARBORG.DeathsDoor.SparedTitle", { name: actor.name }),
    text: i18n.format(`VARBORG.DeathsDoor.Reason.${reason}`, { name: actor.name }),
    lines: death.lines
  }, death.rolls);
  return death.dead;
}

/** Whether a character has died (module/days.mjs leaves the dead out of a new day). */
export function isDead(actor) {
  return stateOf(actor)?.stage === "dead";
}

/**
 * Before a character takes damage: at Death's Door any damage kills.
 * @param {Actor} actor
 * @param {number} damage  Damage after armour.
 * @returns {Promise<boolean>}  Whether the damage killed them; if so, do not apply it.
 */
export async function killedByDamage(actor, damage) {
  const alive = atDeathsDoor(actor) && stateOf(actor)?.stage !== "dead";
  if (!killingBlow(alive, damage)) return false;
  await killCharacter(actor, "killingBlow");
  return true;
}

/**
 * At the end of the character's own turn in combat, an unconscious
 * character's rounds go down by one; at 0 they wake (GAPS 92).
 * @param {Actor} actor
 */
export async function countDownWaking(actor) {
  const state = stateOf(actor);
  if (state?.stage !== "waking" || !atDeathsDoor(actor)) return;
  const next = countDown(state.turns, state.freshTurn);
  if (next.ends) await wake(actor, state.wakeHp);
  else await actor.setFlag(SYSTEM, "deathsDoor", { ...state, turns: next.turnsLeft, freshTurn: false });
}

async function postCard(actor, data, rolls = []) {
  const button = data.button ? { ...data.button, actorUuid: actor.uuid } : null;
  const content = await renderTemplate(CARD_TEMPLATE, { ...data, button });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.localize("VARBORG.DeathsDoor.Title"),
    content,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : undefined
  });
}

/** Each card button works while the character is still at that stage. */
const BUTTON_STAGES = { rollDeathsDoor: "roll", deathsDoorTest: "test" };

/**
 * Buttons on Death's Door cards, for the character's owner: roll on the
 * table, and row 2's Sanity test.
 */
function addDeathsDoorCardListeners(message, html) {
  for (const [action, stage] of Object.entries(BUTTON_STAGES)) {
    const button = html.querySelector(`button[data-action='${action}']`);
    if (!button) continue;
    const actor = fromUuidSync(button.dataset.actorUuid);
    if (stateOf(actor)?.stage !== stage) {
      button.disabled = true;
      continue;
    }
    button.addEventListener("click", async () => {
      const current = await fromUuid(button.dataset.actorUuid);
      if (!current?.isOwner) {
        ui.notifications.warn(game.i18n.format("VARBORG.Defence.NotYours", { name: current?.name ?? "" }));
        return;
      }
      if (stateOf(current)?.stage !== stage) {
        button.disabled = true;
        return;
      }
      button.disabled = true;
      const done = action === "rollDeathsDoor" ? await askAndRoll(current) : await darkPullTest(current);
      // Dialog closed without rolling: it can still be done.
      if (!done) button.disabled = false;
    });
  }
}

/** The Death's Door part of a character's Conditions section, or null for a foe. */
export function sheetDeathsDoor(actor) {
  if (actor.type !== "character") return null;
  const i18n = game.i18n;
  const flagged = stateOf(actor);
  const state = atDeathsDoor(actor) || flagged?.stage === "dead" ? flagged : null;
  let status = null;
  if (state?.stage === "roll") status = i18n.localize("VARBORG.DeathsDoor.StageRoll");
  else if (state?.stage === "test") status = i18n.format("VARBORG.DeathsDoor.StageTest", { dr: state.dr });
  else if (state?.stage === "waking") {
    status = i18n.format("VARBORG.DeathsDoor.StageWaking", { rounds: roundsText(state.turns), hp: hpText(state.wakeHp) });
  } else if (state?.stage === "dead") status = i18n.localize("VARBORG.DeathsDoor.StageDead");
  return {
    darkVessels: actor.system.darkVessels,
    isGM: game.user.isGM,
    status,
    canRoll: state?.stage === "roll",
    canWake: state?.stage === "waking" && game.user.isGM,
    lostParts: actor.effects.filter(effect => effect.getFlag(SYSTEM, "bodyPart"))
      .map(effect => ({ id: effect.id, img: effect.img, label: effect.name, text: effect.description }))
  };
}

/** The sheet's Death's Door controls. Called from activateConditionControls. */
export function activateDeathsDoorControls(element, actor) {
  element.querySelector("[data-roll-deaths-door]")?.addEventListener("click", async event => {
    if (stateOf(actor)?.stage !== "roll") return;
    event.currentTarget.disabled = true;
    if (!await askAndRoll(actor)) event.currentTarget.disabled = false;
  });
  element.querySelector("[data-wake]")?.addEventListener("click", () => {
    const state = stateOf(actor);
    if (state?.stage === "waking") wake(actor, state.wakeHp);
  });
  for (const button of element.querySelectorAll("[data-remove-part]")) {
    button.addEventListener("click", () => actor.effects.get(button.dataset.removePart)?.delete());
  }
}
