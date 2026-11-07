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
 * A hit that is not on a character gets an Inflict damage button
 * (module/dice/morale.mjs), which remembers the foe's armour die from
 * before the Triumph (GAPS 69).
 *
 * A Ruin marks the character (system.attackRuin): Bane on every attack until
 * they press Recover on the sheet, which spends one action (GAPS 17, 63).
 *
 * Conditions (rules 3.13): the attacker's own (Prone, Restrained, Fatigued,
 * Dark Vessel) and the target foe's Foe lines (Prone, Blinded, Restrained,
 * Encumbered, Fatigued) are added for you.
 *
 * Fortune (rule 3.9): the dialog can buy a Boon or Bane, and the card has
 * Fortune buttons (module/fortune.mjs). settleAttackCard works the card out
 * again after each use; pips, ammunition and the attack count are not spent
 * twice.
 *
 * Power cards (module/dice/power.mjs) use this card too: settleAttackCard
 * then uses the power's outcomes (rules 3.10: no armour lowered, no attack
 * Ruin, half damage on a Failure) and starts a Sustained power.
 */

import { useUpNextRoll as useUpNextRollBuffs } from "../outcomes.mjs";
import { DR_TABLE, diceMode, diceFormula, resolveTest } from "../rules/test-roll.mjs";
import { modifiedDr } from "../rules/test-modifiers.mjs";
import { isDamageFormula } from "../rules/equipment.mjs";
import { needsReload, canFire } from "../rules/expendable.mjs";
import {
  ATTACK_DR, attackModes, attackAbilities, weaponDr, attackDistance, attackBanes,
  countsAsTurnAttack, damageFormula, attackOutcome, attackDamage, stepDownArmourDie,
  ruinedAfterAttack, recoverCost
} from "../rules/attack.mjs";
import { actorTestModifiers, signed, modeLabel, naturalNote, diceOf, fortuneTier } from "./ability-test.mjs";
import { CARD } from "../rules/fortune.mjs";
import { newFortuneData, fortuneFlags, fortuneSection, fortuneFields, payDialogFortune } from "../fortune.mjs";
import { turnState } from "../combat.mjs";
import { markFired } from "../ammunition.mjs";
import { useUpNextTest } from "../panic.mjs";
import { attackerConditions, attackTargetConditions, totalModifiers } from "../rules/conditions.mjs";
import { conditionsOf, conditionNotes, reminderNotes } from "../conditions.mjs";
import { itemRollMods, itemReminderNotes, itemOptionalMods, optionalEffectsField, tickedMods, effectiveWeapon } from "../effects.mjs";
import { weaponTags, withExtraDamage, triumphDamage } from "../rules/item-effects.mjs";
import { powerDamage } from "../rules/powers.mjs";
import { powerOutcomeText, applySustain, powerCardOutcome } from "./power.mjs";
import { settleOutcomes } from "../outcomes.mjs";

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
export async function rollAttack(actor, item, { spendPips = true } = {}) {
  const i18n = game.i18n;
  // After the owner's feats: Brawler, Long shot (step 50a3).
  const weapon = effectiveWeapon(item);
  if (needsReload(weapon) && !canFire(weapon)) {
    ui.notifications.warn(i18n.format("VARBORG.Attack.Empty", { name: item.name }));
    return;
  }

  const turn = turnState(actor);
  const attacksBefore = turn.onOwnTurn ? turn.combatant.attacksThisTurn : 0;
  const target = [...game.user.targets][0]?.actor ?? null;

  const ruined = actor.system.attackRuin;
  // Item effects for the player to tick when they apply (PLAN step 49d),
  // for the weapon's usual ability.
  const usualMode = attackModes(weapon)[0];
  const optional = itemOptionalMods(actor, {
    roll: "attack", ability: attackAbilities(weapon, usualMode)[0], weapon: weaponTags(weapon, usualMode),
    weaponId: item.id, targetCategory: target?.system?.category ?? "", damageType: weapon.damageType ?? "",
    targetStatuses: [...(target?.statuses ?? [])], targetUuid: target?.uuid ?? ""
  });
  const optionalEffects = await optionalEffectsField(optional);
  const options = await askAttackOptions(actor, item, { turn, attacksBefore, target, ruined, optionalEffects });
  if (!options) return;
  const { mode, ability } = options;

  // Fortune can buy a Boon or Bane before rolling (rule 3.9).
  const paid = await payDialogFortune(actor, options.data);
  if (!paid) return;

  // Everything that changes the test.
  const automatic = actorTestModifiers(actor, ability);
  const banes = attackBanes({ weapon, mode, attacksBefore, onOwnTurn: turn.onOwnTurn, beyondRange: options.beyondRange, ruined });
  const conditions = attackConditions(actor, target, mode, ability, item);
  conditions.own.push(...tickedMods(optional, options.data));
  const fromConditions = totalModifiers([...conditions.own, ...conditions.target]);
  const boonCount = (options.boon ? 1 : 0) + (paid.boon ? 1 : 0) + fromConditions.boons;
  const baneCount = [options.bane, paid.bane, automatic.encumberedBane, banes.multiple, banes.range, banes.ruin].filter(Boolean).length
    + fromConditions.banes;
  const diceRule = diceMode(boonCount, baneCount);
  const abilityScore = actor.system.abilities[ability];
  const extraDr = weaponDr(weapon, options.oneHanded);
  const dr = modifiedDr(options.dr, extraDr + automatic.armourDr + fromConditions.dr);

  const roll = await new Roll(`${diceFormula(diceRule)} + @ability`, { ability: abilityScore }).evaluate();
  // Adrenaline Rush and Rattled count for this attack, then end (GAPS 80).
  await useUpNextTest(actor);
  // "Next roll only" buffs are used up (GAPS 235).
  await useUpNextRollBuffs(actor, ["attack"]);

  // Firing empties a weapon with Reload (GAPS 53). In combat, its
  // ammunition is rolled for when the combat ends (GAPS 39).
  if (mode === "shoot" && needsReload(weapon)) await item.update({ "system.loaded": false });
  if (mode === "shoot") await markFired(actor, item);

  // Action and reaction pips, and the count for the multiple-attack Bane.
  let pipNote = null;
  // A thrall's attack: the thrall's own actions pay, but it counts toward
  // the Gravecaller's multiple-attack Bane (GAPS 213).
  if (turn.combatant && !spendPips) {
    if (countsAsTurnAttack(turn.onOwnTurn)) await turn.combatant.recordAttack();
  } else if (turn.combatant) {
    const kind = turn.onOwnTurn ? "actions" : "reactions";
    const left = kind === "actions" ? turn.combatant.actionsLeft : turn.combatant.reactionsLeft;
    if (left < 1) ui.notifications.warn(i18n.localize(turn.onOwnTurn ? "VARBORG.Attack.NoActions" : "VARBORG.Attack.NoReaction"));
    await turn.combatant.adjustPips(kind, -1);
    if (countsAsTurnAttack(turn.onOwnTurn)) await turn.combatant.recordAttack();
    pipNote = i18n.localize(turn.onOwnTurn ? "VARBORG.Attack.UsedAction" : "VARBORG.Attack.UsedReaction");
  }

  const abilityLabel = i18n.localize(`VARBORG.Ability.${ability}`);
  const title = i18n.format("VARBORG.Attack.CardTitle", { name: item.name });
  const notes = [
    extraDr ? drNote(weapon, options.oneHanded) : null,
    automatic.armourDr ? i18n.format("VARBORG.Attack.ArmourNote", { armour: signed(automatic.armourDr), name: automatic.armourName }) : null,
    automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
    banes.multiple ? i18n.format("VARBORG.Attack.MultipleBane", { count: attacksBefore + 1 }) : null,
    banes.range ? i18n.format("VARBORG.Attack.RangeBane", { feet: attackDistance(weapon, mode) }) : null,
    banes.ruin ? i18n.localize("VARBORG.Attack.RuinBane") : null,
    ...conditionNotes(conditions.own),
    ...conditionNotes(conditions.target, target?.name),
    paid.note
  ].filter(Boolean);

  // Everything the card needs that Fortune cannot change.
  // An item effect can replace the weapon's dice (Couched Lance, step 50c).
  const setDamage = conditions.own.findLast(mod => mod.setDamage)?.setDamage;
  const formula = setDamage || damageFormula(weapon.damage, options.beyondRange);
  const foe = target?.type === "foe" ? target : null;
  const inputs = {
    formula: `${diceFormula(diceRule)} + @ability`,
    rollData: { ability: abilityScore },
    diceRule, abilityScore, dr,
    // Extra damage from item effects (step 49e), such as "d8 + 2".
    damageFormula: isDamageFormula(formula) ? withExtraDamage(formula, conditions.own) : null,
    // Extra damage only on a Triumph, added after doubling (Holy smite, step 51a).
    triumphDamage: triumphDamage(conditions.own),
    weaponDamage: weapon.damage,
    // The weapon's damage type, for the foe's resistances (step 52a).
    damageType: weapon.damageType ?? "",
    // A melee hit, for the foe's retaliation passives (step 52b).
    melee: mode === "melee",
    // The weapon's tags, for the foe's resists by weapon (step 52c).
    weaponTags: weaponTags(weapon, mode),
    ruinedBefore: ruined,
    // Characters defend instead, so only a foe or no target gets Inflict damage.
    inflicts: target?.type !== "character",
    foe: foe ? { uuid: foe.uuid, name: foe.name, armourBefore: foe.system.armour } : null,
    attackName: item.name,
    context: {
      title,
      how: i18n.format("VARBORG.Attack.How", { mode: i18n.localize(`VARBORG.Weapon.Kind.${mode}`), ability: abilityLabel }),
      target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : null,
      modeLabel: modeLabel(diceRule, boonCount, baneCount),
      ability: signed(abilityScore),
      abilityLabel,
      drNote: dr !== options.dr ? i18n.format("VARBORG.Attack.DRFrom", { dr: options.dr }) : null,
      notes,
      thrownNote: mode === "throw" ? i18n.localize("VARBORG.Attack.Retrieve") : null,
      pipNote
    }
  };

  const data = newFortuneData(CARD.ATTACK, actor, inputs, { dice: diceOf(roll), damage: null, maximized: false }, foe?.uuid ?? null);
  const { content, rolls } = await settleAttackCard(actor, data);

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
 * The Gravecaller's Thrall attack (GAPS 213): their thrall's weapon (d4),
 * made with Sanity at DR12, through the usual attack dialog and card. It
 * spends none of the Gravecaller's actions but counts toward their
 * multiple-attack Bane.
 * @param {Actor} actor  The Gravecaller.
 */
export async function rollThrallAttack(actor) {
  const { ownedThralls } = await import("../minions.mjs");
  const thrall = ownedThralls(actor)[0];
  const weapon = thrall?.items.find(item => item.type === "weapon") ?? null;
  const system = weapon ? weapon.toObject().system : { kind: "melee", damage: "d4", damageType: "bleeding" };
  const item = {
    id: weapon?.id ?? "thrallAttack",
    name: `${thrall?.name ?? game.i18n.localize("VARBORG.Thrall.Name")}: ${weapon?.name ?? game.i18n.localize("VARBORG.Thrall.Attack")}`,
    type: "weapon",
    actor,
    _stats: {},
    system: { ...system, kind: "melee", thrown: 0, reload: 0, attackAbility: "sanity" },
    update: async () => null
  };
  return rollAttack(actor, item, { spendPips: false });
}

/**
 * Work the attack card out from its stored inputs, dice and damage: roll
 * what is missing (new dice after a Fortune reroll, damage on a new hit),
 * then make the character's Ruin and the foe's armour match the result,
 * taking back what an earlier result did (GAPS 103). Used for the first
 * card and after each Fortune use; registered with module/fortune.mjs.
 * @param {Actor} actor  The attacker.
 * @param {object} data  The card's Fortune data (changed in place).
 * @returns {Promise<{content: string, rolls: Roll[]}>} The new rolls.
 */
export async function settleAttackCard(actor, data) {
  const i18n = game.i18n;
  const { inputs, state, applied } = data;
  const rolls = [];
  if (!state.dice) {
    const roll = await new Roll(inputs.formula, inputs.rollData).evaluate();
    rolls.push(roll);
    state.dice = diceOf(roll);
  }
  const result = resolveTest({ dice: state.dice.map(die => die.value), mode: inputs.diceRule, ability: inputs.abilityScore, dr: inputs.dr });
  let tier = fortuneTier(result.tier, state.softened);
  // Field notes: Study the specimen cannot Ruin against a noted kind (GAPS 214).
  if (inputs.noRuin && tier === "ruin") tier = "failure";
  // Overcharge: a Success counts as a Triumph (GAPS 231).
  if (inputs.upgradeSuccess && tier === "success") tier = "triumph";
  state.tier = tier;
  // A power uses its own outcomes (rules 3.10).
  const power = inputs.power ?? null;
  const outcome = power ? powerCardOutcome(tier) : attackOutcome(tier);

  // Damage, on a hit. Fortune can make it the most the dice can show.
  // A power without damage dice deals none.
  const invalid = power ? Boolean(inputs.damageInvalid) : !inputs.damageFormula;
  let damage = null;
  if (outcome.hit && invalid) damage = { invalid: true, formula: inputs.weaponDamage };
  else if (outcome.hit && inputs.damageFormula) {
    if (state.damage === null) {
      const damageRoll = await new Roll(inputs.damageFormula).evaluate({ maximize: state.maximized });
      rolls.push(damageRoll);
      state.damage = damageRoll.total;
      state.triumphExtra = null;
    }
    damage = {
      formula: inputs.damageFormula,
      rolled: state.damage,
      total: power ? powerDamage(state.damage, tier) : attackDamage(state.damage, tier),
      doubled: outcome.multiplier === 2,
      halved: outcome.multiplier === 0.5,
      maximized: state.maximized
    };
    // Holy smite: an extra die on a Triumph, after doubling (step 51a).
    if (!power && tier === "triumph" && inputs.triumphDamage) {
      if (state.triumphExtra === null || state.triumphExtra === undefined) {
        const extraRoll = await new Roll(inputs.triumphDamage).evaluate({ maximize: state.maximized });
        rolls.push(extraRoll);
        state.triumphExtra = extraRoll.total;
      }
      damage.extra = { formula: inputs.triumphDamage, value: state.triumphExtra, before: damage.total };
      damage.total += state.triumphExtra;
    }
  }

  // A Ruin leaves you with Bane on attacks until you Recover (rules 3.4).
  const nowRuined = power ? Boolean(inputs.ruinedBefore) : ruinedAfterAttack(inputs.ruinedBefore, tier);
  if (nowRuined !== (applied.ruin ?? inputs.ruinedBefore)) await actor.update({ "system.attackRuin": nowRuined });
  applied.ruin = nowRuined;

  // A Triumph lowers the target foe's armour die by one (GAPS 12). If an
  // earlier Triumph lowered it and this result is not one, it goes back.
  let armour = null;
  const foe = inputs.foe ? await fromUuid(inputs.foe.uuid) : null;
  const from = inputs.foe?.armourBefore;
  if (outcome.lowerArmour && inputs.foe) {
    if (!from) armour = { text: i18n.format("VARBORG.Attack.NoArmourToLower", { name: inputs.foe.name }) };
    else {
      const to = stepDownArmourDie(from);
      const change = { name: inputs.foe.name, from: armourLabel(from), to: armourLabel(to) };
      if (!applied.armourLowered && foe?.isOwner) {
        await foe.update({ "system.armour": to });
        applied.armourLowered = true;
      }
      armour = applied.armourLowered
        ? { text: i18n.format("VARBORG.Attack.ArmourLowered", change) }
        : { button: i18n.format("VARBORG.Attack.LowerArmourButton", change), uuid: inputs.foe.uuid };
    }
  } else if (applied.armourLowered && foe) {
    await foe.update({ "system.armour": from });
    applied.armourLowered = false;
    armour = { text: i18n.format("VARBORG.Fortune.ArmourBack", { name: inputs.foe.name, die: armourLabel(from) }) };
  }

  // A Sustained power starts when it takes effect.
  const sustainNote = power ? await applySustain(actor, data, tier) : null;
  // What the result gives its targets and user, following Fortune (GAPS 219).
  const given = power ? await settleOutcomes(data, tier, { damage: damage && !damage.invalid ? damage.total : 0 }) : { lines: [], rolls: [] };
  rolls.push(...given.rolls);

  // Inflict damage on a foe. A Triumph's hit is soaked by the armour die
  // the foe had before the Triumph lowered it (GAPS 69).
  let inflict = null;
  // An area power or spell: one button per target, one damage (GAPS 141, 218).
  let area = null;
  if (damage && !damage.invalid && inputs.area) {
    area = {
      foes: inputs.area.foes.map(target => ({
        key: target.uuid,
        damage: damage.total,
        foeUuid: target.uuid,
        armour: inputs.ignoresArmour ? "" : target.armour,
        attack: inputs.attackName,
        // For the foe's immunities and resistances (step 52a).
        damageType: inputs.areaDamageType ?? "",
        // A spell's damage, for resists against spells (Aether Ward, step 52e).
        weaponTags: inputs.power?.kind === "spell" ? "spell,area" : "area",
        label: i18n.format("VARBORG.FoeDamage.InflictOn", { damage: damage.total, name: target.name })
      })),
      defenders: inputs.area.defenders.map(target => ({
        uuid: target.uuid,
        damage: damage.total,
        name: inputs.attackName,
        casterUuid: actor.uuid,
        damageType: inputs.areaDamageType ?? "",
        label: i18n.format("VARBORG.Area.DefendAs", { name: target.name, damage: damage.total })
      }))
    };
  } else if (damage && !damage.invalid && inputs.inflicts) {
    inflict = {
      damage: damage.total,
      foeUuid: inputs.foe?.uuid ?? "",
      // Damage that ignores armour (Sacred flame, step 51e).
      armour: inputs.ignoresArmour ? "" : from ?? "",
      attack: inputs.attackName,
      // For the foe's immunities and resistances (step 52a): the weapon's,
      // power's or spell's damage type.
      damageType: inputs.damageType ?? inputs.areaDamageType ?? "",
      melee: Boolean(inputs.melee),
      // A Triumph's hit, for Undying ("anything but … an attack Triumph", step 52h).
      triumph: tier === "triumph",
      weaponTags: inputs.power?.kind === "spell" ? "spell" : (inputs.weaponTags ?? []).join(","),
      label: inputs.foe
        ? i18n.format("VARBORG.FoeDamage.InflictOn", { damage: damage.total, name: inputs.foe.name })
        : i18n.format("VARBORG.FoeDamage.Inflict", { damage: damage.total })
    };
  }

  const content = await renderTemplate(CARD_TEMPLATE, {
    ...inputs.context,
    dice: state.dice,
    kept: result.kept,
    total: result.total,
    dr: inputs.dr,
    tier,
    tierLabel: i18n.localize(`VARBORG.Tier.${tier}`),
    outcomeText: power ? powerOutcomeText(power, tier) : i18n.localize(`VARBORG.Attack.Outcome.${tier}`),
    description: power?.description || null,
    sustainNote,
    outcomeLines: given.lines,
    // A spell's Ruin: the Shadowblight table (rules 3.11, module/shadowblight.mjs).
    shadowblight: power?.kind === "spell" && tier === "ruin" ? { actorUuid: actor.uuid } : null,
    naturalNote: naturalNote(result),
    damage,
    inflict,
    area,
    armour,
    ruinNote: nowRuined && !inputs.ruinedBefore ? i18n.localize("VARBORG.Attack.RuinedNow") : null,
    // Powers are not weapon attacks: no maximum damage (GAPS 119).
    fortune: await fortuneSection(data, {
      tier, natural: result.natural, damage: Boolean(damage && !damage.invalid), maximized: state.maximized, attack: !power
    })
  });
  return { content, rolls };
}

/**
 * The conditions on this attack: the attacker's own, and the target's Foe
 * lines when the target is a foe (rules 3.13). Injuries count by the
 * ability used (GAPS 88). The attacker's item effects count with their own
 * conditions (PLAN step 49c).
 * @returns {{own: object[], target: object[]}}
 */
function attackConditions(actor, target, mode, ability, item) {
  const own = conditionsOf(actor);
  const against = target?.type === "foe" ? conditionsOf(target) : null;
  // The weapon's tags and item (the chosen weapon) and the target's category (step 49h).
  const effectContext = {
    roll: "attack", ability, weapon: weaponTags(item.system, mode),
    weaponId: item.id, targetCategory: target?.system?.category ?? "", damageType: item.system.damageType ?? "",
    // The target's conditions (Hit 'em where it hurts, step 51a), and who it is (step 51e).
    targetStatuses: [...(target?.statuses ?? [])], targetUuid: target?.uuid ?? ""
  };
  return {
    // Unbroken: Frightened gives no Bane on attacks (step 50f).
    own: [...attackerConditions(actor.system.statBonuses?.frightenedAttackIgnored?.set > 0
      ? new Set([...own.conditions].filter(id => id !== "frightened")) : own.conditions, own.fatigue, ability), ...itemRollMods(actor, effectContext)],
    target: against ? attackTargetConditions(against.conditions, against.fatigue, mode) : []
  };
}

/**
 * The attack dialog. Returns the chosen options, or null if it was closed.
 * @returns {Promise<{mode: string, ability: string, oneHanded: boolean, beyondRange: boolean,
 *   dr: number, boon: boolean, bane: boolean, data: object}|null>}  data is the whole form.
 */
async function askAttackOptions(actor, item, { turn, attacksBefore, target, ruined, optionalEffects = "" }) {
  const i18n = game.i18n;
  // After the owner's feats: Brawler, Long shot (step 50a3).
  const weapon = effectiveWeapon(item);
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

  // For the usual way of attacking; the card shows the final numbers.
  const conditions = attackConditions(actor, target, modes[0], abilities[0], item);

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
    ruinNote: ruined ? i18n.localize("VARBORG.Attack.RuinNote") : null,
    conditionNotes: [...conditionNotes(conditions.own), ...conditionNotes(conditions.target, target?.name)],
    reminders: [...reminderNotes(actor, "attack"), ...itemReminderNotes(actor, { roll: "attack", ability: abilities[0], weapon: weaponTags(weapon, modes[0]), weaponId: item.id, damageType: weapon.damageType ?? "" })],
    optionalEffects,
    target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : i18n.localize("VARBORG.Attack.NoTarget"),
    fortuneFields: await fortuneFields(actor, "attack")
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
    bane: Boolean(data.bane),
    data
  };
}

/**
 * The Recover button: end an attack Ruin. In combat it must be your own
 * turn, and it spends one action (rules 3.4, GAPS 17 and 63).
 * @param {Actor} actor  The ruined character.
 */
export async function recoverFromRuin(actor) {
  const i18n = game.i18n;
  if (!actor.system.attackRuin) return;
  const turn = turnState(actor);
  const cost = recoverCost({ inCombat: Boolean(turn.combatant), onOwnTurn: turn.onOwnTurn });
  if (!cost.allowed) {
    ui.notifications.warn(i18n.localize("VARBORG.Attack.RecoverNotYourTurn"));
    return;
  }
  if (cost.actions) {
    if (turn.combatant.actionsLeft < cost.actions) ui.notifications.warn(i18n.localize("VARBORG.Attack.RecoverNoActions"));
    await turn.combatant.adjustPips("actions", -cost.actions);
  }
  await actor.update({ "system.attackRuin": false });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${i18n.format("VARBORG.Attack.Recovered", { name: actor.name })}</p>`
      + (cost.actions ? `<p class="modifier">${i18n.localize("VARBORG.Attack.UsedAction")}</p>` : "")
      + "</div>"
  });
}

/**
 * The chat card's "Lower armour" button, for the Dark Master when the
 * attacker could not change the foe. Hooked to renderChatMessageHTML.
 */
export function addAttackCardListeners(message, html) {
  const button = html.querySelector("button[data-action='lowerArmour']");
  if (!button) return;
  // Cards from before Fortune remember it in their own flag.
  const lowered = message.getFlag(SYSTEM, "fortune")?.applied?.armourLowered ?? message.getFlag(SYSTEM, "armourLowered");
  if (lowered) {
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
    // Fortune reads this to put the armour back if a reroll loses the Triumph.
    await message.update({ [`flags.${SYSTEM}.armourLowered`]: true, [`flags.${SYSTEM}.fortune.applied.armourLowered`]: true });
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
