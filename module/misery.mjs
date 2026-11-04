/**
 * The Miseries in Foundry (step 39; rules 1.5 The dying of the light;
 * GAPS 156).
 *
 * The Misery is a world setting: the level (none, I to VI, VII), the omen
 * of the current Misery, the group's light die, and whether no sun rose
 * today. At the start of each day (module/days.mjs) the Dark Master's
 * client rolls the light die; on a 1 the next Misery comes and its d6 omen
 * is rolled. Then, once a Misery has come, its sunrise die: on a 1 no sun
 * rises. One card shows it all. At VII the end card is posted and nothing
 * is rolled any more.
 *
 * The Calendar panel shows the Misery to everyone. The Dark Master's Set
 * Misery button picks the level, the omen (or rolls it), the light die,
 * and whether the sun rose.
 *
 * The maths lives in module/rules/misery.mjs.
 */

import {
  LIGHT_DICE, OMEN_DIE, END_LEVEL, numeral, sunriseDie, isEnd, isOne, cleanMisery, afterLightDie
} from "./rules/misery.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";
const SETTING = "misery";

/** The Misery setting. Changing it redraws the Calendar panel. */
export function registerMisery(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: cleanMisery(null),
    onChange
  });
}

/** The Misery now: {level, omen, light, sunless}. */
export function currentMisery() {
  return cleanMisery(game.settings.get(SYSTEM, SETTING));
}

async function saveMisery(state) {
  await game.settings.set(SYSTEM, SETTING, cleanMisery(state));
}

/* -------------------------------------------- */
/*  Names                                        */
/* -------------------------------------------- */

/** "Misery II" or "No Misery yet". */
function miseryName(level) {
  return level ? game.i18n.format("VARBORG.Misery.Name", { numeral: numeral(level) })
    : game.i18n.localize("VARBORG.Misery.None");
}

/** "II:3 A thousand mirrors shatter…" */
function omenText(level, omen) {
  return game.i18n.format("VARBORG.Misery.OmenLine", {
    numeral: numeral(level),
    omen,
    text: game.i18n.localize(`VARBORG.Misery.Omen.${numeral(level)}${omen}`)
  });
}

/** "Years of pain (d100)" */
function lightName(key) {
  return game.i18n.format("VARBORG.Misery.LightOption", {
    name: game.i18n.localize(`VARBORG.Misery.Light.${key}`),
    die: LIGHT_DICE[key].replace(/^1/, "")
  });
}

/** The Misery part of the Calendar panel. */
export function miseryContext() {
  const { level, omen, light, sunless } = currentMisery();
  return {
    level,
    name: miseryName(level),
    omen: level && omen ? omenText(level, omen) : "",
    end: isEnd(level),
    sunless,
    light: lightName(light)
  };
}

/* -------------------------------------------- */
/*  At the start of each day                     */
/* -------------------------------------------- */

async function rollDie(formula) {
  const roll = new Roll(formula);
  await roll.evaluate();
  return roll;
}

/**
 * Dark Master only: roll the light die, the omen if a Misery comes, and
 * the sunrise die; save and post the card. Called by module/days.mjs for
 * each new day.
 */
export async function miseryForNewDay() {
  if (!game.user.isGM) return;
  const i18n = game.i18n;
  const before = currentMisery();
  if (isEnd(before.level)) return;

  const lines = [];
  const rolls = [];
  const lightRoll = await rollDie(LIGHT_DICE[before.light]);
  rolls.push(lightRoll);
  const step = afterLightDie(before, lightRoll.total);
  lines.push(i18n.format("VARBORG.Misery.LightRolled", {
    die: LIGHT_DICE[before.light].replace(/^1/, ""), result: lightRoll.total
  }));

  let omen = before.omen;
  if (step.comes) {
    lines.push(i18n.format("VARBORG.Misery.Comes", { name: miseryName(step.level) }));
    omen = null;
    if (step.rollOmen) {
      const omenRoll = await rollDie(OMEN_DIE);
      rolls.push(omenRoll);
      omen = omenRoll.total;
    }
  }

  let sunless = false;
  let sunLine = "";
  const sunDie = sunriseDie(step.level);
  if (sunDie) {
    const sunRoll = await rollDie(sunDie);
    rolls.push(sunRoll);
    sunless = isOne(sunRoll.total);
    sunLine = i18n.format(sunless ? "VARBORG.Misery.NoSun" : "VARBORG.Misery.SunRises", {
      die: sunDie.replace(/^1/, ""), result: sunRoll.total
    });
  }

  await saveMisery({ level: step.level, omen, light: before.light, sunless });
  await postMiseryCard({
    level: step.level,
    omen: step.comes ? omen : null,
    lines,
    sunLine,
    sunless,
    rolls
  });
}

/* -------------------------------------------- */
/*  Set by hand                                  */
/* -------------------------------------------- */

function options(entries, chosen) {
  return entries.map(([value, label]) =>
    `<option value="${value}" ${String(value) === String(chosen) ? "selected" : ""}>${foundry.utils.escapeHTML(label)}</option>`
  ).join("");
}

/**
 * Dark Master only: set the Misery, its omen (or roll it), the light die
 * and whether the sun rose today. No omen is rolled unless asked for
 * (GAPS 156). Setting VII posts the end card.
 * @returns {Promise<boolean>}  Whether the Misery was set.
 */
export async function setMiseryByHand() {
  if (!game.user.isGM) return false;
  const i18n = game.i18n;
  const now = currentMisery();
  const levels = [0, 1, 2, 3, 4, 5, 6, END_LEVEL].map(level => [level, miseryName(level)]);
  const omens = [
    ["", i18n.localize("VARBORG.Misery.NoOmen")],
    ["roll", i18n.localize("VARBORG.Misery.RollOmen")],
    ...[1, 2, 3, 4, 5, 6].map(n => [n, String(n)])
  ];
  const lights = Object.keys(LIGHT_DICE).map(key => [key, lightName(key)]);
  const content = `<p class="hint">${i18n.localize("VARBORG.Misery.SetHint")}</p>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Misery.Label")}</label>`
    + `<select name="level">${options(levels, now.level)}</select></div>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Misery.OmenLabel")}</label>`
    + `<select name="omen">${options(omens, now.omen ?? "")}</select></div>`
    + `<p class="hint">${i18n.localize("VARBORG.Misery.OmenHint")}</p>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Misery.LightLabel")}</label>`
    + `<select name="light">${options(lights, now.light)}</select></div>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Misery.SunlessLabel")}</label>`
    + `<input type="checkbox" name="sunless" ${now.sunless ? "checked" : ""}></div>`;
  const data = await DialogV2.input({
    window: { title: "VARBORG.Misery.SetTitle", icon: "fa-solid fa-skull" },
    position: { width: 380 },
    content,
    ok: { label: "VARBORG.Misery.Set", icon: "fa-solid fa-check" },
    rejectClose: false
  });
  if (!data) return false;

  const level = Number(data.level);
  const rolls = [];
  let omen = null;
  if (level >= 1 && level <= 6) {
    if (data.omen === "roll") {
      const omenRoll = await rollDie(OMEN_DIE);
      rolls.push(omenRoll);
      omen = omenRoll.total;
    } else if (data.omen) {
      omen = Number(data.omen);
    }
  }
  const state = cleanMisery({ level, omen, light: data.light, sunless: !!data.sunless });
  await saveMisery(state);
  await postMiseryCard({
    level: state.level,
    omen: state.omen,
    lines: [
      i18n.format("VARBORG.Misery.SetCard", { name: miseryName(state.level) }),
      i18n.format("VARBORG.Misery.LightIs", { light: lightName(state.light) })
    ],
    sunLine: state.sunless ? i18n.localize("VARBORG.Misery.NoSunToday") : "",
    sunless: state.sunless,
    rolls
  });
  return true;
}

/* -------------------------------------------- */
/*  The card                                     */
/* -------------------------------------------- */

async function postMiseryCard({ level, omen, lines, sunLine, sunless, rolls }) {
  const i18n = game.i18n;
  const escape = foundry.utils.escapeHTML;
  let html = `<div class="var-borg-card misery-card${isEnd(level) ? " end" : ""}">`
    + `<h3>${i18n.localize("VARBORG.Misery.CardTitle")}: ${escape(miseryName(level))}</h3>`
    + lines.map(line => `<p>${escape(line)}</p>`).join("");
  if (omen && level >= 1 && level <= 6) {
    html += `<p class="misery-omen"><strong>${escape(omenText(level, omen))}</strong></p>`;
  }
  if (sunLine) html += `<p class="misery-sun${sunless ? " sunless" : ""}">${escape(sunLine)}</p>`;
  if (isEnd(level)) {
    html += `<div class="misery-end"><p><strong>${i18n.localize("VARBORG.Misery.EndTitle")}</strong></p>`
      + `<p>${i18n.localize("VARBORG.Misery.EndText")}</p></div>`;
  }
  html += `</div>`;
  await ChatMessage.create({ content: html, rolls });
}
