/**
 * Quick roll buttons above the chat message box: Ability test, Chance Die
 * and Panic test. They do exactly what the same buttons on the character
 * sheet do, for the character of the selected token, or else the user's
 * own character (User Configuration).
 *
 * Foundry moves the message box between the chat sidebar and the
 * notification area when the sidebar opens or closes, and calls the
 * renderChatInput hook each time; the bar follows it there.
 */

import { ABILITIES } from "./rules/abilities.mjs";
import { rollAbilityTest } from "./dice/ability-test.mjs";
import { rollChanceDie } from "./dice/chance-die.mjs";
import { rollPanicTest } from "./panic.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const { DialogV2 } = foundry.applications.api;

let bar = null;

export function registerChatRolls() {
  Hooks.on("renderChatInput", (app, { "#chat-message": input }) => {
    if (!input) return;
    bar ??= buildBar();
    input.before(bar);
  });
}

/** The three buttons. */
function buildBar() {
  const i18n = game.i18n;
  const element = document.createElement("div");
  element.className = "var-borg-chat-rolls";
  const buttons = [
    { action: "test", icon: "fa-dice-d20", label: "VARBORG.ChatRolls.Test", tooltip: "VARBORG.ChatRolls.TestTooltip" },
    { action: "chance", icon: "fa-dice", label: "VARBORG.Chance.Button", tooltip: "VARBORG.Chance.Tooltip" },
    { action: "panic", icon: "fa-skull", label: "VARBORG.ChatRolls.Panic", tooltip: "VARBORG.Panic.Tooltip" }
  ];
  for (const { action, icon, label, tooltip } of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.vbRoll = action;
    button.dataset.tooltip = i18n.localize(tooltip);
    button.innerHTML = `<i class="fa-solid ${icon}" inert></i> ${foundry.utils.escapeHTML(i18n.localize(label))}`;
    element.append(button);
  }
  element.addEventListener("click", onClick);
  return element;
}

/** The character to roll for: a selected token's character, or the user's own. */
function rollingCharacter() {
  const selected = canvas?.tokens?.controlled
    .map(token => token.actor)
    .find(actor => actor?.type === "character" && actor.isOwner);
  const actor = selected ?? game.user.character;
  if (actor?.type === "character") return actor;
  ui.notifications.warn("VARBORG.ChatRolls.NoCharacter", { localize: true });
  return null;
}

async function onClick(event) {
  const button = event.target.closest("[data-vb-roll]");
  if (!button) return;
  const actor = rollingCharacter();
  if (!actor) return;
  switch (button.dataset.vbRoll) {
    case "test": {
      const ability = await pickAbility(actor);
      if (ability) await rollAbilityTest(actor, ability, { fortune: true });
      break;
    }
    case "chance": await rollChanceDie(actor); break;
    case "panic": await rollPanicTest(actor); break;
  }
}

/** A small window with one button per ability, showing the character's score. */
async function pickAbility(actor) {
  const i18n = game.i18n;
  const scores = actor.system.abilities ?? {};
  return DialogV2.wait({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.format("VARBORG.ChatRolls.PickTitle", { name: actor.name }) },
    content: `<p>${foundry.utils.escapeHTML(i18n.localize("VARBORG.ChatRolls.PickHint"))}</p>`,
    buttons: ABILITIES.map(ability => {
      const score = Number(scores[ability] ?? 0);
      return {
        action: ability,
        label: `${i18n.localize(`VARBORG.Ability.${ability}`)} ${score >= 0 ? "+" : "−"}${Math.abs(score)}`,
        callback: () => ability
      };
    }),
    rejectClose: false
  });
}
