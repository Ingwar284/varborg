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
 * The Misery panel shows the Misery to everyone. The Dark Master's Set
 * Misery button picks the level, the omen (or rolls it), the light die,
 * and whether the sun rose.
 *
 * Omens of Misery (GAPS 307): with the world setting "Dying of the light"
 * on Omens of Misery, the light die is not rolled. Each Misery that has
 * come keeps a track of its six omens, saved in its own setting (so the
 * light-die Misery is kept for switching back). The Omen results of the
 * travel table call omenForTravel: it brings the next Misery when it is
 * due, or moves a live Misery on (random: a roll; nearest: the Dark Master
 * picks). At dawn only the newest Misery's sunrise die is rolled. Set
 * Misery sets every Misery's result and omens.
 *
 * The maths lives in module/rules/misery.mjs.
 */

import {
  LIGHT_DICE, OMEN_DIE, END_LEVEL, numeral, sunriseDie, isEnd, isOne, cleanMisery, afterLightDie,
  OMENS_PER_RESULT, cleanTrack, newestLevel, isDue, omenOutcome, bringNext, advance,
  miseryFromTrack, cleanPerMisery
} from "./rules/misery.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";
import { omensMode, omensPerMisery } from "./settings.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";
const SETTING = "misery";
const TRACK_SETTING = "omenTrack";

/** The Misery settings. Changing either redraws the Misery panel. */
export function registerMisery(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: cleanMisery(null),
    onChange
  });
  game.settings.register(SYSTEM, TRACK_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: { ...cleanTrack(null), sunless: false },
    onChange
  });
}

/** The Omens of Misery track now, with whether no sun rose today. */
function currentTrack() {
  const stored = game.settings.get(SYSTEM, TRACK_SETTING);
  const track = cleanTrack(stored);
  const level = newestLevel(track);
  return { ...track, sunless: level >= 1 && level <= 6 && stored?.sunless === true };
}

async function saveTrack(track, sunless = false) {
  await game.settings.set(SYSTEM, TRACK_SETTING, { ...cleanTrack(track), sunless: !!sunless });
}

/**
 * The Misery now: {level, omen, light, sunless}. With Omens of Misery,
 * the newest Misery and its d6 result.
 */
export function currentMisery() {
  const base = cleanMisery(game.settings.get(SYSTEM, SETTING));
  if (!omensMode()) return base;
  const track = currentTrack();
  return { ...miseryFromTrack(track), light: base.light, sunless: track.sunless };
}

async function saveMisery(state) {
  await game.settings.set(SYSTEM, SETTING, cleanMisery(state));
}

/* -------------------------------------------- */
/*  Names                                        */
/* -------------------------------------------- */

/** "Misery II" or "No Misery yet". */
export function miseryName(level) {
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

/** "II:3 Shattered mirrors" */
function resultTitle(level, result) {
  return game.i18n.format("VARBORG.Misery.Omens.ResultTitle", {
    numeral: numeral(level),
    result,
    name: game.i18n.localize(`VARBORG.Misery.ResultName.${numeral(level)}${result}`)
  });
}

/** The text of one omen of a Misery's result. */
function omenStepText(level, result, step) {
  return game.i18n.localize(`VARBORG.Misery.OmenStep.${numeral(level)}${result}.${step}`);
}

/**
 * Where the omens stand: "Misery II is due…", "Misery II comes after 2
 * more omens of Misery I.", or "" once the world has ended.
 */
function nextLine(track, perMisery) {
  const i18n = game.i18n;
  if (track.ended) return "";
  if (!track.miseries.length) return i18n.localize("VARBORG.Misery.Omens.NoneYet");
  const level = track.miseries.length;
  if (isDue(track, perMisery)) {
    return level >= 6 ? i18n.localize("VARBORG.Misery.Omens.EndDue")
      : i18n.format("VARBORG.Misery.Omens.Due", { name: miseryName(level + 1) });
  }
  const count = cleanPerMisery(perMisery) - track.miseries[level - 1].omens;
  const next = level >= 6 ? numeral(END_LEVEL) : miseryName(level + 1);
  return i18n.format(count === 1 ? "VARBORG.Misery.Omens.NextAfterOne" : "VARBORG.Misery.Omens.NextAfterMany", {
    name: next, count, current: miseryName(level)
  });
}

/** The Misery panel. */
export function miseryContext() {
  const { level, omen, light, sunless } = currentMisery();
  const context = {
    level,
    name: miseryName(level),
    omen: level && omen ? omenText(level, omen) : "",
    end: isEnd(level),
    sunless,
    light: lightName(light),
    omensMode: omensMode()
  };
  if (!context.omensMode) return context;
  const track = currentTrack();
  const perMisery = omensPerMisery();
  context.omen = "";
  context.tracks = track.miseries.map((misery, index) => ({
    title: resultTitle(index + 1, misery.result),
    count: game.i18n.format("VARBORG.Misery.Omens.Track", { step: misery.omens }),
    done: misery.omens >= OMENS_PER_RESULT
  }));
  context.next = nextLine(track, perMisery);
  context.mode = game.i18n.format("VARBORG.Misery.Omens.Mode", { count: cleanPerMisery(perMisery) });
  return context;
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
  if (omensMode()) return omensForNewDay();
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

/**
 * Omens of Misery at dawn (GAPS 307): no light die; the newest Misery's
 * sunrise die only. Nothing is rolled before Misery I or after VII.
 */
async function omensForNewDay() {
  const track = currentTrack();
  const level = newestLevel(track);
  const sunDie = sunriseDie(level);
  if (!sunDie) return;
  const sunRoll = await rollDie(sunDie);
  const sunless = isOne(sunRoll.total);
  await saveTrack(track, sunless);
  await postMiseryCard({
    level,
    omen: null,
    lines: [],
    sunLine: game.i18n.format(sunless ? "VARBORG.Misery.NoSun" : "VARBORG.Misery.SunRises", {
      die: sunDie.replace(/^1/, ""), result: sunRoll.total
    }),
    sunless,
    rolls: [sunRoll]
  });
}

/* -------------------------------------------- */
/*  An omen on the road (Omens of Misery)        */
/* -------------------------------------------- */

/** Ask the Dark Master which live Misery is nearest. Closing picks the newest. */
async function pickNearest(choices, track) {
  const i18n = game.i18n;
  const newest = choices.at(-1);
  const entries = choices.map(level => [level, `${resultTitle(level, track.miseries[level - 1].result)} (${
    i18n.format("VARBORG.Misery.Omens.Track", { step: track.miseries[level - 1].omens })})`]);
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: "VARBORG.Misery.Omens.PickTitle", icon: "fa-solid fa-skull" },
    position: { width: 380 },
    content: `<p class="hint">${i18n.localize("VARBORG.Misery.Omens.PickHint")}</p>`
      + `<div class="form-group"><label>${i18n.localize("VARBORG.Misery.Omens.PickLabel")}</label>`
      + `<select name="level">${options(entries, newest)}</select></div>`,
    ok: { label: "VARBORG.Travel.Go", icon: "fa-solid fa-check" },
    rejectClose: false
  });
  const level = Number(data?.level);
  return choices.includes(level) ? level : newest;
}

/**
 * Dark Master only: an Omen result on the travel table, with Omens of
 * Misery in use (GAPS 307). Brings the next Misery if it is due, or moves
 * a live Misery on to its next omen, and saves the track.
 * @param {"random"|"nearest"} kind  Which Omen result was rolled.
 * @returns {Promise<{lines: Array<{text: string, cls?: string}>, rolls: Roll[], end: boolean}>}
 */
export async function omenForTravel(kind) {
  const i18n = game.i18n;
  const track = currentTrack();
  const perMisery = omensPerMisery();
  const outcome = omenOutcome(track, perMisery);
  const lines = [];
  const rolls = [];

  if (outcome.kind === "none") {
    return { lines: [{ text: i18n.localize("VARBORG.Misery.Omens.Over") }], rolls, end: false };
  }

  if (outcome.kind === "ends") {
    await saveTrack(bringNext(track));
    lines.push({ text: i18n.format("VARBORG.Misery.Omens.Comes", { name: miseryName(END_LEVEL) }), cls: "misery-omen" });
    lines.push({ text: i18n.localize("VARBORG.Misery.Omens.EndDay") });
    return { lines, rolls, end: true };
  }

  let level;
  let after;
  if (outcome.kind === "comes") {
    const resultRoll = await rollDie(OMEN_DIE);
    rolls.push(resultRoll);
    level = outcome.level;
    after = bringNext(track, resultRoll.total);
    lines.push({ text: i18n.format("VARBORG.Misery.Omens.Comes", { name: miseryName(level) }) });
    lines.push({ text: i18n.format("VARBORG.Misery.Omens.ResultRolled", { result: resultRoll.total }) });
  } else {
    const { choices } = outcome;
    if (choices.length === 1) {
      level = choices[0];
    } else if (kind === "nearest") {
      level = await pickNearest(choices, track);
      lines.push({ text: i18n.format("VARBORG.Misery.Omens.Nearest", { name: miseryName(level) }) });
    } else {
      const pick = await rollDie(`1d${choices.length}`);
      rolls.push(pick);
      level = choices[pick.total - 1];
      lines.push({ text: i18n.format("VARBORG.Misery.Omens.Random", { die: choices.length, result: miseryName(level) }) });
    }
    after = advance(track, level);
  }

  const { result, omens } = after.miseries[level - 1];
  lines.push({
    text: `${resultTitle(level, result)} · ${i18n.format("VARBORG.Misery.Omens.Step", { step: omens })}`,
    cls: "misery-omen"
  });
  lines.push({ text: omenStepText(level, result, omens) });
  const next = isDue(after, perMisery) ? nextLine(after, perMisery) : "";
  if (next) lines.push({ text: next, cls: "hint" });
  // Today's sky stays as it was; a new Misery's sunrise die is first rolled at the next dawn.
  await saveTrack(after, track.sunless);
  return { lines, rolls, end: false };
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
  if (omensMode()) return setOmensByHand();
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
    classes: VB_DIALOG_CLASSES,
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

/**
 * Dark Master only, Omens of Misery: set each Misery's d6 result (or roll
 * it) and how many of its omens have happened, whether VII has come, and
 * whether the sun rose today. Miseries come in order, so the list stops at
 * the first one set to None.
 * @returns {Promise<boolean>}  Whether the Miseries were set.
 */
async function setOmensByHand() {
  const i18n = game.i18n;
  const now = currentTrack();
  const steps = [0, 1, 2, 3, 4, 5, 6].map(n => [n, String(n)]);
  const rows = [1, 2, 3, 4, 5, 6].map(level => {
    const misery = now.miseries[level - 1];
    const levelResults = [
      ["", i18n.localize("VARBORG.Misery.Omens.NoResult")],
      ["roll", i18n.localize("VARBORG.Misery.RollOmen")],
      ...[1, 2, 3, 4, 5, 6].map(n => [n, resultTitle(level, n)])
    ];
    return `<tr><th>${foundry.utils.escapeHTML(miseryName(level))}</th>`
      + `<td><select name="result${level}">${options(levelResults, misery?.result ?? "")}</select></td>`
      + `<td><select name="omens${level}">${options(steps, misery?.omens ?? 1)}</select></td></tr>`;
  }).join("");
  const content = `<p class="hint">${i18n.localize("VARBORG.Misery.Omens.SetHint")}</p>`
    + `<table class="misery-set-table"><thead><tr><th></th>`
    + `<th>${i18n.localize("VARBORG.Misery.Omens.ResultLabel")}</th>`
    + `<th>${i18n.localize("VARBORG.Misery.Omens.OmensLabel")}</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Misery.Omens.EndedLabel")}</label>`
    + `<input type="checkbox" name="ended" ${now.ended ? "checked" : ""}></div>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Misery.SunlessLabel")}</label>`
    + `<input type="checkbox" name="sunless" ${now.sunless ? "checked" : ""}></div>`;
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: "VARBORG.Misery.SetTitle", icon: "fa-solid fa-skull" },
    position: { width: 520 },
    content,
    ok: { label: "VARBORG.Misery.Set", icon: "fa-solid fa-check" },
    rejectClose: false
  });
  if (!data) return false;

  const rolls = [];
  const miseries = [];
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const chosen = data[`result${level}`];
    if (!chosen) break;
    let result = Number(chosen);
    if (chosen === "roll") {
      const resultRoll = await rollDie(OMEN_DIE);
      rolls.push(resultRoll);
      result = resultRoll.total;
    }
    miseries.push({ result, omens: Number(data[`omens${level}`]) });
  }
  const track = cleanTrack({ miseries, ended: !!data.ended });
  await saveTrack(track, !!data.sunless);
  const saved = currentTrack();
  const level = newestLevel(saved);
  await postMiseryCard({
    level,
    omen: null,
    lines: [
      i18n.format("VARBORG.Misery.SetCard", { name: miseryName(level) }),
      ...saved.miseries.map((misery, index) => `${resultTitle(index + 1, misery.result)} · ${
        i18n.format("VARBORG.Misery.Omens.Track", { step: misery.omens })}`),
      nextLine(saved, omensPerMisery())
    ].filter(Boolean),
    sunLine: saved.sunless ? i18n.localize("VARBORG.Misery.NoSunToday") : "",
    sunless: saved.sunless,
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
