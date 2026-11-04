/**
 * The weather in Foundry (step 38; Subsystem: Weather; GAPS 155, 166).
 *
 * Today's weather is a world setting: the hex the token stands on and,
 * on a hazard hex, the hazard event. A new world starts on Perfect day.
 * At the start of each day (the New day button, a Long Rest, Downtime:
 * module/days.mjs) the Dark Master's client rolls 2d6, moves the token one
 * hex and posts a weather card; on a Minor or Major hazard it rolls the
 * d10 and the card shows the event. The event lasts until the next day
 * begins, when the next move replaces it.
 *
 * The Calendar panel shows today's weather and a small hex flower to
 * everyone. The Dark Master's Set weather button picks a hex (and a hazard
 * event, or rolls one) by hand.
 *
 * The maths lives in module/rules/weather.mjs.
 */

import {
  HEXES, HAZARDS, MOVE_DICE, HAZARD_DIE, hexById, hexPosition, hazardTableOf, hazardFor,
  moveWeather, weatherAfterMove, cleanWeather, START_HEX
} from "./rules/weather.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";
const SETTING = "weather";

/** The weather setting. Changing it redraws the Calendar panel. */
export function registerWeather(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: { hex: START_HEX, hazard: null },
    onChange
  });
}

/** Today's weather: {hex, hazard}. */
export function currentWeather() {
  return cleanWeather(game.settings.get(SYSTEM, SETTING));
}

async function saveWeather(hex, hazard) {
  await game.settings.set(SYSTEM, SETTING, cleanWeather({ hex, hazard }));
}

/* -------------------------------------------- */
/*  Names                                        */
/* -------------------------------------------- */

/** "Clear sky": the weather of a hex. */
function hexName(id) {
  return game.i18n.localize(`VARBORG.Weather.Kind.${hexById(id).kind}`);
}

function hazardName(hazard) {
  return game.i18n.localize(`VARBORG.Weather.Hazard.${hazard}.Name`);
}

function hazardEffect(hazard) {
  return game.i18n.localize(`VARBORG.Weather.Hazard.${hazard}.Effect`);
}

/** "Minor hazard" or "Major hazard". */
function tableName(table) {
  return game.i18n.localize(`VARBORG.Weather.Kind.${table}Hazard`);
}

/* -------------------------------------------- */
/*  The hex flower, drawn                        */
/* -------------------------------------------- */

/**
 * The hex flower as HTML.
 * @param {string} current  The hex the token is on.
 * @param {object} [options]
 * @param {boolean} [options.pick]    Radio buttons to pick a hex (the Set weather dialog).
 * @param {boolean} [options.labels]  Write each hex's weather in it.
 */
export function flowerHTML(current, { pick = false, labels = false } = {}) {
  const hexes = HEXES.map(hex => {
    const { x, y } = hexPosition(hex);
    const name = foundry.utils.escapeHTML(hexName(hex.id));
    const here = hex.id === current;
    const classes = ["hex", `kind-${hex.kind}`, here ? "current" : ""].filter(Boolean).join(" ");
    const style = `--x:${x};--y:${y}`;
    const text = labels ? `<span class="hex-name">${name}</span>` : "";
    const token = here && !pick ? `<span class="hex-token" aria-hidden="true"></span>` : "";
    if (pick) {
      return `<label class="${classes}" style="${style}" data-tooltip="${name}">`
        + `<input type="radio" name="hex" value="${hex.id}" ${here ? "checked" : ""} aria-label="${name}">${text}</label>`;
    }
    return `<span class="${classes}" style="${style}" data-tooltip="${name}">${text}${token}</span>`;
  }).join("");
  return `<div class="var-borg-hex-flower${pick ? " pick" : ""}">${hexes}</div>`;
}

/** The weather part of the Calendar panel. */
export function weatherContext() {
  const { hex, hazard } = currentWeather();
  return {
    name: hexName(hex),
    kind: hexById(hex).kind,
    hazard: hazard ? hazardName(hazard) : "",
    hazardEffect: hazard ? hazardEffect(hazard) : "",
    flower: flowerHTML(hex)
  };
}

/* -------------------------------------------- */
/*  At the start of each day                     */
/* -------------------------------------------- */

/**
 * Dark Master only: roll 2d6, move the weather one hex, roll a hazard's
 * d10 if it lands on one, save and post the weather card.
 * Called by module/days.mjs for each new day.
 */
export async function weatherForNewDay() {
  if (!game.user.isGM) return;
  const i18n = game.i18n;
  const today = currentWeather();
  const roll = new Roll(MOVE_DICE);
  await roll.evaluate();
  const move = moveWeather(today.hex, roll.total);
  const next = weatherAfterMove(today, move);

  const lines = [
    i18n.format("VARBORG.Weather.Rolled", {
      total: roll.total,
      direction: i18n.localize(`VARBORG.Weather.Direction.${move.direction}`)
    })
  ];
  if (move.walled) lines.push(i18n.format("VARBORG.Weather.Walled", { name: hexName(move.to) }));
  else if (move.wrapped) lines.push(i18n.format("VARBORG.Weather.Wrapped", { to: hexName(move.to) }));
  else lines.push(i18n.format("VARBORG.Weather.Moves", { from: hexName(move.from), to: hexName(move.to) }));

  const rolls = [roll];
  let hazard = next.hazard;
  let hazardLine = "";
  if (next.rollHazard) {
    const d10 = new Roll(HAZARD_DIE);
    await d10.evaluate();
    rolls.push(d10);
    hazard = hazardFor(next.table, d10.total);
    hazardLine = i18n.format("VARBORG.Weather.HazardRolled", { table: tableName(next.table), roll: d10.total });
  } else if (hazard) {
    hazardLine = i18n.format("VARBORG.Weather.HazardRepeats", { table: tableName(next.table) });
  }

  await saveWeather(next.hex, hazard);
  await postWeatherCard({ hex: next.hex, hazard, lines, hazardLine, rolls });
}

/* -------------------------------------------- */
/*  Set by hand                                  */
/* -------------------------------------------- */

/** The options of a hazard event select: Roll the d10, then 1 to 10. */
function eventOptions(table, chosen) {
  const roll = `<option value="">${game.i18n.localize("VARBORG.Weather.RollEvent")}</option>`;
  return roll + HAZARDS[table].map((hazard, index) =>
    `<option value="${hazard}" ${hazard === chosen ? "selected" : ""}>${index + 1}. ${foundry.utils.escapeHTML(hazardName(hazard))}</option>`
  ).join("");
}

/**
 * Dark Master only: pick today's hex on the flower and, for a hazard, its
 * event (or roll it). Posts a weather card.
 * @returns {Promise<boolean>}  Whether the weather was set.
 */
export async function setWeatherByHand() {
  if (!game.user.isGM) return false;
  const i18n = game.i18n;
  const today = currentWeather();
  const content = `<p class="hint">${i18n.localize("VARBORG.Weather.SetHint")}</p>`
    + flowerHTML(today.hex, { pick: true, labels: true })
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Weather.MinorEvent")}</label>`
    + `<select name="minor">${eventOptions("minor", today.hazard)}</select></div>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Weather.MajorEvent")}</label>`
    + `<select name="major">${eventOptions("major", today.hazard)}</select></div>`
    + `<p class="hint">${i18n.localize("VARBORG.Weather.EventHint")}</p>`;
  const data = await DialogV2.input({
    window: { title: "VARBORG.Weather.SetTitle", icon: "fa-solid fa-cloud-sun-rain" },
    position: { width: 360 },
    classes: ["var-borg-weather-dialog"],
    content,
    ok: { label: "VARBORG.Weather.Set", icon: "fa-solid fa-check" },
    rejectClose: false
  });
  if (!data || !hexById(data.hex)) return false;

  const hex = data.hex;
  const table = hazardTableOf(hex);
  const rolls = [];
  let hazard = null;
  let hazardLine = "";
  if (table) {
    hazard = data[table] || null;
    if (!hazard) {
      const d10 = new Roll(HAZARD_DIE);
      await d10.evaluate();
      rolls.push(d10);
      hazard = hazardFor(table, d10.total);
      hazardLine = i18n.format("VARBORG.Weather.HazardRolled", { table: tableName(table), roll: d10.total });
    } else {
      hazardLine = tableName(table);
    }
  }
  await saveWeather(hex, hazard);
  await postWeatherCard({
    hex,
    hazard,
    lines: [i18n.format("VARBORG.Weather.SetCard", { name: hexName(hex) })],
    hazardLine,
    rolls
  });
  return true;
}

/* -------------------------------------------- */
/*  The card                                     */
/* -------------------------------------------- */

async function postWeatherCard({ hex, hazard, lines, hazardLine, rolls }) {
  const i18n = game.i18n;
  const escape = foundry.utils.escapeHTML;
  let html = `<div class="var-borg-card weather-card"><h3>${i18n.localize("VARBORG.Weather.CardTitle")}: ${escape(hexName(hex))}</h3>`
    + lines.map(line => `<p>${escape(line)}</p>`).join("");
  if (hazard) {
    html += `<div class="weather-hazard">`
      + (hazardLine ? `<p class="hazard-table">${escape(hazardLine)}</p>` : "")
      + `<p class="hazard-name"><strong>${escape(hazardName(hazard))}</strong></p>`
      + `<p>${escape(hazardEffect(hazard))}</p>`
      + `<p class="hint">${i18n.localize("VARBORG.Weather.UntilNextDay")}</p></div>`;
  }
  html += `</div>`;
  await ChatMessage.create({ content: html, rolls });
}
