/**
 * The kinds of row in a creature's one list of effects (unified effects,
 * step 4): the Effects tab, the Ongoing panel and the icon strip all show
 * the same rows (module/ongoing.mjs).
 *
 * Each kind has a type tag shown beside it (Condition, Panic, Buff…) and a
 * place in the order. What a click does is the entry's own: `up` (left
 * click, +1) and `down` (right click, −1, removing it at 0 or when it has
 * no number of its own). No Foundry here: tested in tests/effect-kinds.test.mjs.
 */

/** Each kind and its type tag (VARBORG.Effects.Tag.<tag>), in list order. */
export const EFFECT_KINDS = {
  condition: "condition",
  fatigue: "condition",
  marker: "marker",
  persistent: "persistent",
  panic: "panic",
  injury: "injury",
  bodyPart: "bodyPart",
  hunger: "hunger",
  buff: "buff",
  area: "buff",
  sustaining: "inUse",
  switchedOn: "inUse",
  mounted: "inUse",
  shield: "combat",
  cover: "combat",
  attackRuin: "combat",
  light: "light",
  ability: "ability"
};

/** The type tag of a kind of row, or "" for one not in the list. */
export function effectTag(kind) {
  return EFFECT_KINDS[kind] ?? "";
}

/** Rows in list order: by kind, keeping the order within a kind. */
export function sortEffects(entries) {
  const order = Object.keys(EFFECT_KINDS);
  const place = kind => {
    const index = order.indexOf(kind);
    return index === -1 ? order.length : index;
  };
  return entries
    .map((entry, index) => ({ entry, index }))
    .toSorted((a, b) => place(a.entry.kind) - place(b.entry.kind) || a.index - b.index)
    .map(({ entry }) => entry);
}

/**
 * Which click hint a row shows (VARBORG.Ongoing.Hint.<key>), or "" when
 * clicking it does nothing.
 * @param {{kind: string, up?: boolean, down?: boolean}} entry
 */
export function clickHint(entry) {
  if (!entry?.up && !entry?.down) return "";
  if (entry.kind === "cover" || entry.kind === "light") return entry.kind;
  return entry.up ? "both" : "remove";
}

/**
 * The buttons a row shows on the sheet: − and + for a row with a number
 * (or a step, like cover and light), × for one that can only be removed.
 * They do what a right and a left click do in the Ongoing panel.
 * @param {{kind: string, up?: boolean, down?: boolean}} entry
 * @returns {{plus: boolean, minus: boolean, remove: boolean}}
 */
export function rowButtons(entry) {
  const stepped = Boolean(entry?.up) || entry?.kind === "cover" || entry?.kind === "light";
  if (stepped) return { plus: Boolean(entry.up), minus: Boolean(entry.down), remove: false };
  return { plus: false, minus: false, remove: Boolean(entry?.down) };
}

/** A count changed by a click: never below 0. */
export function steppedCount(value, step) {
  return Math.max(0, (Number.isFinite(value) ? value : 0) + step);
}
