/**
 * Gloom abilities in Foundry (rules 3.10 "Gloom defend", rules 6 Gloom
 * abilities, GAPS 122–127).
 *
 * The Use button on the foe sheet:
 * - in combat, only on the foe's own turn: pays the cost from the Gloom
 *   pool (module/pools.mjs) and spends its action pips. Outside combat
 *   nothing is spent;
 * - posts a card with a button for each targeted character (or one for
 *   your own character when nothing is targeted).
 *
 * The button opens a dialog and rolls the character's test: the Agility
 * DR12 defence, or the ability's own test. The card works like a defence
 * card: Fortune buttons, and a Take button that lowers HP and adds the
 * ability's condition for that result, with its timer (module/timers.mjs).
 *
 * The maths lives in module/rules/gloom.mjs.
 */

import { useUpNextRoll as useUpNextRollBuffs } from "../outcomes.mjs";
import { gloomTest, gloomOutcome, gloomDamageTaken, gloomUse, gloomDefenderConditions, gloomFoeConditions } from "../rules/gloom.mjs";
import { DR_TABLE, diceMode, diceFormula, resolveTest } from "../rules/test-roll.mjs";
import { modifiedDr } from "../rules/test-modifiers.mjs";
import { isDamageFormula } from "../rules/equipment.mjs";
import { testConditions, totalModifiers } from "../rules/conditions.mjs";
import { CARD, lowerDamage } from "../rules/fortune.mjs";
import { POOL, canPay } from "../rules/pools.mjs";
import { getPools, spendFromPool } from "../pools.mjs";
import { turnState } from "../combat.mjs";
import { useUpNextTest } from "../panic.mjs";
import { conditionsOf, conditionNotes, reminderNotes } from "../conditions.mjs";
import { newFortuneData, fortuneFlags, fortuneSection, fortuneFields, payDialogFortune } from "../fortune.mjs";
import { defenceModifiers, DEFENDERS } from "./defence.mjs";
import { actorTestModifiers, signed, modeLabel, naturalNote, diceOf, fortuneTier } from "./ability-test.mjs";
import { itemRollMods, itemReminderNotes, itemOptionalMods, optionalEffectsField, tickedMods } from "../effects.mjs";
import { statDrMods } from "../rules/item-effects.mjs";
import { rollResists, resistLines, takenWithResists } from "../effects.mjs";
import { useUpNextAttackMarks, outcomeInputs, gloomGivesText } from "../outcomes.mjs";
import { featLoweredDamage } from "../rules/item-effects.mjs";
import { VB_DIALOG_CLASSES } from "../dialog.mjs";
import { aimArea } from "../areas.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const USE_CARD_TEMPLATE = "systems/var-borg/templates/chat/gloom-card.hbs";
const DIALOG_TEMPLATE = "systems/var-borg/templates/dice/defence-dialog.hbs";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/defence-card.hbs";

/** "Agility DR12 defence" or "Presence DR12": the test a character makes. */
function testLabel(test) {
  const i18n = game.i18n;
  const ability = i18n.localize(`VARBORG.Ability.${test.ability}`);
  return i18n.format(test.own ? "VARBORG.Gloom.OwnTest" : "VARBORG.Gloom.DefenceTest", { ability, dr: test.dr });
}

/** "☾3 ◈◈". */
export function gloomCostLabel(system) {
  return `☾${system.cost}${system.actions ? ` ${"◈".repeat(system.actions)}` : ""}`;
}

/**
 * The foe sheet's Use button: pay for the ability and post its card.
 * @param {Actor} foe
 * @param {Item} power  The gloom ability (a power with resource Gloom).
 */
export async function useGloomAbility(foe, power) {
  const i18n = game.i18n;
  const system = power.system;
  const turn = turnState(foe);
  const inCombat = Boolean(turn.combatant);
  // Fallen at 0 HP: the defeated mark on the actor or on its combatant (GAPS 71).
  const defeated = foe.statuses.has(CONFIG.specialStatusEffects.DEFEATED) || Boolean(turn.combatant?.isDefeated);
  const use = gloomUse({ inCombat, onOwnTurn: turn.onOwnTurn, defeated, cost: system.cost, actions: system.actions });
  if (!use.allowed) {
    const key = use.reason === "defeated" ? "VARBORG.Gloom.Defeated" : "VARBORG.Gloom.NotYourTurn";
    ui.notifications.warn(i18n.format(key, { name: power.name, foe: foe.name }));
    return;
  }
  // An area of effect: aim it, and every creature it catches is targeted (playtest feedback).
  if (!(await aimArea(foe, power)).go) return;
  if (use.gloom) {
    const left = getPools()[POOL.GLOOM];
    if (!canPay(left, use.gloom)) {
      ui.notifications.warn(i18n.format("VARBORG.Gloom.NotEnough", { name: power.name, cost: use.gloom, left }));
      return;
    }
    if (!(await spendFromPool(POOL.GLOOM, use.gloom, foe))) return;
  }
  let pipNote = null;
  if (use.actions) {
    if (turn.combatant.actionsLeft < use.actions) ui.notifications.warn(i18n.localize("VARBORG.Power.NoActions"));
    await turn.combatant.adjustPips("actions", -use.actions);
    pipNote = i18n.format("VARBORG.Power.UsedActions", { count: use.actions });
  }

  // Characters and their minions take the test (GAPS 169).
  const targets = [...game.user.targets].map(token => token.actor).filter(actor => DEFENDERS.includes(actor?.type));
  const test = gloomTest(system);
  // Two or more targets share one damage roll for each damage formula (GAPS 141).
  const shared = {};
  const sharedRolls = [];
  if (targets.length >= 2) {
    for (const key of ["damage", "ruinDamage"]) {
      const text = String(system[key] ?? "").trim();
      if (!isDamageFormula(text) || text in shared) continue;
      const roll = await new Roll(text).evaluate();
      sharedRolls.push(roll);
      shared[text] = roll.total;
    }
  }
  const content = await renderTemplate(USE_CARD_TEMPLATE, {
    shared: Object.keys(shared).length ? JSON.stringify(shared) : "",
    sharedNote: Object.keys(shared).length
      ? i18n.format("VARBORG.Area.SharedGloom", { rolls: Object.entries(shared).map(([text, total]) => `${text} = ${total}`).join(", ") })
      : null,
    title: i18n.format("VARBORG.Gloom.CardTitle", { name: foe.name, ability: power.name }),
    cost: gloomCostLabel(system),
    test: testLabel(test),
    description: system.description,
    powerUuid: power.uuid,
    targets: targets.map(actor => ({ uuid: actor.uuid, label: i18n.format("VARBORG.Gloom.TestAs", { name: actor.name }) })),
    hint: i18n.localize(targets.length ? "VARBORG.Gloom.TestHint" : "VARBORG.Defence.NoTargetHint"),
    notes: [
      use.gloom ? i18n.format("VARBORG.Gloom.Paid", { cost: use.gloom }) : null,
      inCombat ? null : i18n.localize("VARBORG.Gloom.OutsideCombat"),
      pipNote
    ].filter(Boolean)
  });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: foe }), content, rolls: sharedRolls, sound: sharedRolls.length ? CONFIG.sounds.dice : null });
}

/**
 * A character's test against a gloom ability: dialog, roll, and the card.
 * @param {Actor} actor  The character.
 * @param {Item} power   The foe's gloom ability.
 */
export async function rollGloomTest(actor, power, { shared = null } = {}) {
  const i18n = game.i18n;
  const foe = power.parent;
  const system = power.system;
  const test = gloomTest(system);
  const gear = defenceModifiers(actor);
  const { conditions, fatigue } = conditionsOf(actor);

  // The Agility defence: armour's +2 DR, a raised shield, Encumbered and the
  // defender's conditions (not Prone). An own test: an ordinary test of
  // that ability (armour penalties, Encumbered, conditions).
  // Item effects (PLAN step 49c): a gloom test is also an ability test (its
  // own test) or a defence, and resists the conditions the ability gives.
  const effectContext = {
    roll: ["gloomTest", test.own ? "test" : "defence"],
    ability: test.ability,
    against: [system.conditions?.failure, system.conditions?.ruin].filter(Boolean),
    // The foe's kind, for Field notes (GAPS 214).
    targetName: foe?.name ?? ""
  };
  let automatic;
  let conditionMods;
  if (test.own) {
    const mods = actorTestModifiers(actor, test.ability);
    automatic = { armourDr: mods.armourDr, armourName: mods.armourName, cover: 0, encumberedBane: mods.encumberedBane };
    conditionMods = [...testConditions(conditions, fatigue, test.ability), ...itemRollMods(actor, effectContext)];
  } else {
    automatic = { armourDr: gear.armourDr, armourName: gear.armourName, cover: gear.cover, shieldName: gear.shieldName, encumberedBane: gear.encumberedBane };
    conditionMods = [
      ...gloomDefenderConditions(conditions, fatigue),
      ...itemRollMods(actor, effectContext),
      ...statDrMods(actor.system.statBonuses?.defenceDr)
    ];
  }
  // Marks on the foe from powers (GAPS 223).
  if (foe?.type === "foe") conditionMods.push(...itemRollMods(foe, { roll: "defendAgainst" }));
  // The foe's Stupefied Boon on a defence against its gloom ability (rules 3.13,
  // Foe line). Not on an ability's own test: the Foe line says "defend".
  const foeMods = !test.own && foe?.type === "foe" ? gloomFoeConditions(conditionsOf(foe).conditions) : [];
  // Item effects for the player to tick when they apply (PLAN step 49d).
  const optional = itemOptionalMods(actor, effectContext);
  // Armour soaks the damage either way (GAPS 123); natural armour too (GAPS 188).
  const soak = gear.soakDie ? { die: gear.soakDie, name: gear.soakName } : null;
  const notes = [
    automatic.armourDr ? i18n.format("VARBORG.Defence.ArmourNote", { dr: signed(automatic.armourDr), name: automatic.armourName }) : null,
    automatic.cover ? i18n.format("VARBORG.Defence.CoverNote", { dr: signed(-automatic.cover), name: automatic.shieldName }) : null,
    automatic.encumberedBane ? i18n.localize("VARBORG.Test.EncumberedBane") : null,
    ...conditionNotes(conditionMods),
    ...conditionNotes(foeMods, foe?.name)
  ].filter(Boolean);

  const content = await renderTemplate(DIALOG_TEMPLATE, {
    against: i18n.format("VARBORG.Defence.Against", { name: foe?.name ?? "", attack: power.name }),
    damage: testLabel(test),
    drs: DR_TABLE.map(dr => ({
      value: dr,
      label: i18n.format("VARBORG.Test.DROption", { dr, name: i18n.localize(`VARBORG.DR.${dr}`) }),
      selected: dr === test.dr
    })),
    notes: [...notes, soak?.die ? i18n.format("VARBORG.Defence.SoakNote", { die: soak.die, name: soak.name }) : null].filter(Boolean),
    reminders: [...reminderNotes(actor, test.own ? "test" : "defence"), ...itemReminderNotes(actor, effectContext)],
    optionalEffects: await optionalEffectsField(optional),
    automaticHint: i18n.localize(test.own ? "VARBORG.Gloom.OwnHint" : "VARBORG.Gloom.DefenceHint"),
    fortuneFields: await fortuneFields(actor, "gloom")
  });
  const options = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.format("VARBORG.Gloom.DialogTitle", { name: actor.name, ability: power.name }) },
    content,
    // An ability's own test (Toll: Presence) is not a defence.
    ok: { label: test.own ? "VARBORG.Gloom.RollTest" : "VARBORG.Defence.Roll", icon: "fa-solid fa-moon" },
    rejectClose: false
  });
  if (!options) return;

  const paid = await payDialogFortune(actor, options);
  if (!paid) return;

  const ticked = tickedMods(optional, options);
  conditionMods.push(...ticked);
  notes.push(...conditionNotes(ticked));
  const fromConditions = totalModifiers([...conditionMods, ...foeMods]);
  const boons = (options.boon ? 1 : 0) + (paid.boon ? 1 : 0) + fromConditions.boons;
  const banes = (options.bane ? 1 : 0) + (paid.bane ? 1 : 0) + (automatic.encumberedBane ? 1 : 0) + fromConditions.banes;
  const diceRule = diceMode(boons, banes);
  const abilityScore = actor.system.abilities[test.ability];
  const chosenDr = Number(options.dr);
  const dr = modifiedDr(chosenDr, automatic.armourDr + fromConditions.dr - automatic.cover);
  const formula = `${diceFormula(diceRule)} + @ability`;
  const roll = await new Roll(formula, { ability: abilityScore }).evaluate();
  await useUpNextTest(actor);
  // "Next roll only" buffs are used up (GAPS 235).
  await useUpNextRollBuffs(actor, ["gloomTest", test.own ? "test" : "defence"]);
  // A mark for the foe's next attack only is used up (GAPS 223).
  if (foe?.type === "foe") await useUpNextAttackMarks(foe);

  const title = i18n.format("VARBORG.Gloom.TestTitle", { name: power.name });
  const formulas = {};
  for (const key of ["damage", "ruinDamage"]) {
    const text = String(system[key] ?? "").trim();
    formulas[key] = text ? { text, valid: isDamageFormula(text) } : null;
  }
  const inputs = {
    formula,
    rollData: { ability: abilityScore },
    diceRule, abilityScore, dr,
    own: test.own,
    formulas,
    // The damage rolled once for all targets (GAPS 141).
    shared,
    soakDie: soak?.die ?? "",
    // The ability's damage type, for resists (step 50b3b).
    damageType: system.damageType ?? "",
    conditions: { ...system.conditions },
    durations: foundry.utils.deepClone(system.durations ?? {}),
    outcomes: { ...system.outcomes },
    // "What it gives", given when Take is pressed (step 52c): persistent
    // damage, a buff with a timer, Ember lost.
    gives: foe ? outcomeInputs(foe, power) : null,
    context: {
      title,
      against: i18n.format("VARBORG.Defence.Against", { name: foe?.name ?? "", attack: power.name }),
      modeLabel: modeLabel(diceRule, boons, banes),
      ability: signed(abilityScore),
      abilityLabel: i18n.localize(`VARBORG.Ability.${test.ability}`),
      drNote: dr !== chosenDr ? i18n.format("VARBORG.Attack.DRFrom", { dr: chosenDr }) : null,
      notes: [testLabel(test), ...notes, paid.note].filter(Boolean),
      actorUuid: actor.uuid,
      agonyType: ""
    }
  };

  const data = newFortuneData(CARD.GLOOM, actor, inputs, { dice: diceOf(roll), damage: null, damageFormula: null, soak: null, lowered: [] });
  const { content: cardContent, rolls } = await settleGloomCard(actor, data);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content: cardContent,
    rolls: [roll, ...rolls],
    sound: CONFIG.sounds.dice,
    flags: fortuneFlags(data)
  });
}

/**
 * Work the gloom test card out from its stored inputs, dice and damage:
 * roll what is missing (new dice after a Fortune reroll, the damage for
 * this result, the soak die once), then show the result. Used for the
 * first card and after each Fortune use; registered with module/fortune.mjs.
 * @param {Actor} actor  The character.
 * @param {object} data  The card's Fortune data (changed in place).
 * @returns {Promise<{content: string, rolls: Roll[]}>} The new rolls.
 */
export async function settleGloomCard(actor, data) {
  const i18n = game.i18n;
  const { inputs, state } = data;
  const rolls = [];
  if (!state.dice) {
    const roll = await new Roll(inputs.formula, inputs.rollData).evaluate();
    rolls.push(roll);
    state.dice = diceOf(roll);
  }
  const result = resolveTest({ dice: state.dice.map(die => die.value), mode: inputs.diceRule, ability: inputs.abilityScore, dr: inputs.dr, flipped: Boolean(state.flipped) });
  const tier = fortuneTier(result.tier, state.softened);
  state.tier = tier;
  const outcome = gloomOutcome(tier, inputs.own);

  // The damage for this result. An own test's Failure and Ruin have
  // different dice, so a new result may need a new roll.
  let damage = null;
  const part = outcome.damage ? inputs.formulas[outcome.damage] : null;
  if (part && !part.valid) damage = { invalid: true, formula: part.text };
  else if (part) {
    if (state.damage === null || state.damageFormula !== part.text) {
      // The shared roll, unless Fortune asked for a new one.
      const sharedTotal = state.noShared ? undefined : inputs.shared?.[part.text];
      if (sharedTotal !== undefined) state.damage = sharedTotal;
      else {
        const damageRoll = await new Roll(part.text).evaluate();
        rolls.push(damageRoll);
        state.damage = damageRoll.total;
      }
      state.damageFormula = part.text;
    }
    if (state.soak === null) {
      state.soak = 0;
      if (inputs.soakDie) {
        const soakRoll = await new Roll(inputs.soakDie).evaluate();
        rolls.push(soakRoll);
        state.soak = soakRoll.total;
      }
    }
    const { before, taken: usual } = gloomDamageTaken(state.damage, outcome.multiplier, state.soak);
    // Resists by damage type, before armour (step 50b3b).
    const resist = await rollResists(actor, inputs.damageType ?? "", state.resist);
    state.resist = resist.kept;
    rolls.push(...resist.rolls);
    const { taken: resistedTaken, resisted } = takenWithResists(before, usual, state.soak, state.resist);
    // Feats that lower damage taken (step 50d), then Fortune.
    const taken = featLoweredDamage(resistedTaken, state.featLowered);
    const featLowered = resistedTaken - taken;
    const lowered = taken - lowerDamage(taken, state.lowered);
    // For a protector taking it instead (GAPS 229).
    state.lastBefore = before;
    damage = {
      formula: part.text,
      rolled: state.damage,
      doubled: outcome.multiplier === 2,
      halved: outcome.multiplier === 0.5,
      before,
      resistLines: resistLines(state.resist),
      soakDie: inputs.soakDie,
      soak: state.soak,
      featLowered,
      lowered,
      taken: state.intercepted ? 0 : taken - lowered,
      intercepted: state.intercepted ?? null,
      minimum: taken > 0 && taken > resisted - state.soak
    };
  }

  const condition = outcome.condition ? inputs.conditions[outcome.condition] || "" : "";
  const conditionName = condition ? i18n.localize(`VARBORG.Condition.${condition}`) : "";
  // Its timer, rolled when the condition is taken (module/timers.mjs).
  const duration = condition ? inputs.durations?.[outcome.condition] : null;
  const takeTimer = duration?.kind ? { kind: duration.kind, rounds: duration.kind === "rounds" ? duration.rounds : "" } : null;
  const durationText = takeTimer
    ? (takeTimer.kind === "rounds"
      ? i18n.format("VARBORG.Timer.ForRounds", { rounds: takeTimer.rounds })
      : i18n.localize(`VARBORG.Timer.Kind.${takeTimer.kind}`))
    : i18n.localize("VARBORG.Timer.Untimed");
  const dealt = damage && !damage.invalid ? damage.taken : 0;
  let takeLabel = null;
  if (dealt && condition) takeLabel = i18n.format("VARBORG.Gloom.TakeBoth", { damage: dealt, condition: conditionName });
  else if (dealt) takeLabel = i18n.format("VARBORG.Defence.TakeDamage", { damage: dealt });
  else if (condition) takeLabel = i18n.format("VARBORG.Gloom.Become", { condition: conditionName });
  // What Take also gives for this result (step 52c).
  const gives = gloomGivesText(inputs.gives, tier);
  if (gives.length && !takeLabel) takeLabel = i18n.localize("VARBORG.Gloom.TakeResult");

  const kind = inputs.own ? "own" : "defence";
  const content = await renderTemplate(CARD_TEMPLATE, {
    ...inputs.context,
    dice: state.dice,
    kept: result.kept,
    total: result.total,
    dr: inputs.dr,
    tier,
    tierLabel: i18n.localize(`VARBORG.Tier.${tier}`),
    outcomeText: inputs.outcomes[tier] || i18n.localize(`VARBORG.Gloom.Outcome.${kind}.${tier}`),
    naturalNote: naturalNote(result),
    damage,
    conditionNote: condition ? i18n.format("VARBORG.Gloom.ConditionNote", { condition: conditionName, time: durationText }) : null,
    takeTimer,
    takeLabel,
    takeDamage: dealt,
    takeCondition: condition,
    takeTier: gives.length ? tier : "",
    givesNote: gives.length ? i18n.format("VARBORG.Gloom.GivesNote", { list: gives.join("; ") }) : null,
    fortune: await fortuneSection(data, { tier, natural: result.natural, damage: Boolean(damage && !damage.invalid), taken: dealt })
  });
  return { content, rolls };
}

/**
 * The test buttons on a gloom ability's card. Hooked to
 * renderChatMessageHTML.
 */
export function addGloomCardListeners(message, html) {
  for (const button of html.querySelectorAll("button[data-action='gloomTest']")) {
    button.addEventListener("click", async () => {
      const power = await fromUuid(button.dataset.powerUuid);
      if (!power) {
        ui.notifications.warn(game.i18n.localize("VARBORG.Gloom.Gone"));
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
      let shared = null;
      try {
        shared = button.dataset.shared ? JSON.parse(button.dataset.shared) : null;
      } catch {
        shared = null;
      }
      await rollGloomTest(actor, power, { shared });
    });
  }
}

/** With no target named: the user's own character, or the selected token's. */
function ownCharacter() {
  if (game.user.character) return game.user.character;
  return canvas.tokens?.controlled.map(token => token.actor).find(actor => actor?.type === "character") ?? null;
}
