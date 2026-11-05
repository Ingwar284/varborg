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

import { collectEffects, rollEffects, withEffect } from "./rules/item-effects.mjs";

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
