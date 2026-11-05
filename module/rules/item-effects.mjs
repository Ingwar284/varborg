/**
 * Item effects (PLAN Milestone 9): what a feat, power, spell, relic, piece
 * of gear, class or ancestry does to the numbers, written as a list of
 * small effects on the item (`system.effects`), plus a note of how far the
 * item is automated (`system.automation`).
 *
 * This file knows nothing about Foundry. Items come in as plain objects:
 * { id, name, type, system: { effects, equipped?, destroyed? } }.
 *
 * Kinds of effect (only stat, roll and reminder are worked out so far; the
 * others arrive in their own steps):
 * - stat:     adds to, sets or puts a minimum on a sheet number (step 49b).
 * - roll:     Boon, Bane, a DR change or extra damage on one kind of roll,
 *             automatic or an optional tick in the dialog (steps 49c–49e).
 * - reminder: shows the item in one kind of roll's dialog (step 49c).
 * - hook, use, choice: steps 49f–49h. immune, resist: step 52a.
 *
 * Rulings: GAPS 182, 188–191.
 */

import { ABILITIES, clampAbility } from "./abilities.mjs";
import { CONDITIONS } from "./conditions.mjs";

/** Every kind of effect, in the order the sheet offers them. */
export const EFFECT_KINDS = ["stat", "roll", "reminder", "hook", "use", "choice", "immune", "resist"];

/** The kinds the system works out so far; the sheet only offers these. */
export const BUILT_KINDS = ["stat", "roll", "reminder"];

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
 */
export const STAT_TARGETS = [
  "hpMax", "woundsMax", "carryLimit", "movement", "minionLimit", "initiative",
  ...ABILITIES, "soak", "defenceDr", "rangedDefenceDr"
];

/** add: + value. set: becomes value. min: never below value. */
export const STAT_OPS = ["add", "set", "min"];

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
export const WEAPON_TAGS = ["", "melee", "shoot", "throw", "heavy", "finesse", "twoHanded", "versatile", "agile"];

/** Extra damage once, or once per wound the character has (Battle Scars, step 49e). */
export const DAMAGE_PER = ["", "wound"];

/** A blank effect, as the sheet's Add button makes it. */
export function blankEffect(kind = "stat") {
  return {
    kind,
    target: STAT_TARGETS[0], op: "add", value: 0,
    roll: ROLL_KINDS[0], ability: "", against: "", weapon: "", mode: "auto", grant: "", dr: 0, damage: "", per: "",
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
  if (effect.per !== "wound") return part;
  const count = Math.max(0, Math.trunc(facts.wounds ?? 0));
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
  return [formula, ...extra].filter(Boolean).join(" + ");
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
      found.push({ ...effect, item: item.name, itemId: item.id ?? "", index });
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
 * @returns {object} By target: { add, set, min, sources: [{item, op, value}] }.
 *   set is null when nothing sets the number; min is null when nothing
 *   puts a floor under it. Several sets: the highest counts.
 */
export function statBonuses(effects) {
  const bonuses = {};
  for (const effect of effects ?? []) {
    if (effect.kind !== "stat" || !STAT_TARGETS.includes(effect.target)) continue;
    const value = Number(effect.value) || 0;
    const bonus = bonuses[effect.target] ??= { add: 0, set: null, min: null, sources: [] };
    if (effect.op === "set") bonus.set = bonus.set === null ? value : Math.max(bonus.set, value);
    else if (effect.op === "min") bonus.min = bonus.min === null ? value : Math.max(bonus.min, value);
    else bonus.add += value;
    bonus.sources.push({ item: effect.item, op: effect.op ?? "add", value });
  }
  return bonuses;
}

/**
 * A sheet number after its stat effects: set first, then add, then the
 * minimum.
 * @param {number} value  The number without effects.
 * @param {object} [bonus]  One entry of statBonuses.
 */
export function withStat(value, bonus) {
  if (!bonus) return value;
  let result = bonus.set ?? value;
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
 *   (weaponTags) and the character's facts ({ wounds }, for per wound).
 *   roll and against can be lists: a Panic test is both an ability test
 *   and a Panic test; a gloom ability can give several conditions. An
 *   effect with a weapon filter only fits a roll with that weapon tag.
 */
export function fitsRoll(effect, context) {
  if (![context.roll].flat().includes(effect.roll)) return false;
  if (effect.ability && effect.ability !== context.ability) return false;
  if (effect.against && ![context.against].flat().includes(effect.against)) return false;
  if (effect.weapon && !(context.weapon ?? []).includes(effect.weapon)) return false;
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
  return (mods ?? []).filter(mod => mod.boon || mod.bane || mod.dr || mod.damage);
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
  }
  if (effect.kind === "roll") {
    check("mode", ROLL_MODES);
    check("grant", GRANTS);
    check("weapon", WEAPON_TAGS);
    check("per", DAMAGE_PER);
    if (effect.damage && !isDamagePart(effect.damage)) problems.push(`damage: ${effect.damage}`);
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
