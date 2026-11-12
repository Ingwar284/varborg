/**
 * Conditions: what each one does to tests, attacks, defences and turns.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 3.13 Conditions, GAPS 20 and 73-75.
 *
 * "Foes do not roll, so conditions that change a test are translated for
 * them. Where a condition works differently on a foe, its Foe line applies
 * instead."
 *
 * Only what a computer can judge is applied: Boon, Bane, DR changes and
 * lost actions or reactions. Bane that depends on the situation ("tests
 * that rely on sight") is shown as a reminder for the player to tick
 * (GAPS 75). Persistent Damage has its own file (persistent.mjs), and so
 * do the Death's Door table and Dark Vessel's d8 HP (deaths-door.mjs).
 *
 * Lasting Panic results (rules 3.12) are statuses too, and are counted
 * here where they change a turn or a test (module/rules/panic.mjs). So are
 * injuries from the Table of Agony (rules 3.5, module/rules/agony.mjs).
 *
 * Every function takes `conditions`: the condition ids an actor has (a Set
 * or an array), and `fatigue`: its level of fatigue.
 */

/** Every condition in rules 3.13, except Persistent Damage (see persistent.mjs). */
export const CONDITIONS = [
  "blinded", "deafened", "charmed", "fatigued", "frightened", "stupefied",
  "restrained", "prone", "quickened", "silenced", "slowed",
  "deathsDoor", "darkVessel", "infected", "doomed", "encumbered"
];

/** Conditions with a Foe line in rules 3.13. */
export const FOE_LINE_CONDITIONS = [
  "blinded", "deafened", "fatigued", "frightened", "stupefied", "restrained", "prone", "encumbered"
];

/** "+2 DR on all tests for each level of fatigue." Foe: −2 DR per level. */
export const FATIGUE_DR = 2;

/** Prone: attack +2 DR, defend against melee +2 DR, against ranged −2 DR. */
export const PRONE_DR = 2;

/** Dark Vessel: "Attack -2 DR. Defend +2 DR." */
export const DARK_VESSEL_DR = 2;

/** Situational Bane the player judges, by where it is shown (GAPS 75). */
export const REMINDERS = {
  test: ["blinded", "deafened", "stupefied", "frightened"],
  attack: ["blinded", "frightened", "charmed"],
  defence: ["blinded", "deafened"],
  // Shown when defending against a foe with this condition.
  foeAttack: ["frightened"]
};

/**
 * In Darkness (rules 3.15, GAPS 274): "Being in complete darkness gives Bane
 * on all tests." Not a 3.13 condition but a marker the system puts on a
 * character's token when no light reaches it (module/darkness.mjs).
 */
export const IN_DARKNESS = "inDarkness";

/** In Darkness: Bane on every test, attack and defence. */
function darknessModifier(has) {
  return has.has(IN_DARKNESS) ? [{ condition: IN_DARKNESS, bane: true }] : [];
}

/** Conditions that work at the start of one turn and then end (GAPS 74). */
export const ONE_TURN_CONDITIONS = ["quickened", "slowed"];

import { nextTestModifiers } from "./panic.mjs";
import { injuryModifiers, injuryReminders } from "./agony.mjs";

const asSet = conditions => (conditions instanceof Set ? conditions : new Set(conditions ?? []));

/**
 * Throwing and shooting are ranged; only melee is melee (GAPS 73).
 * @param {string} kind  A weapon's way of attacking: "melee", "shoot", "throw".
 */
export function isRanged(kind) {
  return kind !== "melee";
}

/**
 * The level of fatigue that counts: 0 without the condition, at least 1
 * with it. There is no maximum (GAPS 20).
 */
export function fatigueLevel(conditions, fatigue = 0) {
  if (!asSet(conditions).has("fatigued")) return 0;
  return Math.max(1, Math.floor(Number(fatigue)) || 0);
}

/**
 * The carrying state once the Encumbered condition is counted: a character
 * given the condition some other way is Encumbered even with a light load.
 * @param {string} carryingState  "normal", "encumbered" or "overloaded".
 */
export function carryingWithConditions(conditions, carryingState = "normal") {
  if (carryingState === "normal" && asSet(conditions).has("encumbered")) return "encumbered";
  return carryingState;
}

/*
 * Each function below returns a list of modifiers, one per condition that
 * changes something: { condition, dr } for a DR change, { condition, boon }
 * or { condition, bane } for Boon or Bane. A Fatigued entry also has its
 * level.
 */

/** Fatigued: +2 DR per level on a character's tests, −2 per level for a foe. */
function fatigueModifier(conditions, fatigue, sign) {
  const level = fatigueLevel(conditions, fatigue);
  return level ? [{ condition: "fatigued", level, dr: sign * FATIGUE_DR * level }] : [];
}

/**
 * A character's ability test (and their side of a contest).
 * Encumbered Bane is left to testModifiers (see carryingWithConditions).
 * Adrenaline Rush and Rattled give Boon or Bane (GAPS 80).
 * @param {string} [ability]  The ability tested, for injuries such as Hair burnt.
 */
export function testConditions(conditions, fatigue = 0, ability = null) {
  const has = asSet(conditions);
  return [...fatigueModifier(has, fatigue, +1), ...darknessModifier(has), ...nextTestModifiers(has), ...injuryModifiers(has, "test", ability)];
}

/**
 * A character attacking.
 * @param {string} [ability]  The ability the attack uses, for injuries.
 */
export function attackerConditions(conditions, fatigue = 0, ability = null) {
  const has = asSet(conditions);
  const mods = fatigueModifier(has, fatigue, +1);
  if (has.has("prone")) mods.push({ condition: "prone", dr: PRONE_DR });
  if (has.has("darkVessel")) mods.push({ condition: "darkVessel", dr: -DARK_VESSEL_DR });
  if (has.has("restrained")) mods.push({ condition: "restrained", bane: true });
  return [...mods, ...darknessModifier(has), ...nextTestModifiers(has), ...injuryModifiers(has, "attack", ability)];
}

/**
 * A foe being attacked: its Foe lines.
 * @param {string} kind  The attack's way: "melee", "shoot" or "throw".
 */
export function attackTargetConditions(conditions, fatigue = 0, kind = "melee") {
  const has = asSet(conditions);
  const mods = fatigueModifier(has, fatigue, -1);
  if (has.has("prone")) mods.push({ condition: "prone", dr: isRanged(kind) ? PRONE_DR : -PRONE_DR });
  for (const condition of ["blinded", "restrained", "encumbered"]) {
    if (has.has(condition)) mods.push({ condition, boon: true });
  }
  return mods;
}

/**
 * A character defending.
 * @param {string} kind  The attack's way: "melee", or ranged ("shoot", "throw").
 */
export function defenderConditions(conditions, fatigue = 0, kind = "melee") {
  const has = asSet(conditions);
  const mods = fatigueModifier(has, fatigue, +1);
  if (has.has("prone")) mods.push({ condition: "prone", dr: isRanged(kind) ? -PRONE_DR : PRONE_DR });
  if (has.has("darkVessel")) mods.push({ condition: "darkVessel", dr: DARK_VESSEL_DR });
  if (has.has("restrained")) mods.push({ condition: "restrained", bane: true });
  return [...mods, ...darknessModifier(has), ...nextTestModifiers(has), ...injuryModifiers(has, "defence")];
}

/**
 * Defending against a foe's attack: the attacking foe's Foe lines.
 * @param {string} kind  The foe attack's way: "melee", or ranged.
 */
export function attackingFoeConditions(conditions, fatigue = 0, kind = "melee") {
  const has = asSet(conditions);
  const mods = fatigueModifier(has, fatigue, -1);
  if (has.has("prone")) mods.push({ condition: "prone", dr: -PRONE_DR });
  for (const condition of ["blinded", "restrained"]) {
    if (has.has(condition)) mods.push({ condition, boon: true });
  }
  // Encumbered: "creatures defend against its melee attacks with Boon."
  if (has.has("encumbered") && !isRanged(kind)) mods.push({ condition: "encumbered", boon: true });
  return mods;
}

/**
 * Add up a list of modifiers.
 * @returns {{dr: number, boons: number, banes: number}}
 */
export function totalModifiers(mods) {
  return {
    dr: mods.reduce((sum, mod) => sum + (mod.dr ?? 0), 0),
    boons: mods.filter(mod => mod.boon).length,
    banes: mods.filter(mod => mod.bane).length
  };
}

/** The situational reminders to show for this kind of roll (GAPS 75), injuries included. */
export function reminders(conditions, where) {
  const has = asSet(conditions);
  return [...(REMINDERS[where] ?? []).filter(condition => has.has(condition)), ...injuryReminders(has, where)];
}

/**
 * Actions and reactions at the start of a turn.
 * Quickened: one more action. Slowed: one less action and one less
 * reaction. Both work for this turn and then end (GAPS 74).
 * Stupefied: no reaction. Death's Door: "You cannot act."
 * Panic results (rules 3.12): Sluggish, one action less ("two Actions
 * instead of three"); Distracted, no reaction; Faint, no actions and no
 * reactions (GAPS 84).
 * @param {number} actions    The usual actions per turn.
 * @param {number} reactions  The usual reactions per turn.
 * @returns {{actions: number, reactions: number, ended: string[]}}
 *   ended: the one-turn conditions that worked and now end.
 */
export function turnAllowance(conditions, actions = 3, reactions = 1) {
  const has = asSet(conditions);
  const ended = ONE_TURN_CONDITIONS.filter(condition => has.has(condition));
  if (has.has("quickened")) actions += 1;
  if (has.has("slowed")) {
    actions -= 1;
    reactions -= 1;
  }
  if (has.has("sluggish")) actions -= 1;
  if (has.has("stupefied") || has.has("distracted")) reactions = 0;
  if (has.has("deathsDoor") || has.has("faint")) {
    actions = 0;
    reactions = 0;
  }
  return { actions: Math.max(0, actions), reactions: Math.max(0, reactions), ended };
}

/**
 * Conditions that take away what is left of this turn when they arrive
 * mid-turn: Stupefied (reactions), and Death's Door and Faint (everything).
 * @returns {{actions?: number, reactions?: number}}  The new amounts left.
 */
export function lossOnArrival(condition) {
  if (condition === "stupefied") return { reactions: 0 };
  if (condition === "deathsDoor" || condition === "faint") return { actions: 0, reactions: 0 };
  return {};
}
