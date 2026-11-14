/**
 * Small chat cards that escape names exactly once (REVIEW.md S4).
 *
 * Many cards are a few lines of text with a character's name in them. They
 * were each built by hand, and each hand got the escaping a little wrong: some
 * put the name straight into the HTML (a character called "A<B & C" broke the
 * card), and one escaped the item name twice (an apostrophe showed as &#39;).
 *
 * The rule, and the only one callers need:
 * - Pass PLAIN TEXT. Build each line with game.i18n.format and the RAW name
 *   (actor.name, item.name). Never call escapeHTML yourself first.
 * - This file escapes every line, and the heading, once.
 * Foundry's game.i18n.format does not escape anything (client/helpers/
 * localization.mjs), and no text in lang/en.json contains HTML, so escaping
 * the finished line is always right.
 *
 * Only two things are trusted and left as written: `classes` / `className`
 * (fixed words from the code, such as "day-card") and `extraHtml` (buttons
 * built in the code; escape any name inside them yourself, once). Never pass
 * a name, an item name or any text a player can type as either.
 *
 * This file imports nothing, so any module can import it without making an
 * import loop. escapeText and smallCardHtml know nothing about Foundry and are
 * tested on their own (tests/chat-card.test.mjs).
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };

/**
 * Make text safe to put between HTML tags: & < > " ' become entities. The
 * same table as foundry.utils.escapeHTML. Not safe to run twice on the same
 * text (the & of an entity is escaped again): escape once, at the end.
 * @param {*} value  Anything; null and undefined give "".
 * @returns {string}
 */
export function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ESCAPES[character]);
}

/**
 * The HTML of a small card: `<div class="var-borg-card ...">`, an optional
 * heading, one paragraph per line, then any extra HTML.
 * @param {string|Array<string|{text: string, className?: string}>} lines
 *   Plain text. A line may be an object to give its paragraph a class.
 * @param {object} [options]
 * @param {string} [options.heading]    Plain text for an h3 at the top.
 * @param {string} [options.classes]    Extra classes on the card, such as "day-card" (fixed words only).
 * @param {string} [options.extraHtml]  Trusted HTML after the lines, such as buttons.
 * @returns {string}
 */
export function smallCardHtml(lines, { heading = "", classes = "", extraHtml = "" } = {}) {
  const list = Array.isArray(lines) ? lines : [lines];
  const head = heading ? `<h3>${escapeText(heading)}</h3>` : "";
  const body = list.map(line => {
    const { text, className = "" } = typeof line === "string" ? { text: line } : line;
    return `<p${className ? ` class="${className}"` : ""}>${escapeText(text)}</p>`;
  }).join("");
  return `<div class="${classes ? `var-borg-card ${classes}` : "var-borg-card"}">${head}${body}${extraHtml}</div>`;
}

/**
 * Post a small card as the actor. Speaker, flavor, rolls, sound and flags are
 * passed to ChatMessage.create only when given, so a card posts exactly what
 * the hand-built one did.
 * @param {Actor|null} actor  Who speaks. May be null when `speaker` is given.
 * @param {string|Array<string|{text: string, className?: string}>} lines  Plain text, see smallCardHtml.
 * @param {object} [options]
 * @param {string} [options.heading]
 * @param {string} [options.classes]
 * @param {string} [options.extraHtml]
 * @param {string} [options.flavor]    Passed on as given: fixed lang text only.
 * @param {Roll[]} [options.rolls]
 * @param {string} [options.sound]
 * @param {object} [options.flags]
 * @param {object} [options.speaker]   Replaces ChatMessage.getSpeaker({ actor }), such as { alias }.
 * @returns {Promise<ChatMessage>}
 */
export async function postSmallCard(actor, lines, options = {}) {
  const { heading, classes, extraHtml, flavor, rolls, sound, flags, speaker } = options;
  const data = {
    speaker: speaker ?? ChatMessage.getSpeaker({ actor }),
    content: smallCardHtml(lines, { heading, classes, extraHtml })
  };
  if (flavor !== undefined) data.flavor = flavor;
  if (rolls !== undefined) data.rolls = rolls;
  if (sound !== undefined) data.sound = sound;
  if (flags !== undefined) data.flags = flags;
  return ChatMessage.create(data);
}
