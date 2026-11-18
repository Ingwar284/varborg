/**
 * Once-only chat card buttons: the plain rules (REVIEW.md S1; bugs B6, B7).
 * Plain JavaScript, no Foundry, so it can be tested on its own.
 *
 * A button that may be used once records "used" as a flag on its chat
 * message, under flags.var-borg.<name>. This file lists every name that may
 * be recorded, the shape each one has, and checks a request before the Dark
 * Master's client writes anything (module/card-once.mjs does the writing).
 *
 * Three shapes, each kept exactly as the buttons already stored them, so
 * old cards in existing worlds still read correctly:
 *   flag  true, one use for the whole card.
 *   map   an object { <key>: true }, one use per key (a character's id).
 *   list  an array of strings, one entry per use (an actor uuid).
 */

/** The flag scope: the system id. Nothing outside it is ever written. */
export const SCOPE = "var-borg";

const ID = /^[A-Za-z0-9]{16}$/;
const ACTOR_UUID = /^(?:Scene\.[A-Za-z0-9]{16}\.Token\.[A-Za-z0-9]{16}\.)?Actor\.[A-Za-z0-9]{16}$/;

/**
 * Every once-only flag. To make another button once-only (later steps),
 * add one line here.
 *   shape    "flag", "map" or "list" (see above).
 *   actions  the data-action values of the buttons that use it; the card must
 *            have one of them, with the request's actor on it.
 *   sub      for "map" and "list": the pattern a key must match.
 *   bind     "id": the key must be the id of the request's actor.
 *            "uuid": the key must be the request's actor uuid.
 */
export const CLAIMS = Object.freeze({
  // "Not the face!" on a hook card: once per card (effects.mjs).
  stayed: { shape: "flag", actions: ["stayAtOne"] },
  // The Steady nerves / Panic table choice on a single Panic card (panic.mjs).
  panicChosen: { shape: "flag", actions: ["steadyNerves", "panicTable"] },
  // The same choice on the group Panic card: one per character (panic.mjs).
  groupPanicChosen: { shape: "map", actions: ["groupNerves", "groupTable"], sub: ID, bind: "id" },
  // Poison Resist: one per creature, stored as its uuid (poison.mjs).
  poisonResisted: { shape: "list", actions: ["resistPoison"], sub: ACTOR_UUID, bind: "uuid" },
  // The Shadowblight button: roll number "1", or "2" with Wild surge (shadowblight.mjs).
  shadowblightRolled: { shape: "map", actions: ["rollShadowblight"], sub: /^[12]$/ },
  // Defending against a lasting area's persistent damage, the Fire pot (lasting.mjs, GAPS 316).
  persistentDefended: { shape: "flag", actions: ["defendPersistent"] }
});

/**
 * Check a claim or release request, as the Dark Master's client receives it.
 * @param {object} request  { op: "claim"|"release", messageId, flag, sub?, actorUuid }
 * @returns {{spec: object}|{error: "bad"}}
 */
export function checkClaimRequest(request) {
  const bad = { error: "bad" };
  if (!request || typeof request !== "object") return bad;
  const { op, messageId, flag, sub, actorUuid } = request;
  if (op !== "claim" && op !== "release") return bad;
  if (typeof messageId !== "string" || !ID.test(messageId)) return bad;
  if (typeof flag !== "string" || !Object.hasOwn(CLAIMS, flag)) return bad;
  if (typeof actorUuid !== "string" || !ACTOR_UUID.test(actorUuid)) return bad;
  const spec = CLAIMS[flag];
  if (spec.shape === "flag") {
    if (sub != null) return bad;
    return { spec };
  }
  if (typeof sub !== "string" || !spec.sub.test(sub)) return bad;
  if (spec.bind === "uuid" && sub !== actorUuid) return bad;
  if (spec.bind === "id" && sub !== actorUuid.split(".").pop()) return bad;
  return { spec };
}

/**
 * Whether a use is already recorded.
 * @param {*} value     The flag's stored value (undefined when never set).
 * @param {object} spec One entry of CLAIMS.
 * @param {string} [sub]  The key, for "map" and "list".
 */
export function isClaimed(value, spec, sub) {
  if (spec.shape === "flag") return Boolean(value);
  if (spec.shape === "list") return Array.isArray(value) && value.includes(sub);
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Boolean(value[sub]);
}

/**
 * The update that records ("claim") or takes back ("release") a use, as the
 * changes to pass to message.update. Only ever one entry of one flag under
 * flags.var-borg. "map" keys are written one at a time so two different
 * keys never overwrite each other.
 * @param {object} spec
 * @param {string} flag
 * @param {*} value          The flag's stored value now.
 * @param {string} [sub]
 * @param {"claim"|"release"} op
 * @returns {Object<string, *>}
 */
export function claimChange(spec, flag, value, sub, op) {
  const base = `flags.${SCOPE}.${flag}`;
  if (spec.shape === "flag") return op === "claim" ? { [base]: true } : { [`flags.${SCOPE}.-=${flag}`]: null };
  if (spec.shape === "map") return op === "claim" ? { [`${base}.${sub}`]: true } : { [`${base}.-=${sub}`]: null };
  const list = Array.isArray(value) ? value : [];
  return { [base]: op === "claim" ? [...list, sub] : list.filter(entry => entry !== sub) };
}

/**
 * Whether a card's HTML has a button for this flag and this actor: one
 * <button> tag with both the data-action and the data-actor-uuid.
 * @param {string} content  The message's content.
 * @param {object} spec
 * @param {string} actorUuid
 */
export function cardHasButton(content, spec, actorUuid) {
  if (typeof content !== "string") return false;
  const tags = content.match(/<button\b[^>]*>/g) ?? [];
  return tags.some(tag => tag.includes(`data-actor-uuid="${actorUuid}"`)
    && spec.actions.some(action => tag.includes(`data-action="${action}"`)));
}

/**
 * The first free numbered use of a "map" flag whose keys are "1", "2", ...
 * (the Shadowblight button: once, or twice with Wild surge).
 * @param {*} value       The flag's stored value.
 * @param {number} allowed  How many uses there may be (1 or 2).
 * @returns {string|null}  "1", "2", or null when all are used.
 */
export function nextSlot(value, allowed) {
  const used = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  for (let slot = 1; slot <= Math.min(allowed, 2); slot++) {
    if (!used[String(slot)]) return String(slot);
  }
  return null;
}
