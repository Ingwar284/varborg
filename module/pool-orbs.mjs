/**
 * The Ember and Gloom orbs: a sun (Ember) and a moon (Gloom), joined by a
 * bar with the round number, at the top middle of the screen. Below them
 * sits a small turn strip (module/turn-strip.mjs). They show
 * only while a combat is running, and show the same numbers as the Ember
 * and Gloom panel (module/panels.mjs). An orb swells when its pool fills
 * and flickers when charges are spent. Clicking an orb opens the panel.
 *
 * Shown to everyone; it only displays, the panel does the spending.
 */

import { POOL } from "./rules/pools.mjs";
import { getPools, runningCombat, poolLabel } from "./pools.mjs";
import { renderTurnStrip } from "./turn-strip.mjs";

const ID = "var-borg-pool-orbs";

/** The last numbers drawn, to tell a fill from a spend. */
let last = null;

/** The sun: twelve etched rays round a hatched disc. */
function sunSvg() {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const long = i % 2 === 0;
    return `<path d="M50 ${long ? 2 : 9} L55 21 L45 21 Z" transform="rotate(${i * 30} 50 50)"/>`;
  }).join("");
  return `<svg class="vb-orb__art" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="vb-sun-fill" cx="40%" cy="38%" r="65%">
        <stop style="stop-color: var(--vb-yellow)" offset="0%"/>
        <stop style="stop-color: var(--vb-orange)" offset="100%"/>
      </radialGradient>
      <pattern id="vb-sun-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line style="stroke: var(--vb-ink)" x1="0" y1="0" x2="0" y2="4" stroke-width="0.7" stroke-opacity="0.35"/>
      </pattern>
      <clipPath id="vb-sun-shade"><path d="M50 18 A32 32 0 0 1 50 82 A26 32 0 0 0 50 18 Z"/></clipPath>
    </defs>
    <g style="fill: var(--vb-orange); stroke: var(--vb-ink)" class="vb-orb__rays" stroke-width="1.2">${rays}</g>
    <circle style="stroke: var(--vb-ink)" cx="50" cy="50" r="32" fill="url(#vb-sun-fill)" stroke-width="2"/>
    <circle cx="50" cy="50" r="32" fill="url(#vb-sun-hatch)" clip-path="url(#vb-sun-shade)"/>
    <circle style="stroke: var(--vb-ink)" cx="50" cy="50" r="27" fill="none" stroke-width="0.6" stroke-dasharray="1.5 2.5"/>
  </svg>`;
}

/** The moon: an ink disc with a crosshatched crescent and a few stars. */
function moonSvg() {
  return `<svg class="vb-orb__art" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <pattern id="vb-moon-hatch" width="4" height="4" patternUnits="userSpaceOnUse">
        <path style="stroke: var(--vb-ink)" d="M0 4L4 0M0 0L4 4" stroke-width="0.5" stroke-opacity="0.45"/>
      </pattern>
    </defs>
    <circle style="fill: var(--vb-ink); stroke: var(--vb-paper)" cx="50" cy="50" r="36" stroke-width="1.5"/>
    <circle style="stroke: var(--vb-ink)" cx="50" cy="50" r="40" fill="none" stroke-width="2"/>
    <path style="fill: var(--vb-paper); stroke: var(--vb-paper-shade)" class="vb-orb__crescent" d="M56 21 A29.6 29.6 0 1 0 56 79 A32 32 0 0 1 56 21 Z"
      stroke-width="0.8"/>
    <path d="M56 21 A29.6 29.6 0 1 0 56 79 A32 32 0 0 1 56 21 Z" fill="url(#vb-moon-hatch)"/>
    <g style="fill: var(--vb-yellow)" class="vb-orb__stars">
      <path d="M72 28l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z"/>
      <circle cx="79" cy="56" r="1.3"/>
      <circle cx="66" cy="72" r="1"/>
    </g>
  </svg>`;
}

/** One orb: the picture with the count on top. */
function orbHtml(pool, svg) {
  return `<button type="button" class="vb-orb vb-orb--${pool}" data-pool="${pool}">
    ${svg}
    <span class="vb-orb__count">0</span>
    <span class="vb-orb__name">${foundry.utils.escapeHTML(poolLabel(pool))}</span>
  </button>`;
}

/** Make the orbs once, hidden until a combat runs. */
function build(onOpen) {
  const root = document.createElement("div");
  root.id = ID;
  root.className = "vb-orbs";
  root.innerHTML = `
    <div class="vb-orbs__row">
      ${orbHtml(POOL.EMBER, sunSvg())}
      <div class="vb-orbs__link" aria-hidden="true">
        <span class="vb-orbs__rule"></span>
        <span class="vb-orbs__round"></span>
        <span class="vb-orbs__rule"></span>
      </div>
      ${orbHtml(POOL.GLOOM, moonSvg())}
    </div>
    <div class="vb-turns"></div>`;
  for (const orb of root.querySelectorAll(".vb-orb")) orb.addEventListener("click", onOpen);
  document.body.append(root);
  return root;
}

/** Play a short animation on an orb, restarting it if it is still running. */
function pulse(orb, name) {
  orb.classList.remove("is-filling", "is-spending");
  void orb.offsetWidth;
  orb.classList.add(name);
}

/** Redraw the orbs: show or hide them, and set both counts. */
export function refreshPoolOrbs() {
  const root = document.getElementById(ID);
  if (!root) return;
  const combat = runningCombat();
  root.classList.toggle("is-shown", !!combat);
  renderTurnStrip(root.querySelector(".vb-turns"), combat);
  if (!combat) {
    last = null;
    return;
  }
  const pools = getPools();
  root.querySelector(".vb-orbs__round").textContent = game.i18n.format("VARBORG.Pools.Orbs.Round", { round: combat.round });
  for (const pool of [POOL.EMBER, POOL.GLOOM]) {
    const orb = root.querySelector(`.vb-orb--${pool}`);
    const left = pools[pool];
    orb.querySelector(".vb-orb__count").textContent = left;
    orb.classList.toggle("is-empty", left <= 0);
    const tip = game.i18n.format("VARBORG.Pools.Orbs.Tooltip", { pool: poolLabel(pool), left });
    orb.dataset.tooltip = tip;
    orb.setAttribute("aria-label", tip);
    if (last && left > last[pool]) pulse(orb, "is-filling");
    else if (last && left < last[pool]) pulse(orb, "is-spending");
  }
  last = pools;
}

/**
 * Hook up the orbs.
 * @param {Function} onOpen  Opens the Ember and Gloom panel.
 */
export function registerPoolOrbs(onOpen) {
  Hooks.once("ready", () => {
    build(onOpen);
    refreshPoolOrbs();
  });
  // The turn strip follows the combatants: added, removed, defeated,
  // initiative rolled, actions spent, a token renamed or hidden.
  const refreshSoon = foundry.utils.debounce(refreshPoolOrbs, 50);
  for (const hook of ["createCombatant", "updateCombatant", "deleteCombatant", "updateToken", "canvasReady"]) {
    Hooks.on(hook, refreshSoon);
  }
}
