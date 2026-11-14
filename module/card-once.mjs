/**
 * Once-only chat card buttons in Foundry (REVIEW.md S1; bugs B6, B7).
 *
 * Several card buttons must work once: "Not the face!", poison Resist, the
 * Panic choices, the Shadowblight roll. Each records "used" as a flag on its
 * chat message. Foundry lets only the message's author or a Dark Master
 * change a message, so when a player pressed a button on a card someone
 * else posted, the effect happened but the mark was never saved, and after
 * a reload the button worked again.
 *
 * claimOnce fixes that, and does it BEFORE the effect: it records the use
 * first, and only a successful claim goes on to the effect. A player's
 * claim is sent to the active Dark Master's client (a Foundry query, like
 * Fortune, Pools and Light), which handles one at a time, so two players
 * pressing at once cannot both win. With no Dark Master connected and no
 * right to change the card, nothing happens and a warning says why.
 *
 * What may be recorded, and its shape, is the table CLAIMS in
 * module/rules/card-once.mjs; the Dark Master's client refuses anything else.
 *
 * Use:
 *   if (isClaimed(message, "stayed")) button.disabled = true;      // at render
 *   const claim = await claimOnce(message, "stayed", { actor });   // on click
 *   if (!claim) return;                                            // taken, or no Dark Master
 *   ...the effect...                                               // never re-enable after this
 *   await claim.release();                                         // only if the effect did nothing
 */

import {
  SCOPE, CLAIMS, checkClaimRequest, isClaimed as claimedIn, claimChange, cardHasButton
} from "./rules/card-once.mjs";

const QUERY = "var-borg.cardOnce";

/** Register the query a player's client uses to claim a button. Called once at init. */
export function registerCardOnce() {
  CONFIG.queries[QUERY] = (request, { user }) => runClaim(request, user);
}

/**
 * Whether a button's use is already recorded on the card. For the render
 * handler; reads the same flag shapes old cards have.
 * @param {ChatMessage} message
 * @param {string} flag    A name in CLAIMS.
 * @param {string} [sub]   The key, for a "map" or "list" flag.
 * @returns {boolean}
 */
export function isClaimed(message, flag, sub) {
  if (!Object.hasOwn(CLAIMS, flag)) throw new Error(`VÅR BORG | Unknown once-only flag "${flag}"`);
  return claimedIn(message.getFlag(SCOPE, flag), CLAIMS[flag], sub);
}

/**
 * Record a button's use on the card before its effect runs.
 * @param {ChatMessage} message
 * @param {string} flag      A name in CLAIMS.
 * @param {object} options
 * @param {Actor} options.actor  The character the button is for; the Dark Master's
 *   client checks the user owns it and that the card has a button for it.
 * @param {string} [options.sub]  The key, for a "map" or "list" flag.
 * @returns {Promise<{release: Function}|null>}  null when the use was not recorded
 *   (someone else took it, no Dark Master is connected, or it was refused); do
 *   nothing then. Otherwise call release() only if the effect then did nothing.
 */
export async function claimOnce(message, flag, { actor, sub } = {}) {
  const request = { op: "claim", messageId: message.id, flag, sub, actorUuid: actor?.uuid };
  const result = await send(message, request);
  if (result?.ok) {
    return {
      release: async () => {
        const undone = await send(message, { ...request, op: "release" });
        if (!undone?.ok) console.warn("VÅR BORG | A card use could not be given back", undone);
      }
    };
  }
  if (result?.error === "nogm") ui.notifications.warn("VARBORG.Fortune.NoGM", { localize: true });
  // "taken": the card redraws with the button off. Anything else is a refusal worth a console line.
  else if (result?.error !== "taken") console.warn("VÅR BORG | Card use refused", result, request);
  return null;
}

/**
 * Run the request here, or ask the active Dark Master to. A Dark Master that
 * is the active one runs it here; everyone else asks the active one; with
 * none connected the card's author runs it here. So two Dark Masters cannot
 * both press the same button (REVIEW.md L47).
 * @returns {Promise<{ok: true}|{error: string}>}
 */
async function send(message, request) {
  const user = game.user;
  if (user.isActiveGM) return runClaim(request, user);
  const gm = game.users.activeGM;
  if (gm) {
    try {
      return (await gm.query(QUERY, request, { timeout: 30000 })) ?? { error: "failed" };
    } catch (error) {
      console.error("VÅR BORG | Card claim query failed", error);
      return { error: "nogm" };
    }
  }
  // No Dark Master connected: only the card's author may record it, here.
  if (message.canUserModify(user, "update")) return runClaim(request, user);
  return { error: "nogm" };
}

/** One claim at a time, so two presses at once cannot both win (as pools.mjs does). */
let queue = Promise.resolve();

/**
 * Check and record a claim or release. Runs on the Dark Master's client, or on
 * the author's own client when they press a button on their own card.
 * @param {object} request  See checkClaimRequest.
 * @param {User} user       Who asked.
 * @returns {Promise<{ok: true}|{error: string}>}  Never throws.
 */
function runClaim(request, user) {
  const run = queue.then(() => applyClaim(request, user)).catch(error => {
    console.error("VÅR BORG | Card claim failed", error);
    return { error: "failed" };
  });
  queue = run;
  return run;
}

async function applyClaim(request, user) {
  const checked = checkClaimRequest(request);
  if (checked.error) return checked;
  const { spec } = checked;
  const { op, messageId, flag, sub, actorUuid } = request;
  const message = game.messages.get(messageId);
  if (!message) return { error: "gone" };
  if (!cardHasButton(message.content, spec, actorUuid)) return { error: "bad" };
  const actor = await fromUuid(actorUuid);
  if (!actor) return { error: "gone" };
  if (!user?.isGM && !actor.testUserPermission(user, "OWNER")) return { error: "notYours" };
  const value = message.getFlag(SCOPE, flag);
  const taken = claimedIn(value, spec, sub);
  if (op === "claim" && taken) return { error: "taken" };
  if (op === "release" && !taken) return { error: "notTaken" };
  await message.update(claimChange(spec, flag, value, sub, op));
  return { ok: true };
}
