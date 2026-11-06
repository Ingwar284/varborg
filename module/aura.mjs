/**
 * Auras in combat (step 51a2, GAPS 207): the Druid's Primal Conduit. At
 * the start of each combatant's turn, every other character in the combat
 * with an "aura" hook whose token is close enough acts on it: an ally (a
 * player character or minion) regains HP (auraHeal), a foe takes damage
 * (auraHurt, soaked by its armour like any hit, at least 1).
 *
 * The distance rule lives in module/rules/item-effects.mjs (auraReaches).
 * Run by the Dark Master's client, from the combat's turn start.
 */

import { auraReaches } from "./rules/item-effects.mjs";
import { itemHooks } from "./effects.mjs";
import { isDead } from "./deaths-door.mjs";
import { inflictDamage } from "./dice/morale.mjs";

/** Who an aura's heal reaches: the players' side. */
const ALLY_TYPES = ["character", "minion"];

/**
 * The distance in feet between two combatants' tokens on the canvas, or
 * null when either is not on the scene being viewed.
 */
function tokenFeet(a, b) {
  const one = a.token?.object;
  const two = b.token?.object;
  if (!one || !two || !canvas?.grid || a.token.parent !== b.token.parent) return null;
  return {
    centreDistance: canvas.grid.measurePath([one.center, two.center]).distance,
    sizeA: Math.max(a.token.width, a.token.height),
    sizeB: Math.max(b.token.width, b.token.height),
    gridDistance: canvas.grid.distance
  };
}

/**
 * The auras that reach the combatant starting its turn, and what they do.
 * @param {Combat} combat
 * @param {Combatant} combatant  The one starting its turn.
 */
export async function runAuras(combat, combatant) {
  const target = combatant.actor;
  if (!target || !game.user.isGM) return;
  const isAlly = ALLY_TYPES.includes(target.type);
  const isFoe = target.type === "foe";
  if (!isAlly && !isFoe) return;
  for (const source of combat.combatants) {
    const owner = source.actor;
    if (!owner || source === combatant || owner === target || owner.type !== "character" || isDead(owner)) continue;
    const hooks = itemHooks(owner, "aura").filter(hook => (isAlly ? hook.action === "auraHeal" : hook.action === "auraHurt"));
    if (!hooks.length) continue;
    const feet = tokenFeet(source, combatant);
    if (!feet) continue;
    for (const hook of hooks) {
      if (!auraReaches({ ...feet, radius: Number(hook.value) })) continue;
      await auraAction(owner, target, hook);
    }
  }
}

/** One aura acting on one creature, with a chat line. */
async function auraAction(owner, target, hook) {
  const i18n = game.i18n;
  const roll = await new Roll(hook.amount || "1").evaluate();
  if (hook.action === "auraHurt") {
    // The foe's damage card says the rest.
    await inflictDamage(target, roll.total, target.system.armour ?? "", hook.item);
    return;
  }
  const hp = target.system.hp;
  if (!hp || hp.value >= hp.max || (target.type === "character" && isDead(target))) return;
  const from = hp.value;
  const to = Math.min(hp.max, from + roll.total);
  await target.update({ "system.hp.value": to });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: owner }),
    content: `<div class="var-borg-card"><p>${foundry.utils.escapeHTML(i18n.format("VARBORG.Effects.AuraHeal", {
      item: hook.item, name: target.name, amount: to - from, from, to
    }))}</p></div>`
  });
}
