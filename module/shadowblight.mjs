/**
 * The Shadowblight table in Foundry (rules 3.11 Spellcasting).
 *
 * A spell's Ruin card (module/dice/attack.mjs) shows a "Roll on the
 * Shadowblight table" button for the caster's owner. It rolls d20 and posts
 * the result's name and text. The Dark Master applies the result by hand
 * (GAPS 138). The button stays on the card after a roll, for features such
 * as Wild surge that roll twice; a Fortune reroll that turns the Ruin into
 * another result takes the button away.
 *
 * The table lives in module/rules/shadowblight.mjs, its text in lang/en.json.
 */

import { SHADOWBLIGHT_DICE, COMBUSTION, shadowblightResult, combustion } from "./rules/shadowblight.mjs";

/** Watch for the Shadowblight button on chat cards. */
export function registerShadowblight() {
  Hooks.on("renderChatMessageHTML", addShadowblightListeners);
}

/** The button on a spell's Ruin card. */
function addShadowblightListeners(message, html) {
  const button = html.querySelector("button[data-action='rollShadowblight']");
  if (!button) return;
  button.addEventListener("click", async () => {
    const actor = await fromUuid(button.dataset.actorUuid);
    if (!actor) return;
    if (!actor.isOwner) {
      ui.notifications.warn(game.i18n.format("VARBORG.Shadowblight.NotYours", { name: actor.name }));
      return;
    }
    button.disabled = true;
    try {
      await rollShadowblight(actor);
    } finally {
      button.disabled = false;
    }
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
  const content = `<div class="var-borg-card shadowblight-card"><h3>${title}</h3>`
    + `<p class="modifier">${i18n.format("VARBORG.Shadowblight.Roll", { roll: roll.total })}</p>`
    + lines.map(line => `<p>${line}</p>`).join("")
    + `<p class="modifier">${i18n.localize("VARBORG.Shadowblight.DmApplies")}</p></div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice
  });
}
