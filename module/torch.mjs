/**
 * The light orb, at the top right of the map just left of Foundry's
 * sidebar, with two smaller orbs beside it:
 *
 * - Light (large): a flame in a dark orb, with a ring round the edge that
 *   empties as the light timer (module/light.mjs) runs down, and the time
 *   left underneath. The flame shrinks as the light burns down, gutters in
 *   the last five minutes, stands still while the game is paused and burns
 *   dark on a Blackburn day. With no light burning it is a cold ember.
 *   Opens the Light panel.
 * The two small orbs sit side by side to the left of the light orb.
 *
 * - Weather (small): today's weather on the hex flower, coloured as on the
 *   flower. Hidden when weather is switched off. Opens the Calendar panel.
 * - Time of day (small): morning, afternoon or night. Opens the Calendar
 *   panel.
 *
 * The time and the ring are updated every second by the light timer's own
 * tick (the data-light-clock and data-light-burn marks).
 */

import { lightContext } from "./light.mjs";
import { calendarContext } from "./calendar.mjs";
import { weatherContext } from "./weather.mjs";

const ID = "var-borg-torch";

/** A Font Awesome icon for each kind of hex on the weather flower. */
export const WEATHER_ICONS = {
  perfectDay: "fa-solid fa-sun",
  clearSky: "fa-solid fa-cloud-sun",
  clouded: "fa-solid fa-cloud",
  lightPrecipitation: "fa-solid fa-cloud-rain",
  heavyPrecipitation: "fa-solid fa-cloud-showers-heavy",
  storm: "fa-solid fa-cloud-bolt",
  minorHazard: "fa-solid fa-triangle-exclamation",
  majorHazard: "fa-solid fa-skull"
};

/** A Font Awesome icon for each time of day. */
const PHASE_ICONS = {
  morning: "fa-solid fa-sun",
  afternoon: "fa-solid fa-cloud-sun",
  night: "fa-solid fa-moon"
};

/** The light orb: a ring that burns down, round a two-tone flame. */
function lightSvg() {
  return `<svg class="vb-light__svg" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="vb-light-glow" cx="50%" cy="58%" r="55%">
        <stop offset="0%" style="stop-color: var(--vb-rust)"/>
        <stop offset="100%" style="stop-color: var(--vb-ink)"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill="url(#vb-light-glow)" style="stroke: var(--vb-ink)" stroke-width="2"/>
    <circle class="vb-light__track" cx="50" cy="50" r="45" fill="none" stroke-width="7"/>
    <circle class="vb-light__ring" cx="50" cy="50" r="45" fill="none" stroke-width="7"
      pathLength="100" transform="rotate(-90 50 50)"/>
    <circle cx="50" cy="50" r="49" fill="none" style="stroke: var(--vb-ink)" stroke-width="2"/>
    <circle cx="50" cy="50" r="41" fill="none" style="stroke: var(--vb-ink)" stroke-width="1.5"/>
    <g class="vb-light__flame-size">
      <g class="vb-light__flame">
        <path class="vb-light__flame-outer"
          d="M50 18 C58 30 65 40 63 52 C62 62 57 68 50 68 C43 68 38 62 37 52 C36 42 43 34 46 26 C47 32 48 35 50 38 C50 30 49 24 50 18 Z"
          style="stroke: var(--vb-ink)" stroke-width="1.5"/>
        <path class="vb-light__flame-inner"
          d="M50 36 C55 44 58 50 57 56 C56 62 53 66 50 66 C47 66 44 62 43.5 56 C43 50 46 45 50 36 Z"/>
      </g>
    </g>
    <path class="vb-light__wick" d="M44 74 L56 74 L54 79 L46 79 Z" style="fill: var(--vb-paper-shade); stroke: var(--vb-ink)" stroke-width="1"/>
  </svg>`;
}

/** Make the orbs once. */
function build({ openLight, openCalendar, openWeather }) {
  const root = document.createElement("div");
  root.id = ID;
  root.className = "vb-light";
  root.dataset.lightBurn = "";
  root.innerHTML = `
    <div class="vb-light__small">
      <button type="button" class="vb-light__mini vb-light__weather"><i></i></button>
      <button type="button" class="vb-light__mini vb-light__phase"><i></i></button>
    </div>
    <div class="vb-light__main">
      <button type="button" class="vb-light__orb">${lightSvg()}</button>
      <span class="vb-light__plate">
        <span class="vb-light__clock" data-light-clock></span>
        <span class="vb-light__out">${foundry.utils.escapeHTML(game.i18n.localize("VARBORG.Light.NoLight"))}</span>
      </span>
    </div>`;
  root.querySelector(".vb-light__orb").addEventListener("click", openLight);
  root.querySelector(".vb-light__weather").addEventListener("click", openWeather);
  root.querySelector(".vb-light__phase").addEventListener("click", openCalendar);
  // In the column left of Foundry's sidebar, so it moves with the sidebar.
  const column = document.getElementById("ui-right-column-1");
  if (column) column.prepend(root);
  else document.body.append(root);
  return root;
}

/** Set a button's tooltip and its name for screen readers. */
function label(el, text) {
  el.dataset.tooltip = text;
  el.setAttribute("aria-label", text);
}

/** Redraw the orbs: the light, the weather and the time of day. */
export function refreshTorch() {
  const root = document.getElementById(ID);
  if (!root) return;
  const i18n = game.i18n;

  // The light.
  const light = lightContext();
  root.classList.toggle("is-burning", light.burning);
  root.classList.toggle("is-waiting", light.waiting);
  root.classList.toggle("is-blackburn", light.blackburn);
  root.classList.toggle("is-low", light.low);
  root.style.setProperty("--vb-burn", light.burning ? light.fraction.toFixed(4) : "0");
  root.querySelector(".vb-light__clock").textContent = light.clock;
  const tip = [i18n.localize(light.burning ? "VARBORG.Light.TorchTooltip" : "VARBORG.Light.TorchOutTooltip")];
  if (light.waiting) tip.unshift(i18n.localize("VARBORG.Light.PausedHint"));
  if (light.blackburn) tip.unshift(i18n.localize("VARBORG.Light.BlackburnHint"));
  label(root.querySelector(".vb-light__orb"), tip.join(" "));

  // The weather.
  const weather = weatherContext();
  const weatherOrb = root.querySelector(".vb-light__weather");
  weatherOrb.hidden = !weather.on;
  weatherOrb.className = `vb-light__mini vb-light__weather kind-${weather.kind}`;
  weatherOrb.querySelector("i").className = WEATHER_ICONS[weather.kind] ?? "fa-solid fa-cloud";
  const weatherName = weather.hazard ? `${weather.name}: ${weather.hazard}` : weather.name;
  label(weatherOrb, i18n.format("VARBORG.Light.WeatherOrb", { weather: weatherName }));

  // The time of day.
  const calendar = calendarContext();
  const phaseOrb = root.querySelector(".vb-light__phase");
  phaseOrb.className = `vb-light__mini vb-light__phase phase-${calendar.phaseKey}`;
  phaseOrb.querySelector("i").className = PHASE_ICONS[calendar.phaseKey] ?? "fa-solid fa-sun";
  label(phaseOrb, i18n.format("VARBORG.Light.PhaseOrb", { phase: calendar.phase, clock: calendar.clock, date: calendar.date }));
}

/**
 * Hook up the orbs.
 * @param {{openLight: Function, openCalendar: Function, openWeather: Function}} open  Open the Light, Calendar and Weather panels.
 */
export function registerTorch(open) {
  Hooks.once("ready", () => {
    build(open);
    refreshTorch();
  });
  // The flame stands still while the game is paused.
  Hooks.on("pauseGame", refreshTorch);
}
