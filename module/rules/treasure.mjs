/**
 * Treasure (rules 5. Treasure). Plain JavaScript, no Foundry, so it can be
 * tested on its own.
 *
 * "Roll the treasure once for the whole site, then scatter it through its
 * rooms, bodies and hiding places." A dungeon's size gives its coin, its
 * Spoils rolls and its other finds (trinkets, valuables, spell scrolls, a
 * relic). Where the dark is deeper the coin is doubled and one Spoils roll
 * added; where the site has been picked over the coin is halved.
 *
 * Designer rulings (GAPS 270 to 273):
 * - Spoils "a weapon": any weapon of the Weapons compendium (melee, shoot
 *   and throw, bombs included), except Unarmed, Improvised weapon, Grave
 *   insult and the class gifts, rolled with one die over all of them.
 * - Spoils "armour ... one tier lower, minimum t1": armour of t1 and up
 *   drops one tier, never below t1. Clothes (t0) stay t0. It is found in
 *   full repair at that lower tier, not as damaged armour.
 * - Halved coin is rounded down.
 * - A spell tome is a scroll item called a tome; learning it is by hand.
 *
 * Every roll goes through `roll(formula)`, an async function that returns
 * the total, so Foundry can show the dice and tests can load them.
 */

/** Dungeon sizes (rules 5, Treasure per dungeon). */
export const DUNGEONS = {
  small: { coinDice: 2, spoils: "1d2", trinkets: "1d4", valuables: null, scrolls: null, relicOn: null, relic: false },
  medium: { coinDice: 4, spoils: "1d4", trinkets: "1d2", valuables: "1", scrolls: "1", relicOn: 6, relic: false },
  large: { coinDice: 6, spoils: "1d6", trinkets: "1d4", valuables: "1d2", scrolls: "1d2", relicOn: 5, relic: false },
  lair: { coinDice: 10, spoils: "1d4 + 2", trinkets: null, valuables: "1d2", scrolls: "1d2", relicOn: null, relic: true }
};
export const DUNGEON_SIZES = Object.keys(DUNGEONS);

/**
 * Where the dungeon lies. "deep": the Hinterlands or beyond the
 * cairn-lights (double coin, one more Spoils roll). "picked": the
 * Heartlands or inside Emberglow (half coin).
 */
export const REGIONS = ["usual", "deep", "picked"];

/** The Spoils table (d20): what each row gives. */
export const SPOILS = [
  "nothing", "weapon", "weapon", "armour", "healingPotion", "medicineBox", "torches",
  "grenade", "firePot", "poison", "rations", "rope", "lockpicks", "purse", "purse",
  "trinket", "trinket", "valuable", "scroll", "again"
];

/** Spell scrolls: the d4 spell list. */
export const SCROLL_LISTS = ["arcane", "divine", "primal", "profane"];

/**
 * The spells of each list, by DR heading, in the order of the spell list
 * pages (rules: "spells are listed in order within each DR heading").
 */
export const SPELLS_BY_LIST = {
  arcane: {
    14: ["Bolts of Assurance", "And They Spoke of Fire", "Wink into Grief", "Marginalia"],
    16: ["The Unseen Blight", "Bar Nothing", "No", "Crimson Bloom"],
    18: ["Back to the Womb", "The King's Command", "Judgement of the Sun", "Chain of Discord"],
    20: ["Final Utterance", "The Moment Between Heartbeats", "Pluck the Stars from the Sky", "The Unmaking Vortex"]
  },
  divine: {
    14: ["Last Breath's Ward", "Finger of the Divine", "Hope's Prayer", "Chains of the Penitent"],
    16: ["Zealot's Fervour", "Break the Pact", "Sanctified Ground", "Chant of the Pious"],
    18: ["Unwilling Mending", "Wrath of the Heavens", "Aura of the Incorruptible", "Celestial Intercession"],
    20: ["Extinguish the Heretic", "The Rapture", "Avatar of the Eternal", "Harkin's Last Word"]
  },
  primal: {
    14: ["Iron-Bark Skin", "Predator's Lunging Strike", "Swarm of Shifting Shadows", "Vines of the Strangler"],
    16: ["Blood-Frenzy", "Venomous Maw", "Overgrowth", "Call of the North Wind"],
    18: ["Command the Deep Waters", "Season of the Scythe", "Earth-Shaker's Stomp", "Apex Evolution"],
    20: ["The Great Unmaking Storm", "Petrifying Glare", "Devour the Sun", "Call the World-Worm"]
  },
  profane: {
    14: ["Discordant Chord", "Laughter from the Walls", "Brain-Fog Monologue", "Bell of the Buried"],
    16: ["Soul-Sever", "Umbral Possession", "Plague of Secrets", "Eclipse of Reason"],
    18: ["Anatomy of the Abyss", "Grave-Soil Surge", "The Unspeakable Word", "Horror of the Unseen"],
    20: ["The Obsidian Erasure", "Hunger of the Deepest Night", "Awaken the Dark Vessel", "The Absolute Sensory Null"]
  }
};

/**
 * Weapons of the Weapons compendium that are never found as treasure:
 * Unarmed, Improvised weapon, Grave insult (a cutting insult), and the
 * class gifts Blade-arm and Spirit-linked sword.
 */
export const NOT_LOOT_WEAPONS = [
  "vbWeap0010000000", "vbWeap0020000000", "vbWeap0390000000", "vbWeapBladeArm00", "vbWeapSpirit0000"
];

/**
 * The weapons a Spoils "weapon" is rolled from, in name order.
 * @param {{_id: string, name: string, type: string}[]} entries  The compendium's index.
 */
export function lootWeapons(entries) {
  return entries
    .filter(entry => entry.type === "weapon" && !NOT_LOOT_WEAPONS.includes(entry._id))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * Split silver evenly: everyone gets the same whole amount, and what is
 * left over stays where it was.
 * @returns {{each: number, left: number}}
 */
export function splitSilver(silver, people) {
  if (!(people > 0) || !(silver > 0)) return { each: 0, left: Math.max(0, silver || 0) };
  const each = Math.floor(silver / people);
  return { each, left: silver - each * people };
}

/** Clean up a choice from a form: an unknown dungeon size is Small. */
export function cleanDungeon(size) {
  return DUNGEON_SIZES.includes(size) ? size : "small";
}

/** Clean up a region choice: anything unknown is "usual". */
export function cleanRegion(region) {
  return REGIONS.includes(region) ? region : "usual";
}

/** The coin after the region: doubled where it is deeper, halved (down) where picked over. */
export function coinForRegion(coin, region) {
  if (region === "deep") return coin * 2;
  if (region === "picked") return Math.floor(coin / 2);
  return coin;
}

/** The coin formula of a dungeon: Nd6 × 10. */
export function coinFormula(size) {
  return `${DUNGEONS[cleanDungeon(size)].coinDice}d6 * 10`;
}

/**
 * Damaged armour from the Spoils table: one tier lower, minimum t1.
 * Clothes (t0) stay t0 (GAPS 271).
 */
export function damagedTier(tier) {
  if (!(tier > 0)) return 0;
  return Math.max(1, tier - 1);
}

/** The scroll's tier from its d6, and the second d6 on a 6. */
export function scrollDr(tierRoll, againRoll = 1) {
  if (tierRoll <= 3) return 14;
  if (tierRoll <= 5) return 16;
  return againRoll <= 4 ? 18 : 20;
}

/** The relic's number (1–22) from the d2 and the d12 or d10. */
export function relicNumber(halfRoll, numberRoll) {
  return halfRoll === 1 ? numberRoll : numberRoll + 12;
}

/** Roll which spell a scroll or tome holds. */
export async function rollSpell(roll) {
  const list = SCROLL_LISTS[(await roll("1d4")) - 1];
  const tierRoll = await roll("1d6");
  const againRoll = tierRoll === 6 ? await roll("1d6") : null;
  const dr = scrollDr(tierRoll, againRoll ?? 1);
  const index = (await roll("1d4")) - 1;
  return { list, dr, name: SPELLS_BY_LIST[list][dr][index] };
}

/** The compendium id of relic number n: vbRelic + 3 digits + 000000 (16 characters). */
export function relicId(number) {
  return `vbRelic${String(number).padStart(3, "0")}000000`;
}

/** Roll a relic (d2, then d12 or d10 + 12). */
export async function rollRelic(roll) {
  const half = await roll("1d2");
  return relicNumber(half, await roll(half === 1 ? "1d12" : "1d10"));
}

/**
 * One roll on the Spoils table, with any further dice it calls for. A 20
 * rolls twice more. Returns the finds, in order.
 * @param {(formula: string) => Promise<number>} roll
 * @param {object} [options]
 * @param {number} [options.weapons]  How many weapons a "weapon" is rolled from.
 * @param {number} [depth]  How many 20s deep (a safety stop at 20).
 */
export async function rollSpoils(roll, { weapons = 0 } = {}, depth = 0) {
  const d20 = await roll("1d20");
  const kind = SPOILS[d20 - 1];
  const find = { source: "spoils", d20, kind };
  switch (kind) {
    case "weapon":
      if (weapons > 0) find.number = await roll(`1d${weapons}`);
      break;
    case "armour":
      find.row = await roll("1d10");
      break;
    case "torches":
    case "rations":
      find.quantity = await roll("1d4");
      break;
    case "poison":
      find.colour = (await roll("1d2")) === 1 ? "black" : "red";
      break;
    case "purse":
      find.silver = await roll("3d10");
      break;
    case "trinket":
      find.number = await roll("1d20");
      break;
    case "valuable":
      find.number = await roll("1d12");
      break;
    case "scroll":
      find.spell = await rollSpell(roll);
      break;
    case "again":
      if (depth >= 20) break;
      return [find, ...await rollSpoils(roll, { weapons }, depth + 1), ...await rollSpoils(roll, { weapons }, depth + 1)];
  }
  return [find];
}

/** Roll a count such as "1d4 + 2" or "1"; nothing when there is none. */
async function count(roll, formula) {
  if (!formula) return 0;
  return /d/.test(formula) ? roll(formula) : Number(formula);
}

/**
 * The treasure of one dungeon.
 * @param {object} choice
 * @param {string} choice.size        small, medium, large or lair.
 * @param {string} [choice.region]    usual, deep or picked.
 * @param {boolean} [choice.mighty]   A lair of a Mighty foe (adds a spell tome).
 * @param {number} [choice.weapons]   How many weapons a Spoils "weapon" is rolled from.
 * @param {(formula: string) => Promise<number>} roll
 * @returns {Promise<{size: string, region: string, mighty: boolean,
 *   rolledCoin: number, silver: number, spoilsRolls: number, finds: object[]}>}
 *   silver is the coin after the region. Each find has a `kind` and its
 *   own details; `source` is "spoils" or "other".
 */
export async function rollTreasure({ size, region = "usual", mighty = false, weapons = 0 }, roll) {
  size = cleanDungeon(size);
  region = cleanRegion(region);
  mighty = size === "lair" && !!mighty;
  const dungeon = DUNGEONS[size];

  const rolledCoin = await roll(coinFormula(size));
  const silver = coinForRegion(rolledCoin, region);

  let spoilsRolls = await count(roll, dungeon.spoils);
  if (region === "deep") spoilsRolls += 1;
  const finds = [];
  for (let i = 0; i < spoilsRolls; i++) finds.push(...await rollSpoils(roll, { weapons }));

  const other = (kind, details) => finds.push({ source: "other", kind, ...details });
  const trinkets = await count(roll, dungeon.trinkets);
  for (let i = 0; i < trinkets; i++) other("trinket", { number: await roll("1d20") });
  const valuables = await count(roll, dungeon.valuables);
  for (let i = 0; i < valuables; i++) other("valuable", { number: await roll("1d12") });
  const scrolls = await count(roll, dungeon.scrolls);
  for (let i = 0; i < scrolls; i++) other("scroll", { spell: await rollSpell(roll) });
  if (dungeon.relic) other("relic", { number: await rollRelic(roll) });
  else if (dungeon.relicOn) {
    const d6 = await roll("1d6");
    if (d6 >= dungeon.relicOn) other("relic", { number: await rollRelic(roll), d6 });
    else other("noRelic", { d6 });
  }
  if (mighty) other("tome", { spell: await rollSpell(roll) });

  return { size, region, mighty, rolledCoin, silver, spoilsRolls, finds };
}

/* -------------------------------------------- */
/*  Searching the fallen                         */
/* -------------------------------------------- */

/**
 * Who can be searched (rules 5, Searching the fallen; GAPS 328): beasts
 * carry nothing. Every other foe is searched, whatever its category (no
 * category counts as mindless for now).
 * @param {string} category  The foe's category.
 * @returns {"search"|"nothing"}
 */
export function fallenKind(category) {
  return category === "beast" ? "nothing" : "search";
}

/** What the search d6 finds: 1–3 nothing, 4–5 d10 s, 6 one Spoils roll. */
export function searchResult(d6) {
  if (d6 <= 3) return "nothing";
  if (d6 <= 5) return "coin";
  return "spoils";
}

/**
 * Search a fallen humanoid: roll a d6, then d10 s or one Spoils roll.
 * @param {(formula: string) => Promise<number>} roll
 * @param {object} [options]
 * @param {number} [options.weapons]  How many weapons a "weapon" is rolled from.
 * @returns {Promise<{d6: number, result: string, silver: number, finds: object[]}>}
 *   silver is the coin found, purses from the Spoils table included.
 */
export async function searchFallen(roll, { weapons = 0 } = {}) {
  const d6 = await roll("1d6");
  const result = searchResult(d6);
  let silver = 0;
  let finds = [];
  if (result === "coin") silver = await roll("1d10");
  if (result === "spoils") {
    finds = await rollSpoils(roll, { weapons });
    silver = finds.reduce((sum, find) => sum + (find.silver ?? 0), 0);
  }
  return { d6, result, silver, finds };
}
