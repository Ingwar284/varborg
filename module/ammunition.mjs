/**
 * Ammunition after combat (rules 4.1 Weapon Traits, Expendable; GAPS 39).
 *
 * "For weapons with ammunition, roll the indicated die after a combat
 * encounter in which you used said ammunition." When a character shoots a
 * weapon with an expendable die during a combat (an attack, or the Fire
 * button), the weapon remembers that combat in its flags:
 *   firedIn   the id of the combat it last fired in
 * When the combat ends, the Dark Master's client posts one card per
 * character with an Expendable button for each such weapon. The
 * character's owner presses it; the roll itself is the ordinary expendable
 * roll (module/dice/expendable.mjs). The maths lives in
 * module/rules/expendable.mjs.
 */

import { usesAmmunition, needsAmmoRoll } from "./rules/expendable.mjs";
import { rollExpendable } from "./dice/expendable.mjs";
import { turnState } from "./combat.mjs";

const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/ammunition-card.hbs";

/** Watch for Expendable buttons on ammunition cards. */
export function registerAmmunition() {
  Hooks.on("renderChatMessageHTML", addAmmunitionCardListeners);
}

/**
 * Remember that a weapon's ammunition was used in the running combat.
 * Only counts for a character who is in that combat.
 * @param {Actor} actor  The character shooting.
 * @param {Item} item    The weapon.
 */
export async function markFired(actor, item) {
  if (!usesAmmunition(item.system)) return;
  if (!turnState(actor).combatant) return;
  const combatId = game.combat.id;
  if (item.getFlag(SYSTEM, "firedIn") !== combatId) await item.setFlag(SYSTEM, "firedIn", combatId);
}

/**
 * When a combat ends, ask for an expendable roll for each weapon whose
 * ammunition was used in it. Runs on the Dark Master's client only.
 * @param {Combat} combat  The combat that has just ended.
 */
export async function askForAmmoRolls(combat) {
  const actors = new Map();
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (actor?.type === "character") actors.set(actor.uuid, actor);
  }

  const i18n = game.i18n;
  for (const actor of actors.values()) {
    const weapons = actor.items.filter(item =>
      item.type === "weapon" && needsAmmoRoll(item.system, item.getFlag(SYSTEM, "firedIn"), combat.id));
    if (!weapons.length) continue;

    const title = i18n.format("VARBORG.Ammunition.CardTitle", { name: actor.name });
    const content = await renderTemplate(CARD_TEMPLATE, {
      title,
      text: i18n.localize("VARBORG.Ammunition.Explanation"),
      combatId: combat.id,
      weapons: weapons.map(item => ({
        uuid: item.uuid,
        label: i18n.format("VARBORG.Ammunition.Button", { name: item.name, die: item.system.expendable })
      }))
    });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flavor: title, content });
  }
}

/**
 * An Expendable button on an ammunition card. It works once: the weapon
 * forgets the combat when its die is rolled, which greys the button out.
 */
function addAmmunitionCardListeners(message, html) {
  for (const button of html.querySelectorAll("button[data-action='ammoRoll']")) {
    const { itemUuid, combatId } = button.dataset;
    const item = fromUuidSync(itemUuid);
    if (!item || !needsAmmoRoll(item.system, item.getFlag(SYSTEM, "firedIn"), combatId)) {
      button.disabled = true;
      continue;
    }
    button.addEventListener("click", async () => {
      const current = await fromUuid(itemUuid);
      if (!current?.isOwner) {
        ui.notifications.warn(game.i18n.format("VARBORG.Defence.NotYours", { name: current?.parent?.name ?? "" }));
        return;
      }
      // Another client may have rolled it already.
      if (!needsAmmoRoll(current.system, current.getFlag(SYSTEM, "firedIn"), combatId)) {
        button.disabled = true;
        return;
      }
      button.disabled = true;
      await current.unsetFlag(SYSTEM, "firedIn");
      await rollExpendable(current.parent, current);
    });
  }
}
