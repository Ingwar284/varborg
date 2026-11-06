/**
 * What powers and spells do to their targets and user, in Foundry (step
 * 51c, GAPS 219–221). The rules live in module/rules/outcomes.mjs.
 *
 * When a power's card is worked out (module/dice/attack.mjs,
 * settleAttackCard), settleOutcomes gives what the result gives and takes
 * back what an earlier result gave and this one does not. What was given
 * is kept in the card's Fortune data (applied.outcomes), with what is
 * needed to take it back: whether the creature had the condition already,
 * how much HP it regained, the buff item's id.
 *
 * A change to a creature the user cannot change is made by the Dark
 * Master's client (a query), as Fortune does.
 *
 * A buff is a feat item on the creature, named after the power, with the
 * power's buff effects; it ends with its timer (module/timers.mjs) or,
 * from a Sustained power, when the power ends. Effects on the user of a
 * Sustained power end with it too (GAPS 220).
 */

import { wantedOutcomes, outcomeDiff } from "./rules/outcomes.mjs";
import { addTimedCondition, rollTimer } from "./timers.mjs";

const SYSTEM = "var-borg";
const QUERY = "var-borg.outcome";

/** Register the Dark Master's side and the end of Sustained powers. */
export function registerOutcomes() {
  CONFIG.queries[QUERY] = request => runOp(request);
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if (userId !== game.user.id) return;
    if (!["power", "spell"].includes(item.type) || changes.system?.sustaining !== false) return;
    endSustainedOutcomes(item);
  });
}

/**
 * The outcome inputs of a power or spell card: its entries, buff, the
 * targets and the user.
 * @param {Actor} actor  The user.
 * @param {Item} power
 * @returns {object|null}  Null when the power gives nothing.
 */
export function outcomeInputs(actor, power) {
  const entries = power.system.outcomeEffects ?? [];
  if (!entries.length) return null;
  return {
    entries: entries.map(entry => foundry.utils.deepClone(entry)),
    buffEffects: foundry.utils.deepClone(power.toObject().system.buffEffects ?? []),
    name: power.name,
    // Effects from a Sustained power end with it (GAPS 220, 221).
    sustained: Boolean(power.system.sustained),
    source: `${actor.uuid}|${power.id}`,
    targets: [...game.user.targets].map(token => token.actor?.uuid).filter(Boolean),
    user: actor.uuid
  };
}

/**
 * Give and take back what the card's result gives (GAPS 219).
 * @param {object} data  The card's Fortune data (applied.outcomes is changed).
 * @param {string} tier  The card's result.
 * @returns {Promise<{lines: string[], rolls: Roll[]}>}  Lines for the card: what this result gives.
 */
export async function settleOutcomes(data, tier) {
  const inputs = data.inputs.outcomes;
  if (!inputs) return { lines: [], rolls: [] };
  const wanted = wantedOutcomes(inputs.entries, tier, inputs);
  const { add, keep, remove } = outcomeDiff(data.applied.outcomes ?? [], wanted);
  const rolls = [];
  for (const done of remove) await doOp({ op: "undo", done });
  const added = [];
  for (const want of add) {
    const entry = inputs.entries[want.index];
    const op = { op: "give", actorUuid: want.actorUuid, entry, name: inputs.name, source: inputs.source, sustained: inputs.sustained && entry.who === "self" };
    if (entry.kind === "buff") {
      op.effects = inputs.buffEffects;
      op.sustained = inputs.sustained;
    }
    // Healing is rolled here, so the card shows the dice.
    if (entry.kind === "heal") {
      const roll = await new Roll(String(entry.amount || "0")).evaluate();
      rolls.push(roll);
      op.amount = roll.total;
    }
    const result = await doOp(op);
    added.push({ key: want.key, actorUuid: want.actorUuid, kind: entry.kind, ...(result ?? {}) });
  }
  data.applied.outcomes = [...keep, ...added];
  const lines = data.applied.outcomes.map(done => done.line).filter(Boolean);
  return { lines, rolls };
}

/** Do one change here when this user may, otherwise on the Dark Master's client. */
async function doOp(op) {
  const uuid = op.actorUuid ?? op.done?.actorUuid;
  const actor = uuid ? await fromUuid(uuid) : null;
  if (!actor) return null;
  if (actor.isOwner) return runOp(op);
  const gm = game.users.activeGM;
  if (!gm) {
    ui.notifications.warn(game.i18n.localize("VARBORG.Outcome.NoGM"));
    return null;
  }
  try {
    return await gm.query(QUERY, op, { timeout: 30000 });
  } catch (error) {
    console.error("VÅR BORG | Outcome query failed", error);
    return null;
  }
}

/**
 * One change: give an entry to a creature, or take it back.
 * @returns {Promise<object|null>}  For "give": what is needed to take it back, and the card line.
 */
async function runOp(op) {
  if (op.op === "undo") return undoOutcome(op.done);
  const actor = await fromUuid(op.actorUuid);
  if (!actor) return null;
  const i18n = game.i18n;
  const entry = op.entry;
  switch (entry.kind) {
    case "condition": {
      if (!entry.condition) return null;
      const had = actor.statuses.has(entry.condition);
      // A Sustained power's condition on its user lasts as long as the power (GAPS 220).
      const spec = op.sustained ? null : entry.duration;
      const line = await addTimedCondition(actor, entry.condition, spec);
      if (op.sustained && !had) await markSustained(actor, op.source, { condition: entry.condition });
      return { condition: entry.condition, had, line: noted(line, entry.note) };
    }
    case "heal": {
      const hp = actor.system.hp;
      if (!hp) return null;
      const from = hp.value;
      const to = Math.min(hp.max ?? Infinity, from + (op.amount ?? 0));
      if (to !== from) await actor.update({ "system.hp.value": to });
      return { healed: to - from, line: noted(i18n.format("VARBORG.Outcome.Healed", { name: actor.name, amount: to - from, from, to }), entry.note) };
    }
    case "buff": {
      const { timer } = await rollTimer(actor, entry.duration);
      const [item] = await actor.createEmbeddedDocuments("Item", [{
        name: i18n.format("VARBORG.Outcome.BuffName", { power: op.name }),
        type: "feat",
        img: "icons/svg/aura.svg",
        system: { description: entry.note || "", source: "general", effects: op.effects ?? [], automation: "auto" },
        flags: { [SYSTEM]: { buff: { source: op.source, sustained: Boolean(op.sustained) }, ...(timer ? { timer } : {}) } }
      }]);
      return { itemId: item?.id ?? null, line: noted(i18n.format("VARBORG.Outcome.Buffed", { name: actor.name, power: op.name }), entry.note) };
    }
    default:
      return { line: noted(i18n.format("VARBORG.Outcome.Reminder", { name: actor.name }), entry.note) };
  }
}

/** "Ghoul is Prone. (it is knocked back 10')" */
function noted(line, note) {
  return note ? `${line} (${note})` : line;
}

/** Take back what was given: the condition if it was new, the HP, the buff. */
async function undoOutcome(done) {
  const actor = done ? await fromUuid(done.actorUuid) : null;
  if (!actor) return null;
  if (done.kind === "condition" && done.condition && !done.had && actor.statuses.has(done.condition)) {
    await actor.toggleStatusEffect(done.condition, { active: false });
  }
  if (done.kind === "heal" && done.healed) {
    await actor.update({ "system.hp.value": Math.max(0, actor.system.hp.value - done.healed) });
  }
  if (done.kind === "buff" && done.itemId) await actor.items.get(done.itemId)?.delete();
  return null;
}

/** Remember a condition a Sustained power gave its user, on the user. */
async function markSustained(actor, source, mark) {
  const list = actor.getFlag(SYSTEM, "sustainedConditions") ?? [];
  await actor.setFlag(SYSTEM, "sustainedConditions", [...list, { source, ...mark }]);
}

/**
 * A Sustained power ended (GAPS 220, 221): its user's conditions from it
 * and every buff it gave end. Run by the client that ended it; buffs on
 * creatures this user cannot change are ended by the Dark Master.
 * @param {Item} power
 */
export async function endSustainedOutcomes(power) {
  const user = power.actor;
  if (!user) return;
  const source = `${user.uuid}|${power.id}`;
  const i18n = game.i18n;
  const ended = [];
  const marks = user.getFlag(SYSTEM, "sustainedConditions") ?? [];
  const mine = marks.filter(mark => mark.source === source);
  if (mine.length && user.isOwner) {
    for (const mark of mine) {
      if (user.statuses.has(mark.condition)) await user.toggleStatusEffect(mark.condition, { active: false });
      ended.push(i18n.localize(`VARBORG.Condition.${mark.condition}`));
    }
    await user.setFlag(SYSTEM, "sustainedConditions", marks.filter(mark => mark.source !== source));
  }
  for (const actor of actorsWithBuffs()) {
    for (const item of actor.items.filter(other => other.getFlag(SYSTEM, "buff")?.source === source && other.getFlag(SYSTEM, "buff")?.sustained)) {
      const done = { actorUuid: actor.uuid, kind: "buff", itemId: item.id };
      await doOp({ op: "undo", done });
      ended.push(i18n.format("VARBORG.Outcome.BuffOf", { name: actor.name }));
    }
  }
  if (!ended.length) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: user }),
    content: `<div class="var-borg-card"><p>${foundry.utils.escapeHTML(i18n.format("VARBORG.Outcome.SustainEnded", { power: power.name, list: ended.join(", ") }))}</p></div>`
  });
}

/** The actors that may hold buffs: the Actors tab, and unlinked tokens on scenes. */
function actorsWithBuffs() {
  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.push(token.actor);
  }
  return actors;
}
