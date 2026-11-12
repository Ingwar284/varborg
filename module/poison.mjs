/**
 * Poisons in Foundry (playtest feedback, GAPS 283). The maths is in
 * module/rules/poison.mjs.
 *
 * A vial of red poison's Interact ◈ button (module/uses.mjs) asks how it
 * is used:
 * - on the targeted creatures: a Poison card with a Resist button for each;
 * - on a weapon: the weapon is coated (a flag on it). Its next hit puts the
 *   same Resist buttons on a Poison card for the creatures hit, and the
 *   coating is gone.
 * The Resist button is pressed by whoever owns the creature (the Dark
 * Master for foes). A character tests Toughness DR12; a foe rolls a plain
 * d20 against 12. Failure: d10 damage. Ruin: d10 damage and d4 persistent
 * poison damage. Armour does not soak it; poison immunities and
 * resistances count.
 */

import { POISONS, POISON_DAMAGE_TYPE, poisonOf, poisonResult } from "./rules/poison.mjs";
import { resolveTest, MODE } from "./rules/test-roll.mjs";
import { hpAfterDamage } from "./rules/health.mjs";
import { rollQuietTest } from "./dice/ability-test.mjs";
import { inflictDamage } from "./dice/morale.mjs";
import { addPersistentDamage } from "./persistent.mjs";
import { rollResists, takenWithResists } from "./effects.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const SYSTEM = "var-borg";
const COAT_FLAG = "poisonCoat";

export { poisonOf };

/** Watch the Resist buttons on Poison and attack cards. */
export function registerPoisons() {
  Hooks.on("renderChatMessageHTML", activateResistButtons);
}

/**
 * Ask how the poison is used: on the targets, or on a weapon.
 * @param {Actor} actor
 * @param {Item} item  The poison.
 * @returns {Promise<{mode: "target"}|{mode: "coat", weaponId: string}|null>}  null when closed.
 */
export async function askPoisonUse(actor, item) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const weapons = actor.itemTypes.weapon ?? [];
  const targets = poisonTargets(actor);
  const options = weapons.map(weapon => `<option value="${weapon.id}">${esc(weapon.name)}</option>`).join("");
  const content = `<p>${esc(i18n.localize("VARBORG.Poison.How"))}</p>`
    + (targets.length
      ? `<p class="hint">${esc(i18n.format("VARBORG.Poison.Targets", { names: targets.map(target => target.name).join(", ") }))}</p>`
      : `<p class="hint">${esc(i18n.localize("VARBORG.Poison.NoTargets"))}</p>`)
    + (weapons.length
      ? `<div class="form-group"><label>${esc(i18n.localize("VARBORG.Poison.Weapon"))}</label><select name="weaponId">${options}</select></div>`
      : "");
  const buttons = [];
  if (targets.length) buttons.push({ action: "target", label: i18n.localize("VARBORG.Poison.UseOnTarget"), default: true });
  if (weapons.length) buttons.push({ action: "coat", label: i18n.localize("VARBORG.Poison.Coat"), default: !targets.length });
  if (!buttons.length) {
    ui.notifications.warn(i18n.localize("VARBORG.Poison.Nothing"));
    return null;
  }
  const picked = await foundry.applications.api.DialogV2.wait({
    classes: VB_DIALOG_CLASSES,
    window: { title: item.name },
    content,
    buttons: buttons.map(button => ({
      ...button,
      callback: (event, element, dialog) => ({ mode: button.action, weaponId: dialog.element.querySelector("[name='weaponId']")?.value ?? "" })
    })),
    rejectClose: false
  });
  return picked && typeof picked === "object" ? picked : null;
}

/** The targeted creatures a poison can reach (not the user). */
function poisonTargets(actor) {
  return [...new Set([...game.user.targets].map(token => token.actor).filter(other => other?.system?.hp && other !== actor))];
}

/**
 * Do what the player chose: post the Resist card, or coat the weapon.
 * @returns {Promise<string>} A line for the Use card.
 */
export async function applyPoisonUse(actor, item, choice) {
  const i18n = game.i18n;
  const id = poisonOf(item.name);
  if (choice.mode === "coat") {
    const weapon = actor.items.get(choice.weaponId);
    if (!weapon) return "";
    await weapon.setFlag(SYSTEM, COAT_FLAG, { poison: id, name: item.name });
    return i18n.format("VARBORG.Poison.Coated", { weapon: weapon.name, poison: item.name });
  }
  await postResistCard(actor, id, item.name, poisonTargets(actor));
  return "";
}

/** The poison coating a weapon, or null. */
export function weaponCoat(weapon) {
  return weapon?.getFlag?.(SYSTEM, COAT_FLAG) ?? null;
}

/**
 * A weapon attack hit: its coating poisons the creatures hit and is gone.
 * @param {Actor} actor     The attacker.
 * @param {Item} weapon
 * @param {Actor[]} targets The creatures hit.
 */
export async function poisonFromHit(actor, weapon, targets) {
  const coat = weaponCoat(weapon);
  if (!coat || !POISONS[coat.poison]) return;
  await weapon.unsetFlag(SYSTEM, COAT_FLAG);
  await postResistCard(actor, coat.poison, coat.name, targets.filter(target => target?.system?.hp), weapon.name);
}

/** The Poison card: one Resist button per creature. */
async function postResistCard(actor, id, poisonName, targets, weaponName = "") {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const poison = POISONS[id];
  const intro = weaponName
    ? i18n.format("VARBORG.Poison.FromWeapon", { weapon: weaponName, poison: poisonName })
    : i18n.format("VARBORG.Poison.Used", { name: actor.name, poison: poisonName });
  const buttons = targets.map(target => `<button type="button" class="text-button" data-action="resistPoison" data-actor-uuid="${target.uuid}" data-poison="${id}" data-name="${esc(poisonName)}">`
    + `<i class="fa-solid fa-flask"></i> ${esc(i18n.format("VARBORG.Poison.Resist", { name: target.name, dr: poison.dr }))}</button>`).join("");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card poison-card"><h3>${esc(poisonName)}</h3><p>${esc(intro)}</p>`
      + (buttons || `<p class="hint">${esc(i18n.localize("VARBORG.Poison.NoTargetsCard"))}</p>`) + `</div>`,
    flags: { [SYSTEM]: { poisonCard: true } }
  });
}

/** The Resist buttons: each creature resists once, by whoever owns it. */
function activateResistButtons(message, html) {
  if (!message.getFlag(SYSTEM, "poisonCard")) return;
  for (const button of html.querySelectorAll("button[data-action='resistPoison']")) {
    const uuid = button.dataset.actorUuid;
    const done = (message.getFlag(SYSTEM, "poisonResisted") ?? []).includes(uuid);
    const target = fromUuidSync(uuid);
    if (done || !target?.isOwner) {
      button.disabled = true;
      continue;
    }
    button.addEventListener("click", async () => {
      button.disabled = true;
      const list = message.getFlag(SYSTEM, "poisonResisted") ?? [];
      if (list.includes(uuid)) return;
      if (message.canUserModify(game.user, "update")) await message.setFlag(SYSTEM, "poisonResisted", [...list, uuid]);
      await resistPoison(await fromUuid(uuid), button.dataset.poison, button.dataset.name);
    });
  }
}

/**
 * A creature resists a poison: the test, then the damage and persistent
 * damage its result gives, and a card.
 * @param {Actor} target
 * @param {string} id          A POISONS id.
 * @param {string} poisonName  For the card.
 */
export async function resistPoison(target, id, poisonName) {
  const poison = POISONS[id];
  if (!target || !poison) return;
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const rolls = [];
  const lines = [];
  let tier;
  if (target.type === "character") {
    const test = await rollQuietTest(target, poison.ability, { dr: poison.dr, kind: "poison" });
    rolls.push(test.roll);
    tier = test.tier;
    lines.push(i18n.format("VARBORG.Poison.TestLine", {
      ability: i18n.localize(`VARBORG.Ability.${poison.ability}`), total: test.total, dr: test.dr
    }), ...test.notes);
  } else {
    // A foe never tests: a plain d20 against the DR (GAPS 283).
    const roll = await new Roll("1d20").evaluate();
    rolls.push(roll);
    tier = resolveTest({ dice: [roll.total], mode: MODE.NORMAL, ability: 0, dr: poison.dr }).tier;
    lines.push(i18n.format("VARBORG.Poison.FoeLine", { roll: roll.total, dr: poison.dr }));
  }
  const tierLabel = i18n.localize(`VARBORG.Tier.${tier}`);
  const result = poisonResult(id, tier);
  if (!result.damage) lines.push(i18n.format("VARBORG.Poison.Shrugged", { name: target.name }));
  let killed = false;
  if (result.damage) {
    const roll = await new Roll(result.damage).evaluate();
    rolls.push(roll);
    if (target.type === "foe") {
      // Armour does not soak it; the foe's poison immunities and resistances count.
      killed = await inflictDamage(target, roll.total, "", poisonName, POISON_DAMAGE_TYPE, null);
      lines.push(i18n.format("VARBORG.Poison.DamageRolled", { formula: result.damage, damage: roll.total }));
    } else {
      lines.push(await poisonCharacter(target, roll.total, result.damage));
    }
  }
  if (result.persistent && !killed && await addPersistentDamage(target, POISON_DAMAGE_TYPE, result.persistent)) {
    lines.push(i18n.format("VARBORG.Poison.Persistent", { name: target.name, formula: result.persistent }));
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    content: `<div class="var-borg-card poison-card"><h3>${esc(i18n.format("VARBORG.Poison.ResistTitle", { name: target.name, poison: poisonName }))}</h3>`
      + `<p class="tier tier-${tier}">${esc(tierLabel)}</p>`
      + lines.filter(Boolean).map(line => `<p class="modifier">${esc(line)}</p>`).join("") + `</div>`,
    rolls,
    sound: CONFIG.sounds.dice
  });
}

/** Poison damage on a character or minion: resistances, no armour. */
async function poisonCharacter(actor, damage, formula) {
  const i18n = game.i18n;
  const { kept } = await rollResists(actor, POISON_DAMAGE_TYPE);
  const { taken } = takenWithResists(damage, damage, 0, kept);
  if (actor.type === "character") {
    const { killedByDamage } = await import("./deaths-door.mjs");
    if (await killedByDamage(actor, taken)) return i18n.format("VARBORG.Poison.DamageRolled", { formula, damage: taken });
  }
  const from = actor.system.hp.value;
  const to = hpAfterDamage(from, taken);
  await actor.update({ "system.hp.value": to });
  return i18n.format("VARBORG.Poison.Damaged", { name: actor.name, formula, damage: taken, from, to });
}
