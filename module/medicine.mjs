/**
 * Using a medicine box in Foundry (rules 4.1 Gear, 3.13 Infected;
 * GAPS 41, 43, 149).
 *
 * A gear item with "Medicine box" ticked gets a Use button on the sheet.
 * The patient is the one character token you target, or yourself if you
 * target none. A dialog asks what the box should do: heal d6 HP, cure
 * Infected, or end persistent bleeding (the cures are only offered when the
 * patient needs them). Then:
 * 1. in combat it must be your own turn, and it uses one action (◈);
 * 2. the box's expendable die is rolled, whatever happens next;
 * 3. a card with a Toughness DR12 button for the patient. If you own the
 *    patient the test starts at once; otherwise the patient's owner presses
 *    the button. On a Success or Triumph the treatment works.
 *
 * The maths lives in module/rules/medicine.mjs.
 */

import {
  MEDICINE_ABILITY, MEDICINE_DR, MEDICINE_HEAL, MEDICINE_ACTIONS,
  availableUses, treatmentWorks, hpAfterHealing,
  testedCards, withTestedCard, withoutTestedCard
} from "./rules/medicine.mjs";
import { canRollExpendable, actionSymbols } from "./rules/expendable.mjs";
import { rollExpendable } from "./dice/expendable.mjs";
import { rollAbilityTest } from "./dice/ability-test.mjs";
import { persistentEffects } from "./persistent.mjs";
import { turnState } from "./combat.mjs";
import { isDead } from "./deaths-door.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";

/** Watch for the Toughness button on medicine box cards. */
export function registerMedicine() {
  Hooks.on("renderChatMessageHTML", addMedicineCardListeners);
}

/** Whether an item is a medicine box that can still be used. */
export function canUseMedicine(item) {
  return item.type === "gear" && Boolean(item.system.medicine) && canRollExpendable(item.system);
}

/** The persistent bleeding effects on an actor. */
function bleedingEffects(actor) {
  return persistentEffects(actor).filter(({ type }) => type === "bleeding");
}

/**
 * The patient: the one targeted character, or the user's own character.
 * @returns {Actor|null}  null (with a warning) if the targets don't work.
 */
function findPatient(actor) {
  const patient = targetedPatient(actor);
  if (patient && isDead(patient)) {
    ui.notifications.warn(game.i18n.format("VARBORG.Medicine.Dead", { name: patient.name }));
    return null;
  }
  return patient;
}

/** The one targeted character, or the user's own character, before the checks on the patient. */
function targetedPatient(actor) {
  const targets = [...game.user.targets].map(token => token.actor).filter(Boolean);
  if (!targets.length) return actor;
  if (targets.length > 1) {
    ui.notifications.warn("VARBORG.Medicine.OneTarget", { localize: true });
    return null;
  }
  const [target] = targets;
  if (target.type !== "character") {
    ui.notifications.warn("VARBORG.Medicine.CharactersOnly", { localize: true });
    return null;
  }
  return target;
}

/**
 * The Use button on a medicine box.
 * @param {Actor} actor  The character using the box.
 * @param {Item} item    The medicine box.
 */
export async function useMedicineBox(actor, item) {
  if (!canUseMedicine(item)) return;
  const i18n = game.i18n;
  const patient = findPatient(actor);
  if (!patient) return;

  // In combat, only on your own turn (GAPS 43: it costs an action).
  const turn = turnState(actor);
  if (turn.combatant && !turn.onOwnTurn) {
    ui.notifications.warn("VARBORG.Medicine.NotYourTurn", { localize: true });
    return;
  }

  const use = await askUse(actor, patient);
  if (!use) return;

  if (turn.combatant) {
    if (turn.combatant.actionsLeft < MEDICINE_ACTIONS) {
      ui.notifications.warn("VARBORG.Medicine.NoActions", { localize: true });
    }
    await turn.combatant.adjustPips("actions", -MEDICINE_ACTIONS);
  }

  const useLabel = i18n.localize(`VARBORG.Medicine.Use.${use}`);
  const content = `<div class="var-borg-card medicine-card">`
    + `<h3>${i18n.format("VARBORG.Medicine.CardTitle", { name: foundry.utils.escapeHTML(actor.name) })}</h3>`
    + `<p class="sum">${actionSymbols(MEDICINE_ACTIONS)} ${i18n.format("VARBORG.Medicine.CardText", {
      patient: foundry.utils.escapeHTML(patient.name), use: useLabel
    })}</p>`
    + `<p>${i18n.format("VARBORG.Medicine.CardHint", { dr: MEDICINE_DR })}</p>`
    + `<button type="button" data-action="medicineTest" data-patient-uuid="${patient.uuid}" data-use="${use}">`
    + `<i class="fa-solid fa-dice-d20"></i> ${i18n.format("VARBORG.Medicine.TestButton", { dr: MEDICINE_DR })}</button></div>`;
  const message = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });

  // The box is used whatever the test gives (GAPS 43).
  await rollExpendable(actor, item);

  // If you can roll for the patient, the test starts at once.
  if (patient.isOwner) await startTest(patient, use, message.id);
}

/** The dialog: what should the medicine box do? */
async function askUse(actor, patient) {
  const i18n = game.i18n;
  const uses = availableUses({
    infected: patient.statuses.has("infected"),
    bleeding: bleedingEffects(patient).length > 0
  });
  const options = uses.map((use, index) => `<label class="checkbox"><input type="radio" name="use" value="${use}"`
    + `${index === 0 ? " checked" : ""}> ${i18n.localize(`VARBORG.Medicine.Use.${use}`)}</label>`).join("");
  const patientLine = patient === actor
    ? i18n.localize("VARBORG.Medicine.Self")
    : i18n.format("VARBORG.Medicine.Patient", { name: foundry.utils.escapeHTML(patient.name) });
  const content = `<p>${patientLine}</p><div class="form-group stacked">${options}</div>`
    + `<p class="hint">${i18n.format("VARBORG.Medicine.DialogHint", { dr: MEDICINE_DR })}</p>`;
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: "VARBORG.Medicine.DialogTitle" },
    content,
    ok: { label: "VARBORG.Medicine.Apply", icon: "fa-solid fa-kit-medical" },
    rejectClose: false
  });
  return uses.includes(data?.use) ? data.use : null;
}

/** The patient flag that lists the cards it has been tested from. */
const TESTED_FLAG = "medicineTestedOn";

/** Whether the patient has already been tested from this card. */
function testedFrom(patient, messageId) {
  return testedCards(patient.getFlag(SYSTEM, TESTED_FLAG)).includes(messageId);
}

/**
 * The patient's Toughness test, once per card: the patient remembers every
 * card it was tested from. Closing the dialog lets the test be made later.
 */
async function startTest(patient, use, messageId) {
  if (testedFrom(patient, messageId)) return false;
  await patient.setFlag(SYSTEM, TESTED_FLAG,
    withTestedCard(patient.getFlag(SYSTEM, TESTED_FLAG), messageId, id => game.messages.has(id)));
  const done = await testAndTreat(patient, use);
  if (done === null) {
    await patient.setFlag(SYSTEM, TESTED_FLAG, withoutTestedCard(patient.getFlag(SYSTEM, TESTED_FLAG), messageId));
  }
  return done !== null;
}

/**
 * Toughness DR12; on a Success or Triumph the treatment works.
 * @returns {Promise<boolean|null>}  Whether it worked, or null if the dialog was closed.
 */
async function testAndTreat(patient, use) {
  const i18n = game.i18n;
  const useLabel = i18n.localize(`VARBORG.Medicine.Use.${use}`);
  const result = await rollAbilityTest(patient, MEDICINE_ABILITY, {
    dr: MEDICINE_DR,
    purpose: i18n.format("VARBORG.Medicine.Purpose", { use: useLabel })
  });
  if (!result) return null;

  const name = foundry.utils.escapeHTML(patient.name);
  const lines = [];
  const rolls = [];
  const works = treatmentWorks(result.tier);
  if (!works) {
    lines.push(i18n.format("VARBORG.Medicine.Failed", { name }));
  } else if (use === "heal") {
    const roll = await new Roll(MEDICINE_HEAL).evaluate();
    rolls.push(roll);
    const { value: from, max } = patient.system.hp;
    const to = hpAfterHealing(from, max, roll.total);
    await patient.update({ "system.hp.value": to });
    lines.push(i18n.format("VARBORG.Medicine.Healed", { name, amount: roll.total }));
    lines.push(i18n.format("VARBORG.Day.Hp", { from, to, max }));
  } else if (use === "infected") {
    if (patient.statuses.has("infected")) await patient.toggleStatusEffect("infected", { active: false });
    lines.push(i18n.format("VARBORG.Medicine.Cured", { name }));
  } else if (use === "bleeding") {
    const bleeding = bleedingEffects(patient);
    if (bleeding.length) await patient.deleteEmbeddedDocuments("ActiveEffect", bleeding.map(({ id }) => id));
    lines.push(i18n.format("VARBORG.Medicine.BleedingEnds", { name }));
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: patient }),
    rolls,
    content: `<div class="var-borg-card medicine-card"><h3>${i18n.format("VARBORG.Medicine.ResultTitle", { use: useLabel })}</h3>`
      + lines.map(line => `<p class="sum">${line}</p>`).join("") + `</div>`
  });
  return works;
}

/** The Toughness button on a medicine box card. Only the patient's owner can press it. */
function addMedicineCardListeners(message, html) {
  const button = html.querySelector("button[data-action='medicineTest']");
  if (!button) return;
  const patient = fromUuidSync(button.dataset.patientUuid);
  if (!patient || testedFrom(patient, message.id)) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", async () => {
    if (!patient.isOwner) {
      ui.notifications.warn(game.i18n.format("VARBORG.Defence.NotYours", { name: patient.name }));
      return;
    }
    button.disabled = true;
    const done = await startTest(patient, button.dataset.use, message.id);
    if (!done && !testedFrom(patient, message.id)) button.disabled = false;
  });
}
