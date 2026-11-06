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
import { TIMER_KINDS, ESCAPE_KINDS, isRoundsFormula, isEscapeDr } from "./timers.mjs";

/**
 * What an entry gives. Step 51d adds:
 * persistent: persistent damage of `damageType` (fire, bleeding, acid,
 *   poison) and `amount`, such as d4 bleeding;
 * damage: `amount` damage, soaked by armour only when `soaked` is ticked
 *   (Wounds Are Weapons: "d6 damage that cannot be reduced");
 * lowerArmour: a foe's armour die one step down until the encounter ends;
 * fatigue: one more level of Fatigued;
 * partner: the targeted ally becomes the user's dance partner (GAPS 222);
 * cure: the creature no longer has `condition` (The Banner Stands ends Frightened).
 * Step 51d2:
 * thralls: the user raises `amount` thralls (Call the Unburied, GAPS 225);
 * rigDamage: the user's rig takes `amount` damage, soaked by its armour
 *   only when `soaked` is ticked (GAPS 228);
 * surge: a Photonic Surge is triggered (the table is drawn).
 */
export const OUTCOME_KINDS = ["condition", "heal", "buff", "reminder", "persistent", "damage", "lowerArmour", "fatigue", "partner", "cure", "thralls", "rigDamage", "surge",
  // Step 51e: the targeted foe becomes the user's quarry or subject
  // (GAPS 230); the Ember pool gains `amount` (Unravel).
  "quarry", "subject", "ember",
  // Step 51e2: the creature gains a wound, with the Toughness test when
  // `test` is ticked (Overcharge) or without it (Crimson bargain, GAPS 232).
  "wound"];

/** Is it a Morph power ("Morph. One arm calcifies…")? Its buff replaces the last Morph's (GAPS 226). */
export function isMorphPower(description) {
  return /^\s*Morph\b/.test(String(description ?? ""));
}

/**
 * The buff effects for one entry: those of its option, and those of no
 * option (Morphic Surge's three shapes, step 51d2).
 * @param {object[]} effects  The power's buffEffects.
 * @param {string} option     The entry's option, or "".
 */
export function buffEffectsFor(effects, option = "") {
  return (effects ?? []).filter(effect => !effect.option || effect.option === option);
}

/** How thralls a power destroys add damage (GAPS 225). */
export const THRALL_DESTROY = ["", "one", "ask", "all"];

/**
 * The extra damage from destroyed thralls (GAPS 225): `per` for each
 * thrall beyond the first `skip`, at most `max` of them.
 * Charnel Charge: d4 each, up to 3. Flesh Tide: d6 for each beyond the first, up to 3.
 * @returns {string}  Such as "d4 + d4", or "".
 */
export function thrallDamage(count, { per = "", max = 0, skip = 0 } = {}) {
  if (!per) return "";
  const counted = Math.max(0, Math.min(max > 0 ? max : Infinity, (count ?? 0) - skip));
  return Array(counted).fill(per).join(" + ");
}

/** Who gets it: each targeted creature, the user, or the user's dance partner (GAPS 222). */
export const OUTCOME_WHO = ["target", "self", "partner",
  // Only the targeted characters and minions, or only the targeted foes (The Rapture, step 51f).
  "allies", "foes"];

/** When: on the card's result, or when the Sustained power ends (Beast Unleashed's Fatigued). */
export const OUTCOME_WHEN = ["result", "end"];

/** The types of persistent damage an entry can give (rules 3.13). */
export const OUTCOME_PERSISTENT = ["fire", "bleeding", "acid", "poison"];

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
    // Step 51d: the option it belongs to ("" for always, GAPS 224), when,
    // the persistent damage type, whether armour soaks the damage, and a
    // buff that lasts only until the creature's next attack (GAPS 223).
    option: "",
    when: "result",
    damageType: "",
    soaked: false,
    nextOnly: false,
    test: false,
    // A condition on targets that lasts while the spell is sustained (GAPS 233).
    whileSustained: false,
    note: ""
  };
}

/**
 * The options a power's entries offer, in order of first use (GAPS 224).
 * @param {object[]} entries
 * @returns {string[]}
 */
export function outcomeOptions(entries) {
  return [...new Set((entries ?? []).map(entry => entry.option ?? "").filter(Boolean))];
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
  if (["condition", "cure"].includes(entry?.kind) && !CONDITIONS.includes(entry.condition)) problems.push(`condition: ${entry.condition}`);
  if (["persistent", "damage", "thralls", "rigDamage", "ember"].includes(entry?.kind) && !isHealFormula(entry.amount)) problems.push(`amount: ${entry.amount}`);
  // Healing can be "full" (Absolution, step 51e).
  // "damage": as much as the card's damage (The Rapture, step 51f).
  if (entry?.kind === "heal" && !["full", "damage"].includes(entry.amount) && !isHealFormula(entry.amount)) problems.push(`amount: ${entry.amount}`);
  if (entry?.kind === "persistent" && !OUTCOME_PERSISTENT.includes(entry.damageType)) problems.push(`damageType: ${entry.damageType}`);
  if (entry?.when && !OUTCOME_WHEN.includes(entry.when)) problems.push(`when: ${entry.when}`);
  if (entry?.when === "end" && entry.who !== "self") problems.push("when the power ends: only the user");
  const duration = entry?.duration ?? {};
  if (duration.kind && !TIMER_KINDS.includes(duration.kind)) problems.push(`duration: ${duration.kind}`);
  if (duration.kind === "rounds" && !isRoundsFormula(duration.rounds)) problems.push(`rounds: ${duration.rounds}`);
  if (ESCAPE_KINDS.includes(duration.kind) && !isEscapeDr(duration.rounds)) problems.push(`escape DR: ${duration.rounds}`);
  return problems;
}

/**
 * What a result gives, entry by entry and creature by creature.
 * @param {object[]} entries   The power's outcome entries.
 * @param {string} tier        The card's result.
 * @param {object} who
 * @param {string[]} who.targets  The targeted creatures' UUIDs.
 * @param {string} who.user       The user's UUID.
 * @param {string} [who.partner]  The user's dance partner's UUID (GAPS 222).
 * @param {string[]} [who.chosen] The chosen options: the first always, the
 *   second only on a Triumph (GAPS 224).
 * @returns {{key: string, index: number, actorUuid: string}[]}  key: "index|uuid".
 */
export function wantedOutcomes(entries, tier, { targets = [], user = "", partner = "", chosen = [], allyTargets = [], foeTargets = [] } = {}) {
  const wanted = [];
  const options = tier === "triumph" ? chosen : chosen.slice(0, 1);
  (entries ?? []).forEach((entry, index) => {
    if (!entry?.tiers?.[tier] || (entry.when ?? "result") !== "result") return;
    if (entry.option && !options.includes(entry.option)) return;
    const actors = entry.who === "self" ? [user].filter(Boolean)
      : entry.who === "partner" ? [partner].filter(Boolean)
        : entry.who === "allies" ? [...new Set(allyTargets ?? [])]
          : entry.who === "foes" ? [...new Set(foeTargets ?? [])]
            : [...new Set(targets ?? [])];
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
