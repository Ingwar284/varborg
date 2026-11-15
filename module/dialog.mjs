import { aidModifier, tallyBoonsAndBanes, MODE } from "./rules/test-roll.mjs";
import { dialogCost } from "./rules/fortune.mjs";

/**
 * Classes for every VÅR BORG dialog window (roll dialogs, confirmations, pickers).
 * "var-borg" gives the system look (styles/base.css). The windows start in
 * Foundry's light theme ("themed theme-light"), so their fields and buttons sit
 * well on the paper background. module/mood.mjs switches them to the dark theme
 * when the interface mood is dark.
 */
export const VB_DIALOG_CLASSES = ["var-borg", "themed", "theme-light", "var-borg-dialog"];

/** The Boon and Bane toggle buttons, shared by every roll dialog. */
const BOON_BANE_PARTIAL = "systems/var-borg/templates/dice/boon-bane.hbs";

/**
 * Roll dialog extras:
 * - the − and + buttons: a button with data-vb-step="1" or "-1" changes the
 *   number field beside it, never going below the field's minimum;
 * - a summary line above the Roll button that sums up the player's choices.
 */
export function registerDialogControls() {
  foundry.applications.handlebars.loadTemplates([BOON_BANE_PARTIAL]);
  Hooks.on("renderDialogV2", (app, element) => {
    if (!element.classList.contains("var-borg-dialog") || element.dataset.vbControls) return;
    element.dataset.vbControls = "true";
    element.addEventListener("click", onStepClick);
    addRollSummary(element);
  });
}

/** − or + clicked: change the number field beside it. */
function onStepClick(event) {
  const button = event.target.closest("[data-vb-step]");
  if (!button) return;
  const input = button.parentElement.querySelector("input[type=number]");
  if (!input) return;
  if (Number(button.dataset.vbStep) > 0) input.stepUp();
  else input.stepDown();
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Add the summary line to a roll dialog, and keep it up to date. */
function addRollSummary(element) {
  const form = element.querySelector("form") ?? element;
  const footer = element.querySelector(".form-footer");
  if (!footer || !form.querySelector(".var-borg-test-dialog")) return;
  const summary = document.createElement("p");
  summary.className = "vb-roll-summary";
  summary.setAttribute("aria-live", "polite");
  footer.before(summary);
  const update = () => {
    const text = summaryText(form);
    summary.textContent = text;
    summary.hidden = !text;
  };
  form.addEventListener("change", update);
  form.addEventListener("input", update);
  update();
}

/**
 * "Boon · Aid +1 · Burns 1 Fortune": what the player has chosen. Boons and
 * Banes the system adds itself (conditions, encumbrance) are shown as notes
 * higher up, not here.
 */
function summaryText(form) {
  const ticked = name => Boolean(form.querySelector(`input[name="${name}"]`)?.checked);
  const count = name => {
    const number = Math.floor(Number(form.querySelector(`input[name="${name}"]`)?.value));
    return Number.isFinite(number) && number > 0 ? number : 0;
  };
  const i18n = game.i18n;
  const parts = [];

  const { boons, banes, mode } = tallyBoonsAndBanes({
    boonFlags: [ticked("boon"), ticked("fortuneBoon")],
    baneFlags: [ticked("bane"), ticked("fortuneBane")]
  });
  if (boons && banes) parts.push(i18n.localize("VARBORG.Test.Cancelled"));
  else if (mode === MODE.BOON) parts.push(i18n.localize("VARBORG.Test.Boon"));
  else if (mode === MODE.BANE) parts.push(i18n.localize("VARBORG.Test.Bane"));

  const aid = aidModifier(count("aidSuccesses"), count("aidFailures"));
  if (aid) parts.push(i18n.format("VARBORG.Dialog.SummaryAid", { aid: aid > 0 ? `+${aid}` : `−${-aid}` }));

  const cost = dialogCost(ticked("fortuneBoon"), ticked("fortuneBane"));
  if (cost) parts.push(i18n.format("VARBORG.Dialog.SummaryFortune", { cost }));

  return parts.join(" · ");
}
