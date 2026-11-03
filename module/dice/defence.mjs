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
 * Conditions (rules 3.13): the defender's own (Prone, Restrained, Fatigued,
 * Dark Vessel) and the attacking foe's Foe lines (Prone, Blinded,
 * Restrained, Encumbered, Fatigued) are added for you.
 * All the maths lives in module/rules/defence.mjs and
 * module/rules/conditions.mjs; this file only asks, rolls and shows.
 */

import { DR_TABLE, diceMode, diceFormula, resolveTest } from "../rules/test-roll.mjs";
import { modifiedDr, wornArmour, isEncumbered } from "../rules/test-modifiers.mjs";
import { carrying } from "../rules/carrying.mjs";
import { isDamageFormula } from "../rules/equipment.mjs";
import { damageFormula } from "../rules/attack.mjs";
import { hpAfterDamage } from "../rules/health.mjs";
import {
  DEFENCE_DR, DEFENCE_ABILITY, armourDefenceDr, soakDie, strongestShield, shieldCover,
  defenceOutcome, damageTaken, lowerArmourTier, coverStruck, damagedShield, raiseShieldCost
} from "../rules/defence.mjs";
import { signed, modeLabel, naturalNote } from "./ability-test.mjs";
import { turnState } from "../combat.mjs";
import { defenderConditions, attackingFoeConditions, totalModifiers, carryingWithConditions } from "../rules/conditions.mjs";
import { conditionsOf, conditionNotes, reminderNotes } from "../conditions.mjs";
import { useUpNextTest } from "../panic.mjs";
import { AGONY_TYPE_OPTION } from "../agony.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const FOE_CARD_TEMPLATE = "systems/var-borg/templates/chat/foe-attack-card.hbs";
const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/defence-dialog.hbs";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/defence-card.hbs";

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
    .filter(actor => actor?.type === "character");

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

  const fromConditions = totalModifiers([...conditions.own, ...conditions.foe]);
  const boonCount = (options.boon ? 1 : 0) + fromConditions.boons;
  const baneCount = [options.bane, automatic.encumberedBane].filter(Boolean).length + fromConditions.banes;
  const diceRule = diceMode(boonCount, baneCount);
  const abilityScore = actor.system.abilities[DEFENCE_ABILITY];
  const uncoveredDr = modifiedDr(options.dr, automatic.armourDr + fromConditions.dr);
  const dr = modifiedDr(options.dr, automatic.armourDr + fromConditions.dr - automatic.cover);

  const roll = new Roll(`${diceFormula(diceRule)} + @ability`, { ability: abilityScore });
  await roll.evaluate();
  const dice = roll.dice[0].results.map(r => r.result);
  const result = resolveTest({ dice, mode: diceRule, ability: abilityScore, dr });
  const outcome = defenceOutcome(result.tier);
  // Adrenaline Rush and Rattled count for this defence, then end (GAPS 80).
  await useUpNextTest(actor);
  const rolls = [roll];

  // Hit: roll the foe's damage and the armour's soak die (GAPS 64).
  let damage = null;
  if (outcome.hit) {
    const formula = damageFormula(attack.system.damage);
    if (isDamageFormula(formula)) {
      const damageRoll = await new Roll(formula).evaluate();
      rolls.push(damageRoll);
      let soak = 0;
      const die = soakDie(automatic.armour);
      if (die) {
        const soakRoll = await new Roll(die).evaluate();
        rolls.push(soakRoll);
        soak = soakRoll.total;
      }
      const { before, taken } = damageTaken(damageRoll.total, result.tier, soak);
      damage = {
        formula,
        rolled: damageRoll.total,
        doubled: outcome.multiplier === 2,
        before,
        soakDie: die,
        soak,
        taken,
        minimum: taken > before - soak
      };
    } else {
      damage = { invalid: true, formula: attack.system.damage };
    }
  }

  // Ruin: the armour drops one tier, and below tier 1 it is destroyed.
  let armourNote = null;
  if (outcome.lowerArmour && automatic.armour) {
    const item = actor.items.get(automatic.armour.id);
    const lowered = lowerArmourTier(automatic.armour);
    await item.update({ "system.tier": lowered.tier });
    armourNote = i18n.format(lowered.destroyed ? "VARBORG.Defence.ArmourDestroyed" : "VARBORG.Defence.ArmourLowered", {
      name: item.name, from: automatic.armour.tier, to: lowered.tier
    });
  }

  // The cover alone stopped the attack: it strikes the shield (GAPS 66).
  let shieldNote = null;
  if (automatic.cover && coverStruck({ tier: result.tier, total: result.total, dr, uncoveredDr })) {
    const item = actor.items.get(automatic.shield.id);
    const damaged = damagedShield(automatic.shield.size);
    await item.update({ "system.size": damaged.size, "system.destroyed": damaged.destroyed });
    if (damaged.destroyed) await actor.update({ "system.shieldRaised": false });
    shieldNote = i18n.format(damaged.destroyed ? "VARBORG.Defence.ShieldDestroyed" : "VARBORG.Defence.ShieldDamaged", { name: item.name });
  }

  const abilityLabel = i18n.localize(`VARBORG.Ability.${DEFENCE_ABILITY}`);
  const title = i18n.format("VARBORG.Defence.CardTitle", { name: attack.name });
  const notes = [
    automatic.armourDr ? i18n.format("VARBORG.Defence.ArmourNote", { dr: signed(automatic.armourDr), name: automatic.armourName }) : null,
    automatic.cover ? i18n.format("VARBORG.Defence.CoverNote", { dr: signed(-automatic.cover), name: automatic.shieldName }) : null,
    automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
    ...conditionNotes(conditions.own),
    ...conditionNotes(conditions.foe, foe?.name)
  ].filter(Boolean);

  const content = await renderTemplate(CARD_TEMPLATE, {
    title,
    against: foe ? i18n.format("VARBORG.Defence.Against", { name: foe.name, attack: attack.name }) : null,
    dice: roll.dice[0].results.map(r => ({ value: r.result, kept: r.active })),
    modeLabel: modeLabel(diceRule, boonCount, baneCount),
    kept: result.kept,
    ability: signed(abilityScore),
    abilityLabel,
    total: result.total,
    dr,
    drNote: dr !== options.dr ? i18n.format("VARBORG.Attack.DRFrom", { dr: options.dr }) : null,
    notes,
    tier: result.tier,
    tierLabel: i18n.localize(`VARBORG.Tier.${result.tier}`),
    outcomeText: i18n.localize(`VARBORG.Defence.Outcome.${result.tier}`),
    naturalNote: naturalNote(result),
    damage,
    armourNote,
    shieldNote,
    actorUuid: actor.uuid,
    // The weapon's damage type, suggested for the Table of Agony (GAPS 15).
    agonyType: attack.system.damageType ?? "",
    takeLabel: damage && !damage.invalid ? i18n.format("VARBORG.Defence.TakeDamage", { damage: damage.taken }) : null
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content,
    rolls,
    sound: CONFIG.sounds.dice
  });
}

/**
 * What the character's gear does to a defence: the worn armour (+2 DR for
 * tier 3 and 4, and its soak die), a raised shield (cover) and Encumbered
 * (Bane).
 */
function defenceModifiers(actor) {
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
    shield,
    shieldName: nameOf(shield),
    cover: shieldCover(shield, actor.system.shieldRaised),
    encumberedBane: isEncumbered(carryingState)
  };
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
 * @returns {Promise<{dr: number, boon: boolean, bane: boolean}|null>}
 */
async function askDefenceOptions(actor, attack, automatic, conditions) {
  const i18n = game.i18n;
  const foe = attack.parent;
  const soak = soakDie(automatic.armour);
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
    reminders: [...reminderNotes(actor, "defence"), ...foeReminders(foe)]
  });

  const data = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Defence.DialogTitle", { name: actor.name }) },
    content,
    ok: { label: "VARBORG.Defence.Roll", icon: "fa-solid fa-shield-halved" },
    rejectClose: false
  });
  if (!data) return null;
  return { dr: Number(data.dr), boon: Boolean(data.boon), bane: Boolean(data.bane) };
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
 * defence card. Hooked to renderChatMessageHTML.
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
      if (!actor || actor.type !== "character") {
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
    const damage = Number(take.dataset.damage);
    const from = actor.system.hp.value;
    const to = hpAfterDamage(from, damage);
    // At 0 HP the character data adds the wound (module/agony.mjs).
    await actor.update({ "system.hp.value": to }, { [AGONY_TYPE_OPTION]: take.dataset.agonyType || null });
    await message.setFlag(SYSTEM, "damageTaken", true);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="var-borg-card"><p>${game.i18n.format("VARBORG.Defence.Took", { name: actor.name, damage, from, to })}</p>`
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
