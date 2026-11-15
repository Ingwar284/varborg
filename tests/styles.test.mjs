/**
 * Tests for the stylesheets in styles/: the colour tokens, their contrast,
 * and that the selectors the code depends on are still styled.
 * Run with: npm test (or node --test tests/)
 *
 * Only Node built-ins are used. The stylesheets are read as plain text.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const stylesDir = path.join(projectRoot, "styles");
const tokensPath = path.join(stylesDir, "tokens.css");
const cardsPath = path.join(stylesDir, "cards.css");

// A custom property declaration: --vb-name: value;
// A value may contain url("...") strings, which can hold ':' and ';'.
const DECLARATION = /(--vb-[\w-]+)\s*:\s*((?:url\("[^"]*"\)|[^;])+);/g;

// Tokens that the code sets from JavaScript, so no stylesheet declares them.
const SET_FROM_JAVASCRIPT = new Set(["--vb-burn", "--vb-splash-tilt"]);

// The contrast pairs for both moods: [foreground, background, minimum ratio].
const CONTRAST_PAIRS = [
  ["--vb-text", "--vb-surface", 7],
  ["--vb-text", "--vb-surface-raised", 7],
  ["--vb-text", "--vb-field-focus", 7],
  ["--vb-text-soft", "--vb-surface", 7],
  ["--vb-text-soft", "--vb-surface-raised", 4.5],
  ["--vb-text-faint", "--vb-surface", 4.5],
  ["--vb-alert", "--vb-surface", 4.5],
  ["--vb-alert", "--vb-surface-raised", 4.5],
  ["--vb-band-text", "--vb-band", 7],
  ["--vb-band-hover", "--vb-band", 7],
  ["--vb-band-accent", "--vb-band", 3],
  ["--vb-line", "--vb-surface", 3],
  ["--vb-line", "--vb-surface-raised", 3],
  ["--vb-on-accent", "--vb-accent", 4.5],
  ["--vb-on-highlight", "--vb-highlight", 7],
  ["--vb-focus", "--vb-surface", 3],
  ["--vb-focus-on-band", "--vb-band", 3],
  ["--vb-btn-fg", "--vb-btn-bg", 7],
  ["--vb-btn-border", "--vb-surface", 3],
  ["--vb-ember", "--vb-surface", 4.5],
  ["--vb-gloom", "--vb-surface", 7],
  ["--vb-bane-fg", "--vb-bane-bg", 7],
  ["--vb-tier-triumph-fg", "--vb-tier-triumph-bg", 7],
  ["--vb-tier-success-fg", "--vb-surface", 7],
  ["--vb-tier-failure-bar", "--vb-surface", 3],
  ["--vb-tier-ruin-fg", "--vb-tier-ruin-bg", 4.5],
  ["--vb-tier-ruin-border", "--vb-surface", 3],
  ["--vb-hud-text", "--vb-hud-bg", 7]
];

// Selectors in cards.css that the code relies on.
const REQUIRED_CARD_SELECTORS = [
  ".tier-triumph",
  ".tier-success",
  ".tier-failure",
  ".tier-ruin",
  ".chance-positive",
  ".chance-neutral",
  ".chance-negative",
  ".tier-outcome",
  ".var-borg-card"
];

// ---------- Helpers ----------

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replaces every /* ... */ comment with spaces, keeping the line breaks so
// that line numbers still match the original file.
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
}

// Replaces url("data:...") and url('data:...') strings with spaces, keeping
// line breaks. Embedded images can hold '#' and colour-like text that is not CSS colour.
function stripDataUrls(css) {
  return css.replace(/url\(\s*(["'])data:[\s\S]*?\1\s*\)/g, (match) => match.replace(/[^\n]/g, " "));
}

// Returns a Map of custom property name to raw value for the block that starts
// with this exact selector followed by '{'.
function readBlock(css, selector) {
  const code = stripComments(css);
  const start = new RegExp("(^|\\n)[ \\t]*" + escapeRegExp(selector) + "\\s*\\{").exec(code);
  if (!start) throw new Error(`No block "${selector} {" found in tokens.css`);

  // Walk forward from the opening brace to the matching closing brace.
  const bodyStart = start.index + start[0].length;
  let depth = 1;
  let i = bodyStart;
  while (i < code.length && depth > 0) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
    i++;
  }
  const blockText = code.slice(bodyStart, i - 1);

  const declarations = new Map();
  for (const match of blockText.matchAll(DECLARATION)) {
    declarations.set(match[1], match[2].trim());
  }
  return declarations;
}

function readTokensCss() {
  return readFileSync(tokensPath, "utf8");
}

// The tokens in force for a mood: :root, then body, then (for dark) the dark block.
function tokensFor(css, mood) {
  const tokens = new Map([...readBlock(css, ":root"), ...readBlock(css, "body")]);
  if (mood === "dark") {
    for (const [name, value] of readBlock(css, 'body[data-vb-mood="dark"]')) tokens.set(name, value);
  }
  return tokens;
}

// Follows var(--vb-x) references until a literal value is reached.
// Returns undefined if a name is missing. Gives up after 10 steps (a loop).
function resolve(name, tokens) {
  let value = tokens.get(name);
  for (let step = 0; step < 10; step++) {
    if (value === undefined) return undefined;
    const reference = /^var\(\s*(--vb-[\w-]+)\s*\)$/.exec(value);
    if (!reference) return value;
    value = tokens.get(reference[1]);
  }
  throw new Error(`${name} has a reference loop, or a chain longer than 10 steps`);
}

// Reads #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(r, g, b) and rgba(r, g, b, a).
// Returns { r, g, b, a } with r, g, b from 0 to 255 and a from 0 to 1.
function parseColour(value) {
  const text = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    const digits = hex[1].length <= 4 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
    };
  }

  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(text);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4])
    };
  }

  throw new Error(`Cannot read the colour "${value}"`);
}

// Lays a translucent colour over an opaque one. The result is opaque.
function blend(fg, bg) {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  };
}

// WCAG 2 relative luminance of an opaque colour.
function luminance(colour) {
  const linear = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(colour.r) + 0.7152 * linear(colour.g) + 0.0722 * linear(colour.b);
}

// WCAG 2 contrast ratio between two opaque colours, from 1 to 21.
function contrast(a, b) {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function styleFiles() {
  return readdirSync(stylesDir).filter((file) => file.endsWith(".css")).sort();
}

// Line number (starting at 1) of a position in a text.
function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

// ---------- Tests ----------

test("role tokens meet their contrast minimum in both moods", () => {
  const css = readTokensCss();
  const failures = [];

  for (const mood of ["light", "dark"]) {
    const tokens = tokensFor(css, mood);

    for (const [fgName, bgName, minimum] of CONTRAST_PAIRS) {
      const fgValue = resolve(fgName, tokens);
      const bgValue = resolve(bgName, tokens);
      if (fgValue === undefined) {
        failures.push(`${mood} mood: ${fgName} is not defined in tokens.css`);
        continue;
      }
      if (bgValue === undefined) {
        failures.push(`${mood} mood: ${bgName} is not defined in tokens.css`);
        continue;
      }

      // A translucent background (the HUD panel) is treated as opaque: its alpha is ignored.
      const bg = { ...parseColour(bgValue), a: 1 };
      const fg = blend(parseColour(fgValue), bg);
      const ratio = contrast(fg, bg);

      if (ratio < minimum) {
        failures.push(
          `${mood} mood: ${fgName} on ${bgName} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`
        );
      }
    }
  }

  assert.equal(failures.length, 0, `Contrast failures:\n  ${failures.join("\n  ")}`);
});

test("every alias is declared on body, not :root", () => {
  const css = readTokensCss();
  const rootTokens = readBlock(css, ":root");
  const rootNames = new Set(rootTokens.keys());
  const problems = [];

  for (const [name, value] of rootTokens) {
    for (const reference of value.matchAll(/var\(\s*(--vb-[\w-]+)/g)) {
      if (!rootNames.has(reference[1])) {
        problems.push(`${name} on :root refers to ${reference[1]}, which is not defined on :root`);
      }
    }
  }

  assert.equal(problems.length, 0, `Aliases on :root must point only at :root names:\n  ${problems.join("\n  ")}`);
});

test("the dark mood only overrides tokens that exist in the light mood", () => {
  const css = readTokensCss();
  const lightNames = new Set([...readBlock(css, ":root").keys(), ...readBlock(css, "body").keys()]);
  const unknown = [...readBlock(css, 'body[data-vb-mood="dark"]').keys()].filter((name) => !lightNames.has(name));

  assert.equal(unknown.length, 0, `Dark block overrides names that are not defined in the light mood: ${unknown.join(", ")}`);
});

test("stylesheets other than tokens.css contain no literal colours", (t) => {
  const hitMessages = [];
  let total = 0;

  for (const file of styleFiles()) {
    if (file === "tokens.css") continue;

    const code = stripDataUrls(stripComments(readFileSync(path.join(stylesDir, file), "utf8")));
    const hits = [];

    // A hex colour: # then 3, 4, 6 or 8 hex digits, after a space, colon, comma, bracket or the start.
    for (const match of code.matchAll(/(^|[\s:,(\[])#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![\w-])/gi)) {
      hits.push({ index: match.index + match[1].length, text: `#${match[2]}` });
    }
    // A colour function: rgb(, rgba(, hsl(, hsla(.
    for (const match of code.matchAll(/\b(?:rgba?|hsla?)\(/gi)) {
      hits.push({ index: match.index, text: match[0] });
    }

    // A named colour used as a value (white, black, red...). Only the text after
    // a property name's colon is looked at, so "white-space" and class names are safe.
    for (const match of code.matchAll(/(?:^|[{;\s])[a-z-]+\s*:\s*([^;{}]+)/g)) {
      const value = match[1];
      const named = /(?<![\w.#$-])(white|black|red|green|blue|gr[ae]y|silver|gold|orange|yellow|purple|brown|maroon|navy|teal|crimson|ivory|beige|tan)(?![\w-])/i.exec(value);
      if (named) hits.push({ index: match.index + match[0].length - value.length + named.index, text: named[1] });
    }

    t.diagnostic(`${file}: ${hits.length} literal colour hit(s)`);
    total += hits.length;
    for (const hit of hits) {
      hitMessages.push(`${file} line ${lineOf(code, hit.index)}: ${hit.text}`);
    }
  }

  const shown = hitMessages.slice(0, 20);
  const more = hitMessages.length > shown.length ? `\n  ...and ${hitMessages.length - shown.length} more` : "";
  assert.equal(total, 0, `Literal colours found (${total} in all):\n  ${shown.join("\n  ")}${more}`);
});

test("selectors that the code depends on are still styled", () => {
  const css = readFileSync(cardsPath, "utf8");
  const missing = REQUIRED_CARD_SELECTORS.filter((selector) => !css.includes(selector));

  assert.equal(missing.length, 0, `styles/cards.css is missing: ${missing.join(", ")}`);
});

test("every --vb- token used in a stylesheet is defined", () => {
  const css = readTokensCss();
  const definedNames = new Set([
    ...readBlock(css, ":root").keys(),
    ...readBlock(css, "body").keys(),
    ...readBlock(css, 'body[data-vb-mood="dark"]').keys()
  ]);

  const declaredLocally = new Set();
  const usedIn = new Map(); // token name to the set of files that use it

  for (const file of styleFiles()) {
    const code = stripDataUrls(stripComments(readFileSync(path.join(stylesDir, file), "utf8")));

    for (const match of code.matchAll(/(--vb-[\w-]+)\s*:/g)) declaredLocally.add(match[1]);

    for (const match of code.matchAll(/var\(\s*(--vb-[\w-]+)/g)) {
      if (!usedIn.has(match[1])) usedIn.set(match[1], new Set());
      usedIn.get(match[1]).add(file);
    }
  }

  const undefinedNames = [...usedIn.keys()].filter(
    (name) => !definedNames.has(name) && !declaredLocally.has(name) && !SET_FROM_JAVASCRIPT.has(name)
  );
  const lines = undefinedNames.map((name) => `${name} used in ${[...usedIn.get(name)].join(", ")}`);

  assert.equal(lines.length, 0, `Tokens used but not defined:\n  ${lines.join("\n  ")}`);
});
