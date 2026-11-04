/**
 * Casting spells in Foundry (rules 3.11 Spellcasting).
 *
 * The Cast button on the sheet:
 * - checks the spell can be cast now, as for every ember ability: in combat
 *   only on your own turn, with enough Ember in the pool; outside combat
 *   once for free until an encounter or a rest (module/dice/power.mjs);
 * - tests Sanity against DR 11 + cost;
 * - ticks Bane for a spell outside your class's spell list and for metal
 *   armour of tier 2+. The player can untick them for a feature that removes
 *   the Bane (such as Tome keeper or Barkskin), and ticks the rest:
 *   a foe in melee range (Bane), 1 minute (−2 DR) or 1 hour (Boon) of
 *   casting, several casters (Boon). Boon and Bane cancel.
 * It posts the attack card, like a power: Fortune and Inflict damage work
 * there, with the spell's outcomes. A Ruin shows a button that rolls on the
 * Shadowblight table (module/shadowblight.mjs).
 *
 * Life force (rules 3.11, GAPS 28): the dialog asks how many wounds to
 * spend. Then the test is Toughness, the DR drops by d4 per wound (never
 * below 6), the wounds are added at once (HP unchanged), and each gets a
 * wound card with its Toughness test (module/agony.mjs).
 *
 * Scrolls (rules 3.11, GAPS 29 and 136–140) use the same dialog from the
 * Inventory tab: no Ember, never the other-list Bane, no life force, and
 * the scroll is deleted after the card is posted, whatever the result.
 *
 * The maths lives in module/rules/spells.mjs.
 */

import {
  SPELL_ABILITY, CASTING_TIMES, castingDr, outsideSpellList, metalArmourBane, spellModifiers,
  lifeForceLeft, lifeForceWounds, castingAbility, lifeForceFormula, lifeForceDr, scrollUse, scrollModifiers,
  ritualUse, ritualModifiers
} from "../rules/spells.mjs";
import { DR_TABLE, diceMode, diceFormula } from "../rules/test-roll.mjs";
import { wornArmour } from "../rules/test-modifiers.mjs";
import { testConditions, totalModifiers } from "../rules/conditions.mjs";
import { CARD } from "../rules/fortune.mjs";
import { turnState } from "../combat.mjs";
import { useUpNextTest } from "../panic.mjs";
import { conditionsOf, conditionNotes, reminderNotes } from "../conditions.mjs";
import { newFortuneData, fortuneFlags, fortuneFields, payDialogFortune } from "../fortune.mjs";
import { postLifeForceWoundCards } from "../agony.mjs";
import { settleAttackCard } from "./attack.mjs";
import { actorTestModifiers, signed, modeLabel, diceOf } from "./ability-test.mjs";
import {
  checkPowerUse, payPowerEmber, spendPowerActions, emberNote, powerInputs, powerDamageDice
} from "./power.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/spell-dialog.hbs";

/**
 * What the sheet knows about this casting before the dialog: is the spell
 * outside the class's list, and is the worn armour metal of tier 2+?
 */
function castingFacts(actor, spell) {
  const classItem = actor.itemTypes.class?.[0] ?? null;
  const classList = classItem?.system.spellList ?? null;
  const items = actor.items.map(item => ({ id: item.id, type: item.type, ...item.system }));
  const armour = wornArmour(items);
  return {
    classList,
    outsideList: outsideSpellList(spell.system.spellList, classList),
    metalArmour: metalArmourBane(armour),
    armourName: armour ? actor.items.get(armour.id)?.name ?? null : null
  };
}

/**
 * Can the scroll be read now? Warns and returns null if not.
 * @returns {{allowed: true, ember: 0, actions: number, marksUsed: false}|null}
 */
function checkScrollUse(scroll, turn) {
  const use = scrollUse({ inCombat: Boolean(turn.combatant), onOwnTurn: turn.onOwnTurn, actions: scroll.system.actions });
  if (!use.allowed) {
    ui.notifications.warn(game.i18n.format("VARBORG.Spell.ScrollNotYourTurn", { name: scroll.name }));
    return null;
  }
  return use;
}

/**
 * Can the ritual be cast now? Only outside combat (rules 7, GAPS 186).
 * Warns and returns null if not.
 */
function checkRitualUse(ritual, turn) {
  const use = ritualUse({ inCombat: Boolean(turn.combatant) });
  if (!use.allowed) {
    ui.notifications.warn(game.i18n.format("VARBORG.Spell.RitualInCombat", { name: ritual.name }));
    return null;
  }
  return use;
}

/** What armour, Encumbered and conditions do to a test of this ability. */
function abilityMods(actor, ability) {
  const automatic = actorTestModifiers(actor, ability);
  const { conditions, fatigue } = conditionsOf(actor);
  const conditionMods = testConditions(conditions, fatigue, ability);
  return { automatic, fromConditions: totalModifiers(conditionMods), notes: conditionNotes(conditionMods) };
}

/** The d4s a life force roll showed, such as "3, 1". */
function diceShown(roll) {
  return roll.dice.flatMap(die => die.results.map(result => result.result)).join(", ");
}

/**
 * The Cast button on a spell, or the read button on a scroll.
 * @param {Actor} actor  The character.
 * @param {Item} spell   The spell or scroll item.
 */
export async function castSpell(actor, spell) {
  const i18n = game.i18n;
  const scroll = spell.type === "scroll";
  const ritual = !scroll && Boolean(spell.system.ritual);
  const turn = turnState(actor);
  const use = scroll ? checkScrollUse(spell, turn) : ritual ? checkRitualUse(spell, turn) : checkPowerUse(actor, spell, turn);
  if (!use) return;
  const target = [...game.user.targets][0]?.actor ?? null;

  const facts = castingFacts(actor, spell);
  const sanity = abilityMods(actor, SPELL_ABILITY);
  const startDr = castingDr(spell.system);
  const spellListLabel = i18n.localize(`VARBORG.Class.SpellList.${spell.system.spellList}`);
  const classListLabel = facts.classList ? i18n.localize(`VARBORG.Class.SpellList.${facts.classList}`) : i18n.localize("VARBORG.Spell.NoClass");
  const wounds = actor.system.wounds;
  const woundsLeft = lifeForceLeft(wounds.value, wounds.max);

  let useNote;
  if (scroll) useNote = i18n.localize("VARBORG.Spell.ScrollNoEmber");
  else if (ritual) useNote = i18n.format("VARBORG.Spell.RitualUseNote", { time: spell.system.castingTime || i18n.localize("VARBORG.Spell.RitualNoTime") });
  else if (use.reactions) useNote = i18n.format("VARBORG.Power.UseNoteReaction", { cost: use.ember });
  else if (use.ember || use.actions) useNote = i18n.format("VARBORG.Power.UseNote", { cost: use.ember, actions: use.actions });
  else useNote = i18n.localize("VARBORG.Power.OutsideCombat");

  const content = await renderTemplate(DIALOG_TEMPLATE, {
    target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : i18n.localize("VARBORG.Power.NoTarget"),
    how: i18n.format(scroll ? "VARBORG.Spell.ScrollTestNote" : ritual ? "VARBORG.Spell.RitualTestNote" : "VARBORG.Spell.TestNote", { dr: startDr }),
    // A ritual's long casting time is already part of it: no casting time choice.
    ritual,
    useNote,
    drs: DR_TABLE.map(dr => ({
      value: dr,
      label: i18n.format("VARBORG.Test.DROption", { dr, name: i18n.localize(`VARBORG.DR.${dr}`) }),
      selected: dr === startDr
    })),
    // A scroll never has the other-list Bane (GAPS 29), so the box is hidden.
    scroll,
    outsideList: facts.outsideList === true,
    outsideListHint: facts.outsideList === null
      ? i18n.format("VARBORG.Spell.OutsideListChoose", { list: spellListLabel })
      : i18n.format("VARBORG.Spell.OutsideListHint", { list: spellListLabel, classList: classListLabel }),
    metalArmour: facts.metalArmour,
    metalArmourHint: facts.metalArmour
      ? i18n.format("VARBORG.Spell.MetalArmourWorn", { name: facts.armourName })
      : i18n.localize("VARBORG.Spell.MetalArmourHint"),
    castingTimes: Object.fromEntries(CASTING_TIMES.map(key => [key, `VARBORG.Spell.CastingTime.${key}`])),
    // Life force is for spells you know; a scroll tests Sanity (GAPS 137).
    lifeForce: scroll ? null : {
      left: woundsLeft,
      hint: woundsLeft
        ? i18n.format("VARBORG.Spell.LifeForceHint", { left: woundsLeft })
        : i18n.localize("VARBORG.Spell.LifeForceNone")
    },
    conditionNotes: sanity.notes,
    reminders: reminderNotes(actor, "test"),
    fortuneFields: await fortuneFields(actor, "spell")
  });
  const options = await DialogV2.input({
    window: { title: i18n.format(scroll ? "VARBORG.Spell.ScrollDialogTitle" : "VARBORG.Spell.DialogTitle", { name: spell.name }) },
    content,
    ok: { label: "VARBORG.Spell.Cast", icon: scroll ? "fa-solid fa-scroll" : "fa-solid fa-wand-sparkles" },
    rejectClose: false
  });
  if (!options) return;

  const paid = await payDialogFortune(actor, options);
  if (!paid) return;
  if (!(await payPowerEmber(actor, use, paid))) return;
  // Outside combat: this was the one free use (rules 3.10). Never for a scroll.
  if (use.marksUsed) await spell.update({ "system.usedOutside": true });

  // Life force: Toughness instead of Sanity, and the DR drops by d4 per wound.
  const lifeWounds = scroll ? 0 : lifeForceWounds(options.lifeForce, wounds.value, wounds.max);
  const ability = castingAbility(lifeWounds);
  const { automatic, fromConditions, notes } = ability === SPELL_ABILITY ? sanity : abilityMods(actor, ability);
  const lifeFormula = lifeForceFormula(lifeWounds);
  const lifeRoll = lifeFormula ? await new Roll(lifeFormula).evaluate() : null;
  const reduction = lifeRoll?.total ?? 0;
  const woundsBefore = wounds.value;
  // The wounds are taken now; HP does not change (rules 3.11).
  if (lifeWounds) await actor.update({ "system.wounds.value": woundsBefore + lifeWounds });

  const castingTime = !ritual && CASTING_TIMES.includes(options.castingTime) ? options.castingTime : "normal";
  const modifierOptions = {
    outsideList: Boolean(options.outsideList),
    metalArmour: Boolean(options.metalArmour),
    duress: Boolean(options.duress),
    castingTime,
    severalCasters: Boolean(options.severalCasters)
  };
  const casting = scroll ? scrollModifiers(modifierOptions) : ritual ? ritualModifiers(modifierOptions) : spellModifiers(modifierOptions);
  const boons = casting.boons + (options.boon ? 1 : 0) + (paid.boon ? 1 : 0) + fromConditions.boons;
  const banes = casting.banes + (options.bane ? 1 : 0) + (paid.bane ? 1 : 0)
    + (automatic.encumberedBane ? 1 : 0) + fromConditions.banes;
  const diceRule = diceMode(boons, banes);
  const abilityScore = actor.system.abilities[ability];
  const abilityLabel = i18n.localize(`VARBORG.Ability.${ability}`);
  const chosenDr = Number(options.dr);
  const dr = lifeForceDr(chosenDr, reduction, automatic.armourDr + fromConditions.dr + casting.dr);

  const formula = `${diceFormula(diceRule)} + @ability`;
  const roll = await new Roll(formula, { ability: abilityScore }).evaluate();
  await useUpNextTest(actor);
  const pipNote = await spendPowerActions(turn, use);

  const damage = powerDamageDice(spell);
  const foe = target?.type === "foe" ? target : null;
  const title = i18n.format("VARBORG.Power.CardTitle", { name: spell.name });
  const castingNotes = [
    !scroll && options.outsideList ? i18n.format("VARBORG.Spell.OutsideListNote", { list: spellListLabel }) : null,
    options.metalArmour ? i18n.localize("VARBORG.Spell.MetalArmourNote") : null,
    options.duress ? i18n.localize("VARBORG.Spell.DuressNote") : null,
    castingTime !== "normal" ? i18n.localize(`VARBORG.Spell.CastingTimeNote.${castingTime}`) : null,
    options.severalCasters ? i18n.localize("VARBORG.Spell.SeveralCastersNote") : null,
    lifeRoll ? i18n.format("VARBORG.Spell.LifeForceNote", {
      count: lifeWounds, reduction, formula: lifeFormula, dice: diceShown(lifeRoll)
    }) : null,
    lifeWounds && woundsBefore + lifeWounds >= wounds.max ? i18n.format("VARBORG.Spell.LifeForceAtMax", { name: actor.name }) : null
  ];
  // A Sustained spell read from a scroll is not tracked: the scroll is gone (GAPS 139).
  const scrollNotes = scroll ? [
    spell.system.sustained ? i18n.localize("VARBORG.Spell.ScrollSustainNote") : null,
    i18n.format("VARBORG.Spell.ScrollDestroyed", { name: spell.name })
  ] : [];
  const inputs = {
    formula,
    rollData: { ability: abilityScore },
    diceRule, abilityScore, dr,
    damageFormula: damage.formula,
    damageInvalid: damage.invalid,
    weaponDamage: damage.text,
    ruinedBefore: actor.system.attackRuin,
    inflicts: target?.type !== "character",
    foe: foe ? { uuid: foe.uuid, name: foe.name, armourBefore: foe.system.armour } : null,
    attackName: spell.name,
    // The card treats a spell as a power, with the spell's Ruin text.
    power: { ...powerInputs(spell), kind: "spell", sustained: scroll || ritual ? false : spell.system.sustained },
    context: {
      title,
      how: i18n.format(scroll ? "VARBORG.Spell.ScrollHow" : ritual ? "VARBORG.Spell.RitualHow" : "VARBORG.Spell.How", { ability: abilityLabel, list: spellListLabel }),
      target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : null,
      modeLabel: modeLabel(diceRule, boons, banes),
      ability: signed(abilityScore),
      abilityLabel,
      drNote: dr !== chosenDr ? i18n.format("VARBORG.Attack.DRFrom", { dr: chosenDr }) : null,
      notes: [
        ...castingNotes,
        automatic.armourDr ? i18n.format("VARBORG.Attack.ArmourNote", { armour: signed(automatic.armourDr), name: automatic.armourName }) : null,
        automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
        ...notes,
        paid.note,
        scroll ? i18n.localize("VARBORG.Spell.ScrollNoEmber")
          : ritual ? i18n.format("VARBORG.Spell.RitualUseNote", { time: spell.system.castingTime || i18n.localize("VARBORG.Spell.RitualNoTime") })
            : emberNote(use, Boolean(turn.combatant)),
        ...scrollNotes
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
    rolls: [...(lifeRoll ? [lifeRoll] : []), roll, ...rolls],
    sound: CONFIG.sounds.dice,
    flags: fortuneFlags(data)
  });

  // Each wound spent tests Toughness, as a wound gained at 0 HP.
  if (lifeWounds) await postLifeForceWoundCards(actor, woundsBefore, lifeWounds);
  // Reading a scroll always destroys it, even if the spell fails.
  if (scroll) await spell.delete();
}
