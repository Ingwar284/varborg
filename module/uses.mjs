/**
 * Limited uses in Foundry: "once per round", "once per encounter" and
 * "once per day" (rules 3.16, GAPS 161, 164).
 *
 * A feat or gear item with a frequency gets a Use button on the character
 * and foe sheets. Pressing it marks the item used and posts a card with the
 * item's text; the button stays off until the use comes back:
 * - once per round: at the start of each round, and when combat ends
 *   (module/combat.mjs);
 * - once per encounter: when combat ends (module/combat.mjs);
 * - once per day: at each new day (module/days.mjs), with a line on the
 *   chat saying what came back.
 * The Dark Master can untick "Used" on the item's sheet at any time.
 *
 * The maths lives in module/rules/uses.mjs.
 */

import { canUseOnce, hasFrequency, itemsToReset } from "./rules/uses.mjs";
import { collectEffects, useEffects } from "./rules/item-effects.mjs";
import { doEffectAction } from "./effects.mjs";
import { useChoices } from "./rules/item-effects.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

/** Load the Use button the sheets share. */
export function registerUses() {
  foundry.applications.handlebars.loadTemplates(["systems/var-borg/templates/actor/use-button.hbs"]);
}

/** Item types that can have a limited use with the shared Use button. */
const TYPES = ["feat", "gear"];

/** Item types whose uses come back: relics too, which have their own buttons (module/relics.mjs). */
const RESET_TYPES = [...TYPES, "relic"];

/** The item's Use effects that the button does (step 49g). */
function itemUseEffects(item) {
  return useEffects(collectEffects([item]));
}

/**
 * Whether the sheet shows a Use button for this item: it has a limited use,
 * or Use effects (step 49g).
 */
export function hasLimitedUse(item) {
  return TYPES.includes(item.type) && (hasFrequency(item.system) || itemUseEffects(item).length > 0);
}

/** Whether the Use button can be pressed now: unspent, or with no limit. */
export function canUseItem(item) {
  if (!TYPES.includes(item.type)) return false;
  return hasFrequency(item.system) ? canUseOnce(item.system) : itemUseEffects(item).length > 0;
}

/** "Once per day". */
export function frequencyLabel(item) {
  return game.i18n.localize(`VARBORG.Uses.Frequency.${item.system.frequency || "none"}`);
}

/**
 * What a sheet needs for the Use button: shown when the item has a
 * frequency, off while it is used.
 */
export function useButton(item) {
  if (!hasLimitedUse(item)) return { hasUse: false };
  const i18n = game.i18n;
  const usable = canUseItem(item);
  return {
    hasUse: true,
    canUse: usable,
    useTooltip: usable
      ? i18n.format("VARBORG.Uses.Tooltip", { frequency: frequencyLabel(item).toLowerCase() })
      : i18n.localize("VARBORG.Uses.UsedTooltip")
  };
}

/** An item's text for a chat card: escaped, line breaks kept. */
function cardText(text) {
  return foundry.utils.escapeHTML(String(text ?? "").trim()).replace(/\n/g, "<br>");
}

/**
 * The Use effects to do now: all of them, or, when the item has actions
 * that are done on their own (making a companion, mounting, raising a
 * thrall…), the ones the player picks. Null when the dialog is closed.
 * @param {Item} item
 * @returns {Promise<object[]|null>}
 */
async function pickUseEffects(item) {
  const choices = useChoices(itemUseEffects(item));
  if (choices.length < 2) return choices[0] ?? [];
  const i18n = game.i18n;
  const label = effect => {
    if (effect.action === "mount") return i18n.localize(effect.mounted ? "VARBORG.Effects.Dismount" : "VARBORG.Effects.MountUp");
    return i18n.localize(`VARBORG.Effects.Action.${effect.action}`);
  };
  const picked = await foundry.applications.api.DialogV2.wait({
    classes: VB_DIALOG_CLASSES,
    window: { title: item.name },
    content: `<p>${foundry.utils.escapeHTML(i18n.localize("VARBORG.Uses.Which"))}</p>`,
    buttons: choices.map((list, index) => ({ action: String(index), label: list.map(label).join(" + "), default: index === 0 })),
    rejectClose: false
  });
  return picked === null || picked === undefined ? null : choices[Number(picked)] ?? null;
}

/**
 * The Use button: mark the item used and post its card.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function useLimitedItem(actor, item) {
  if (!actor.isOwner || !hasLimitedUse(item)) return;
  const i18n = game.i18n;
  if (!canUseItem(item)) {
    ui.notifications.warn(i18n.format("VARBORG.Uses.AlreadyUsed", { item: item.name, frequency: frequencyLabel(item).toLowerCase() }));
    return;
  }
  // Several Use actions that are done on their own: ask which (step 51a3).
  const effects = await pickUseEffects(item);
  if (!effects) return;
  const limited = hasFrequency(item.system);
  if (limited) await item.update({ "system.frequencyUsed": true });
  // The item's Use effects: roll, heal, Ember, a condition (step 49g).
  const lines = [];
  const rolls = [];
  for (const effect of effects) {
    const done = await doEffectAction(actor, effect);
    lines.push(...done.lines);
    rolls.push(...done.rolls);
  }
  const esc = foundry.utils.escapeHTML;
  const text = cardText(item.system.description);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card uses-card"><h3>${i18n.format("VARBORG.Uses.CardTitle", { name: esc(actor.name), item: esc(item.name) })}</h3>`
      + (limited ? `<p class="sum">${i18n.format("VARBORG.Uses.CardLine", { frequency: frequencyLabel(item) })}</p>` : "")
      + lines.map(line => `<p class="sum">${esc(line)}</p>`).join("")
      + (text ? `<p>${text}</p>` : "") + `</div>`,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
}

/**
 * Bring back the used items of these actors at a moment (roundStart,
 * combatEnd or newDay). Dark Master only.
 * @param {Actor[]} actors
 * @param {string} event
 * @returns {Promise<Map<Actor, string[]>>}  For each actor, the names of the items that came back.
 */
export async function resetLimitedUses(actors, event) {
  const back = new Map();
  if (!game.user.isGM) return back;
  for (const actor of new Set(actors)) {
    if (!actor) continue;
    const items = actor.items.filter(item => RESET_TYPES.includes(item.type));
    const ids = itemsToReset(items, event);
    if (!ids.length) continue;
    await actor.updateEmbeddedDocuments("Item", ids.map(_id => ({ _id, "system.frequencyUsed": false })));
    back.set(actor, ids.map(id => actor.items.get(id)?.name).filter(Boolean));
  }
  return back;
}

/**
 * Every actor a new day reaches for uses and timers: the actors in the
 * Actors tab, and the foes on scenes that are not linked to one (each
 * token is its own copy).
 */
export function actorsForNewDay() {
  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (!token.actorLink && token.actor) actors.push(token.actor);
    }
  }
  return actors;
}

/**
 * Bring back these actors' uses at a moment and post a line per actor
 * saying which came back, such as after a Long Rest (step 49g).
 * @param {Actor[]} actors
 * @param {string} event  One of RESET_EVENTS.
 */
export async function resetAndAnnounce(actors, event) {
  const back = await resetLimitedUses(actors, event);
  const esc = foundry.utils.escapeHTML;
  for (const [actor, names] of back) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="var-borg-card"><p>${game.i18n.format("VARBORG.Uses.BackNow", { name: esc(actor.name), items: names.map(esc).join(", ") })}</p></div>`
    });
  }
  return back;
}

/**
 * The Dark Master's button: once-per-visit uses come back for everyone,
 * as when the party reaches a new settlement (GAPS 190).
 */
export async function resetVisitUses() {
  if (!game.user.isGM) return;
  const back = await resetAndAnnounce(actorsForNewDay(), "visit");
  if (!back.size) ui.notifications.info(game.i18n.localize("VARBORG.Uses.NoVisitUses"));
}
