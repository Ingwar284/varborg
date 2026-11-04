/**
 * Condition timers in Foundry (GAPS 129–131).
 *
 * A timer is kept on the condition's status effect (flags.var-borg.timer).
 * In combat the Dark Master's client counts it down: rounds at the end of
 * the creature's own turns, "until the start of its next turn" when its
 * turn starts (module/combat.mjs). When combat ends, every timed condition
 * ends. Outside combat nothing counts down; the timer waits for the next
 * fight's end, or the condition is removed by hand. "Until the next day
 * begins" is the exception: it outlasts combat and ends at the next new
 * day (module/days.mjs, GAPS 161).
 *
 * Timers are set by a gloom ability's Take button (module/dice/defence.mjs)
 * or by the clock button beside a condition on the sheet.
 *
 * The maths lives in module/rules/timers.mjs.
 */

import {
  TIMER_KINDS, isRoundsFormula, newTimer, timerAtEndOfTurn, timerAtStartOfTurn, timerEndsWithCombat,
  timerEndsWithNewDay, longerTimer
} from "./rules/timers.mjs";
import { turnState } from "./combat.mjs";

const SYSTEM = "var-borg";
const FLAG = "timer";

const { DialogV2 } = foundry.applications.api;

/** The status effect that gives this condition, if the actor has it. */
function conditionEffect(actor, id) {
  return actor?.effects.find(effect => effect.statuses.has(id) && !effect.getFlag(SYSTEM, "panic") && !effect.getFlag(SYSTEM, "agony")) ?? null;
}

/** The condition's timer, or null when it has none. */
export function conditionTimer(actor, id) {
  return conditionEffect(actor, id)?.getFlag(SYSTEM, FLAG) ?? null;
}

/** "3 rounds left", "until the start of its next turn"... for the sheet and chat. */
export function timerText(timer) {
  const i18n = game.i18n;
  if (!timer) return "";
  if (timer.kind === "rounds") return i18n.format(timer.rounds === 1 ? "VARBORG.Timer.RoundLeft" : "VARBORG.Timer.RoundsLeft", { rounds: timer.rounds });
  return i18n.localize(`VARBORG.Timer.Kind.${timer.kind}`);
}

/**
 * Roll a timer from what an ability or the sheet asks for.
 * @param {{kind: string, rounds?: string}} spec  kind "" means no timer.
 * @returns {Promise<{timer: object|null, roll: Roll|null}>}
 */
async function rollTimer(actor, spec) {
  if (!spec || !TIMER_KINDS.includes(spec.kind)) return { timer: null, roll: null };
  let rounds = null;
  let roll = null;
  if (spec.kind === "rounds") {
    if (!isRoundsFormula(spec.rounds)) {
      ui.notifications.warn(game.i18n.format("VARBORG.Timer.BadRounds", { rounds: spec.rounds ?? "" }));
      return { timer: null, roll: null };
    }
    roll = await new Roll(String(spec.rounds).trim()).evaluate();
    rounds = Math.max(1, roll.total);
  }
  return { timer: newTimer(spec.kind, { rounds, ownTurn: turnState(actor).onOwnTurn }), roll };
}

/**
 * Give a condition with a timer. If the creature has it already, it keeps
 * whichever lasts longer (GAPS 131).
 * @param {Actor} actor
 * @param {string} id     The condition.
 * @param {{kind: string, rounds?: string}|null} spec
 * @returns {Promise<string>} A line for the chat card, such as "Deafened for 3 rounds (d4)."
 */
export async function addTimedCondition(actor, id, spec) {
  const i18n = game.i18n;
  const condition = i18n.localize(`VARBORG.Condition.${id}`);
  const had = actor.statuses.has(id);
  const current = had ? conditionTimer(actor, id) : null;
  const { timer, roll } = await rollTimer(actor, spec);
  if (!had) await actor.toggleStatusEffect(id, { active: true });
  const keep = had ? longerTimer(current, timer) : timer;
  const effect = conditionEffect(actor, id);
  if (effect && keep && keep !== current) await effect.setFlag(SYSTEM, FLAG, keep);

  const parts = [i18n.format("VARBORG.Gloom.Became", { name: actor.name, condition })];
  if (keep) parts.push(i18n.format(roll && !roll.isDeterministic ? "VARBORG.Timer.ForRolled" : "VARBORG.Timer.For", {
    time: timerText(keep), formula: roll?.formula ?? ""
  }));
  if (had && timer && keep === current) parts.push(i18n.localize("VARBORG.Timer.KeptLonger"));
  return parts.join(" ");
}

/** Remove a condition whose time is up, with a chat line. */
async function endCondition(actor, effect) {
  const names = [...effect.statuses].map(id => game.i18n.localize(`VARBORG.Condition.${id}`)).join(", ");
  await effect.delete();
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${game.i18n.format("VARBORG.Timer.Ended", { name: actor.name, condition: names })}</p></div>`
  });
}

/** Every timed condition the actor has. */
function timedEffects(actor) {
  return (actor?.effects ?? []).filter(effect => effect.getFlag(SYSTEM, FLAG));
}

/** Start of the creature's turn: "until the start of its next turn" ends. */
export async function startOfTurnTimers(actor) {
  for (const effect of timedEffects(actor)) {
    if (timerAtStartOfTurn(effect.getFlag(SYSTEM, FLAG)).ends) await endCondition(actor, effect);
  }
}

/** End of the creature's turn: rounds count down (GAPS 129). */
export async function endOfTurnTimers(actor) {
  for (const effect of timedEffects(actor)) {
    const next = timerAtEndOfTurn(effect.getFlag(SYSTEM, FLAG));
    if (next.ends) await endCondition(actor, effect);
    else await effect.setFlag(SYSTEM, FLAG, next.timer);
  }
}

/** Combat ended: every timed condition of those who fought ends (GAPS 130). */
export async function endCombatTimers(actors) {
  for (const actor of new Set(actors)) {
    for (const effect of timedEffects(actor)) {
      if (timerEndsWithCombat(effect.getFlag(SYSTEM, FLAG))) await endCondition(actor, effect);
    }
  }
}

/** A new day begins: "until the next day begins" ends (rules 3.16, GAPS 161). */
export async function endNewDayTimers(actors) {
  for (const actor of new Set(actors)) {
    for (const effect of timedEffects(actor)) {
      if (timerEndsWithNewDay(effect.getFlag(SYSTEM, FLAG))) await endCondition(actor, effect);
    }
  }
}

/**
 * The clock button beside a condition: set, change or clear its timer.
 * A timer set by hand replaces the old one.
 */
export async function askConditionTimer(actor, id) {
  const i18n = game.i18n;
  const timer = conditionTimer(actor, id);
  const options = [["", "VARBORG.Timer.None"], ...TIMER_KINDS.map(kind => [kind, `VARBORG.Timer.Kind.${kind}`])]
    .map(([value, key]) => `<option value="${value}" ${(timer?.kind ?? "") === value ? "selected" : ""}>${i18n.localize(key)}</option>`)
    .join("");
  const content = `<div class="var-borg-test-dialog">
    <p class="hint">${i18n.localize("VARBORG.Timer.DialogHint")}</p>
    <div class="form-group"><label>${i18n.localize("VARBORG.Timer.KindLabel")}</label><select name="kind">${options}</select></div>
    <div class="form-group"><label>${i18n.localize("VARBORG.Timer.RoundsLabel")}</label>
      <input type="text" name="rounds" value="${timer?.kind === "rounds" ? timer.rounds : "1"}" placeholder="d4">
      <p class="hint">${i18n.localize("VARBORG.Timer.RoundsHint")}</p></div>
  </div>`;
  const data = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Timer.DialogTitle", { condition: i18n.localize(`VARBORG.Condition.${id}`), name: actor.name }) },
    content,
    ok: { label: "VARBORG.Timer.Set", icon: "fa-solid fa-hourglass-half" },
    rejectClose: false
  });
  if (!data) return;
  const effect = conditionEffect(actor, id);
  if (!effect) return;
  if (!data.kind) {
    await effect.unsetFlag(SYSTEM, FLAG);
    return;
  }
  const rolled = await rollTimer(actor, { kind: data.kind, rounds: data.rounds });
  if (!rolled.timer) return;
  await effect.setFlag(SYSTEM, FLAG, rolled.timer);
  if (rolled.roll && !rolled.roll.isDeterministic) {
    await rolled.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: i18n.format("VARBORG.Timer.RolledFlavour", { condition: i18n.localize(`VARBORG.Condition.${id}`) })
    });
  }
}
