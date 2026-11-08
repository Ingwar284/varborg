/**
 * The Actions bar on the character sheet: the basic activities of rules 3.4
 * Violence, done by hand.
 *
 * - Attack ◈, Cast a spell, Sustain ◈, Command a minion ◈: pick the weapon,
 *   spell, Sustained power or spell, or minion from a short list, then the
 *   usual roll runs (it spends the actions itself).
 * - Defend: for an attack that has no foe card. Asks melee or ranged and the
 *   damage, then the usual defence roll runs (armour, cover, conditions,
 *   Fortune, Take damage).
 * - Improvise and Interact ◈–◈◈◈, Move ◈: no roll. Spend the actions in
 *   combat (on your own turn only) and post one line to chat.
 */

import { rollAttack } from "./dice/attack.mjs";
import { rollDefence } from "./dice/defence.mjs";
import { castSpell } from "./dice/spell.mjs";
import { sustainPower } from "./dice/power.mjs";
import { commandMinion, ownedMinions } from "./minions.mjs";
import { turnState } from "./combat.mjs";
import { BASIC_ACTIVITIES, activityCost } from "./rules/actions.mjs";
import { manualDamage } from "./rules/defence.mjs";
import { droppedContainerIds, isDropped } from "./rules/dropped.mjs";
import { carrying } from "./rules/carrying.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const { DialogV2 } = foundry.applications.api;
const esc = text => foundry.utils.escapeHTML(String(text ?? ""));

/** The bar's buttons, in the order of rules 3.4. */
export const MANUAL_ACTIONS = ["attack", "defend", "command", "improvise", "interact", "move", "cast", "sustain"];

/**
 * Run one of the bar's buttons.
 * @param {Actor} actor  The character.
 * @param {string} kind  One of MANUAL_ACTIONS.
 */
export async function runManualAction(actor, kind) {
  switch (kind) {
    case "attack": return pickAndRun(actor, kind, attackWeapons(actor), item => rollAttack(actor, item));
    case "cast": return pickAndRun(actor, kind, actor.itemTypes.spell ?? [], item => castSpell(actor, item));
    case "sustain": return pickAndRun(actor, kind, sustainedItems(actor), item => sustainPower(actor, item));
    case "command": return pickAndRun(actor, kind, ownedMinions(actor), minion => commandMinion(actor, minion));
    case "defend": return manualDefend(actor);
    case "improvise":
    case "interact":
    case "move": return basicActivity(actor, kind);
  }
}

/** Weapons at hand: equipped or carried loose, not packed away or dropped. */
function attackWeapons(actor) {
  const droppedIds = droppedContainerIds(actor.items);
  return actor.itemTypes.weapon.filter(item =>
    !isDropped(item, droppedIds) && (item.system.equipped || !item.system.storedIn));
}

/** Powers and spells being Sustained right now. */
function sustainedItems(actor) {
  return [...actor.itemTypes.power, ...(actor.itemTypes.spell ?? [])].filter(item => item.system.sustaining);
}

/**
 * With nothing to choose from, say so. With one, use it. With more, ask.
 * @param {Actor} actor
 * @param {string} kind
 * @param {Array<{id: string, name: string}>} choices  Items or minions.
 * @param {Function} run  What to do with the one chosen.
 */
async function pickAndRun(actor, kind, choices, run) {
  const i18n = game.i18n;
  if (!choices.length) {
    ui.notifications.info(i18n.format(`VARBORG.Manual.Nothing.${kind}`, { name: actor.name }));
    return;
  }
  if (choices.length === 1) return run(choices[0]);
  const options = choices.map(choice => `<option value="${esc(choice.id)}">${esc(choice.name)}</option>`).join("");
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.localize(`VARBORG.Manual.${kind}`) },
    content: `<div class="form-group"><label for="var-borg-manual-pick">${esc(i18n.localize(`VARBORG.Manual.Pick.${kind}`))}</label>`
      + `<select id="var-borg-manual-pick" name="pick">${options}</select></div>`,
    ok: { label: i18n.localize(`VARBORG.Manual.${kind}`), icon: "fa-solid fa-check" },
    rejectClose: false
  });
  const chosen = data && choices.find(choice => choice.id === data.pick);
  if (chosen) return run(chosen);
}

/**
 * Defend against an attack that has no foe card: ask melee or ranged (some
 * conditions care, rules 3.13) and the damage, then roll as usual.
 */
async function manualDefend(actor) {
  const i18n = game.i18n;
  const content = `<div class="var-borg-test-dialog">`
    + `<div class="form-group"><label for="var-borg-manual-kind">${esc(i18n.localize("VARBORG.Manual.DefendKind"))}</label>`
    + `<select id="var-borg-manual-kind" name="kind">`
    + `<option value="melee">${esc(i18n.localize("VARBORG.Foe.Melee"))}</option>`
    + `<option value="shoot">${esc(i18n.localize("VARBORG.Foe.Ranged"))}</option></select></div>`
    + `<div class="form-group"><label for="var-borg-manual-damage">${esc(i18n.localize("VARBORG.Manual.DefendDamage"))}</label>`
    + `<input id="var-borg-manual-damage" type="text" name="damage" value="d6" placeholder="d6">`
    + `<p class="hint">${esc(i18n.localize("VARBORG.Manual.DefendDamageHint"))}</p></div></div>`;
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.format("VARBORG.Defence.DialogTitle", { name: actor.name }) },
    content,
    ok: { label: i18n.localize("VARBORG.Manual.Next"), icon: "fa-solid fa-arrow-right" },
    rejectClose: false
  });
  if (!data) return;
  const damage = manualDamage(data.damage);
  if (!damage) {
    ui.notifications.warn(i18n.format("VARBORG.Manual.BadDamage", { damage: data.damage }));
    return;
  }
  // A stand-in for a foe's attack: no foe, so no foe conditions or passives.
  const attack = {
    name: i18n.localize("VARBORG.Manual.AnAttack"),
    parent: null,
    uuid: "",
    system: { kind: data.kind === "melee" ? "melee" : "shoot", damage: damage.damage, fixedDamage: damage.fixedDamage, damageType: "" }
  };
  await rollDefence(actor, attack);
}

/**
 * Improvise, Interact or Move: no roll. Improvise and Interact ask how many
 * actions (◈ to ◈◈◈) and what the character does; Move costs ◈.
 */
async function basicActivity(actor, kind) {
  const i18n = game.i18n;
  const range = BASIC_ACTIVITIES[kind];
  let actions = range.min;
  let note = "";
  if (range.max > range.min) {
    const options = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i)
      .map(n => `<option value="${n}">${"◈".repeat(n)}</option>`).join("");
    const data = await DialogV2.input({
      classes: VB_DIALOG_CLASSES,
      window: { title: i18n.localize(`VARBORG.Manual.${kind}`) },
      content: `<div class="var-borg-test-dialog">`
        + `<p class="hint">${esc(i18n.localize(`VARBORG.Manual.Hint.${kind}`))}</p>`
        + `<div class="form-group"><label for="var-borg-manual-actions">${esc(i18n.localize("VARBORG.Manual.Actions"))}</label>`
        + `<select id="var-borg-manual-actions" name="actions">${options}</select></div>`
        + `<div class="form-group"><label for="var-borg-manual-note">${esc(i18n.localize("VARBORG.Manual.What"))}</label>`
        + `<input id="var-borg-manual-note" type="text" name="note" placeholder="${esc(i18n.localize(`VARBORG.Manual.Placeholder.${kind}`))}"></div></div>`,
      ok: { label: i18n.localize(`VARBORG.Manual.${kind}`), icon: "fa-solid fa-check" },
      rejectClose: false
    });
    if (!data) return;
    actions = Number(data.actions);
    note = String(data.note ?? "").trim();
  }

  const turn = turnState(actor);
  const cost = activityCost(kind, actions, { inCombat: Boolean(turn.combatant), onOwnTurn: turn.onOwnTurn });
  if (!cost.allowed) {
    ui.notifications.warn(i18n.localize("VARBORG.Manual.NotYourTurn"));
    return;
  }
  if (cost.actions) {
    if (turn.combatant.actionsLeft < cost.actions) ui.notifications.warn(i18n.localize("VARBORG.Manual.NoActions"));
    await turn.combatant.adjustPips("actions", -cost.actions);
  }

  const symbols = "◈".repeat(actions);
  const lines = [i18n.format(`VARBORG.Manual.Did.${kind}`, { name: esc(actor.name), actions: symbols })];
  if (kind === "move") {
    const items = actor.items.map(item => ({ id: item.id, type: item.type, ...item.system }));
    const { movement } = carrying(items, actor.system.abilities.toughness, actor.system.statBonuses);
    lines.push(i18n.format("VARBORG.Manual.MoveDistance", { feet: movement }));
  }
  if (note) lines.push(`<em>${esc(note)}</em>`);
  if (cost.actions) lines.push(`<span class="modifier">${esc(i18n.format("VARBORG.Manual.Spent", { actions: symbols }))}</span>`);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card">${lines.map(line => `<p>${line}</p>`).join("")}</div>`
  });
}
