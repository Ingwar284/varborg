/**
 * The turn strip: a small initiative tracker under the Ember and Gloom orbs
 * (module/pool-orbs.mjs) at the top middle of the screen.
 *
 * It shows the turn order of the running combat as round portraits. Whoever
 * is acting now sits in the middle of the screen, larger, with its actions
 * left (◈) underneath. Those who have already acted this round sit to its
 * left, faded; those still to act sit to its right, then a mark (❧) where
 * the round ends and, faded, who acts first in the next round.
 * The players' side has an orange ring, foes an ink one; the defeated are
 * greyed out. Clicking a portrait pans the map to that token.
 *
 * It only shows what Foundry's Combat Tracker holds; turn order itself is
 * worked out in module/combat.mjs.
 */

import { isPlayerSide } from "./rules/initiative.mjs";
import { pips } from "./rules/actions.mjs";

/** How many portraits each side shows before the rest are counted as "+3". */
const MAX_SIDE = 4;

/** Whether this user may see a combatant in the strip. */
function visible(combatant) {
  if (game.user.isGM) return true;
  return !combatant.hidden && !combatant.token?.hidden;
}

/** One portrait. `when` is "now", "done" (acted this round) or "next". */
function portrait(combatant, when = "next") {
  const isNow = when === "now";
  const el = document.createElement("button");
  el.type = "button";
  const side = isPlayerSide(combatant.actor?.type) ? "players" : "foes";
  el.className = `vb-turn vb-turn--${side}`;
  el.classList.toggle("is-now", isNow);
  el.classList.toggle("is-done", when === "done");
  el.classList.toggle("is-defeated", combatant.isDefeated);
  el.classList.toggle("is-hidden", combatant.hidden || !!combatant.token?.hidden);

  const name = combatant.name ?? "";
  const initiative = Number.isNumeric(combatant.initiative) ? combatant.initiative : "–";
  const tip = game.i18n.format("VARBORG.Combat.Strip.Tooltip", { name, initiative });
  el.dataset.tooltip = tip;
  el.setAttribute("aria-label", tip);

  const img = document.createElement("img");
  img.src = combatant.img || "icons/svg/mystery-man.svg";
  img.alt = "";
  const init = document.createElement("span");
  init.className = "vb-turn__init";
  init.textContent = initiative;
  el.append(img, init);

  // Actions left, under whoever is acting now.
  if (isNow) {
    const left = document.createElement("span");
    left.className = "vb-turn__actions";
    for (const filled of pips(combatant.actionsLeft, combatant.maxActions)) {
      const pip = document.createElement("span");
      pip.className = filled ? "filled" : "spent";
      pip.textContent = "◈";
      left.append(pip);
    }
    el.append(left);
  }

  el.addEventListener("click", () => panTo(combatant));
  return el;
}

/** Pan the map to a combatant's token, if this user can see it. */
function panTo(combatant) {
  const token = combatant.token?.object;
  if (!token?.visible || combatant.sceneId !== canvas.scene?.id) return;
  canvas.animatePan({ x: token.center.x, y: token.center.y });
}

/** The mark between the end of this round and the start of the next. */
function roundMark() {
  const el = document.createElement("span");
  el.className = "vb-turns__round-mark";
  el.textContent = "❧";
  el.dataset.tooltip = game.i18n.localize("VARBORG.Combat.Strip.NextRound");
  return el;
}

/** "+3": how many more there are past the end of a side. */
function moreMark(count) {
  const more = document.createElement("span");
  more.className = "vb-turns__more";
  more.textContent = game.i18n.format("VARBORG.Combat.Strip.More", { count });
  return more;
}

/**
 * Fill the strip for a combat: those who acted on the left, whoever acts
 * now in the middle, those still to act on the right.
 * @param {HTMLElement} strip
 * @param {Combat|null} combat  The running combat, or null to empty it.
 */
export function renderTurnStrip(strip, combat) {
  strip.replaceChildren();
  if (!combat) return;
  const turns = combat.turns;
  const now = Math.max(0, combat.turn ?? 0);
  const current = turns[now];
  if (!current) return;

  const done = turns.slice(0, now).filter(visible);
  const next = turns.slice(now + 1).filter(visible);
  const firstNextRound = turns.find(visible);

  // Left: the nearest ones beside the middle, "+n" for the rest.
  const left = document.createElement("div");
  left.className = "vb-turns__side vb-turns__side--done";
  const leftShown = done.slice(-MAX_SIDE);
  if (done.length > leftShown.length) left.append(moreMark(done.length - leftShown.length));
  for (const combatant of leftShown) left.append(portrait(combatant, "done"));

  // Middle: whoever acts now (shown even if hidden, so the strip never jumps).
  const middle = document.createElement("div");
  middle.className = "vb-turns__now";
  if (visible(current)) middle.append(portrait(current, "now"));

  // Right: still to act, then the end of the round and who opens the next.
  const right = document.createElement("div");
  right.className = "vb-turns__side vb-turns__side--next";
  const rightShown = next.slice(0, MAX_SIDE);
  for (const combatant of rightShown) right.append(portrait(combatant, "next"));
  if (next.length > rightShown.length) right.append(moreMark(next.length - rightShown.length));
  else if (firstNextRound) {
    right.append(roundMark());
    right.append(portrait(firstNextRound, "done"));
  }

  strip.append(left, middle, right);
}
