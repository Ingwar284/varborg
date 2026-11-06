/**
 * What a power or spell does to its targets and its user (step 51c,
 * GAPS 219–221). Plain JavaScript, no Foundry.
 *
 * A power or spell has a list of outcome entries (system.outcomeEffects).
 * Each entry gives one thing, on the results it ticks, to its targets
 * (every targeted creature) or to the user:
 * - condition: a condition, with a timer like a gloom ability's (GAPS 129);
 * - heal: HP regained, such as d6;
 * - buff: the power's buff effects (system.buffEffects), as a temporary
 *   item on the creature, ending with its timer (GAPS 221);
 * - reminder: only a line on the card (summons, and anything else).
 * Effects on the user of a Sustained power end when it ends (GAPS 220).
 *
 * They are given when the card is posted and follow Fortune: what the new
 * result no longer gives is taken back, and what it now gives is given
 * (GAPS 219).
 */

import { CONDITIONS } from "./conditions.mjs";
import { TIMER_KINDS, isRoundsFormula } from "./timers.mjs";

/** What an entry gives. */
export const OUTCOME_KINDS = ["condition", "heal", "buff", "reminder"];

/** Who gets it: each targeted creature, or the user. */
export const OUTCOME_WHO = ["target", "self"];

/** The results an entry can work on. */
export const OUTCOME_TIERS = ["triumph", "success", "failure", "ruin"];

/** A new entry, as the sheet's Add button makes it: on a Triumph or Success, like the power's effect (rules 3.10). */
export function blankOutcome(kind = "condition") {
  return {
    kind,
    who: "target",
    tiers: { triumph: true, success: true, failure: false, ruin: false },
    condition: kind === "condition" ? CONDITIONS[0] : "",
    duration: { kind: "", rounds: "1" },
    amount: "",
    note: ""
  };
}

/** Heal amounts: a number such as 2, or dice such as d6 or 2d4+1. */
export function isHealFormula(text) {
  return /^\s*(\d+|\d*d\d+)(\s*[+-]\s*\d+)?\s*$/i.test(String(text ?? ""));
}

/**
 * The problems with one entry, for the content tests. Empty: fine.
 * @param {object} entry
 */
export function outcomeProblems(entry) {
  const problems = [];
  if (!OUTCOME_KINDS.includes(entry?.kind)) problems.push(`kind: ${entry?.kind}`);
  if (!OUTCOME_WHO.includes(entry?.who)) problems.push(`who: ${entry?.who}`);
  if (!OUTCOME_TIERS.some(tier => entry?.tiers?.[tier])) problems.push("no result ticked");
  if (entry?.kind === "condition" && !CONDITIONS.includes(entry.condition)) problems.push(`condition: ${entry.condition}`);
  if (entry?.kind === "heal" && !isHealFormula(entry.amount)) problems.push(`amount: ${entry.amount}`);
  const duration = entry?.duration ?? {};
  if (duration.kind && !TIMER_KINDS.includes(duration.kind)) problems.push(`duration: ${duration.kind}`);
  if (duration.kind === "rounds" && !isRoundsFormula(duration.rounds)) problems.push(`rounds: ${duration.rounds}`);
  return problems;
}

/**
 * What a result gives, entry by entry and creature by creature.
 * @param {object[]} entries   The power's outcome entries.
 * @param {string} tier        The card's result.
 * @param {object} who
 * @param {string[]} who.targets  The targeted creatures' UUIDs.
 * @param {string} who.user       The user's UUID.
 * @returns {{key: string, index: number, actorUuid: string}[]}  key: "index|uuid".
 */
export function wantedOutcomes(entries, tier, { targets = [], user = "" } = {}) {
  const wanted = [];
  (entries ?? []).forEach((entry, index) => {
    if (!entry?.tiers?.[tier]) return;
    const actors = entry.who === "self" ? [user].filter(Boolean) : [...new Set(targets ?? [])];
    for (const actorUuid of actors) wanted.push({ key: `${index}|${actorUuid}`, index, actorUuid });
  });
  return wanted;
}

/**
 * What changes when the result changes: entries given before and wanted
 * still are kept; the others are taken back or given.
 * @param {{key: string}[]} applied  Given before.
 * @param {{key: string}[]} wanted   Wanted now.
 * @returns {{add: object[], keep: object[], remove: object[]}}
 */
export function outcomeDiff(applied, wanted) {
  const before = new Set((applied ?? []).map(entry => entry.key));
  const now = new Set((wanted ?? []).map(entry => entry.key));
  return {
    add: (wanted ?? []).filter(entry => !before.has(entry.key)),
    keep: (applied ?? []).filter(entry => now.has(entry.key)),
    remove: (applied ?? []).filter(entry => !now.has(entry.key))
  };
}
