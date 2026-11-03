/**
 * Wounds and the Table of Agony in Foundry (rules 3.5 Health and wounds,
 * GAPS 13-15 and 87-90).
 *
 * When a character's HP drops from above 0 to 0, however it happens
 * (Take damage, persistent damage, the sheet or the token bar), the
 * character data (module/data/character.mjs) adds a wound and puts HP back
 * to max in the same change, or, at max wounds, leaves HP at 0: Death's
 * Door. Then this file posts a card.
 *
 * The wound card has a Toughness DR12 button for the character's owner.
 * On a Failure or Ruin a Table of Agony button follows, for the Dark
 * Master: it asks for the damage type (the weapon's or the persistent
 * damage's type is suggested) and rolls d10.
 *
 * A lasting injury, and Singed and Vomit ("bane on next action"), is an
 * Active Effect on the character with its result id as a status (so
 * "backBroken" counts in module/rules/conditions.mjs) and its details in
 * flags.var-borg.agony ({ result }). Singed and Vomit are used up by the
 * next test, like Rattled (module/panic.mjs useUpNextTest).
 * All the maths lives in module/rules/agony.mjs; this file only rolls and
 * shows.
 */

import {
  WOUND_ABILITY, WOUND_DR, AGONY_DICE, AGONY_TYPES, AGONY_RESULTS,
  rollsOnAgony, agonyResult
} from "./rules/agony.mjs";
import { rollAbilityTest } from "./dice/ability-test.mjs";
import { addPersistentDamage } from "./persistent.mjs";
import { enterDeathsDoor, killCharacter } from "./deaths-door.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const WOUND_TEMPLATE = "systems/var-borg/templates/chat/wound-card.hbs";
const AGONY_TEMPLATE = "systems/var-borg/templates/chat/agony-card.hbs";

/** The update option that carries the suggested damage type, such as { agonyType: "blunt" }. */
export const AGONY_TYPE_OPTION = "varBorgAgonyType";

/** The update option the character data sets when HP struck zero. */
export const WOUND_OPTION = "varBorgWound";

/** The icon of a lasting injury; Singed and Vomit have their own. */
const INJURY_ICON = "icons/svg/bones.svg";
const NEXT_ICONS = { singed: "icons/svg/explosion.svg", vomit: "icons/svg/poison.svg" };

/** "Back broken". */
export function agonyName(id) {
  return game.i18n.localize(`VARBORG.Agony.Result.${id}.name`);
}

/** Watch for wound and Table of Agony buttons on chat cards. */
export function registerAgony() {
  Hooks.on("renderChatMessageHTML", addAgonyCardListeners);
}

/**
 * The injury effects on an actor.
 * @returns {{id: string, result: string, effect: ActiveEffect}[]}
 */
export function injuryEffects(actor) {
  return (actor?.effects ?? [])
    .filter(effect => effect.getFlag(SYSTEM, "agony"))
    .map(effect => ({ id: effect.id, ...effect.getFlag(SYSTEM, "agony"), effect }));
}

/**
 * Post the card after HP struck zero, or at max wounds put the character
 * at Death's Door. Called by the character data on the client that made
 * the change.
 * @param {Actor} actor
 * @param {{wounded: boolean, wounds?: number, hp?: number, deathsDoor?: boolean, agonyType?: string|null}} wound
 */
export async function postWoundCard(actor, wound) {
  // At max wounds: Death's Door, with its own card (module/deaths-door.mjs).
  if (!wound.wounded) return enterDeathsDoor(actor);
  const i18n = game.i18n;
  const max = actor.system.wounds.max;
  const content = await renderTemplate(WOUND_TEMPLATE, {
    title: i18n.format("VARBORG.Agony.WoundedTitle", { name: actor.name }),
    lines: [
      i18n.format("VARBORG.Agony.GainsWound", { wounds: wound.wounds, max }),
      i18n.format("VARBORG.Agony.HpReturns", { hp: wound.hp })
    ],
    test: {
      actorUuid: actor.uuid,
      agonyType: wound.agonyType ?? "",
      label: i18n.format("VARBORG.Agony.TestButton", { dr: WOUND_DR })
    }
  });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}

/**
 * The wound test: Toughness, starting at DR12 (the Dark Master may change
 * it). On a Failure or Ruin, a card with the Table of Agony button.
 * @returns {Promise<boolean|null>}  Whether it rolls on the table, or null if the dialog was closed.
 */
async function woundTest(actor, agonyType) {
  const i18n = game.i18n;
  const result = await rollAbilityTest(actor, WOUND_ABILITY, {
    dr: WOUND_DR,
    purpose: i18n.localize("VARBORG.Agony.Purpose")
  });
  if (!result) return null;
  const rolls = rollsOnAgony(result.tier);
  const text = i18n.format(rolls ? "VARBORG.Agony.Cracks" : "VARBORG.Agony.ShrugsOff", { name: actor.name });
  const button = rolls
    ? `<button type="button" data-action="rollAgony" data-actor-uuid="${actor.uuid}" data-agony-type="${agonyType}">`
      + `<i class="fa-solid fa-bone"></i> ${i18n.localize("VARBORG.Agony.RollButton")}</button>`
      + `<p class="modifier">${i18n.localize("VARBORG.Agony.GmRolls")}</p>`
    : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${text}</p>${button}</div>`
  });
  return rolls;
}

/**
 * The Table of Agony button: the Dark Master picks the damage type (the
 * suggestion is selected) and rolls d10.
 * @returns {Promise<boolean>}  Whether it was rolled.
 */
async function askAndRollAgony(actor, suggested) {
  const i18n = game.i18n;
  const options = AGONY_TYPES.map(id => {
    const label = i18n.localize(`VARBORG.DamageType.${id}`);
    const selected = id === suggested ? " selected" : "";
    return `<option value="${id}"${selected}>${id === suggested ? i18n.format("VARBORG.Agony.Suggested", { type: label }) : label}</option>`;
  }).join("");
  const data = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Agony.DialogTitle", { name: actor.name }) },
    content: `<div class="form-group"><label>${i18n.localize("VARBORG.Agony.TypeLabel")}</label>`
      + `<select name="type">${options}</select></div>`
      + `<p class="hint">${i18n.localize(suggested ? "VARBORG.Agony.TypeHint" : "VARBORG.Agony.NoSuggestion")}</p>`,
    ok: { label: "VARBORG.Agony.Roll", icon: "fa-solid fa-dice-d10" },
    rejectClose: false
  });
  if (!data || !AGONY_TYPES.includes(data.type)) return false;
  await rollAgony(actor, data.type);
  return true;
}

/**
 * Roll d10 on one column of the table, apply the result and post its card.
 * @param {Actor} actor
 * @param {string} type  One of AGONY_TYPES.
 */
export async function rollAgony(actor, type) {
  const i18n = game.i18n;
  const roll = new Roll(AGONY_DICE);
  await roll.evaluate();
  const { id, severity } = agonyResult(type, roll.total);
  const lines = await applyAgonyResult(actor, id);
  const content = await renderTemplate(AGONY_TEMPLATE, {
    title: i18n.format("VARBORG.Agony.CardTitle", { name: actor.name }),
    rolled: i18n.format("VARBORG.Agony.Rolled", { type: i18n.localize(`VARBORG.DamageType.${type}`), roll: roll.total }),
    severity: i18n.localize(`VARBORG.Agony.Severity.${severity}`),
    result: agonyName(id),
    text: i18n.localize(`VARBORG.Agony.Result.${id}.text`),
    lines
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: i18n.localize("VARBORG.Agony.Title"),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice
  });
}

/**
 * Do what a result does: Prone, persistent damage, Fortune, an injury
 * effect, Death's Door or death. The rest is explained on the card
 * (GAPS 88).
 * @returns {Promise<string[]>}  What happened, for the card.
 */
async function applyAgonyResult(actor, id) {
  const i18n = game.i18n;
  const rules = AGONY_RESULTS[id];
  const lines = [];

  if (rules.prone) {
    if (!actor.statuses.has("prone")) await actor.toggleStatusEffect("prone", { active: true });
    lines.push(i18n.localize("VARBORG.Agony.Prone"));
  }
  if (rules.persistent) {
    const { type, formula } = rules.persistent;
    await addPersistentDamage(actor, type, formula);
    lines.push(i18n.format("VARBORG.Agony.Persistent", {
      type: i18n.localize(`VARBORG.Persistent.Type.${type}`), formula
    }));
  }
  if (rules.fortune) {
    const from = actor.system.fortune;
    await actor.update({ "system.fortune": from + rules.fortune });
    lines.push(i18n.format("VARBORG.Agony.Fortune", { from, to: from + rules.fortune }));
  }
  if (rules.next) {
    await createInjuryEffect(actor, id, NEXT_ICONS[id] ?? INJURY_ICON);
    lines.push(i18n.localize("VARBORG.Agony.NextTest"));
  }
  if (rules.lasting) {
    await createInjuryEffect(actor, id, INJURY_ICON);
    lines.push(i18n.localize("VARBORG.Agony.Lasting"));
    if (rules.reminder) lines.push(i18n.localize("VARBORG.Agony.ReminderOnly"));
  }
  // Wounds to max and HP to 0: the character data sends them to Death's Door (GAPS 95).
  if (rules.deathsDoor) {
    await actor.update({ "system.wounds.value": actor.system.wounds.max, "system.hp.value": 0 });
    lines.push(i18n.localize("VARBORG.Agony.ToDeathsDoor"));
  }
  if (rules.dies) {
    await killCharacter(actor, "agony");
    lines.push(i18n.localize("VARBORG.Agony.Dies"));
  }
  if (!Object.keys(rules).length) lines.push(i18n.localize("VARBORG.Agony.ByHand"));
  return lines;
}

/** Add an injury's effect. */
async function createInjuryEffect(actor, id, img) {
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: agonyName(id),
    img,
    statuses: [id],
    description: game.i18n.localize(`VARBORG.Agony.Result.${id}.text`),
    flags: { [SYSTEM]: { agony: { result: id } } }
  }]);
}

/**
 * Buttons on chat cards: the wound test (the character's owner, once per
 * wound card) and the Table of Agony (the Dark Master, once per card).
 */
function addAgonyCardListeners(message, html) {
  const test = html.querySelector("button[data-action='woundTest']");
  if (test) {
    const actor = fromUuidSync(test.dataset.actorUuid);
    if (!actor || actor.getFlag(SYSTEM, "woundTestedOn") === message.id) test.disabled = true;
    else test.addEventListener("click", async () => {
      const current = await fromUuid(test.dataset.actorUuid);
      if (!current?.isOwner) {
        ui.notifications.warn(game.i18n.format("VARBORG.Defence.NotYours", { name: current?.name ?? "" }));
        return;
      }
      test.disabled = true;
      await current.setFlag(SYSTEM, "woundTestedOn", message.id);
      // Dialog closed without rolling: the test can still be made.
      if (await woundTest(current, test.dataset.agonyType) === null) {
        await current.unsetFlag(SYSTEM, "woundTestedOn");
        test.disabled = false;
      }
    });
  }

  const agony = html.querySelector("button[data-action='rollAgony']");
  if (!agony) return;
  if (message.getFlag(SYSTEM, "agonyRolled")) {
    agony.disabled = true;
    return;
  }
  agony.addEventListener("click", async () => {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("VARBORG.Agony.GmOnly"));
      return;
    }
    const actor = await fromUuid(agony.dataset.actorUuid);
    if (!actor) return;
    agony.disabled = true;
    if (await askAndRollAgony(actor, agony.dataset.agonyType || null)) await message.setFlag(SYSTEM, "agonyRolled", true);
    else agony.disabled = false;
  });
}

/** The injury rows of a character's Conditions section, or null for a foe. */
export function sheetInjuries(actor) {
  if (actor.type !== "character") return null;
  return injuryEffects(actor).map(({ id, result, effect }) => ({
    id,
    img: effect.img,
    label: effect.name,
    text: game.i18n.localize(`VARBORG.Agony.Result.${result}.text`)
  }));
}

/** Each injury row's remove button. Called from activateConditionControls. */
export function activateInjuryControls(element, actor) {
  for (const button of element.querySelectorAll("[data-remove-injury]")) {
    button.addEventListener("click", () => actor.effects.get(button.dataset.removeInjury)?.delete());
  }
}
