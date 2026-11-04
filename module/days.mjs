/**
 * Days in Foundry (rules 3.16 Resting, "A new day", Starvation, Doomed;
 * GAPS 30, 142–143).
 *
 * The day number is a world setting, shown to everyone on the Calendar panel
 * (module/pools.mjs). The Dark Master's New day button asks who ate and
 * drank the day before, then, for every living character:
 * - days without food go to 0 (ate) or up by 1 (did not);
 * - a Doomed character gains a wound (HP unchanged) with the usual
 *   Toughness test, or none at max wounds;
 * - a character with more than 2 days without food takes d6 damage (at
 *   0 HP this gains a wound as any damage does).
 * Not sleeping adds a level of Fatigued: the dialog asks who slept (GAPS
 * 145). For every actor, once-per-day uses come back and conditions
 * lasting "until the next day begins" end (GAPS 161). Rests (module/rest.mjs) start their days with startDays, without
 * the dialog: those who rested slept.
 *
 * Each new day also moves Foundry's world clock on to that day's dawn
 * (step 37, module/calendar.mjs), unless the clock is already past it.
 *
 * The maths lives in module/rules/days.mjs.
 */

import { FIRST_DAY, STARVATION_DAMAGE, nextDay, newDayFor } from "./rules/days.mjs";
import { dawnOf, dateOfDay } from "./rules/calendar.mjs";
import { fatigueAfterNight } from "./rules/rest.mjs";
import { hpAfterDamage } from "./rules/health.mjs";
import { postDoomedWoundCard } from "./agony.mjs";
import { isDead, killedByDamage } from "./deaths-door.mjs";
import { resetLimitedUses, actorsForNewDay } from "./uses.mjs";
import { endNewDayTimers } from "./timers.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";
const SETTING = "day";

/** The day setting. Changing it redraws the Calendar panel. */
export function registerDays(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Number,
    default: FIRST_DAY,
    onChange
  });
}

/** Today's number. */
export function currentDay() {
  return game.settings.get(SYSTEM, SETTING) ?? FIRST_DAY;
}

/** "3 Dawning, year 1": the date of a day number (GAPS 157). */
export function formatDate(day) {
  const date = dateOfDay(day);
  return game.i18n.format("VARBORG.Calendar.Date", {
    day: date.dayOfMonth,
    month: game.i18n.localize(`VARBORG.Calendar.Month.${date.month}`),
    year: date.year
  });
}

/** "Thirdday": the weekday of a day number. */
export function weekdayName(day) {
  return game.i18n.localize(`VARBORG.Calendar.Weekday.${dateOfDay(day).weekday}`);
}

/** The characters a new day reaches: every character that is not dead. */
export function livingCharacters() {
  return game.actors.filter(actor => actor.type === "character" && !isDead(actor));
}

/**
 * Dark Master only: ask who ate and who slept, then start the next day.
 * @returns {Promise<boolean>}  Whether a new day began (false if the dialog was closed).
 */
export async function newDay() {
  if (!game.user.isGM) return false;
  const i18n = game.i18n;
  const characters = livingCharacters();
  const day = nextDay(currentDay());

  const rows = characters.map(actor => {
    const days = actor.system.daysWithoutFood;
    const hint = days ? ` <span class="hint">${i18n.format("VARBORG.Day.SoFar", { days })}</span>` : "";
    return `<tr><td>${foundry.utils.escapeHTML(actor.name)}${hint}</td>`
      + `<td><input type="checkbox" name="ate-${actor.id}" checked></td>`
      + `<td><input type="checkbox" name="slept-${actor.id}" checked></td></tr>`;
  }).join("");
  const content = characters.length
    ? `<table class="var-borg-tick-table"><thead><tr><th></th>`
      + `<th>${i18n.localize("VARBORG.Day.Ate")}</th><th>${i18n.localize("VARBORG.Day.Slept")}</th></tr></thead>`
      + `<tbody>${rows}</tbody></table>`
      + `<p class="hint">${i18n.localize("VARBORG.Day.AteHint")}</p>`
      + `<p class="hint">${i18n.localize("VARBORG.Day.SleptHint")}</p>`
    : `<p>${i18n.localize("VARBORG.Day.NoCharacters")}</p>`;
  const data = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Day.DialogTitle", { day }) },
    content,
    ok: { label: "VARBORG.Day.Begin", icon: "fa-solid fa-sun" },
    rejectClose: false
  });
  if (!data) return false;

  const ate = new Set(characters.filter(actor => data[`ate-${actor.id}`]).map(actor => actor.id));
  const slept = new Set(characters.filter(actor => data[`slept-${actor.id}`]).map(actor => actor.id));
  await startDays(characters, { ate, slept });
  return true;
}

/**
 * Start one or more new days (a Long Rest, Downtime or the New day button).
 * Dark Master only. A character who dies on one day is left out of the next.
 * @param {Actor[]} characters  The characters the days reach.
 * @param {{ate: Set<string>, slept: Set<string>}} who  Actor ids that ate and drank, and that slept.
 * @param {number} [count]  How many days.
 */
export async function startDays(characters, { ate, slept }, count = 1) {
  if (!game.user.isGM) return;
  const i18n = game.i18n;
  for (let i = 0; i < count; i++) {
    const day = nextDay(currentDay());
    await game.settings.set(SYSTEM, SETTING, day);
    // The clock moves on to this day's dawn (step 37), never back.
    const dawn = dawnOf(day);
    if (game.time.worldTime < dawn) await game.time.set(dawn);
    await ChatMessage.create({
      content: `<div class="var-borg-card day-card"><h3>${i18n.format("VARBORG.Day.Begins", { day })}</h3>`
        + `<p>${i18n.format("VARBORG.Calendar.DawnOf", { weekday: weekdayName(day), date: formatDate(day) })}</p></div>`
    });
    await dawnForEveryone();
    for (const actor of characters) {
      if (isDead(actor)) continue;
      await startDayFor(actor, ate.has(actor.id), slept.has(actor.id));
    }
  }
}

/**
 * For every actor, characters and foes: once-per-day uses come back (with a
 * line saying which), and conditions lasting "until the next day begins"
 * end (rules 3.16, GAPS 161).
 */
async function dawnForEveryone() {
  const actors = actorsForNewDay().filter(actor => !isDead(actor));
  const back = await resetLimitedUses(actors, "newDay");
  for (const [actor, names] of back) {
    await postLine(actor, game.i18n.format("VARBORG.Uses.BackToday", {
      name: foundry.utils.escapeHTML(actor.name),
      items: names.map(name => foundry.utils.escapeHTML(name)).join(", ")
    }));
  }
  await endNewDayTimers(actors);
}

/** Everything the start of a day does to one character. */
async function startDayFor(actor, ate, slept) {
  const system = actor.system;
  const outcome = newDayFor({
    daysWithoutFood: system.daysWithoutFood,
    ate,
    doomed: actor.statuses.has("doomed"),
    wounds: system.wounds.value,
    maxWounds: system.wounds.max
  });

  const changes = { "system.daysWithoutFood": outcome.daysWithoutFood };
  const fatigue = fatigueAfterNight(system.fatigue, slept);
  if (fatigue !== system.fatigue) changes["system.fatigue"] = fatigue;
  if (outcome.doom?.added) changes["system.wounds.value"] = outcome.doom.wounds;
  await actor.update(changes);
  if (fatigue !== system.fatigue) await postLine(actor, game.i18n.format("VARBORG.Day.NoSleep", { name: actor.name, level: fatigue }));
  if (outcome.doom) await postDoomedWoundCard(actor, outcome.doom);
  if (outcome.starving) await starve(actor, outcome.daysWithoutFood);
}

/** Starvation: d6 damage, posted with the roll. */
async function starve(actor, days) {
  const i18n = game.i18n;
  const roll = new Roll(STARVATION_DAMAGE);
  await roll.evaluate();
  const damage = roll.total;
  const from = actor.system.hp.value;
  const to = hpAfterDamage(from, damage);
  const lines = [
    i18n.format("VARBORG.Day.Starving", { name: actor.name, days, damage }),
    i18n.format("VARBORG.Day.Hp", { from, to, max: actor.system.hp.max })
  ];
  // The card first, so a wound card from reaching 0 HP follows it.
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `<div class="var-borg-card day-card"><h3>${i18n.format("VARBORG.Day.StarvingTitle", { name: actor.name })}</h3>`
      + lines.map(line => `<p class="sum">${line}</p>`).join("") + `</div>`
  });
  // At Death's Door any damage kills (module/deaths-door.mjs) instead.
  if (await killedByDamage(actor, damage)) return;
  // At 0 HP the character data adds a wound and posts its card.
  await actor.update({ "system.hp.value": to });
}

/** A one-line card. */
async function postLine(actor, text) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card day-card"><p>${text}</p></div>`
  });
}
