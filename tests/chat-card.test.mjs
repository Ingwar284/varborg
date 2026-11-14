/**
 * Tests for module/chat-card.mjs (small chat cards that escape once, REVIEW.md S4).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { escapeText, smallCardHtml, postSmallCard } from "../module/chat-card.mjs";

const NAME = "A<B & C";

test("escapeText turns & < > \" ' into entities and leaves other text alone", () => {
  assert.equal(escapeText(NAME), "A&lt;B &amp; C");
  assert.equal(escapeText(`"it's"`), "&quot;it&#x27;s&quot;");
  assert.equal(escapeText("Example Hero"), "Example Hero");
  assert.equal(escapeText(5), "5");
  assert.equal(escapeText(null), "");
  assert.equal(escapeText(undefined), "");
});

test("escapeText is not safe to run twice, which is why callers pass plain text", () => {
  assert.equal(escapeText(escapeText(NAME)), "A&amp;lt;B &amp;amp; C");
});

test("one plain line gives the same card as the old hand-built one", () => {
  assert.equal(smallCardHtml("Example Hero is unfazed."), `<div class="var-borg-card"><p>Example Hero is unfazed.</p></div>`);
  assert.equal(smallCardHtml(["One", "Two"]), `<div class="var-borg-card"><p>One</p><p>Two</p></div>`);
});

test("a strange name is escaped exactly once, in a line and in the heading", () => {
  const html = smallCardHtml(`${NAME} is unfazed.`, { heading: `${NAME} is starving` });
  assert.equal(html, `<div class="var-borg-card"><h3>A&lt;B &amp; C is starving</h3><p>A&lt;B &amp; C is unfazed.</p></div>`);
  assert.ok(!html.includes("&amp;lt;") && !html.includes("&amp;amp;"));
  assert.ok(!html.includes("<B"));
});

test("heading, classes, line classes and extra HTML keep the old card shapes", () => {
  // The starvation card of module/days.mjs.
  assert.equal(
    smallCardHtml([{ text: "3 days without food: takes 4 damage.", className: "sum" }, { text: "HP 5 to 1 (max 9).", className: "sum" }], {
      heading: "Example Hero is starving", classes: "day-card"
    }),
    `<div class="var-borg-card day-card"><h3>Example Hero is starving</h3><p class="sum">3 days without food: takes 4 damage.</p><p class="sum">HP 5 to 1 (max 9).</p></div>`
  );
  // A card with a button: the extra HTML is added as written, after the lines.
  const button = `<button type="button" data-action="x">Go &amp; stop</button>`;
  assert.equal(smallCardHtml("Ask.", { extraHtml: button }), `<div class="var-borg-card"><p>Ask.</p>${button}</div>`);
  // No heading given: no h3.
  assert.ok(!smallCardHtml("Ask.", { heading: "" }).includes("<h3>"));
});

/** Run a test body with a stand-in ChatMessage that records what it is asked to create. */
function withChatMessage(run) {
  const saved = globalThis.ChatMessage;
  const made = [];
  globalThis.ChatMessage = {
    getSpeaker: ({ actor }) => ({ actor: actor?.id ?? null }),
    create: async data => { made.push(data); return data; }
  };
  return run(made).finally(() => { globalThis.ChatMessage = saved; });
}

test("postSmallCard posts the speaker and the content, and nothing else unless asked", () => withChatMessage(async made => {
  await postSmallCard({ id: "a1" }, "Hello.");
  assert.deepEqual(made[0], { speaker: { actor: "a1" }, content: `<div class="var-borg-card"><p>Hello.</p></div>` });
  assert.deepEqual(Object.keys(made[0]).sort(), ["content", "speaker"]);
}));

test("postSmallCard passes flavor, rolls, sound and flags on as given, and an empty rolls list stays", () => withChatMessage(async made => {
  const roll = { total: 4 };
  await postSmallCard({ id: "a1" }, "Hello.", { flavor: "Panic", rolls: [roll], sound: "dice.wav", flags: { "var-borg": { panicChoice: true } } });
  await postSmallCard({ id: "a1" }, "Hello.", { rolls: [] });
  assert.equal(made[0].flavor, "Panic");
  assert.deepEqual(made[0].rolls, [roll]);
  assert.equal(made[0].sound, "dice.wav");
  assert.deepEqual(made[0].flags, { "var-borg": { panicChoice: true } });
  assert.deepEqual(made[1].rolls, []);
  assert.ok(!("sound" in made[1]) && !("flavor" in made[1]) && !("flags" in made[1]));
}));

test("postSmallCard uses a given speaker, and works with no actor then", () => withChatMessage(async made => {
  await postSmallCard(null, "Hello.", { speaker: { alias: "Weather" } });
  assert.deepEqual(made[0].speaker, { alias: "Weather" });
}));

/** The text inside each postSmallCard( ... ) call of a source file. Skips quoted text so brackets inside it do not count. */
function callBodies(source) {
  const bodies = [];
  const opener = "postSmallCard(";
  let from = 0;
  for (;;) {
    const at = source.indexOf(opener, from);
    if (at === -1) return bodies;
    const start = at + opener.length;
    let depth = 1;
    let quote = null;
    let i = start;
    for (; i < source.length && depth > 0; i++) {
      const character = source[i];
      if (quote) {
        if (character === "\\") i++;
        else if (character === quote) quote = null;
      } else if (character === `"` || character === `'` || character === "`") quote = character;
      else if (character === "(") depth++;
      else if (character === ")") depth--;
    }
    bodies.push(source.slice(start, i));
    from = i;
  }
}

test("no module wraps what it gives postSmallCard in its own escaping (that would escape twice)", () => {
  const moduleDir = fileURLToPath(new URL("../module/", import.meta.url));
  const files = readdirSync(moduleDir, { recursive: true }).filter(file => file.endsWith(".mjs") && !file.endsWith("chat-card.mjs"));
  let calls = 0;
  for (const file of files) {
    for (const body of callBodies(readFileSync(join(moduleDir, file), "utf8"))) {
      calls++;
      assert.ok(!/escapeHTML|escapeText|\besc\(|\bescape\(/.test(body), `${file}: a postSmallCard call escapes its own text:\n${body}`);
    }
  }
  assert.ok(calls > 0, "found no postSmallCard calls to check");
});
