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

import { wantedOutcomes, outcomeDiff, buffEffectsFor, isMorphPower } from "./rules/outcomes.mjs";
import { addTimedCondition, rollTimer, conditionEffect } from "./timers.mjs";
import { addPersistentDamage, persistentEffects } from "./persistent.mjs";
import { stepDownArmourDie } from "./rules/attack.mjs";
import { removeSustainedAreas } from "./areas.mjs";
import { withStudied, withoutStudied } from "./rules/item-effects.mjs";

const SYSTEM = "var-borg";
const QUERY = "var-borg.outcome";

/** The Thrall stat block (content/foes), raised by Call the Unburied. */
const THRALL_STAT_BLOCK = "Compendium.var-borg.foes.Actor.vbFoeThrall00000";

/** The Photonic Surge table (content/tables). */
const SURGE_TABLE = "Compendium.var-borg.tables.RollTable.vbTableSurge0000";

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
    morph: isMorphPower(power.system.description),
    // Effects from a Sustained power end with it (GAPS 220, 221).
    sustained: Boolean(power.system.sustained),
    source: `${actor.uuid}|${power.id}`,
    targets: [...game.user.targets].map(token => token.actor?.uuid).filter(Boolean),
    allyTargets: [...game.user.targets].map(token => token.actor).filter(other => ["character", "minion"].includes(other?.type)).map(other => other.uuid),
    foeTargets: [...game.user.targets].map(token => token.actor).filter(other => other?.type === "foe").map(other => other.uuid),
    user: actor.uuid,
    // The dance partner named this encounter (GAPS 222), and the options chosen in the dialog (GAPS 224).
    partner: partnerOf(actor)?.uuid ?? "",
    chosen: []
  };
}

/** The current combat's id, or "" outside combat. */
function combatKey() {
  return game.combat?.started ? game.combat.id : "";
}

/**
 * The mark of this kind on the actor (its flag), or null when there is none
 * or it was made in an earlier combat.
 * @param {Actor} actor
 * @returns {{uuid: string, name: string}|null}
 */
export function markOf(actor, kind) {
  const mark = actor?.getFlag?.(SYSTEM, kind);
  return mark && mark.combat === combatKey() ? mark : null;
}

/** The dance partner (GAPS 222). */
export function partnerOf(actor) {
  const partner = actor?.getFlag?.(SYSTEM, "partner");
  return partner && partner.combat === combatKey() ? partner : null;
}

/**
 * Give and take back what the card's result gives (GAPS 219).
 * @param {object} data  The card's Fortune data (applied.outcomes is changed).
 * @param {string} tier  The card's result.
 * @returns {Promise<{lines: string[], rolls: Roll[]}>}  Lines for the card: what this result gives.
 */
export async function settleOutcomes(data, tier, { damage = 0 } = {}) {
  const inputs = data.inputs.outcomes;
  if (!inputs) return { lines: [], rolls: [] };
  const wanted = wantedOutcomes(inputs.entries, tier, inputs);
  const { add, keep, remove } = outcomeDiff(data.applied.outcomes ?? [], wanted);
  const rolls = [];
  for (const done of remove) await doOp({ op: "undo", done });
  const added = [];
  for (const want of add) {
    const entry = inputs.entries[want.index];
    // On the user of a Sustained power (GAPS 220), or "while sustained" on its targets (GAPS 233).
    const op = { op: "give", actorUuid: want.actorUuid, entry, name: inputs.name, source: inputs.source, sustained: inputs.sustained && (entry.who === "self" || entry.whileSustained), user: inputs.user };
    if (entry.kind === "buff") {
      // Only this option's buff effects (Morphic Surge), and Morph replaces Morph (GAPS 226).
      op.effects = buffEffectsFor(inputs.buffEffects, entry.option);
      op.morph = Boolean(inputs.morph);
      op.sustained = inputs.sustained;
    }
    // Healing and damage are rolled here, so the card shows the dice.
    if (entry.kind === "heal" && entry.amount === "damage") op.amount = damage ?? 0;
    else if (["heal", "damage"].includes(entry.kind) && entry.amount !== "full") {
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

/**
 * A gloom ability's "What it gives" for the character who took its result
 * (step 52c): entries for that result, for the target or the targeted
 * allies, given once when Take is pressed (the card is then settled, so
 * nothing is taken back). Entries on the foe itself are left out: each
 * character's test would give them again.
 * @param {Actor} actor    The character who took the result.
 * @param {object} gives   From outcomeInputs for the gloom ability.
 * @param {string} tier    The character's result.
 * @returns {Promise<{lines: string[], rolls: Roll[]}>}
 */
export async function giveGloomOutcomes(actor, gives, tier) {
  if (!gives?.entries?.length || !actor) return { lines: [], rolls: [] };
  const entries = gives.entries.map(entry => (entry.who === "self" ? { ...entry, tiers: {} } : entry));
  const wanted = wantedOutcomes(entries, tier, { targets: [actor.uuid], allyTargets: [actor.uuid] });
  const lines = [];
  const rolls = [];
  for (const want of wanted) {
    const entry = entries[want.index];
    const op = { op: "give", actorUuid: actor.uuid, entry, name: gives.name, source: gives.source, sustained: false, user: gives.user };
    if (entry.kind === "buff") op.effects = buffEffectsFor(gives.buffEffects, entry.option);
    if (["heal", "damage"].includes(entry.kind) && !["full", "damage"].includes(entry.amount)) {
      const roll = await new Roll(String(entry.amount || "0")).evaluate();
      rolls.push(roll);
      op.amount = roll.total;
    }
    const result = await doOp(op);
    if (result?.line) lines.push(result.line);
  }
  return { lines, rolls };
}

/**
 * What a gloom ability's Take button will also give for a result, in a
 * few words each, for the card (step 52c).
 * @param {object} gives  From outcomeInputs.
 * @param {string} tier
 * @returns {string[]}
 */
export function gloomGivesText(gives, tier) {
  const i18n = game.i18n;
  if (!gives?.entries?.length) return [];
  const entries = gives.entries.map(entry => (entry.who === "self" ? { ...entry, tiers: {} } : entry));
  return wantedOutcomes(entries, tier, { targets: ["x"], allyTargets: ["x"] }).map(want => {
    const entry = entries[want.index];
    if (entry.note) return entry.note;
    if (entry.kind === "persistent") return i18n.format("VARBORG.Gloom.GivesPersistent", { amount: entry.amount, type: i18n.localize(`VARBORG.DamageType.${entry.damageType}`).toLowerCase() });
    if (entry.kind === "condition" && entry.condition) return i18n.localize(`VARBORG.Condition.${entry.condition}`);
    return i18n.localize(`VARBORG.Outcome.Kind.${entry.kind}`);
  });
}

/** Do one change here when this user may, otherwise on the Dark Master's client. */
async function doOp(op) {
  const uuid = op.actorUuid ?? op.done?.actorUuid;
  const actor = uuid ? await fromUuid(uuid) : null;
  if (!actor) return null;
  // Raising thralls makes actors, which players often may not (GAPS 225).
  const needsGM = op.entry?.kind === "thralls" && !game.user.can("ACTOR_CREATE");
  if (actor.isOwner && !needsGM) return runOp(op);
  return askGM(op);
}

/** Send a change to the Dark Master's client. */
async function askGM(op) {
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
  const extra = await runOp51d(actor, op);
  if (extra) return extra;
  switch (entry.kind) {
    case "condition": {
      if (!entry.condition) return null;
      const had = actor.statuses.has(entry.condition);
      // A Sustained power's condition on its user lasts as long as the power (GAPS 220).
      // "While sustained" on targets keeps its own timer too, such as an escape roll (GAPS 233, 234).
      const spec = op.sustained && !entry.whileSustained ? null : entry.duration;
      const line = await addTimedCondition(actor, entry.condition, spec);
      if (!had) await markConditionSource(actor, entry, op.name);
      if (op.sustained && !had) await markSustained(actor, op.source, { condition: entry.condition, option: entry.option || "" });
      return { condition: entry.condition, had, line: noted(line, entry.note) };
    }
    case "heal": {
      const hp = actor.system.hp;
      if (!hp) return null;
      const from = hp.value;
      // "full": back to maximum HP (Absolution).
      const to = entry.amount === "full" ? (hp.max ?? from) : Math.min(hp.max ?? Infinity, from + (op.amount ?? 0));
      if (to !== from) await actor.update({ "system.hp.value": to });
      return { healed: to - from, line: noted(i18n.format("VARBORG.Outcome.Healed", { name: actor.name, amount: to - from, from, to }), entry.note) };
    }
    case "buff": {
      // A new Morph undoes the last (GAPS 226).
      if (op.morph) {
        const old = actor.items.filter(item => item.getFlag(SYSTEM, "buff")?.morph).map(item => item.id);
        if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
      }
      const { timer } = await rollTimer(actor, entry.duration);
      const [item] = await actor.createEmbeddedDocuments("Item", [{
        name: entry.option
          ? i18n.format("VARBORG.Outcome.BuffNameOption", { power: op.name, option: entry.option })
          : i18n.format("VARBORG.Outcome.BuffName", { power: op.name }),
        type: "feat",
        img: "icons/svg/aura.svg",
        system: { description: entry.note || "", source: "general", effects: op.effects ?? [], automation: "auto" },
        flags: { [SYSTEM]: { buff: { source: op.source, sustained: Boolean(op.sustained), nextOnly: Boolean(entry.nextOnly), morph: Boolean(op.morph) }, ...(timer ? { timer } : {}) } }
      }]);
      return { itemId: item?.id ?? null, line: noted(i18n.format("VARBORG.Outcome.Buffed", { name: actor.name, power: op.name }), entry.note) };
    }
    default:
      return { line: noted(i18n.format("VARBORG.Outcome.Reminder", { name: actor.name }), entry.note) };
  }
}

/**
 * The kinds step 51d added: persistent damage, damage, armour lowered,
 * Fatigued and the dance partner. null for the other kinds.
 */
async function runOp51d(actor, op) {
  const i18n = game.i18n;
  const entry = op.entry;
  switch (entry.kind) {
    case "persistent": {
      const before = new Set(persistentEffects(actor).map(effect => effect.id));
      if (!(await addPersistentDamage(actor, entry.damageType, entry.amount))) return { line: "" };
      const added = persistentEffects(actor).find(effect => !before.has(effect.id));
      const type = i18n.localize(`VARBORG.DamageType.${entry.damageType}`).toLowerCase();
      return { effectId: added?.id ?? null, line: noted(i18n.format("VARBORG.Outcome.Persistent", { name: actor.name, amount: entry.amount, type }), entry.note) };
    }
    case "damage": {
      const hp = actor.system.hp;
      if (!hp) return { line: "" };
      let amount = op.amount ?? 0;
      // Armour soaks it only when the entry says so; a hit still deals 1.
      if (entry.soaked && amount > 0) {
        const die = actor.type === "foe" ? actor.system.armour : (await import("./dice/defence.mjs")).defenceModifiers(actor).soakDie;
        if (die) amount = Math.max(1, amount - (await new Roll(die).evaluate()).total);
      }
      const { killedByDamage } = await import("./deaths-door.mjs");
      if (actor.type === "character" && await killedByDamage(actor, amount)) return { line: "" };
      const from = hp.value;
      const to = Math.max(0, from - amount);
      await actor.update({ "system.hp.value": to });
      // As saved: a foe's own rule (Abandon Shell) can leave it at 1 HP.
      const saved = actor.system.hp.value;
      // A foe brought to 0 HP is defeated, as a weapon attack does it (GAPS 71; the step vehicles.mjs also uses).
      let defeatedCombatants = null;
      if (actor.type === "foe" && saved === 0 && from > 0) {
        defeatedCombatants = (game.combat?.combatants ?? []).filter(c => c.actor?.uuid === actor.uuid && !c.defeated).map(c => c.id);
        const { markDefeated } = await import("./dice/morale.mjs");
        await markDefeated(actor);
      }
      return { dealt: from - saved, defeated: defeatedCombatants !== null, defeatedCombatants: defeatedCombatants ?? [], line: noted(i18n.format("VARBORG.Outcome.Damaged", { name: actor.name, amount, from, to: saved }), entry.note) };
    }
    case "lowerArmour": {
      if (actor.type !== "foe" || !actor.system.armour) return { line: "" };
      const from = actor.system.armour;
      const to = stepDownArmourDie(from);
      if (!actor.getFlag(SYSTEM, "armourBefore")) await actor.setFlag(SYSTEM, "armourBefore", { combat: game.combat?.id ?? "", die: from });
      await actor.update({ "system.armour": to });
      const label = die => i18n.localize(`VARBORG.Foe.Armour.${die || "none"}`);
      return { armourFrom: from, line: noted(i18n.format("VARBORG.Outcome.ArmourLowered", { name: actor.name, from: label(from), to: label(to) }), entry.note) };
    }
    case "fatigue": {
      if (actor.system.fatigue === undefined) return { line: "" };
      const level = (actor.system.fatigue ?? 0) + 1;
      await actor.update({ "system.fatigue": level });
      // Immune to Fatigued (step 52a): the level stayed, and a warning said why.
      if ((actor.system.fatigue ?? 0) < level) return { line: "" };
      return { fatigued: true, line: noted(i18n.format("VARBORG.Outcome.Fatigued", { name: actor.name, level }), entry.note) };
    }
    case "cure": {
      if (!entry.condition || !actor.statuses.has(entry.condition)) return { line: "" };
      await actor.toggleStatusEffect(entry.condition, { active: false });
      const condition = i18n.localize(`VARBORG.Condition.${entry.condition}`);
      return { cured: entry.condition, line: noted(i18n.format("VARBORG.Outcome.Cured", { name: actor.name, condition }), entry.note) };
    }
    case "thralls": {
      // Raise thralls next to the user (GAPS 225), as Raise thrall does.
      const { raiseThrall } = await import("./minions.mjs");
      const ids = [];
      const count = Math.max(0, Math.trunc(Number(entry.amount) || 0));
      for (let i = 0; i < count; i++) {
        const done = await raiseThrall(actor, { gift: THRALL_STAT_BLOCK, item: op.name, itemId: "" });
        if (done.thrallId) ids.push(done.thrallId);
      }
      return { thrallIds: ids, line: noted(i18n.format("VARBORG.Outcome.ThrallsRaised", { name: actor.name, count: ids.length }), entry.note) };
    }
    case "rigDamage": {
      // The rig the user is aboard (GAPS 228).
      const rig = game.actors.find(other => other.type === "vehicle" && (other.system.occupants ?? []).some(occupant => occupant.uuid === actor.uuid));
      if (!rig) return { line: i18n.format("VARBORG.Outcome.NoRig", { name: actor.name }) };
      // Not this user's rig: the Dark Master's client does the damage (REVIEW B5). No GM: nothing, as other outcomes.
      if (!rig.isOwner && !game.user.isGM) return (await askGM(op)) ?? { line: "" };
      let amount = (await new Roll(String(entry.amount || "0")).evaluate()).total;
      if (entry.soaked && rig.system.armour) amount = Math.max(1, amount - (await new Roll(rig.system.armour).evaluate()).total);
      const from = rig.system.hp.value;
      const to = Math.max(0, from - amount);
      if (rig.isOwner) await rig.update({ "system.hp.value": to });
      return { rigUuid: rig.uuid, rigDealt: from - to, line: noted(i18n.format("VARBORG.Outcome.RigHurt", { name: rig.name, amount, from, to }), entry.note) };
    }
    case "surge": {
      // A Photonic Surge: the table, and items that act on a surge (Harmonious Light).
      const table = await fromUuid(SURGE_TABLE).catch(() => null);
      if (table) await table.draw({ displayChat: true });
      const { runItemHooks } = await import("./effects.mjs");
      if (actor.type === "character") await runItemHooks(actor, "surge");
      return { line: noted(i18n.localize("VARBORG.Outcome.SurgeTriggered"), entry.note) };
    }
    case "quarry":
    case "subject": {
      // The targeted foe becomes the user's quarry or subject this encounter (GAPS 230).
      const user = op.user ? await fromUuid(op.user) : null;
      if (!user || user === actor) return { line: "" };
      if (user.isOwner) await user.setFlag(SYSTEM, entry.kind, { uuid: actor.uuid, name: actor.name, combat: combatKey() });
      // Studied in a combat: Field notes records it when the combat ends.
      if (entry.kind === "subject" && user.isOwner && combatKey()) {
        const studied = withStudied(user.getFlag(SYSTEM, "studied"), combatKey(), { uuid: actor.uuid, name: actor.name, img: actor.img, actorId: actor.id });
        await user.setFlag(SYSTEM, "studied", studied);
      }
      return { markedBy: user.uuid, mark: entry.kind, line: noted(i18n.format(`VARBORG.Outcome.${entry.kind === "quarry" ? "Quarry" : "Subject"}`, { name: actor.name, user: user.name }), entry.note) };
    }
    case "ember": {
      // The Ember pool gains it, in combat only (Unravel); a negative amount
      // is lost from it (Purge Pulse: "-1", step 52c).
      const { gainEmber, loseEmber } = await import("./pools.mjs");
      if (!game.combat?.started) return { line: i18n.format("VARBORG.Effects.HookEmberNoCombat", { item: op.name }) };
      const text = String(entry.amount || "0").trim();
      const losing = text.startsWith("-");
      const amount = (await new Roll(losing ? text.slice(1) : text).evaluate()).total;
      if (losing) {
        await loseEmber(amount, actor, op.name);
        return { line: noted(i18n.format("VARBORG.Outcome.EmberLost", { item: op.name, amount }), entry.note) };
      }
      // Ember is not capped, so the whole amount is added when the change succeeds; the record keeps that.
      const added = await gainEmber(amount, actor, op.name);
      return { emberGained: added ? amount : 0, emberSource: op.name, line: noted(i18n.format("VARBORG.Effects.HookEmber", { item: op.name, amount }), entry.note) };
    }
    case "wound": {
      // A wound: HP does not change; with the test it is like life force (GAPS 232).
      const wounds = actor.system.wounds;
      if (!wounds) return { line: "" };
      if (wounds.value >= wounds.max) return { line: i18n.format("VARBORG.Outcome.WoundAtMax", { name: actor.name }) };
      const before = wounds.value;
      await actor.update({ "system.wounds.value": before + 1 });
      if (entry.test) {
        const { postLifeForceWoundCards } = await import("./agony.mjs");
        await postLifeForceWoundCards(actor, before, 1);
      }
      return { wounded: true, line: noted(i18n.format(entry.test ? "VARBORG.Outcome.WoundTest" : "VARBORG.Outcome.Wound", { name: actor.name, wounds: before + 1, max: wounds.max }), entry.note) };
    }
    case "partner": {
      const user = op.user ? await fromUuid(op.user) : null;
      if (!user || user === actor) return { line: "" };
      if (user.isOwner) await user.setFlag(SYSTEM, "partner", { uuid: actor.uuid, name: actor.name, combat: combatKey() });
      return { partnerOf: user.uuid, line: noted(i18n.format("VARBORG.Outcome.Partner", { name: actor.name, user: user.name }), entry.note) };
    }
    default:
      return null;
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
  if (done.clearMark) {
    const marks = actor.getFlag(SYSTEM, "sustainedConditions") ?? [];
    await actor.setFlag(SYSTEM, "sustainedConditions", marks.filter(mark => mark.source !== done.clearMark));
  }
  if (done.kind === "condition" && done.condition && !done.had && actor.statuses.has(done.condition)) {
    await actor.toggleStatusEffect(done.condition, { active: false });
  }
  if (done.kind === "heal" && done.healed) {
    await actor.update({ "system.hp.value": Math.max(0, actor.system.hp.value - done.healed) });
  }
  if (done.kind === "buff" && done.itemId) await actor.items.get(done.itemId)?.delete();
  // Step 51d.
  if (done.kind === "persistent" && done.effectId) await actor.effects.get(done.effectId)?.delete();
  if (done.kind === "damage" && done.dealt) await actor.update({ "system.hp.value": Math.min(actor.system.hp.max ?? Infinity, actor.system.hp.value + done.dealt) });
  // The defeat this damage set is taken off again, as the HP comes back.
  if (done.kind === "damage" && done.defeated) {
    for (const id of done.defeatedCombatants ?? []) await game.combat?.combatants.get(id)?.update({ defeated: false });
    if (actor.statuses.has(CONFIG.specialStatusEffects.DEFEATED)) await actor.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: false });
  }
  // Ember the gain added is taken back, as far as the pool still has it (Ember spent since is not taken twice).
  if (done.kind === "ember" && done.emberGained) {
    const { getPools, loseEmber } = await import("./pools.mjs");
    const take = Math.min(done.emberGained, getPools().ember ?? 0);
    if (take > 0) await loseEmber(take, actor, done.emberSource ?? "");
  }
  if (done.kind === "lowerArmour" && done.armourFrom !== undefined) await actor.update({ "system.armour": done.armourFrom });
  if (done.kind === "thralls" && done.thrallIds?.length) {
    const { deleteThralls } = await import("./minions.mjs");
    await deleteThralls(done.thrallIds.map(id => game.actors.get(id)).filter(Boolean));
  }
  if (done.kind === "rigDamage" && done.rigDealt) {
    const rig = await fromUuid(done.rigUuid);
    if (rig?.isOwner) await rig.update({ "system.hp.value": Math.min(rig.system.hp.max, rig.system.hp.value + done.rigDealt) });
    // Not this user's rig: the Dark Master's client takes the damage back (REVIEW B5).
    else if (rig && !game.user.isGM) await askGM({ op: "undo", done });
  }
  if (["quarry", "subject"].includes(done.kind) && done.markedBy) {
    const user = await fromUuid(done.markedBy);
    if (user?.isOwner && user.getFlag(SYSTEM, done.mark)?.uuid === actor.uuid) await user.unsetFlag(SYSTEM, done.mark);
    if (user?.isOwner && done.mark === "subject" && user.getFlag(SYSTEM, "studied")) await user.setFlag(SYSTEM, "studied", withoutStudied(user.getFlag(SYSTEM, "studied"), actor.uuid));
  }
  if (done.kind === "wound" && done.wounded) await actor.update({ "system.wounds.value": Math.max(0, actor.system.wounds.value - 1) });
  if (done.kind === "cure" && done.cured && !actor.statuses.has(done.cured)) await actor.toggleStatusEffect(done.cured, { active: true });
  if (done.kind === "fatigue" && done.fatigued) await actor.update({ "system.fatigue": Math.max(0, (actor.system.fatigue ?? 1) - 1) });
  if (done.kind === "partner" && done.partnerOf) {
    const user = await fromUuid(done.partnerOf);
    if (user?.isOwner && user.getFlag(SYSTEM, "partner")?.uuid === actor.uuid) await user.unsetFlag(SYSTEM, "partner");
  }
  return null;
}

/**
 * When a combat ends, foes whose armour a power lowered for the
 * encounter get it back (Shattering roast, step 51d). Dark Master only.
 * @param {Combat} combat
 */
export async function restoreLoweredArmour(combat) {
  if (!game.user.isGM) return;
  for (const combatant of combat.combatants) {
    const foe = combatant.actor;
    const before = foe?.getFlag(SYSTEM, "armourBefore");
    if (!before) continue;
    await foe.update({ "system.armour": before.die });
    await foe.unsetFlag(SYSTEM, "armourBefore");
    const label = game.i18n.localize(`VARBORG.Foe.Armour.${before.die || "none"}`);
    await ChatMessage.create({ content: `<div class="var-borg-card"><p>${foundry.utils.escapeHTML(game.i18n.format("VARBORG.Outcome.ArmourBack", { name: foe.name, die: label }))}</p></div>` });
  }
}

/**
 * A character made a roll: their buffs marked "next roll only" whose
 * effects work on that kind of roll are used up (GAPS 235; Overcharge and
 * Perfect casting for spells, GAPS 231).
 * @param {Actor} actor
 * @param {string[]} kinds  The roll's kinds, such as ["attack"].
 */
export async function useUpNextRoll(actor, kinds) {
  if (actor?.type !== "character" || !actor.isOwner) return;
  const used = actor.items.filter(item => item.getFlag(SYSTEM, "buff")?.nextOnly
    && (item.system.effects ?? []).some(effect => effect.kind === "roll" && kinds.includes(effect.roll)));
  if (!used.length) return;
  await actor.deleteEmbeddedDocuments("Item", used.map(item => item.id));
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${foundry.utils.escapeHTML(game.i18n.format("VARBORG.Outcome.NextRollUsed", { name: actor.name, list: used.map(item => item.name).join(", ") }))}</p></div>`
  });
}

/**
 * A foe's attack or gloom ability was defended against: its buffs that
 * last only until its next attack end (Needle-Spray, GAPS 223).
 * @param {Actor} foe
 */
export async function useUpNextAttackMarks(foe) {
  for (const item of foe?.items?.filter(other => other.getFlag(SYSTEM, "buff")?.nextOnly) ?? []) {
    await doOp({ op: "undo", done: { actorUuid: foe.uuid, kind: "buff", itemId: item.id } });
  }
}

/**
 * Name the power (and the option chosen, such as Songs of power: Allegro)
 * that gave a condition, on its status effect (playtest feedback). The
 * sheet shows it beside the condition, and the effect's name carries it.
 * @param {Actor} actor
 * @param {object} entry  The outcome entry.
 * @param {string} power  The power's or spell's name.
 */
async function markConditionSource(actor, entry, power) {
  const effect = conditionEffect(actor, entry.condition);
  if (!effect || !power) return;
  const i18n = game.i18n;
  const from = entry.option
    ? i18n.format("VARBORG.Outcome.SourceOption", { power, option: entry.option })
    : power;
  await effect.update({
    name: i18n.format("VARBORG.Outcome.ConditionFrom", { condition: i18n.localize(`VARBORG.Condition.${entry.condition}`), from }),
    description: entry.note || "",
    [`flags.${SYSTEM}.source`]: { power, option: entry.option || "", note: entry.note || "" }
  });
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
  // Its area leaves the map (playtest feedback).
  await removeSustainedAreas(source);
  // What the power gives its user when it ends (Beast Unleashed: Fatigued).
  for (const entry of (power.system.outcomeEffects ?? []).filter(other => other.when === "end")) {
    const result = await runOp({ op: "give", actorUuid: user.uuid, entry: foundry.utils.deepClone(entry), name: power.name, source, user: user.uuid });
    if (result?.line) ended.push(result.line);
  }
  // Its conditions on the user and, "while sustained", on its targets (GAPS 220, 233).
  for (const actor of actorsWithBuffs()) {
    const mine = (actor.getFlag(SYSTEM, "sustainedConditions") ?? []).filter(mark => mark.source === source);
    for (const mark of mine) {
      await doOp({ op: "undo", done: { actorUuid: actor.uuid, kind: "condition", condition: mark.condition, had: false, clearMark: source } });
      ended.push(i18n.format("VARBORG.Outcome.ConditionOf", { name: actor.name, condition: i18n.localize(`VARBORG.Condition.${mark.condition}`) }));
    }
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
