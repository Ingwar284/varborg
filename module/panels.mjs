/**
 * The three shared table panels, each with its own button in the token
 * controls (the toolbar on the left):
 * - Calendar: the date, weekday, phase and hour, today's weather, the
 *   Misery, and the Dark Master's clock, New day, Rest, Set weather and
 *   Set Misery buttons (module/calendar.mjs, days.mjs, rest.mjs,
 *   weather.mjs, misery.mjs).
 * - Light: the light timer (module/light.mjs).
 * - Ember and Gloom: the pools and Reset ember abilities (module/pools.mjs).
 *
 * Everyone sees all three. Each user's open panels are remembered (a
 * client setting), and reopen when the world loads. All three start open.
 */

import { POOL, COSTS, fillForRound, canPay, maySpend } from "./rules/pools.mjs";
import { registerPools, getPools, spendFromPool, adjustPoolBy, runningCombat, poolLabel, poolSymbol } from "./pools.mjs";
import { resetEmberAbilities } from "./dice/power.mjs";
import { registerDays, newDay } from "./days.mjs";
import { registerCalendar, calendarContext, nextPhase, moveHours } from "./calendar.mjs";
import { rest } from "./rest.mjs";
import { registerWeather, weatherContext, setWeatherByHand } from "./weather.mjs";
import { registerMisery, miseryContext, setMiseryByHand } from "./misery.mjs";
import { registerLight, lightContext, setLightMinutes, changeLightMinutes, putOutLight } from "./light.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const SYSTEM = "var-borg";
const OPEN_SETTING = "openPanels";

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
 * What the three panels share: the look, and remembering whether the
 * panel is open.
 */
class SharedPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** The key in the openPanels setting. */
  static KEY = "";

  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "table-panel"],
    window: { resizable: false },
    position: { width: 280 }
  };

  /** Closing with the window's ✕ (or the button) forgets the panel. */
  _onClose(options) {
    super._onClose(options);
    rememberOpen(this.constructor.KEY, false);
  }
}

/** The calendar: date, time of day, weather, Misery, New day and Rest (steps 37 to 39). */
export class CalendarPanel extends SharedPanel {
  static KEY = "calendar";

  static DEFAULT_OPTIONS = {
    id: "var-borg-calendar-panel",
    window: { title: "VARBORG.Calendar.Title", icon: "fa-solid fa-calendar-days" },
    position: { top: 70, left: 120 },
    actions: {
      newDay: CalendarPanel.#onNewDay,
      rest: CalendarPanel.#onRest,
      nextPhase: CalendarPanel.#onNextPhase,
      moveHours: CalendarPanel.#onMoveHours,
      setWeather: CalendarPanel.#onSetWeather,
      setMisery: CalendarPanel.#onSetMisery
    }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/calendar-panel.hbs" }
  };

  async _prepareContext(options) {
    return { calendar: calendarContext(), weather: weatherContext(), misery: miseryContext(), isGM: game.user.isGM };
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

  /** Dark Master only: the clock one hour on or back. */
  static async #onMoveHours(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, () => moveHours(Number(button.dataset.hours)));
  }

  /** Dark Master only: pick today's weather on the hex flower (step 38). */
  static async #onSetWeather(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, setWeatherByHand);
  }

  /** Dark Master only: set the Misery by hand (step 39). */
  static async #onSetMisery(event, button) {
    if (!game.user.isGM) return;
    await whileDisabled(button, setMiseryByHand);
  }
}

/** The light timer (rules 3.15, step 35). */
export class LightPanel extends SharedPanel {
  static KEY = "light";

  static DEFAULT_OPTIONS = {
    id: "var-borg-light-panel",
    window: { title: "VARBORG.Light.Title", icon: "fa-solid fa-fire-flame-curved" },
    position: { top: 70, left: 410 },
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
  static KEY = "pools";

  static DEFAULT_OPTIONS = {
    id: "var-borg-pools-panel",
    window: { title: "VARBORG.Pools.Title", icon: "fa-solid fa-fire" },
    position: { top: 70, left: 700 },
    actions: {
      spend: PoolsPanel.#onSpend,
      adjust: PoolsPanel.#onAdjust,
      resetEmber: PoolsPanel.#onResetEmber
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
    return {
      inCombat: !!combat,
      round,
      fill: combat ? fillForRound(round) : 0,
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
}

/** The three panels, by key. */
const PANELS = { calendar: CalendarPanel, light: LightPanel, pools: PoolsPanel };

/** The toolbar buttons: name, tooltip and icon. */
const BUTTONS = [
  { key: "calendar", name: "varBorgCalendar", title: "VARBORG.Calendar.Open", icon: "fa-solid fa-calendar-days" },
  { key: "light", name: "varBorgLight", title: "VARBORG.Light.Open", icon: "fa-solid fa-fire-flame-curved" },
  { key: "pools", name: "varBorgTable", title: "VARBORG.Pools.Open", icon: "fa-solid fa-fire" }
];

/** Hook up the panels, the settings they show and their buttons. */
export function registerPanels() {
  game.settings.register(SYSTEM, OPEN_SETTING, {
    scope: "client",
    config: false,
    type: Object,
    default: { calendar: true, light: true, pools: true }
  });
  const refreshCalendar = () => refresh(CalendarPanel);
  const refreshLight = () => refresh(LightPanel);
  const refreshPools = () => refresh(PoolsPanel);

  // Ember and Gloom (module/pools.mjs), redrawn as combat changes too.
  registerPools(refreshPools);
  for (const hook of ["createCombat", "updateCombat", "deleteCombat"]) Hooks.on(hook, refreshPools);
  // The day counter (module/days.mjs) and the world clock (module/calendar.mjs).
  registerDays(refreshCalendar);
  registerCalendar(refreshCalendar);
  // Today's weather on the hex flower (module/weather.mjs).
  registerWeather(refreshCalendar);
  // The Misery (module/misery.mjs).
  registerMisery(refreshCalendar);
  // The light timer (module/light.mjs).
  registerLight(refreshLight);

  Hooks.on("getSceneControlButtons", addPanelButtons);
  Hooks.once("ready", openRemembered);
}

/** Redraw a panel if it is open. */
function refresh(Panel) {
  foundry.applications.instances.get(Panel.DEFAULT_OPTIONS.id)?.render();
}

/** Which panels this user has open. */
function openPanels() {
  return { calendar: true, light: true, pools: true, ...game.settings.get(SYSTEM, OPEN_SETTING) };
}

function rememberOpen(key, open) {
  if (!game.ready || openPanels()[key] === open) return;
  game.settings.set(SYSTEM, OPEN_SETTING, { ...openPanels(), [key]: open });
}

/** When the world loads: open the panels this user had open. */
function openRemembered() {
  const open = openPanels();
  for (const [key, Panel] of Object.entries(PANELS)) {
    if (open[key]) new Panel().render({ force: true });
  }
}

/** Open the panel, or close it if it is open. */
function togglePanel(key) {
  const Panel = PANELS[key];
  const app = foundry.applications.instances.get(Panel.DEFAULT_OPTIONS.id);
  if (app) {
    app.close();
    return;
  }
  rememberOpen(key, true);
  new Panel().render({ force: true });
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
