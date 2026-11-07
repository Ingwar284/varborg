/**
 * The Ember and Gloom pools in Foundry (rules 3.10, GAPS 24).
 *
 * Both pools live in one world setting, so everyone sees the same numbers.
 * The Dark Master's client fills them at the start of each round, empties
 * them at the end of each round and when combat ends (module/combat.mjs).
 *
 * The Ember and Gloom panel (module/panels.mjs) shows both pools to everyone. Players spend Ember from it;
 * only the Dark Master spends Gloom or adjusts a pool by hand. Players may
 * not change world settings, so a player's spend is sent to the Dark
 * Master's client (a Foundry query), which checks it and pays it.
 *
 * The maths lives in module/rules/pools.mjs.
 */

import { POOL, emptyPools, poolsForRound, canPay, pay, adjustPool, maySpend } from "./rules/pools.mjs";
import { poolBonusFor } from "./rules/weather-effects.mjs";
import { currentWeather } from "./weather.mjs";

const SYSTEM = "var-borg";
const SETTING = "pools";
const QUERY = "var-borg.pools";

/**
 * Hook up the pools: the setting and the query.
 * @param {Function} onChange  Redraws the Ember and Gloom panel.
 */
export function registerPools(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: emptyPools(),
    onChange
  });
  CONFIG.queries[QUERY] = (request, { user }) => changePool(request, user);
}

/** Both pools as they stand. */
export function getPools() {
  return { ...emptyPools(), ...game.settings.get(SYSTEM, SETTING) };
}

/** The combat that is running, or null. */
export function runningCombat() {
  const combat = game.combats.active;
  return combat?.started ? combat : null;
}

/* -------------------------------------------- */
/*  Dark Master only: filling and emptying       */
/* -------------------------------------------- */

/**
 * Start of a round: fill both pools to round × 5. On a Day of ember or a
 * Day of gloom, that pool gains an extra 5, and a chat line says so
 * (step 41).
 */
export async function fillPools(round) {
  if (!game.user.isActiveGM) return;
  const { hazard } = currentWeather();
  const bonus = poolBonusFor(hazard);
  await game.settings.set(SYSTEM, SETTING, poolsForRound(round, bonus));
  for (const pool of [POOL.EMBER, POOL.GLOOM]) {
    if (bonus[pool]) await postWeatherBonus(pool, bonus[pool], hazard);
  }
}

/** "Day of ember: the Ember pool gains an extra 🟒5 this round." */
async function postWeatherBonus(pool, amount, hazard) {
  const text = game.i18n.format("VARBORG.Pools.WeatherBonus", {
    hazard: game.i18n.localize(`VARBORG.Weather.Hazard.${hazard}.Name`),
    pool: poolLabel(pool),
    symbol: poolSymbol(pool),
    amount
  });
  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("VARBORG.Weather.CardTitle") },
    content: `<div class="var-borg-card pool-card ${pool}"><p>${foundry.utils.escapeHTML(text)}</p></div>`
  });
}

/** Today's extra charges for each pool, for the Ember and Gloom panel. */
export function weatherPoolBonus() {
  return poolBonusFor(currentWeather().hazard);
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
 *   chat line. Without one (the Ember and Gloom panel) the line names the user.
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

/**
 * Add charges to the Ember pool from something a character uses, such as
 * the Shard of the Great Brazier (step 43, GAPS 174). Anyone may, in
 * combat; the chat line names who did it.
 * @param {number} amount  Charges to add, 1 or more.
 * @param {Actor} actor    Who adds them.
 * @param {string} [source]  What adds them, such as the relic's name.
 * @returns {Promise<boolean>} Whether they were added.
 */
export async function gainEmber(amount, actor, source = "") {
  return sendChange({ pool: POOL.EMBER, kind: "gain", amount, actorUuid: actor?.uuid ?? null, source });
}

/**
 * The Ember pool loses charges to a foe's ability (Purge Pulse: "the
 * party's ember pool loses 1 charge", step 52c). Anyone may, in combat; it
 * never goes below 0. The chat line names the ability.
 * @param {number} amount  Charges lost, 1 or more.
 * @param {Actor} actor    Who it happened to.
 * @param {string} [source]  The ability's name.
 */
export async function loseEmber(amount, actor, source = "") {
  return sendChange({ pool: POOL.EMBER, kind: "lose", amount, actorUuid: actor?.uuid ?? null, source });
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

async function applyChange({ pool, kind, amount, actorUuid, source = "" }, user) {
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

  if (kind === "gain") {
    if (pool !== POOL.EMBER || amount < 1) return { error: "VARBORG.Pools.Bad" };
    pools[pool] = adjustPool(left, amount);
    await game.settings.set(SYSTEM, SETTING, pools);
    await postGain(pool, amount, pools[pool], user, spenderOf(actorUuid, user), String(source ?? ""));
    return { ok: true, left: pools[pool] };
  }

  if (kind === "lose") {
    if (pool !== POOL.EMBER || amount < 1) return { error: "VARBORG.Pools.Bad" };
    pools[pool] = adjustPool(left, -amount);
    await game.settings.set(SYSTEM, SETTING, pools);
    const actor = actorUuid ? fromUuidSync(actorUuid) : null;
    const text = game.i18n.format("VARBORG.Pools.Lost", {
      symbol: poolSymbol(pool), amount: left - pools[pool], pool: poolLabel(pool), left: pools[pool], source: foundry.utils.escapeHTML(String(source ?? ""))
    });
    await ChatMessage.create({
      speaker: actor ? ChatMessage.getSpeaker({ actor }) : { alias: user.name },
      content: `<div class="var-borg-card pool-card ${pool}"><p>${text}</p></div>`
    });
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

/** A chat line: "Example Hero adds 🟒3 to the Ember pool with Shard of the Great Brazier (8 now)." */
async function postGain(pool, amount, left, user, actor, source) {
  const esc = foundry.utils.escapeHTML;
  const text = game.i18n.format("VARBORG.Pools.Gained", {
    name: esc(actor?.name ?? user.name), symbol: poolSymbol(pool), amount, pool: poolLabel(pool), left, source: esc(source)
  });
  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : { alias: user.name },
    content: `<div class="var-borg-card pool-card ${pool}"><p>${text}</p></div>`
  });
}

export function poolLabel(pool) {
  return game.i18n.localize(pool === POOL.GLOOM ? "VARBORG.Pools.Gloom" : "VARBORG.Pools.Ember");
}

export function poolSymbol(pool) {
  return pool === POOL.GLOOM ? "☾" : "🟒";
}
