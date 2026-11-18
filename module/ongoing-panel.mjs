/**
 * The Ongoing panel (player feedback): a narrow column of icons at the top
 * right of the screen, beside Foundry's sidebar, showing every condition
 * and ongoing effect of one creature. Hovering an icon names it; the « / »
 * button opens the panel wider to show the names too (remembered for each
 * user, the "ongoingOpen" client setting).
 *
 * Left click raises an entry by one, right click lowers it by one and
 * removes it at 0 (changeOngoing in module/ongoing.mjs). Only the
 * creature's owners and the Dark Master can change it.
 *
 * Whose effects: the token this user has selected, or else the user's own
 * character. With neither, the panel is hidden.
 *
 * The list itself comes from module/ongoing.mjs.
 */

import { actorEffects, changeOngoing } from "./ongoing.mjs";
import { clickHint } from "./rules/effect-kinds.mjs";
import { ongoingOpen, setOngoingOpen } from "./settings.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const ID = "var-borg-ongoing";

export class OngoingPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: ID,
    tag: "aside",
    classes: ["var-borg", "ongoing-panel"],
    // No window frame, and placed by the page layout, not dragged.
    window: { frame: false, positioned: false },
    actions: {
      toggleOngoing: OngoingPanel.#onToggle
    }
  };

  static PARTS = {
    list: { template: "systems/var-borg/templates/ongoing-panel.hbs" }
  };

  /** The creature shown: the selected token's, or else the user's character. Vehicles have no conditions. */
  static currentActor() {
    const actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
    return ["character", "foe", "minion"].includes(actor?.type) ? actor : null;
  }

  /** @override */
  async _prepareContext(options) {
    const actor = OngoingPanel.currentActor();
    const open = ongoingOpen();
    const i18n = game.i18n;
    const canChange = Boolean(actor?.isOwner);
    // What the clicks do, shown in each entry's tooltip.
    const hintFor = entry => {
      const key = canChange ? clickHint(entry) : "";
      return key ? i18n.localize(`VARBORG.Ongoing.Hint.${key}`) : "";
    };
    return {
      shown: Boolean(actor),
      name: actor?.name ?? "",
      open,
      entries: actor ? actorEffects(actor).map(entry => ({
        ...entry,
        tagLabel: entry.tag ? i18n.localize(`VARBORG.Ongoing.Tag.${entry.tag}`) : "",
        hint: hintFor(entry),
        clickable: Boolean(hintFor(entry))
      })) : []
    };
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const li of this.element.querySelectorAll(".ongoing-entry[data-kind]")) {
      const change = async (event, step) => {
        event.preventDefault();
        event.stopPropagation();
        const actor = OngoingPanel.currentActor();
        if (!actor) return;
        game.tooltip.deactivate();
        await changeOngoing(actor, li.dataset.kind, li.dataset.ref, step);
      };
      li.addEventListener("click", event => change(event, 1));
      li.addEventListener("contextmenu", event => change(event, -1));
    }
  }

  /**
   * At the top of the column left of Foundry's sidebar (#ui-right-column-1),
   * where chat notifications also appear lower down.
   * @override
   */
  _insertElement(element) {
    const existing = document.getElementById(element.id);
    if (existing) {
      existing.replaceWith(element);
      return;
    }
    const column = document.getElementById("ui-right-column-1");
    if (column) column.prepend(element);
    else document.body.append(element);
  }

  /** The « / » button: show or hide the names. */
  static async #onToggle() {
    await setOngoingOpen(!ongoingOpen());
    this.render();
  }
}

let panel = null;

/** Redraw the panel soon; many changes often come at once. */
const refresh = foundry.utils.debounce(() => panel?.render(), 100);

/** Called from the init hook. */
export function registerOngoingPanel() {
  Hooks.once("ready", () => {
    panel = new OngoingPanel();
    panel.render({ force: true });
  });
  // Another token selected, or the shown creature changed.
  Hooks.on("controlToken", refresh);
  Hooks.on("canvasReady", refresh);
  Hooks.on("updateUser", refresh);
  Hooks.on("updateActor", refresh);
  Hooks.on("updateToken", refresh);
  for (const kind of ["Item", "ActiveEffect"]) {
    Hooks.on(`create${kind}`, refresh);
    Hooks.on(`update${kind}`, refresh);
    Hooks.on(`delete${kind}`, refresh);
  }
}
