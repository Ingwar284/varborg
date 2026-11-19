/**
 * Prayer of the faithful, the Priest's class power (GAPS 332).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Designer rulings (19 November 2026):
 * - Cast any Divine spell of 3 ember or less, known or not, for the
 *   prayer's 1 ember in total (and its 2 actions). The spell is cast as
 *   usual, at its own DR (11 + its listed cost).
 * - Or demand the impossible: one Sanity test at the DR the Dark Master
 *   sets, never below 16. No DR 12 prayer test comes first. A Triumph
 *   counts as a Success; a Ruin puts the Priest at Death's Door.
 * - Rituals are not offered (GAPS 335).
 */

/** The most a spell may cost to be cast through the prayer. */
export const PRAYER_MAX_COST = 3;

/** A demand is never easier than this DR. */
export const DEMAND_MIN_DR = 16;

/** The DRs the demand dialog offers: the rules' guide, small mercy to miracle. */
export const DEMAND_DRS = Object.freeze([16, 18, 20]);

/**
 * The spells the prayer can cast, by name, cheapest first: Divine, listed
 * cost 3 or less, not a ritual. A name seen twice is offered once (the
 * first one given wins, so pass the Priest's own spells first).
 * @param {{name: string, spellList: string, cost: number, ritual?: boolean}[]} spells
 * @returns {object[]} The same objects, filtered and sorted.
 */
export function prayerSpellChoices(spells) {
  const seen = new Set();
  return (spells ?? [])
    .filter(spell => spell?.spellList === "divine" && !spell.ritual
      && Number.isFinite(Number(spell.cost)) && Number(spell.cost) <= PRAYER_MAX_COST)
    .filter(spell => {
      const key = String(spell.name ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(a.cost) - Number(b.cost) || String(a.name).localeCompare(String(b.name)));
}

/** A demand's DR: at least 16, whatever was chosen. */
export function demandDr(chosen) {
  const dr = Math.trunc(Number(chosen));
  return Number.isFinite(dr) ? Math.max(DEMAND_MIN_DR, dr) : DEMAND_MIN_DR;
}

/** What a demand's result means: "fulfilled", "unheard" or "smitten" (a Ruin). */
export function demandOutcome(tier) {
  if (tier === "triumph" || tier === "success") return "fulfilled";
  if (tier === "ruin") return "smitten";
  return "unheard";
}
