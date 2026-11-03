/**
 * Attacks in Foundry (rules 3.4 Attack, 4.1 Weapon Traits, GAPS 12 and 18).
 *
 * Opens a dialog (way of attacking, ability, one-handed, beyond range, DR,
 * Boon, Bane), rolls the test and, on a hit, the damage, and posts one
 * chat card. Allies cannot aid an attack (GAPS 62). All the maths lives in
 * module/rules/attack.mjs and module/rules/test-roll.mjs; this file only
 * asks, rolls and shows.
 *
 * In combat, an attack on your own turn uses an action pip and is counted
 * for the multiple-attack Bane. On someone else's turn it uses your
 * reaction pip and is not counted (GAPS 18).
 * The target is the token you have targeted. On a Triumph against a foe,
 * its armour die steps down one: straight away if you may change the foe,
 * otherwise the card gets a button for the Dark Master.
 */

import { DR_TABLE, diceMode, diceFormula, resolveTest } from "../rules/test-roll.mjs";
import { modifiedDr } from "../rules/test-modifiers.mjs";
import { isDamageFormula } from "../rules/equipment.mjs";
import { needsReload, canFire } from "../rules/expendable.mjs";
import {
  ATTACK_DR, attackModes, attackAbilities, weaponDr, attackDistance, attackBanes,
  countsAsTurnAttack, damageFormula, attackOutcome, attackDamage, stepDownArmourDie
} from "../rules/attack.mjs";
import { actorTestModifiers, signed, modeLabel, naturalNote } from "./ability-test.mjs";
import { turnState } from "../combat.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/attack-dialog.hbs";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/attack-card.hbs";

/**
 * Ask for the attack's options, roll it and post the chat card.
 * @param {Actor} actor  The character attacking.
 * @param {Item} item    The weapon.
 */
export async function rollAttack(actor, item) {
  const i18n = game.i18n;
  const weapon = item.system;
  if (needsReload(weapon) && !canFire(weapon)) {
    ui.notifications.warn(i18n.format("VARBORG.Attack.Empty", { name: item.name }));
    return;
  }

  const turn = turnState(actor);
  const attacksBefore = turn.onOwnTurn ? turn.combatant.attacksThisTurn : 0;
  const target = [...game.user.targets][0]?.actor ?? null;

  const options = await askAttackOptions(item, { turn, attacksBefore, target });
  if (!options) return;
  const { mode, ability } = options;

  // Everything that changes the test.
  const automatic = actorTestModifiers(actor, ability);
  const banes = attackBanes({ weapon, mode, attacksBefore, onOwnTurn: turn.onOwnTurn, beyondRange: options.beyondRange });
  const boonCount = options.boon ? 1 : 0;
  const baneCount = [options.bane, automatic.encumberedBane, banes.multiple, banes.range].filter(Boolean).length;
  const diceRule = diceMode(boonCount, baneCount);
  const abilityScore = actor.system.abilities[ability];
  const extraDr = weaponDr(weapon, options.oneHanded);
  const dr = modifiedDr(options.dr, extraDr + automatic.armourDr);

  const roll = new Roll(`${diceFormula(diceRule)} + @ability`, { ability: abilityScore });
  await roll.evaluate();
  const dice = roll.dice[0].results.map(r => r.result);
  const result = resolveTest({ dice, mode: diceRule, ability: abilityScore, dr });
  const outcome = attackOutcome(result.tier);

  // Damage, on a hit.
  const rolls = [roll];
  let damage = null;
  if (outcome.hit) {
    const formula = damageFormula(weapon.damage, options.beyondRange);
    if (isDamageFormula(formula)) {
      const damageRoll = new Roll(formula);
      await damageRoll.evaluate();
      rolls.push(damageRoll);
      damage = {
        formula,
        rolled: damageRoll.total,
        total: attackDamage(damageRoll.total, result.tier),
        doubled: outcome.multiplier === 2
      };
    } else {
      damage = { invalid: true, formula: weapon.damage };
    }
  }

  // Firing empties a weapon with Reload (GAPS 53).
  if (mode === "shoot" && needsReload(weapon)) await item.update({ "system.loaded": false });

  // Action and reaction pips, and the count for the multiple-attack Bane.
  let pipNote = null;
  if (turn.combatant) {
    const kind = turn.onOwnTurn ? "actions" : "reactions";
    const left = kind === "actions" ? turn.combatant.actionsLeft : turn.combatant.reactionsLeft;
    if (left < 1) ui.notifications.warn(i18n.localize(turn.onOwnTurn ? "VARBORG.Attack.NoActions" : "VARBORG.Attack.NoReaction"));
    await turn.combatant.adjustPips(kind, -1);
    if (countsAsTurnAttack(turn.onOwnTurn)) await turn.combatant.recordAttack();
    pipNote = i18n.localize(turn.onOwnTurn ? "VARBORG.Attack.UsedAction" : "VARBORG.Attack.UsedReaction");
  }

  // A Triumph lowers the target foe's armour die by one (GAPS 12).
  let armour = null;
  if (outcome.lowerArmour && target?.type === "foe") {
    const from = target.system.armour;
    if (!from) armour = { text: i18n.format("VARBORG.Attack.NoArmourToLower", { name: target.name }) };
    else {
      const to = stepDownArmourDie(from);
      const change = { name: target.name, from: armourLabel(from), to: armourLabel(to) };
      if (target.isOwner) {
        await target.update({ "system.armour": to });
        armour = { text: i18n.format("VARBORG.Attack.ArmourLowered", change) };
      } else {
        armour = { button: i18n.format("VARBORG.Attack.LowerArmourButton", change), uuid: target.uuid };
      }
    }
  }

  const abilityLabel = i18n.localize(`VARBORG.Ability.${ability}`);
  const title = i18n.format("VARBORG.Attack.CardTitle", { name: item.name });
  const notes = [
    extraDr ? drNote(weapon, options.oneHanded) : null,
    automatic.armourDr ? i18n.format("VARBORG.Attack.ArmourNote", { armour: signed(automatic.armourDr), name: automatic.armourName }) : null,
    automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
    banes.multiple ? i18n.format("VARBORG.Attack.MultipleBane", { count: attacksBefore + 1 }) : null,
    banes.range ? i18n.format("VARBORG.Attack.RangeBane", { feet: attackDistance(weapon, mode) }) : null
  ].filter(Boolean);

  const content = await renderTemplate(CARD_TEMPLATE, {
    title,
    how: i18n.format("VARBORG.Attack.How", { mode: i18n.localize(`VARBORG.Weapon.Kind.${mode}`), ability: abilityLabel }),
    target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : null,
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
    outcomeText: i18n.localize(`VARBORG.Attack.Outcome.${result.tier}`),
    naturalNote: naturalNote(result),
    damage,
    armour,
    thrownNote: mode === "throw" ? i18n.localize("VARBORG.Attack.Retrieve") : null,
    pipNote
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
 * The attack dialog. Returns the chosen options, or null if it was closed.
 * @returns {Promise<{mode: string, ability: string, oneHanded: boolean, beyondRange: boolean,
 *   dr: number, boon: boolean, bane: boolean}|null>}
 */
async function askAttackOptions(item, { turn, attacksBefore, target }) {
  const i18n = game.i18n;
  const weapon = item.system;
  const modes = attackModes(weapon);
  // Finesse gives the same choice whichever way you attack.
  const abilities = attackAbilities(weapon, modes[0]);
  const distances = modes
    .map(mode => ({ mode, feet: attackDistance(weapon, mode) }))
    .filter(d => d.feet > 0)
    .map(d => i18n.format("VARBORG.Attack.DistanceOf", { mode: i18n.localize(`VARBORG.Weapon.Kind.${d.mode}`), feet: d.feet }));

  // Would the next attack have the multiple-attack Bane? Shown up front.
  const multiple = attackBanes({ weapon, mode: modes[0], attacksBefore, onOwnTurn: turn.onOwnTurn }).multiple;
  let turnNote = null;
  if (turn.combatant) {
    turnNote = turn.onOwnTurn
      ? i18n.format("VARBORG.Attack.TurnNote", { count: attacksBefore })
      : i18n.localize("VARBORG.Attack.ReactionNote");
  }

  const content = await renderTemplate(DIALOG_TEMPLATE, {
    modes: modes.length > 1 ? modes.map(mode => ({ value: mode, label: `VARBORG.Weapon.Kind.${mode}` })) : null,
    abilities: abilities.length > 1 ? abilities.map(a => ({ value: a, label: `VARBORG.Ability.${a}` })) : null,
    // With two ways of attacking, "as usual" picks the ability that way normally uses.
    usualAbility: modes.length > 1 ? i18n.format("VARBORG.Attack.UsualAbility", {
      list: modes.map(mode => `${i18n.localize(`VARBORG.Weapon.Kind.${mode}`)} ${i18n.localize(`VARBORG.Ability.${attackAbilities(weapon, mode)[0]}`)}`).join(", ")
    }) : null,
    versatile: weapon.versatile,
    distance: distances.length ? distances.join(", ") : null,
    drs: DR_TABLE.map(dr => ({
      value: dr,
      label: i18n.format("VARBORG.Test.DROption", { dr, name: i18n.localize(`VARBORG.DR.${dr}`) }),
      selected: dr === ATTACK_DR
    })),
    heavyNote: weapon.heavy ? i18n.localize("VARBORG.Attack.HeavyNote") : null,
    multipleNote: multiple ? i18n.localize(weapon.agile ? "VARBORG.Attack.MultipleNoteAgile" : "VARBORG.Attack.MultipleNote") : null,
    turnNote,
    target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : i18n.localize("VARBORG.Attack.NoTarget")
  });

  const data = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Attack.DialogTitle", { name: item.name }) },
    content,
    ok: { label: "VARBORG.Attack.Roll", icon: "fa-solid fa-khanda" },
    rejectClose: false
  });
  if (!data) return null;

  const mode = modes.includes(data.mode) ? data.mode : modes[0];
  // Without Finesse (or left "as usual") the way of attacking decides the ability.
  const choices = attackAbilities(weapon, mode);
  const ability = choices.includes(data.ability) ? data.ability : choices[0];
  return {
    mode,
    ability,
    oneHanded: Boolean(weapon.versatile && data.oneHanded),
    beyondRange: Boolean(data.beyondRange),
    dr: Number(data.dr),
    boon: Boolean(data.boon),
    bane: Boolean(data.bane)
  };
}

/**
 * The chat card's "Lower armour" button, for the Dark Master when the
 * attacker could not change the foe. Hooked to renderChatMessageHTML.
 */
export function addAttackCardListeners(message, html) {
  const button = html.querySelector("button[data-action='lowerArmour']");
  if (!button) return;
  if (message.getFlag(SYSTEM, "armourLowered")) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", async () => {
    const foe = await fromUuid(button.dataset.uuid);
    if (!foe?.isOwner) {
      ui.notifications.warn(game.i18n.localize("VARBORG.Attack.GMOnly"));
      return;
    }
    button.disabled = true;
    await foe.update({ "system.armour": stepDownArmourDie(foe.system.armour) });
    await message.setFlag(SYSTEM, "armourLowered", true);
  });
}

/** "d2", or "none" for no armour. */
function armourLabel(die) {
  return game.i18n.localize(`VARBORG.Foe.Armour.${die || "none"}`);
}

/** "+2 DR: Heavy" or "+2 DR: Versatile, one-handed", or both. */
function drNote(weapon, oneHanded) {
  const i18n = game.i18n;
  const parts = [];
  if (weapon.heavy) parts.push(i18n.localize("VARBORG.Attack.HeavyDR"));
  if (weapon.versatile && oneHanded) parts.push(i18n.localize("VARBORG.Attack.OneHandedDR"));
  return parts.join(" · ");
}
