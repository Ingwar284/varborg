/**
 * The Ember and Gloom pools in Foundry (rules 3.10, GAPS 24).
 *
 * Both pools live in one world setting, so everyone sees the same numbers.
 * The Dark Master's client fills them at the start of each round, empties
 * them at the end of each round and when combat ends (module/combat.mjs).
 *
 * The Table panel shows both pools to everyone. Players spend Ember from it;
 * only the Dark Master spends Gloom or adjusts a pool by hand. Players may
 * not change world settings, so a player's spend is sent to the Dark
 * Master's client (a Foundry query), which checks it and pays it.
 *
 * The maths lives in module/rules/pools.mjs.
 */

import { POOL, COSTS, fillForRound, emptyPools, poolsForRound, canPay, pay, adjustPool, maySpend } from "./rules/pools.mjs";
import { resetEmberAbilities } from "./dice/power.mjs";
import { registerDays, currentDay, newDay } from "./days.mjs";

const SYSTEM = "var-borg";
const SETTING = "pools";
const QUERY = "var-borg.pools";
const PANEL_ID = "var-borg-table-panel";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/** Hook up the pools: the setting, the query, the panel and its button. */
export function registerPools() {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: emptyPools(),
    onChange: refreshPanel
  });
  // The day counter is shown on the same panel (module/days.mjs).
  registerDays(refreshPanel);
  CONFIG.queries[QUERY] = (request, { user }) => changePool(request, user);

  for (const hook of ["createCombat", "updateCombat", "deleteCombat"]) Hooks.on(hook, refreshPanel);
  Hooks.on("getSceneControlButtons", addPanelButton);
  Hooks.once("ready", () => new TablePanel().render({ force: true }));
}

/** Both pools as they stand. */
export function getPools() {
  return { ...emptyPools(), ...game.settings.get(SYSTEM, SETTING) };
}

/** The combat that is running, or null. */
function runningCombat() {
  const combat = game.combats.active;
  return combat?.started ? combat : null;
}

/* -------------------------------------------- */
/*  Dark Master only: filling and emptying       */
/* -------------------------------------------- */

/** Start of a round: fill both pools to round × 5. */
export async function fillPools(round) {
  if (!game.user.isActiveGM) return;
  await game.settings.set(SYSTEM, SETTING, poolsForRound(round));
}

/** End of a round, or combat ended: both pools empty. */
export async function drainPools() {
  if (!game.user.isActiveGM) return;
  await game.settings.set(SYSTEM, SETTING, emptyPools());
}

/* -------------------------------------------- */
/*  Spending and adjusting                       */
/* -------------------------------------------- */

/**
 * Spend charges from a pool. A player's request goes through the Dark
 * Master. Later steps (powers, spells) call this too.
 * @param {string} pool  POOL.EMBER or POOL.GLOOM.
 * @param {number} cost
 * @param {Actor} [actor]  Who spends it (the caster, the foe), named on the
 *   chat line. Without one (the Table panel) the line names the user.
 * @returns {Promise<boolean>} Whether the charges were spent.
 */
export async function spendFromPool(pool, cost, actor = null) {
  return sendChange({ pool, kind: "spend", amount: cost, actorUuid: actor?.uuid ?? null });
}

/**
 * The Dark Master changes a pool by hand (+1 or −1).
 * @param {string} pool
 * @param {number} delta
 */
export async function adjustPoolBy(pool, delta) {
  return sendChange({ pool, kind: "adjust", amount: delta });
}

/** Run the change here (Dark Master) or ask the Dark Master to run it. */
async function sendChange(request) {
  let result;
  if (game.user.isActiveGM) result = await changePool(request, game.user);
  else {
    const gm = game.users.activeGM;
    if (!gm) {
      ui.notifications.warn("VARBORG.Pools.NoGM", { localize: true });
      return false;
    }
    try {
      result = await gm.query(QUERY, request, { timeout: 30000 });
    } catch (error) {
      console.error("VÅR BORG | Pool query failed", error);
      result = { error: "VARBORG.Pools.NoGM" };
    }
  }
  if (result?.error) {
    ui.notifications.warn(game.i18n.format(result.error, { pool: poolLabel(request.pool) }));
    return false;
  }
  return true;
}

/**
 * One change at a time, so two players spending at once cannot overwrite
 * each other's spend. Who spends first is the Dark Master's call (GAPS 24).
 */
let queue = Promise.resolve();

/**
 * Check and make a change. Runs on the Dark Master's client.
 * @param {{pool: string, kind: "spend"|"adjust", amount: number}} request
 * @param {User} user  Who asked.
 * @returns {Promise<{ok: true, left: number}|{error: string}>}
 */
function changePool(request, user) {
  const run = queue.then(() => applyChange(request, user));
  queue = run.catch(() => {});
  return run;
}

async function applyChange({ pool, kind, amount, actorUuid }, user) {
  if (!Object.values(POOL).includes(pool) || !Number.isInteger(amount)) return { error: "VARBORG.Pools.Bad" };
  if (!runningCombat()) return { error: "VARBORG.Pools.NoCombat" };
  const pools = getPools();
  const left = pools[pool];

  if (kind === "adjust") {
    if (!user.isGM) return { error: "VARBORG.Pools.GMOnly" };
    pools[pool] = adjustPool(left, amount);
    await game.settings.set(SYSTEM, SETTING, pools);
    return { ok: true, left: pools[pool] };
  }

  if (kind !== "spend" || amount < 1) return { error: "VARBORG.Pools.Bad" };
  if (!maySpend(pool, user.isGM)) return { error: "VARBORG.Pools.GMOnly" };
  if (!canPay(left, amount)) return { error: "VARBORG.Pools.NotEnough" };
  pools[pool] = pay(left, amount);
  await game.settings.set(SYSTEM, SETTING, pools);
  await postSpend(pool, amount, pools[pool], user, spenderOf(actorUuid, user));
  return { ok: true, left: pools[pool] };
}

/**
 * The actor named on the spend line: the one sent with the spend, if the
 * user who asked owns it; else the user's own character (players only).
 */
function spenderOf(actorUuid, user) {
  const actor = actorUuid ? fromUuidSync(actorUuid) : null;
  if (actor?.testUserPermission?.(user, "OWNER")) return actor;
  return user.isGM ? null : (user.character ?? null);
}

/** A chat line: "Example Hero spends 🟒3 from the Ember pool (7 left)." */
async function postSpend(pool, amount, left, user, actor) {
  const name = actor?.name ?? user.name;
  const text = game.i18n.format("VARBORG.Pools.Spent", {
    name, symbol: poolSymbol(pool), amount, pool: poolLabel(pool), left
  });
  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : { alias: user.name },
    content: `<div class="var-borg-card pool-card ${pool}"><p>${text}</p></div>`
  });
}

function poolLabel(pool) {
  return game.i18n.localize(pool === POOL.GLOOM ? "VARBORG.Pools.Gloom" : "VARBORG.Pools.Ember");
}

function poolSymbol(pool) {
  return pool === POOL.GLOOM ? "☾" : "🟒";
}

/* -------------------------------------------- */
/*  The Table panel                              */
/* -------------------------------------------- */

/** Redraw the panel if it is open. */
function refreshPanel() {
  foundry.applications.instances.get(PANEL_ID)?.render();
}

/** A button in the token controls (left toolbar) that opens or closes the panel. */
function addPanelButton(controls) {
  const tools = controls.tokens?.tools;
  if (!tools) return;
  tools.varBorgTable = {
    name: "varBorgTable",
    title: "VARBORG.Pools.Open",
    icon: "fa-solid fa-fire",
    order: Object.keys(tools).length,
    button: true,
    visible: true,
    onChange: () => {
      const open = foundry.applications.instances.get(PANEL_ID);
      if (open) open.close();
      else new TablePanel().render({ force: true });
    }
  };
}

/**
 * The shared table panel: the day, the Ember and Gloom pools, and the Dark
 * Master's New day and Reset ember abilities buttons. The light timer
 * comes in a later step.
 */
export class TablePanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: PANEL_ID,
    classes: ["var-borg", "table-panel"],
    window: { title: "VARBORG.Pools.Title", icon: "fa-solid fa-fire", resizable: false },
    position: { width: 280, top: 70, left: 120 },
    actions: {
      spend: TablePanel.#onSpend,
      adjust: TablePanel.#onAdjust,
      resetEmber: TablePanel.#onResetEmber,
      newDay: TablePanel.#onNewDay
    }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/table-panel.hbs" }
  };

  async _prepareContext(options) {
    const combat = runningCombat();
    const round = combat?.round ?? 0;
    const isGM = game.user.isGM;
    const pools = getPools();
    return {
      day: currentDay(),
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
    button.disabled = true;
    await resetEmberAbilities(game.actors.contents, { announce: true });
    button.disabled = false;
  }

  /** Dark Master only: ask who ate, then start the next day (rules 3.16). */
  static async #onNewDay(event, button) {
    if (!game.user.isGM) return;
    button.disabled = true;
    try {
      await newDay();
    } finally {
      button.disabled = false;
    }
  }
}
