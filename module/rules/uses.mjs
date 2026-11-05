/**
 * Limited uses: "once per round", "once per encounter" and "once per day".
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * Rules 3.16 "A new day": "Anything that happens 'once per day' or 'at the
 * start of each day' resets or triggers then." The rules' writing guide
 * (Rules text): "Frequencies are 'once per round', 'once per encounter' or
 * 'once per day'."
 *
 * Rulings (GAPS 161, 164): feats and gear have a frequency. Using one marks
 * it used until it comes back:
 * - once per round: at the start of each round, and when combat ends;
 * - once per encounter: when combat ends;
 * - once per day: at each new day (New day, Long Rest, Downtime).
 * The Dark Master can untick it by hand at any time. A new item whose text
 * says "once per round/encounter/day" starts with that frequency.
 *
 * More frequencies (GAPS 190, step 49g):
 * - once per turn: at the start of the character's turn, and when combat ends;
 * - once per Long Rest: at a Long Rest or Downtime;
 * - once per Downtime: at Downtime;
 * - once per visit (to a settlement): when the Dark Master resets them.
 * "The first time in a round" is once per round.
 */

/** The frequencies. "" means the item has no limited use. */
export const FREQUENCIES = ["", "round", "turn", "encounter", "day", "longRest", "downtime", "visit"];

/**
 * The moments uses come back:
 * roundStart  a new combat round starts;
 * turnStart   the character's turn starts;
 * combatEnd   combat ends;
 * newDay      a new day begins;
 * longRest    a Long Rest or Downtime;
 * downtime    Downtime;
 * visit       the Dark Master's reset of once-per-visit uses.
 */
export const RESET_EVENTS = ["roundStart", "turnStart", "combatEnd", "newDay", "longRest", "downtime", "visit"];

const RESETS = {
  round: ["roundStart", "combatEnd"],
  turn: ["turnStart", "combatEnd"],
  encounter: ["combatEnd"],
  day: ["newDay"],
  longRest: ["longRest", "downtime"],
  downtime: ["downtime"],
  visit: ["visit"]
};

/** The words in item text for each frequency, as in "once per Long Rest". */
const FREQUENCY_WORDS = {
  round: "round", turn: "turn", encounter: "encounter", day: "day",
  "long rest": "longRest", downtime: "downtime", visit: "visit"
};

/**
 * The frequency an item's text suggests: the first "once per round",
 * "once per turn", "once per encounter", "once per day", "once per Long
 * Rest", "once per Downtime" or "once per visit" in it, or "" if none.
 * @param {string} text
 */
export function frequencyFromText(text) {
  const match = /\bonce\s+per\s+(round|turn|encounter|day|long\s+rest|downtime|visit)\b/i.exec(String(text ?? ""));
  return match ? FREQUENCY_WORDS[match[1].toLowerCase().replace(/\s+/g, " ")] : "";
}

/** Whether an item has a limited use. */
export function hasFrequency(system) {
  return Boolean(system?.frequency) && FREQUENCIES.includes(system.frequency);
}

/** Whether an item's limited use can be used now (it has one, and it is not used). */
export function canUseOnce(system) {
  return hasFrequency(system) && !system.frequencyUsed;
}

/**
 * Whether a used item comes back at this moment.
 * @param {string} frequency
 * @param {string} event  One of RESET_EVENTS.
 */
export function resetsOn(frequency, event) {
  if (!RESET_EVENTS.includes(event)) throw new RangeError(`Unknown reset: ${event}`);
  return (RESETS[frequency] ?? []).includes(event);
}

/**
 * The items that come back at this moment, from a list of
 * { id, system } objects.
 * @param {Array<{id: string, system: object}>} items
 * @param {string} event
 * @returns {string[]}  Their ids.
 */
export function itemsToReset(items, event) {
  return (items ?? [])
    .filter(item => item?.system?.frequencyUsed && resetsOn(item.system.frequency, event))
    .map(item => item.id);
}
