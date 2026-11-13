/**
 * Lasting areas (rules section 3, "Defending against areas: Lingering
 * areas"; playtest feedback).
 *
 * "An area that lasts (Sustained, or 'at the start of each round') affects
 * a creature when it enters the area or starts its turn there, but no more
 * than once per turn."
 *
 * A spell's or power's area can last after it is used:
 * - while the power is Sustained (it ends with the power), or
 * - for a number of rounds ("the flames burn for three rounds"), or
 * - until the encounter ends ("difficult terrain until the end of the
 *   encounter").
 * It may be difficult terrain, and it may have effects, each with a
 * trigger:
 * - enterOrStart: a creature enters it or starts its turn inside (the
 *   rules' usual lingering area);
 * - enter / turnStart: only one of the two, when the text says so;
 * - userTurn: every creature inside, at the start of each of the user's
 *   turns ("at the start of each of your turns");
 * - roundStart: every creature inside, at the start of each round;
 * - whileInside: a condition, or the power's buff, a creature has while it
 *   is inside; it is given on entering (or when the area reaches it) and
 *   taken away on leaving (or when the area leaves it). A Quickened or
 *   Slowed held this way works at the start of each turn inside, instead
 *   of ending after one turn.
 * An effect can belong to one option (Songs of power: Allegro), and then
 * only counts when that option was chosen.
 * Designer rulings (GAPS 284): a character takes lasting damage with a
 * Defend (Agility DR12); armour soaks lasting damage, for characters and
 * foes alike; it lasts on a Triumph or Success only (a Failure's shorter
 * area is left to the card's text).
 *
 * Plain maths, no Foundry.
 */

/** How long an area lasts beyond the moment it is used. "" = while Sustained, or not at all. */
export const LASTING_DURATIONS = ["", "rounds", "encounter"];

/** When a lasting effect happens. */
export const LASTING_TRIGGERS = ["enterOrStart", "enter", "turnStart", "userTurn", "roundStart", "whileInside"];

/** What a lasting effect does. */
export const LASTING_KINDS = ["damage", "condition", "heal", "buff"];

/** The results on which an area lasts. */
export const LASTING_TIERS = ["triumph", "success"];

/** A new effect row on the item sheet. */
export function blankLastingEffect() {
  return { trigger: "enterOrStart", kind: "damage", formula: "d6", damageType: "", condition: "", affects: "all", categories: [], option: "" };
}

/**
 * Whether the area stays on the map after it is used.
 * @param {object} lasting    area.lasting
 * @param {boolean} sustaining  The power is now being sustained.
 * @param {string} tier
 */
export function areaStays(lasting, sustaining, tier) {
  if (sustaining) return true;
  if (!LASTING_TIERS.includes(tier)) return false;
  return lasting?.duration === "rounds" || lasting?.duration === "encounter";
}

/**
 * The round at whose start a timed area ends: cast in round 2 to burn for
 * three rounds, it burns through rounds 2, 3 and 4 and ends as round 5
 * begins. null when it is not timed in rounds.
 */
export function endsAtRound(lasting, castRound) {
  if (lasting?.duration !== "rounds") return null;
  return (castRound || 1) + Math.max(1, Number(lasting.rounds) || 1);
}

/**
 * Whether a lasting effect reaches this creature: by side (foes, allies or
 * all) and, when the effect names categories ("Undead, fiends and
 * duskborn"), only foes of those categories.
 * @param {object} effect  { affects, categories }
 * @param {{isAlly: boolean, category: string}} creature  isAlly: on the user's side.
 */
export function lastingReaches(effect, { isAlly, category = "" }) {
  if (effect.affects === "foes" && isAlly) return false;
  if (effect.affects === "allies" && !isAlly) return false;
  const categories = (effect.categories ?? []).filter(Boolean);
  return !categories.length || categories.includes(category);
}

/**
 * Whether an enter or start-of-turn effect may happen now: no more than
 * once per turn for each creature (rules: Lingering areas).
 * @param {string|undefined} last  The turn it last happened in.
 * @param {string} now             This turn, such as "combatId.3.2".
 */
export function oncePerTurn(last, now) {
  return last !== now;
}

/** The triggers an event sets off: "enter" and "turnStart" also set off "enterOrStart". */
export function triggersFor(event) {
  if (event === "enter") return ["enter", "enterOrStart"];
  if (event === "turnStart") return ["turnStart", "enterOrStart"];
  return [event];
}

/**
 * The effects that count for the option chosen: those of no option and
 * those of that option.
 * @param {object[]} effects
 * @param {string} [option]
 */
export function effectsForOption(effects, option = "") {
  return (effects ?? []).filter(effect => !effect.option || effect.option === option);
}
