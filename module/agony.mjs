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
 * an injury-type effect ({ result } in its system data). Singed and Vomit are used up by the
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
import { runItemHooks, agonyDeathsDoorInstead } from "./effects.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";
import { postSmallCard } from "./chat-card.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const WOUND_TEMPLATE = "systems/var-borg/templates/chat/wound-card.hbs";
const AGONY_TEMPLATE = "systems/var-borg/templates/chat/agony-card.hbs";

/** The update option that carries the suggested damage type, the Table of Agony column such as "blunt". */
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
    .filter(effect => effect.type === "injury")
    .map(effect => ({ id: effect.id, result: effect.system.result, effect }));
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
  // Item effects when a wound is gained (step 49f).
  await runItemHooks(actor, "wound");
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
 * Spending life force (rules 3.11): the caster has already taken the
 * wounds; HP does not change. One card per wound, each with its own
 * Toughness test, as for a wound gained at 0 HP.
 * @param {Actor} actor
 * @param {number} before  Wounds before the life force was spent.
 * @param {number} count   Wounds taken.
 */
export async function postLifeForceWoundCards(actor, before, count) {
  const i18n = game.i18n;
  const max = actor.system.wounds.max;
  for (let n = 1; n <= count; n++) {
    const content = await renderTemplate(WOUND_TEMPLATE, {
      title: i18n.format("VARBORG.Agony.LifeForceTitle", { name: actor.name }),
      lines: [
        i18n.format("VARBORG.Agony.LifeForceWound", { wounds: before + n, max }),
        i18n.localize("VARBORG.Agony.HpUnchanged")
      ],
      test: {
        actorUuid: actor.uuid,
        agonyType: "",
        label: i18n.format("VARBORG.Agony.TestButton", { dr: WOUND_DR })
      }
    });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
  }
  if (count > 0) await runItemHooks(actor, "wound");
}

/**
 * A Doomed character at the start of a day (rules 3.16, GAPS 143): the
 * wound has already been added and HP does not change, as with life force.
 * The card has the usual Toughness test. At max wounds no wound is added
 * and the card says so, with no test.
 * @param {Actor} actor
 * @param {{added: boolean, wounds: number, atMax: boolean}} doom  From newDayFor (module/rules/days.mjs).
 */
export async function postDoomedWoundCard(actor, doom) {
  const i18n = game.i18n;
  const max = actor.system.wounds.max;
  const lines = doom.added
    ? [i18n.format("VARBORG.Day.DoomedWound", { wounds: doom.wounds, max }), i18n.localize("VARBORG.Day.DoomedHp")]
    : [i18n.localize("VARBORG.Day.DoomedAtMax")];
  if (doom.atMax) lines.push(i18n.format("VARBORG.Day.NextZeroDeathsDoor", { name: actor.name }));
  const content = await renderTemplate(WOUND_TEMPLATE, {
    title: i18n.format("VARBORG.Day.DoomedTitle", { name: actor.name }),
    lines,
    test: doom.added ? {
      actorUuid: actor.uuid,
      agonyType: "",
      label: i18n.format("VARBORG.Agony.TestButton", { dr: WOUND_DR })
    } : null
  });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
  if (doom.added) await runItemHooks(actor, "wound");
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
  await postSmallCard(actor, text, { extraHtml: button });
  return rolls;
}

/**
 * The Table of Agony button: the Dark Master picks the column (the
 * suggestion is selected) and rolls d10.
 * @returns {Promise<boolean>}  Whether it was rolled.
 */
async function askAndRollAgony(actor, type) {
  const i18n = game.i18n;
  // Damage types without a column suggest none (GAPS 289).
  const suggested = AGONY_TYPES.includes(type) ? type : null;
  const options = AGONY_TYPES.map(id => {
    const label = i18n.localize(`VARBORG.Agony.Column.${id}`);
    const selected = id === suggested ? " selected" : "";
    return `<option value="${id}"${selected}>${id === suggested ? i18n.format("VARBORG.Agony.Suggested", { type: label }) : label}</option>`;
  }).join("");
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
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
async function rollAgony(actor, type) {
  const i18n = game.i18n;
  const roll = new Roll(AGONY_DICE);
  await roll.evaluate();
  const { id, severity } = agonyResult(type, roll.total);
  const lines = await applyAgonyResult(actor, id);
  const content = await renderTemplate(AGONY_TEMPLATE, {
    title: i18n.format("VARBORG.Agony.CardTitle", { name: actor.name }),
    rolled: i18n.format("VARBORG.Agony.Rolled", { type: i18n.localize(`VARBORG.Agony.Column.${type}`), roll: roll.total }),
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
    // Hard to Kill: Death's Door instead (step 50a2, GAPS 197).
    const instead = agonyDeathsDoorInstead(actor);
    if (instead) {
      await actor.update({ "system.wounds.value": actor.system.wounds.max, "system.hp.value": 0 });
      lines.push(i18n.format("VARBORG.Agony.DeathsDoorInstead", { item: instead.item, name: actor.name }));
    } else if (await killCharacter(actor, "agony")) lines.push(i18n.localize("VARBORG.Agony.Dies"));
    else lines.push(i18n.format("VARBORG.Agony.Spared", { name: actor.name }));
  }
  if (!Object.keys(rules).length) lines.push(i18n.localize("VARBORG.Agony.ByHand"));
  return lines;
}

/** Add an injury's effect. */
async function createInjuryEffect(actor, id, img) {
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    type: "injury",
    name: agonyName(id),
    img,
    statuses: [id],
    description: game.i18n.localize(`VARBORG.Agony.Result.${id}.text`),
    system: { result: id }
  }]);
}

/**
 * How many tested wound cards a character remembers. Life force can give
 * several wounds at once, each with its own card (rules 3.11).
 */
const WOUND_CARDS_REMEMBERED = 10;

/** The wound cards this character has tested (older worlds stored one id). */
function woundTestedOn(actor) {
  const flag = actor.getFlag(SYSTEM, "woundTestedOn");
  return flag ? [].concat(flag) : [];
}

/**
 * Buttons on chat cards: the wound test (the character's owner, once per
 * wound card) and the Table of Agony (the Dark Master, once per card).
 */
function addAgonyCardListeners(message, html) {
  const test = html.querySelector("button[data-action='woundTest']");
  if (test) {
    const actor = fromUuidSync(test.dataset.actorUuid);
    if (!actor || woundTestedOn(actor).includes(message.id)) test.disabled = true;
    else test.addEventListener("click", async () => {
      const current = await fromUuid(test.dataset.actorUuid);
      if (!current?.isOwner) {
        ui.notifications.warn(game.i18n.format("VARBORG.Defence.NotYours", { name: current?.name ?? "" }));
        return;
      }
      test.disabled = true;
      const before = woundTestedOn(current);
      await current.setFlag(SYSTEM, "woundTestedOn", [...before, message.id].slice(-WOUND_CARDS_REMEMBERED));
      // Dialog closed without rolling: the test can still be made.
      if (await woundTest(current, test.dataset.agonyType) === null) {
        await current.setFlag(SYSTEM, "woundTestedOn", before);
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

