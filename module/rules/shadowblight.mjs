/**
 * The Shadowblight table (rules 3.11 Spellcasting, "1d20 Shadowblight").
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules 3.11: for magic, "Ruin No effect, roll on the Shadowblight table."
 * Each result's name and text live in lang/en.json under
 * VARBORG.Shadowblight.Result.<id>. The system rolls and shows the result;
 * the Dark Master applies it (GAPS 138).
 */

/** The die rolled on the table. */
export const SHADOWBLIGHT_DICE = "1d20";

/** The results, in table order: index 0 is a roll of 1. */
export const SHADOWBLIGHT_RESULTS = [
  "darknessEternal",
  "peerBeyondTheCurtain",
  "theWithering",
  "puppetry",
  "shatteredGround",
  "mindRift",
  "bloodFog",
  "corpseLight",
  "hungerOfTheAbyss",
  "echoesOfTheDead",
  "frozenBreath",
  "boneRot",
  "dustToDust",
  "theBirds",
  "shatteredReflection",
  "fallingRocks",
  "forgottenKnowledge",
  "darkbound",
  "skinOfAsh",
  "spontaneousCombustion"
];

/** The result that depends on how many spells the caster knows. */
export const COMBUSTION = "spontaneousCombustion";

/**
 * The result for a d20 roll.
 * @param {number} roll  1 to 20.
 * @returns {string} The result's id.
 */
export function shadowblightResult(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > SHADOWBLIGHT_RESULTS.length) {
    throw new RangeError(`A Shadowblight roll is 1 to 20, not ${roll}`);
  }
  return SHADOWBLIGHT_RESULTS[roll - 1];
}

/**
 * Spontaneous combustion: "a massive fireball that reaches 10 feet, plus
 * 5 feet for each spell you know. It deals 1d6 damage for each spell you
 * know."
 * @param {number} spellsKnown
 * @returns {{feet: number, damage: string|null}}  damage is null with no spells known.
 */
export function combustion(spellsKnown) {
  const known = Math.max(0, Math.floor(Number(spellsKnown) || 0));
  return { feet: 10 + 5 * known, damage: known ? `${known}d6` : null };
}
