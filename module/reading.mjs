/**
 * The Cartomancer's reading in Foundry (GAPS 319, 325, 326; PLAN step 69c).
 *
 * The reading lives on the character as the flag var-borg.reading. The
 * class feature The reading has a stat switch ("reading") and a Long Rest
 * hook (layReading) that lays out a new reading; Wider spread sets its
 * size ("readingSize"). The Feats tab shows the cards, each with a Turn
 * button: once per round, with the reaction in combat, the card's meaning
 * goes to the targeted creature (or the Cartomancer, with nothing
 * targeted), through the same outcome code powers use (module/outcomes.mjs).
 *
 * Step 69c2: Reversed, Foreseen, Shuffle the fates and Black sector (stat
 * switches "reversed", "foreseen", "shuffleFates", "blackSector"); the
 * Dark Master's button to turn the Thirteenth; and the card powers Draw
 * for the querent, Read the room and The Thirteenth card.
 * The feature's Use button lays out a reading while there is none
 * (module/uses.mjs).
 * The rules are in module/rules/arcana.mjs.
 */

import {
  TRUMPS, THIRTEENTH, READING_SIZE, layReading, readReading, canTurn, turnCard, roundKey, trumpMeaning,
  reshuffleUnturned, tearThirteenth, hasThirteenth, withThirteenth, freshCards
} from "./rules/arcana.mjs";
import { settleOutcomes } from "./outcomes.mjs";
import {
  arcanaStacks, drawReadingCards, drawFreshCards, turnArcanaCard, reshuffleArcana, thirteenthIntoHand
} from "./arcana-cards.mjs";

const SYSTEM = "var-borg";
const FLAG = "reading";
const ROUND_FLAG = "readingRound";
const ALL_ROLLS = ["test", "attack", "defence", "power", "spell"];

/** A d12, rolled with Foundry's dice randomness. */
const rollD12 = () => Math.ceil(CONFIG.Dice.randomUniform() * 12);

/** Whether the character reads the Dusk Arcana (the class feature The reading). */
export function hasReading(actor) {
  return actor?.system?.statBonuses?.reading?.set > 0;
}

/** Whether a stat switch is on for the character (a reading feat). */
function switchOn(actor, target) {
  return actor?.system?.statBonuses?.[target]?.set > 0;
}

/** The feat with this stat switch, if the character has it. */
function featWith(actor, target) {
  return actor.items.find(item => (item.system.effects ?? []).some(effect => effect.kind === "stat" && effect.target === target)) ?? null;
}

/** The character's reading now. */
export function readingOf(actor) {
  return readReading(actor.getFlag(SYSTEM, FLAG));
}

/** A trump's name, such as "The Cairn". */
export function trumpName(trump) {
  return game.i18n.localize(`VARBORG.Arcana.${TRUMPS[trump]}.Name`);
}

/** A trump's meaning, as on the Dusk Arcana. */
export function trumpText(trump) {
  return game.i18n.localize(`VARBORG.Arcana.${TRUMPS[trump]}.Meaning`);
}

/**
 * Lay out a new reading (after a Long Rest, or the sheet's button). The
 * Thirteenth card's hold on Black sector and its marked foe end here.
 * @param {Actor} actor
 * @returns {Promise<string>}  A line for the chat card.
 */
export async function layOutReading(actor, { thirteenth = false } = {}) {
  const size = switchOn(actor, "readingSize") ? actor.system.statBonuses.readingSize.set : READING_SIZE;
  const begin = thirteenth || Boolean(actor.getFlag(SYSTEM, "readingThirteenth"));
  // With Foundry Cards, the reading is drawn from the Arcana deck into its hand (step 69c3).
  const drawn = arcanaStacks(actor) ? await drawReadingCards(actor, size, { thirteenth: begin }) : null;
  const reading = drawn ? drawn.map(trump => ({ trump, turned: false })) : layReading(size, rollD12, { thirteenth: begin });
  await actor.setFlag(SYSTEM, FLAG, reading);
  for (const flag of ["readingThirteenth", "thirteenthLocked", "thirteenthDoom"]) {
    if (actor.getFlag(SYSTEM, flag) !== undefined) await actor.unsetFlag(SYSTEM, flag);
  }
  return game.i18n.format("VARBORG.Arcana.Laid", { name: actor.name, cards: reading.map(card => trumpName(card.trump)).join(", ") });
}

/** The sheet's lines for the reading. */
export function readingContext(actor) {
  if (!hasReading(actor)) return null;
  const reading = readingOf(actor);
  const shuffleFeat = featWith(actor, "shuffleFates");
  const locked = Boolean(actor.getFlag(SYSTEM, "thirteenthLocked"));
  return {
    cards: reading.map((card, index) => {
      const thirteenth = card.trump === THIRTEENTH;
      return {
        index,
        name: trumpName(card.trump),
        meaning: trumpText(card.trump),
        turned: card.turned,
        thirteenth,
        canTurn: canTurn(reading, index),
        canReverse: canTurn(reading, index) && switchOn(actor, "reversed"),
        canTear: thirteenth && !card.turned && switchOn(actor, "blackSector") && !locked,
        canDarkMaster: thirteenth && !card.turned && game.user.isGM
      };
    }),
    empty: !reading.length,
    canShuffle: Boolean(shuffleFeat) && !shuffleFeat.system.frequencyUsed && reading.some(card => !card.turned && card.trump !== THIRTEENTH)
  };
}

/** The combat the character is fighting in, if any. */
function combatOf(actor) {
  return game.combat?.started && game.combat.getCombatantsByActor(actor).length ? game.combat : null;
}

/** The targeted creatures, without the user. */
function targetedOthers(actor) {
  return [...game.user.targets].map(token => token.actor).filter(other => other && other !== actor);
}

/**
 * Turning a card: once per round, with the reaction in combat. Foreseen
 * (step 69c2): the first card in each combat uses no reaction.
 * @returns {Promise<{ok: boolean, lines: string[]}>}
 */
async function spendTurn(actor) {
  const i18n = game.i18n;
  const combat = combatOf(actor);
  const key = roundKey(combat?.id ?? "", combat?.round ?? 0);
  if (key && actor.getFlag(SYSTEM, ROUND_FLAG) === key) {
    ui.notifications.warn(i18n.localize("VARBORG.Arcana.OncePerRound"));
    return { ok: false, lines: [] };
  }
  const lines = [];
  if (key) await actor.setFlag(SYSTEM, ROUND_FLAG, key);
  const combatant = combat?.getCombatantsByActor(actor)[0];
  if (combatant) {
    if (switchOn(actor, "foreseen") && actor.getFlag(SYSTEM, "foreseenCombat") !== combat.id) {
      await actor.setFlag(SYSTEM, "foreseenCombat", combat.id);
      lines.push(i18n.localize("VARBORG.Arcana.Foreseen"));
    } else {
      if (combatant.reactionsLeft < 1) ui.notifications.warn(i18n.localize("VARBORG.Arcana.NoReaction"));
      await combatant.adjustPips("reactions", -1);
      lines.push(i18n.localize("VARBORG.Arcana.UsedReaction"));
    }
  }
  return { ok: true, lines };
}

/** One outcome entry on the target: a buff, or a condition. */
function targetEntry(fields) {
  return {
    kind: "buff", who: "target", tiers: { triumph: true, success: true, failure: false, ruin: false },
    condition: "", duration: { kind: "", rounds: "1" }, amount: "", option: "", when: "result", damageType: "",
    soaked: false, nextOnly: false, test: false, whileSustained: false, note: "", ...fields
  };
}

/** Give outcome entries to one creature, as a power's Success does. */
async function giveEntries(actor, target, { entries, buffs = [], name }) {
  return settleOutcomes({
    inputs: { outcomes: {
      entries, buffEffects: buffs, name, morph: false, sustained: false,
      source: `${actor.uuid}|reading`, targets: [target.uuid],
      allyTargets: [], foeTargets: target.type === "foe" ? [target.uuid] : [],
      user: actor.uuid, partner: "", chosen: []
    } },
    applied: {}
  }, "success");
}

/**
 * Give a trump's meaning to a creature (The reading, Draw for the querent,
 * Read the room): through the power outcome code, plus its Fortune.
 * @returns {Promise<{lines: string[], rolls: Roll[]}>}
 */
export async function giveTrump(actor, trump, target) {
  const i18n = game.i18n;
  const meaning = trumpMeaning(trump, { statuses: target.statuses ?? [] });
  const lines = [];
  const rolls = [];
  if (meaning.entries.length) {
    const given = await giveEntries(actor, target, { entries: meaning.entries, buffs: meaning.buffs, name: trumpName(trump) });
    lines.push(...given.lines);
    rolls.push(...given.rolls);
  }
  if (meaning.fortune) {
    if (target.isOwner) {
      await target.update({ "system.fortune": (target.system.fortune ?? 0) + meaning.fortune });
      lines.push(i18n.format("VARBORG.Arcana.GainedFortune", { name: target.name, amount: meaning.fortune }));
    } else lines.push(i18n.format("VARBORG.Arcana.FortuneByGM", { name: target.name, amount: meaning.fortune }));
  }
  if (meaning.manual) lines.push(i18n.localize("VARBORG.Arcana.ByHand"));
  return { lines, rolls };
}

/** Post a reading card: a title, the trump's meaning when there is one, and lines. */
async function postReadingCard(actor, title, lines, { trump = null, rolls = [] } = {}) {
  const esc = foundry.utils.escapeHTML;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content: `<div class="var-borg-card"><h3>${esc(title)}</h3>`
      + (trump ? `<p><em>${esc(trumpText(trump))}</em></p>` : "")
      + lines.filter(Boolean).map(line => `<p>${esc(line)}</p>`).join("") + "</div>",
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
}

/**
 * Turn a card of the reading for the targeted creature, or for the
 * Cartomancer with nothing targeted (The reading).
 * @param {Actor} actor
 * @param {number} index
 */
export async function turnReadingCard(actor, index) {
  const reading = readingOf(actor);
  if (!canTurn(reading, index)) return;
  const spent = await spendTurn(actor);
  if (!spent.ok) return;
  const target = [...game.user.targets].map(token => token.actor).find(Boolean) ?? actor;
  const trump = reading[index].trump;
  await actor.setFlag(SYSTEM, FLAG, turnCard(reading, index));
  await turnArcanaCard(actor, trump);
  const given = await giveTrump(actor, trump, target);
  await postReadingCard(actor, game.i18n.format("VARBORG.Arcana.TurnTitle", { card: trumpName(trump), name: target.name }),
    [...spent.lines, ...given.lines], { trump, rolls: given.rolls });
}

/**
 * Reversed (step 69c2): the card is turned upside down against a targeted
 * foe. Its meaning is lost, and the next attack against that foe has Boon
 * (for one round).
 */
export async function reverseReadingCard(actor, index) {
  const i18n = game.i18n;
  const reading = readingOf(actor);
  if (!canTurn(reading, index)) return;
  const foe = targetedOthers(actor).find(other => other.type === "foe");
  if (!foe) return void ui.notifications.warn(i18n.localize("VARBORG.Arcana.ReverseNoFoe"));
  const spent = await spendTurn(actor);
  if (!spent.ok) return;
  const trump = reading[index].trump;
  await actor.setFlag(SYSTEM, FLAG, turnCard(reading, index));
  await turnArcanaCard(actor, trump);
  const given = await giveEntries(actor, foe, {
    entries: [targetEntry({ duration: { kind: "rounds", rounds: "1" }, nextOnly: true, note: i18n.localize("VARBORG.Arcana.ReversedNote") })],
    buffs: [{ kind: "roll", roll: "attackAgainst", mode: "auto", grant: "boon" }],
    name: i18n.format("VARBORG.Arcana.ReversedName", { card: trumpName(trump) })
  });
  await postReadingCard(actor, i18n.format("VARBORG.Arcana.ReverseTitle", { card: trumpName(trump), name: foe.name }), [...spent.lines, ...given.lines]);
}

/**
 * Shuffle the fates (step 69c2): once per Long Rest, as an action, the
 * unturned cards (not the Thirteenth) are drawn anew.
 */
export async function shuffleFates(actor) {
  const i18n = game.i18n;
  const feat = featWith(actor, "shuffleFates");
  if (!feat || feat.system.frequencyUsed) return;
  const { turnState } = await import("./combat.mjs");
  const turn = turnState(actor);
  if (turn.combatant && !turn.onOwnTurn) return void ui.notifications.warn(i18n.localize("VARBORG.Arcana.NotYourTurn"));
  if (turn.combatant) await turn.combatant.adjustPips("actions", -1);
  const before = readingOf(actor);
  const unturned = before.filter(card => !card.turned && card.trump !== THIRTEENTH).map(card => card.trump);
  // With Foundry Cards, the unturned cards go back and are drawn anew (step 69c3).
  const fresh = await reshuffleArcana(actor, unturned);
  const reading = fresh ? before.map(card => (!card.turned && card.trump !== THIRTEENTH && fresh.length ? { trump: fresh.shift(), turned: false } : { ...card })) : reshuffleUnturned(before, rollD12);
  await actor.setFlag(SYSTEM, FLAG, reading);
  await feat.update({ "system.frequencyUsed": true });
  const turnedWord = i18n.localize("VARBORG.Arcana.Turned");
  await postReadingCard(actor, i18n.format("VARBORG.Arcana.ShuffledTitle", { name: actor.name }), [
    turn.combatant ? i18n.localize("VARBORG.Arcana.UsedAction") : null,
    i18n.format("VARBORG.Arcana.NowReading", { cards: reading.map(card => trumpName(card.trump) + (card.turned ? ` (${turnedWord})` : "")).join(", ") })
  ]);
}

/**
 * Black sector (step 69c2): the Thirteenth is torn in half and spent, and
 * the Cartomancer takes d4 mental damage. Not while The Thirteenth card
 * forbids it (until the next Long Rest).
 */
export async function tearThirteenthCard(actor) {
  const i18n = game.i18n;
  const reading = readingOf(actor);
  if (!hasThirteenth(reading) || actor.getFlag(SYSTEM, "thirteenthLocked")) return;
  await actor.setFlag(SYSTEM, FLAG, tearThirteenth(reading));
  await turnArcanaCard(actor, THIRTEENTH);
  const roll = await new Roll("d4").evaluate();
  const { killedByDamage } = await import("./deaths-door.mjs");
  const lines = [];
  if (!(await killedByDamage(actor, roll.total))) {
    const from = actor.system.hp.value;
    const to = Math.max(0, from - roll.total);
    await actor.update({ "system.hp.value": to });
    lines.push(i18n.format("VARBORG.Arcana.TornDamage", { name: actor.name, amount: roll.total, from, to }));
  }
  await postReadingCard(actor, i18n.format("VARBORG.Arcana.TornTitle", { name: actor.name }), lines, { rolls: [roll] });
}

/**
 * The Dark Master turns the Thirteenth (step 69c2): the creature they target
 * (or the Cartomancer) makes its next test with Bane. Then it is spent.
 */
export async function darkMasterThirteenth(actor) {
  const i18n = game.i18n;
  if (!game.user.isGM) return;
  const reading = readingOf(actor);
  if (!hasThirteenth(reading)) return;
  const target = targetedOthers(actor)[0] ?? actor;
  await actor.setFlag(SYSTEM, FLAG, tearThirteenth(reading));
  await turnArcanaCard(actor, THIRTEENTH);
  const given = await giveEntries(actor, target, {
    entries: [targetEntry({ nextOnly: true })],
    buffs: ALL_ROLLS.map(roll => ({ kind: "roll", roll, mode: "auto", grant: "bane" })),
    name: trumpName(THIRTEENTH)
  });
  await postReadingCard(actor, i18n.format("VARBORG.Arcana.DmTitle", { name: target.name }), given.lines, { trump: THIRTEENTH });
}

/**
 * The Thirteenth enters the reading in place of an unturned card (a Ruin of
 * Draw for the querent, The Thirteenth card). With lock, Black sector cannot
 * tear it until the next Long Rest.
 */
export async function addThirteenth(actor, { lock = false } = {}) {
  const before = readingOf(actor);
  const after = withThirteenth(before);
  await actor.setFlag(SYSTEM, FLAG, after);
  // With Foundry Cards, the Thirteenth is made in the hand, and the card it replaces goes back (step 69c3).
  const at = after.findIndex(card => card.trump === THIRTEENTH);
  if (!before.some(card => card.trump === THIRTEENTH)) await thirteenthIntoHand(actor, before[at]?.trump ?? 0);
  if (lock) await actor.setFlag(SYSTEM, "thirteenthLocked", true);
}

/** A choice between drawn trumps (Draw for the querent's Triumph). */
async function chooseTrump(trumps) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const { DialogV2 } = foundry.applications.api;
  const { VB_DIALOG_CLASSES } = await import("./dialog.mjs");
  const options = trumps.map(trump => `<option value="${trump}">${esc(trumpName(trump))}: ${esc(trumpText(trump))}</option>`).join("");
  const data = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.localize("VARBORG.Arcana.ChooseTitle") },
    content: `<div class="form-group"><select name="trump">${options}</select></div>`,
    ok: { label: "VARBORG.Arcana.ChooseOk", icon: "fa-solid fa-hand" },
    rejectClose: false
  });
  const picked = Number(data?.trump);
  return trumps.includes(picked) ? picked : trumps[0];
}

/**
 * The Cartomancer's card powers, after their test (step 69c2, GAPS 326):
 * Draw for the querent ("querent"), Read the room ("room") and The
 * Thirteenth card ("thirteenth"). The first result counts.
 * @param {Actor} actor
 * @param {string} kind
 * @param {string} tier  The power's result.
 */
export async function cartomancerPower(actor, kind, tier) {
  const i18n = game.i18n;
  const hit = ["triumph", "success"].includes(tier);
  const targets = targetedOthers(actor);
  const lines = [];
  const rolls = [];
  // Fresh cards: from the Arcana deck with Foundry Cards (step 69c3), else rolled.
  const fresh = async count => (await drawFreshCards(actor, count)) ?? freshCards(count, rollD12);
  const give = async (trump, target) => {
    lines.push(i18n.format("VARBORG.Arcana.DrawnFor", { card: trumpName(trump), name: target.name, meaning: trumpText(trump) }));
    const given = await giveTrump(actor, trump, target);
    lines.push(...given.lines);
    rolls.push(...given.rolls);
  };
  if (kind === "querent") {
    if (tier === "ruin") {
      await addThirteenth(actor);
      lines.push(i18n.localize("VARBORG.Arcana.ThirteenthIn"));
    } else if (hit) {
      const drawn = await fresh(tier === "triumph" ? 2 : 1);
      await give(drawn.length > 1 ? await chooseTrump(drawn) : drawn[0], targets[0] ?? actor);
    }
  }
  if (kind === "room" && (hit || tier === "failure")) {
    const drawn = await fresh(hit ? 3 : 1);
    // Each card to a different targeted creature in turn; one left over goes to the Cartomancer.
    const receivers = targets.slice(0, drawn.length);
    if (receivers.length < drawn.length) receivers.push(actor);
    for (let i = 0; i < drawn.length; i++) {
      if (receivers[i]) await give(drawn[i], receivers[i]);
      else lines.push(i18n.format("VARBORG.Arcana.Unused", { card: trumpName(drawn[i]) }));
    }
  }
  if (kind === "thirteenth") {
    const foe = targets.find(other => other.type === "foe");
    if (hit && foe) {
      await actor.setFlag(SYSTEM, "thirteenthDoom", { uuid: foe.uuid, combat: game.combat?.id ?? "" });
      lines.push(i18n.format("VARBORG.Arcana.Doomed", { name: foe.name }));
    }
    await addThirteenth(actor, { lock: true });
    lines.push(i18n.localize("VARBORG.Arcana.ThirteenthLocked"));
  }
  if (lines.length) await postReadingCard(actor, i18n.format("VARBORG.Arcana.PowerTitle", { name: actor.name }), lines, { rolls });
}

/**
 * The Thirteenth card (step 69c2): at the end of each of the marked foe's
 * turns, the Dark Master's client rolls a d6; on a 1 it dies, and a Mighty
 * foe takes 3d10 spirit damage instead. Until the end of the encounter.
 * @param {Actor} foe
 * @param {Combat} combat
 */
export async function thirteenthAtEndOfTurn(foe, combat) {
  if (!foe || foe.type !== "foe" || !game.user.isActiveGM) return;
  const marked = combat.combatants.map(combatant => combatant.actor).filter(Boolean).some(actor => {
    const doom = actor.getFlag(SYSTEM, "thirteenthDoom");
    return doom?.uuid === foe.uuid && doom.combat === combat.id;
  });
  if (!marked || !(foe.system.hp?.value > 0)) return;
  const i18n = game.i18n;
  const roll = await new Roll("d6").evaluate();
  const rolls = [roll];
  const lines = [i18n.format("VARBORG.Arcana.DoomRoll", { name: foe.name, total: roll.total })];
  if (roll.total === 1) {
    if (foe.system.tier === "mighty") {
      const damage = await new Roll("3d10").evaluate();
      rolls.push(damage);
      await foe.update({ "system.hp.value": Math.max(0, foe.system.hp.value - damage.total) });
      lines.push(i18n.format("VARBORG.Arcana.DoomMighty", { name: foe.name, amount: damage.total }));
    } else {
      await foe.update({ "system.hp.value": 0 });
      lines.push(i18n.format("VARBORG.Arcana.DoomDies", { name: foe.name }));
    }
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: foe }),
    content: `<div class="var-borg-card">${lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("")}</div>`,
    rolls,
    sound: CONFIG.sounds.dice
  });
}
