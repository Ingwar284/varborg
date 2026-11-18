/**
 * The cards strip (PLAN step 70): a small band at the top-left corner of
 * the hotbar that shows,
 * when "Drawing cards" is on Foundry Cards (GAPS 320), each Cartomancer's
 * reading and each Card Slinger's last drawn card.
 *
 * Players see the characters they own; the Dark Master sees every
 * character a player owns. A Cartomancer's reading shows its hand of
 * trumps, turned ones face down (module/arcana-cards.mjs). A Card Slinger
 * shows the newest card on its Razor deck's discard pile and the cards left
 * (module/cards.mjs). Hovering a card names it; clicking a character's name
 * opens their sheet. Clicking an unturned card of one's own reading turns it,
 * as the sheet's turn button does (for the targeted creature, or the
 * Cartomancer with nothing targeted). Drawing stays on the sheet.
 * A button at its left minimises it to that button alone, or opens it
 * again; each user's choice is remembered (a client setting). The strip
 * is fixed on the screen and follows the hotbar when it moves or changes
 * size.
 * The look is in styles/stage.css (.vb-cards*).
 */

import { foundryCardsMode, cardsStripOpen, setCardsStripOpen } from "./settings.mjs";
import { arcanaStacks } from "./arcana-cards.mjs";
import { isDeckWeapon, deckCount } from "./cards.mjs";
import { readingOf, turnReadingCard } from "./reading.mjs";
import { canTurn } from "./rules/arcana.mjs";

const SYSTEM = "var-borg";
const ID = "var-borg-cards-strip";

/** The characters this user should see in the strip. */
function shownActors() {
  return game.actors.filter(actor => actor.type === "character" && (game.user.isGM ? actor.hasPlayerOwner : actor.isOwner));
}

/** The newest card on a pile (the highest sort is the last passed to it). */
function newestCard(pile) {
  return pile?.cards.contents.toSorted((a, b) => (b.sort ?? 0) - (a.sort ?? 0))[0] ?? null;
}

/** One card picture: its face, or its back when face down. With onClick, a button. */
function cardImage(card, { tooltip, faceDown = false, latest = false, onClick = null } = {}) {
  const el = document.createElement(onClick ? "button" : "span");
  el.className = "vb-cards__card";
  if (onClick) {
    el.type = "button";
    el.classList.add("is-playable");
    el.addEventListener("click", onClick);
  }
  el.classList.toggle("is-face-down", faceDown);
  el.classList.toggle("is-latest", latest);
  el.dataset.tooltip = tooltip;
  el.setAttribute("aria-label", tooltip);
  const img = document.createElement("img");
  img.src = card.img || "icons/svg/card-joker.svg";
  img.alt = "";
  el.append(img);
  return el;
}

/** A character's group: their name, then their cards. */
function group(actor, cards, note = "") {
  const el = document.createElement("div");
  el.className = "vb-cards__group";
  const name = document.createElement("button");
  name.type = "button";
  name.className = "vb-cards__name";
  name.textContent = actor.name;
  name.dataset.tooltip = game.i18n.localize("VARBORG.CardsStrip.OpenSheet");
  name.addEventListener("click", () => actor.sheet?.render(true));
  const row = document.createElement("div");
  row.className = "vb-cards__row";
  row.append(...cards);
  el.append(name, row);
  if (note) {
    const small = document.createElement("span");
    small.className = "vb-cards__note";
    small.textContent = note;
    el.append(small);
  }
  return el;
}

/** The Cartomancer's reading: the hand of trumps. */
function readingGroup(actor) {
  const stacks = arcanaStacks(actor);
  if (!stacks) return null;
  const i18n = game.i18n;
  const reading = readingOf(actor);
  const cards = stacks.hand.cards.contents.toSorted((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(card => {
    const faceDown = card.face === null;
    const meaning = card.faces?.[0]?.text ?? "";
    let tooltip = faceDown ? i18n.format("VARBORG.CardsStrip.Turned", { card: card.faces?.[0]?.name ?? card.name })
      : `${card.faces?.[0]?.name ?? card.name}: ${meaning}`;
    // The card's place in the reading on the character, which the rules keep.
    const trump = Number(card.getFlag(SYSTEM, "trump")) || 0;
    const index = reading.findIndex(entry => entry.trump === trump && !entry.turned);
    const playable = !faceDown && actor.isOwner && canTurn(reading, index);
    if (playable) tooltip += ` · ${i18n.localize("VARBORG.CardsStrip.ClickToTurn")}`;
    const onClick = playable ? () => turnReadingCard(actor, index) : null;
    return cardImage(card, { tooltip, faceDown, onClick });
  });
  if (!cards.length) return group(actor, [], i18n.localize("VARBORG.CardsStrip.NoReading"));
  return group(actor, cards);
}

/** The Card Slinger's last drawn card, for each Razor deck (usually one). */
function slingerGroups(actor) {
  const i18n = game.i18n;
  return actor.itemTypes.weapon.filter(isDeckWeapon).map(item => {
    const pile = game.cards?.get(item.getFlag(SYSTEM, "cardsPile") ?? "") ?? null;
    if (!pile) return null;
    const { left, total } = deckCount(item);
    const last = newestCard(pile);
    const note = i18n.format("VARBORG.CardsStrip.Left", { left, total });
    if (!last) return group(actor, [], `${i18n.localize("VARBORG.CardsStrip.NoneDrawn")} · ${note}`);
    const tooltip = i18n.format("VARBORG.CardsStrip.Last", { card: last.name, item: item.name });
    return group(actor, [cardImage(last, { tooltip, latest: true })], note);
  }).filter(Boolean);
}

/** The open-or-minimise button, at the strip's left. */
function toggleButton(open, count) {
  const i18n = game.i18n;
  const el = document.createElement("button");
  el.type = "button";
  el.className = "vb-cards__toggle";
  el.setAttribute("aria-expanded", String(open));
  const tip = i18n.localize(open ? "VARBORG.CardsStrip.Minimise" : "VARBORG.CardsStrip.Expand");
  el.dataset.tooltip = tip;
  el.setAttribute("aria-label", tip);
  const icon = document.createElement("i");
  icon.className = open ? "fa-solid fa-chevron-left" : "fa-solid fa-layer-group";
  el.append(icon);
  // Minimised, it shows how many characters have cards in play.
  if (!open) {
    const badge = document.createElement("span");
    badge.className = "vb-cards__count";
    badge.textContent = String(count);
    el.append(badge);
  }
  el.addEventListener("click", async () => {
    await setCardsStripOpen(!open);
    render();
  });
  return el;
}

/** Draw the strip again from the Cards documents. */
function render() {
  const strip = document.getElementById(ID);
  if (!strip) return;
  strip.replaceChildren();
  const groups = [];
  if (foundryCardsMode()) {
    for (const actor of shownActors()) {
      const reading = readingGroup(actor);
      if (reading) groups.push(reading);
      groups.push(...slingerGroups(actor));
    }
  }
  strip.classList.toggle("is-empty", !groups.length);
  if (!groups.length) return;
  const open = cardsStripOpen();
  strip.classList.toggle("is-open", open);
  strip.append(toggleButton(open, groups.length));
  if (open) {
    const plates = document.createElement("div");
    plates.className = "vb-cards__plates";
    plates.append(...groups);
    strip.append(plates);
  }
  place();
}

const refresh = foundry.utils.debounce(render, 100);

/**
 * Put the strip at the hotbar's top-left corner: its left edge on the
 * hotbar's, its bottom just above the hotbar's top.
 */
function place() {
  const strip = document.getElementById(ID);
  const hotbar = document.getElementById("hotbar");
  if (!strip) return;
  if (!hotbar) {
    strip.style.left = "16px";
    strip.style.bottom = "80px";
    return;
  }
  const box = hotbar.getBoundingClientRect();
  strip.style.left = `${Math.round(box.left)}px`;
  strip.style.bottom = `${Math.round(window.innerHeight - box.top + 6)}px`;
}

let watcher = null;

/** Make the strip, and keep it at the hotbar's corner. */
function mount() {
  let strip = document.getElementById(ID);
  if (!strip) {
    strip = document.createElement("section");
    strip.id = ID;
    strip.className = "vb-cards is-empty";
    strip.setAttribute("aria-label", game.i18n.localize("VARBORG.CardsStrip.Label"));
    document.body.append(strip);
  }
  // The hotbar is drawn again from time to time: watch the one there now.
  const hotbar = document.getElementById("hotbar");
  if (hotbar && typeof ResizeObserver === "function") {
    watcher?.disconnect();
    watcher = new ResizeObserver(() => place());
    watcher.observe(hotbar);
    watcher.observe(document.body);
  }
  place();
  refresh();
}

/** Called from the init hook. */
export function registerCardsStrip() {
  Hooks.once("ready", mount);
  Hooks.on("renderHotbar", mount);
  Hooks.on("collapseSidebar", () => setTimeout(place, 250));
  window.addEventListener("resize", () => place());
  for (const hook of ["createCard", "updateCard", "deleteCard", "createCards", "updateCards", "deleteCards", "varBorgCardDraw"]) {
    Hooks.on(hook, refresh);
  }
  // A Razor deck added or ticked, a reading laid out, a character's owners changed.
  for (const hook of ["createItem", "updateItem", "deleteItem", "updateActor"]) Hooks.on(hook, refresh);
}
