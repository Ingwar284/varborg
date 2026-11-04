/**
 * The light timer in Foundry (rules 3.15 Darkness and light, 4.1 Gear;
 * GAPS 31, 40, 150–153).
 *
 * One timer for the whole table, kept in a world setting and shown on the
 * Table panel (module/pools.mjs). It counts real time and pauses while the
 * game is paused. Only the Dark Master's client changes it; a player's
 * light is sent there as a Foundry query.
 *
 * - Gear with a light kind gets a Light button on the sheet. A torch or
 *   candle uses one of itself; a lantern uses one Lantern oil from the
 *   same character. The last one is removed.
 * - With no light burning, it starts the timer. Otherwise it joins the
 *   running timer, which does not change. In the last five minutes the card
 *   gives the Dark Master a New timer button.
 * - The Dark Master can start, lengthen, shorten and put out the timer on
 *   the panel.
 * - When it runs out, a card says the lights go out and reminds the table
 *   what complete darkness does.
 *
 * The maths lives in module/rules/light.mjs.
 */

import {
  DEFAULT_LIGHT_MINUTES, noLight, timeLeft, isBurntOut, isCounting, lightLit,
  pauseLight, resumeLight, checkpointLight, reopenLight, setTimeLeft, changeTimeLeft,
  clock, useOne, canLight, findFuel
} from "./rules/light.mjs";

const SYSTEM = "var-borg";
const SETTING = "light";
const QUERY = "var-borg.light";
const NEW_TIMER_FLAG = "lightNewTimerUsed";

/** How often the time left is written down while it counts (GAPS 152). */
const CHECKPOINT_MS = 60 * 1000;

/** Hook up the light timer. `onChange` redraws the Table panel. */
export function registerLight(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: noLight(),
    onChange
  });
  CONFIG.queries[QUERY] = (request, { user }) => changeLight(request, user);
  Hooks.on("pauseGame", onPause);
  Hooks.on("renderChatMessageHTML", addLightCardListeners);
  Hooks.once("ready", onReady);
}

/** The timer as stored. */
export function getLight() {
  return { ...noLight(), ...game.settings.get(SYSTEM, SETTING) };
}

/** The server's clock, the same for everyone. */
function now() {
  return game.time.serverTime;
}

/** "1 hour", "2 hours", "45 minutes". */
export function durationText(minutes) {
  const i18n = game.i18n;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return i18n.format(hours === 1 ? "VARBORG.Light.Hour" : "VARBORG.Light.Hours", { hours });
  }
  return i18n.format(minutes === 1 ? "VARBORG.Light.Minute" : "VARBORG.Light.Minutes", { minutes });
}

/** What the Table panel shows. */
export function lightContext() {
  const state = getLight();
  const left = timeLeft(state, now());
  const burning = state.running && left > 0;
  return {
    burning,
    clock: clock(left),
    waiting: burning && !isCounting(state),
    defaultMinutes: DEFAULT_LIGHT_MINUTES
  };
}

/* -------------------------------------------- */
/*  Ticking                                      */
/* -------------------------------------------- */

let ticker = null;
let lastCheckpoint = 0;

/** Every second: update the clocks on screen; the Dark Master checks the end. */
function tick() {
  const state = getLight();
  const text = clock(timeLeft(state, now()));
  for (const el of document.querySelectorAll("[data-light-clock]")) el.textContent = text;
  if (!game.user.isActiveGM || !state.running) return;
  if (isBurntOut(state, now())) {
    burnOut();
    return;
  }
  if (isCounting(state) && Date.now() - lastCheckpoint >= CHECKPOINT_MS) {
    lastCheckpoint = Date.now();
    saveLight(checkpointLight(state, now()));
  }
}

let burningOut = false;

/** The timer ran out: the lights go out. */
async function burnOut() {
  if (burningOut) return;
  burningOut = true;
  try {
    await saveLight(noLight());
    const i18n = game.i18n;
    await ChatMessage.create({
      speaker: { alias: i18n.localize("VARBORG.Light.Speaker") },
      content: `<div class="var-borg-card light-card out"><h3><i class="fa-solid fa-moon"></i> ${i18n.localize("VARBORG.Light.OutTitle")}</h3>`
        + `<p>${i18n.localize("VARBORG.Light.OutText")}</p>`
        + `<p class="hint">${i18n.localize("VARBORG.Light.Darkness")}</p></div>`
    });
  } finally {
    burningOut = false;
  }
}

function saveLight(state) {
  return game.settings.set(SYSTEM, SETTING, state);
}

/** World opened: the time it was closed does not count (GAPS 152). */
async function onReady() {
  ticker ??= setInterval(tick, 1000);
  if (!game.user.isActiveGM) return;
  const state = getLight();
  if (state.running) await saveLight(reopenLight(state, now(), game.paused));
  lastCheckpoint = Date.now();
}

/** The game is paused or unpaused: so is the timer (GAPS 40). */
async function onPause(paused) {
  if (!game.user.isActiveGM) return;
  const state = getLight();
  if (!state.running) return;
  await saveLight(paused ? pauseLight(state, now()) : resumeLight(state, now()));
  lastCheckpoint = Date.now();
}

/* -------------------------------------------- */
/*  Changes, run on the Dark Master's client     */
/* -------------------------------------------- */

/** Run the change here (Dark Master) or ask the Dark Master to run it. */
async function sendChange(request) {
  if (game.user.isActiveGM) return changeLight(request, game.user);
  const gm = game.users.activeGM;
  if (!gm) return { error: "VARBORG.Light.NoGM" };
  try {
    return await gm.query(QUERY, request, { timeout: 30000 });
  } catch (error) {
    console.error("VÅR BORG | Light query failed", error);
    return { error: "VARBORG.Light.NoGM" };
  }
}

/** One change at a time, so two lights lit at once both count. */
let queue = Promise.resolve();

function changeLight(request, user) {
  const run = queue.then(() => applyChange(request, user));
  queue = run.catch(() => {});
  return run;
}

async function applyChange(request, user) {
  const minutes = Math.round(Number(request?.minutes) || 0);
  const state = getLight();
  const at = now();
  switch (request?.kind) {
    case "lit": {
      if (minutes < 1) return { error: "VARBORG.Light.Bad" };
      const result = lightLit(state, minutes, at, game.paused);
      if (!result.joined) await saveLight(result.state);
      return { ok: true, joined: result.joined, lateLight: result.lateLight, left: timeLeft(result.state, at) };
    }
    case "set":
      if (!user.isGM) return { error: "VARBORG.Light.GMOnly" };
      await saveLight(setTimeLeft(state, minutes, at, game.paused));
      return { ok: true };
    case "change":
      if (!user.isGM) return { error: "VARBORG.Light.GMOnly" };
      await saveLight(changeTimeLeft(state, minutes, at, game.paused));
      return { ok: true };
    case "out":
      if (!user.isGM) return { error: "VARBORG.Light.GMOnly" };
      await saveLight(noLight());
      return { ok: true };
    default:
      return { error: "VARBORG.Light.Bad" };
  }
}

/* -------------------------------------------- */
/*  Lighting gear                                */
/* -------------------------------------------- */

/** Whether the sheet shows a Light button for this item. */
export function canLightItem(item) {
  return item.type === "gear" && canLight(item.system);
}

/**
 * Light a torch, a candle or a lantern from the sheet.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function lightItem(actor, item) {
  const i18n = game.i18n;
  if (!actor.isOwner || !canLightItem(item)) return;
  if (!game.users.activeGM) {
    ui.notifications.warn("VARBORG.Light.NoGM", { localize: true });
    return;
  }
  // A lantern burns one oil (GAPS 40); a torch burns itself.
  const burnt = item.system.light === "lamp" ? findFuel(actor.itemTypes.gear) : item;
  if (!burnt) {
    ui.notifications.warn(i18n.format("VARBORG.Light.NoFuel", { name: actor.name, item: item.name }));
    return;
  }
  const minutes = burnt.system.lightMinutes || DEFAULT_LIGHT_MINUTES;

  const result = await sendChange({ kind: "lit", minutes });
  if (result?.error) {
    ui.notifications.warn(result.error, { localize: true });
    return;
  }

  // Use one up; the last one is removed (GAPS 151).
  const used = useOne(burnt.system.quantity);
  const burntName = burnt.name;
  if (used.remove) await burnt.delete();
  else await burnt.update({ "system.quantity": used.quantity });

  const esc = foundry.utils.escapeHTML;
  const lines = [];
  lines.push(item === burnt
    ? i18n.format("VARBORG.Light.Lit", { name: esc(actor.name), item: esc(item.name), time: durationText(minutes) })
    : i18n.format("VARBORG.Light.LitLamp", { name: esc(actor.name), item: esc(item.name), fuel: esc(burntName), time: durationText(minutes) }));
  lines.push(used.remove
    ? i18n.format("VARBORG.Light.LastOne", { item: esc(burntName) })
    : i18n.format("VARBORG.Light.Left", { item: esc(burntName), count: used.quantity }));
  lines.push(i18n.format(result.joined ? "VARBORG.Light.Joins" : "VARBORG.Light.Starts", { clock: clock(result.left) }));
  if (!result.joined && game.paused) lines.push(i18n.localize("VARBORG.Light.Waits"));

  let button = "";
  if (result.lateLight) {
    lines.push(i18n.localize("VARBORG.Light.Late"));
    button = `<button type="button" data-action="lightNewTimer" data-minutes="${minutes}">`
      + `<i class="fa-solid fa-hourglass-start"></i> ${i18n.format("VARBORG.Light.NewTimer", { time: durationText(minutes) })}</button>`;
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card light-card"><h3><i class="fa-solid fa-fire-flame-curved"></i> `
      + `${i18n.format("VARBORG.Light.CardTitle", { item: esc(item.name) })}</h3>`
      + lines.map(line => `<p>${line}</p>`).join("") + button + `</div>`
  });
}

/** The New timer button on a late light's card: Dark Master only. */
function addLightCardListeners(message, html) {
  const button = html.querySelector("button[data-action='lightNewTimer']");
  if (!button) return;
  if (!game.user.isGM || message.getFlag(SYSTEM, NEW_TIMER_FLAG)) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    const minutes = Number(button.dataset.minutes) || DEFAULT_LIGHT_MINUTES;
    const result = await setLightMinutes(minutes);
    if (!result) {
      button.disabled = false;
      return;
    }
    if (message.isOwner) await message.setFlag(SYSTEM, NEW_TIMER_FLAG, true);
    await ChatMessage.create({
      speaker: { alias: game.i18n.localize("VARBORG.Light.Speaker") },
      content: `<div class="var-borg-card light-card"><p>${game.i18n.format("VARBORG.Light.NewTimerDone", {
        clock: clock(minutes * 60 * 1000)
      })}</p></div>`
    });
  });
}

/* -------------------------------------------- */
/*  The Dark Master's panel controls             */
/* -------------------------------------------- */

async function gmChange(request) {
  const result = await sendChange(request);
  if (result?.error) {
    ui.notifications.warn(result.error, { localize: true });
    return false;
  }
  return true;
}

/** Start the timer, or set the time left, to `minutes`. */
export function setLightMinutes(minutes) {
  return gmChange({ kind: "set", minutes });
}

/** Lengthen (+) or shorten (−) the running timer. */
export function changeLightMinutes(minutes) {
  return gmChange({ kind: "change", minutes });
}

/** Put the lights out by hand. No card: the Dark Master knows why. */
export function putOutLight() {
  return gmChange({ kind: "out" });
}
