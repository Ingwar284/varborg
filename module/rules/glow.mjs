/**
 * Holy smite's glow (GAPS 330, player feedback 19 November 2026).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Designer rulings:
 * - When an attack's Triumph adds extra light damage (Holy smite), the
 *   attacker's weapon lights up until the encounter ends. Another such
 *   Triumph starts it again.
 * - It sheds dim light out to 10 feet. It is real light: anyone inside it
 *   is not in darkness (rules 3.15). A torch or lantern that reaches
 *   further still counts.
 */

/** How far the glow's dim light reaches, in feet. */
export const GLOW_RANGE = 10;

/** The glow's colour: a pale gold. */
export const GLOW_COLOUR = "#f3d27a";

/** The glow's timer: until the encounter ends. */
export const GLOW_TIMER = Object.freeze({ kind: "encounter" });

/** The damage type whose Triumph extra makes a weapon glow. */
const GLOW_TYPE = "light";

/**
 * Whether an attack's Triumph lights the weapon up: one of its roll
 * modifiers adds extra damage only on a Triumph, noted as light damage
 * (Holy smite's d6 light).
 * @param {{onTriumph?: boolean, damage?: string, note?: string}[]} mods
 */
export function triumphGlows(mods) {
  return (mods ?? []).some(mod => mod?.onTriumph && mod.damage
    && String(mod.note ?? "").trim().toLowerCase() === GLOW_TYPE);
}

/**
 * The token changes the glow's Active Effect makes: dim light to at least
 * 10 feet (a longer light is kept) and a golden tint.
 * @returns {{key: string, type: string, value: *}[]}
 */
export function glowChanges() {
  return [
    { key: "token.light.dim", type: "upgrade", value: GLOW_RANGE },
    { key: "token.light.color", type: "override", value: GLOW_COLOUR }
  ];
}
