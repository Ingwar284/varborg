/**
 * Defence and taking damage in Foundry (rules 3.4 Defence, 3.8 Armour and
 * cover, GAPS 46 and 64-68).
 *
 * Foes do not roll. A foe's Attack button posts a card with a Defend button
 * for each targeted character (or one for your own character when nothing
 * is targeted). Defend opens a dialog (DR, Boon, Bane), rolls Agility and
 * posts a card. On a hit it rolls the foe's damage and the armour's soak
 * die, and adds a Take damage button that lowers HP.
 *
 * Armour: tier 3 and 4 add +2 DR to defend (by original tier), the soak die
 * follows the current tier, and a Ruin drops the armour one tier.
 * Shields: Raise shield (one action in combat) gives light or heavy cover
 * until the start of your next turn. An attack that only the cover stopped
 * strikes the shield: heavy becomes light, light is destroyed.
 * Minions defend the same way, at +0 (GAPS 169): their armour die soaks,
 * and a Ruin steps it down one, like a foe's.
 * Conditions (rules 3.13): the defender's own (Prone, Restrained, Fatigued,
 * Dark Vessel) and the attacking foe's Foe lines (Prone, Blinded,
 * Restrained, Encumbered, Fatigued) are added for you.
 * Fortune (rule 3.9): the dialog can buy a Boon or Bane, and the card has
 * Fortune buttons (module/fortune.mjs). settleDefenceCard works the card
 * out again after each use.
 * All the maths lives in module/rules/defence.mjs and
 * module/rules/conditions.mjs; this file only asks, rolls and shows.
 */

import { DR_TABLE, diceMode, diceFormula, resolveTest } from "../rules/test-roll.mjs";
import { modifiedDr, wornArmour, isEncumbered } from "../rules/test-modifiers.mjs";
import { carrying } from "../rules/carrying.mjs";
import { isDamageFormula } from "../rules/equipment.mjs";
import { damageFormula, stepDownArmourDie } from "../rules/attack.mjs";
import { hpAfterDamage } from "../rules/health.mjs";
import { killedByDamage } from "../deaths-door.mjs";
import {
  DEFENCE_DR, DEFENCE_ABILITY, armourDefenceDr, soakDie, strongestShield, shieldCover,
  defenceOutcome, damageTaken, lowerArmourTier, coverStruck, damagedShield, raiseShieldCost
} from "../rules/defence.mjs";
import { signed, modeLabel, naturalNote, diceOf, fortuneTier } from "./ability-test.mjs";
import { CARD, lowerDamage } from "../rules/fortune.mjs";
import { newFortuneData, fortuneFlags, fortuneSection, fortuneFields, payDialogFortune } from "../fortune.mjs";
import { turnState } from "../combat.mjs";
import { defenderConditions, attackingFoeConditions, totalModifiers, carryingWithConditions } from "../rules/conditions.mjs";
import { conditionsOf, conditionNotes, reminderNotes } from "../conditions.mjs";
import { useUpNextTest } from "../panic.mjs";
import { AGONY_TYPE_OPTION } from "../agony.mjs";
import { addTimedCondition } from "../timers.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const FOE_CARD_TEMPLATE = "systems/var-borg/templates/chat/foe-attack-card.hbs";
const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/defence-dialog.hbs";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/defence-card.hbs";

/** Who defends against a foe's attack: characters and their minions (GAPS 169). */
export const DEFENDERS = ["character", "minion"];

/**
 * The foe sheet's Attack button: post a card with a Defend button for each
 * targeted character. In combat it uses the foe's action on its own turn,
 * otherwise its reaction.
 * @param {Actor} foe   The attacking foe.
 * @param {Item} item   The foe's attack (a weapon item).
 */
export async function foeAttack(foe, item) {
  const i18n = game.i18n;
  const targets = [...game.user.targets]
    .map(token => token.actor)
    .filter(actor => DEFENDERS.includes(actor?.type));

  let pipNote = null;
  const turn = turnState(foe);
  if (turn.combatant) {
    const kind = turn.onOwnTurn ? "actions" : "reactions";
    await turn.combatant.adjustPips(kind, -1);
    pipNote = i18n.localize(turn.onOwnTurn ? "VARBORG.Attack.UsedAction" : "VARBORG.Attack.UsedReaction");
  }

  const kind = i18n.localize(item.system.kind === "melee" ? "VARBORG.Foe.Melee" : "VARBORG.Foe.Ranged");
  const content = await renderTemplate(FOE_CARD_TEMPLATE, {
    title: i18n.format("VARBORG.Defence.FoeAttackTitle", { name: foe.name, attack: item.name }),
    how: [kind, item.system.damage].filter(Boolean).join(" · "),
    attackUuid: item.uuid,
    targets: targets.map(actor => ({
      uuid: actor.uuid,
      label: i18n.format("VARBORG.Defence.DefendAs", { name: actor.name })
    })),
    hint: i18n.localize(targets.length ? "VARBORG.Defence.DefendHint" : "VARBORG.Defence.NoTargetHint"),
    pipNote
  });

  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: foe }), content });
}

/**
 * Defend against an attack: dialog, Agility test, damage and soak, and the
 * card with a Take damage button.
 * @param {Actor} actor    The character defending.
 * @param {Item} attack    The foe's attack (a weapon item).
 */
export async function rollDefence(actor, attack) {
  const i18n = game.i18n;
  const foe = attack.parent;
  const automatic = defenceModifiers(actor);
  const conditions = defenceConditions(actor, attack);
  const options = await askDefenceOptions(actor, attack, automatic, conditions);
  if (!options) return;

  // Fortune can buy a Boon or Bane before rolling (rule 3.9).
  const paid = await payDialogFortune(actor, options.data);
  if (!paid) return;

  const fromConditions = totalModifiers([...conditions.own, ...conditions.foe]);
  const boonCount = (options.boon ? 1 : 0) + (paid.boon ? 1 : 0) + fromConditions.boons;
  const baneCount = [options.bane, paid.bane, automatic.encumberedBane].filter(Boolean).length + fromConditions.banes;
  const diceRule = diceMode(boonCount, baneCount);
  const abilityScore = actor.system.abilities[DEFENCE_ABILITY];
  const uncoveredDr = modifiedDr(options.dr, automatic.armourDr + fromConditions.dr);
  const dr = modifiedDr(options.dr, automatic.armourDr + fromConditions.dr - automatic.cover);

  const roll = await new Roll(`${diceFormula(diceRule)} + @ability`, { ability: abilityScore }).evaluate();
  // Adrenaline Rush and Rattled count for this defence, then end (GAPS 80).
  await useUpNextTest(actor);

  const abilityLabel = i18n.localize(`VARBORG.Ability.${DEFENCE_ABILITY}`);
  const title = i18n.format("VARBORG.Defence.CardTitle", { name: attack.name });
  const notes = [
    automatic.armourDr ? i18n.format("VARBORG.Defence.ArmourNote", { dr: signed(automatic.armourDr), name: automatic.armourName }) : null,
    automatic.cover ? i18n.format("VARBORG.Defence.CoverNote", { dr: signed(-automatic.cover), name: automatic.shieldName }) : null,
    automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
    ...conditionNotes(conditions.own),
    ...conditionNotes(conditions.foe, foe?.name),
    paid.note
  ].filter(Boolean);

  // Everything the card needs that Fortune cannot change.
  const formula = damageFormula(attack.system.damage);
  const inputs = {
    formula: `${diceFormula(diceRule)} + @ability`,
    rollData: { ability: abilityScore },
    diceRule, abilityScore, dr, uncoveredDr,
    damageFormula: isDamageFormula(formula) ? formula : null,
    attackDamage: attack.system.damage,
    // The armour and shield as they were before this attack.
    armour: automatic.armour ? { id: automatic.armour.id, tier: automatic.armour.tier, originalTier: automatic.armour.originalTier } : null,
    soakDie: automatic.soakDie,
    // A minion's armour die, which a Ruin steps down (GAPS 169).
    minionArmour: actor.type === "minion" ? actor.system.armour : null,
    shield: automatic.cover ? { id: automatic.shield.id, size: automatic.shield.size } : null,
    cover: automatic.cover,
    context: {
      title,
      against: foe ? i18n.format("VARBORG.Defence.Against", { name: foe.name, attack: attack.name }) : null,
      modeLabel: modeLabel(diceRule, boonCount, baneCount),
      ability: signed(abilityScore),
      abilityLabel,
      drNote: dr !== options.dr ? i18n.format("VARBORG.Attack.DRFrom", { dr: options.dr }) : null,
      notes,
      actorUuid: actor.uuid,
      // The weapon's damage type, suggested for the Table of Agony (GAPS 15).
      agonyType: attack.system.damageType ?? ""
    }
  };

  const data = newFortuneData(CARD.DEFENCE, actor, inputs, { dice: diceOf(roll), damage: null, soak: null, lowered: [] });
  const { content, rolls } = await settleDefenceCard(actor, data);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content,
    rolls: [roll, ...rolls],
    sound: CONFIG.sounds.dice,
    flags: fortuneFlags(data)
  });
}

/**
 * Work the defence card out from its stored inputs, dice and damage: roll
 * what is missing (new dice after a Fortune reroll, damage and soak on a
 * new hit), then make the armour and shield match the result, taking back
 * what an earlier result did (GAPS 103). Fortune's −d6 comes off last and
 * can reach 0 (GAPS 109). Used for the first card and after each Fortune
 * use; registered with module/fortune.mjs.
 * @param {Actor} actor  The defender.
 * @param {object} data  The card's Fortune data (changed in place).
 * @returns {Promise<{content: string, rolls: Roll[]}>} The new rolls.
 */
export async function settleDefenceCard(actor, data) {
  const i18n = game.i18n;
  const { inputs, state, applied } = data;
  const rolls = [];
  if (!state.dice) {
    const roll = await new Roll(inputs.formula, inputs.rollData).evaluate();
    rolls.push(roll);
    state.dice = diceOf(roll);
  }
  const result = resolveTest({ dice: state.dice.map(die => die.value), mode: inputs.diceRule, ability: inputs.abilityScore, dr: inputs.dr });
  const tier = fortuneTier(result.tier, state.softened);
  state.tier = tier;
  const outcome = defenceOutcome(tier);

  // Hit: the foe's damage and the armour's soak die (GAPS 64). A damage
  // reroll keeps the soak roll.
  let damage = null;
  if (outcome.hit && !inputs.damageFormula) damage = { invalid: true, formula: inputs.attackDamage };
  else if (outcome.hit) {
    if (state.damage === null) {
      const damageRoll = await new Roll(inputs.damageFormula).evaluate();
      rolls.push(damageRoll);
      state.damage = damageRoll.total;
    }
    if (state.soak === null) {
      state.soak = 0;
      if (inputs.soakDie) {
        const soakRoll = await new Roll(inputs.soakDie).evaluate();
        rolls.push(soakRoll);
        state.soak = soakRoll.total;
      }
    }
    const { before, taken } = damageTaken(state.damage, tier, state.soak);
    const lowered = taken - lowerDamage(taken, state.lowered);
    damage = {
      formula: inputs.damageFormula,
      rolled: state.damage,
      doubled: outcome.multiplier === 2,
      before,
      soakDie: inputs.soakDie,
      soak: state.soak,
      lowered,
      taken: taken - lowered,
      minimum: taken > before - state.soak
    };
  }

  // Ruin: the armour drops one tier, and below tier 1 it is destroyed.
  // If an earlier Ruin dropped it and this result is not one, it goes back.
  let armourNote = null;
  const armourItem = inputs.armour ? actor.items.get(inputs.armour.id) : null;
  if (armourItem && outcome.lowerArmour) {
    const lowered = lowerArmourTier(inputs.armour);
    if (!applied.armourLowered) await armourItem.update({ "system.tier": lowered.tier });
    applied.armourLowered = true;
    armourNote = i18n.format(lowered.destroyed ? "VARBORG.Defence.ArmourDestroyed" : "VARBORG.Defence.ArmourLowered", {
      name: armourItem.name, from: inputs.armour.tier, to: lowered.tier
    });
  } else if (armourItem && applied.armourLowered) {
    await armourItem.update({ "system.tier": inputs.armour.tier });
    applied.armourLowered = false;
    armourNote = i18n.format("VARBORG.Fortune.ArmourTierBack", { name: armourItem.name, tier: inputs.armour.tier });
  }
  // A minion's armour die steps down one on a Ruin, and back if Fortune undoes it.
  if (inputs.minionArmour && outcome.lowerArmour) {
    const to = stepDownArmourDie(inputs.minionArmour);
    if (!applied.armourLowered) await actor.update({ "system.armour": to });
    applied.armourLowered = true;
    armourNote = i18n.format("VARBORG.Minion.ArmourLowered", {
      name: actor.name, from: dieLabel(inputs.minionArmour), to: dieLabel(to)
    });
  } else if (inputs.minionArmour && applied.armourLowered) {
    await actor.update({ "system.armour": inputs.minionArmour });
    applied.armourLowered = false;
    armourNote = i18n.format("VARBORG.Fortune.ArmourBack", { name: actor.name, die: dieLabel(inputs.minionArmour) });
  }

  // The cover alone stopped the attack: it strikes the shield (GAPS 66).
  // If an earlier result struck it and this one does not, it is mended.
  let shieldNote = null;
  const shieldItem = inputs.shield ? actor.items.get(inputs.shield.id) : null;
  const struck = Boolean(shieldItem) && coverStruck({ tier, total: result.total, dr: inputs.dr, uncoveredDr: inputs.uncoveredDr });
  if (struck) {
    const damaged = damagedShield(inputs.shield.size);
    if (!applied.shieldStruck) {
      await shieldItem.update({ "system.size": damaged.size, "system.destroyed": damaged.destroyed });
      if (damaged.destroyed) await actor.update({ "system.shieldRaised": false });
    }
    applied.shieldStruck = true;
    shieldNote = i18n.format(damaged.destroyed ? "VARBORG.Defence.ShieldDestroyed" : "VARBORG.Defence.ShieldDamaged", { name: shieldItem.name });
  } else if (shieldItem && applied.shieldStruck) {
    await shieldItem.update({ "system.size": inputs.shield.size, "system.destroyed": false });
    await actor.update({ "system.shieldRaised": true });
    applied.shieldStruck = false;
    shieldNote = i18n.format("VARBORG.Fortune.ShieldBack", { name: shieldItem.name });
  }

  const content = await renderTemplate(CARD_TEMPLATE, {
    ...inputs.context,
    dice: state.dice,
    kept: result.kept,
    total: result.total,
    dr: inputs.dr,
    tier,
    tierLabel: i18n.localize(`VARBORG.Tier.${tier}`),
    outcomeText: i18n.localize(`VARBORG.Defence.Outcome.${tier}`),
    naturalNote: naturalNote(result),
    damage,
    armourNote,
    shieldNote,
    takeLabel: damage && !damage.invalid ? i18n.format("VARBORG.Defence.TakeDamage", { damage: damage.taken }) : null,
    takeDamage: damage && !damage.invalid ? damage.taken : 0,
    takeCondition: "",
    fortune: await fortuneSection(data, { tier, damage: Boolean(damage && !damage.invalid), taken: damage?.taken ?? 0 })
  });
  return { content, rolls };
}

/**
 * What the character's gear does to a defence: the worn armour (+2 DR for
 * tier 3 and 4, and its soak die), a raised shield (cover) and Encumbered
 * (Bane).
 */
export function defenceModifiers(actor) {
  if (actor.type === "minion") return minionDefenceModifiers(actor);
  const items = actor.items.map(item => ({ id: item.id, type: item.type, ...item.system }));
  const armour = wornArmour(items);
  const shield = strongestShield(items);
  const { state } = carrying(items, actor.system.abilities.toughness);
  const carryingState = carryingWithConditions(actor.statuses, state);
  const nameOf = data => (data ? actor.items.get(data.id)?.name ?? null : null);
  return {
    armour,
    armourName: nameOf(armour),
    armourDr: armourDefenceDr(armour),
    soakDie: soakDie(armour),
    shield,
    shieldName: nameOf(shield),
    cover: shieldCover(shield, actor.system.shieldRaised),
    encumberedBane: isEncumbered(carryingState)
  };
}

/**
 * A minion's defence: no armour items, no shield and no load; its armour
 * die soaks (GAPS 169).
 */
function minionDefenceModifiers(actor) {
  return {
    armour: null,
    // "Its armour" when the armour has no name.
    armourName: actor.system.armourName || game.i18n.localize("VARBORG.Minion.ItsArmour"),
    armourDr: 0,
    soakDie: actor.system.armour || "",
    shield: null,
    shieldName: null,
    cover: 0,
    encumberedBane: false
  };
}

/** "−d2", or "None". */
function dieLabel(die) {
  return game.i18n.localize(`VARBORG.Foe.Armour.${die || "none"}`);
}

/**
 * The conditions on this defence: the defender's own, and the attacking
 * foe's Foe lines (rules 3.13). Melee or ranged follows the foe's attack.
 * @returns {{own: object[], foe: object[]}}
 */
function defenceConditions(actor, attack) {
  const foe = attack.parent;
  const kind = attack.system.kind;
  const own = conditionsOf(actor);
  const theirs = foe?.type === "foe" ? conditionsOf(foe) : null;
  return {
    own: defenderConditions(own.conditions, own.fatigue, kind),
    foe: theirs ? attackingFoeConditions(theirs.conditions, theirs.fatigue, kind) : []
  };
}

/**
 * The defence dialog. Returns the chosen options, or null if it was closed.
 * @returns {Promise<{dr: number, boon: boolean, bane: boolean, data: object}|null>}  data is the whole form.
 */
async function askDefenceOptions(actor, attack, automatic, conditions) {
  const i18n = game.i18n;
  const foe = attack.parent;
  const soak = automatic.soakDie;
  const content = await renderTemplate(DIALOG_TEMPLATE, {
    against: i18n.format("VARBORG.Defence.Against", { name: foe?.name ?? "", attack: attack.name }),
    damage: attack.system.damage,
    drs: DR_TABLE.map(dr => ({
      value: dr,
      label: i18n.format("VARBORG.Test.DROption", { dr, name: i18n.localize(`VARBORG.DR.${dr}`) }),
      selected: dr === DEFENCE_DR
    })),
    notes: [
      automatic.armourDr ? i18n.format("VARBORG.Defence.ArmourNote", { dr: signed(automatic.armourDr), name: automatic.armourName }) : null,
      automatic.cover ? i18n.format("VARBORG.Defence.CoverNote", { dr: signed(-automatic.cover), name: automatic.shieldName }) : null,
      soak ? i18n.format("VARBORG.Defence.SoakNote", { die: soak, name: automatic.armourName }) : null,
      automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
      ...conditionNotes(conditions.own),
      ...conditionNotes(conditions.foe, foe?.name)
    ].filter(Boolean),
    reminders: [...reminderNotes(actor, "defence"), ...foeReminders(foe)],
    fortuneFields: await fortuneFields(actor, "defence")
  });

  const data = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Defence.DialogTitle", { name: actor.name }) },
    content,
    ok: { label: "VARBORG.Defence.Roll", icon: "fa-solid fa-shield-halved" },
    rejectClose: false
  });
  if (!data) return null;
  return { dr: Number(data.dr), boon: Boolean(data.boon), bane: Boolean(data.bane), data };
}

/**
 * The Raise shield button. In combat it must be your own turn, and it
 * spends one action (rules 3.8, GAPS 68).
 * @param {Actor} actor  The character raising the shield.
 */
export async function raiseShield(actor) {
  const i18n = game.i18n;
  const items = actor.items.map(item => ({ id: item.id, type: item.type, ...item.system }));
  const shield = strongestShield(items);
  if (!shield) {
    ui.notifications.warn(i18n.localize("VARBORG.Defence.NoShield"));
    return;
  }
  const turn = turnState(actor);
  const cost = raiseShieldCost({ inCombat: Boolean(turn.combatant), onOwnTurn: turn.onOwnTurn });
  if (!cost.allowed) {
    ui.notifications.warn(i18n.localize("VARBORG.Defence.RaiseNotYourTurn"));
    return;
  }
  if (cost.actions) {
    if (turn.combatant.actionsLeft < cost.actions) ui.notifications.warn(i18n.localize("VARBORG.Defence.RaiseNoActions"));
    await turn.combatant.adjustPips("actions", -cost.actions);
  }
  await actor.update({ "system.shieldRaised": true });
  const name = actor.items.get(shield.id)?.name;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${i18n.format("VARBORG.Defence.Raised", {
      name: actor.name, shield: name, dr: signed(-shieldCover(shield, true))
    })}</p>`
      + (cost.actions ? `<p class="modifier">${i18n.localize("VARBORG.Attack.UsedAction")}</p>` : "")
      + "</div>"
  });
}

/** The Lower shield button: the cover ends. */
export async function lowerShield(actor) {
  await actor.update({ "system.shieldRaised": false });
}

/**
 * Buttons on chat cards: Defend on a foe's attack card, Take damage on a
 * defence card or a gloom ability's test card (which can also add a
 * condition, such as Toll's Deafened). Hooked to renderChatMessageHTML.
 */
export function addDefenceCardListeners(message, html) {
  for (const button of html.querySelectorAll("button[data-action='defend']")) {
    button.addEventListener("click", async () => {
      const attack = await fromUuid(button.dataset.attackUuid);
      if (!attack) {
        ui.notifications.warn(game.i18n.localize("VARBORG.Defence.AttackGone"));
        return;
      }
      const actor = button.dataset.actorUuid ? await fromUuid(button.dataset.actorUuid) : ownCharacter();
      if (!actor || !DEFENDERS.includes(actor.type)) {
        ui.notifications.warn(game.i18n.localize("VARBORG.Defence.NoCharacter"));
        return;
      }
      if (!actor.isOwner) {
        ui.notifications.warn(game.i18n.format("VARBORG.Defence.NotYours", { name: actor.name }));
        return;
      }
      await rollDefence(actor, attack);
    });
  }

  const take = html.querySelector("button[data-action='takeDamage']");
  if (!take) return;
  if (message.getFlag(SYSTEM, "damageTaken")) {
    take.disabled = true;
    return;
  }
  take.addEventListener("click", async () => {
    const actor = await fromUuid(take.dataset.actorUuid);
    if (!actor?.isOwner) {
      ui.notifications.warn(game.i18n.format("VARBORG.Defence.NotYours", { name: actor?.name ?? "" }));
      return;
    }
    take.disabled = true;
    const damage = Number(take.dataset.damage) || 0;
    const condition = take.dataset.condition || null;
    // A gloom ability's condition, with its timer (module/timers.mjs).
    const timer = take.dataset.timerKind ? { kind: take.dataset.timerKind, rounds: take.dataset.timerRounds } : null;
    const conditionLine = condition ? await addTimedCondition(actor, condition, timer) : null;
    if (!damage) {
      await message.setFlag(SYSTEM, "damageTaken", true);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="var-borg-card"><p>${conditionLine}</p></div>`
      });
      return;
    }
    // At Death's Door any damage kills (module/deaths-door.mjs).
    if (await killedByDamage(actor, damage)) {
      await message.setFlag(SYSTEM, "damageTaken", true);
      return;
    }
    const from = actor.system.hp.value;
    const to = hpAfterDamage(from, damage);
    // At 0 HP the character data adds the wound (module/agony.mjs).
    await actor.update({ "system.hp.value": to }, { [AGONY_TYPE_OPTION]: take.dataset.agonyType || null });
    await message.setFlag(SYSTEM, "damageTaken", true);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="var-borg-card"><p>${game.i18n.format("VARBORG.Defence.Took", { name: actor.name, damage, from, to })}</p>`
        + (conditionLine ? `<p>${conditionLine}</p>` : "")
        + (to === 0 ? `<p class="modifier">${game.i18n.localize("VARBORG.Defence.ZeroHp")}</p>` : "")
        + "</div>"
    });
  });
}

/** Reminders about the attacking foe's conditions, such as Frightened (GAPS 75). */
function foeReminders(foe) {
  if (foe?.type !== "foe") return [];
  return reminderNotes(foe, "foeAttack").map(text => game.i18n.format("VARBORG.Condition.TheirReminder", { name: foe.name, text }));
}

/** With no target named: the user's own character, or the selected token's. */
function ownCharacter() {
  if (game.user.character) return game.user.character;
  return canvas.tokens?.controlled.map(token => token.actor).find(actor => actor?.type === "character") ?? null;
}
