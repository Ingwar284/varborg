/**
 * World settings shown in Game Settings → Configure Settings → VÅR BORG.
 *
 * Creation Helper: random character generation is the baseline. With this
 * setting off (the default), the Creation Helper window is hidden and
 * Improving rolls its feat. With it on, the Creation Helper button returns
 * to the character sheet and Improving lets the player choose the feat.
 *
 * Weather: the Weather subsystem is optional (Dark Master's guide,
 * "Subsystems and optional rules"). With it off, no weather is rolled at a
 * new day or by travel, the Calendar panel shows no weather, and no hazard
 * has any effect (module/weather.mjs). The saved weather is kept, so
 * switching it back on carries on where it left off.
 *
 * Players improve (player feedback): with it on, a player sees the Improve
 * button on their own character too. The Dark Master still says when.
 *
 * Improving feat group (player feedback; rules 2.8 "choose or roll"):
 * "roll" rolls the d3 for general / ancestry / class; "choose" lets whoever
 * improves pick the group, and the feat inside it is still rolled.
 */

const SYSTEM = "var-borg";
const CREATION_HELPER = "creationHelper";
const USE_WEATHER = "useWeather";
const PLAYERS_IMPROVE = "playersImprove";
const IMPROVING_GROUP = "improvingGroup";

/** Called from the init hook. */
export function registerSettings() {
  game.settings.register(SYSTEM, CREATION_HELPER, {
    name: "VARBORG.Settings.CreationHelper.Name",
    hint: "VARBORG.Settings.CreationHelper.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: redrawCharacterSheets
  });

  game.settings.register(SYSTEM, PLAYERS_IMPROVE, {
    name: "VARBORG.Settings.PlayersImprove.Name",
    hint: "VARBORG.Settings.PlayersImprove.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: redrawCharacterSheets
  });

  game.settings.register(SYSTEM, IMPROVING_GROUP, {
    name: "VARBORG.Settings.ImprovingGroup.Name",
    hint: "VARBORG.Settings.ImprovingGroup.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      roll: "VARBORG.Settings.ImprovingGroup.roll",
      choose: "VARBORG.Settings.ImprovingGroup.choose"
    },
    default: "roll"
  });

  game.settings.register(SYSTEM, USE_WEATHER, {
    name: "VARBORG.Settings.UseWeather.Name",
    hint: "VARBORG.Settings.UseWeather.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: redrawTablePanels
  });
}

/** Redraw open character sheets, so their title-bar buttons change at once. */
function redrawCharacterSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app.document?.type === "character" && app.rendered) app.render({ force: true });
  }
}

/** Redraw the open table panels (Calendar, Light, Ember and Gloom). */
function redrawTablePanels() {
  for (const app of foundry.applications.instances.values()) {
    if (app.options.classes?.includes("table-panel") && app.rendered) app.render();
  }
}

/** Whether the Creation Helper (and choosing the Improving feat by hand) is switched on. */
export function creationHelperOn() {
  return Boolean(game.settings.get(SYSTEM, CREATION_HELPER));
}

/** Whether the Weather subsystem is in use. */
export function weatherOn() {
  return Boolean(game.settings.get(SYSTEM, USE_WEATHER));
}

/** Whether players may press Improve on their own characters. */
export function playersImproveOn() {
  return Boolean(game.settings.get(SYSTEM, PLAYERS_IMPROVE));
}

/** Whether the Improving feat's group is chosen rather than rolled. */
export function improvingGroupChosen() {
  return game.settings.get(SYSTEM, IMPROVING_GROUP) === "choose";
}
