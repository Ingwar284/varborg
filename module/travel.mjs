/**
 * Overland travel in Foundry (step 40; Subsystem: Overland Travel;
 * GAPS 159, 160).
 *
 * The Dark Master's Travel button on the Calendar panel asks for the method
 * (Trek, Gallop, Cruise) and the region (Heartlands, Hinterlands). The
 * party spends the rest of the current phase on the road: the clock moves
 * on to the next noon, dusk or dawn (at dawn the New day dialog opens
 * first; closing it cancels the travel). At the end of the phase the
 * encounter d20 is rolled, with Boon if the phase was the night or the
 * party is in the Hinterlands, and a travel card is posted:
 * - 1 to 2: the weather shifts (the 2d6 move of module/weather.mjs, with
 *   its own weather card).
 * - Travel hardship: its d20 table is rolled and the hardship shown, with
 *   its place tag and, in the Heartlands, a note for misfits.
 * - Omen: the omen of the current Misery (basic rules 1.5).
 * - Encounters are named with their threat points; the Dark Master rolls
 *   the Combat Tables.
 *
 * An Energy void halves the day's travel and an Energy font adds half
 * again (step 41): the card shows the speed for today's weather, as it was
 * when the party set out.
 *
 * The maths lives in module/rules/travel.mjs.
 */

import {
  METHODS, REGIONS, ENCOUNTER_POINTS, HARDSHIP_DIE, hasBoon, encounterFormula, encounterFor, isOmen,
  hardshipFor, misfits, cleanMethod, cleanRegion
} from "./rules/travel.mjs";
import { phaseAt } from "./rules/calendar.mjs";
import { nextPhase } from "./calendar.mjs";
import { shiftWeather } from "./weather.mjs";
import { miseryContext } from "./misery.mjs";
import { currentWeather } from "./weather.mjs";
import { travelFactorFor, travelSpeed } from "./rules/weather-effects.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const { DialogV2 } = foundry.applications.api;

/** The last choices made, offered again next time (this session only). */
let last = { method: "trek", region: "heartlands" };

/* -------------------------------------------- */
/*  The dialog                                   */
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

/** The line about today's weather and travel, or "" if it changes nothing. */
function weatherTravelLine(hazard, speed = null) {
  if (travelFactorFor(hazard) === 1) return "";
  const i18n = game.i18n;
  const name = i18n.localize(`VARBORG.Weather.Hazard.${hazard}.Name`);
  const key = travelFactorFor(hazard) < 1 ? "VARBORG.Travel.WeatherSlower" : "VARBORG.Travel.WeatherFaster";
  if (speed === null) return i18n.format(key, { hazard: name });
  return i18n.format(`${key}Card`, {
    hazard: name, speed: speedText(travelSpeed(speed, hazard)), usual: speedText(speed)
  });
}

/** Ask for the method and region. Returns null if closed. */
async function askTravel(phase, hazard) {
  const i18n = game.i18n;
  const escape = foundry.utils.escapeHTML;
  const methods = Object.entries(METHODS).map(([method, speed]) =>
    `<label class="travel-method"><input type="radio" name="method" value="${method}" ${method === last.method ? "checked" : ""}> `
    + `${escape(i18n.format("VARBORG.Travel.MethodOption", { name: methodName(method), speed }))}</label>`
  ).join("");
  const regions = REGIONS.map(region =>
    `<option value="${region}" ${region === last.region ? "selected" : ""}>${escape(regionName(region))}</option>`
  ).join("");
  const content = `<p>${escape(i18n.format("VARBORG.Travel.SpendsPhase", { phase: phaseName(phase) }))}</p>`
    + `<fieldset><legend>${i18n.localize("VARBORG.Travel.MethodLabel")}</legend>${methods}</fieldset>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Travel.RegionLabel")}</label>`
    + `<select name="region">${regions}</select></div>`
    + `<p class="hint">${i18n.localize("VARBORG.Travel.BoonHint")}</p>`
    + (weatherTravelLine(hazard) ? `<p class="hint">${escape(weatherTravelLine(hazard))}</p>` : "");
  return DialogV2.input({
    classes: [...VB_DIALOG_CLASSES, "var-borg-travel-dialog"],
    window: { title: "VARBORG.Travel.Title", icon: "fa-solid fa-route" },
    position: { width: 380 },
    content,
    ok: { label: "VARBORG.Travel.Go", icon: "fa-solid fa-route" },
    rejectClose: false
  });
}

/* -------------------------------------------- */
/*  Travelling                                   */
/* -------------------------------------------- */

/**
 * Dark Master only: travel for the rest of the current phase, then roll
 * the encounter table and post the travel card.
 * @returns {Promise<boolean>}  Whether the party travelled.
 */
export async function travel() {
  if (!game.user.isGM) return false;
  const phase = phaseAt(game.time.worldTime);
  // The weather the party sets out in: a new day at the end of the phase
  // does not change how far they went (step 41).
  const { hazard } = currentWeather();
  const data = await askTravel(phase, hazard);
  if (!data) return false;
  const method = cleanMethod(data.method);
  const region = cleanRegion(data.region);
  last = { method, region };

  // Spend the phase. At dawn the New day dialog opens; closing it cancels.
  if (!(await nextPhase())) {
    ui.notifications.info("VARBORG.Travel.Cancelled", { localize: true });
    return false;
  }

  const trip = { phase, region };
  const roll = new Roll(encounterFormula(trip));
  await roll.evaluate();
  const key = encounterFor(roll.total);
  const rolls = [roll];

  let hardship = null;
  if (key === "hardship") {
    const d20 = new Roll(HARDSHIP_DIE);
    await d20.evaluate();
    rolls.push(d20);
    hardship = { roll: d20.total, ...hardshipFor(d20.total) };
  }

  await postTravelCard({ method, region, phase, roll, key, hardship, rolls, hazard });
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
  if (region === "hinterlands") reasons.push(game.i18n.localize("VARBORG.Travel.BoonHinterlands"));
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
  return [i18n.localize(`VARBORG.Travel.Result.${key}.Text`)];
}

async function postTravelCard({ method, region, phase, roll, key, hardship, rolls, hazard }) {
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
    i18n.format("VARBORG.Travel.Spent", { phase: phaseName(phase), speed: speedText(travelSpeed(speed, hazard)) }),
    weatherTravelLine(hazard, speed),
    hasBoon(trip)
      ? i18n.format("VARBORG.Travel.RolledBoon", { dice: diceText(roll), reason: boonReason(trip) })
      : i18n.format("VARBORG.Travel.Rolled", { dice: diceText(roll) })
  ];

  let html = `<div class="var-borg-card travel-card"><h3>${escape(title)}</h3>`
    + lines.filter(Boolean).map(line => `<p>${escape(line)}</p>`).join("")
    + `<p class="travel-result"><strong>${escape(resultName)}</strong></p>`
    + resultLines(key, hardship).map(line => `<p>${escape(line)}</p>`).join("");

  if (hardship) {
    const name = i18n.localize(`VARBORG.Travel.Hardship.${hardship.key}.Name`);
    const place = hardship.place ? ` (${i18n.localize(`VARBORG.Travel.Place.${hardship.place}`)})` : "";
    html += `<div class="travel-hardship">`
      + `<p class="hardship-name"><strong>${escape(name + place)}</strong></p>`
      + `<p>${escape(i18n.localize(`VARBORG.Travel.Hardship.${hardship.key}.Effect`))}</p>`
      + (misfits(hardship, region) ? `<p class="hint">${i18n.localize("VARBORG.Travel.Misfit")}</p>` : "")
      + `<p class="hint">${i18n.localize("VARBORG.Travel.EachPC")}</p></div>`;
  }
  html += `</div>`;
  await ChatMessage.create({ content: html, rolls });
}
