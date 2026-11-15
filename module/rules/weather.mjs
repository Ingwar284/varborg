/**
 * The weather hex flower.
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules (Subsystem: Weather): "At the start of the game, place a token on
 * 'perfect day'. At the start of each day, roll 2d6 and move the weather
 * token one hex in the direction of the result. In the event you are at the
 * border of the hex flower, you either go to the opposite side of the row,
 * or repeat the current weather if walled off." "When the weather token on
 * hex flower lands on a Minor or Major hazard, roll a d10 on that table.
 * The event lasts until the next day begins."
 *
 * Designer ruling (GAPS 155, the Weather page with the hex flower):
 * - 2d6: 12 up, 2–3 up-right, 4–5 down-right, 6–7 down, 8–9 down-left,
 *   10–11 up-left.
 * - Walled edges (the double lines): Major hazard's top and both upper
 *   edges, the top of both Storms, the bottom of both outer Clear skies and
 *   of Perfect day, and the outer lower edge of each Minor hazard. Every
 *   other border edge wraps: the token comes back in at the far end of the
 *   same line.
 *
 * Designer ruling (GAPS 166): when a walled edge repeats a hazard, the
 * same event repeats; no new d10 is rolled.
 *
 * The flower uses flat-topped hexes in axial coordinates (q, r): q is the
 * column (−2 left to 2 right), r runs down each column. The centre Clouded
 * is (0, 0), Major hazard (0, −2), Perfect day (0, 2).
 */

/** The 19 hexes of the flower: id "q,r" and the weather kind. */
export const HEXES = [
  { q: 0, r: -2, kind: "majorHazard" },
  { q: -1, r: -1, kind: "storm" },
  { q: 1, r: -2, kind: "storm" },
  { q: -2, r: 0, kind: "minorHazard" },
  { q: 0, r: -1, kind: "heavyPrecipitation" },
  { q: 2, r: -2, kind: "minorHazard" },
  { q: -1, r: 0, kind: "lightPrecipitation" },
  { q: 1, r: -1, kind: "lightPrecipitation" },
  { q: -2, r: 1, kind: "heavyPrecipitation" },
  { q: 0, r: 0, kind: "clouded" },
  { q: 2, r: -1, kind: "heavyPrecipitation" },
  { q: -1, r: 1, kind: "clouded" },
  { q: 1, r: 0, kind: "clouded" },
  { q: -2, r: 2, kind: "clouded" },
  { q: 0, r: 1, kind: "clearSky" },
  { q: 2, r: 0, kind: "clouded" },
  { q: -1, r: 2, kind: "clearSky" },
  { q: 1, r: 1, kind: "clearSky" },
  { q: 0, r: 2, kind: "perfectDay" }
].map(hex => ({ ...hex, id: hexId(hex.q, hex.r) }));

const BY_ID = new Map(HEXES.map(hex => [hex.id, hex]));

/** Where the token starts: Perfect day. */
export const START_HEX = hexId(0, 2);

/** The six directions, as steps in (q, r). */
export const DIRECTIONS = {
  up: { q: 0, r: -1 },
  upRight: { q: 1, r: -1 },
  downRight: { q: 1, r: 0 },
  down: { q: 0, r: 1 },
  downLeft: { q: -1, r: 1 },
  upLeft: { q: -1, r: 0 }
};

/** Which way each 2d6 total moves the token (GAPS 155). */
export const DIRECTION_BY_TOTAL = {
  2: "upRight", 3: "upRight",
  4: "downRight", 5: "downRight",
  6: "down", 7: "down",
  8: "downLeft", 9: "downLeft",
  10: "upLeft", 11: "upLeft",
  12: "up"
};

/** Border edges that are walled off: "hex id:direction" (GAPS 155). */
export const WALLS = new Set([
  `${hexId(0, -2)}:up`, `${hexId(0, -2)}:upLeft`, `${hexId(0, -2)}:upRight`,
  `${hexId(-1, -1)}:up`, `${hexId(1, -2)}:up`,
  `${hexId(-2, 0)}:downLeft`, `${hexId(2, -2)}:downRight`,
  `${hexId(-1, 2)}:down`, `${hexId(1, 1)}:down`,
  `${hexId(0, 2)}:down`
]);

/** The hazard tables, d10 results 1 to 10 in order. */
export const HAZARDS = {
  minor: [
    "siltRain", "whistling", "creepfrost", "tamefire", "lightstrike",
    "hazefall", "shadowstretch", "strongGales", "blightPollen", "loomingDark"
  ],
  major: [
    "dayOfGloom", "energyVoid", "heavyGravity", "photonStorm", "blackburn",
    "oilmist", "shadowblightOutbreak", "lightGravity", "energyFont", "dayOfEmber"
  ]
};

export const MOVE_DICE = "2d6";
export const HAZARD_DIE = "1d10";

export function hexId(q, r) {
  return `${q},${r}`;
}

/** The hex with this id, or undefined. */
export function hexById(id) {
  return BY_ID.get(id);
}

/** Whether (q, r) is on the flower. */
export function onFlower(q, r) {
  return BY_ID.has(hexId(q, r));
}

/**
 * The hazard table a hex rolls on: "minor", "major", or null.
 * @param {string} id
 */
export function hazardTableOf(id) {
  const kind = hexById(id)?.kind;
  if (kind === "minorHazard") return "minor";
  if (kind === "majorHazard") return "major";
  return null;
}

/**
 * The hazard event for a d10 result on a table.
 * @param {"minor"|"major"} table
 * @param {number} roll  1 to 10.
 */
export function hazardFor(table, roll) {
  const list = HAZARDS[table];
  if (!list || !Number.isInteger(roll) || roll < 1 || roll > list.length) {
    throw new RangeError(`Not a hazard: ${table} ${roll}`);
  }
  return list[roll - 1];
}

/** The direction for a 2d6 total. */
export function directionFor(total) {
  const direction = DIRECTION_BY_TOTAL[total];
  if (!direction) throw new RangeError(`Not a 2d6 total: ${total}`);
  return direction;
}

/**
 * Move the weather token one hex.
 * @param {string} from   The hex id it is on.
 * @param {number} total  The 2d6 total.
 * @returns {{from: string, to: string, direction: string, wrapped: boolean, walled: boolean}}
 */
export function moveWeather(from, total) {
  const hex = hexById(from);
  if (!hex) throw new RangeError(`Not a weather hex: ${from}`);
  const direction = directionFor(total);
  const step = DIRECTIONS[direction];
  const q = hex.q + step.q;
  const r = hex.r + step.r;
  if (onFlower(q, r)) return { from, to: hexId(q, r), direction, wrapped: false, walled: false };
  if (WALLS.has(`${from}:${direction}`)) return { from, to: from, direction, wrapped: false, walled: true };
  // Wrap: walk back along the same line to its far end.
  let back = { q: hex.q, r: hex.r };
  while (onFlower(back.q - step.q, back.r - step.r)) {
    back = { q: back.q - step.q, r: back.r - step.r };
  }
  return { from, to: hexId(back.q, back.r), direction, wrapped: true, walled: false };
}

/**
 * The day's weather after a move.
 * A hazard hex rolls its d10 unless a wall kept the token on the same
 * hazard, which repeats the event (GAPS 166).
 * @param {{hex: string, hazard: (string|null)}} today
 * @param {{to: string, walled: boolean}} move
 * @returns {{hex: string, table: (string|null), rollHazard: boolean, hazard: (string|null)}}
 *   hazard is the repeated event when rollHazard is false.
 */
export function weatherAfterMove(today, move) {
  const table = hazardTableOf(move.to);
  if (!table) return { hex: move.to, table: null, rollHazard: false, hazard: null };
  const repeats = move.walled && today.hazard && HAZARDS[table].includes(today.hazard);
  return {
    hex: move.to,
    table,
    rollHazard: !repeats,
    hazard: repeats ? today.hazard : null
  };
}

/**
 * A stored weather state made safe: an unknown hex goes back to the start,
 * a hazard that does not belong to the hex is dropped.
 * @param {*} state
 * @returns {{hex: string, hazard: (string|null)}}
 */
export function cleanWeather(state) {
  const hex = hexById(state?.hex) ? state.hex : START_HEX;
  const table = hazardTableOf(hex);
  const hazard = table && HAZARDS[table].includes(state?.hazard) ? state.hazard : null;
  return { hex, hazard };
}

/**
 * Where to draw each hex, in hex widths (flat-topped): x from the left,
 * y from the top in hex heights.
 * @param {{q: number, r: number}} hex
 */
export function hexPosition({ q, r }) {
  return { x: (q + 2) * 0.75, y: r + q / 2 + 2 };
}
