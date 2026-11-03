/**
 * Initiative: the dice each side rolls and the turn order.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules: 3.4 Violence, "Initiative": "roll a d6 and add your agility. The
 * Dark Master rolls a simple d6 for each foe, and adds any bonuses. The
 * initiative order then proceeds from highest to lowest."
 * 1. Running the Game: "Ties go to the players."
 * GAPS 11 (foe bonuses come from passives) and 38 (other ties are random).
 */

/** Player characters: d6 + Agility. */
export const CHARACTER_INITIATIVE_FORMULA = "1d6 + @abilities.agility";

/** Foes: d6 + the foe's initiative bonus. */
export const FOE_INITIATIVE_FORMULA = "1d6 + @initiative";

/**
 * The initiative formula for an actor type. Anything that is not a player
 * character rolls like a foe.
 * @param {string} actorType  "character", "foe", …
 */
export function initiativeFormula(actorType) {
  return actorType === "character" ? CHARACTER_INITIATIVE_FORMULA : FOE_INITIATIVE_FORMULA;
}

/**
 * Compare two combatants for turn order. Returns a negative number when `a`
 * acts first, a positive number when `b` acts first.
 *
 * 1. Higher initiative first. No initiative yet goes last.
 * 2. On a tie, player characters before foes.
 * 3. Still tied (two PCs, or two foes): random, using each combatant's
 *    tiebreak number (a random number from 0 to 1, rolled with initiative).
 *    The higher tiebreak goes first.
 * 4. As a last resort, by id, so the order never flickers.
 *
 * @param {{initiative: ?number, isPC: boolean, tiebreak?: number, id?: string}} a
 * @param {{initiative: ?number, isPC: boolean, tiebreak?: number, id?: string}} b
 */
export function compareInitiative(a, b) {
  const ia = Number.isFinite(a.initiative) ? a.initiative : -Infinity;
  const ib = Number.isFinite(b.initiative) ? b.initiative : -Infinity;
  if (ia !== ib) return ia > ib ? -1 : 1;
  if (a.isPC !== b.isPC) return a.isPC ? -1 : 1;
  const ta = a.tiebreak ?? 0;
  const tb = b.tiebreak ?? 0;
  if (ta !== tb) return ta > tb ? -1 : 1;
  return String(a.id ?? "") > String(b.id ?? "") ? 1 : -1;
}

/** A copy of `combatants` in turn order (see compareInitiative). */
export function sortInitiative(combatants) {
  return [...combatants].sort(compareInitiative);
}
