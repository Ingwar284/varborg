/**
 * Damaging foes and Morale in Foundry (rules 3.4 Attack, 3.8 Armour,
 * 3.12 Panic and morale, GAPS 69-72).
 *
 * An attack card that hits has an Inflict damage button. It rolls the foe's
 * armour die, subtracts it (a hit always deals at least 1) and lowers the
 * foe's HP. On a Triumph the armour soaks with the die it had before the
 * hit, and only then steps down (GAPS 69). Only someone who may change the
 * foe (the Dark Master) can press it.
 *
 * The damage card offers Morale buttons when the last enemy standing is at
 * a third of its HP or less (once per fight, GAPS 97), or when this kill brings the group (the foes
 * in combat, mooks left out) to half eliminated (GAPS 70, 72). The foe
 * sheet always has a Morale button. At 0 HP the foe is marked defeated in
 * the Combat Tracker (GAPS 71).
 * Morale: 2d6, above the foe's Morale it is demoralised, then d6: 1-3 it
 * flees, 4-6 it surrenders. Morale "–" and mooks never roll.
 * All the maths lives in module/rules/morale.mjs; this file only rolls and
 * shows.
 */

import { armourAfterIgnored, statBonuses, collectEffects, auraReaches } from "../rules/item-effects.mjs";
import { stepDownArmourDie } from "../rules/attack.mjs";
import { hpAfterDamage } from "../rules/health.mjs";
import {
  MORALE_DICE, DEMORALISED_DIE, canRollMorale, moraleTriggers, moraleResult, moraleDice
} from "../rules/morale.mjs";
import { totalModifiers } from "../rules/conditions.mjs";
import { conditionNotes } from "../conditions.mjs";
import {
  itemRollMods, itemOptionalMods, optionalEffectsField, tickedMods, rollResists, resistLines, countKill, runItemHooks, DAMAGED_BY_FLAG
} from "../effects.mjs";
import { foeDamageAfterResists } from "../rules/resistance.mjs";
import { withDamagedBy, isMoraleEffect, moraleEffectCounts, moraleAfterEffects } from "../rules/foe-hooks.mjs";

const { renderTemplate } = foundry.applications.handlebars;
const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";
const DAMAGE_TEMPLATE = "systems/var-borg/templates/chat/foe-damage-card.hbs";
const MORALE_TEMPLATE = "systems/var-borg/templates/chat/morale-card.hbs";

/** Stands in for a combat id when a foe is hit outside combat. */
const NO_COMBAT = "none";

/**
 * Deal an attack's damage to a foe: roll its armour, lower its HP, post a
 * card.
 * @param {Actor} foe        The foe hit.
 * @param {number} damage    The attack's damage (already doubled on a Triumph).
 * @param {string} armour    The armour die that soaks this hit ("" for none).
 * @param {string} attack    The attack's name, for the card.
 * @param {string} [damageType]  The hit's damage type, for the foe's
 *   immunities and resistances (step 52a): "" for none.
 * @param {string[]|null} [weaponTags]  A weapon attack's tags ("shoot",
 *   "ranged"…), for resists by weapon (step 52c); null for powers and spells.
 * @returns {Promise<boolean>} Whether the hit brought the foe to 0 HP.
 */
export async function inflictDamage(foe, damage, armour, attack, damageType = "", weaponTags = null) {
  const i18n = game.i18n;
  const rolls = [];
  let soak = 0;
  // Marks that ignore some or all of its armour (Read the beast, Point out the flaw, step 51e).
  armour = armourAfterIgnored(armour, statBonuses(collectEffects(foe.items)).armourIgnored, stepDownArmourDie);
  if (armour) {
    const soakRoll = new Roll(armour);
    await soakRoll.evaluate();
    rolls.push(soakRoll);
    soak = soakRoll.total;
  }
  // Immunities and resistances by damage type, before armour (step 52a,
  // GAPS 236): Stone Skin halves fire, Iron Regulation is immune to poison.
  const resist = await rollResists(foe, damageType, null, { weaponTags });
  rolls.push(...resist.rolls);
  const { taken, minimum } = foeDamageAfterResists(damage, soak, resist.kept.items, resist.kept.totals);
  const from = foe.system.hp.value;
  const to = hpAfterDamage(from, taken);
  // The damage types it took since its last turn (Regeneration, GAPS 238).
  const damagedBy = withDamagedBy(foe.getFlag(SYSTEM, DAMAGED_BY_FLAG), damageType, taken);
  await foe.update({ "system.hp.value": to, [`flags.${SYSTEM}.${DAMAGED_BY_FLAG}`]: damagedBy });

  const max = foe.system.hp.max;
  const fallen = to === 0;
  if (fallen) await markDefeated(foe);
  const killed = fallen && from > 0;

  // Who may roll Morale now: the last enemy, or everyone left when this
  // kill brings the group to half (GAPS 70, 72). The last enemy is offered
  // it once per fight (GAPS 97), remembered in the foe's flags.
  const group = foeGroup(foe);
  const fight = game.combat?.id ?? NO_COMBAT;
  const lastEnemyOffered = foe.getFlag(SYSTEM, "lastEnemyMorale") === fight;
  const triggers = moraleTriggers(group, foe.uuid, fallen && from > 0, { lastEnemyOffered });
  if (triggers.lastEnemy && canRollMorale(foe.system)) await foe.setFlag(SYSTEM, "lastEnemyMorale", fight);
  const moraleNotes = [
    triggers.lastEnemy ? i18n.format("VARBORG.FoeDamage.LastEnemy", { name: foe.name }) : null,
    triggers.halfDown ? i18n.localize("VARBORG.FoeDamage.HalfDown") : null
  ].filter(Boolean);
  const moraleFoes = triggers.roll.map(id => {
    const actor = group.find(member => member.id === id).actor;
    return { uuid: id, label: i18n.format("VARBORG.MoraleRoll.ButtonFor", { name: actor.name }) };
  });

  const content = await renderTemplate(DAMAGE_TEMPLATE, {
    title: i18n.format("VARBORG.FoeDamage.CardTitle", { name: foe.name }),
    attack: attack ? i18n.format("VARBORG.FoeDamage.From", { attack }) : null,
    damage,
    damageType: damageType ? i18n.localize(`VARBORG.DamageType.${damageType}`) : null,
    resistLines: resistLines(resist.kept),
    soakDie: armour ? i18n.localize(`VARBORG.Foe.Armour.${armour}`) : null,
    soak,
    taken,
    minimum,
    hp: i18n.format("VARBORG.FoeDamage.Hp", { from, to, max }),
    fallenNote: fallen ? i18n.format("VARBORG.FoeDamage.Fallen", { name: foe.name }) : null,
    moraleNotes: moraleFoes.length ? moraleNotes : [],
    moraleFoes
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: foe }),
    flavor: i18n.format("VARBORG.FoeDamage.CardTitle", { name: foe.name }),
    content,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
  return killed;
}

/**
 * Roll the foe's Morale and post the result.
 * @param {Actor} foe
 */
export async function rollMorale(foe) {
  const i18n = game.i18n;
  if (!canRollMorale(foe.system)) {
    ui.notifications.warn(i18n.format("VARBORG.MoraleRoll.Never", { name: foe.name }));
    return;
  }
  // Morale effects from its own passives and nearby allies' (Mob Courage,
  // Desecrated Symbol: step 52b, GAPS 239).
  const changed = moraleChanges(foe);
  const morale = moraleAfterEffects(foe.system.morale, changed);
  // Item effects on Morale (PLAN step 49d, GAPS 182): the foe's own, and
  // the characters' (Dragon's Shadow), always or ticked in a small dialog.
  const { auto, optional } = moraleEffects(foe);
  let mods = auto;
  if (optional.length) {
    const data = await DialogV2.input({
      window: { title: i18n.format("VARBORG.MoraleRoll.DialogTitle", { name: foe.name }) },
      content: await optionalEffectsField(optional),
      ok: { label: "VARBORG.MoraleRoll.Roll", icon: "fa-solid fa-dice" },
      rejectClose: false
    });
    if (!data) return;
    mods = [...auto, ...tickedMods(optional, data)];
  }
  const totals = totalModifiers(mods);
  const dice = moraleDice(totals.boons, totals.banes);
  const roll = new Roll(dice);
  await roll.evaluate();
  const rolls = [roll];
  const notes = [
    ...changed.map(effect => i18n.format(effect.op === "set" ? "VARBORG.MoraleRoll.SetBy" : "VARBORG.MoraleRoll.AddBy",
      { item: effect.source, value: effect.op === "set" ? effect.value : `${effect.value >= 0 ? "+" : "−"}${Math.abs(effect.value)}` })),
    ...conditionNotes(mods),
    dice !== MORALE_DICE ? i18n.localize(`VARBORG.MoraleRoll.Dice.${dice === "3d6kh2" ? "high" : "low"}`) : null
  ].filter(Boolean);

  // Only a demoralised foe rolls the d6.
  let d6 = null;
  if (roll.total > morale) {
    const reactionRoll = new Roll(DEMORALISED_DIE);
    await reactionRoll.evaluate();
    rolls.push(reactionRoll);
    d6 = reactionRoll.total;
  }
  const result = moraleResult(roll.total, morale, d6 ?? undefined);

  const content = await renderTemplate(MORALE_TEMPLATE, {
    title: i18n.format("VARBORG.MoraleRoll.CardTitle", { name: foe.name }),
    dice: roll.dice[0].results.map(r => ({ value: r.result, dropped: !r.active })),
    notes,
    total: roll.total,
    morale,
    demoralised: result.demoralised,
    outcome: result.demoralised
      ? i18n.format("VARBORG.MoraleRoll.Demoralised", { name: foe.name })
      : i18n.format("VARBORG.MoraleRoll.Holds", { name: foe.name }),
    d6,
    reaction: result.reaction ? i18n.format(`VARBORG.MoraleRoll.Reaction.${result.reaction}`, { name: foe.name }) : null
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: foe }),
    flavor: i18n.format("VARBORG.MoraleRoll.CardTitle", { name: foe.name }),
    content,
    rolls,
    sound: CONFIG.sounds.dice
  });
}

/**
 * The Morale modifiers from items: the foe's own, and each character's on
 * the players' side (in the combat, or every player character outside
 * one), named with whose item it is.
 * @returns {{auto: object[], optional: object[]}}
 */
function moraleEffects(foe) {
  const context = { roll: "morale" };
  const characters = game.combat
    ? game.combat.combatants.map(c => c.actor).filter(actor => actor?.type === "character")
    : game.actors.filter(actor => actor.type === "character" && actor.hasPlayerOwner);
  const named = (actor, mods) => mods.map(mod => ({ ...mod, item: game.i18n.format("VARBORG.Effects.FromActor", { item: mod.item, name: actor.name }) }));
  const auto = [...itemRollMods(foe, context)];
  const optional = [...itemOptionalMods(foe, context)];
  for (const actor of new Set(characters)) {
    auto.push(...named(actor, itemRollMods(actor, context)));
    optional.push(...named(actor, itemOptionalMods(actor, context)));
  }
  return { auto, optional };
}

/** A foe's token on the scene being viewed, or null. */
function sceneToken(actor) {
  const token = actor.token?.object ?? actor.getActiveTokens?.()[0] ?? null;
  return token?.scene === canvas?.scene ? token : null;
}

/** The distance facts between two tokens, for auraReaches. */
function tokenGap(one, two, radius) {
  return auraReaches({
    centreDistance: canvas.grid.measurePath([one.center, two.center]).distance,
    sizeA: Math.max(one.document.width, one.document.height),
    sizeB: Math.max(two.document.width, two.document.height),
    gridDistance: canvas.grid.distance,
    radius
  });
}

/**
 * The Morale effects that count for this foe's roll (GAPS 239): its own
 * (with enough standing allies within the radius), and other standing
 * foes' "allies" effects that reach it. Distances are measured between
 * tokens on the scene being viewed; with no token, only its own effects
 * without an ally count count.
 * @returns {Array<{op: string, value: number, source: string}>}
 */
function moraleChanges(foe) {
  const own = sceneToken(foe);
  const others = own
    ? canvas.tokens.placeables.filter(token => token !== own && token.actor?.type === "foe"
      && token.actor.system.hp.value > 0 && !token.actor.statuses?.has(CONFIG.specialStatusEffects.DEFEATED))
    : [];
  const found = [];
  for (const effect of collectEffects(foe.items).filter(isMoraleEffect)) {
    // No distance: allies anywhere on the scene (Closed Ranks, step 52c2).
    const alliesNear = own ? others.filter(token => !(effect.radius > 0) || tokenGap(own, token, effect.radius)).length : 0;
    if (moraleEffectCounts(effect, { own: true, alliesNear })) found.push({ op: effect.op, value: effect.value, source: effect.item });
  }
  for (const token of others) {
    for (const effect of collectEffects(token.actor.items).filter(isMoraleEffect)) {
      if (moraleEffectCounts(effect, { own: false, inRange: tokenGap(own, token, effect.radius) })) {
        found.push({ op: effect.op, value: effect.value, source: game.i18n.format("VARBORG.Effects.FromActor", { item: effect.item, name: token.actor.name }) });
      }
    }
  }
  return found;
}

/**
 * The hit foe's group: every foe in the running combat, each listed once.
 * A foe not in combat is a group of one. Eliminated means defeated in the
 * Combat Tracker or at 0 HP. Mooks are left out later, by moraleTriggers.
 * @returns {Array<{id: string, actor: Actor, hp: number, max: number,
 *   eliminated: boolean, morale: number|null, mook: boolean}>}
 */
function foeGroup(foe) {
  const facts = (actor, defeated) => ({
    id: actor.uuid,
    actor,
    hp: actor.system.hp.value,
    max: actor.system.hp.max,
    eliminated: defeated || actor.system.hp.value === 0,
    morale: actor.system.morale,
    mook: actor.system.mook
  });
  const combatants = game.combat?.combatants.filter(c => c.actor?.type === "foe") ?? [];
  if (!combatants.some(c => c.actor.uuid === foe.uuid)) return [facts(foe, false)];
  const group = new Map();
  for (const combatant of combatants) {
    const actor = combatant.actor;
    if (!group.has(actor.uuid)) group.set(actor.uuid, facts(actor, combatant.defeated));
  }
  return [...group.values()];
}

/**
 * At 0 HP: mark the foe defeated in the running combat, with the usual
 * defeated icon on its token (GAPS 71).
 */
export async function markDefeated(foe) {
  const combatants = game.combat?.combatants.filter(c => c.actor?.uuid === foe.uuid && !c.defeated) ?? [];
  for (const combatant of combatants) await combatant.update({ defeated: true });
  const defeatedId = CONFIG.specialStatusEffects.DEFEATED;
  if (CONFIG.statusEffects.some(effect => effect.id === defeatedId)) {
    await foe.toggleStatusEffect(defeatedId, { active: true, overlay: true });
  }
}

/**
 * Buttons on chat cards: Inflict damage on an attack card, Morale on a foe
 * damage card. Hooked to renderChatMessageHTML.
 */
export function addMoraleCardListeners(message, html) {
  // An area card has one Inflict button per foe, each used once (GAPS 141).
  for (const inflict of html.querySelectorAll("button[data-action='inflictDamage']")) {
    const key = inflict.dataset.key ?? "";
    const done = key ? (message.getFlag(SYSTEM, "inflictedKeys") ?? []).includes(key) : message.getFlag(SYSTEM, "damageInflicted");
    if (done) inflict.disabled = true;
    else inflict.addEventListener("click", async () => {
      // The foe targeted when the attack was rolled, or else the one targeted now.
      const stored = inflict.dataset.foeUuid ? await fromUuid(inflict.dataset.foeUuid) : null;
      const foe = stored ?? [...game.user.targets].map(token => token.actor).find(actor => actor?.type === "foe");
      if (!foe) {
        ui.notifications.warn(game.i18n.localize("VARBORG.FoeDamage.NoFoe"));
        return;
      }
      if (!foe.isOwner) {
        ui.notifications.warn(game.i18n.localize("VARBORG.Attack.GMOnly"));
        return;
      }
      inflict.disabled = true;
      // The armour as it was before a Triumph lowered it (GAPS 69).
      const armour = stored ? inflict.dataset.armour : foe.system.armour;
      if (key) await message.setFlag(SYSTEM, "inflictedKeys", [...(message.getFlag(SYSTEM, "inflictedKeys") ?? []), key]);
      else await message.setFlag(SYSTEM, "damageInflicted", true);
      const tags = inflict.dataset.weaponTags ? inflict.dataset.weaponTags.split(",") : null;
      const killed = await inflictDamage(foe, Number(inflict.dataset.damage), armour, inflict.dataset.attack, inflict.dataset.damageType ?? "", tags);
      // A kill counts for the card's character (Bloodlust, GAPS 205).
      const attackerUuid = message.getFlag(SYSTEM, "fortune")?.actorUuid;
      const attacker = attackerUuid ? await fromUuid(attackerUuid) : null;
      if (killed && attacker) await countKill(attacker);
      // A melee hit: the foe's retaliation passives (Adhesive Hide, GAPS 240).
      if (inflict.dataset.melee === "true") await runItemHooks(foe, "hitMelee", { attacker });
    });
  }

  for (const button of html.querySelectorAll("button[data-action='rollMorale']")) {
    button.addEventListener("click", async () => {
      const foe = await fromUuid(button.dataset.foeUuid);
      if (!foe?.isOwner) {
        ui.notifications.warn(game.i18n.localize("VARBORG.Attack.GMOnly"));
        return;
      }
      await rollMorale(foe);
    });
  }
}
