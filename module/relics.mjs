/**
 * Relics in Foundry (rules 4.2, GAPS 164, 173 and 174).
 *
 * A relic on a character has, in the Inventory tab:
 * - Use: posts its effect, marks a once-per-day relic used (step 36b),
 *   adds its Ember pool gain if it has one (in combat only), then rolls
 *   the Expendable d20. On a 1 the relic is destroyed.
 * - Daily roll, instead of Use, for a relic whose effect is always on:
 *   the once-per-day Expendable d20, "the first time its effect matters".
 * - Last Rite: after asking, posts the Last Rite. It always works, needs no
 *   ember and no Expendable roll, and destroys the relic.
 * A destroyed relic stays on the sheet, struck through, with its drawback
 * shown; every card that destroys it shows the drawback too. The Dark
 * Master unticks Destroyed on the relic's sheet when it is recovered.
 *
 * The maths lives in module/rules/relics.mjs.
 */

import {
  RELIC_DIE, relicFrequency, canUseRelic, canPerformLastRite, emberGainOnUse, afterUse
} from "./rules/relics.mjs";
import { hasFrequency } from "./rules/uses.mjs";
import { runningCombat, gainEmber } from "./pools.mjs";

const { DialogV2 } = foundry.applications.api;

/** Text for a chat card: escaped, line breaks kept. */
function cardText(text) {
  return foundry.utils.escapeHTML(String(text ?? "").trim()).replace(/\n/g, "<br>");
}

/** "Once per day", or "" for no limit. */
function frequencyText(system) {
  const frequency = relicFrequency(system);
  return frequency ? game.i18n.localize(`VARBORG.Uses.Frequency.${frequency}`) : "";
}

/** What the sheet needs for a relic row. */
export function relicRow(item) {
  const i18n = game.i18n;
  const system = item.system;
  const usable = canUseRelic(system);
  const daily = system.alwaysOn;
  return {
    isRelic: true,
    relicDaily: daily,
    canUseRelic: usable,
    relicUseTooltip: system.destroyed
      ? i18n.localize("VARBORG.Relic.DestroyedTooltip")
      : usable
        ? i18n.localize(daily ? "VARBORG.Relic.DailyTooltip" : "VARBORG.Relic.UseTooltip")
        : i18n.localize("VARBORG.Uses.UsedTooltip"),
    canLastRite: canPerformLastRite(system),
    relicDestroyed: system.destroyed,
    drawback: system.destroyed ? system.drawback : ""
  };
}

/** One short line about a relic: "Once per day · Always on · 🟒+3". */
export function relicSummary(item) {
  const i18n = game.i18n;
  const system = item.system;
  return [
    frequencyText(system),
    system.alwaysOn ? i18n.localize("VARBORG.Relic.AlwaysOn") : "",
    system.emberGain ? i18n.format("VARBORG.Relic.GainShort", { amount: system.emberGain }) : ""
  ].filter(Boolean).join(" · ");
}

/**
 * The Use (or Daily roll) button.
 * @param {Actor} actor
 * @param {Item} item  The relic.
 */
export async function useRelic(actor, item) {
  if (!actor.isOwner || item.type !== "relic") return;
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const system = item.system;
  if (system.destroyed) {
    ui.notifications.warn(i18n.format("VARBORG.Relic.IsDestroyed", { item: item.name }));
    return;
  }
  if (!canUseRelic(system)) {
    ui.notifications.warn(i18n.format("VARBORG.Uses.AlreadyUsed", { item: item.name, frequency: frequencyText(system).toLowerCase() }));
    return;
  }
  // An Ember pool gain needs a pool, so a combat (GAPS 174).
  const ember = emberGainOnUse(system.emberGain, Boolean(runningCombat()));
  if (!ember.allowed) {
    ui.notifications.warn(i18n.format("VARBORG.Relic.NeedsCombat", { item: item.name }));
    return;
  }
  if (ember.gain && !(await gainEmber(ember.gain, actor, item.name))) return;

  const frequency = relicFrequency(system);
  if (hasFrequency({ frequency })) await item.update({ "system.frequencyUsed": true });

  const roll = await new Roll(RELIC_DIE).evaluate();
  const { destroyed } = afterUse(roll.total);
  if (destroyed) await item.update({ "system.destroyed": true });

  const daily = system.alwaysOn;
  const title = i18n.format(daily ? "VARBORG.Relic.DailyTitle" : "VARBORG.Relic.UseTitle", { name: esc(actor.name), item: esc(item.name) });
  const effect = cardText(system.description);
  const lines = [
    frequency ? `<p class="sum">${i18n.format("VARBORG.Uses.CardLine", { frequency: frequencyText(system) })}</p>` : "",
    effect ? `<p>${effect}</p>` : "",
    ember.gain ? `<p class="modifier">${i18n.format("VARBORG.Relic.GainLine", { amount: ember.gain })}</p>` : "",
    `<p class="relic-roll">${i18n.format("VARBORG.Relic.Roll", { roll: roll.total })} `
      + `<strong>${i18n.localize(destroyed ? "VARBORG.Relic.UsedUp" : "VARBORG.Relic.Holds")}</strong></p>`,
    destroyed ? drawbackLine(system) : ""
  ];
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content: `<div class="var-borg-card relic-card"><h3>${title}</h3>${lines.join("")}</div>`,
    rolls: [roll],
    sound: CONFIG.sounds.dice
  });
}

/**
 * The Last Rite button: after asking, burn the relic out.
 * @param {Actor} actor
 * @param {Item} item  The relic.
 */
export async function performLastRite(actor, item) {
  if (!actor.isOwner || item.type !== "relic") return;
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const system = item.system;
  if (!canPerformLastRite(system)) {
    ui.notifications.warn(i18n.format("VARBORG.Relic.IsDestroyed", { item: item.name }));
    return;
  }
  const ok = await DialogV2.confirm({
    window: { title: i18n.format("VARBORG.Relic.LastRiteAskTitle", { item: item.name }) },
    content: `<p>${i18n.format("VARBORG.Relic.LastRiteAsk", { item: esc(item.name) })}</p>`
      + (system.lastRite ? `<p><em>${cardText(system.lastRite)}</em></p>` : ""),
    rejectClose: false
  });
  if (!ok) return;
  await item.update({ "system.destroyed": true });
  const title = i18n.format("VARBORG.Relic.LastRiteTitle", { name: esc(actor.name), item: esc(item.name) });
  const rite = cardText(system.lastRite);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content: `<div class="var-borg-card relic-card"><h3>${title}</h3>`
      + (rite ? `<p>${rite}</p>` : "")
      + `<p class="modifier">${i18n.localize("VARBORG.Relic.LastRiteRule")}</p>`
      + `<p class="relic-roll"><strong>${i18n.localize("VARBORG.Relic.BurntOut")}</strong></p>`
      + drawbackLine(system)
      + `</div>`
  });
}

/** The drawback on a card: "If lost or destroyed: …". */
function drawbackLine(system) {
  const text = cardText(system.drawback);
  return `<p class="relic-drawback"><strong>${game.i18n.localize("VARBORG.Relic.Drawback")}:</strong> `
    + `${text || game.i18n.localize("VARBORG.Relic.NoDrawback")}</p>`
    + `<p class="hint">${game.i18n.localize("VARBORG.Relic.RecoverHint")}</p>`;
}
