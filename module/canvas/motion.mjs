/**
 * How a token's picture moves while it travels, for each way of moving.
 * Plain JavaScript, no Foundry, so it can be tested on its own. Only the
 * picture moves; the token's real position is untouched.
 *
 * - Walk:  a small hop per square, squashing a little on landing.
 * - Fly:   lifts off (grows, a shadow stays on the ground), glides with a
 *          slow bob, and drops down at the end.
 * - Swim:  a slow side-to-side sway, a little faded.
 * - Climb: small upward pulls with a slight shake.
 * - Crawl: low (squashed) with a small wiggle.
 */

/**
 * The pose of the token picture.
 * @param {string} action     The way it moves (walk, fly, swim, climb, crawl).
 * @param {number} squares    Squares travelled so far on this stretch of the move.
 * @param {number} presence   0 to 1: how far into the effect it is (it eases
 *                            in when a move starts and out when it ends).
 * @returns {{dx: number, dy: number, scaleX: number, scaleY: number, angle: number,
 *   alpha: number, shadow: number}}
 *   dx and dy in grid squares (negative dy is up), angle in degrees, shadow
 *   is the ground shadow's opacity (0 = none).
 */
export function motionPose(action, squares, presence) {
  const pose = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, angle: 0, alpha: 1, shadow: 0 };
  const p = Math.min(1, Math.max(0, presence || 0));
  if (p === 0) return pose;
  const t = Math.max(0, squares || 0);
  switch (action) {
    case "walk": {
      const hop = Math.abs(Math.sin(Math.PI * t));
      const landing = (1 - hop) ** 6;
      pose.dy = -0.12 * hop * p;
      pose.scaleX = 1 + 0.05 * landing * p;
      pose.scaleY = 1 - 0.07 * landing * p;
      break;
    }
    case "fly":
      pose.dy = (-0.3 - 0.03 * Math.sin(2 * Math.PI * t)) * p;
      pose.scaleX = pose.scaleY = 1 + 0.15 * p;
      pose.shadow = 0.35 * p;
      break;
    case "swim":
      pose.angle = 6 * Math.sin(Math.PI * t) * p;
      pose.dy = 0.03 * Math.sin(2 * Math.PI * t) * p;
      pose.alpha = 1 - 0.15 * p;
      break;
    case "climb":
      pose.dy = -0.05 * Math.abs(Math.sin(2 * Math.PI * t)) * p;
      pose.dx = 0.02 * Math.sin(6 * Math.PI * t) * p;
      break;
    case "crawl":
      pose.scaleX = 1 + 0.04 * p;
      pose.scaleY = 1 - 0.12 * p;
      pose.dx = 0.015 * Math.sin(4 * Math.PI * t) * p;
      break;
  }
  return pose;
}

/**
 * Move `presence` toward `target` (0 or 1) over `ms` milliseconds.
 * @returns {number}
 */
export function stepPresence(presence, target, elapsedMS, ms = 200) {
  const step = elapsedMS / ms;
  return target > presence ? Math.min(target, presence + step) : Math.max(target, presence - step);
}
