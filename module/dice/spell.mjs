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
 * there, with the spell's outcomes. A Ruin says to roll on the Shadowblight
 * table; the roll itself comes in step 31.
 *
 * The maths lives in module/rules/spells.mjs.
 */

import { SPELL_ABILITY, CASTING_TIMES, spellDr, outsideSpellList, metalArmourBane, spellModifiers } from "../rules/spells.mjs";
import { DR_TABLE, diceMode, diceFormula } from "../rules/test-roll.mjs";
import { modifiedDr, wornArmour } from "../rules/test-modifiers.mjs";
import { testConditions, totalModifiers } from "../rules/conditions.mjs";
import { CARD } from "../rules/fortune.mjs";
import { turnState } from "../combat.mjs";
import { useUpNextTest } from "../panic.mjs";
import { conditionsOf, conditionNotes, reminderNotes } from "../conditions.mjs";
import { newFortuneData, fortuneFlags, fortuneFields, payDialogFortune } from "../fortune.mjs";
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
 * The Cast button: cast a spell.
 * @param {Actor} actor  The character.
 * @param {Item} spell   The spell item.
 */
export async function castSpell(actor, spell) {
  const i18n = game.i18n;
  const turn = turnState(actor);
  const use = checkPowerUse(actor, spell, turn);
  if (!use) return;
  const target = [...game.user.targets][0]?.actor ?? null;

  const ability = SPELL_ABILITY;
  const facts = castingFacts(actor, spell);
  const automatic = actorTestModifiers(actor, ability);
  const { conditions, fatigue } = conditionsOf(actor);
  const conditionMods = testConditions(conditions, fatigue, ability);
  const fromConditions = totalModifiers(conditionMods);
  const notes = conditionNotes(conditionMods);
  const startDr = spellDr(spell.system.cost);
  const abilityLabel = i18n.localize(`VARBORG.Ability.${ability}`);
  const spellListLabel = i18n.localize(`VARBORG.Class.SpellList.${spell.system.spellList}`);
  const classListLabel = facts.classList ? i18n.localize(`VARBORG.Class.SpellList.${facts.classList}`) : i18n.localize("VARBORG.Spell.NoClass");

  const content = await renderTemplate(DIALOG_TEMPLATE, {
    target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : i18n.localize("VARBORG.Power.NoTarget"),
    how: i18n.format("VARBORG.Spell.TestNote", { dr: startDr }),
    useNote: use.ember || use.actions
      ? i18n.format("VARBORG.Power.UseNote", { cost: use.ember, actions: use.actions })
      : i18n.localize("VARBORG.Power.OutsideCombat"),
    drs: DR_TABLE.map(dr => ({
      value: dr,
      label: i18n.format("VARBORG.Test.DROption", { dr, name: i18n.localize(`VARBORG.DR.${dr}`) }),
      selected: dr === startDr
    })),
    outsideList: facts.outsideList === true,
    outsideListHint: facts.outsideList === null
      ? i18n.format("VARBORG.Spell.OutsideListChoose", { list: spellListLabel })
      : i18n.format("VARBORG.Spell.OutsideListHint", { list: spellListLabel, classList: classListLabel }),
    metalArmour: facts.metalArmour,
    metalArmourHint: facts.metalArmour
      ? i18n.format("VARBORG.Spell.MetalArmourWorn", { name: facts.armourName })
      : i18n.localize("VARBORG.Spell.MetalArmourHint"),
    castingTimes: Object.fromEntries(CASTING_TIMES.map(key => [key, `VARBORG.Spell.CastingTime.${key}`])),
    conditionNotes: notes,
    reminders: reminderNotes(actor, "test"),
    fortuneFields: await fortuneFields(actor, "spell")
  });
  const options = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Spell.DialogTitle", { name: spell.name }) },
    content,
    ok: { label: "VARBORG.Spell.Cast", icon: "fa-solid fa-wand-sparkles" },
    rejectClose: false
  });
  if (!options) return;

  const paid = await payDialogFortune(actor, options);
  if (!paid) return;
  if (!(await payPowerEmber(actor, use, paid))) return;
  // Outside combat: this was the one free use (rules 3.10).
  if (use.marksUsed) await spell.update({ "system.usedOutside": true });

  const castingTime = CASTING_TIMES.includes(options.castingTime) ? options.castingTime : "normal";
  const casting = spellModifiers({
    outsideList: Boolean(options.outsideList),
    metalArmour: Boolean(options.metalArmour),
    duress: Boolean(options.duress),
    castingTime,
    severalCasters: Boolean(options.severalCasters)
  });
  const boons = casting.boons + (options.boon ? 1 : 0) + (paid.boon ? 1 : 0) + fromConditions.boons;
  const banes = casting.banes + (options.bane ? 1 : 0) + (paid.bane ? 1 : 0)
    + (automatic.encumberedBane ? 1 : 0) + fromConditions.banes;
  const diceRule = diceMode(boons, banes);
  const abilityScore = actor.system.abilities[ability];
  const chosenDr = Number(options.dr);
  const dr = modifiedDr(chosenDr, automatic.armourDr + fromConditions.dr + casting.dr);

  const formula = `${diceFormula(diceRule)} + @ability`;
  const roll = await new Roll(formula, { ability: abilityScore }).evaluate();
  await useUpNextTest(actor);
  const pipNote = await spendPowerActions(turn, use);

  const damage = powerDamageDice(spell);
  const foe = target?.type === "foe" ? target : null;
  const title = i18n.format("VARBORG.Power.CardTitle", { name: spell.name });
  const castingNotes = [
    options.outsideList ? i18n.format("VARBORG.Spell.OutsideListNote", { list: spellListLabel }) : null,
    options.metalArmour ? i18n.localize("VARBORG.Spell.MetalArmourNote") : null,
    options.duress ? i18n.localize("VARBORG.Spell.DuressNote") : null,
    castingTime !== "normal" ? i18n.localize(`VARBORG.Spell.CastingTimeNote.${castingTime}`) : null,
    options.severalCasters ? i18n.localize("VARBORG.Spell.SeveralCastersNote") : null
  ];
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
    power: { ...powerInputs(spell), kind: "spell" },
    context: {
      title,
      how: i18n.format("VARBORG.Spell.How", { ability: abilityLabel, list: spellListLabel }),
      target: target ? i18n.format("VARBORG.Attack.Against", { name: target.name }) : null,
      modeLabel: modeLabel(diceRule, boons, banes),
      ability: signed(abilityScore),
      abilityLabel,
      drNote: dr !== chosenDr ? i18n.format("VARBORG.Attack.DRFrom", { dr: chosenDr }) : null,
      notes: [
        ...castingNotes,
        automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
        ...notes,
        paid.note,
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
}
