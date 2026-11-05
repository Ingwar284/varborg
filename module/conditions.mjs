/**
 * Conditions in Foundry (rules 3.13): status effects on tokens and actors,
 * the Conditions list on the sheets, and the notes on dialogs and cards.
 * Persistent Damage has its own file (module/persistent.mjs) but is shown
 * in the same Conditions section.
 *
 * The maths lives in module/rules/conditions.mjs; this file only connects
 * it to Foundry. Fatigued has a level, kept in system.fatigue and shown on
 * the sheet; the token icon follows it (on when the level is 1 or more).
 * Lasting Panic results (module/panic.mjs) and injuries from the Table of
 * Agony (module/agony.mjs) are listed in the same section on a character
 * sheet, and so is Death's Door (module/deaths-door.mjs): the Dark Vessel
 * count, where the character stands and lost body parts.
 */

import { CONDITIONS, FOE_LINE_CONDITIONS, reminders, lossOnArrival } from "./rules/conditions.mjs";
import { signed } from "./dice/ability-test.mjs";
import { sheetPersistent, activatePersistentControls } from "./persistent.mjs";
import { PANIC_EFFECTS } from "./rules/panic.mjs";
import { panicName, sheetPanic, activatePanicControls } from "./panic.mjs";
import { AGONY_EFFECTS } from "./rules/agony.mjs";
import { agonyName, sheetInjuries, activateInjuryControls } from "./agony.mjs";
import { sheetDeathsDoor, activateDeathsDoorControls } from "./deaths-door.mjs";
import { conditionTimer, timerText, askConditionTimer } from "./timers.mjs";
import { isStarving } from "./rules/days.mjs";

const SYSTEM = "var-borg";

/** The token icon for each condition (Foundry's own icons). */
const ICONS = {
  blinded: "icons/svg/blind.svg",
  deafened: "icons/svg/deaf.svg",
  charmed: "icons/svg/aura.svg",
  fatigued: "icons/svg/degen.svg",
  frightened: "icons/svg/terror.svg",
  stupefied: "icons/svg/daze.svg",
  restrained: "icons/svg/net.svg",
  prone: "icons/svg/falling.svg",
  quickened: "icons/svg/upgrade.svg",
  silenced: "icons/svg/silenced.svg",
  slowed: "icons/svg/downgrade.svg",
  deathsDoor: "icons/svg/unconscious.svg",
  darkVessel: "icons/svg/cowled.svg",
  infected: "icons/svg/biohazard.svg",
  doomed: "icons/svg/skull.svg",
  encumbered: "icons/svg/anchor.svg"
};

/**
 * Replace Foundry's status effects with the conditions of rules 3.13, plus
 * Foundry's own "defeated" mark (used when a foe falls, GAPS 71). Blinded
 * also blinds the token's vision.
 */
export function registerConditions() {
  const defeated = CONFIG.statusEffects.find(effect => effect.id === CONFIG.specialStatusEffects.DEFEATED);
  CONFIG.statusEffects = [
    ...CONDITIONS.map(id => ({ id, name: `VARBORG.Condition.${id}`, img: ICONS[id] })),
    ...(defeated ? [defeated] : [])
  ];
  CONFIG.specialStatusEffects.BLIND = "blinded";

  Hooks.on("updateActor", syncFatigueIcon);
  Hooks.on("createActiveEffect", onConditionAdded);
  Hooks.on("deleteActiveEffect", onConditionRemoved);
  foundry.applications.handlebars.loadTemplates(["systems/var-borg/templates/actor/conditions.hbs"]);
}

/** The conditions an actor has, and its fatigue level, for the rules. */
export function conditionsOf(actor) {
  return { conditions: actor?.statuses ?? new Set(), fatigue: actor?.system.fatigue ?? 0 };
}

/** The name of a condition, a lasting Panic result such as "Sluggish", or an injury such as "Back broken". */
export function statusName(id) {
  if (PANIC_EFFECTS.includes(id)) return panicName(id);
  if (AGONY_EFFECTS.includes(id)) return agonyName(id);
  return game.i18n.localize(`VARBORG.Condition.${id}`);
}

/** "Prone", or "Fatigued 2" with its level. */
function conditionLabel(mod) {
  const name = statusName(mod.condition);
  return mod.level ? game.i18n.format("VARBORG.Condition.WithLevel", { name, level: mod.level }) : name;
}

/**
 * One line per modifier, such as "Prone: +2 DR" or, for the other side,
 * "Ash-Choked Bellman is Prone: −2 DR".
 * @param {object[]} mods  From the rules (attackerConditions and so on).
 * @param {string} [name]  The other side's name, when the modifiers are theirs.
 */
export function conditionNotes(mods, name = null) {
  const i18n = game.i18n;
  return mods.map(mod => {
    // An item effect (PLAN step 49c) names its item, and can give Boon or
    // Bane and a DR change at once.
    if (mod.item) return itemNote(mod, name);
    const effect = mod.dr !== undefined
      ? i18n.format("VARBORG.Condition.DR", { dr: signed(mod.dr) })
      : i18n.localize(mod.boon ? "VARBORG.Test.Boon" : "VARBORG.Test.Bane");
    const condition = conditionLabel(mod);
    return name
      ? i18n.format("VARBORG.Condition.TheirNote", { name, condition, effect })
      : i18n.format("VARBORG.Condition.Note", { condition, effect });
  });
}

/**
 * An item effect's line, such as "Fey-World Glimmer: −2 DR, added for you"
 * or "Iron will (to resist Charmed): Boon, added for you".
 */
function itemNote(mod, name) {
  const i18n = game.i18n;
  const parts = [];
  if (mod.boon) parts.push(i18n.localize("VARBORG.Test.Boon"));
  if (mod.bane) parts.push(i18n.localize("VARBORG.Test.Bane"));
  if (mod.dr) parts.push(i18n.format("VARBORG.Condition.DR", { dr: signed(mod.dr) }));
  const condition = mod.note ? i18n.format("VARBORG.Effects.ItemWithNote", { item: mod.item, note: mod.note }) : mod.item;
  const effect = parts.join(", ");
  return name
    ? i18n.format("VARBORG.Condition.TheirNote", { name, condition, effect })
    : i18n.format("VARBORG.Condition.Note", { condition, effect });
}

/** The situational reminders for this kind of roll (GAPS 75). */
export function reminderNotes(actor, where) {
  return reminders(actor?.statuses ?? [], where)
    .map(condition => game.i18n.localize(`VARBORG.Condition.Reminder.${where}.${condition}`));
}

/**
 * The Conditions section of a sheet: each condition the actor has with its
 * rules text (a foe's Foe line where it has one), and the ones it can get.
 */
export function sheetConditions(actor) {
  const i18n = game.i18n;
  const isFoe = actor.type === "foe";
  const active = CONDITIONS.filter(id => actor.statuses.has(id));
  return {
    fatigue: actor.system.fatigue,
    // Characters only: days without food (rules 3.16, module/days.mjs).
    food: actor.type !== "character" ? null : { days: actor.system.daysWithoutFood, starving: isStarving(actor.system.daysWithoutFood) },
    persistent: sheetPersistent(actor),
    panic: sheetPanic(actor),
    injuries: sheetInjuries(actor),
    deathsDoor: sheetDeathsDoor(actor),
    list: active.map(id => ({
      id,
      img: ICONS[id],
      label: id === "fatigued"
        ? i18n.format("VARBORG.Condition.WithLevel", { name: i18n.localize("VARBORG.Condition.fatigued"), level: Math.max(1, actor.system.fatigue) })
        : i18n.localize(`VARBORG.Condition.${id}`),
      text: i18n.localize(`VARBORG.Condition.${isFoe && FOE_LINE_CONDITIONS.includes(id) ? "FoeText" : "Text"}.${id}`),
      // Fatigued is ended by levels, not time; the rest can have a timer (GAPS 129).
      canTime: id !== "fatigued",
      timer: timerText(conditionTimer(actor, id))
    })),
    choices: CONDITIONS.filter(id => !actor.statuses.has(id))
      .map(id => ({ id, label: i18n.localize(`VARBORG.Condition.${id}`) }))
  };
}

/**
 * The sheet's condition controls: the "Add a condition" menu, each
 * condition's timer and remove buttons, and the persistent damage, Panic, injury and
 * Death's Door controls.
 * Called from the sheet's _onRender.
 */
export function activateConditionControls(element, actor) {
  element.querySelector("select[data-add-condition]")?.addEventListener("change", event => {
    const id = event.currentTarget.value;
    if (id) actor.toggleStatusEffect(id, { active: true });
  });
  for (const button of element.querySelectorAll("[data-remove-condition]")) {
    button.addEventListener("click", () => actor.toggleStatusEffect(button.dataset.removeCondition, { active: false }));
  }
  for (const button of element.querySelectorAll("[data-time-condition]")) {
    button.addEventListener("click", () => askConditionTimer(actor, button.dataset.timeCondition));
  }
  activatePersistentControls(element, actor);
  activatePanicControls(element, actor);
  activateInjuryControls(element, actor);
  activateDeathsDoorControls(element, actor);
}

/** When the fatigue level changes, the Fatigued icon follows it. */
function syncFatigueIcon(actor, changes, options, userId) {
  if (userId !== game.user.id || !foundry.utils.hasProperty(changes, "system.fatigue")) return;
  const active = actor.system.fatigue > 0;
  if (actor.statuses.has("fatigued") !== active) actor.toggleStatusEffect("fatigued", { active });
}

/**
 * A condition arrives. Fatigued from the token starts at level 1.
 * Stupefied (no reaction), and Death's Door and Faint (cannot act) take
 * away what is left of this turn in a running combat.
 */
async function onConditionAdded(effect, options, userId) {
  const actor = effect.parent;
  if (userId !== game.user.id || !(actor instanceof foundry.documents.Actor)) return;
  if (effect.statuses.has("fatigued") && !(actor.system.fatigue > 0)) await actor.update({ "system.fatigue": 1 });

  for (const condition of effect.statuses) {
    const loss = lossOnArrival(condition);
    if (!Object.keys(loss).length || !game.combat?.started) continue;
    for (const combatant of game.combat.getCombatantsByActor(actor)) {
      await combatant.update({ [`flags.${SYSTEM}`]: loss });
    }
  }
}

/** Fatigued removed from the token: the level goes back to 0. */
async function onConditionRemoved(effect, options, userId) {
  const actor = effect.parent;
  if (userId !== game.user.id || !(actor instanceof foundry.documents.Actor)) return;
  if (effect.statuses.has("fatigued") && actor.system.fatigue > 0) await actor.update({ "system.fatigue": 0 });
}
