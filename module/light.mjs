/**
 * The light timer in Foundry (rules 3.15 Darkness and light, 4.1 Gear;
 * GAPS 31, 40, 150–154).
 *
 * One timer for the whole table, kept in a world setting and shown on the
 * Light panel (module/panels.mjs) and as a torch at the top right of the
 * map (module/torch.mjs). It counts real time and pauses while the
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
 * - It does not count while the world is closed, but keeps counting if
 *   the Dark Master only reloads or drops out (GAPS 152).
 * - The character who lights a light has their tokens shine bright light
 *   out to its range. When the timer ends, every token it lit goes dark
 *   and gets back its own light (GAPS 154).
 * - Blackburn (step 41, GAPS 168): while it is today's weather the timer
 *   burns at double speed and lit tokens shine to half their light's range.
 *   When the weather changes, both go back to normal.
 * - Player feedback: a lit token flickers like a flame (a lantern gently).
 *   A character can put their light out: their tokens go dark and the light
 *   is spent (lighting again uses a new one); the timer runs on for the
 *   others. A lit lantern can be dimmed to 5 feet (rules 4.1) and turned
 *   back up.
 *
 * The maths lives in module/rules/light.mjs.
 */

import {
  DEFAULT_LIGHT_MINUTES, noLight, timeLeft, isBurntOut, isCounting, lightLit,
  pauseLight, resumeLight, checkpointLight, lightAfterLoad, needsRedraw, setTimeLeft, changeTimeLeft,
  clock, useOne, canLight, findFuel, litTokenLight, lightBefore, DEFAULT_LIGHT_RANGE, setLightRate, rateOf,
  litKinds, flickerFor, DIMMED_RANGE
} from "./rules/light.mjs";
import { lightRateFor, lightRangeFor } from "./rules/weather-effects.mjs";
import { currentWeather } from "./weather.mjs";

const SYSTEM = "var-borg";
const SETTING = "light";
const QUERY = "var-borg.light";
const NEW_TIMER_FLAG = "lightNewTimerUsed";
/** On a lit token: its own light before, to give back when the light goes out. */
const TOKEN_FLAG = "lightBefore";
/** On a lit token: the full range of the light it carries (before Blackburn halves it). */
const RANGE_FLAG = "lightRange";
/** On a lit token: the kinds of light it carries ("burns", "lamp"), for the flicker. */
const KINDS_FLAG = "lightKinds";
/** On a lit token: its lantern is dimmed to 5 feet. */
const DIM_FLAG = "lightDimmed";

/** How often the time left is written down while it counts (GAPS 152). */
const CHECKPOINT_MS = 60 * 1000;

/** Hook up the light timer. `onChange` redraws the Light panel. */
export function registerLight(onChange) {
  game.settings.register(SYSTEM, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: noLight(),
    onChange: value => {
      const before = lastSeen;
      lastSeen = { ...noLight(), ...value };
      if (needsRedraw(before, lastSeen, now())) onChange();
    }
  });
  CONFIG.queries[QUERY] = (request, { user }) => changeLight(request, user);
  Hooks.on("pauseGame", onPause);
  Hooks.on("renderChatMessageHTML", addLightCardListeners);
  // A token lit, dimmed or put out: its character's sheet shows the change.
  Hooks.on("updateToken", (token, changes) => {
    if (!foundry.utils.hasProperty(changes, `flags.${SYSTEM}`)) return;
    const sheet = token.actor?.sheet;
    if (sheet?.rendered) sheet.render();
  });
  Hooks.once("ready", onReady);
}

/** The timer as last seen on this client, to tell whether the panel needs redrawing. */
let lastSeen = null;

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

/** What the Light panel shows. */
export function lightContext() {
  const state = getLight();
  const left = timeLeft(state, now());
  const burning = state.running && left > 0;
  return {
    burning,
    clock: clock(left),
    ...burnLevel(state, left),
    waiting: burning && !isCounting(state),
    blackburn: currentWeather().hazard === "blackburn",
    defaultMinutes: DEFAULT_LIGHT_MINUTES
  };
}

/** In the last five minutes the torch on screen burns low (module/torch.mjs). */
const LOW_MS = 5 * 60 * 1000;

/** How much of the light is left (1 full, 0 out), and whether it is nearly out. */
function burnLevel(state, left) {
  return {
    fraction: state.total > 0 ? Math.min(1, left / state.total) : 0,
    low: left > 0 && left <= LOW_MS
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
  // The torch at the top of the screen burns down (module/torch.mjs).
  const { fraction, low } = burnLevel(state, timeLeft(state, now()));
  for (const el of document.querySelectorAll("[data-light-burn]")) {
    el.style.setProperty("--vb-burn", fraction.toFixed(4));
    el.classList.toggle("is-low", low);
  }
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

/** When this launch of the world began: Foundry stamps it at each launch. */
function currentLaunch() {
  return game.world.lastPlayed ?? "";
}

/** How fast lights burn today: 2 in a Blackburn, else 1. */
function todaysRate() {
  return lightRateFor(currentWeather().hazard);
}

/**
 * Save the timer, with the launch it was saved in (see lightAfterLoad),
 * burning at today's rate. When no light is burning any more, the lit
 * tokens go dark.
 */
async function saveLight(state) {
  state = setLightRate(state, todaysRate(), now());
  await game.settings.set(SYSTEM, SETTING, { ...state, launch: currentLaunch() });
  if (!state.running) await darkenTokens();
}

/* -------------------------------------------- */
/*  Token light (GAPS 154)                       */
/* -------------------------------------------- */

/**
 * A character's light is lit: their tokens shine out to its range (half
 * of it in a Blackburn). With two lights lit, the longer range counts.
 */
async function lightTokens(actor, range, kind) {
  const { hazard } = currentWeather();
  for (const token of actor.getDependentTokens({ concreteOnly: true })) {
    const source = token._source.light;
    const current = { bright: source.bright, dim: source.dim, animation: source.animation };
    const before = lightBefore(current, token.getFlag(SYSTEM, TOKEN_FLAG));
    const full = Math.max(Number(range) || 0, Number(token.getFlag(SYSTEM, RANGE_FLAG)) || 0);
    const kinds = litKinds(token.getFlag(SYSTEM, KINDS_FLAG), kind);
    // A new light shines at its full range: a dimmed lantern is turned back up.
    const light = litTokenLight(before, lightRangeFor(full, hazard), flickerFor(kinds));
    await token.update({
      light,
      flags: { [SYSTEM]: { [TOKEN_FLAG]: before, [RANGE_FLAG]: full, [KINDS_FLAG]: kinds, [DIM_FLAG]: false } }
    });
  }
}

/** A lit token's light for today's weather, dimmed or not. */
function shining(token, hazard, dimmed = Boolean(token.getFlag(SYSTEM, DIM_FLAG))) {
  const range = dimmed ? DIMMED_RANGE : token.getFlag(SYSTEM, RANGE_FLAG);
  return litTokenLight(token.getFlag(SYSTEM, TOKEN_FLAG), lightRangeFor(range, hazard), flickerFor(token.getFlag(SYSTEM, KINDS_FLAG)));
}

/** The update that gives a lit token its own light back. */
function darkUpdate(token) {
  const { bright, dim, animation } = token.getFlag(SYSTEM, TOKEN_FLAG);
  const light = { bright, dim };
  // Tokens lit before the flicker came in kept no animation, and never got one.
  if (animation) light.animation = animation;
  else if (token.getFlag(SYSTEM, KINDS_FLAG)) light.animation = { type: null };
  return {
    _id: token.id,
    light,
    flags: { [SYSTEM]: { [TOKEN_FLAG]: _del, [RANGE_FLAG]: _del, [KINDS_FLAG]: _del, [DIM_FLAG]: _del } }
  };
}

/** A character's tokens that carry a lit light. */
function litTokensOf(actor) {
  return actor.getDependentTokens({ concreteOnly: true }).filter(token => token.getFlag(SYSTEM, TOKEN_FLAG));
}

/**
 * What the character sheet shows about a character's light: whether it is
 * lit, whether a lantern is among it, and whether that is dimmed.
 */
export function actorLight(actor) {
  const token = actor ? litTokensOf(actor)[0] : null;
  if (!token) return { lit: false };
  const kinds = token.getFlag(SYSTEM, KINDS_FLAG) ?? [];
  return { lit: true, lamp: kinds.includes("lamp"), dimmed: Boolean(token.getFlag(SYSTEM, DIM_FLAG)) };
}

/**
 * The weather changed: the timer burns at the new rate from now on, and
 * every lit token shines to its light's range for the new weather.
 * Dark Master only.
 */
export async function weatherChangedLight() {
  if (!game.user.isActiveGM) return;
  const state = getLight();
  if (!state.running) return;
  if (rateOf(state) !== todaysRate()) await saveLight(state);
  const { hazard } = currentWeather();
  for (const scene of game.scenes) {
    const updates = scene.tokens
      .filter(token => token.getFlag(SYSTEM, TOKEN_FLAG) && token.getFlag(SYSTEM, RANGE_FLAG))
      .map(token => ({ _id: token.id, light: shining(token, hazard) }))
      .filter(update => {
        const token = scene.tokens.get(update._id);
        return token.light.bright !== update.light.bright || token.light.dim !== update.light.dim;
      });
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
  }
}

/** The lights go out: every lit token, on every scene, gets its own light back. */
async function darkenTokens() {
  for (const scene of game.scenes) {
    const updates = scene.tokens
      .filter(token => token.getFlag(SYSTEM, TOKEN_FLAG))
      .map(darkUpdate);
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
  }
}

/**
 * The Dark Master's client loads. If the world was closed, the time it was
 * closed does not count; if the Dark Master only reloaded or reconnected,
 * the timer keeps counting (GAPS 152).
 */
async function onReady() {
  lastSeen = getLight();
  ticker ??= setInterval(tick, 1000);
  if (!game.user.isActiveGM) return;
  const state = getLight();
  if (state.running) await saveLight(lightAfterLoad(state, now(), game.paused, currentLaunch()));
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
      // The character who lit it shines, if the one asking may act for them.
      const actor = request.actorUuid ? fromUuidSync(request.actorUuid) : null;
      if (actor?.testUserPermission(user, "OWNER")) await lightTokens(actor, Number(request.range) || DEFAULT_LIGHT_RANGE, request.lightKind);
      return { ok: true, joined: result.joined, lateLight: result.lateLight, left: timeLeft(result.state, at) };
    }
    case "putOut": {
      // One character's light goes out; the timer runs on for the others.
      const actor = request.actorUuid ? fromUuidSync(request.actorUuid) : null;
      if (!actor?.testUserPermission(user, "OWNER")) return { error: "VARBORG.Light.NotYours" };
      for (const token of litTokensOf(actor)) await token.update(darkUpdate(token));
      return { ok: true };
    }
    case "dim": {
      // A lantern dimmed to 5 feet, or turned back up (rules 4.1).
      const actor = request.actorUuid ? fromUuidSync(request.actorUuid) : null;
      if (!actor?.testUserPermission(user, "OWNER")) return { error: "VARBORG.Light.NotYours" };
      const dimmed = Boolean(request.dimmed);
      const { hazard } = currentWeather();
      for (const token of litTokensOf(actor)) {
        if (!(token.getFlag(SYSTEM, KINDS_FLAG) ?? []).includes("lamp")) continue;
        await token.update({ light: shining(token, hazard, dimmed), flags: { [SYSTEM]: { [DIM_FLAG]: dimmed } } });
      }
      return { ok: true };
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

  const result = await sendChange({
    kind: "lit",
    minutes,
    actorUuid: actor.uuid,
    // A lantern lights as far as the lantern, not its oil.
    range: item.system.lightRange || DEFAULT_LIGHT_RANGE,
    // A torch or candle flickers more than a lantern.
    lightKind: item.system.light
  });
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

/** Post a short light card for a character. */
async function lightCard(actor, icon, text) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card light-card"><p><i class="fa-solid ${icon}"></i> ${text}</p></div>`
  });
}

/**
 * Put a character's light out (player feedback): their tokens go dark. The
 * light is spent; lighting again uses a new torch or more oil.
 * @param {Actor} actor
 */
export async function putOutActorLight(actor) {
  if (!actor?.isOwner || !actorLight(actor).lit) return;
  const result = await sendChange({ kind: "putOut", actorUuid: actor.uuid });
  if (result?.error) {
    ui.notifications.warn(result.error, { localize: true });
    return;
  }
  await lightCard(actor, "fa-moon", game.i18n.format("VARBORG.Light.PutOut", { name: foundry.utils.escapeHTML(actor.name) }));
}

/**
 * Dim a character's lit lantern to 5 feet, or turn it back up (rules 4.1).
 * @param {Actor} actor
 * @param {boolean} dimmed  True to dim, false to turn it back up.
 */
export async function dimActorLight(actor, dimmed) {
  const state = actorLight(actor);
  if (!actor?.isOwner || !state.lamp) return;
  const result = await sendChange({ kind: "dim", actorUuid: actor.uuid, dimmed });
  if (result?.error) {
    ui.notifications.warn(result.error, { localize: true });
    return;
  }
  const name = foundry.utils.escapeHTML(actor.name);
  await lightCard(actor, "fa-lightbulb", game.i18n.format(dimmed ? "VARBORG.Light.Dimmed" : "VARBORG.Light.TurnedUp", { name }));
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
