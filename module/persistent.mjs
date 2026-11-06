/**
 * Persistent Damage in Foundry (rules 3.13, GAPS 19, 37 and 76-78).
 *
 * Each persistent damage is its own Active Effect on the actor, with its
 * type and damage in flags.var-borg.persistent ({ type, formula }), so a
 * character can burn and be poisoned at once. When a second one of the
 * same type arrives, only the stronger stays (GAPS 76).
 *
 * At the end of the actor's turn in combat (or when the Dark Master presses
 * Tick on the sheet, GAPS 78) each one deals its damage straight to HP;
 * armour does not soak it (GAPS 77). A character then gets a Toughness DR12
 * button on the card. For a foe the d20 is rolled at once; a mook's never
 * ends.
 * It can be added from the sheet's Conditions section, or from the token's
 * status effects (right-click the token): the Persistent damage icon there
 * asks for the type and damage instead of switching on and off.
 * All the maths lives in module/rules/persistent.mjs; this file only rolls
 * and shows.
 */

import {
  PERSISTENT_TYPES, PERSISTENT_DR, normaliseDamage, strongestPerType,
  testEndsPersistent, foeRollEndsPersistent
} from "./rules/persistent.mjs";
import { hpAfterDamage } from "./rules/health.mjs";
import { killedByDamage } from "./deaths-door.mjs";
import { rollAbilityTest } from "./dice/ability-test.mjs";
import { markDefeated } from "./dice/morale.mjs";
import { agonyTypeForPersistent } from "./rules/agony.mjs";
import { AGONY_TYPE_OPTION } from "./agony.mjs";
import { rollResists, resistLines } from "./effects.mjs";
import { resistedDamage } from "./rules/item-effects.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/persistent-card.hbs";
const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/persistent-dialog.hbs";

/** The status every persistent damage effect carries, so it shows on the token. */
export const PERSISTENT_STATUS = "persistentDamage";

/** The token icon for each type (Foundry's own icons). */
export const PERSISTENT_ICONS = {
  fire: "icons/svg/fire.svg",
  bleeding: "icons/svg/blood.svg",
  acid: "icons/svg/acid.svg",
  poison: "icons/svg/poison.svg"
};

/**
 * Add a Persistent damage icon to the token's status effects, and watch for
 * new persistent damage and for test buttons on chat cards. Called after
 * registerConditions, which sets up the rest of the list.
 */
export function registerPersistentDamage() {
  CONFIG.statusEffects.push({ id: PERSISTENT_STATUS, name: "VARBORG.Condition.persistentDamage", img: PERSISTENT_ICONS.fire });
  Hooks.on("createActiveEffect", onPersistentAdded);
  Hooks.on("renderChatMessageHTML", addPersistentCardListeners);
}

/** "Persistent fire damage (d4)". */
function persistentName(type, formula) {
  return game.i18n.format("VARBORG.Persistent.Name", {
    type: game.i18n.localize(`VARBORG.Persistent.Type.${type}`).toLowerCase(), formula
  });
}

/**
 * The persistent damage effects on an actor.
 * @returns {{id: string, type: string, formula: string, effect: ActiveEffect}[]}
 */
export function persistentEffects(actor) {
  return (actor?.effects ?? [])
    .filter(effect => effect.getFlag(SYSTEM, "persistent"))
    .map(effect => ({ id: effect.id, ...effect.getFlag(SYSTEM, "persistent"), effect }));
}

/**
 * Give an actor persistent damage, such as d4 fire.
 * @param {Actor} actor
 * @param {string} type     One of PERSISTENT_TYPES.
 * @param {string} formula  "d4", "2d4", "7" and so on.
 * @returns {Promise<boolean>}  false (with a warning) if the formula cannot be read.
 */
export async function addPersistentDamage(actor, type, formula) {
  const damage = normaliseDamage(formula);
  if (!damage || !PERSISTENT_TYPES.includes(type)) {
    ui.notifications.warn(game.i18n.localize("VARBORG.Persistent.BadFormula"));
    return false;
  }
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: persistentName(type, damage),
    img: PERSISTENT_ICONS[type],
    statuses: [PERSISTENT_STATUS],
    flags: { [SYSTEM]: { persistent: { type, formula: damage } } }
  }]);
  return true;
}

/**
 * Ask for a type and damage, then add the persistent damage. Used by the
 * token's Persistent damage icon (see VarBorgActor.toggleStatusEffect).
 * The ones the actor already has are listed; they are removed on the sheet.
 * @param {Actor} actor
 */
export async function askPersistentDamage(actor) {
  const i18n = game.i18n;
  const content = await renderTemplate(DIALOG_TEMPLATE, {
    types: PERSISTENT_TYPES.map(id => ({ id, label: i18n.localize(`VARBORG.Persistent.Type.${id}`) })),
    current: persistentEffects(actor).map(({ effect }) => i18n.format("VARBORG.Persistent.Has", { name: effect.name }))
  });
  const data = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Persistent.DialogTitle", { name: actor.name }) },
    content,
    ok: { label: "VARBORG.Persistent.Add", icon: "fa-solid fa-fire" },
    rejectClose: false
  });
  if (data) await addPersistentDamage(actor, data.type, data.formula);
}

/**
 * A second persistent damage of the same type: only the stronger stays,
 * the weaker is removed (GAPS 19, 37, 76).
 */
async function onPersistentAdded(effect, options, userId) {
  const actor = effect.parent;
  if (userId !== game.user.id || !(actor instanceof foundry.documents.Actor)) return;
  if (!effect.getFlag(SYSTEM, "persistent")) return;
  await removeWeaker(actor);
}

/** Remove every persistent damage that a stronger one of its type outdoes. */
async function removeWeaker(actor) {
  const effects = persistentEffects(actor);
  const { remove } = strongestPerType(effects);
  if (!remove.length) return;
  const names = remove.map(id => actor.effects.get(id)?.name).filter(Boolean);
  await actor.deleteEmbeddedDocuments("ActiveEffect", remove);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${game.i18n.format("VARBORG.Persistent.WeakerRemoved", {
      name: actor.name, removed: names.join(", ")
    })}</p></div>`
  });
}

/**
 * The actor takes its persistent damage: at the end of its turn, or when
 * the Dark Master presses Tick. One card per effect.
 * @param {Actor} actor
 */
export async function tickPersistentDamage(actor) {
  await removeWeaker(actor);
  const effects = persistentEffects(actor);
  for (const { type, formula, effect } of effects) {
    await tickOne(actor, type, formula, effect);
  }
  if (effects.length && actor.type === "foe" && actor.system.hp.value === 0) await markDefeated(actor);
}

/** One effect deals its damage, and for a foe the d20 says whether it ends. */
async function tickOne(actor, type, formula, effect) {
  const i18n = game.i18n;
  const damageRoll = new Roll(formula);
  await damageRoll.evaluate();
  const rolls = [damageRoll];
  // Resists by damage type (step 50b3b): fire halved by Tempered by the Forge.
  const resist = await rollResists(actor, type, null, { persistent: true });
  rolls.push(...resist.rolls);
  const resisted = resist.kept.items.length ? resistedDamage(damageRoll.total, resist.kept.items, resist.kept.totals) : damageRoll.total;
  const resistText = resistLines(resist.kept);
  const damage = resisted;
  // At Death's Door any damage kills (module/deaths-door.mjs).
  if (await killedByDamage(actor, damage)) return;
  const from = actor.system.hp.value;
  const to = hpAfterDamage(from, damage);
  // At 0 HP a character gains a wound; fire and bleeding suggest their column of the Table of Agony.
  await actor.update({ "system.hp.value": to }, { [AGONY_TYPE_OPTION]: agonyTypeForPersistent(type) });

  let foeLine = null;
  let ends = false;
  const isFoe = actor.type === "foe";
  if (isFoe && actor.system.mook) {
    foeLine = i18n.localize("VARBORG.Persistent.MookFails");
  } else if (isFoe) {
    const d20 = new Roll("1d20");
    await d20.evaluate();
    rolls.push(d20);
    ends = foeRollEndsPersistent(d20.total);
    foeLine = i18n.format(ends ? "VARBORG.Persistent.FoeEnds" : "VARBORG.Persistent.FoeGoesOn", { roll: d20.total });
  }
  if (ends) await effect.delete();

  const content = await renderTemplate(CARD_TEMPLATE, {
    title: effect.name,
    damage: i18n.format("VARBORG.Persistent.Damage", { formula, damage }),
    resistLines: resistText,
    hp: i18n.format("VARBORG.Persistent.Hp", { from, to, max: actor.system.hp.max }),
    zeroHp: to === 0 && !isFoe ? i18n.localize("VARBORG.Defence.ZeroHp") : null,
    foeLine,
    test: isFoe ? null : {
      effectUuid: effect.uuid,
      label: i18n.format("VARBORG.Persistent.TestButton", { dr: PERSISTENT_DR })
    }
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: effect.name,
    content,
    rolls,
    sound: CONFIG.sounds.dice
  });
}

/**
 * A character's test to end one persistent damage: Toughness, starting at
 * DR12 (the Dark Master may change it). On a Success or Triumph it ends.
 * @param {ActiveEffect} effect
 * @returns {Promise<boolean|null>}  Whether it ended, or null if the dialog was closed.
 */
async function testToEnd(effect) {
  const actor = effect.parent;
  const result = await rollAbilityTest(actor, "toughness", {
    dr: PERSISTENT_DR,
    purpose: game.i18n.format("VARBORG.Persistent.Purpose", { name: effect.name })
  });
  if (!result) return null;
  const ends = testEndsPersistent(result.tier);
  const name = effect.name;
  if (ends) await effect.delete();
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${game.i18n.format(ends ? "VARBORG.Persistent.Ends" : "VARBORG.Persistent.GoesOn", { name })}</p></div>`
  });
  return ends;
}

/**
 * The Toughness button on a persistent damage card. One test per tick: the
 * effect remembers which card it was tested from. Only the character's
 * owner can press it.
 */
function addPersistentCardListeners(message, html) {
  const button = html.querySelector("button[data-action='persistentTest']");
  if (!button) return;
  const effect = fromUuidSync(button.dataset.effectUuid);
  if (!effect || effect.getFlag(SYSTEM, "testedOn") === message.id) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", async () => {
    const current = await fromUuid(button.dataset.effectUuid);
    if (!current) {
      ui.notifications.warn(game.i18n.localize("VARBORG.Persistent.AlreadyEnded"));
      button.disabled = true;
      return;
    }
    if (!current.parent?.isOwner) {
      ui.notifications.warn(game.i18n.format("VARBORG.Defence.NotYours", { name: current.parent?.name ?? "" }));
      return;
    }
    button.disabled = true;
    await current.setFlag(SYSTEM, "testedOn", message.id);
    const ended = await testToEnd(current);
    // Dialog closed without rolling: the test can still be made.
    if (ended === null) {
      await current.unsetFlag(SYSTEM, "testedOn");
      button.disabled = false;
    }
  });
}

/** The persistent damage rows of a sheet's Conditions section. */
export function sheetPersistent(actor) {
  const i18n = game.i18n;
  const text = i18n.localize(`VARBORG.Condition.${actor.type === "foe" ? "FoeText" : "Text"}.persistentDamage`);
  return {
    list: persistentEffects(actor).map(({ id, effect }) => ({ id, img: effect.img, label: effect.name, text })),
    types: PERSISTENT_TYPES.map(id => ({ id, label: i18n.localize(`VARBORG.Persistent.Type.${id}`) })),
    canTick: game.user.isGM
  };
}

/**
 * The sheet's persistent damage controls: Add, each row's remove button,
 * and the Dark Master's Tick button. Called from activateConditionControls.
 */
export function activatePersistentControls(element, actor) {
  const add = element.querySelector("[data-add-persistent]");
  add?.addEventListener("click", () => {
    const type = element.querySelector("select[data-persistent-type]")?.value;
    const formula = element.querySelector("input[data-persistent-formula]")?.value;
    addPersistentDamage(actor, type, formula);
  });
  for (const button of element.querySelectorAll("[data-remove-persistent]")) {
    button.addEventListener("click", () => actor.effects.get(button.dataset.removePersistent)?.delete());
  }
  element.querySelector("[data-tick-persistent]")?.addEventListener("click", () => tickPersistentDamage(actor));
}
