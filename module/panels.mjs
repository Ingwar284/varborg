/**
 * The five shared table panels, each with its own button in the token
 * controls (the toolbar on the left):
 * - Calendar & Time: the date, weekday, phase and hour, and the Dark
 *   Master's clock, New day and Rest buttons (module/calendar.mjs,
 *   days.mjs, rest.mjs).
 * - Weather: today's weather and Set weather (module/weather.mjs).
 * - Misery: the Misery, Set Misery and Travel (module/misery.mjs,
 *   travel.mjs).
 * - Light: the light timer (module/light.mjs).
 * - Ember and Gloom: the pools and Reset ember abilities (module/pools.mjs).
 *
 * During combat a sun and a moon at the top of the screen show the two
 * pools too (module/pool-orbs.mjs). At the top right of the map, a light
 * orb shows the light timer, with smaller orbs for the weather and the time
 * of day (module/torch.mjs).
 *
 * Everyone sees all five. They open only from their buttons and orbs.
 */

import { POOL, COSTS, fillForRound, canPay, maySpend } from "./rules/pools.mjs";
import {
  registerPools, getPools, spendFromPool, adjustPoolBy, runningCombat, poolLabel, poolSymbol, weatherPoolBonus
} from "./pools.mjs";
import { resetEmberAbilities } from "./dice/power.mjs";
import { resetVisitUses } from "./uses.mjs";
import { registerDays, newDay } from "./days.mjs";
import {
  registerCalendar, calendarContext, monthContext, otherMonth, nextPhase, moveMinutes, toNextDawn, goToDate, setDate
} from "./calendar.mjs";
import { rest } from "./rest.mjs";
import { registerCalendarNotes, editNote, toggleNoteShown, deleteNote } from "./calendar-notes.mjs";
import { registerDayLog, recordToday } from "./day-log.mjs";
import { registerWeather, weatherContext, setWeatherByHand, currentWeather } from "./weather.mjs";
import { followTodaysWeather } from "./scene-weather.mjs";
import { registerMisery, miseryContext, setMiseryByHand } from "./misery.mjs";
import { travel } from "./travel.mjs";
import { registerPoolOrbs, refreshPoolOrbs } from "./pool-orbs.mjs";
import { registerTorch, refreshTorch } from "./torch.mjs";
import {
  registerLight, lightContext, setLightMinutes, changeLightMinutes, putOutLight, weatherChangedLight
} from "./light.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/** Where the panels sit: their top edge, the leftmost spot, and the gap between two. */
const PANEL_TOP = 70;
const PANEL_LEFT = 120;
const PANEL_GAP = 10;

/** Run a button's work with the button switched off meanwhile. */
async function whileDisabled(button, work) {
  button.disabled = true;
  try {
    await work();
  } finally {
    button.disabled = false;
  }
}

/**
 * What the three panels share: the look. The panels never open by
 * themselves; only their buttons and orbs open them.
 */
class SharedPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "themed", "theme-light", "table-panel"],
    window: { resizable: false },
    position: { width: 280, top: PANEL_TOP }
  };
}

/** The calendar and the time of day, the month grid, New day and Rest (steps 32, 37). */
class CalendarPanel extends SharedPanel {

  /** The month shown in the grid, or null for today's month. Each user browses on their own. */
  #view = null;

  /** The day chosen in the grid, or null for today. */
  #selected = null;

  static DEFAULT_OPTIONS = {
    id: "var-borg-calendar-panel",
    window: { title: "VARBORG.Calendar.Title", icon: "fa-solid fa-calendar-days" },
    position: { width: 470 },
    actions: {
      monthBack: CalendarPanel.#onMonthBack,
      monthOn: CalendarPanel.#onMonthOn,
      showToday: CalendarPanel.#onShowToday,
      selectDay: CalendarPanel.#onSelectDay,
      addNote: CalendarPanel.#onAddNote,
      editNote: CalendarPanel.#onEditNote,
      toggleNote: CalendarPanel.#onToggleNote,
      deleteNote: CalendarPanel.#onDeleteNote,
      newDay: CalendarPanel.#onNewDay,
      rest: CalendarPanel.#onRest,
      nextPhase: CalendarPanel.#onNextPhase,
      moveMinutes: CalendarPanel.#onMoveMinutes,
      nextDawn: CalendarPanel.#onNextDawn,
      goTo: CalendarPanel.#onGoTo,
      setDate: CalendarPanel.#onSetDate
    }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/calendar-panel.hbs" }
  };

  async _prepareContext(options) {
    return { calendar: calendarContext(), month: monthContext(this.#view, this.#selected), isGM: game.user.isGM };
  }

  /** The month grid: the month before. */
  static #onMonthBack() {
    this.#view = otherMonth(this.#view, -1);
    this.render();
  }

  /** The month grid: the month after. */
  static #onMonthOn() {
    this.#view = otherMonth(this.#view, 1);
    this.render();
  }

  /** The month grid: back to today. */
  static #onShowToday() {
    this.#view = null;
    this.#selected = null;
    this.render();
  }

  /** The month grid: choose a day to see what it holds. */
  static #onSelectDay(event, target) {
    const day = Number(target.dataset.day);
    this.#selected = day;
    // Keep the grid on the chosen day's month.
    const { selected } = monthContext(this.#view, day);
    this.#view = { year: selected.year, monthIndex: selected.monthIndex };
    this.render();
  }

  /** The day chosen in the grid (today if none). */
  get #pickedDay() {
    return monthContext(this.#view, this.#selected).selected.day;
  }

  /**
   * The note a button belongs to: its id, and the day it is kept under (a
   * recurring note seen in a later year is kept under the day it was written).
   */
  static #noteOf(button) {
    const row = button.closest("[data-note-id]");
    return { day: Number(row?.dataset.noteDay), id: row?.dataset.noteId };
  }

  /** Dark Master only: write a note on the chosen day. */
  static async #onAddNote(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, () => editNote(this.#pickedDay));
  }

  /** Dark Master only: change a note. */
  static async #onEditNote(event, button) {
    if (!game.user.isGM) return;
    const { day, id } = CalendarPanel.#noteOf(button);
    await editNote(day, id);
  }

  /** Dark Master only: show a note to players, or hide it. */
  static async #onToggleNote(event, button) {
    if (!game.user.isGM) return;
    const { day, id } = CalendarPanel.#noteOf(button);
    await toggleNoteShown(day, id);
  }

  /** Dark Master only: delete a note. */
  static async #onDeleteNote(event, button) {
    if (!game.user.isGM) return;
    const { day, id } = CalendarPanel.#noteOf(button);
    await deleteNote(day, id);
  }

  /** Dark Master only: ask who ate, then start the next day (rules 3.16). */
  static async #onNewDay(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, newDay);
  }

  /** Dark Master only: Short rest, Long rest or Downtime (rules 3.16). */
  static async #onRest(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, rest);
  }

  /** Dark Master only: on to the next noon, dusk or dawn. */
  static async #onNextPhase(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, nextPhase);
  }

  /** Dark Master only: the clock some minutes on or back (−1 h, +10 min, +1 h). */
  static async #onMoveMinutes(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, () => moveMinutes(Number(button.dataset.minutes)));
  }

  /** Dark Master only: +1 day, on to the next dawn. */
  static async #onNextDawn(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, toNextDawn);
  }

  /** Dark Master only: set the date and time straight, with no new day. */
  static async #onSetDate(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, setDate);
  }

  /** Dark Master only: go to a date and time typed in. */
  static async #onGoTo(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, goToDate);
  }
}

/** Today's weather on the hex flower (step 38). */
class WeatherPanel extends SharedPanel {

  static DEFAULT_OPTIONS = {
    id: "var-borg-weather-panel",
    window: { title: "VARBORG.Weather.Title", icon: "fa-solid fa-cloud-sun-rain" },
    actions: {
      setWeather: WeatherPanel.#onSetWeather
    }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/weather-panel.hbs" }
  };

  async _prepareContext(options) {
    return { weather: weatherContext(), isGM: game.user.isGM };
  }

  /** Dark Master only: pick today's weather on the hex flower. */
  static async #onSetWeather(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, setWeatherByHand);
  }
}

/** The Misery and overland travel (steps 39, 40). */
class MiseryPanel extends SharedPanel {

  static DEFAULT_OPTIONS = {
    id: "var-borg-misery-panel",
    window: { title: "VARBORG.Misery.Title", icon: "fa-solid fa-skull" },
    actions: {
      setMisery: MiseryPanel.#onSetMisery,
      travel: MiseryPanel.#onTravel
    }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/misery-panel.hbs" }
  };

  async _prepareContext(options) {
    return { misery: miseryContext(), isGM: game.user.isGM };
  }

  /** Dark Master only: set the Misery by hand. */
  static async #onSetMisery(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, setMiseryByHand);
  }

  /** Dark Master only: travel for a phase and roll the encounter table. */
  static async #onTravel(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, travel);
  }
}

/** The light timer (rules 3.15, step 35). */
export class LightPanel extends SharedPanel {

  static DEFAULT_OPTIONS = {
    id: "var-borg-light-panel",
    window: { title: "VARBORG.Light.Title", icon: "fa-solid fa-fire-flame-curved" },
    actions: {
      lightStart: LightPanel.#onLightStart,
      lightChange: LightPanel.#onLightChange,
      lightOut: LightPanel.#onLightOut
    }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/light-panel.hbs" }
  };

  async _prepareContext(options) {
    return { light: lightContext(), isGM: game.user.isGM };
  }

  /** Dark Master only: start the light timer for the minutes typed in. */
  static async #onLightStart(event, button) {
    if (!game.user.isGM) return;
    const minutes = Number(this.element.querySelector("input[name='lightMinutes']")?.value);
    if (!(minutes >= 1)) {
      ui.notifications.warn("VARBORG.Light.Bad", { localize: true });
      return;
    }
    await setLightMinutes(minutes);
  }

  /** Dark Master only: lengthen or shorten the running light timer. */
  static async #onLightChange(event, button) {
    if (!game.user.isGM) return;
    await changeLightMinutes(Number(button.dataset.minutes));
  }

  /** Dark Master only: put the lights out. */
  static async #onLightOut(event, button) {
    if (!game.user.isGM) return;
    await putOutLight();
  }
}

/** The Ember and Gloom pools (rules 3.10, step 26). */
export class PoolsPanel extends SharedPanel {

  static DEFAULT_OPTIONS = {
    id: "var-borg-pools-panel",
    window: { title: "VARBORG.Pools.Title", icon: "fa-solid fa-fire" },
    actions: {
      spend: PoolsPanel.#onSpend,
      adjust: PoolsPanel.#onAdjust,
      resetEmber: PoolsPanel.#onResetEmber,
      resetVisit: PoolsPanel.#onResetVisit
    }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/pools-panel.hbs" }
  };

  async _prepareContext(options) {
    const combat = runningCombat();
    const round = combat?.round ?? 0;
    const isGM = game.user.isGM;
    const pools = getPools();
    const bonus = weatherPoolBonus();
    const { hazard } = currentWeather();
    return {
      inCombat: !!combat,
      round,
      fill: combat ? fillForRound(round) : 0,
      // A Day of ember or Day of gloom (step 41).
      weatherBonus: [POOL.EMBER, POOL.GLOOM].filter(id => bonus[id]).map(id => game.i18n.format("VARBORG.Pools.WeatherBonusPanel", {
        hazard: game.i18n.localize(`VARBORG.Weather.Hazard.${hazard}.Name`),
        pool: poolLabel(id),
        symbol: poolSymbol(id),
        amount: bonus[id]
      })),
      isGM,
      pools: [POOL.EMBER, POOL.GLOOM].map(id => ({
        id,
        label: poolLabel(id),
        symbol: poolSymbol(id),
        left: pools[id],
        canSpend: maySpend(id, isGM),
        canAdjust: isGM && !!combat,
        costs: COSTS.map(cost => ({ cost, disabled: !combat || !canPay(pools[id], cost) }))
      }))
    };
  }

  static async #onSpend(event, button) {
    button.disabled = true;
    await spendFromPool(button.dataset.pool, Number(button.dataset.cost));
    this.render();
  }

  static async #onAdjust(event, button) {
    await adjustPoolBy(button.dataset.pool, Number(button.dataset.delta));
  }

  /** Dark Master only: every character's ember abilities work once again outside combat (GAPS 22). */
  static async #onResetEmber(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, () => resetEmberAbilities(game.actors.contents, { announce: true }));
  }

  /** Dark Master only: once-per-visit uses come back, as at a new settlement (GAPS 190). */
  static async #onResetVisit(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, () => resetVisitUses());
  }
}

/** The five panels, by key. */
const PANELS = {
  calendar: CalendarPanel, weather: WeatherPanel, misery: MiseryPanel, light: LightPanel, pools: PoolsPanel
};

/** The toolbar buttons: name, tooltip and icon. */
const BUTTONS = [
  { key: "calendar", name: "varBorgCalendar", title: "VARBORG.Calendar.Open", icon: "fa-solid fa-calendar-days" },
  { key: "weather", name: "varBorgWeather", title: "VARBORG.Weather.Open", icon: "fa-solid fa-cloud-sun-rain" },
  { key: "misery", name: "varBorgMisery", title: "VARBORG.Misery.Open", icon: "fa-solid fa-skull" },
  { key: "light", name: "varBorgLight", title: "VARBORG.Light.Open", icon: "fa-solid fa-fire-flame-curved" },
  { key: "pools", name: "varBorgTable", title: "VARBORG.Pools.Open", icon: "fa-solid fa-fire" }
];

/** Hook up the panels, the settings they show and their buttons. */
export function registerPanels() {
  // The calendar panel, and the time-of-day orb beside the light orb.
  const refreshCalendar = () => {
    refresh(CalendarPanel);
    refreshTorch();
  };
  // The panel and the light orb at the top right of the map (module/torch.mjs).
  const refreshLight = () => {
    refresh(LightPanel);
    refreshTorch();
  };
  registerTorch({
    openLight: () => openIfClosed("light"),
    openCalendar: () => openIfClosed("calendar"),
    openWeather: () => openIfClosed("weather")
  });
  // The panel and the sun and moon orbs at the top of the screen (module/pool-orbs.mjs).
  const refreshPools = () => {
    refresh(PoolsPanel);
    refreshPoolOrbs();
  };
  registerPoolOrbs(() => openIfClosed("pools"));

  // Ember and Gloom (module/pools.mjs), redrawn as combat changes too.
  registerPools(refreshPools);
  for (const hook of ["createCombat", "updateCombat", "deleteCombat"]) Hooks.on(hook, refreshPools);
  // The day counter (module/days.mjs) and the world clock (module/calendar.mjs).
  // A new day also starts its entry in the day log (module/day-log.mjs).
  registerDays(() => {
    refreshCalendar();
    recordToday();
  });
  registerCalendar(refreshCalendar);
  registerDayLog(() => refresh(CalendarPanel));
  // Notes on calendar days (module/calendar-notes.mjs).
  registerCalendarNotes(() => refresh(CalendarPanel));
  // Today's weather on the hex flower (module/weather.mjs), and the weather orb.
  // A change of weather can change the pools (Day of ember, Day of gloom)
  // and the light (Blackburn) too (step 41).
  registerWeather(() => {
    refresh(WeatherPanel);
    recordToday();
    refreshTorch();
    refreshPools();
    refreshLight();
    weatherChangedLight();
    // Scenes that follow today's weather show its effect (step 63).
    followTodaysWeather();
  });
  // The Misery (module/misery.mjs).
  registerMisery(() => {
    refresh(MiseryPanel);
    recordToday();
  });
  // The light timer (module/light.mjs).
  registerLight(refreshLight);

  Hooks.on("getSceneControlButtons", addPanelButtons);
}

/** Redraw a panel if it is open. */
function refresh(Panel) {
  foundry.applications.instances.get(Panel.DEFAULT_OPTIONS.id)?.render();
}

/**
 * The first free spot in the row of panels along the top: from the left,
 * past any panel already open there, so a panel opened on its own goes to
 * the left rather than where it would sit beside the others.
 */
function freeLeft(Panel) {
  const width = Panel.DEFAULT_OPTIONS.position?.width ?? SharedPanel.DEFAULT_OPTIONS.position.width;
  const inRow = Object.values(PANELS)
    .map(P => foundry.applications.instances.get(P.DEFAULT_OPTIONS.id))
    .filter(app => app?.rendered && app.element)
    .map(app => app.element.getBoundingClientRect())
    .filter(pos => pos.top <= PANEL_TOP + 30 && pos.bottom >= PANEL_TOP)
    .sort((a, b) => a.left - b.left);
  let left = PANEL_LEFT;
  for (const pos of inRow) {
    if (left + width + PANEL_GAP <= pos.left) break;
    left = Math.max(left, pos.left + pos.width + PANEL_GAP);
  }
  return left;
}

/** Open a panel in the first free spot along the top. */
function openPanel(Panel) {
  return new Panel({ position: { top: PANEL_TOP, left: freeLeft(Panel) } }).render({ force: true });
}

/** Open a panel unless it is already open. */
function openIfClosed(key) {
  if (!foundry.applications.instances.get(PANELS[key].DEFAULT_OPTIONS.id)) togglePanel(key);
}

/** Open the panel, or close it if it is open. */
function togglePanel(key) {
  const Panel = PANELS[key];
  const app = foundry.applications.instances.get(Panel.DEFAULT_OPTIONS.id);
  if (app) {
    app.close();
    return;
  }
  openPanel(Panel);
}

/** One button per panel in the token controls (left toolbar). */
function addPanelButtons(controls) {
  const tools = controls.tokens?.tools;
  if (!tools) return;
  for (const { key, name, title, icon } of BUTTONS) {
    tools[name] = {
      name,
      title,
      icon,
      order: Object.keys(tools).length,
      button: true,
      visible: true,
      onChange: () => togglePanel(key)
    };
  }
}
