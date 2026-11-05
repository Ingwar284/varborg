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

import { collectEffects, rollEffects, testOnly } from "./rules/item-effects.mjs";

/**
 * The item effects on one roll.
 * @param {Actor} actor
 * @param {object} context  { roll, ability?, against? } (see fitsRoll).
 * @returns {{auto: object[], optional: object[], reminders: object[]}}
 */
export function itemRollEffects(actor, context) {
  if (!actor?.items) return { auto: [], optional: [], reminders: [] };
  return rollEffects(collectEffects(actor.items), context);
}

/**
 * The item modifiers applied by themselves to a roll: entries for the
 * roll's modifier list, next to its conditions. conditionNotes and
 * totalModifiers (conditions) take them as they are.
 */
export function itemRollMods(actor, context) {
  return testOnly(itemRollEffects(actor, context).auto);
}

/** The item reminders for a roll's dialog, such as "Hawkeye: when you can see far". */
export function itemReminderNotes(actor, context) {
  const i18n = game.i18n;
  return itemRollEffects(actor, context).reminders.map(({ item, note }) => (note
    ? i18n.format("VARBORG.Effects.ReminderNote", { item, note })
    : i18n.format("VARBORG.Effects.ReminderPlain", { item })));
}
