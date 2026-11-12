/**
 * The distance label (playtest feedback): hovering over a token shows how
 * far it is from your selected token, or, with none selected, from the
 * token whose turn it is. The distance is counted edge to edge in feet, as
 * the rules measure (two tokens in neighbouring squares are 5' apart).
 * Each user can switch it off.
 */

import { tokenDistance } from "../rules/movement.mjs";

const SYSTEM = "var-borg";
/** The client setting that switches the label on or off. */
export const SHOW_HOVER_DISTANCE = "showHoverDistance";
/** The label's name on the token, so it can be found and removed. */
const LABEL = "varBorgHoverDistance";

/** Register the setting. Called once at init. */
export function registerHoverDistance() {
  game.settings.register(SYSTEM, SHOW_HOVER_DISTANCE, {
    name: "VARBORG.Settings.ShowHoverDistance.Name",
    hint: "VARBORG.Settings.ShowHoverDistance.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
}

/** The token distances are measured from: your selected token, or the one whose turn it is. */
function originToken(hovered) {
  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length === 1 && controlled[0] !== hovered) return controlled[0];
  const current = game.combat?.combatant?.token?.object ?? null;
  return current && current !== hovered && current.scene === canvas.scene ? current : null;
}

/**
 * Show the distance above a hovered token.
 * @param {Token} token
 */
export function showHoverDistance(token) {
  hideHoverDistance(token);
  if (!game.settings.get(SYSTEM, SHOW_HOVER_DISTANCE) || !canvas.grid) return;
  const from = originToken(token);
  if (!from || !token.visible) return;
  const feet = tokenDistance({
    centreDistance: canvas.grid.measurePath([from.center, token.center]).distance,
    sizeA: Math.max(from.document.width, from.document.height),
    sizeB: Math.max(token.document.width, token.document.height),
    gridDistance: canvas.grid.distance
  });
  const TextClass = foundry.canvas?.containers?.PreciseText ?? globalThis.PreciseText;
  const style = CONFIG.canvasTextStyle.clone();
  style.fontSize = Math.max(16, Math.round(canvas.dimensions.size / 3.5));
  const label = new TextClass(game.i18n.format("VARBORG.Movement.HoverDistance", { feet, units: canvas.grid.units || "ft" }), style);
  label.name = LABEL;
  label.anchor.set(0.5, 1);
  label.position.set(token.w / 2, -4);
  token.addChild(label);
}

/**
 * Remove the label.
 * @param {Token} token
 */
export function hideHoverDistance(token) {
  const label = token?.children?.find(child => child.name === LABEL);
  if (label) {
    token.removeChild(label);
    label.destroy();
  }
}
