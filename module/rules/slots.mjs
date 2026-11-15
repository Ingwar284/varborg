/**
 * Equipment slots: what a character wears and holds (designer ruling,
 * GAPS 287). Plain JavaScript, no Foundry.
 *
 * Every carried item has a "Worn as" tag (wornAs) and a place (where it is
 * now). Rules:
 * - Distinct tags stack: a mask, an eyepiece and headwear can all be worn.
 * - The same tag conflicts: two cloaks cannot be worn at once. Shoes and
 *   boots share the "feet" tag, so they conflict too.
 * - Untagged "worn" items (rings, necklaces, brooches, scarves) never
 *   conflict with anything.
 * - Each hand holds one item. A two-handed item fills both hands; a
 *   versatile one fills one or both, as the player chooses.
 * - Putting an item where another one is takes the other one off (swap).
 *
 * Items passed in are plain: { id, place, wornAs, twoHanded, versatile }.
 * The traits should be the weapon's traits after effects (Titan's grip
 * makes a two-handed weapon versatile).
 */

/** The worn tags, each one a slot, in the order the sheet shows them. */
export const WORN_TAGS = [
  "headwear", "mask", "eyepiece",
  "shoulders", "cloak", "garment", "clothing", "armour", "back", "bandoleer",
  "bracers", "gloves", "handwraps",
  "belt", "feet"
];

/** "Worn as" choices: not wearable, untagged worn, or a tag. */
export const WORN_PLAIN = "worn";
export const WORN_AS_CHOICES = ["", WORN_PLAIN, ...WORN_TAGS];

/** Where an item is now. "" is not placed (just carried). */
export const PLACES = ["", "left", "right", "both", "worn"];

/** The hand slots. */
export const HANDS = ["left", "right"];

/** The hands a place fills. */
export function handsOf(place) {
  if (place === "both") return ["left", "right"];
  if (HANDS.includes(place)) return [place];
  return [];
}

/** Is the item worn or held? */
export function isPlaced(item) {
  return Boolean(item?.place);
}

/**
 * Can this item go in this slot? A slot is a hand ("left", "right",
 * "both"), a worn tag, or "worn" for untagged worn items.
 */
export function fits(item, slot) {
  if (HANDS.includes(slot)) return true;
  if (slot === "both") return Boolean(item.twoHanded || item.versatile);
  if (slot === WORN_PLAIN) return item.wornAs === WORN_PLAIN;
  return WORN_TAGS.includes(slot) && item.wornAs === slot;
}

/**
 * The place an item gets when put in a slot. A two-handed item put in
 * either hand fills both. A worn slot gives the place "worn".
 * @param {object} item
 * @param {string} slot  As in fits.
 * @param {boolean} [bothHands]  For a versatile item: hold it in both hands.
 */
export function placeFor(item, slot, bothHands = false) {
  if (slot === "both") return "both";
  if (HANDS.includes(slot)) {
    if (item.twoHanded || (item.versatile && bothHands)) return "both";
    return slot;
  }
  return "worn";
}

/**
 * Put an item in a slot. Returns the new place and the ids of the items
 * that must come off to make room, or null when the item does not fit.
 * @param {object[]} items  Every carried item of the character.
 * @param {object} item  The item to place (one of items, or new).
 * @param {string} slot  As in fits.
 * @param {boolean} [bothHands]  As in placeFor.
 * @returns {{ place: string, remove: string[] } | null}
 */
export function planPlace(items, item, slot, bothHands = false) {
  if (!fits(item, slot)) return null;
  const place = placeFor(item, slot, bothHands);
  const others = (items ?? []).filter(other => other.id !== item.id && isPlaced(other));
  let remove;
  if (place === "worn") {
    // Untagged worn items never conflict.
    remove = item.wornAs === WORN_PLAIN ? []
      : others.filter(other => other.place === "worn" && other.wornAs === item.wornAs);
  } else {
    const hands = handsOf(place);
    remove = others.filter(other => handsOf(other.place).some(hand => hands.includes(hand)));
  }
  return { place, remove: remove.map(other => other.id) };
}

/**
 * The slot an item goes to when equipped without choosing one (the
 * Inventory tick): a wearable item that is not a weapon or shield is worn;
 * everything else is held, two-handed in both hands, otherwise in the
 * right hand if free, then the left, then the right again (swapping).
 * @param {object[]} items
 * @param {object} item  Also { type }.
 */
export function defaultSlot(items, item) {
  const held = item.type === "weapon" || item.type === "shield";
  if (!held && item.wornAs === WORN_PLAIN) return WORN_PLAIN;
  if (!held && WORN_TAGS.includes(item.wornAs)) return item.wornAs;
  if (item.twoHanded) return "both";
  const busy = new Set((items ?? [])
    .filter(other => other.id !== item.id)
    .flatMap(other => handsOf(other.place)));
  if (!busy.has("right")) return "right";
  if (!busy.has("left")) return "left";
  return "right";
}

/**
 * What is in each slot, for the sheet: { left, right, worn: [], <tag>: item }.
 * A both-hands item is in left and right. If old data put two items in one
 * slot, the first one is shown.
 */
export function slotContents(items) {
  const slots = { left: null, right: null, worn: [] };
  for (const tag of WORN_TAGS) slots[tag] = null;
  for (const item of items ?? []) {
    if (item.place === "worn") {
      if (WORN_TAGS.includes(item.wornAs)) slots[item.wornAs] ??= item;
      else slots.worn.push(item);
    }
    for (const hand of handsOf(item.place)) slots[hand] ??= item;
  }
  return slots;
}

/** Armour items that are clothes, by name (rules 4.1), and how they are worn. */
const CLOTHES = {
  "rags": "clothing", "poor clothes": "clothing", "commoner clothes": "clothing",
  "fancy clothes": "clothing", "cold weather clothes": "clothing",
  "hot weather clothes": "clothing", "robes": "garment"
};

/**
 * How an armour item without a "Worn as" tag is worn (data version 14):
 * clothes as clothing, robes as a garment, everything else as armour.
 */
export function armourWornAs(name) {
  return CLOTHES[String(name ?? "").trim().toLowerCase()] ?? "armour";
}

/**
 * Where a character's equipped items go when slots arrive (data version
 * 14). Items are tried in the given order; one whose slot is already taken
 * stays carried but is no longer equipped.
 * @param {object[]} items  Plain items as for planPlace, plus { equipped }.
 * @returns {Map<string, string>}  Item id to its new place ("" for none).
 */
export function placesForEquipped(items) {
  const placed = [];
  const result = new Map();
  for (const item of items) {
    if (!item.equipped) continue;
    const slot = defaultSlot(placed, item);
    const plan = planPlace(placed, item, slot);
    const fitsFree = plan && plan.remove.length === 0;
    const place = fitsFree ? plan.place : "";
    if (place) placed.push({ ...item, place });
    result.set(item.id, place);
  }
  return result;
}
