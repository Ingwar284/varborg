/**
 * Tests for the local link check (module/local-links.mjs, playtest feedback).
 * Run with: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { hasLocalLink, localLinkPaths } from "../module/local-links.mjs";

test("a file:// address is a local link, an uploaded path is not", () => {
  assert.equal(hasLocalLink("file:///C:/Users/me/map.webp"), true);
  assert.equal(hasLocalLink("FILE:///D:/token.png"), true);
  assert.equal(hasLocalLink('<p><img src="file:///C:/a.png"></p>'), true);
  assert.equal(hasLocalLink("worlds/my-world/map.webp"), false);
  assert.equal(hasLocalLink("https://example.com/a.png"), false);
  assert.equal(hasLocalLink(null), false);
});

test("localLinkPaths finds each place inside a document", () => {
  const scene = {
    name: "Harbour",
    background: { src: "file:///C:/maps/harbour.webp" },
    tokens: [{ texture: { src: "tokens/rat.webp" } }, { texture: { src: "file:///C:/rat.png" } }],
    notes: []
  };
  assert.deepEqual(localLinkPaths(scene), ["background.src", "tokens.1.texture.src"]);
  assert.deepEqual(localLinkPaths({ img: "icons/svg/item-bag.svg" }), []);
});
