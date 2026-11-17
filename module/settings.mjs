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
 * new day or by travel, the Weather panel shows no weather, and no hazard
 * has any effect (module/weather.mjs). The saved weather is kept, so
 * switching it back on carries on where it left off.
 *
 * Players improve (player feedback): with it on, a player sees the Improve
 * button on their own character too. The Dark Master still says when.
 *
 * Dying of the light (GAPS 307): the Miseries come by the light die of
 * rules 1.5 (the default), or by the Omens of Misery, where the Omen
 * results on the road move each Misery through its six omens. With Omens,
 * "Omens before the next Misery" (1 to 6) sets when the next one is due.
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
const ONGOING_OPEN = "ongoingOpen";
const ENCOUNTER_PARTY = "encounterParty";
const MISERY_MODE = "miseryMode";
const OMENS_PER_MISERY = "omensPerMisery";

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

  // The encounter builder's party size, remembered between sessions for this user.
  game.settings.register(SYSTEM, ENCOUNTER_PARTY, {
    scope: "client",
    config: false,
    type: Number,
    default: 4
  });

  // The Ongoing panel beside the sidebar: names shown or icons only, for this user.
  game.settings.register(SYSTEM, ONGOING_OPEN, {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
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

  game.settings.register(SYSTEM, MISERY_MODE, {
    name: "VARBORG.Settings.MiseryMode.Name",
    hint: "VARBORG.Settings.MiseryMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      lightDie: "VARBORG.Settings.MiseryMode.lightDie",
      omens: "VARBORG.Settings.MiseryMode.omens"
    },
    default: "lightDie",
    onChange: redrawTablePanels
  });

  game.settings.register(SYSTEM, OMENS_PER_MISERY, {
    name: "VARBORG.Settings.OmensPerMisery.Name",
    hint: "VARBORG.Settings.OmensPerMisery.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 6, step: 1 },
    default: 4,
    onChange: redrawTablePanels
  });
}

/** Whether the Miseries come by the Omens of Misery (GAPS 307), not the light die. */
export function omensMode() {
  return game.settings.get(SYSTEM, MISERY_MODE) === "omens";
}

/** How many omens of the newest Misery bring the next one (1 to 6). */
export function omensPerMisery() {
  return Number(game.settings.get(SYSTEM, OMENS_PER_MISERY));
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

/** The party size the encounter builder last used. */
export function encounterParty() {
  return Number(game.settings.get(SYSTEM, ENCOUNTER_PARTY));
}

/** Remember the encounter builder's party size. */
export function setEncounterParty(players) {
  return game.settings.set(SYSTEM, ENCOUNTER_PARTY, Number(players));
}

/** Whether the Ongoing panel shows names as well as icons, for this user. */
export function ongoingOpen() {
  return Boolean(game.settings.get(SYSTEM, ONGOING_OPEN));
}

/** Show or hide the names in the Ongoing panel, for this user. */
export function setOngoingOpen(open) {
  return game.settings.set(SYSTEM, ONGOING_OPEN, Boolean(open));
}

/** Whether the Improving feat's group is chosen rather than rolled. */
export function improvingGroupChosen() {
  return game.settings.get(SYSTEM, IMPROVING_GROUP) === "choose";
}
