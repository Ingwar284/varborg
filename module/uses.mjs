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
import { rollExpendable } from "./dice/expendable.mjs";
import { turnState } from "./combat.mjs";
import { CONSUME_ACTIONS, isConsumableGear } from "./rules/expendable.mjs";
import { poisonOf, askPoisonUse, applyPoisonUse } from "./poison.mjs";
import { oneAtATime } from "./busy.mjs";
import { isTossed, canToss } from "./rules/toss.mjs";
import { tossesItem, tossItem, placesItem } from "./toss.mjs";
import { aimArea, keepArea } from "./areas.mjs";

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
 * A consumable: gear with an expendable die, except the medicine box. Its
 * button is Interact ◈: do its Use effects (the healing potion heals), post
 * its text, then roll the expendable die (GAPS 260). No separate die button.
 */
export function isConsumable(item) {
  return isConsumableGear(item.type, item.system);
}

/**
 * Whether the sheet shows a Use button for this item: it has a limited use,
 * or Use effects (step 49g).
 */
export function hasLimitedUse(item) {
  return TYPES.includes(item.type) && (hasFrequency(item.system) || itemUseEffects(item).length > 0 || isConsumable(item) || isTossed(item.system));
}

/** Whether the Use button can be pressed now: unspent, or with no limit. */
export function canUseItem(item) {
  if (!TYPES.includes(item.type)) return false;
  // A bomb (Fire pot, Smoke bomb): while one is left (GAPS 314).
  if (isTossed(item.system)) return canToss(item.system);
  if (isConsumable(item)) return !item.system.usedUp && (!hasFrequency(item.system) || canUseOnce(item.system));
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
/**
 * The Cartomancer's feature The reading (its stat switch "reading"). Its Use
 * button lays out a reading, only while the character has none (designer's
 * ruling, 18 November 2026); a Long Rest still lays one out by itself.
 */
function isReadingFeature(item) {
  return (item?.system?.effects ?? []).some(effect => effect.kind === "stat" && effect.target === "reading");
}

/** Whether the character has no reading laid out. */
function hasNoReading(actor) {
  const reading = actor?.getFlag("var-borg", "reading");
  return !Array.isArray(reading) || !reading.length;
}

/** The reading's Use: lay out a reading if there is none. */
async function useReadingFeature(actor) {
  const i18n = game.i18n;
  if (!hasNoReading(actor)) {
    ui.notifications.warn(i18n.localize("VARBORG.Arcana.AlreadyLaid"));
    return;
  }
  const { layOutReading } = await import("./reading.mjs");
  const line = await layOutReading(actor);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${foundry.utils.escapeHTML(line)}</p></div>`
  });
}

export function useButton(item) {
  if (!hasLimitedUse(item)) return { hasUse: false };
  const i18n = game.i18n;
  if (isReadingFeature(item)) {
    const none = hasNoReading(item.parent);
    return {
      hasUse: true,
      canUse: none,
      useTooltip: i18n.localize(none ? "VARBORG.Arcana.UseTooltip" : "VARBORG.Arcana.AlreadyLaid")
    };
  }
  const usable = canUseItem(item);
  if (isTossed(item.system)) {
    return {
      hasUse: true,
      canUse: usable,
      useInteract: true,
      useTooltip: usable ? i18n.localize("VARBORG.Toss.Tooltip") : i18n.localize("VARBORG.Expendable.UsedUp")
    };
  }
  if (isConsumable(item)) {
    return {
      hasUse: true,
      canUse: usable,
      useInteract: true,
      useTooltip: usable
        ? i18n.format("VARBORG.Uses.InteractTooltip", { die: item.system.expendable })
        : i18n.localize("VARBORG.Expendable.UsedUp")
    };
  }
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
export function useLimitedItem(actor, item) {
  return oneAtATime(`use:${item.uuid}`, () => useLimitedItemNow(actor, item));
}

/** The body of useLimitedItem, run inside the guard (REVIEW.md S2, L25). */
async function useLimitedItemNow(actor, item) {
  if (!actor.isOwner || !hasLimitedUse(item)) return;
  // The reading: Use lays out a reading when there is none.
  if (isReadingFeature(item)) return useReadingFeature(actor);
  // A bomb is tossed (GAPS 314, module/toss.mjs).
  if (tossesItem(actor, item)) return tossItem(actor, item);
  const i18n = game.i18n;
  if (!canUseItem(item)) {
    ui.notifications.warn(i18n.format("VARBORG.Uses.AlreadyUsed", { item: item.name, frequency: frequencyLabel(item).toLowerCase() }));
    return;
  }
  // A consumable is used with Interact ◈: in combat on your own turn only (GAPS 260).
  const consumable = isConsumable(item);
  const turn = consumable ? turnState(actor) : { combatant: null };
  if (turn.combatant && !turn.onOwnTurn) {
    ui.notifications.warn(i18n.localize("VARBORG.Manual.NotYourTurn"));
    return;
  }
  // Caltrops or a Bear trap: place the area first; cancelling spends nothing (GAPS 314, step 68e).
  const placed = placesItem(actor, item) ? await aimArea(actor, item) : null;
  if (placed && !placed.go) return;
  // A poison: on the targets, or on a weapon (GAPS 283).
  const poison = poisonOf(item.name) ? await askPoisonUse(actor, item) : null;
  if (poisonOf(item.name) && !poison) return;
  // Several Use actions that are done on their own: ask which (step 51a3).
  const effects = await pickUseEffects(item);
  if (!effects) return;
  if (turn.combatant) {
    if (turn.combatant.actionsLeft < CONSUME_ACTIONS) ui.notifications.warn(i18n.localize("VARBORG.Manual.NoActions"));
    await turn.combatant.adjustPips("actions", -CONSUME_ACTIONS);
  }
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
  if (poison?.mode === "coat") lines.push(await applyPoisonUse(actor, item, poison));
  const esc = foundry.utils.escapeHTML;
  const text = cardText(item.system.description);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card uses-card"><h3>${i18n.format("VARBORG.Uses.CardTitle", { name: esc(actor.name), item: esc(item.name) })}</h3>`
      + (limited ? `<p class="sum">${i18n.format("VARBORG.Uses.CardLine", { frequency: frequencyLabel(item) })}</p>` : "")
      + (consumable ? `<p class="sum">${esc(i18n.localize("VARBORG.Uses.InteractLine"))}</p>` : "")
      + lines.map(line => `<p class="sum">${esc(line)}</p>`).join("")
      + (text ? `<p>${text}</p>` : "") + `</div>`,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
  // A poison used on the targets: their Resist buttons (GAPS 283).
  if (poison?.mode === "target") await applyPoisonUse(actor, item, poison);
  // Then the expendable die: on a 1 one is used up (GAPS 260).
  if (consumable) await rollExpendable(actor, item);
  // The placed area stays on the map until it is sprung or removed.
  if (placed?.region) {
    canvas.tokens.setTargets([], { mode: "replace" });
    await keepArea(actor, item, placed.region, "success");
  }
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
