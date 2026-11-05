/**
 * Item effects in Foundry (PLAN Milestone 9): reads an actor's items and
 * hands each roll the modifiers and reminders that fit it. The maths lives
 * in module/rules/item-effects.mjs.
 *
 * Roll kinds: "test" is every test made with the ability test dialog,
 * including the tests other features start (Panic, wounds, driving...).
 * Those also pass their own kind ("panic", "driving"), so an effect can
 * name either. A contested test is "contest" plus "test". Attacks,
 * defence, spellcasting and powers are their own kinds only. A gloom
 * ability's test is "gloomTest" plus "test" (its own test) or "defence"
 * (the usual Agility defence).
 */

import { collectEffects, rollEffects, withEffect, hookEffects, rollTwiceKeep, keptRoll } from "./rules/item-effects.mjs";
import { gainEmber } from "./pools.mjs";
import { isDead } from "./deaths-door.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * The item effects on one roll.
 * @param {Actor} actor
 * @param {object} context  { roll, ability?, against? } (see fitsRoll).
 * @returns {{auto: object[], optional: object[], reminders: object[]}}
 */
export function itemRollEffects(actor, context) {
  if (!actor?.items) return { auto: [], optional: [], reminders: [] };
  // The character's facts, for damage per wound (step 49e).
  const facts = { wounds: actor.system.wounds?.value ?? 0 };
  return rollEffects(collectEffects(actor.items), { facts, ...context });
}

/**
 * The item modifiers applied by themselves to a roll: entries for the
 * roll's modifier list, next to its conditions. conditionNotes and
 * totalModifiers (conditions) take them as they are.
 */
export function itemRollMods(actor, context) {
  return withEffect(itemRollEffects(actor, context).auto);
}

/** The item reminders for a roll's dialog, such as "Hawkeye: when you can see far". */
export function itemReminderNotes(actor, context) {
  const i18n = game.i18n;
  return itemRollEffects(actor, context).reminders.map(({ item, note }) => (note
    ? i18n.format("VARBORG.Effects.ReminderNote", { item, note })
    : i18n.format("VARBORG.Effects.ReminderPlain", { item })));
}

const OPTIONAL_TEMPLATE = "systems/var-borg/templates/dice/optional-effects.hbs";

/**
 * The item modifiers a roll offers as unticked boxes, for situations only
 * the Dark Master can judge (PLAN step 49d). Same shape as itemRollMods.
 */
export function itemOptionalMods(actor, context) {
  return withEffect(itemRollEffects(actor, context).optional);
}

/**
 * The boxes for a dialog, such as "Acrobat (on tests involving balance):
 * Boon", or "" when there are none. Box i is named "optionalEffect<i>".
 * @param {object[]} mods  From itemOptionalMods.
 * @returns {Promise<string>}  HTML for the dialog's template ({{{optionalEffects}}}).
 */
export async function optionalEffectsField(mods) {
  if (!mods?.length) return "";
  const i18n = game.i18n;
  const list = mods.map(mod => {
    const parts = [];
    if (mod.boon) parts.push(i18n.localize("VARBORG.Test.Boon"));
    if (mod.bane) parts.push(i18n.localize("VARBORG.Test.Bane"));
    if (mod.dr) parts.push(i18n.format("VARBORG.Condition.DR", { dr: mod.dr > 0 ? `+${mod.dr}` : `−${Math.abs(mod.dr)}` }));
    if (mod.damage) parts.push(i18n.format("VARBORG.Effects.DamagePart", { damage: mod.damage }));
    const name = mod.note ? i18n.format("VARBORG.Effects.ItemWithNote", { item: mod.item, note: mod.note }) : mod.item;
    return { label: i18n.format("VARBORG.Effects.OptionalLabel", { name, effect: parts.join(", ") }) };
  });
  return foundry.applications.handlebars.renderTemplate(OPTIONAL_TEMPLATE, { list });
}

/**
 * The offered modifiers whose boxes were ticked in the dialog. They join
 * the roll's modifier list like the automatic ones.
 * @param {object[]} mods  The list given to optionalEffectsField.
 * @param {object} data    The dialog's form data.
 */
export function tickedMods(mods, data) {
  return (mods ?? []).filter((_, index) => Boolean(data?.[`optionalEffect${index}`]));
}

/**
 * The hook effects of a character's items that act at an event (step 49f).
 * @param {Actor} actor
 * @param {string} event  One of HOOK_EVENTS.
 */
export function itemHooks(actor, event) {
  if (!actor?.items) return [];
  return hookEffects(collectEffects(actor.items), event, { hp: actor.system.hp?.value ?? 0, hpMax: actor.system.hp?.max ?? 0 });
}

/** Mark an item's limited use spent (once per day and so on). */
async function markUsed(actor, itemId) {
  const item = actor.items.get(itemId);
  if (item && !item.system.frequencyUsed) await item.update({ "system.frequencyUsed": true });
}

/**
 * Do one hook's or Use effect's action: heal, roll, add to the Ember
 * pool, gain a condition, or a reminder ("Remind only" hooks just give
 * their note). Shared by events (step 49f) and the Use button (step 49g).
 * @param {Actor} actor
 * @param {object} effect  A collected effect (collectEffects).
 * @returns {Promise<{lines: string[], rolls: Roll[], acted: boolean}>}
 *   acted: false for reminders and when nothing could be done.
 */
export async function doEffectAction(actor, effect) {
  const i18n = game.i18n;
  const item = effect.item;
  const note = effect.note || i18n.localize("VARBORG.Effects.SeeText");
  if (effect.mode === "optional" || effect.action === "reminder") {
    const key = effect.mode === "optional" ? "VARBORG.Effects.HookOptional" : "VARBORG.Effects.HookReminder";
    return { lines: [i18n.format(key, { item, note })], rolls: [], acted: false };
  }
  if (["heal", "roll", "gainEmber"].includes(effect.action)) {
    if (effect.action === "gainEmber" && !game.combat?.started) {
      return { lines: [i18n.format("VARBORG.Effects.HookEmberNoCombat", { item })], rolls: [], acted: false };
    }
    const roll = await new Roll(effect.amount || "0").evaluate();
    let line;
    if (effect.action === "heal") {
      const from = actor.system.hp.value;
      await actor.update({ "system.hp.value": from + roll.total });
      line = i18n.format("VARBORG.Effects.HookHeal", { item, name: actor.name, amount: roll.total, from, to: actor.system.hp.value });
    } else if (effect.action === "roll") {
      line = i18n.format("VARBORG.Effects.HookRoll", { item, total: roll.total, note: effect.note });
    } else {
      await gainEmber(roll.total, actor, item);
      line = i18n.format("VARBORG.Effects.HookEmber", { item, amount: roll.total });
    }
    return { lines: [line], rolls: [roll], acted: true };
  }
  if (effect.action === "addCondition" && effect.condition) {
    if (!actor.statuses.has(effect.condition)) await actor.toggleStatusEffect(effect.condition, { active: true });
    const condition = i18n.localize(`VARBORG.Condition.${effect.condition}`);
    return { lines: [i18n.format("VARBORG.Effects.HookCondition", { item, name: actor.name, condition })], rolls: [], acted: true };
  }
  return { lines: [], rolls: [], acted: false };
}

/**
 * Do what a character's hooks say at an event, and post one card with a
 * line each: heal, roll, add to the Ember pool, gain a condition, or a
 * reminder. "Remind only" hooks just post their note. Rolling twice is
 * done by the roll itself (rollTwiceFor). A dead character does nothing.
 * Called by the client that runs the event.
 * @param {Actor} actor
 * @param {string} event  One of HOOK_EVENTS.
 */
export async function runItemHooks(actor, event) {
  if (actor?.type !== "character" || isDead(actor)) return;
  const hooks = itemHooks(actor, event).filter(hook => hook.action !== "rollTwice");
  if (!hooks.length) return;
  const i18n = game.i18n;
  const lines = [];
  const rolls = [];
  for (const hook of hooks) {
    const done = await doEffectAction(actor, hook);
    lines.push(...done.lines);
    rolls.push(...done.rolls);
    if (hook.frequency && done.acted) {
      await markUsed(actor, hook.itemId);
      lines.push(i18n.format("VARBORG.Effects.HookUsed", { item: hook.item }));
    }
  }
  const title = i18n.format("VARBORG.Effects.HookTitle", { name: actor.name, item: [...new Set(hooks.map(hook => hook.item))].join(", ") });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content: `<div class="var-borg-card"><h3>${foundry.utils.escapeHTML(title)}</h3>`
      + lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("") + "</div>",
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
}

/**
 * Which of two rolls to keep, for initiative (a formula cannot ask):
 * "better", "worse" or null. Choosing counts as keeping the better.
 */
export function initiativeKeep(actor) {
  const keep = rollTwiceKeep(itemHooks(actor, "initiative"));
  return keep === "choose" ? "better" : keep;
}

/**
 * Roll a table twice when a character's hooks say so (Death's Door,
 * GAPS 192): keep the better, the worse, or ask the player. Items with a
 * limited use that counted are marked used.
 * @param {Actor} actor
 * @param {string} event    "deathsDoor".
 * @param {string} formula  The table's dice, such as "2d6".
 * @returns {Promise<{total: number, rolls: Roll[], line: string}|null>}  null: roll once as usual.
 */
export async function rollTwiceFor(actor, event, formula) {
  const hooks = itemHooks(actor, event).filter(hook => hook.action === "rollTwice" && hook.mode !== "optional");
  const keep = rollTwiceKeep(hooks);
  if (!keep) return null;
  const i18n = game.i18n;
  const first = await new Roll(formula).evaluate();
  const second = await new Roll(formula).evaluate();
  const items = [...new Set(hooks.map(hook => hook.item))].join(", ");
  let kept = keptRoll(first.total, second.total, keep);
  if (keep === "choose") {
    const picked = await DialogV2.wait({
      window: { title: i18n.format("VARBORG.Effects.ChooseTitle", { name: actor.name }) },
      content: `<p>${foundry.utils.escapeHTML(i18n.format("VARBORG.Effects.ChooseHint", { items }))}</p>`,
      buttons: [
        { action: "first", label: String(first.total), default: first.total >= second.total },
        { action: "second", label: String(second.total), default: second.total > first.total }
      ],
      rejectClose: false
    });
    // Closing the dialog keeps the better one.
    kept = picked === "first" ? first.total : picked === "second" ? second.total : Math.max(first.total, second.total);
  }
  for (const hook of hooks) if (hook.frequency) await markUsed(actor, hook.itemId);
  return {
    total: kept,
    rolls: [first, second],
    line: i18n.format("VARBORG.Effects.RolledTwice", { first: first.total, second: second.total, kept, items })
  };
}
