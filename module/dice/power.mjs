/**
 * Powers in Foundry (rules 3.10 "The price of the light", 3.4 Sustain,
 * GAPS 2 and 116–120).
 *
 * The Use button on the sheet:
 * - checks the power can be used now: in combat only on your own turn, with
 *   enough Ember in the pool (module/pools.mjs);
 * - tests the ability the power names, else the class's boosted ability,
 *   against DR 11 + cost (GAPS 117). Powers are not weapon attacks, even
 *   one that says "make a melee attack";
 * - in combat, pays the cost from the Ember pool and spends its action pips.
 * It posts the attack card, so Fortune and Inflict damage work as they do
 * for attacks, with the power's outcomes (module/dice/attack.mjs).
 *
 * A Sustained power that takes effect is marked on the sheet. Its Sustain
 * button spends one action; at the end of its user's turn a power that was
 * neither started nor sustained that turn ends (module/combat.mjs).
 *
 * The maths lives in module/rules/powers.mjs.
 */

import { useUpNextRoll as useUpNextRollBuffs } from "../outcomes.mjs";
import {
  powerDr, powerAbility, powerOutcome, powerUse, sustainCost, sustainAtEndOfTurn, startsSustaining,
  powerDamageFormula, BARE_WEAPONS
} from "../rules/powers.mjs";
import { damageFormula } from "../rules/attack.mjs";
import { isDamageFormula } from "../rules/equipment.mjs";
import { DR_TABLE, diceMode, diceFormula } from "../rules/test-roll.mjs";
import { modifiedDr } from "../rules/test-modifiers.mjs";
import { testConditions, totalModifiers } from "../rules/conditions.mjs";
import { CARD, dialogCost } from "../rules/fortune.mjs";
import { POOL, canPay } from "../rules/pools.mjs";
import { getPools, spendFromPool } from "../pools.mjs";
import { turnState } from "../combat.mjs";
import { useUpNextTest } from "../panic.mjs";
import { conditionsOf, conditionNotes, reminderNotes } from "../conditions.mjs";
import { itemRollMods, itemReminderNotes, itemOptionalMods, optionalEffectsField, tickedMods, effectiveWeapon, itemHooks, runItemHooks } from "../effects.mjs";
import { withExtraDamage, unarmedDamage, isRiskyPower } from "../rules/item-effects.mjs";
import { belongsTo } from "../rules/feats.mjs";
import { areaTargets } from "../rules/powers.mjs";
import { outcomeInputs } from "../outcomes.mjs";
import { outcomeOptions, thrallDamage } from "../rules/outcomes.mjs";
import { ownedThralls, deleteThralls } from "../minions.mjs";

/** The outcome inputs with the options chosen in the dialog (GAPS 224). */
function withChosen(inputs, chosen) {
  return inputs ? { ...inputs, chosen: chosen.filter(Boolean) } : null;
}
import { newFortuneData, fortuneFlags, fortuneFields, payDialogFortune } from "../fortune.mjs";
import { settleAttackCard } from "./attack.mjs";
import { actorTestModifiers, signed, modeLabel, diceOf } from "./ability-test.mjs";
import { VB_DIALOG_CLASSES } from "../dialog.mjs";
import { aimArea, keepSustainedArea } from "../areas.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/power-dialog.hbs";

/**
 * The Use button: use a power.
 * @param {Actor} actor  The character.
 * @param {Item} power   The power item.
 */
export async function usePower(actor, power) {
  // Gloom abilities are used from the foe sheet (module/dice/gloom.mjs).
  if (power.system.resource === "gloom") {
    ui.notifications.warn(game.i18n.format("VARBORG.Power.GloomOnCharacter", { name: power.name }));
    return;
  }
  return rollPowerTest(actor, power);
}

/**
 * Can the power be used now? Warns and returns null if not.
 * @returns {{allowed: true, ember: number, actions: number}|null}
 */
export function checkPowerUse(actor, power, turn, { free = false } = {}) {
  const i18n = game.i18n;
  const use = powerUse({
    inCombat: Boolean(turn.combatant), onOwnTurn: turn.onOwnTurn,
    cost: power.system.cost, actions: power.system.actions, usedOutside: power.system.usedOutside,
    reaction: Boolean(power.system.reaction)
  });
  if (!use.allowed) {
    const key = use.reason === "used" ? "VARBORG.Power.AlreadyUsed" : "VARBORG.Power.NotYourTurn";
    ui.notifications.warn(i18n.format(key, { name: power.name }));
    return null;
  }
  // Perfect casting: this spell costs no ember (GAPS 231).
  if (free) use.ember = 0;
  const left = getPools()[POOL.EMBER];
  if (use.ember && !canPay(left, use.ember)) {
    ui.notifications.warn(i18n.format("VARBORG.Power.NotEnoughEmber", { name: power.name, cost: use.ember, left }));
    return null;
  }
  return use;
}

/**
 * Pay the power's ember from the pool, after the dialog's Fortune was paid.
 * If the pool cannot pay after all, the Fortune is given back.
 * @returns {Promise<boolean>} Whether the power goes ahead.
 */
export async function payPowerEmber(actor, use, paid) {
  if (!use.ember) return true;
  if (await spendFromPool(POOL.EMBER, use.ember, actor)) return true;
  const refund = dialogCost(paid.boon, paid.bane);
  if (refund) await actor.update({ "system.fortune": (actor.system.fortune ?? 0) + refund });
  return false;
}

/**
 * Pay for a reaction power used from a card button (Reactive Plating,
 * Bend Fate, Not the face!, GAPS 227): in combat its ember from the pool
 * and the user's reaction; outside combat its one free use (rules 3.10).
 * @param {Actor} actor
 * @param {Item} power
 * @returns {Promise<string|null>}  An error key, or null when paid.
 */
export async function payReactionPower(actor, power) {
  const turn = turnState(actor);
  const use = powerUse({
    inCombat: Boolean(turn.combatant), onOwnTurn: turn.onOwnTurn,
    cost: power.system.cost, actions: power.system.actions, usedOutside: power.system.usedOutside, reaction: true
  });
  if (!use.allowed) return "VARBORG.Power.AlreadyUsed";
  if (use.ember && !canPay(getPools()[POOL.EMBER], use.ember)) return "VARBORG.Power.NotEnoughEmberShort";
  if (use.ember && !(await spendFromPool(POOL.EMBER, use.ember, actor))) return "VARBORG.Power.NotEnoughEmberShort";
  if (turn.combatant) await turn.combatant.adjustPips("reactions", -1);
  if (use.marksUsed) await power.update({ "system.usedOutside": true });
  return null;
}

/**
 * Spend the power's action pips (own turn, in combat).
 * @returns {Promise<string|null>} The card's note, such as "Used 2 actions."
 */
export async function spendPowerActions(turn, use) {
  if (turn.combatant && use.reactions) {
    if (turn.combatant.reactionsLeft < use.reactions) ui.notifications.warn(game.i18n.localize("VARBORG.Power.NoReaction"));
    await turn.combatant.adjustPips("reactions", -use.reactions);
    return game.i18n.localize("VARBORG.Power.UsedReaction");
  }
  if (!turn.combatant || !use.actions) return null;
  if (turn.combatant.actionsLeft < use.actions) ui.notifications.warn(game.i18n.localize("VARBORG.Power.NoActions"));
  await turn.combatant.adjustPips("actions", -use.actions);
  return game.i18n.format("VARBORG.Power.UsedActions", { count: use.actions });
}

/** The card note about Ember: paid from the pool, or none outside combat. */
export function emberNote(use, inCombat) {
  if (use.ember) return game.i18n.format("VARBORG.Power.PaidEmber", { cost: use.ember });
  return inCombat ? null : game.i18n.localize("VARBORG.Power.OutsideCombat");
}

/**
 * What the attack card needs to know about the power. Stored on the card,
 * so Fortune can work it out again.
 */
export function powerInputs(power) {
  const system = power.system;
  return {
    itemId: power.id,
    name: power.name,
    sustained: system.sustained,
    description: system.description,
    outcomes: { ...system.outcomes }
  };
}

/**
 * The damage dice for the card, and whether every part is valid dice.
 * @param {Item} power
 * @param {string} [weaponDice]  The weapon's damage dice the power adds (GAPS 121).
 */
export function powerDamageDice(power, weaponDice = "") {
  const weaponPart = String(weaponDice ?? "").trim();
  const powerPart = String(power.system.damage ?? "").trim();
  const text = powerDamageFormula({ weapon: weaponPart, power: powerPart }) ?? "";
  const invalid = [weaponPart, powerPart].filter(Boolean).some(part => !isDamageFormula(part));
  return { formula: text && !invalid ? text : null, text, invalid };
}

/**
 * What a power can take its damage dice from: every weapon the character
 * carries (equipped ones first), then unarmed (d2) and an improvised
 * weapon (d4) from rules 4.1, so there is always a choice.
 * @returns {{id: string, name: string, dice: string, equipped: boolean}[]}
 */
function damageWeapons(actor) {
  const i18n = game.i18n;
  const carried = actor.itemTypes.weapon
    .toSorted((a, b) => Number(b.system.equipped) - Number(a.system.equipped) || a.sort - b.sort)
    // A weapon such as the blunderbuss ("d10/d4") gives its within-range dice.
    .map(item => ({ id: item.id, name: item.name, dice: damageFormula(effectiveWeapon(item).damage, false), equipped: item.system.equipped }));
  const bare = Object.entries(BARE_WEAPONS).map(([id, dice]) => ({
    // Brawler: unarmed d4 (step 50a3).
    id, name: i18n.localize(`VARBORG.Power.Bare.${id}`), equipped: false,
    dice: id === "unarmed" ? unarmedDamage(actor.system.statBonuses?.unarmedDie) : dice
  }));
  return [...carried, ...bare];
}

/**
 * The outcome line: the power's own text for this result, or the usual one.
 * A spell's usual Ruin also calls for the Shadowblight table (rules 3.11).
 */
export function powerOutcomeText(power, tier) {
  const usual = power.kind === "spell" ? "VARBORG.Spell.Outcome" : "VARBORG.Power.Outcome";
  const own = power.outcomes?.[tier];
  if (own && power.kind === "spell" && tier === "ruin") return `${own} ${game.i18n.localize("VARBORG.Spell.ShadowblightNote")}`;
  return own || game.i18n.localize(`${usual}.${tier}`);
}

/** The four results, best first, as the power and spell cards list them. */
const OUTCOME_TIERS = ["triumph", "success", "failure", "ruin"];

/**
 * All four outcome lines for a power or spell card (playtest feedback):
 * each result's text, with the rolled one marked so the card can
 * highlight it.
 * @returns {{tier: string, label: string, text: string, rolled: boolean}[]}
 */
export function powerOutcomeLines(power, rolledTier) {
  return OUTCOME_TIERS.map(tier => ({
    tier,
    label: game.i18n.localize(`VARBORG.Tier.${tier}`),
    text: powerOutcomeText(power, tier),
    rolled: tier === rolledTier
  }));
}

/** A character's ember abilities: powers and spells (both can be Sustained). */
function emberAbilities(actor) {
  return [...(actor.itemTypes.power ?? []), ...(actor.itemTypes.spell ?? [])];
}

/**
 * Start a Sustained power when the result takes effect, or stop it again
 * when a Fortune reroll takes the effect away.
 * @returns {Promise<string|null>} The card's note.
 */
export async function applySustain(actor, data, tier) {
  const power = data.inputs.power;
  if (!power?.sustained) return null;
  const want = startsSustaining(true, tier);
  const before = data.applied.sustaining ?? false;
  if (want !== before) {
    await actor.items.get(power.itemId)?.update({ "system.sustaining": want, "system.kept": want });
    data.applied.sustaining = want;
  }
  return want ? game.i18n.localize("VARBORG.Power.SustainNote") : null;
}

/**
 * Use a power: test its ability against DR 11 + cost, and post the card.
 */
async function rollPowerTest(actor, power) {
  const i18n = game.i18n;
  const ability = powerAbility(power.system, actor.system.keyAbility);
  if (!ability) {
    ui.notifications.warn(i18n.format("VARBORG.Power.NoClass", { name: actor.name }));
    return;
  }
  const turn = turnState(actor);
  const use = checkPowerUse(actor, power, turn);
  if (!use) return;
  // An area of effect: aim it, and every creature it catches is targeted (playtest feedback).
  const aimed = await aimArea(actor, power);
  if (!aimed.go) return;
  const target = [...game.user.targets][0]?.actor ?? null;

  // A power that adds weapon damage: a carried weapon, unarmed or improvised.
  const weapons = power.system.addsWeaponDamage ? damageWeapons(actor) : [];

  const automatic = actorTestModifiers(actor, ability);
  const { conditions, fatigue } = conditionsOf(actor);
  // Item effects on powers count like conditions (PLAN step 49c).
  // The target's category, for effects against a chosen category (step 49h).
  const effectContext = {
    roll: "power", ability, targetCategory: target?.system?.category ?? "", damageType: power.system.damageType ?? "",
    // For effects on one power against a noted kind (Field notes, GAPS 214).
    powerName: power.name, targetName: target?.name ?? "", targetUuid: target?.uuid ?? ""
  };
  const conditionMods = [...testConditions(conditions, fatigue, ability), ...itemRollMods(actor, effectContext)];
  let fromConditions = totalModifiers(conditionMods);
  const notes = conditionNotes(conditionMods);
  // Item effects for the player to tick when they apply (PLAN step 49d).
  const optional = itemOptionalMods(actor, effectContext);
  const startDr = powerDr(power.system.cost);
  const abilityLabel = i18n.localize(`VARBORG.Ability.${ability}`);

  const content = await renderTemplate(DIALOG_TEMPLATE, {
    target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : i18n.localize("VARBORG.Power.NoTarget"),
    how: i18n.format("VARBORG.Power.TestNote", { ability: abilityLabel, dr: startDr }),
    useNote: use.reactions
      ? i18n.format("VARBORG.Power.UseNoteReaction", { cost: use.ember })
      : use.ember || use.actions
        ? i18n.format("VARBORG.Power.UseNote", { cost: use.ember, actions: use.actions })
        : i18n.localize("VARBORG.Power.OutsideCombat"),
    armourNote: automatic.armourDr ? i18n.format("VARBORG.Test.ArmourDialogNote", { armour: signed(automatic.armourDr), name: automatic.armourName }) : null,
    encumberedNote: automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
    conditionNotes: notes,
    reminders: [...reminderNotes(actor, "test"), ...itemReminderNotes(actor, effectContext)],
    optionalEffects: await optionalEffectsField(optional),
    weapons: weapons.map(choice => ({
      id: choice.id,
      label: `${choice.name} (${choice.dice})${choice.equipped ? ` · ${i18n.localize("VARBORG.Item.Equipped")}` : ""}`
    })),
    drs: DR_TABLE.map(dr => ({
      value: dr,
      label: i18n.format("VARBORG.Test.DROption", { dr, name: i18n.localize(`VARBORG.DR.${dr}`) }),
      selected: dr === startDr
    })),
    fortuneFields: await fortuneFields(actor, "power"),
    // Thralls this power destroys (GAPS 225).
    thrallAsk: power.system.thrallDestroy === "ask" ? {
      max: ownedThralls(actor).length,
      hint: i18n.format("VARBORG.Outcome.ThrallsAskHint", { have: ownedThralls(actor).length, per: power.system.thrallDamage || "—", max: power.system.thrallMax || "∞" })
    } : null,
    // Options to choose from (GAPS 224); a second one only counts on a Triumph.
    outcomeOptions: outcomeOptions(power.system.outcomeEffects ?? []),
    secondOption: (power.system.triumphPicks ?? 1) > 1,
    // Autodidactism: a Magic-themed tick, ticked for the class's own powers (GAPS 208).
    magic: itemHooks(actor, "cast").length ? {
      checked: power.system.source === "class" && belongsTo(power.system.belongsTo, actor.itemTypes.class?.[0]?.name ?? "")
    } : null
  });
  const options = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.format("VARBORG.Power.DialogTitle", { name: power.name }) },
    content,
    ok: { label: "VARBORG.Power.Use", icon: "fa-solid fa-fire" },
    rejectClose: false
  });
  if (!options) return;
  const ticked = tickedMods(optional, options);
  fromConditions = totalModifiers([...conditionMods, ...ticked]);
  notes.push(...conditionNotes(ticked));

  const paid = await payDialogFortune(actor, options);
  if (!paid) return;
  // Thralls the power needs must be there (GAPS 225).
  const notesAfter = [];
  const thralls = ownedThralls(actor);
  const destroying = { "": 0, one: 1, all: thralls.length, ask: Math.min(thralls.length, Math.max(0, Math.trunc(Number(options.thralls) || 0))) }[power.system.thrallDestroy ?? ""] ?? 0;
  if (["one", "all"].includes(power.system.thrallDestroy) && !thralls.length) {
    ui.notifications.warn(i18n.format("VARBORG.Outcome.ThrallsNone", { name: actor.name, power: power.name }));
    return;
  }
  if (!(await payPowerEmber(actor, use, paid))) return;
  if (destroying) {
    await deleteThralls(thralls.slice(0, destroying));
    notesAfter.push(i18n.format("VARBORG.Outcome.ThrallsDestroyed", { count: destroying, name: actor.name }));
  }
  const thrallExtra = thrallDamage(destroying, { per: power.system.thrallDamage, max: power.system.thrallMax, skip: power.system.thrallSkip });
  // Outside combat: this was the one free use (rules 3.10).
  if (use.marksUsed) await power.update({ "system.usedOutside": true });
  // A Risky power gives Adrenaline before the roll (GAPS 206).
  if (isRiskyPower(power.system.description)) await runItemHooks(actor, "risky");

  const boons = (options.boon ? 1 : 0) + (paid.boon ? 1 : 0) + fromConditions.boons;
  const banes = (options.bane ? 1 : 0) + (paid.bane ? 1 : 0) + (automatic.encumberedBane ? 1 : 0) + fromConditions.banes;
  const diceRule = diceMode(boons, banes);
  const abilityScore = actor.system.abilities[ability];
  const chosenDr = Number(options.dr);
  const dr = modifiedDr(chosenDr, automatic.armourDr + fromConditions.dr);

  const formula = `${diceFormula(diceRule)} + @ability`;
  const roll = await new Roll(formula, { ability: abilityScore }).evaluate();
  await useUpNextTest(actor);
  // "Next roll only" buffs are used up (GAPS 235).
  await useUpNextRollBuffs(actor, ["power"]);
  const pipNote = await spendPowerActions(turn, use);

  const weapon = weapons.length ? (weapons.find(choice => choice.id === options.weapon) ?? weapons[0]) : null;
  const damage = powerDamageDice(power, weapon?.dice);
  // Destroyed thralls add their damage (Charnel Charge, Flesh Tide).
  if (thrallExtra && damage.formula) damage.formula = `${damage.formula} + ${thrallExtra}`;
  const foe = target?.type === "foe" ? target : null;
  const title = i18n.format("VARBORG.Power.CardTitle", { name: power.name });
  const inputs = {
    formula,
    rollData: { ability: abilityScore },
    diceRule, abilityScore, dr,
    // Extra damage from item effects on powers (step 49e).
    damageFormula: damage.formula ? withExtraDamage(damage.formula, [...conditionMods, ...ticked]) : damage.formula,
    damageInvalid: damage.invalid,
    // A Ruin counts as a Failure (Field notes, GAPS 214).
    noRuin: [...conditionMods, ...ticked].some(mod => mod.noRuin),
    upgradeSuccess: [...conditionMods, ...ticked].some(mod => mod.upgradeSuccess),
    weaponDamage: damage.text,
    ruinedBefore: actor.system.attackRuin,
    // Every targeted creature, for area powers and spells (GAPS 141).
    area: areaTargets([...game.user.targets].map(token => token.actor).filter(Boolean)
      .map(other => ({ uuid: other.uuid, name: other.name, type: other.type, armour: other.system?.armour })), actor.uuid),
    areaDamageType: power.system.damageType ?? "",
    ignoresArmour: Boolean(power.system.ignoresArmour),
    // What each result gives the targets and user (step 51c), with the chosen options.
    outcomes: withChosen(outcomeInputs(actor, power), [options.option, options.option2]),
    inflicts: target?.type !== "character",
    foe: foe ? { uuid: foe.uuid, name: foe.name, armourBefore: foe.system.armour } : null,
    attackName: power.name,
    power: powerInputs(power),
    context: {
      title,
      how: i18n.format(namesAbility(power.system) ? "VARBORG.Power.HowNamed" : "VARBORG.Power.How", { ability: abilityLabel }),
      target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : null,
      modeLabel: modeLabel(diceRule, boons, banes),
      ability: signed(abilityScore),
      abilityLabel,
      drNote: dr !== chosenDr ? i18n.format("VARBORG.Attack.DRFrom", { dr: chosenDr }) : null,
      notes: [
        automatic.armourDr ? i18n.format("VARBORG.Attack.ArmourNote", { armour: signed(automatic.armourDr), name: automatic.armourName }) : null,
        automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
        ...notes,
        paid.note,
        weapon ? i18n.format("VARBORG.Power.WeaponNote", { name: weapon.name }) : null,
        ...notesAfter,
        emberNote(use, Boolean(turn.combatant))
      ].filter(Boolean),
      thrownNote: null,
      pipNote
    }
  };

  const data = newFortuneData(CARD.ATTACK, actor, inputs, { dice: diceOf(roll), damage: null, maximized: false }, foe?.uuid ?? null);
  const { content: cardContent, rolls } = await settleAttackCard(actor, data);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content: cardContent,
    rolls: [roll, ...rolls],
    sound: CONFIG.sounds.dice,
    flags: fortuneFlags(data)
  });
  // A Sustained power's area stays on the map until it ends.
  await keepSustainedArea(actor, power, aimed.region);
  // A magic-themed power rolls for a Photonic Surge (Autodidactism, GAPS 208).
  if (options.magic) await runItemHooks(actor, "cast");
}

/**
 * The Sustain button: keep a Sustained power going until your next turn.
 * In combat it spends one action, on your own turn only (rules 3.4).
 */
export async function sustainPower(actor, power) {
  const i18n = game.i18n;
  if (!power.system.sustaining) return;
  const turn = turnState(actor);
  const cost = sustainCost({ inCombat: Boolean(turn.combatant), onOwnTurn: turn.onOwnTurn });
  if (!cost.allowed) {
    ui.notifications.warn(i18n.localize("VARBORG.Power.SustainNotYourTurn"));
    return;
  }
  if (power.system.kept && turn.combatant) {
    ui.notifications.info(i18n.format("VARBORG.Power.AlreadyKept", { name: power.name }));
    return;
  }
  if (cost.actions) {
    if (turn.combatant.actionsLeft < cost.actions) ui.notifications.warn(i18n.localize("VARBORG.Power.NoActions"));
    await turn.combatant.adjustPips("actions", -cost.actions);
  }
  await power.update({ "system.kept": Boolean(turn.combatant) });
  await postLine(actor, i18n.format("VARBORG.Power.Sustained", { name: actor.name, power: power.name })
    + (cost.actions ? ` ${i18n.localize("VARBORG.Attack.UsedAction")}` : ""));
}

/** The End button: stop sustaining a power. */
export async function endPower(actor, power) {
  if (!power.system.sustaining) return;
  await power.update({ "system.sustaining": false, "system.kept": false });
  await postLine(actor, game.i18n.format("VARBORG.Power.Ended", { power: power.name }));
}

/**
 * End of the actor's turn: a Sustained power or spell that was neither
 * started nor sustained this turn ends. Runs on the Dark Master's client.
 */
export async function endOfTurnSustain(actor) {
  for (const power of emberAbilities(actor)) {
    if (!power.system.sustaining) continue;
    const next = sustainAtEndOfTurn({ sustaining: power.system.sustaining, kept: power.system.kept });
    await power.update({ "system.sustaining": next.sustaining, "system.kept": next.kept });
    if (next.ended) await postLine(actor, game.i18n.format("VARBORG.Power.NotSustained", { power: power.name, name: actor.name }));
  }
}

/**
 * Unlock ember abilities (powers and spells) again: each can be used once more outside combat
 * (rules 3.10, GAPS 22). Called when a combat ends (for the characters who
 * fought in it), by the Dark Master's Reset ember abilities button (for
 * every character), and later by rests. Runs on the Dark Master's client.
 * @param {Actor[]} actors
 * @param {object} [options]
 * @param {boolean} [options.announce]  Post a chat line saying so.
 * @returns {Promise<number>} How many powers were unlocked.
 */
export async function resetEmberAbilities(actors, { announce = false } = {}) {
  if (!game.user.isGM) return 0;
  let count = 0;
  for (const actor of new Set(actors)) {
    if (actor?.type !== "character") continue;
    const updates = emberAbilities(actor)
      .filter(power => power.system.usedOutside)
      .map(power => ({ _id: power.id, "system.usedOutside": false }));
    if (!updates.length) continue;
    await actor.updateEmbeddedDocuments("Item", updates);
    count += updates.length;
  }
  if (announce) {
    await ChatMessage.create({
      speaker: { alias: game.user.name },
      content: `<div class="var-borg-card power-card"><p>${game.i18n.localize("VARBORG.Power.ResetDone")}</p></div>`
    });
  }
  return count;
}

/** Does the power name its own test ability? */
function namesAbility(system) {
  return Boolean(system.ability) && system.ability !== "usual";
}

/** The outcome as the attack card uses it: hit, multiplier, no armour lowered, no Ruin. */
export function powerCardOutcome(tier) {
  const outcome = powerOutcome(tier);
  return { hit: outcome.damage, multiplier: outcome.multiplier, lowerArmour: false, ruin: false };
}

async function postLine(actor, text) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card power-card"><p>${foundry.utils.escapeHTML(text)}</p></div>`
  });
}
