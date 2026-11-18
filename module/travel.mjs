/**
 * Overland travel in Foundry (step 40; Subsystem: Overland Travel;
 * GAPS 159, 160, 309).
 *
 * The Overland panel (module/panels.mjs) shows the party's region
 * (Emberglow, Heartlands, Hinterlands, Darklands) and travel method (Trek,
 * Gallop, Cruise) to everyone; the Dark Master picks them there. Both are
 * saved in the world setting "overland", with whether Gallop has been used
 * since the last Long rest (GAPS 309: once between long rests; module/rest.mjs
 * makes it ready again).
 *
 * The Dark Master's Travel button: the party spends the rest of the
 * current phase on the road: the clock moves on to the next noon, dusk or
 * dawn (at dawn the New day dialog opens first; closing it cancels the
 * travel). Speed is in hexes per phase: Trek 1, Gallop 2, Cruise 3. At the
 * end of the phase the encounter d20 is rolled, with Boon by night or in
 * the Hinterlands or the Darklands, and a travel card is posted:
 * - 1 to 2: the weather shifts (the 2d6 move of module/weather.mjs, with
 *   its own weather card). With the Weather subsystem switched off
 *   (module/settings.mjs), this result is re-rolled instead (GAPS 261).
 * - Scenery: a d100 read-aloud line for the region.
 * - Travel hardship: its d20 table is rolled and the hardship shown, with
 *   its place tag and a note when it misfits the region.
 * - Omen (new) and Omen (ongoing): with the light die (basic rules 1.5),
 *   the current Misery's omen. With Omens of Misery (GAPS 307, 309), a new
 *   omen starts (or the next Misery comes), or a live omen moves on
 *   (module/misery.mjs).
 * - Encounters are named with their threat points; the Dark Master rolls
 *   the Combat Tables.
 *
 * An Energy void halves the day's travel and an Energy font adds half
 * again (step 41): the card shows the hexes for today's weather, as it was
 * when the party set out.
 *
 * The maths lives in module/rules/travel.mjs.
 */

import {
  METHODS, REGIONS, ENCOUNTER_POINTS, HARDSHIP_DIE, SCENERY_DIE, hasBoon, encounterFormula, encounterFor, isOmen,
  hardshipFor, misfits, cleanMethod, cleanRegion, canUse, cleanOverland
} from "./rules/travel.mjs";
import { phaseAt } from "./rules/calendar.mjs";
import { nextPhase } from "./calendar.mjs";
import { shiftWeather, currentWeather } from "./weather.mjs";
import { miseryContext, omenForTravel } from "./misery.mjs";
import { travelFactorFor, travelSpeed } from "./rules/weather-effects.mjs";
import { weatherOn, omensMode } from "./settings.mjs";

const SYSTEM = "var-borg";

/** An icon for each region's tile on the Overland panel. */
const REGION_ICONS = {
  emberglow: "fa-solid fa-city",
  heartlands: "fa-solid fa-wheat-awn",
  hinterlands: "fa-solid fa-mountain",
  darklands: "fa-solid fa-eye-slash"
};
const SETTING = "overland";

/** The overland setting. Changing it redraws the Overland panel. */
export function registerTravel(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: cleanOverland(null),
    onChange
  });
}

/** The party's region, method and whether Gallop is spent. */
export function currentOverland() {
  return cleanOverland(game.settings.get(SYSTEM, SETTING));
}

async function saveOverland(changes) {
  await game.settings.set(SYSTEM, SETTING, cleanOverland({ ...currentOverland(), ...changes }));
}

/** Dark Master only: the party's region. */
export async function setRegion(region) {
  if (!game.user.isGM) return;
  await saveOverland({ region: cleanRegion(region) });
}

/** Dark Master only: the travel method (Gallop only when it is ready). */
export async function setMethod(method) {
  if (!game.user.isGM) return;
  const clean = cleanMethod(method);
  if (!canUse(clean, currentOverland())) {
    ui.notifications.warn("VARBORG.Travel.GallopNotReady", { localize: true });
    return;
  }
  await saveOverland({ method: clean });
}

/** Dark Master only: Gallop is ready again (a Long rest, or by hand from the panel). */
export async function gallopReady() {
  if (!game.user.isGM || !currentOverland().gallopUsed) return;
  await saveOverland({ gallopUsed: false });
}

/* -------------------------------------------- */
/*  Names                                        */
/* -------------------------------------------- */

function methodName(method) {
  return game.i18n.localize(`VARBORG.Travel.Method.${method}`);
}

function regionName(region) {
  return game.i18n.localize(`VARBORG.Travel.Region.${region}`);
}

function phaseName(phase) {
  return game.i18n.localize(`VARBORG.Calendar.Phase.${phase}`);
}

/** A speed as written: 1, 2, ½, 1½. */
function speedText(speed) {
  const whole = Math.floor(speed);
  const half = speed - whole >= 0.5;
  if (!half) return String(whole);
  return whole ? `${whole}½` : "½";
}

/** "1 hex", "½ hex", "1½ hexes". */
function hexText(speed) {
  return game.i18n.format(speed <= 1 ? "VARBORG.Travel.HexOne" : "VARBORG.Travel.HexMany", { speed: speedText(speed) });
}

/** The line about today's weather and travel, or "" if it changes nothing. */
function weatherTravelLine(hazard, speed) {
  if (travelFactorFor(hazard) === 1) return "";
  const name = game.i18n.localize(`VARBORG.Weather.Hazard.${hazard}.Name`);
  const key = travelFactorFor(hazard) < 1 ? "VARBORG.Travel.WeatherSlowerCard" : "VARBORG.Travel.WeatherFasterCard";
  return game.i18n.format(key, { hazard: name, speed: hexText(travelSpeed(speed, hazard)), usual: hexText(speed) });
}

/* -------------------------------------------- */
/*  The panel                                    */
/* -------------------------------------------- */

/** The travel half of the Overland panel. */
export function overlandContext() {
  const i18n = game.i18n;
  const state = currentOverland();
  const { hazard } = currentWeather();
  const phase = phaseAt(game.time.worldTime);
  const speed = METHODS[state.method];
  return {
    regions: REGIONS.map(id => ({
      id,
      icon: REGION_ICONS[id],
      name: i18n.localize(`VARBORG.Travel.RegionTile.${id}`),
      mood: i18n.localize(`VARBORG.Travel.RegionMood.${id}`),
      boon: hasBoon({ phase: "morning", region: id }),
      active: id === state.region
    })),
    methods: Object.entries(METHODS).map(([id, methodSpeed]) => ({
      id,
      name: methodName(id),
      speed: methodSpeed,
      hexes: hexText(methodSpeed),
      need: i18n.localize(`VARBORG.Travel.MethodNeed.${id}`),
      spent: id === "gallop" && state.gallopUsed,
      active: id === state.method
    })),
    plan: i18n.format("VARBORG.Travel.Plan", {
      phase: phaseName(phase), hexes: hexText(travelSpeed(speed, hazard))
    }),
    weatherLine: weatherOn() ? weatherTravelLine(hazard, speed) : "",
    boon: hasBoon({ phase, region: state.region }),
    boonLine: hasBoon({ phase, region: state.region })
      ? i18n.format("VARBORG.Travel.BoonNow", { reason: boonReason({ phase, region: state.region }) })
      : ""
  };
}

/* -------------------------------------------- */
/*  Travelling                                   */
/* -------------------------------------------- */

/**
 * Dark Master only: travel for the rest of the current phase with the
 * panel's region and method, then roll the encounter table and post the
 * travel card.
 * @returns {Promise<boolean>}  Whether the party travelled.
 */
export async function travel() {
  if (!game.user.isGM) return false;
  const { region, method, gallopUsed } = currentOverland();
  if (!canUse(method, { gallopUsed })) {
    ui.notifications.warn("VARBORG.Travel.GallopNotReady", { localize: true });
    return false;
  }
  const phase = phaseAt(game.time.worldTime);
  // The weather the party sets out in: a new day at the end of the phase
  // does not change how far they went (step 41).
  const { hazard } = currentWeather();

  // Spend the phase. At dawn the New day dialog opens; closing it cancels.
  if (!(await nextPhase())) {
    ui.notifications.info("VARBORG.Travel.Cancelled", { localize: true });
    return false;
  }
  // Gallop: once between long rests (GAPS 309).
  if (method === "gallop") await saveOverland({ gallopUsed: true, method: "trek" });

  const trip = { phase, region };
  let roll = new Roll(encounterFormula(trip));
  await roll.evaluate();
  let key = encounterFor(roll.total);
  const rolls = [roll];
  // No weather in use: "the weather shifts" is re-rolled (GAPS 261).
  const rerolled = [];
  while (key === "weather" && !weatherOn()) {
    rerolled.push(roll.total);
    roll = new Roll(encounterFormula(trip));
    await roll.evaluate();
    rolls.push(roll);
    key = encounterFor(roll.total);
  }

  let hardship = null;
  if (key === "hardship") {
    const d20 = new Roll(HARDSHIP_DIE);
    await d20.evaluate();
    rolls.push(d20);
    hardship = { roll: d20.total, ...hardshipFor(d20.total) };
  }

  let scenery = null;
  if (key === "scenery") {
    const d100 = new Roll(SCENERY_DIE);
    await d100.evaluate();
    rolls.push(d100);
    scenery = d100.total;
  }

  // Omens of Misery: a new omen starts, or an omen moves on (GAPS 307, 309).
  let omen = null;
  if (isOmen(key) && omensMode()) {
    omen = await omenForTravel(key === "omenNew" ? "new" : "ongoing");
    rolls.push(...omen.rolls);
  }

  await postTravelCard({ method, region, phase, roll, key, hardship, scenery, rolls, hazard, rerolled, omen });
  if (key === "weather") await shiftWeather();
  return true;
}

/* -------------------------------------------- */
/*  The card                                     */
/* -------------------------------------------- */

/** "7 and 15, keep 15" with Boon, or "12". */
function diceText(roll) {
  const results = roll.dice[0]?.results ?? [];
  if (results.length < 2) return String(roll.total);
  return game.i18n.format("VARBORG.Travel.KeepHigher", {
    dice: results.map(result => result.result).join(game.i18n.localize("VARBORG.Travel.And")),
    kept: roll.total
  });
}

/** Why the encounter roll has Boon: "night", "the Hinterlands" or both. */
function boonReason({ phase, region }) {
  const reasons = [];
  if (phase === "night") reasons.push(game.i18n.localize("VARBORG.Travel.BoonNight"));
  if (hasBoon({ phase: "morning", region })) reasons.push(regionName(region));
  return reasons.join(game.i18n.localize("VARBORG.Travel.And"));
}

/** The omen line: the current Misery's omen (rules 1.5). */
function omenLine() {
  const misery = miseryContext();
  if (misery.omen) return game.i18n.format("VARBORG.Travel.OmenOf", { name: misery.name, omen: misery.omen });
  if (misery.level >= 1 && !misery.end) return game.i18n.format("VARBORG.Travel.OmenNoText", { name: misery.name });
  return game.i18n.localize("VARBORG.Travel.OmenNone");
}

/** The lines that explain the result. */
function resultLines(key, hardship) {
  const i18n = game.i18n;
  if (key === "hardship") return [i18n.format("VARBORG.Travel.HardshipRolled", { roll: hardship.roll })];
  if (isOmen(key)) return [omenLine()];
  if (Object.hasOwn(ENCOUNTER_POINTS, key)) return [i18n.localize("VARBORG.Travel.CombatTables")];
  if (key === "scenery") return [];
  return [i18n.localize(`VARBORG.Travel.Result.${key}.Text`)];
}

/** The read-aloud box for a Scenery result. */
function sceneryHtml(region, roll) {
  const i18n = game.i18n;
  const escape = foundry.utils.escapeHTML;
  const key = `VARBORG.Travel.Scenery.${region}.${roll}`;
  const text = i18n.has(key) ? i18n.localize(key) : i18n.localize("VARBORG.Travel.Result.scenery.Text");
  return `<p class="hint">${escape(i18n.format("VARBORG.Travel.SceneryRolled", { roll }))}</p>`
    + `<blockquote class="travel-read-aloud">${escape(text)}</blockquote>`;
}

async function postTravelCard({
  method, region, phase, roll, key, hardship, scenery, rolls, hazard, rerolled = [], omen = null
}) {
  const i18n = game.i18n;
  const escape = foundry.utils.escapeHTML;
  const trip = { phase, region };
  const title = i18n.format("VARBORG.Travel.CardTitle", { method: methodName(method), region: regionName(region) });
  const resultName = Object.hasOwn(ENCOUNTER_POINTS, key)
    ? i18n.format("VARBORG.Travel.EncounterName", {
      name: i18n.localize(`VARBORG.Travel.Result.${key}.Name`), points: ENCOUNTER_POINTS[key]
    })
    : i18n.localize(`VARBORG.Travel.Result.${key}.Name`);

  const speed = METHODS[method];
  const lines = [
    i18n.format("VARBORG.Travel.Spent", { phase: phaseName(phase), hexes: hexText(travelSpeed(speed, hazard)) }),
    weatherOn() ? weatherTravelLine(hazard, speed) : "",
    method === "gallop" ? i18n.localize("VARBORG.Travel.GallopUsed") : "",
    rerolled.length ? i18n.format("VARBORG.Travel.WeatherOffReroll", { rolls: rerolled.join(i18n.localize("VARBORG.Travel.And")) }) : "",
    hasBoon(trip)
      ? i18n.format("VARBORG.Travel.RolledBoon", { dice: diceText(roll), reason: boonReason(trip) })
      : i18n.format("VARBORG.Travel.Rolled", { dice: diceText(roll) })
  ];

  let html = `<div class="var-borg-card travel-card"><h3>${escape(title)}</h3>`
    + lines.filter(Boolean).map(line => `<p>${escape(line)}</p>`).join("")
    + `<p class="travel-result"><strong>${escape(resultName)}</strong></p>`
    + (omen
      ? omen.lines.map(line => `<p${line.cls ? ` class="${line.cls}"` : ""}>${escape(line.text)}</p>`).join("")
      : resultLines(key, hardship).map(line => `<p>${escape(line)}</p>`).join(""));
  if (scenery) html += sceneryHtml(region, scenery);
  if (omen?.end) {
    html += `<div class="misery-end"><p><strong>${i18n.localize("VARBORG.Misery.EndTitle")}</strong></p>`
      + `<p>${i18n.localize("VARBORG.Misery.EndText")}</p></div>`;
  }

  if (hardship) {
    const name = i18n.localize(`VARBORG.Travel.Hardship.${hardship.key}.Name`);
    const place = hardship.place ? ` (${i18n.localize(`VARBORG.Travel.Place.${hardship.place}`)})` : "";
    html += `<div class="travel-hardship">`
      + `<p class="hardship-name"><strong>${escape(name + place)}</strong></p>`
      + `<p>${escape(i18n.localize(`VARBORG.Travel.Hardship.${hardship.key}.Effect`))}</p>`
      + (misfits(hardship, region)
        ? `<p class="hint">${escape(i18n.format("VARBORG.Travel.Misfit", { region: regionName(region) }))}</p>` : "")
      + `<p class="hint">${i18n.localize("VARBORG.Travel.EachPC")}</p></div>`;
  }
  html += `</div>`;
  await ChatMessage.create({ content: html, rolls });
}
