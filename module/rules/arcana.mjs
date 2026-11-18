/**
 * The Cartomancer's reading (GAPS 319; PLAN step 69c). The Dusk Arcana is
 * twelve trumps rolled on a d12, and the Thirteenth, which is never rolled.
 * After each Long Rest the Cartomancer lays out a reading of three trumps
 * (four with Wider spread), rerolling repeats. Once per round, with their
 * reaction, they turn one card face down: its meaning takes effect on them
 * or an ally. A turned card is spent until the next Long Rest.
 *
 * A reading is an array of { trump: 1–13, turned: boolean }. No Foundry here;
 * module/reading.mjs keeps it on the character and gives the meanings.
 */

/** The trumps by number (the d12 roll), and the Thirteenth. */
export const TRUMPS = Object.freeze({
  1: "lamplighter", 2: "lastSun", 3: "cairn", 4: "brazier", 5: "wick", 6: "forgeHeart",
  7: "architect", 8: "coldEye", 9: "barge", 10: "wheel", 11: "mask", 12: "shade", 13: "thirteenth"
});

export const THIRTEENTH = 13;

/** How many cards a reading holds: three, or the number set by Wider spread. */
export const READING_SIZE = 3;

/**
 * Lay out a reading: roll for each card, rerolling repeats.
 * @param {number} size
 * @param {() => number} rollD12  Rolls a d12 (1 to 12).
 * @param {{thirteenth?: boolean}} [options]  Begin with the Thirteenth (Booth in the Ironwall).
 */
export function layReading(size, rollD12, { thirteenth = false } = {}) {
  const count = Math.max(1, Math.min(12, Math.trunc(size) || READING_SIZE));
  const trumps = thirteenth ? [THIRTEENTH] : [];
  // Each roll is a d12; a repeat is rolled again. The cap stops a broken roller looping.
  for (let tries = 0; trumps.length < count && tries < 1000; tries++) {
    const roll = Math.trunc(rollD12());
    if (roll >= 1 && roll <= 12 && !trumps.includes(roll)) trumps.push(roll);
  }
  return trumps.map(trump => ({ trump, turned: false }));
}

/** A stored reading, made safe: known trumps only, each once. */
export function readReading(stored) {
  if (!Array.isArray(stored)) return [];
  const seen = new Set();
  return stored.filter(card => TRUMPS[card?.trump] && !seen.has(card.trump) && seen.add(card.trump))
    .map(card => ({ trump: card.trump, turned: Boolean(card.turned) }));
}

/**
 * Whether the card at this place can be turned by the Cartomancer: it is
 * there, not turned yet, and not the Thirteenth.
 */
export function canTurn(reading, index) {
  const card = reading?.[index];
  return Boolean(card) && !card.turned && card.trump !== THIRTEENTH;
}

/** The reading with that card turned face down. */
export function turnCard(reading, index) {
  return reading.map((card, i) => (i === index ? { ...card, turned: true } : { ...card }));
}

/**
 * The Thirteenth enters the reading in place of an unturned card (the last
 * one; Draw for the querent lets the player choose, by hand). Nothing
 * changes when it is already there.
 */
export function withThirteenth(reading, index = -1) {
  if (reading.some(card => card.trump === THIRTEENTH)) return reading.map(card => ({ ...card }));
  const open = reading.map((card, i) => (card.turned ? -1 : i)).filter(i => i >= 0);
  const at = open.includes(index) ? index : open.at(-1);
  if (at === undefined) return [...reading.map(card => ({ ...card })), { trump: THIRTEENTH, turned: false }];
  return reading.map((card, i) => (i === at ? { trump: THIRTEENTH, turned: false } : { ...card }));
}

/** The combat round a card was last turned in, as a key: once per round. */
export function roundKey(combatId, round) {
  return combatId ? `${combatId}:${round}` : "";
}

/**
 * What a trump does when turned for someone (step 69c1, GAPS 325).
 * entries: outcome entries for that creature (as a power's, given with
 * module/outcomes.mjs); buffs: the item effects of its buff; fortune: Fortune
 * gained; manual: the meaning is applied by hand (the card's text says how).
 * @param {number} trump
 * @param {{statuses?: Set<string>|string[]}} [target]  The creature's conditions now.
 */
export function trumpMeaning(trump, { statuses = [] } = {}) {
  const has = condition => new Set(statuses).has(condition);
  const entry = fields => ({
    kind: "condition", who: "target", tiers: { triumph: true, success: true, failure: false, ruin: false },
    condition: "", duration: { kind: "", rounds: "1" }, amount: "", option: "", when: "result", damageType: "",
    soaked: false, nextOnly: false, test: false, whileSustained: false, note: "", ...fields
  });
  const roll = fields => ({ kind: "roll", mode: "auto", grant: "", dr: 0, damage: "", ...fields });
  const oneRound = { kind: "rounds", rounds: "1" };
  switch (TRUMPS[trump]) {
    case "lamplighter":
      return { entries: [entry({ kind: "buff", duration: oneRound, nextOnly: true })], fortune: 0, manual: false,
        buffs: ["test", "attack", "defence", "power", "spell"].map(kind => roll({ roll: kind, grant: "boon" })) };
    case "lastSun":
      return { entries: [], buffs: [], fortune: 1, manual: false };
    case "cairn":
      return { entries: [entry({ kind: "heal", amount: "d6" })], buffs: [], fortune: 0, manual: false };
    case "wick": {
      const condition = has("frightened") ? "frightened" : has("stupefied") ? "stupefied" : "";
      return { entries: condition ? [entry({ kind: "cure", condition })] : [], buffs: [], fortune: 0, manual: false };
    }
    case "forgeHeart":
      return { entries: [entry({ kind: "buff", duration: oneRound, nextOnly: true })], fortune: 0, manual: false,
        buffs: [roll({ roll: "attack", damage: "d4" })] };
    case "coldEye":
      return { entries: [entry({ kind: "buff", duration: oneRound })], fortune: 0, manual: false,
        buffs: [roll({ roll: "defence", dr: -2 })] };
    case "barge":
      return { entries: [entry({ condition: "quickened", duration: oneRound })], buffs: [], fortune: 0, manual: false };
    case "shade":
      return { entries: [entry({ kind: "damage", amount: "d4", damageType: "", note: "dark" })], buffs: [], fortune: 0, manual: true };
    default:
      // The Brazier, the Architect, the Wheel, the Mask and the Thirteenth: by hand.
      return { entries: [], buffs: [], fortune: 0, manual: true };
  }
}

/**
 * Shuffle the fates (step 69c2): every unturned card but the Thirteenth is
 * discarded and that many drawn anew, rerolling repeats of any card still
 * in the reading.
 */
export function reshuffleUnturned(reading, rollD12) {
  const kept = reading.filter(card => card.turned || card.trump === THIRTEENTH).map(card => card.trump);
  const out = reading.map(card => ({ ...card }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].turned || out[i].trump === THIRTEENTH) continue;
    for (let tries = 0; tries < 1000; tries++) {
      const roll = Math.trunc(rollD12());
      if (roll >= 1 && roll <= 12 && !kept.includes(roll)) {
        out[i] = { trump: roll, turned: false };
        kept.push(roll);
        break;
      }
    }
  }
  return out;
}

/** Black sector: the Thirteenth is torn in half, and spent. */
export function tearThirteenth(reading) {
  return reading.map(card => (card.trump === THIRTEENTH ? { ...card, turned: true } : { ...card }));
}

/** Whether the reading holds an unspent Thirteenth. */
export function hasThirteenth(reading) {
  return reading.some(card => card.trump === THIRTEENTH && !card.turned);
}

/**
 * Draw for the querent and Read the room (step 69c2): cards drawn fresh
 * from the deck, not from the reading. Each is a different trump, as when
 * drawing from a deck (provisional, GAPS 326).
 */
export function freshCards(count, rollD12) {
  return layReading(count, rollD12).map(card => card.trump);
}
