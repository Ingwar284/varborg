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
import { collectEffects, cardButtons, betterMode, ALLIES, interceptedDamage } from "./rules/item-effects.mjs";
import { diceFormula, keptDie, flippedDie } from "./rules/test-roll.mjs";
import { rollShadowblight } from "./shadowblight.mjs";
import { hasFrequency } from "./rules/uses.mjs";

/**
 * An item's button on a card: "item:<item id>" rerolls (step 49g),
 * "item:<item id>:success" makes a failed test a Success (step 50b2).
 */
const ITEM_PREFIX = "item:";
const SUCCESS = "success";

/** An item button that lowers damage taken (step 50d). */
const LOWER = "lowerDamage";

/** An item button that rerolls the damage taken and keeps the lower (Bend Fate, GAPS 227). */
const BEND = "lowerReroll";

/** An ally's button: they take the damage instead (GAPS 229). */
const INTERCEPT = "intercept";

/** An item button that turns the kept d20 over (Vex's loaded die, step 53a). */
const FLIP = "flip";

/** Item buttons whose kind is written after the item id ("item:<id>:<kind>"). */
const NAMED_KINDS = [SUCCESS, LOWER, BEND, INTERCEPT, FLIP];

/**
 * The item id and action of an item button, and the actor whose item it is
 * when that is another character ("item:actorId.itemId", Call upon the
 * divine, step 51a2).
 */
function itemAction(action) {
  const [ref, kind] = action.slice(ITEM_PREFIX.length).split(":");
  const [ownerId, itemId] = ref.includes(".") ? ref.split(".") : [null, ref];
  return { itemId, ownerId, kind: NAMED_KINDS.includes(kind) ? kind : SPEND.REROLL };
}

/**
 * The item buttons other player characters offer on this character's card
 * (Call upon the divine: "your own or that of an ally", GAPS 209).
 */
function allyButtons(actor, rollKind, card) {
  if (actor?.type !== "character") return [];
  return game.actors
    .filter(other => other.type === "character" && other.id !== actor.id && other.hasPlayerOwner)
    .flatMap(other => cardButtons(collectEffects(other.items).filter(effect => effect.vs === ALLIES), rollKind, card)
      .map(entry => ({ ...entry, ownerId: other.id, item: `${entry.item} (${other.name})` })));
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
  const card = { tier: shown.tier, natural: shown.natural, ability: data.inputs?.ability, used, taken: shown.taken };
  const items = actor?.items
    // Taking an ally's damage is only for others' cards (GAPS 229).
    ? [...cardButtons(collectEffects(actor.items).filter(effect => effect.action !== "intercept"), cardRoll(data), card), ...allyButtons(actor, cardRoll(data), card)]
    : [];
  const keyOf = entry => `${ITEM_PREFIX}${entry.ownerId ? `${entry.ownerId}.` : ""}${entry.itemId}${NAMED_KINDS.includes(entry.action) ? `:${entry.action}` : ""}`;
  data.offered.push(...items.map(keyOf));
  return renderTemplate(BUTTONS_TEMPLATE, {
    buttons: data.offered.map(action => (action.startsWith(ITEM_PREFIX)
      ? {
        action,
        icon: { [SUCCESS]: "fa-solid fa-screwdriver-wrench", [LOWER]: ICONS[SPEND.LOWER_DAMAGE], [BEND]: ICONS[SPEND.REROLL], [INTERCEPT]: "fa-solid fa-shield-heart", [FLIP]: "fa-solid fa-arrows-up-down" }[itemAction(action).kind] ?? ICONS[SPEND.REROLL],
        label: i18n.format({ [SUCCESS]: "VARBORG.Effects.SuccessButton", [LOWER]: "VARBORG.Effects.LowerButton", [BEND]: "VARBORG.Effects.BendButton", [INTERCEPT]: "VARBORG.Effects.InterceptButton", [FLIP]: "VARBORG.Effects.FlipButton" }[itemAction(action).kind] ?? "VARBORG.Effects.RerollButton",
          { item: items.find(entry => action === keyOf(entry))?.item ?? "", amount: items.find(entry => action === keyOf(entry))?.amount ?? "" })
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
      ? i18n.format({ [SUCCESS]: "VARBORG.Effects.SuccessLog", [LOWER]: "VARBORG.Effects.LowerLog", [BEND]: "VARBORG.Effects.BendLog", [INTERCEPT]: "VARBORG.Effects.InterceptLog", [FLIP]: "VARBORG.Effects.FlipLog" }[entry.action] ?? "VARBORG.Effects.RerollLog", { name: entry.name, item: entry.item, value: entry.value ?? "" })
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
  // Another character's item is paid by that character, whose player presses it (GAPS 209).
  const ownerId = byItem ? itemAction(action).ownerId : null;
  const itemOwner = ownerId ? game.actors.get(ownerId) : actor;
  if (ownerId && !itemOwner?.isOwner) {
    ui.notifications.warn(i18n.format("VARBORG.Effects.AllyButtonNotYours", { name: itemOwner?.name ?? "?" }));
    return false;
  }
  const spender = byItem ? itemOwner : actor.isOwner && actor.type === "character" ? actor : game.user.character;
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
  let lowerEffect = null;
  let rerollEffect = null;
  // A relic used on a card rolls its Expendable d20 afterwards (rules 4.2, step 53a).
  let relic = null;
  if (action.startsWith(ITEM_PREFIX)) {
    // An item's reroll or Success: its use is spent instead of Fortune
    // (steps 49g, 50b2).
    const { itemId, ownerId, kind } = itemAction(action);
    const item = (ownerId ? game.actors.get(ownerId) : actor)?.items.get(itemId);
    if (!item) return { error: "VARBORG.Fortune.Gone" };
    if (hasFrequency(item.system)) {
      if (item.system.frequencyUsed) return { error: "VARBORG.Fortune.NotNow" };
      await item.update({ "system.frequencyUsed": true });
    }
    // A reaction power pays its ember and the reaction (GAPS 227).
    if (["power", "spell"].includes(item.type)) {
      const { payReactionPower } = await import("./dice/power.mjs");
      const error = await payReactionPower(item.actor, item);
      if (error) return { error };
    }
    entry.action = kind;
    entry.item = item.name;
    entry.itemId = item.id;
    if (item.type === "relic") relic = item;
    const effect = collectEffects([item]).find(found => found.kind === "use" && found.action === kind && found.roll === cardRoll(data));
    failAgain = effect?.failAgain ? effect : null;
    lowerEffect = [LOWER, BEND, INTERCEPT].includes(kind) ? effect : null;
    if (kind === INTERCEPT) entry.protectorUuid = item.actor?.uuid ?? null;
    rerollEffect = kind === SPEND.REROLL ? effect : null;
  } else {
    if (!canSpend(spender.system.fortune)) return { error: "VARBORG.Fortune.None" };
    await spender.update({ "system.fortune": spend(spender.system.fortune) });
  }
  const extraRolls = [];
  const state = data.state;
  switch (entry.action) {
    case SPEND.REROLL:
      // A feat's reroll with Boon (Parry, step 50f): the dice one step better.
      if (lowerEffect === null && rerollEffect?.grant === "boon") {
        const key = "diceRule" in data.inputs ? "diceRule" : "mode";
        const old = data.inputs[key];
        const better = betterMode(old);
        data.inputs.formula = data.inputs.formula.replace(diceFormula(old), diceFormula(better));
        data.inputs[key] = better;
      }
      // New dice; an earlier Triumph → Success or Human Ingenuity belonged
      // to the old roll.
      state.dice = null;
      state.softened = false;
      state.succeeded = false;
      state.flipped = false;
      break;
    case FLIP: {
      // Vex's loaded die (rules 4.2): "the result becomes 21 minus the
      // roll. The new number is not a natural 1 or 20." Once per card.
      if (!state.dice?.length || state.flipped) break;
      const mode = data.inputs.mode ?? data.inputs.diceRule;
      const kept = keptDie(state.dice.map(die => die.value), mode);
      state.flipped = true;
      entry.value = `${kept} → ${flippedDie(kept)}`;
      break;
    }
    case SUCCESS:
      state.succeeded = true;
      break;
    case LOWER: {
      // A feat takes its roll off the damage taken; a hit still deals 1 (step 50d).
      const roll = await new Roll(failAgain?.amount || lowerEffect?.amount || "0").evaluate();
      extraRolls.push(roll);
      state.featLowered = [...(state.featLowered ?? []), roll.total];
      entry.value = `−${roll.total}`;
      break;
    }
    case INTERCEPT: {
      // The protector takes it instead, through their own armour (GAPS 229).
      const protector = entry.protectorUuid ? await fromUuid(entry.protectorUuid) : null;
      if (!protector || !(state.lastBefore > 0)) break;
      const { defenceModifiers } = await import("./dice/defence.mjs");
      const die = defenceModifiers(protector).soakDie;
      const soakRoll = die ? await new Roll(die).evaluate() : null;
      if (soakRoll) extraRolls.push(soakRoll);
      const taken = interceptedDamage(state.lastBefore, lowerEffect?.amount, soakRoll?.total ?? 0);
      const { killedByDamage } = await import("./deaths-door.mjs");
      if (!(await killedByDamage(protector, taken))) {
        await protector.update({ "system.hp.value": Math.max(0, protector.system.hp.value - taken) });
      }
      entry.value = taken;
      state.intercepted = game.i18n.format("VARBORG.Effects.Intercepted", { name: protector.name, taken });
      break;
    }
    case BEND: {
      // The damage is rolled again and the lower counts (Bend Fate, GAPS 227).
      const formula = data.inputs.damageFormula ?? state.damageFormula ?? null;
      if (!formula || state.damage === null) break;
      const roll = await new Roll(formula).evaluate();
      extraRolls.push(roll);
      entry.value = `${state.damage} / ${roll.total}`;
      state.damage = Math.min(state.damage, roll.total);
      state.noShared = true;
      break;
    }
    case SPEND.SOFTEN:
      entry.tier = state.tier;
      state.softened = true;
      break;
    case SPEND.MAX_DAMAGE:
      state.maximized = true;
      state.damage = null;
      // Not the damage shared by an area gloom ability any more (GAPS 141).
      state.noShared = true;
      break;
    case SPEND.REROLL_DAMAGE:
      state.damage = null;
      state.noShared = true;
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
  if (relic) {
    const { rollRelicDie } = await import("./relics.mjs");
    await rollRelicDie(relic.actor, relic);
  }
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
