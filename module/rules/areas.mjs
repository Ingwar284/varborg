/**
 * Areas of effect (rules section 3, "Areas of Effect"; playtest feedback).
 *
 * A spell or power that names a shape and a size has an area:
 * - Emanation ("all creatures within 15'", "a 40' emanation around you",
 *   "a 20' radius around you"): spreads from the user, who is not caught
 *   unless the text says so. A sustained emanation moves with the user.
 * - Burst ("a 20' radius at a point within 60'"): a point within the second
 *   distance, everything within the radius.
 * - Cone ("a 30' cone"): a quarter-circle from the user, as long as stated.
 * - Line ("a 40' line"): straight from the user, 5' wide unless stated.
 * - Wall ("a wall, 10' by 10'"): the stated length, 5' thick.
 * - Square ("a 5-foot square", gear such as Caltrops and the Fire pot,
 *   GAPS 314): a square of the stated side at a point, like a burst.
 * A creature is caught if the area covers at least half of its tile.
 *
 * "Several targets" ("up to three creatures within 30'") is not an area:
 * those are chosen one by one with Foundry's targeting.
 *
 * Plain maths, no Foundry.
 */

/** The shapes, in the rules' order. */
export const AREA_SHAPES = ["emanation", "burst", "cone", "line", "wall", "square"];

/** Shapes placed at a point within a range of the user (not spread from the user). */
export const POINT_SHAPES = ["burst", "square"];

/** Who an area affects: everyone (the rules' default), or only foes or allies. */
export const AREA_AFFECTS = ["all", "foes", "allies"];

/** A line's or wall's width when the text gives none, in feet. */
export const DEFAULT_AREA_WIDTH = 5;

/** A cone is a quarter-circle. */
export const CONE_ANGLE = 90;

/** An empty area: the item has none. */
export function noArea() {
  return { shape: "", size: 0, range: 0, width: DEFAULT_AREA_WIDTH, affects: "all", includesUser: false };
}

const FEET = "(\\d+)\\s*(?:'|′|’|ft\\b|feet\\b|foot\\b)";

/** Who the words before "within" name: "all foes", "every ally", "creatures"… */
function affectsFrom(words) {
  const text = words.toLowerCase();
  if (/\b(foes?|enem(?:y|ies))\b/.test(text)) return "foes";
  if (/\ball(?:y|ies)\b/.test(text)) return "allies";
  return "all";
}

/**
 * Whether the text puts the user in its own area: "you included",
 * "including you", "you and all allies".
 */
function includesUserFrom(text) {
  return /\byou included\b|\bincluding you(?:rself)?\b|\byou and (?:all|every|your)\b/i.test(text);
}

/**
 * The area a spell's or power's text names, read from its wording, or
 * null when it names none (one target, several targets, or an area
 * measured from something other than the user, such as "within 10' of the
 * bloom", which the Dark Master places by hand).
 * The first area named counts.
 * @param {string} text
 * @returns {{shape: string, size: number, range: number, width: number, affects: string, includesUser: boolean}|null}
 */
export function areaFromText(text) {
  const source = String(text ?? "");
  const area = (fields, match) => {
    const sentence = sentenceAround(source, match.index);
    return {
      ...noArea(),
      affects: affectsFrom(sentence),
      includesUser: includesUserFrom(sentence),
      ...fields
    };
  };
  const tests = [
    // A burst: "a 20' radius at a point within 60'", "a 15' radius around a point within 30'", "a 30' radius within 60'".
    [new RegExp(`${FEET}\\s+radius(?:\\s+(?:at|around)\\s+a\\s+point)?(?:\\s+you\\s+choose)?\\s+within\\s+${FEET}`, "i"),
      m => ({ shape: "burst", size: +m[1], range: +m[2] })],
    // A burst at a point with no stated distance: "a 10' radius around a point you choose within reach", "a 10' burst".
    [new RegExp(`${FEET}\\s+radius\\s+around\\s+a\\s+point`, "i"), m => ({ shape: "burst", size: +m[1] })],
    [new RegExp(`${FEET}\\s+burst`, "i"), m => ({ shape: "burst", size: +m[1] })],
    // An emanation: "a 40' emanation", "a 20' radius around you", "a 40' radius around you".
    [new RegExp(`${FEET}\\s+emanation`, "i"), m => ({ shape: "emanation", size: +m[1] })],
    [new RegExp(`${FEET}\\s+radius\\s+around\\s+you`, "i"), m => ({ shape: "emanation", size: +m[1] })],
    // A radius with no point and no distance ("sweeps a 20' radius", "across a
    // 40' radius") spreads from the user: an emanation, as the rules define it
    // (a burst names its distance, "within 60'").
    [new RegExp(`${FEET}\\s+radius(?!\\s+(?:at|around)\\s+a\\s+point|\\s+within|\\s+around\\s+you)`, "i"), m => ({ shape: "emanation", size: +m[1] })],
    // A cone and a line ("a 30' cone", "a cone of pure absence, 60' long").
    [new RegExp(`${FEET}\\s+cone`, "i"), m => ({ shape: "cone", size: +m[1] })],
    [new RegExp(`\\bcone\\b[^.]{0,40}?${FEET}\\s+long`, "i"), m => ({ shape: "cone", size: +m[1] })],
    [new RegExp(`${FEET}\\s+line(?:,\\s*${FEET}\\s+wide)?`, "i"),
      m => ({ shape: "line", size: +m[1], width: m[2] ? +m[2] : DEFAULT_AREA_WIDTH })],
    // A wall: "a wall, 10' by 10'" or "a 20' wall".
    [new RegExp(`wall,\\s*${FEET}\\s+by\\s+${FEET}`, "i"), m => ({ shape: "wall", size: +m[1] })],
    [new RegExp(`${FEET}\\s+wall`, "i"), m => ({ shape: "wall", size: +m[1] })],
    // An emanation in words: "All foes within 30'", "every creature within 30'",
    // "Allies within 15'", "Everyone within 30'", "Structures within 20'" is not a creature.
    [new RegExp(`\\b((?:all|every|each)\\s+(?:\\w+\\s+){0,2}?(?:foes?|enem(?:y|ies)|all(?:y|ies)|creatures?)|(?:foes|enemies|allies|creatures)|everyone|everything)\\s+(?:you\\s+can\\s+see\\s+)?within\\s+${FEET}(?!\\s+of\\b)`, "i"),
      (m, all) => {
        // "Up to three willing creatures within 10'", "d8 random foes within 60'"
        // and "one or several foes within 60'" are several targets, not an area.
        const before = source.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
        if (/(?:up to|random|several|\bd\d+|\b(?:one|two|three|four)\b)[\w\s]*$/.test(before)) return null;
        return { shape: "emanation", size: +m[2], affects: affectsFrom(m[1]) };
      }]
  ];
  let best = null;
  for (const [pattern, read] of tests) {
    const match = pattern.exec(source);
    if (!match) continue;
    const fields = read(match);
    if (!fields) continue;
    if (!best || match.index < best.index) best = { index: match.index, value: area(fields, match) };
  }
  if (!best) return null;
  // The words' own "foes"/"allies" win over the sentence's.
  return best.value;
}

/** The sentence a match sits in, for "allies included" and who it affects. */
function sentenceAround(text, index) {
  const start = Math.max(text.lastIndexOf(".", index - 1), text.lastIndexOf("\n", index - 1)) + 1;
  const ends = [text.indexOf(".", index), text.indexOf("\n", index)].filter(at => at >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) : text.length);
}

/**
 * Whether a creature is caught: the area covers at least half of its tile
 * (rules: Measuring). Counted over the grid squares the creature fills.
 * @param {number} covered  Squares of the creature inside the area.
 * @param {number} total    Squares the creature fills (1 for a medium creature).
 */
export function isCaught(covered, total) {
  return total > 0 && covered * 2 >= total;
}

/**
 * Whether an area catches this creature by who it affects.
 * @param {object} area           { affects, includesUser }
 * @param {{isUser: boolean, isAlly: boolean}} creature
 *   isAlly: on the user's side (friendly to the user).
 */
export function areaAffects(area, { isUser, isAlly }) {
  if (isUser) return Boolean(area.includesUser);
  if (area.affects === "foes") return !isAlly;
  if (area.affects === "allies") return isAlly;
  return true;
}

/**
 * Whether any of an item's options has its own area (Songs of power:
 * Allegro, allies within 30'; Adagio, foes within 5'). Such an item is aimed
 * after the option is chosen.
 * @param {object} area  system.area
 */
export function hasOptionAreas(area) {
  return (area?.options ?? []).some(entry => entry.option && entry.shape);
}

/**
 * The area that counts for the chosen option: the option's own, if it has
 * one, keeping the item's lasting settings; otherwise the item's area.
 * @param {object} area      system.area
 * @param {string} [option]  The option chosen in the dialog.
 */
export function areaForOption(area, option) {
  const own = option ? (area?.options ?? []).find(entry => entry.option === option && entry.shape) : null;
  if (!own) return area;
  const { option: _name, ...fields } = own;
  return { ...area, ...fields };
}

