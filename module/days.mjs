/**
 * Days in Foundry (rules 3.16 Resting, "A new day", Starvation, Doomed;
 * GAPS 30, 142–143).
 *
 * The day number is a world setting, shown to everyone on the Table panel
 * (module/pools.mjs). The Dark Master's New day button asks who ate and
 * drank the day before, then, for every living character:
 * - days without food go to 0 (ate) or up by 1 (did not);
 * - a Doomed character gains a wound (HP unchanged) with the usual
 *   Toughness test, or none at max wounds;
 * - a character with more than 2 days without food takes d6 damage (at
 *   0 HP this gains a wound as any damage does).
 * Long Rests will call newDay too (step 33).
 *
 * The maths lives in module/rules/days.mjs.
 */

import { FIRST_DAY, STARVATION_DAMAGE, nextDay, newDayFor } from "./rules/days.mjs";
import { hpAfterDamage } from "./rules/health.mjs";
import { postDoomedWoundCard } from "./agony.mjs";
import { isDead, killedByDamage } from "./deaths-door.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";
const SETTING = "day";

/** The day setting. Changing it redraws the Table panel. */
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

/** The characters a new day reaches: every character that is not dead. */
function livingCharacters() {
  return game.actors.filter(actor => actor.type === "character" && !isDead(actor));
}

/**
 * Dark Master only: ask who ate, then start the next day.
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
    return `<label class="checkbox"><input type="checkbox" name="ate-${actor.id}" checked> `
      + `${foundry.utils.escapeHTML(actor.name)}${hint}</label>`;
  }).join("");
  const content = characters.length
    ? `<p>${i18n.localize("VARBORG.Day.AteQuestion")}</p><div class="day-ate-list">${rows}</div>`
      + `<p class="hint">${i18n.localize("VARBORG.Day.AteHint")}</p>`
    : `<p>${i18n.localize("VARBORG.Day.NoCharacters")}</p>`;
  const data = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Day.DialogTitle", { day }) },
    content,
    ok: { label: "VARBORG.Day.Begin", icon: "fa-solid fa-sun" },
    rejectClose: false
  });
  if (!data) return false;

  await game.settings.set(SYSTEM, SETTING, day);
  await ChatMessage.create({
    content: `<div class="var-borg-card day-card"><h3>${i18n.format("VARBORG.Day.Begins", { day })}</h3></div>`
  });
  for (const actor of characters) {
    await startDayFor(actor, !!data[`ate-${actor.id}`]);
  }
  return true;
}

/** Everything the start of a day does to one character. */
async function startDayFor(actor, ate) {
  const system = actor.system;
  const outcome = newDayFor({
    daysWithoutFood: system.daysWithoutFood,
    ate,
    doomed: actor.statuses.has("doomed"),
    wounds: system.wounds.value,
    maxWounds: system.wounds.max
  });

  const changes = { "system.daysWithoutFood": outcome.daysWithoutFood };
  if (outcome.doom?.added) changes["system.wounds.value"] = outcome.doom.wounds;
  await actor.update(changes);
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
