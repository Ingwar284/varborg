/**
 * The Shadowblight table in Foundry (rules 3.11 Spellcasting).
 *
 * A spell's Ruin card (module/dice/attack.mjs) shows a "Roll on the
 * Shadowblight table" button for the caster's owner. It rolls d20 and posts
 * the result's name and text. The Dark Master applies the result by hand
 * (GAPS 138). Each roll is recorded on the card first (module/card-once.mjs,
 * REVIEW.md B7): one roll, or two for Wild surge, which rolls twice. After
 * that the button is off. A Fortune reroll that turns the Ruin into another
 * result takes the button away.
 *
 * The table lives in module/rules/shadowblight.mjs, its text in lang/en.json.
 */

import { SHADOWBLIGHT_DICE, COMBUSTION, shadowblightResult, combustion } from "./rules/shadowblight.mjs";
import { claimOnce } from "./card-once.mjs";
import { nextSlot } from "./rules/card-once.mjs";
import { postSmallCard } from "./chat-card.mjs";

/** The feat whose bearer rolls on the table twice and chooses (its own text). */
const WILD_SURGE = "Wild surge";

/** Watch for the Shadowblight button on chat cards. */
export function registerShadowblight() {
  Hooks.on("renderChatMessageHTML", addShadowblightListeners);
}

/** How many times the table may be rolled from one card: once, twice with Wild surge. */
function rollsAllowed(actor) {
  return actor.itemTypes.feat?.some(item => item.name === WILD_SURGE) ? 2 : 1;
}

/** The next unused roll number on this card ("1" or "2"), or null when all are used. */
function freeRoll(message, actor) {
  return nextSlot(message.getFlag("var-borg", "shadowblightRolled"), actor ? rollsAllowed(actor) : 1);
}

/** The button on a spell's Ruin card. */
function addShadowblightListeners(message, html) {
  const button = html.querySelector("button[data-action='rollShadowblight']");
  if (!button) return;
  // Used up already (the caster may not be loaded yet: then one roll is assumed).
  if (freeRoll(message, fromUuidSync(button.dataset.actorUuid)) === null) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", async () => {
    const actor = await fromUuid(button.dataset.actorUuid);
    if (!actor) return;
    if (!actor.isOwner) {
      ui.notifications.warn(game.i18n.format("VARBORG.Shadowblight.NotYours", { name: actor.name }));
      return;
    }
    const roll = freeRoll(message, actor);
    if (roll === null) {
      button.disabled = true;
      return;
    }
    button.disabled = true;
    // Record the roll first, so it cannot be repeated (REVIEW.md B7). Not re-enabled after this:
    // the card redraws, with a button again only if Wild surge leaves a second roll.
    const claim = await claimOnce(message, "shadowblightRolled", { actor, sub: roll });
    if (!claim) {
      button.disabled = freeRoll(message, actor) === null;
      return;
    }
    await rollShadowblight(actor);
  });
}

/**
 * Roll d20 on the Shadowblight table and post the result.
 * @param {Actor} actor  The caster.
 */
export async function rollShadowblight(actor) {
  const i18n = game.i18n;
  const roll = await new Roll(SHADOWBLIGHT_DICE).evaluate();
  const id = shadowblightResult(roll.total);
  const name = i18n.localize(`VARBORG.Shadowblight.Result.${id}.name`);
  const lines = [i18n.localize(`VARBORG.Shadowblight.Result.${id}.text`)];

  // Spontaneous combustion counts the spells the caster knows.
  if (id === COMBUSTION) {
    const count = actor.itemTypes.spell?.length ?? 0;
    const blast = combustion(count);
    lines.push(blast.damage
      ? i18n.format("VARBORG.Shadowblight.Combustion", { name: actor.name, count, feet: blast.feet, damage: blast.damage })
      : i18n.format("VARBORG.Shadowblight.CombustionNone", { name: actor.name }));
  }

  const title = i18n.format("VARBORG.Shadowblight.Title", { name });
  await postSmallCard(actor, [
    { text: i18n.format("VARBORG.Shadowblight.Roll", { roll: roll.total }), className: "modifier" },
    ...lines,
    { text: i18n.localize("VARBORG.Shadowblight.DmApplies"), className: "modifier" }
  ], {
    heading: title,
    classes: "shadowblight-card",
    flavor: title,
    rolls: [roll],
    sound: CONFIG.sounds.dice
  });
}
