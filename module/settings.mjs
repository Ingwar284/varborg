/**
 * World settings shown in Game Settings → Configure Settings → VÅR BORG.
 *
 * Creation Helper: random character generation is the baseline. With this
 * setting off (the default), the Creation Helper window is hidden and
 * Improving rolls its feat. With it on, the Creation Helper button returns
 * to the character sheet and Improving lets the player choose the feat.
 */

const SYSTEM = "var-borg";
const CREATION_HELPER = "creationHelper";

/** Called from the init hook. */
export function registerSettings() {
  game.settings.register(SYSTEM, CREATION_HELPER, {
    name: "VARBORG.Settings.CreationHelper.Name",
    hint: "VARBORG.Settings.CreationHelper.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    // Redraw open character sheets, so their title-bar buttons change at once.
    onChange: () => {
      for (const app of foundry.applications.instances.values()) {
        if (app.document?.type === "character" && app.rendered) app.render({ force: true });
      }
    }
  });
}

/** Whether the Creation Helper (and choosing the Improving feat by hand) is switched on. */
export function creationHelperOn() {
  return Boolean(game.settings.get(SYSTEM, CREATION_HELPER));
}
