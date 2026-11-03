/**
 * Conditions in Foundry (rules 3.13): status effects on tokens and actors,
 * the Conditions list on the sheets, and the notes on dialogs and cards.
 *
 * The maths lives in module/rules/conditions.mjs; this file only connects
 * it to Foundry. Fatigued has a level, kept in system.fatigue and shown on
 * the sheet; the token icon follows it (on when the level is 1 or more).
 */

import { CONDITIONS, FOE_LINE_CONDITIONS, reminders, lossOnArrival } from "./rules/conditions.mjs";
import { signed } from "./dice/ability-test.mjs";

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

/** "Prone", or "Fatigued 2" with its level. */
function conditionLabel(mod) {
  const name = game.i18n.localize(`VARBORG.Condition.${mod.condition}`);
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
    const effect = mod.dr !== undefined
      ? i18n.format("VARBORG.Condition.DR", { dr: signed(mod.dr) })
      : i18n.localize(mod.boon ? "VARBORG.Test.Boon" : "VARBORG.Test.Bane");
    const condition = conditionLabel(mod);
    return name
      ? i18n.format("VARBORG.Condition.TheirNote", { name, condition, effect })
      : i18n.format("VARBORG.Condition.Note", { condition, effect });
  });
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
    list: active.map(id => ({
      id,
      img: ICONS[id],
      label: id === "fatigued"
        ? i18n.format("VARBORG.Condition.WithLevel", { name: i18n.localize("VARBORG.Condition.fatigued"), level: Math.max(1, actor.system.fatigue) })
        : i18n.localize(`VARBORG.Condition.${id}`),
      text: i18n.localize(`VARBORG.Condition.${isFoe && FOE_LINE_CONDITIONS.includes(id) ? "FoeText" : "Text"}.${id}`)
    })),
    choices: CONDITIONS.filter(id => !actor.statuses.has(id))
      .map(id => ({ id, label: i18n.localize(`VARBORG.Condition.${id}`) }))
  };
}

/**
 * The sheet's condition controls: the "Add a condition" menu and each
 * condition's remove button. Called from the sheet's _onRender.
 */
export function activateConditionControls(element, actor) {
  element.querySelector("select[data-add-condition]")?.addEventListener("change", event => {
    const id = event.currentTarget.value;
    if (id) actor.toggleStatusEffect(id, { active: true });
  });
  for (const button of element.querySelectorAll("[data-remove-condition]")) {
    button.addEventListener("click", () => actor.toggleStatusEffect(button.dataset.removeCondition, { active: false }));
  }
}

/** When the fatigue level changes, the Fatigued icon follows it. */
function syncFatigueIcon(actor, changes, options, userId) {
  if (userId !== game.user.id || !foundry.utils.hasProperty(changes, "system.fatigue")) return;
  const active = actor.system.fatigue > 0;
  if (actor.statuses.has("fatigued") !== active) actor.toggleStatusEffect("fatigued", { active });
}

/**
 * A condition arrives. Fatigued from the token starts at level 1.
 * Stupefied (no reaction) and Death's Door (cannot act) take away what is
 * left of this turn in a running combat.
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
