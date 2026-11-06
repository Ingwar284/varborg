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

import {
  collectEffects, rollEffects, withEffect, hookEffects, rollTwiceKeep, keptRoll, withWeaponStats
} from "./rules/item-effects.mjs";
import { gainEmber } from "./pools.mjs";
import { isDead } from "./deaths-door.mjs";

const { DialogV2 } = foundry.applications.api;

/** The Unarmed weapon's id in the weapons compendium. */
const UNARMED_ID = "vbWeap0010000000";

/**
 * The item effects on one roll.
 * @param {Actor} actor
 * @param {object} context  { roll, ability?, against? } (see fitsRoll).
 * @returns {{auto: object[], optional: object[], reminders: object[]}}
 */
export function itemRollEffects(actor, context) {
  if (!actor?.items) return { auto: [], optional: [], reminders: [] };
  // The character's facts, for damage per wound (step 49e).
  // Whether a combat is running, for "non-combat tests" (GAPS 194).
  const facts = { wounds: actor.system.wounds?.value ?? 0, inCombat: Boolean(game.combat?.started) };
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

/**
 * Whether a weapon item is the Unarmed weapon (rules 4.1), by its
 * compendium source or its name.
 */
export function isUnarmed(item) {
  const source = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? "";
  if (source.endsWith(UNARMED_ID)) return true;
  const name = item?.name?.trim().toLowerCase();
  return name === "unarmed" || name === game.i18n.localize("VARBORG.Power.Bare.unarmed").toLowerCase();
}

/**
 * A weapon's numbers after its owner's feats (step 50a3): Brawler's
 * unarmed die, Long shot's ranges, Quick reload's actions.
 * @param {Item} item  A weapon.
 * @returns {object}  A copy of its system data, or the data itself.
 */
export function effectiveWeapon(item) {
  const bonuses = item.actor?.type === "character" ? item.actor.system.statBonuses : null;
  if (!bonuses) return item.system;
  return withWeaponStats(item.system, bonuses, isUnarmed(item));
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
  // "Remind only" Fortune: a button for the Dark Master (Doomsworn, GAPS 196).
  if (effect.mode === "optional" && effect.action === "gainFortune") {
    return {
      lines: [i18n.format("VARBORG.Effects.HookOptional", { item, note })],
      rolls: [],
      acted: false,
      button: { item, amount: effect.amount || "1" }
    };
  }
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
  if (effect.action === "gainFortune") {
    const roll = await new Roll(effect.amount || "1").evaluate();
    const from = actor.system.fortune ?? 0;
    await actor.update({ "system.fortune": from + roll.total });
    return {
      lines: [i18n.format("VARBORG.Effects.HookFortune", { item, name: actor.name, amount: roll.total, from, to: from + roll.total })],
      rolls: roll.isDeterministic ? [] : [roll],
      acted: true
    };
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
  // Rolling twice is done by the roll; Steady nerves by the Panic card.
  const hooks = itemHooks(actor, event).filter(hook => !["rollTwice", "steadyNerves"].includes(hook.action));
  if (!hooks.length) return;
  const i18n = game.i18n;
  const lines = [];
  const rolls = [];
  const buttons = [];
  for (const hook of hooks) {
    const done = await doEffectAction(actor, hook);
    lines.push(...done.lines);
    rolls.push(...done.rolls);
    if (done.button) buttons.push(done.button);
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
      + lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("")
      + buttons.map(button => fortuneButton(actor, button)).join("") + "</div>",
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
}

/** A Dark Master's "+1 Fortune (Doomsworn)" button on a hook card. */
function fortuneButton(actor, { item, amount }) {
  const label = game.i18n.format("VARBORG.Effects.FortuneButton", { amount, item });
  return `<button type="button" class="text-button" data-action="effectFortune" data-actor-uuid="${actor.uuid}"`
    + ` data-amount="${foundry.utils.escapeHTML(amount)}" data-item="${foundry.utils.escapeHTML(item)}">`
    + `<i class="fa-solid fa-clover"></i> ${foundry.utils.escapeHTML(label)}</button>`;
}

/** Watch the Fortune buttons on hook cards (step 50a2). */
export function registerEffectButtons() {
  Hooks.on("renderChatMessageHTML", addFortuneButtonListeners);
}

/** The Dark Master presses a Fortune button: the character gains it, once. */
function addFortuneButtonListeners(message, html) {
  const button = html.querySelector("button[data-action='effectFortune']");
  if (!button) return;
  if (!game.user.isGM || message.getFlag("var-borg", "fortuneGiven")) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    const actor = await fromUuid(button.dataset.actorUuid);
    if (!actor) return;
    await message.setFlag("var-borg", "fortuneGiven", true);
    const done = await doEffectAction(actor, { action: "gainFortune", amount: button.dataset.amount, item: button.dataset.item, mode: "auto" });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="var-borg-card">${done.lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("")}</div>`,
      rolls: done.rolls
    });
  });
}

/**
 * The character would die (step 50a2). Harkin's Reprieve stops it: the
 * scene fades to black, HP goes to its maximum and wounds to their
 * maximum − 1, the hours are rolled and the wake-up table drawn
 * (GAPS 195). Otherwise "when you would die" reminders (Diehard) are
 * given as lines for the death card.
 * @param {Actor} actor
 * @returns {Promise<{saved: boolean, lines: string[], rolls: Roll[]}>}
 */
export async function escapeDeath(actor) {
  const i18n = game.i18n;
  const hooks = itemHooks(actor, "death");
  const reprieve = hooks.find(hook => hook.action === "reprieve" && hook.mode !== "optional");
  if (!reprieve) {
    const lines = [];
    for (const hook of hooks) lines.push(...(await doEffectAction(actor, { ...hook, action: "reminder" })).lines);
    return { saved: false, lines, rolls: [] };
  }
  for (const status of ["deathsDoor", "darkVessel"]) {
    if (actor.statuses.has(status)) await actor.toggleStatusEffect(status, { active: false });
  }
  const wounds = Math.max(0, actor.system.wounds.max - 1);
  await actor.update({ "system.hp.value": actor.system.hp.max, "system.wounds.value": wounds });
  const hours = await new Roll(HARKIN_HOURS).evaluate();
  const table = await fromUuid(HARKIN_TABLE).catch(() => null);
  if (table) await table.draw({ displayChat: true });
  return {
    saved: true,
    rolls: [hours],
    lines: [
      i18n.format("VARBORG.Effects.Reprieve", { item: reprieve.item, name: actor.name, hours: hours.total }),
      i18n.format("VARBORG.Effects.ReprieveWake", { hp: actor.system.hp.value, wounds, max: actor.system.wounds.max }),
      i18n.localize(table ? "VARBORG.Effects.ReprieveTable" : "VARBORG.Effects.ReprieveNoTable")
    ]
  };
}

/** Harkin's Reprieve: "You wake d6 hours later". */
const HARKIN_HOURS = "1d6";

/** The "Harkin's Reprieve: you wake…" table (content/tables). */
const HARKIN_TABLE = "Compendium.var-borg.tables.RollTable.vbTableHarkin000";

/**
 * A Table of Agony result would kill the character (step 50a2): the item
 * that sends them to Death's Door instead (Hard to Kill), or null.
 * @param {Actor} actor
 * @returns {object|null}  The hook effect.
 */
export function agonyDeathsDoorInstead(actor) {
  return itemHooks(actor, "agonyDeath").find(hook => hook.action === "deathsDoorInstead" && hook.mode !== "optional") ?? null;
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
