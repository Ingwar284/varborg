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
 * Omens of Misery (GAPS 307, 309): with the world setting "Dying of the
 * light" on Omens of Misery, the light die is not rolled. Each Misery that
 * has come keeps its omens (its d6 results) and the stage each has
 * reached, saved in their own setting (so the light-die Misery is kept for
 * switching back). The Omen results of the travel table call
 * omenForTravel: Omen (new) starts a new omen of the newest Misery, or
 * brings the next Misery when it is due; Omen (ongoing) moves a live omen,
 * picked by a roll, one stage on. At dawn only the newest Misery's sunrise
 * die is rolled. Set Misery sets every omen's stage.
 *
 * The maths lives in module/rules/misery.mjs.
 */

import {
  LIGHT_DICE, OMEN_DIE, END_LEVEL, numeral, sunriseDie, isEnd, isOne, cleanMisery, afterLightDie,
  STAGES, cleanTrack, newestLevel, isDue, newOmenOutcome, ongoingOutcome, bringNext, startOmen, advanceOmen,
  stageOf, miseryFromTrack, cleanPerMisery
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
 * Where the omens stand: "Misery II is due…", "Misery II comes once an
 * omen of Misery I reaches stage 4.", or "" once the world has ended.
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
  return i18n.format("VARBORG.Misery.Omens.NextAt", {
    name: level >= 6 ? numeral(END_LEVEL) : miseryName(level + 1),
    current: miseryName(level),
    stage: cleanPerMisery(perMisery)
  });
}

/** One omen for the Misery panel: its name, stage pips and the text of each stage so far. */
function omenContext(level, { result, stage }) {
  return {
    level,
    result,
    title: resultTitle(level, result),
    name: game.i18n.localize(`VARBORG.Misery.ResultName.${numeral(level)}${result}`),
    stage,
    done: stage >= STAGES,
    hasEarlier: stage > 1,
    stageLabel: game.i18n.format("VARBORG.Misery.Omens.Step", { step: stage }),
    pips: Array.from({ length: STAGES }, (_, i) => ({
      n: i + 1,
      state: i + 1 < stage ? "past" : i + 1 === stage ? "current" : "future"
    })),
    stages: Array.from({ length: stage }, (_, i) => ({
      n: i + 1,
      current: i + 1 === stage,
      text: omenStepText(level, result, i + 1)
    }))
  };
}

/** The Misery panel. */
export function miseryContext() {
  const { level, omen, light, sunless } = currentMisery();
  const context = {
    level,
    numeral: numeral(level),
    name: miseryName(level),
    omen: level && omen ? omenText(level, omen) : "",
    end: isEnd(level),
    sunless,
    sunDie: sunriseDie(level)?.replace(/^1/, "") ?? "",
    light: lightName(light),
    omensMode: omensMode()
  };
  if (!context.omensMode) return context;
  const track = currentTrack();
  const perMisery = omensPerMisery();
  context.omen = "";
  context.miseries = track.miseries.map((misery, index) => {
    const omens = misery.omens.map(o => omenContext(index + 1, o));
    return {
      level: index + 1,
      numeral: numeral(index + 1),
      name: miseryName(index + 1),
      newest: index + 1 === track.miseries.length && !track.ended,
      done: omens.every(o => o.done),
      count: game.i18n.format(omens.length === 1 ? "VARBORG.Misery.Omens.CountOne" : "VARBORG.Misery.Omens.Count",
        { count: omens.length }),
      omens
    };
  }).reverse();
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

/** Roll a die and keep it as a card roll. */
async function rollInto(rolls, formula) {
  const roll = await rollDie(formula);
  rolls.push(roll);
  return roll.total;
}

/** "II:3 Shattered mirrors · Stage 2 of 6" and the stage's text. */
function stageLines(track, level, result) {
  const stage = stageOf(track, level, result);
  return [
    { text: `${resultTitle(level, result)} · ${game.i18n.format("VARBORG.Misery.Omens.Step", { step: stage })}`, cls: "misery-omen" },
    { text: omenStepText(level, result, stage) }
  ];
}

/**
 * Dark Master only: an Omen result on the travel table, with Omens of
 * Misery in use (GAPS 307, 309), and save the track.
 * - "new" (11-12): the next Misery comes if it is due; otherwise a new
 *   omen of the newest Misery starts at stage 1 (its d6 rolled again on a
 *   result already started); with all six started, a live omen moves on.
 * - "ongoing" (13-16): a live omen, picked by a roll, moves one stage on;
 *   with none live, it works as "new".
 * @param {"new"|"ongoing"} kind  Which Omen result was rolled.
 * @returns {Promise<{lines: Array<{text: string, cls?: string}>, rolls: Roll[], end: boolean}>}
 */
export async function omenForTravel(kind) {
  const i18n = game.i18n;
  const track = currentTrack();
  const perMisery = omensPerMisery();
  const outcome = kind === "new" ? newOmenOutcome(track, perMisery) : ongoingOutcome(track, perMisery);
  const lines = [];
  const rolls = [];

  if (outcome.kind === "none") {
    return { lines: [{ text: i18n.localize("VARBORG.Misery.Omens.Over") }], rolls, end: false };
  }
  if (kind === "ongoing" && outcome.kind !== "advance") {
    lines.push({ text: i18n.localize("VARBORG.Misery.Omens.NoneLive"), cls: "hint" });
  }

  if (outcome.kind === "ends") {
    await saveTrack(bringNext(track));
    lines.push({ text: i18n.format("VARBORG.Misery.Omens.Comes", { name: miseryName(END_LEVEL) }), cls: "misery-omen" });
    lines.push({ text: i18n.localize("VARBORG.Misery.Omens.EndDay") });
    return { lines, rolls, end: true };
  }

  let after;
  let level;
  let result;
  if (outcome.kind === "comes") {
    level = outcome.level;
    result = await rollInto(rolls, OMEN_DIE);
    after = bringNext(track, result);
    lines.push({ text: i18n.format("VARBORG.Misery.Omens.Comes", { name: miseryName(level) }) });
    lines.push({ text: i18n.format("VARBORG.Misery.Omens.FirstOmen", { result }) });
  } else if (outcome.kind === "start") {
    level = outcome.level;
    // A result already started is rolled again.
    const seen = [];
    do {
      result = await rollInto(rolls, OMEN_DIE);
      seen.push(result);
    } while (!outcome.results.includes(result));
    after = startOmen(track, result);
    lines.push({
      text: seen.length > 1
        ? i18n.format("VARBORG.Misery.Omens.NewRerolled", { name: miseryName(level), rolls: seen.join(", "), result })
        : i18n.format("VARBORG.Misery.Omens.New", { name: miseryName(level), result })
    });
  } else {
    if (kind === "new") {
      lines.push({ text: i18n.format("VARBORG.Misery.Omens.AllBegun", { name: miseryName(track.miseries.length) }), cls: "hint" });
    }
    const { choices } = outcome;
    let pick = choices[0];
    if (choices.length > 1) {
      pick = choices[(await rollInto(rolls, `1d${choices.length}`)) - 1];
      lines.push({
        text: i18n.format("VARBORG.Misery.Omens.Random", { die: choices.length, result: resultTitle(pick.level, pick.result) })
      });
    }
    ({ level, result } = pick);
    after = advanceOmen(track, level, result);
  }

  lines.push(...stageLines(after, level, result));
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
 * Dark Master only, Omens of Misery: set the stage of every omen of every
 * Misery (0: not begun), whether VII has come, and whether the sun rose
 * today. Miseries come in order, so the list stops at the first Misery
 * with no omen begun.
 * @returns {Promise<boolean>}  Whether the Miseries were set.
 */
async function setOmensByHand() {
  const i18n = game.i18n;
  const escape = foundry.utils.escapeHTML;
  const now = currentTrack();
  const stages = [0, 1, 2, 3, 4, 5, 6].map(n => [n, n ? String(n) : "–"]);
  const head = [1, 2, 3, 4, 5, 6].map(result => `<th>${result}</th>`).join("");
  const rows = [1, 2, 3, 4, 5, 6].map(level => {
    const cells = [1, 2, 3, 4, 5, 6].map(result => {
      const title = resultTitle(level, result);
      return `<td data-tooltip="${escape(title)}">`
        + `<select name="stage${level}_${result}" aria-label="${escape(title)}">${options(stages, stageOf(now, level, result))}</select></td>`;
    }).join("");
    return `<tr><th>${escape(miseryName(level))}</th>${cells}</tr>`;
  }).join("");
  const content = `<p class="hint">${i18n.localize("VARBORG.Misery.Omens.SetHint")}</p>`
    + `<table class="misery-set-table"><thead><tr><th>${i18n.localize("VARBORG.Misery.Omens.OmenLabel")}</th>${head}</tr></thead>`
    + `<tbody>${rows}</tbody></table>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Misery.Omens.EndedLabel")}</label>`
    + `<input type="checkbox" name="ended" ${now.ended ? "checked" : ""}></div>`
    + `<div class="form-group"><label>${i18n.localize("VARBORG.Misery.SunlessLabel")}</label>`
    + `<input type="checkbox" name="sunless" ${now.sunless ? "checked" : ""}></div>`;
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: "VARBORG.Misery.SetTitle", icon: "fa-solid fa-skull" },
    position: { width: 560 },
    content,
    ok: { label: "VARBORG.Misery.Set", icon: "fa-solid fa-check" },
    rejectClose: false
  });
  if (!data) return false;

  const miseries = [1, 2, 3, 4, 5, 6].map(level => {
    const stageFor = result => Number(data[`stage${level}_${result}`]) || 0;
    // Omens already begun keep their order; newly set ones follow by result.
    const before = now.miseries[level - 1]?.omens.map(o => o.result) ?? [];
    const order = [...before, ...[1, 2, 3, 4, 5, 6].filter(r => !before.includes(r))];
    return { omens: order.filter(r => stageFor(r) > 0).map(result => ({ result, stage: stageFor(result) })) };
  });
  const track = cleanTrack({ miseries, ended: !!data.ended });
  await saveTrack(track, !!data.sunless);
  const saved = currentTrack();
  const level = newestLevel(saved);
  await postMiseryCard({
    level,
    omen: null,
    lines: [
      i18n.format("VARBORG.Misery.SetCard", { name: miseryName(level) }),
      ...saved.miseries.flatMap((misery, index) => misery.omens.map(o => `${resultTitle(index + 1, o.result)} · ${
        i18n.format("VARBORG.Misery.Omens.Track", { step: o.stage })}`)),
      nextLine(saved, omensPerMisery())
    ].filter(Boolean),
    sunLine: saved.sunless ? i18n.localize("VARBORG.Misery.NoSunToday") : "",
    sunless: saved.sunless,
    rolls: []
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
