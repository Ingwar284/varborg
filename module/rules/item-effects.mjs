/**
 * Item effects (PLAN Milestone 9): what a feat, power, spell, relic, piece
 * of gear, class or ancestry does to the numbers, written as a list of
 * small effects on the item (`system.effects`), plus a note of how far the
 * item is automated (`system.automation`).
 *
 * This file knows nothing about Foundry. Items come in as plain objects:
 * { id, name, type, system: { effects, equipped?, destroyed? } }.
 *
 * Kinds of effect (stat, roll, reminder and hook are worked out so far;
 * the others arrive in their own steps):
 * - stat:     adds to, sets or puts a minimum on a sheet number (step 49b).
 * - roll:     Boon, Bane, a DR change or extra damage on one kind of roll,
 *             automatic or an optional tick in the dialog (steps 49c–49e).
 * - reminder: shows the item in one kind of roll's dialog (step 49c).
 * - hook:     does one thing at one moment of play (step 49f).
 * - use, choice: steps 49g–49h. immune, resist: step 52a.
 *
 * Rulings: GAPS 182, 188–192.
 */

import { ABILITIES, clampAbility } from "./abilities.mjs";
import { CONDITIONS } from "./conditions.mjs";
import { DAMAGE_TYPES } from "./equipment.mjs";

/** Every kind of effect, in the order the sheet offers them. */
export const EFFECT_KINDS = ["stat", "roll", "reminder", "hook", "use", "choice", "immune", "resist", "gift"];

/** The kinds the system works out so far; the sheet only offers these. */
export const BUILT_KINDS = ["stat", "roll", "reminder", "hook", "use", "choice", "resist", "gift", "immune"];

/**
 * The conditions the items' immune effects keep off (Incorruptible:
 * Charmed, step 50e). Foes use the same in step 52a.
 * @param {object[]} effects  From collectEffects.
 * @returns {Set<string>}
 */
export function immuneConditions(effects) {
  return new Set((effects ?? []).filter(effect => effect.kind === "immune" && effect.condition).map(effect => effect.condition));
}

/**
 * A gift effect (step 50b4): when the item lands on a character, the
 * compendium item named by `gift` (its UUID) is given too, once (the
 * Clan Heirloom relic, GAPS 201).
 */
export function isGiftUuid(text) {
  return /^Compendium\.[\w-]+\.[\w-]+\.Item\.\w{16}$/.test(String(text ?? ""));
}

/**
 * What a choice effect asks for when its item is dropped on a character
 * (step 49h): one of the character's weapons (Weapon specialist), a feat or
 * a spell from the compendiums, added to the character (Ancient One,
 * Magically Attuned), a Bestiary category (Favoured prey), a damage type,
 * or a word written down (a god).
 */
export const CHOICE_KINDS = ["weapon", "feat", "spell", "category", "damageType", "text"];

/**
 * Where a feat or spell choice comes from: any; an ancestry feat or power
 * of another ancestry; a class feat of another class; a spell the
 * character already knows (only written down); a random spell.
 */
export const CHOICE_FROM_ELEMENT = "element";
export const CHOICE_FROM = ["any", "otherAncestry", "otherClass", "known", "random", CHOICE_FROM_ELEMENT];

/** Only against foes of the item's chosen Bestiary category (Favoured prey). */
export const VERSUS = ["", "chosenCategory", "chosenDamageType", "persistent"];

/**
 * What a resist effect does to damage of its type (step 50b3b): half it
 * (rounded down), double it, reduce it by `amount` (Ancestral
 * Resonance: d6), or take none of it (Internal alchemy: poison, step 50d). The type is `damageType`, or the type picked by the
 * item's choice when `vs` is "chosenDamageType".
 */
export const RESIST_MODES = ["half", "double", "reduce", "immune"];

/**
 * The moments a hook effect can act at (step 49f):
 * turnStart: the start of the character's turn in combat.
 * initiative: when initiative is rolled (roll twice only).
 * zeroHp: when HP drops to 0 (before the wound or Death's Door).
 * wound: when a wound is gained (at 0 HP, from life force or Doomed).
 * deathsDoor: when rolling on the Death's Door table (roll twice only).
 * panicSuccess, panicFailure: after a Panic test.
 * rest: after any rest. longRest: after a Long Rest or Downtime.
 * newDay: at the start of each day.
 * death: when the character would die, for any reason (step 50a2).
 * agonyDeath: when a Table of Agony result would kill (Hard to Kill).
 * combatEnd: when a combat the character was in ends (Doomsworn).
 */
export const HOOK_EVENTS = [
  "turnStart", "initiative", "zeroHp", "wound", "deathsDoor",
  "panicSuccess", "panicFailure", "rest", "longRest", "newDay",
  "death", "agonyDeath", "combatEnd"
];

/**
 * What a hook does:
 * reminder: posts the item's note to chat.
 * heal: the character regains `amount` HP.
 * roll: rolls `amount` and posts it with the note (Unpredictable Reach).
 * gainEmber: adds `amount` to the Ember pool (in combat only).
 * addCondition: gives the character `condition`.
 * rollTwice: rolls twice and keeps the better, the worse, or lets the
 *   player choose (initiative and Death's Door only).
 * gainFortune: the character gains `amount` Fortune, even above what
 *   they began with. As "Remind only", a button for the Dark Master to
 *   press instead (Doomsworn, GAPS 196).
 * reprieve: Harkin's Reprieve (death only, GAPS 195). The character does
 *   not die: the scene fades to black, they wake d6 hours later with full
 *   HP and wounds at their maximum − 1, and the wake-up table is rolled.
 * deathsDoorInstead: Hard to Kill (agonyDeath only, GAPS 197). The
 *   character goes to Death's Door instead of dying.
 * steadyNerves: Steady nerves (panicFailure only, GAPS 197). The failed
 *   Panic card gets a button: the test counts as a Success and the
 *   character gains 1 Fatigued, instead of rolling on the Panic table.
 * ruinAsFailure: Dwarven Doughtiness (panicFailure only, step 50b2). A
 *   Ruin on a Panic test counts as a Failure: the table is rolled with
 *   1d10, not 2d10.
 */
export const HOOK_ACTIONS = [
  "reminder", "heal", "roll", "gainEmber", "addCondition", "rollTwice",
  "gainFortune", "reprieve", "deathsDoorInstead", "steadyNerves", "ruinAsFailure"
];

/**
 * What a Use effect does when the item's Use button is pressed (step 49g):
 * roll, heal, gainEmber and addCondition as for hooks. reroll: the item
 * offers a reroll button on its owner's test cards (like Fortune's) while
 * its use is not spent; `roll` names which cards.
 * success: a button on a failed card of that kind turns it into a Success
 *   (Human Ingenuity, GAPS 198).
 * chanceDie: rolls the Chance Die (Pack Rat, step 50b2).
 * gainFortune: gains `amount` Fortune (the Clan Heirloom, step 50b4).
 * upgradeCompanion: once, the character's minion or vehicle (`companion`)
 *   gets `armour` and its speeds change by `value` feet (Hawk-Iron
 *   Barding, Bolted Plate, step 50g).
 * healCompanion, hurtCompanion: the minion or vehicle regains or takes
 *   `amount` HP (Grease Monkey, Bottled Breath; armour does not reduce it).
 * takeDamage: the character takes `amount` damage that nothing reduces
 *   (Blood price, step 50f).
 * A reroll with `grant` "boon" rerolls with the dice one step better
 *   (Parry, step 50f).
 * lowerDamage: a button on defence and gloom cards with damage, taking
 *   `amount` off it; a hit still deals at least 1 (step 50d).
 * makeMinion: makes a Weak minion for the character, named by the
 *   player, once (Beast-Tamer, GAPS 201). With `amount` (d3), its tier
 *   is rolled (Chains of gratitude, step 50c).
 * switchOn: the item is on until the encounter ends; its "only while
 *   switched on" effects work (A good time, step 50c).
 * A reroll or success button can be limited to some cards with `requires`
 * (CARD_REQUIRES) and `ability`, and is offered once per card.
 */
export const USE_ACTIONS = ["roll", "heal", "gainEmber", "addCondition", "reroll", "success", "chanceDie", "gainFortune", "makeMinion", "switchOn", "lowerDamage", "takeDamage",
  "upgradeCompanion", "healCompanion", "hurtCompanion"];

/**
 * Which of the character's companions a companion action works on
 * (step 50g): a minion they own, or a vehicle they are aboard.
 */
export const COMPANIONS = ["minion", "vehicle"];

/** The armour dice a companion can be given ("" leaves it). */
export const COMPANION_ARMOUR = ["", "d2", "d4", "d6", "d8"];

/**
 * A vehicle's speeds after an upgrade: each lowered by `change` feet
 * (Bolted Plate: −10), never below 0.
 * @param {{safe: number, normal: number, fast: number}} speed
 */
export function changedSpeeds(speed, change) {
  const result = {};
  for (const [key, feet] of Object.entries(speed ?? {})) result[key] = Math.max(0, (feet ?? 0) + (change ?? 0));
  return result;
}

/**
 * The dice mode one step better, for a reroll "with Boon" (Parry, step
 * 50f): Bane becomes normal, normal becomes Boon.
 */
export function betterMode(mode) {
  return mode === "bane" ? "normal" : "boon";
}

/**
 * The traits the items' "chosen weapon" stat effects give one weapon item
 * (Fencing-hall form: Agile; Bigger sword: Heavy), step 50f.
 * @param {object[]} effects  From collectEffects.
 * @param {string} itemId     The weapon item.
 */
export function chosenWeaponTraits(effects, itemId) {
  const traits = {};
  for (const effect of effects ?? []) {
    if (effect.kind !== "stat" || effect.choices?.weapon !== itemId || !(Number(effect.value) > 0)) continue;
    if (effect.target === "chosenAgile") traits.agile = true;
    if (effect.target === "chosenHeavy") traits.heavy = true;
  }
  return traits;
}

/** The card actions an item can offer (steps 49g, 50b2, 50d). */
export const CARD_ACTIONS = ["reroll", "success", "lowerDamage"];

/**
 * Damage after feats lowered it by their rolls (Thickened dermis, Magical
 * calluses, step 50d): a hit still deals at least 1.
 * @param {number} taken     Damage after armour.
 * @param {number[]} rolls   The rolls of each feat.
 */
export function featLoweredDamage(taken, rolls = []) {
  if (!(taken > 0)) return 0;
  return Math.max(1, taken - (rolls ?? []).reduce((sum, value) => sum + value, 0));
}

/**
 * A minion's tier from a roll (Chains of gratitude: d3, 1 Pitiful, 2 Weak,
 * 3 Moderate). Without a roll: Weak.
 */
export function minionTierFor(roll) {
  return ["pitiful", "weak", "moderate"][Math.min(3, Math.max(1, roll ?? 2)) - 1];
}

/**
 * When a card button is offered (GAPS 198): always, on a Ruin (Whim of the
 * Fey), on a natural 1 (Fortune's Favourite), or on a Failure or Ruin
 * (Savage Strength, Human Ingenuity).
 */
export const CARD_REQUIRES = ["", "ruin", "natural1", "failed"];

/**
 * What happens when an item's reroll fails again (Failure or Ruin): its
 * note is added to the card (Savage Strength: unwanted attention), or the
 * note and a roll on the Shadowblight table (Whim of the Fey).
 */
export const FAIL_AGAIN = ["", "note", "shadowblight"];

/** Every action a hook or Use effect can have. */
export const ALL_ACTIONS = [...new Set([...HOOK_ACTIONS, ...USE_ACTIONS])];

/** The events where rolling twice means something. */
export const ROLL_TWICE_EVENTS = ["initiative", "deathsDoor"];

/** Actions that only work at some events. */
export const ACTION_EVENTS = {
  rollTwice: ROLL_TWICE_EVENTS,
  reprieve: ["death"],
  steadyNerves: ["panicFailure"],
  ruinAsFailure: ["panicFailure"],
  deathsDoorInstead: ["agonyDeath"]
};

/** Which of two rolls to keep. On both tables higher is better. */
export const KEEPS = ["better", "worse", "choose"];

/** Only while…: blank for always, halfHp for at half HP or lower (Regenerative Marrow). */
export const HOOK_REQUIRES = ["", "halfHp"];

/**
 * Only while…, for roll and reminder effects: blank for always, noCombat
 * for while no combat is running ("Boon on non-combat tests", GAPS 194),
 * itemOn while the item is switched on with its Use button until the
 * encounter ends (A good time, step 50c).
 */
export const ROLL_REQUIRES = ["", "noCombat", "itemOn"];

/**
 * How far an item is automated. Blank means nobody has looked yet.
 * auto: all of it works by itself. partial: some of it, the rest is text.
 * text: nothing for the computer to do (story, or the Dark Master's call).
 * ruling: waiting for a designer's ruling.
 */
export const AUTOMATION = ["", "auto", "partial", "text", "ruling"];

/**
 * The sheet numbers a stat effect can change.
 * soak: the armour soak tier (1–4) of natural armour (GAPS 188).
 * defenceDr: the DR to defend (Fey-World Glimmer −2, GAPS 189).
 * rangedDefenceDr: the starting DR to defend against ranged attacks
 * (Afterimage sets 10, GAPS 189).
 * fortuneDie: the die of starting Fortune and of Fortune regained after a
 * Long Rest, normally 3 (Doomsworn sets 2, step 50a2).
 * unarmedDie: the die of unarmed damage, normally 2 (Brawler sets 4).
 * rangePercent: added to the Ranged and Thrown distances of weapons, in
 * per cent (Long shot +50, GAPS 191), rounded down to 5'.
 * reloadActions: added to the Interact actions a Reload weapon needs, never
 * below 1 (Quick reload −1).
 * armourAgilityMax: set, the most DR worn armour adds to Agility tests
 * (Armoured Paragon 2, step 50b2).
 * heavyDefenceIgnored: set 1, heavy (t3) armour adds no DR to defence
 * (Armoured Paragon).
 * soakPerWound: set, natural armour of one tier per wound carried, up to
 * this tier (Scar tissue 3: −d2, −d4, −d6, step 50f).
 * noDuressBane: set 1, no Bane on spellcasting under duress (Born to it).
 * frightenedAttackIgnored: set 1, Frightened gives no Bane on attacks
 * (Unbroken).
 * shieldRaiseFree: set 1, raising a shield is a free action (Shield expert).
 * vehicleCrashHalf: set 1, the vehicle this character drives takes half
 * the collision damage when it crashes (Ram-Plough, step 50g).
 * chosenAgile, chosenHeavy: set 1, the weapon picked by the item's choice
 * has the Agile or Heavy trait (Fencing-hall form, Bigger sword).
 * wornSoakTier: added to worn armour's tier when it soaks, up to t4
 * (Armour of faith, GAPS 188, step 50e).
 * spellArmourMaxTier: set, metal armour up to this original tier gives no
 * Bane on spellcasting (Blessed plate 3, step 50e).
 * soakNoArmour: natural armour's soak tier while no armour is worn
 * (Barkskin t2, GAPS 188, step 50d).
 * twoHandedVersatile: set 1, two-handed weapons are versatile and can be
 * held in one hand (Titan's grip, step 50c).
 * chanceSplit: set, the Chance Die has no Neutral: below this Negative
 * ("worst possible outcome"), this or more Positive (Go Big or Go Home 8).
 */
export const STAT_TARGETS = [
  "hpMax", "woundsMax", "carryLimit", "movement", "minionLimit", "initiative",
  ...ABILITIES, "soak", "defenceDr", "rangedDefenceDr", "fortuneDie",
  "unarmedDie", "rangePercent", "reloadActions",
  "armourAgilityMax", "heavyDefenceIgnored", "chanceSplit", "twoHandedVersatile", "soakNoArmour",
  "wornSoakTier", "spellArmourMaxTier", "soakPerWound", "noDuressBane", "frightenedAttackIgnored",
  "shieldRaiseFree", "chosenAgile", "chosenHeavy", "vehicleCrashHalf"
];

/** Unarmed damage without effects: "Unarmed d2" (rules 4.1). */
export const UNARMED_DIE = 2;

/** The unarmed damage die after effects, such as "d4" (Brawler). */
export function unarmedDamage(bonus) {
  return `d${Math.max(1, withStat(UNARMED_DIE, bonus))}`;
}

/**
 * A weapon distance after rangePercent effects, rounded down to 5'
 * (Long shot: 120' becomes 180'). 0 (no such distance) stays 0.
 */
export function longerRange(feet, bonus) {
  if (!(feet > 0) || !bonus) return feet ?? 0;
  const percent = withStat(0, bonus);
  return Math.max(5, Math.floor((feet * (100 + percent)) / 100 / 5) * 5);
}

/** Interact actions to reload after effects, never below 1 (0: no Reload). */
export function reloadActions(reload, bonus) {
  if (!(reload > 0)) return 0;
  return Math.max(1, withStat(reload, bonus));
}

/**
 * A weapon's numbers after the wielder's stat effects (step 50a3): a copy
 * with the unarmed die, the Ranged and Thrown distances and the Reload
 * actions changed. The stored weapon is not changed.
 * @param {object} weapon    A weapon's system data.
 * @param {object} [bonuses] The wielder's statBonuses.
 * @param {boolean} [unarmed] The weapon is the Unarmed weapon.
 */
export function withWeaponStats(weapon, bonuses = {}, unarmed = false) {
  const result = { ...weapon };
  if (unarmed && bonuses?.unarmedDie) result.damage = unarmedDamage(bonuses.unarmedDie);
  if (bonuses?.rangePercent) {
    result.ranged = longerRange(weapon.ranged, bonuses.rangePercent);
    result.thrown = longerRange(weapon.thrown, bonuses.rangePercent);
  }
  if (bonuses?.reloadActions) result.reload = reloadActions(weapon.reload, bonuses.reloadActions);
  if (bonuses?.twoHandedVersatile?.set > 0 && weapon.twoHanded) {
    result.twoHanded = false;
    result.versatile = true;
  }
  return result;
}

/** The Fortune die without effects: "Everyone has d3 Fortune" (rules 3.9). */
export const FORTUNE_DIE = 3;

/**
 * The formula for starting or regained Fortune, such as "1d3".
 * @param {object} [bonus]  The fortuneDie entry of statBonuses.
 */
export function fortuneFormula(bonus) {
  return `1d${Math.max(1, withStat(FORTUNE_DIE, bonus))}`;
}

/**
 * add: + value. set: becomes value. min: never below value.
 * times: multiplied by value (Carry-all: twice your Toughness, step 50a).
 */
export const STAT_OPS = ["add", "set", "min", "times"];

/** The kinds of roll a roll or reminder effect can apply to. */
export const ROLL_KINDS = [
  "test", "attack", "defence", "spell", "power", "panic", "contest",
  "gloomTest", "driving", "morale"
];

/** What a roll effect gives: nothing (only a DR or damage), Boon or Bane. */
export const GRANTS = ["", "boon", "bane"];

/** auto: always applied. optional: an unticked box in the dialog (designer's choice, Milestone 9). */
export const ROLL_MODES = ["auto", "optional"];

/**
 * Only with this kind of weapon (step 49e): the way it attacks (melee,
 * shoot, throw) or one of its traits. Blank means any, or no weapon.
 */
export const WEAPON_TAGS = ["", "melee", "shoot", "throw", "heavy", "finesse", "twoHanded", "versatile", "agile", "chosen"];

/**
 * Extra damage once, once per wound the character has (Battle Scars, step
 * 49e), or once per foe the character killed in this combat (Bloodlust,
 * step 50c). `value` above 0 is the most that count.
 */
export const DAMAGE_PER = ["", "wound", "kill"];

/** A blank effect, as the sheet's Add button makes it. */
export function blankEffect(kind = "stat") {
  return {
    kind,
    target: STAT_TARGETS[0], op: "add", value: 0,
    roll: ROLL_KINDS[0], ability: "", against: "", weapon: "", vs: "", damageType: "", mode: "auto", grant: "", dr: 0, damage: "", per: "", rerollOnes: false,
    choose: CHOICE_KINDS[0], from: "any", chosen: "", chosenName: "",
    event: HOOK_EVENTS[0], action: HOOK_ACTIONS[0], amount: "", condition: "", keep: "better", requires: "", failAgain: "",
    resist: "half", gift: "", setDamage: "", companion: "minion", armour: "",
    note: ""
  };
}

/** A damage part an effect can add: a number such as 2, or dice such as d4 or 2d6. */
export function isDamagePart(text) {
  return /^(\d+|\d*d\d+)$/.test(String(text ?? "").trim());
}

/**
 * The tags of a weapon used in an attack, for weapon filters: the way it
 * attacks and its flag traits.
 * @param {object} weapon  The weapon's system data.
 * @param {string} mode    "melee", "shoot" or "throw".
 */
export function weaponTags(weapon, mode) {
  return [mode, ...WEAPON_TAGS.filter(tag => tag && tag !== mode && weapon?.[tag] === true)];
}

/**
 * The extra damage an effect adds, after "per wound": "" for none.
 * Dice repeat once per wound ("d4 + d4"), numbers multiply.
 * @param {object} facts  { wounds }: the character's facts.
 */
export function effectDamage(effect, facts = {}) {
  const part = String(effect.damage ?? "").trim();
  if (!isDamagePart(part)) return "";
  if (!["wound", "kill"].includes(effect.per)) return part;
  // value, when above 0, is the most that count (Battle Scars: up to +3).
  const wounds = Math.max(0, Math.trunc((effect.per === "kill" ? facts.kills : facts.wounds) ?? 0));
  const count = Number(effect.value) > 0 ? Math.min(wounds, Number(effect.value)) : wounds;
  if (!count) return "";
  if (/^\d+$/.test(part)) return String(Number(part) * count);
  return Array(count).fill(part).join(" + ");
}

/**
 * A damage formula with the extra damage of some modifiers added on, such
 * as "d8 + 2". Modifiers without damage are skipped.
 */
export function withExtraDamage(formula, mods) {
  const extra = (mods ?? []).map(mod => mod.damage).filter(Boolean);
  const base = (mods ?? []).some(mod => mod.rerollOnes) ? rerollingOnes(formula) : formula;
  return [base, ...extra].filter(Boolean).join(" + ");
}

/**
 * A damage formula whose dice are rolled again once when they show 1
 * (Hawkeye, step 50b): "d8" becomes "1d8r1". Only the weapon's own dice.
 */
export function rerollingOnes(formula) {
  return String(formula ?? "").replace(/(^|[^\w])(\d*)d(\d+)(?![\dr])/g, (_, before, count, faces) => `${before}${count || 1}d${faces}r1`);
}

/**
 * Whether an item's effects work right now. Weapons, armour and shields
 * only while equipped; a destroyed relic or shield never. Everything else
 * (feats, a class, carried gear) always.
 */
export function isActive(item) {
  const system = item.system ?? {};
  if (system.destroyed) return false;
  if ("equipped" in system && !system.equipped) return false;
  return true;
}

/**
 * Every working effect of a list of items, each marked with where it came
 * from: { ...effect, item: name, itemId, index }.
 * @param {object[]} items  Plain items (see the top of this file).
 */
export function collectEffects(items) {
  const found = [];
  for (const item of items ?? []) {
    if (!isActive(item)) continue;
    (item.system?.effects ?? []).forEach((effect, index) => {
      // The item's limited use (once per day…), for hooks (step 49f).
      found.push({
        ...effect, item: item.name, itemId: item.id ?? "", index,
        frequency: item.system?.frequency ?? "", used: Boolean(item.system?.frequencyUsed),
        // Switched on, for this combat (or "" outside combat) (step 50c).
        on: item.flags?.["var-borg"]?.on,
        // What the item's choice effects hold, for "the chosen weapon" and so on (step 49h).
        choices: choicesOf(item.system?.effects)
      });
    });
  }
  return found;
}

/** The key that names one effect, for an optional tick: "itemId.index". */
export function effectKey(effect) {
  return `${effect.itemId}.${effect.index}`;
}

/**
 * What the stat effects do to each sheet number.
 * @returns {object} By target: { add, set, min, times, sources: [{item, op, value}] }.
 *   set is null when nothing sets the number; min is null when nothing
 *   puts a floor under it. Several sets: the highest counts. times is 1
 *   when nothing multiplies it; several multiply together.
 */
export function statBonuses(effects) {
  const bonuses = {};
  for (const effect of effects ?? []) {
    if (effect.kind !== "stat" || !STAT_TARGETS.includes(effect.target)) continue;
    const value = Number(effect.value) || 0;
    const bonus = bonuses[effect.target] ??= { add: 0, set: null, min: null, times: 1, sources: [] };
    if (effect.op === "set") bonus.set = bonus.set === null ? value : Math.max(bonus.set, value);
    else if (effect.op === "times") bonus.times *= value;
    else if (effect.op === "min") bonus.min = bonus.min === null ? value : Math.max(bonus.min, value);
    else bonus.add += value;
    bonus.sources.push({ item: effect.item, op: effect.op ?? "add", value });
  }
  return bonuses;
}

/**
 * A sheet number after its stat effects: set first, then times, then add,
 * then the minimum.
 * @param {number} value  The number without effects.
 * @param {object} [bonus]  One entry of statBonuses.
 */
export function withStat(value, bonus) {
  if (!bonus) return value;
  let result = bonus.set ?? value;
  result *= bonus.times ?? 1;
  result += bonus.add;
  if (bonus.min !== null) result = Math.max(result, bonus.min);
  return result;
}

/**
 * The abilities in use after stat effects, each kept within −3 … +6.
 * @param {object} abilities  { strength, agility, … } before effects.
 * @param {object} bonuses    From statBonuses.
 */
export function withAbilityBonuses(abilities, bonuses) {
  const result = { ...abilities };
  for (const ability of ABILITIES) {
    if (bonuses?.[ability] && Number.isInteger(result[ability])) result[ability] = clampAbility(withStat(result[ability], bonuses[ability]));
  }
  return result;
}

/**
 * Whether a roll or reminder effect fits a roll.
 * @param {object} context  { roll, ability?, against?, weapon?, facts? }:
 *   the kind of roll, the ability tested, the condition the roll resists
 *   (for "Boon on tests to resist being Charmed"), the weapon's tags
 *   (weaponTags) and the character's facts ({ wounds }, for per wound;
 *   { inCombat }, for effects only outside combat).
 *   roll and against can be lists: a Panic test is both an ability test
 *   and a Panic test; a gloom ability can give several conditions. An
 *   effect with a weapon filter only fits a roll with that weapon tag.
 */
export function fitsRoll(effect, context) {
  if (![context.roll].flat().includes(effect.roll)) return false;
  if (effect.ability && effect.ability !== context.ability) return false;
  if (effect.against && ![context.against].flat().includes(effect.against)) return false;
  if (effect.weapon === "chosen") {
    // The weapon picked by the item's choice (step 49h).
    if (!effect.choices?.weapon || effect.choices.weapon !== context.weaponId) return false;
  } else if (effect.weapon && !(context.weapon ?? []).includes(effect.weapon)) return false;
  if (effect.requires === "noCombat" && context.facts?.inCombat) return false;
  if (effect.requires === "itemOn" && (effect.on === undefined || effect.on === null || effect.on !== (context.facts?.combatId ?? ""))) return false;
  // Only with damage of this type, such as fire (Firebug, step 50b3).
  if (effect.damageType && effect.damageType !== context.damageType) return false;
  if (effect.vs === "chosenCategory" && (!effect.choices?.category || effect.choices.category !== context.targetCategory)) return false;
  return true;
}

/**
 * Only the modifiers that change the test itself (Boon, Bane or DR), for
 * a roll's modifier list. Extra damage is dealt with apart (step 49e).
 */
export function testOnly(mods) {
  return (mods ?? []).filter(mod => mod.boon || mod.bane || mod.dr);
}

/**
 * The modifiers that do something: Boon, Bane, a DR change or extra damage
 * (step 49e). Extra damage only counts where the roll deals damage
 * (attacks, powers, spells); elsewhere it is ignored.
 */
export function withEffect(mods) {
  return (mods ?? []).filter(mod => mod.boon || mod.bane || mod.dr || mod.damage || mod.rerollOnes || mod.setDamage);
}

/**
 * The roll effects and reminders that fit a roll, split into those applied
 * by themselves, those offered as optional ticks, and reminders. Each
 * modifier has the same shape as a condition modifier (see
 * conditions.mjs), so totalModifiers can add them up:
 * { item, itemId, index, boon?, bane?, dr?, damage?, note }.
 * @param {object[]} effects  From collectEffects.
 * @param {object} context    See fitsRoll.
 * @returns {{auto: object[], optional: object[], reminders: object[]}}
 */
export function rollEffects(effects, context) {
  const result = { auto: [], optional: [], reminders: [] };
  for (const effect of effects ?? []) {
    if (!["roll", "reminder"].includes(effect.kind) || !fitsRoll(effect, context)) continue;
    const source = { item: effect.item, itemId: effect.itemId, index: effect.index, note: effect.note ?? "" };
    if (effect.kind === "reminder") {
      result.reminders.push(source);
      continue;
    }
    const mod = { ...source };
    if (effect.grant === "boon") mod.boon = true;
    if (effect.grant === "bane") mod.bane = true;
    if (Number(effect.dr)) mod.dr = Number(effect.dr);
    const damage = effectDamage(effect, context.facts);
    if (damage) mod.damage = damage;
    if (effect.rerollOnes) mod.rerollOnes = true;
    if (effect.setDamage) mod.setDamage = effect.setDamage;
    (effect.mode === "optional" ? result.optional : result.auto).push(mod);
  }
  return result;
}

/**
 * The problems with one effect, for the content tests: an unknown kind or
 * a value outside its list. An empty list means it is fine.
 */
export function effectProblems(effect) {
  const problems = [];
  const check = (field, list) => {
    if (!list.includes(effect[field])) problems.push(`${field}: ${effect[field]}`);
  };
  check("kind", EFFECT_KINDS);
  if (effect.kind === "stat") {
    check("target", STAT_TARGETS);
    check("op", STAT_OPS);
  }
  if (effect.kind === "roll" || effect.kind === "reminder") {
    check("roll", ROLL_KINDS);
    if (effect.ability) check("ability", ABILITIES);
    if (effect.against) check("against", CONDITIONS);
    check("requires", ROLL_REQUIRES);
  }
  if (effect.kind === "hook") {
    check("event", HOOK_EVENTS);
    check("action", HOOK_ACTIONS);
    check("mode", ROLL_MODES);
    check("requires", HOOK_REQUIRES);
    if (["heal", "roll", "gainEmber", "gainFortune", "lowerDamage", "takeDamage", "healCompanion", "hurtCompanion"].includes(effect.action) && !isDamagePart(effect.amount)) problems.push(`amount: ${effect.amount}`);
    if (["upgradeCompanion", "healCompanion", "hurtCompanion"].includes(effect.action)) check("companion", COMPANIONS);
    if (effect.action === "upgradeCompanion") check("armour", COMPANION_ARMOUR);
    if (effect.action === "addCondition") check("condition", CONDITIONS);
    if (effect.action === "rollTwice") check("keep", KEEPS);
    const events = ACTION_EVENTS[effect.action];
    if (events && !events.includes(effect.event)) problems.push(`${effect.action} at ${effect.event}`);
  }
  if (effect.kind === "gift" && !isGiftUuid(effect.gift)) problems.push(`gift: ${effect.gift}`);
  if (effect.kind === "immune") check("condition", CONDITIONS);
  if (effect.kind === "resist") {
    check("resist", RESIST_MODES);
    if (effect.damageType) check("damageType", DAMAGE_TYPES);
    else if (!["chosenDamageType", "persistent"].includes(effect.vs)) problems.push("resist: no damage type");
    if (effect.resist === "reduce" && !isDamagePart(effect.amount)) problems.push(`amount: ${effect.amount}`);
  }
  if (effect.kind === "choice") {
    check("choose", CHOICE_KINDS);
    check("from", CHOICE_FROM);
  }
  if (effect.kind === "use") {
    check("action", USE_ACTIONS);
    if (["heal", "roll", "gainEmber", "gainFortune", "lowerDamage", "takeDamage", "healCompanion", "hurtCompanion"].includes(effect.action) && !isDamagePart(effect.amount)) problems.push(`amount: ${effect.amount}`);
    if (["upgradeCompanion", "healCompanion", "hurtCompanion"].includes(effect.action)) check("companion", COMPANIONS);
    if (effect.action === "upgradeCompanion") check("armour", COMPANION_ARMOUR);
    if (effect.action === "addCondition") check("condition", CONDITIONS);
    if (CARD_ACTIONS.includes(effect.action)) {
      check("roll", ROLL_KINDS);
      if (effect.requires) check("requires", CARD_REQUIRES);
      if (effect.failAgain) check("failAgain", FAIL_AGAIN);
      if (effect.ability) check("ability", ABILITIES);
    }
  }
  if (effect.kind === "roll") {
    check("mode", ROLL_MODES);
    check("grant", GRANTS);
    check("weapon", WEAPON_TAGS);
    check("vs", VERSUS);
    check("per", DAMAGE_PER);
    if (effect.damageType) check("damageType", DAMAGE_TYPES);
    if (effect.damage && !isDamagePart(effect.damage)) problems.push(`damage: ${effect.damage}`);
    if (effect.setDamage && !isDamagePart(effect.setDamage)) problems.push(`setDamage: ${effect.setDamage}`);
  }
  return problems;
}

/**
 * The added amounts of one sheet number as DR modifiers for a roll's list,
 * one per item, such as { item: "Fey-World Glimmer", dr: -2 } for the
 * defence DR (GAPS 189). Sets and minimums are left out.
 * @param {object} [bonus]  One entry of statBonuses.
 */
export function statDrMods(bonus) {
  return (bonus?.sources ?? [])
    .filter(source => source.op === "add" && source.value)
    .map(source => ({ item: source.item, note: "", dr: source.value }));
}

/**
 * The hook effects that act at an event (step 49f). An item whose limited
 * use is spent (once per day and so on) does not act until it comes back.
 * @param {object[]} effects  From collectEffects.
 * @param {string} event      One of HOOK_EVENTS.
 * @param {object} [facts]    { hp, hpMax }: for "only while at half HP".
 */
export function hookEffects(effects, event, facts = {}) {
  return (effects ?? []).filter(effect => {
    if (effect.kind !== "hook" || effect.event !== event) return false;
    if (effect.frequency && effect.used) return false;
    if (effect.requires === "halfHp" && !(facts.hpMax > 0 && facts.hp <= facts.hpMax / 2)) return false;
    return true;
  });
}

/**
 * Which roll to keep when hooks say to roll twice (GAPS 192): "better",
 * "worse" or "choose", or null to roll once. A better or a choice together
 * with a worse cancel out, like Boon and Bane. Choosing beats keeping the
 * better. Only automatic hooks count.
 * @param {object[]} hooks  From hookEffects, for one event.
 */
export function rollTwiceKeep(hooks) {
  const keeps = (hooks ?? []).filter(hook => hook.action === "rollTwice" && hook.mode !== "optional").map(hook => hook.keep);
  const good = keeps.filter(keep => keep === "better" || keep === "choose");
  const bad = keeps.filter(keep => keep === "worse");
  if (good.length && bad.length) return null;
  if (keeps.includes("choose")) return "choose";
  if (good.length) return "better";
  if (bad.length) return "worse";
  return null;
}

/**
 * The roll kept of two, for "better" or "worse" (higher is better).
 * "choose" is the player's: this returns null for it.
 */
export function keptRoll(first, second, keep) {
  if (keep === "better") return Math.max(first, second);
  if (keep === "worse") return Math.min(first, second);
  return null;
}

/**
 * The Use effects of a list of effects that do something when the Use
 * button is pressed (everything but reroll), step 49g.
 */
export function useEffects(effects) {
  return (effects ?? []).filter(effect => effect.kind === "use" && effect.action !== "reroll");
}

/**
 * The items that offer a reroll on a card of this kind of roll (step 49g):
 * their Use effect is reroll, the roll fits, and their limited use is not
 * spent. One per item.
 * @param {object[]} effects  From collectEffects.
 * @param {string} rollKind   The card's roll: "test", "attack", "defence", "gloomTest", "power" or "spell".
 * @returns {Array<{item: string, itemId: string}>}
 */
export function rerollItems(effects, rollKind) {
  const found = new Map();
  for (const effect of effects ?? []) {
    if (effect.kind !== "use" || effect.action !== "reroll" || effect.roll !== rollKind) continue;
    if (effect.frequency && effect.used) continue;
    if (!found.has(effect.itemId)) found.set(effect.itemId, { item: effect.item, itemId: effect.itemId });
  }
  return [...found.values()];
}

/**
 * The resist effects that work on damage of one type (step 50b3b).
 * @param {object[]} effects     From collectEffects.
 * @param {string} damageType    The damage's type; blank: none work.
 */
export function resistsFor(effects, damageType, { persistent = false } = {}) {
  return (effects ?? []).filter(effect => {
    if (effect.kind !== "resist") return false;
    // Persistent damage of any type (Chastisement, step 50e).
    if (effect.vs === "persistent") return persistent;
    if (!damageType) return false;
    return effect.damageType
      ? effect.damageType === damageType
      : effect.vs === "chosenDamageType" && effect.choices?.damageType === damageType;
  });
}

/**
 * Damage after resist effects: halves first (rounded down), then doubles,
 * then the rolled reductions. Never below 0.
 * @param {number} damage
 * @param {object[]} resists      From resistsFor, or { resist } entries.
 * @param {number[]} [reductions] The rolls of the "reduce" effects.
 */
export function resistedDamage(damage, resists, reductions = []) {
  let result = damage;
  if ((resists ?? []).some(effect => effect.resist === "immune")) return 0;
  for (const effect of resists ?? []) if (effect.resist === "half") result = Math.floor(result / 2);
  for (const effect of resists ?? []) if (effect.resist === "double") result *= 2;
  result -= (reductions ?? []).reduce((sum, value) => sum + value, 0);
  return Math.max(0, result);
}

/**
 * The feat buttons a card offers (step 50b2, GAPS 198): items with a
 * reroll or success Use effect for this kind of roll, whose use is not
 * spent, that fit the card and were not used on it yet. A success button
 * needs a Failure or Ruin.
 * @param {object[]} effects  From collectEffects.
 * @param {string} rollKind   The card's roll kind ("test", "attack", …).
 * @param {object} [card]     { tier, natural, ability, used: itemIds used on this card }.
 * @returns {{item: string, itemId: string, action: string, failAgain: string, note: string}[]}
 */
export function cardButtons(effects, rollKind, card = {}) {
  const failed = ["failure", "ruin"].includes(card.tier);
  const found = new Map();
  for (const effect of effects ?? []) {
    if (effect.kind !== "use" || !CARD_ACTIONS.includes(effect.action) || effect.roll !== rollKind) continue;
    if (effect.action === "lowerDamage" && !(card.taken > 1)) continue;
    if (effect.frequency && effect.used) continue;
    if ((card.used ?? []).includes(effect.itemId)) continue;
    if (effect.ability && effect.ability !== card.ability) continue;
    if (effect.requires === "ruin" && card.tier !== "ruin") continue;
    if (effect.requires === "natural1" && card.natural !== 1) continue;
    if (effect.requires === "failed" && !failed) continue;
    if (effect.action === "success" && !failed) continue;
    const key = `${effect.itemId}:${effect.action}`;
    if (!found.has(key)) {
      found.set(key, { item: effect.item, itemId: effect.itemId, action: effect.action, failAgain: effect.failAgain ?? "", note: effect.note ?? "", amount: effect.amount ?? "" });
    }
  }
  return [...found.values()];
}

/**
 * The Chance Die's outcome with Go Big or Go Home (step 50b2): no
 * Neutral, Positive from `split` up. Without a split, the usual one.
 * @param {number} total
 * @param {object} [bonus]  The chanceSplit entry of statBonuses.
 * @param {Function} usual  The usual outcome (chanceOutcome).
 */
export function chanceWithSplit(total, bonus, usual) {
  const split = bonus?.set;
  if (!(split > 0)) return usual(total);
  return total >= split ? "positive" : "negative";
}

/**
 * The DR worn armour adds to an Agility test after Armoured Paragon.
 * @param {number} dr       The armour's usual Agility DR.
 * @param {object} [bonus]  The armourAgilityMax entry of statBonuses.
 */
export function cappedArmourDr(dr, bonus) {
  const cap = bonus?.set;
  return cap === null || cap === undefined ? dr : Math.min(dr, cap);
}

/**
 * What an item's choice effects hold, by kind: { weapon: itemId,
 * category: "beast", damageType, feat, spell, text }. The first choice of
 * each kind counts; unmade choices are left out (step 49h).
 * @param {object[]} effects  The item's own effects (system.effects).
 */
export function choicesOf(effects) {
  const choices = {};
  for (const effect of effects ?? []) {
    if (effect.kind === "choice" && effect.chosen && !(effect.choose in choices)) choices[effect.choose] = effect.chosen;
  }
  return choices;
}

/**
 * The feats or spells a choice may pick from, sorted by name (step 49h).
 * @param {object[]} entries  Plain items: { id, name, type, system: { source, belongsTo, cost, ritual } }.
 * @param {object} choice     The choice effect: { choose, from, value } (value: the highest
 *   ember cost of a spell, 0 for any).
 * @param {object} owner      { ancestry, className }: the character's, by name.
 */
export function choiceCandidates(entries, choice, owner = {}) {
  const fits = entry => {
    const system = entry.system ?? {};
    if (choice.choose === "spell") {
      if (entry.type !== "spell" || system.ritual) return false;
      return !(choice.value > 0) || (system.cost ?? 0) <= choice.value;
    }
    if (choice.choose !== "feat") return false;
    if (choice.from === "otherAncestry") {
      return ["feat", "power"].includes(entry.type) && system.source === "ancestry" && system.belongsTo !== (owner.ancestry ?? "");
    }
    if (choice.from === "otherClass") {
      return entry.type === "feat" && system.source === "class" && system.belongsTo !== (owner.className ?? "");
    }
    return entry.type === "feat" && ["ancestry", "class", "general"].includes(system.source);
  };
  return (entries ?? []).filter(fits).toSorted((a, b) => a.name.localeCompare(b.name));
}
