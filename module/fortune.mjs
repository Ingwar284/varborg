/**
 * Fortune in Foundry (rule 3.9, GAPS 103-110).
 *
 * Test, attack and defence cards carry Fortune buttons: Reroll, Triumph →
 * Success or Ruin → Failure, maximum damage, reroll damage, and −d6 damage
 * taken. Each press burns 1 Fortune and works out the card again from what
 * it remembers (its flags), undoing what the old result did and doing what
 * the new one does. Anyone may press: the card's own character pays if you
 * own it, otherwise your own character (GAPS 105). When you may not change
 * the card or the foe it touches, the Dark Master's client does it for you
 * (a Foundry query).
 *
 * Test dialogs get "Fortune: Boon" and "Fortune: Bane" boxes, paid when you
 * roll (GAPS 106).
 *
 * The cards themselves are worked out in module/dice/ability-test.mjs,
 * attack.mjs and defence.mjs, registered here by registerFortune.
 */

import { FORTUNE_COST, STARTING_FORTUNE_FORMULA, LOWER_DAMAGE_FORMULA, SPEND, CARD, canSpend, spend, dialogCost, availableSpends } from "./rules/fortune.mjs";
import { collectEffects, cardButtons } from "./rules/item-effects.mjs";
import { rollShadowblight } from "./shadowblight.mjs";
import { hasFrequency } from "./rules/uses.mjs";

/**
 * An item's button on a card: "item:<item id>" rerolls (step 49g),
 * "item:<item id>:success" makes a failed test a Success (step 50b2).
 */
const ITEM_PREFIX = "item:";
const SUCCESS = "success";

/** The item id and action of an item button. */
function itemAction(action) {
  const [itemId, kind] = action.slice(ITEM_PREFIX.length).split(":");
  return { itemId, kind: kind === SUCCESS ? SUCCESS : SPEND.REROLL };
}

/** The kind of roll a card shows, for item rerolls (step 49g). */
function cardRoll(data) {
  if (data.card === CARD.ATTACK) return data.inputs?.power ? (data.inputs.power.kind === "spell" ? "spell" : "power") : "attack";
  if (data.card === CARD.GLOOM) return "gloomTest";
  return data.card;
}

const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const FLAG = "fortune";
const QUERY = "var-borg.fortune";
const BUTTONS_TEMPLATE = "systems/var-borg/templates/chat/fortune-buttons.hbs";
const FIELDS_TEMPLATE = "systems/var-borg/templates/dice/fortune-fields.hbs";

/** The message flags that settle a card: its damage was taken or inflicted (GAPS 108). */
const SETTLED_FLAGS = ["damageTaken", "damageInflicted"];

/** Icons for the buttons. */
const ICONS = {
  [SPEND.REROLL]: "fa-solid fa-rotate",
  [SPEND.SOFTEN]: "fa-solid fa-scale-balanced",
  [SPEND.MAX_DAMAGE]: "fa-solid fa-burst",
  [SPEND.REROLL_DAMAGE]: "fa-solid fa-dice",
  [SPEND.LOWER_DAMAGE]: "fa-solid fa-shield-heart"
};

/** card kind → async (actor, data) => {content, rolls}. Filled by registerFortune. */
const settlers = {};

/**
 * Hook up Fortune: the card buttons, the Dark Master's query, and the
 * starting d3 Fortune.
 * @param {Object<string, Function>} cards  For each card kind, the function
 *   that works the card out again from its data.
 */
export function registerFortune(cards) {
  Object.assign(settlers, cards);
  CONFIG.queries[QUERY] = applyFortune;
  Hooks.on("renderChatMessageHTML", addFortuneCardListeners);
}

/**
 * The flags a new card stores so Fortune can work it out again.
 * @param {string} card     CARD.TEST, CARD.ATTACK or CARD.DEFENCE.
 * @param {Actor} actor     The character on the card.
 * @param {object} inputs   Everything fixed when the roll was made.
 * @param {object} state    What Fortune can change (dice, softened, damage...).
 * @param {object} [foeUuid] A foe whose armour the card may change.
 */
export function newFortuneData(card, actor, inputs, state, foeUuid = null) {
  return {
    card,
    actorUuid: actor.uuid,
    foeUuid,
    inputs,
    state: { softened: false, log: [], ...state },
    applied: {},
    offered: []
  };
}

/** The flags for ChatMessage.create. */
export function fortuneFlags(data) {
  return { [SYSTEM]: { [FLAG]: data } };
}

/**
 * The Fortune buttons and the list of Fortune burned, as HTML for the card.
 * Also records which uses were offered, so a stale button does nothing.
 * @param {object} data      The card's Fortune data (changed: data.offered).
 * @param {object} shown     What the card shows now (see availableSpends).
 * @returns {Promise<string>}
 */
export async function fortuneSection(data, shown) {
  const i18n = game.i18n;
  data.offered = availableSpends({ card: data.card, ...shown });
  // Items of the card's character that offer a reroll or a Success, while
  // their use is not spent, wherever Fortune could reroll (steps 49g, 50b2).
  // Each item once per card.
  const actor = data.offered.includes(SPEND.REROLL) ? await fromUuid(data.actorUuid) : null;
  const used = data.state.log.map(entry => entry.itemId).filter(Boolean);
  const items = actor?.items
    ? cardButtons(collectEffects(actor.items), cardRoll(data), { tier: shown.tier, natural: shown.natural, ability: data.inputs?.ability, used })
    : [];
  const keyOf = entry => `${ITEM_PREFIX}${entry.itemId}${entry.action === SUCCESS ? `:${SUCCESS}` : ""}`;
  data.offered.push(...items.map(keyOf));
  return renderTemplate(BUTTONS_TEMPLATE, {
    buttons: data.offered.map(action => (action.startsWith(ITEM_PREFIX)
      ? {
        action,
        icon: itemAction(action).kind === SUCCESS ? "fa-solid fa-screwdriver-wrench" : ICONS[SPEND.REROLL],
        label: i18n.format(itemAction(action).kind === SUCCESS ? "VARBORG.Effects.SuccessButton" : "VARBORG.Effects.RerollButton",
          { item: items.find(entry => action === keyOf(entry))?.item ?? "" })
      }
      : {
        action,
        icon: ICONS[action],
        label: i18n.format("VARBORG.Fortune.Button", {
          use: i18n.localize(action === SPEND.SOFTEN ? `VARBORG.Fortune.Soften.${shown.tier}` : `VARBORG.Fortune.Use.${action}`),
          cost: FORTUNE_COST
        })
      })),
    log: data.state.log.map(entry => (entry.failedAgain
      ? i18n.format("VARBORG.Effects.FailedAgain", { item: entry.item, note: entry.note || i18n.localize("VARBORG.Effects.SeeText") })
      : entry.item
      ? i18n.format(entry.action === SUCCESS ? "VARBORG.Effects.SuccessLog" : "VARBORG.Effects.RerollLog", { name: entry.name, item: entry.item })
      : i18n.format("VARBORG.Fortune.Spent", {
        name: entry.name,
        use: i18n.localize(entry.action === SPEND.SOFTEN ? `VARBORG.Fortune.Soften.${entry.tier}` : `VARBORG.Fortune.Use.${entry.action}`)
      }) + (entry.value ? ` (${entry.value})` : "")))
  });
}

/**
 * Fortune buttons on chat cards. Hooked to renderChatMessageHTML.
 * A settled card's buttons are switched off.
 */
function addFortuneCardListeners(message, html) {
  const buttons = html.querySelectorAll("button[data-fortune]");
  if (!buttons.length) return;
  const settled = SETTLED_FLAGS.some(flag => message.getFlag(SYSTEM, flag));
  for (const button of buttons) {
    if (settled) {
      button.disabled = true;
      continue;
    }
    button.addEventListener("click", async () => {
      for (const other of buttons) other.disabled = true;
      const done = await spendOnCard(message, button.dataset.fortune);
      // On success the card is drawn again; otherwise switch the buttons back on.
      if (!done) for (const other of buttons) other.disabled = false;
    });
  }
}

/**
 * A Fortune button was pressed: find who pays, then change the card here or
 * ask the Dark Master to.
 * @returns {Promise<boolean>} Whether the card changed.
 */
async function spendOnCard(message, action) {
  const i18n = game.i18n;
  const data = message.getFlag(SYSTEM, FLAG);
  const actor = data ? await fromUuid(data.actorUuid) : null;
  if (!actor) {
    ui.notifications.warn(i18n.localize("VARBORG.Fortune.Gone"));
    return false;
  }
  // An item's reroll is paid with that item's use, by its own character (step 49g).
  const byItem = action.startsWith(ITEM_PREFIX);
  // A minion has no Fortune: on its card your own character pays (GAPS 105, 169).
  const spender = byItem ? actor : actor.isOwner && actor.type === "character" ? actor : game.user.character;
  if (spender?.type !== "character") {
    ui.notifications.warn(i18n.localize("VARBORG.Fortune.NoCharacter"));
    return false;
  }
  if (!byItem && !canSpend(spender.system.fortune)) {
    ui.notifications.warn(i18n.format("VARBORG.Fortune.None", { name: spender.name }));
    return false;
  }

  const foe = data.foeUuid ? await fromUuid(data.foeUuid) : null;
  const here = game.user.isGM || (message.isOwner && actor.isOwner && spender.isOwner && (!foe || foe.isOwner));
  const request = { messageId: message.id, action, spenderUuid: spender.uuid };
  let result;
  if (here) result = await applyFortune(request);
  else {
    const gm = game.users.activeGM;
    if (!gm) {
      ui.notifications.warn(i18n.localize("VARBORG.Fortune.NoGM"));
      return false;
    }
    try {
      result = await gm.query(QUERY, request, { timeout: 30000 });
    } catch (error) {
      console.error("VÅR BORG | Fortune query failed", error);
      result = { error: "VARBORG.Fortune.NoGM" };
    }
  }
  if (result?.error) {
    ui.notifications.warn(i18n.format(result.error, { name: spender.name }));
    return false;
  }
  return true;
}

/**
 * Burn 1 Fortune and work the card out again. Runs on the presser's client
 * when they may change everything involved, otherwise on the Dark Master's.
 * @param {{messageId: string, action: string, spenderUuid: string}} request
 * @returns {Promise<{ok: true}|{error: string}>}
 */
async function applyFortune({ messageId, action, spenderUuid }) {
  const message = game.messages.get(messageId);
  const data = foundry.utils.deepClone(message?.getFlag(SYSTEM, FLAG));
  if (!data || !settlers[data.card]) return { error: "VARBORG.Fortune.Gone" };
  if (SETTLED_FLAGS.some(flag => message.getFlag(SYSTEM, flag)) || !data.offered.includes(action)) {
    return { error: "VARBORG.Fortune.NotNow" };
  }
  const actor = await fromUuid(data.actorUuid);
  const spender = await fromUuid(spenderUuid);
  if (!actor || !spender) return { error: "VARBORG.Fortune.Gone" };
  const entry = { name: spender.name, action };
  let failAgain = null;
  if (action.startsWith(ITEM_PREFIX)) {
    // An item's reroll or Success: its use is spent instead of Fortune
    // (steps 49g, 50b2).
    const { itemId, kind } = itemAction(action);
    const item = actor.items.get(itemId);
    if (!item) return { error: "VARBORG.Fortune.Gone" };
    if (hasFrequency(item.system)) {
      if (item.system.frequencyUsed) return { error: "VARBORG.Fortune.NotNow" };
      await item.update({ "system.frequencyUsed": true });
    }
    entry.action = kind;
    entry.item = item.name;
    entry.itemId = item.id;
    const effect = collectEffects([item]).find(found => found.kind === "use" && found.action === kind && found.roll === cardRoll(data));
    failAgain = effect?.failAgain ? effect : null;
  } else {
    if (!canSpend(spender.system.fortune)) return { error: "VARBORG.Fortune.None" };
    await spender.update({ "system.fortune": spend(spender.system.fortune) });
  }
  const extraRolls = [];
  const state = data.state;
  switch (entry.action) {
    case SPEND.REROLL:
      // New dice; an earlier Triumph → Success or Human Ingenuity belonged
      // to the old roll.
      state.dice = null;
      state.softened = false;
      state.succeeded = false;
      break;
    case SUCCESS:
      state.succeeded = true;
      break;
    case SPEND.SOFTEN:
      entry.tier = state.tier;
      state.softened = true;
      break;
    case SPEND.MAX_DAMAGE:
      state.maximized = true;
      state.damage = null;
      break;
    case SPEND.REROLL_DAMAGE:
      state.damage = null;
      break;
    case SPEND.LOWER_DAMAGE: {
      const roll = await new Roll(LOWER_DAMAGE_FORMULA).evaluate();
      extraRolls.push(roll);
      state.lowered = [...(state.lowered ?? []), roll.total];
      entry.value = `−${roll.total}`;
      break;
    }
  }
  state.log.push(entry);

  let { content, rolls } = await settlers[data.card](actor, data, message);
  // An item's reroll that fails again (GAPS 198): its note on the card, and
  // for Whim of the Fey the Shadowblight table.
  if (failAgain && entry.action === SPEND.REROLL && ["failure", "ruin"].includes(state.tier)) {
    state.log.push({ name: spender.name, item: entry.item, failedAgain: true, note: failAgain.note });
    ({ content } = await settlers[data.card](actor, data, message));
    if (failAgain.failAgain === "shadowblight") await rollShadowblight(actor);
  }
  await message.update({
    content,
    rolls: [...message.rolls, ...rolls, ...extraRolls].map(roll => roll.toJSON()),
    [`flags.${SYSTEM}.${FLAG}`]: data
  });
  if (rolls.length || extraRolls.length) foundry.audio.AudioHelper.play({ src: CONFIG.sounds.dice }, true);
  return { ok: true };
}

/**
 * The "Fortune: Boon" and "Fortune: Bane" boxes for a test dialog, as HTML.
 * @param {Actor} actor
 * @param {string} prefix  Keeps the field ids apart, such as "test" or "attack".
 */
export function fortuneFields(actor, prefix) {
  return renderTemplate(FIELDS_TEMPLATE, {
    prefix,
    hint: game.i18n.format("VARBORG.Fortune.DialogHint", { fortune: actor.system.fortune ?? 0 })
  });
}

/**
 * Pay for the dialog's Fortune Boon and Bane before rolling.
 * @param {Actor} actor
 * @param {object} data   The dialog's form data.
 * @returns {Promise<{boon: boolean, bane: boolean, note: string|null}|null>}
 *   null when there is not enough Fortune (the roll should not happen).
 */
export async function payDialogFortune(actor, data) {
  const boon = Boolean(data.fortuneBoon);
  const bane = Boolean(data.fortuneBane);
  const cost = dialogCost(boon, bane);
  if (!cost) return { boon, bane, note: null };
  const fortune = actor.system.fortune ?? 0;
  if (!canSpend(fortune, cost)) {
    ui.notifications.warn(game.i18n.format("VARBORG.Fortune.NotEnough", { name: actor.name, cost, fortune }));
    return null;
  }
  await actor.update({ "system.fortune": spend(fortune, cost) });
  const which = [boon ? "VARBORG.Test.Boon" : null, bane ? "VARBORG.Test.Bane" : null]
    .filter(Boolean).map(key => game.i18n.localize(key)).join(", ");
  return { boon, bane, note: game.i18n.format("VARBORG.Fortune.DialogSpent", { cost, which }) };
}

/**
 * A new character's d3 Fortune, unless it was given one (GAPS 110).
 * @returns {Promise<number|null>} The Fortune rolled, or null.
 */
export async function rollStartingFortune(data) {
  if (foundry.utils.hasProperty(data, "system.fortune")) return null;
  const roll = await new Roll(STARTING_FORTUNE_FORMULA).evaluate();
  return roll.total;
}

/** The chat line for a new character's Fortune. */
export async function postStartingFortune(actor, fortune) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${game.i18n.format("VARBORG.Fortune.Starting", { name: actor.name, fortune })}</p></div>`
  });
}
