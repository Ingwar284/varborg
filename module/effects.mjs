/**
 * Item effects in Foundry (PLAN Milestone 9): reads an actor's items and
 * hands each roll the modifiers and reminders that fit it. The maths lives
 * in module/rules/item-effects.mjs.
 *
 * Roll kinds: "test" is every test made with the ability test dialog,
 * including the tests other features start (Panic, wounds, driving...).
 * Those also pass their own kind ("panic", "driving"), so an effect can
 * name either. A contested test is "contest" plus "test". Attacks,
 * defence, spellcasting and powers are their own kinds only. A gloom
 * ability's test is "gloomTest" plus "test" (its own test) or "defence"
 * (the usual Agility defence).
 */

import {
  collectEffects, rollEffects, withEffect, hookEffects, rollTwiceKeep, keptRoll, withWeaponStats, resistsFor, resistedDamage, chosenWeaponTraits, changedSpeeds,
  hasAdrenaline, SURGE_ON, withNotedKind
} from "./rules/item-effects.mjs";
import { gainEmber, adjustPoolBy, runningCombat } from "./pools.mjs";
import { isDead, killedByDamage } from "./deaths-door.mjs";
import { rollChanceDie } from "./dice/chance-die.mjs";
import { makeItemMinion, makeCompanion, raiseThrall, ownedThralls } from "./minions.mjs";

const { DialogV2 } = foundry.applications.api;

/** The Unarmed weapon's id in the weapons compendium. */
const UNARMED_ID = "vbWeap0010000000";

/**
 * The item effects on one roll.
 * @param {Actor} actor
 * @param {object} context  { roll, ability?, against? } (see fitsRoll).
 * @returns {{auto: object[], optional: object[], reminders: object[]}}
 */
export function itemRollEffects(actor, context) {
  if (!actor?.items) return { auto: [], optional: [], reminders: [] };
  const own = ownRollEffects(actor, context);
  // Against a target (step 51e): its marks for attackers, and other
  // characters' subject bonuses (GAPS 230).
  const target = context.targetUuid ? fromUuidSync(context.targetUuid) : null;
  const rolls = [context.roll].flat();
  if (!target?.items || !rolls.some(roll => ["attack", "power", "spell"].includes(roll))) return own;
  const targetEffects = collectEffects(target.items);
  const marks = rollEffects(targetEffects.filter(effect => effect.roll === "attackAgainst"), { ...context, roll: "attackAgainst" });
  // Spells cast at it (Godstone Plating: +2 DR, step 52c).
  const spellMarks = rolls.includes("spell")
    ? rollEffects(targetEffects.filter(effect => effect.roll === "spellAgainst"), { ...context, roll: "spellAgainst" })
    : { auto: [], optional: [], reminders: [] };
  const subjectOf = game.actors.filter(other => other.type === "character" && other.id !== actor.id && subjectOfActor(other)?.uuid === target.uuid);
  const allies = subjectOf.map(other => rollEffects(collectEffects(other.items).filter(effect => effect.vs === "subject"), { ...context, allySubject: true }));
  for (const extra of [marks, spellMarks, ...allies]) {
    own.auto.push(...extra.auto);
    own.optional.push(...extra.optional);
    own.reminders.push(...extra.reminders);
  }
  return own;
}

/** A character's subject this encounter (GAPS 230), or null. */
function subjectOfActor(actor) {
  const subject = actor?.getFlag?.("var-borg", "subject");
  return subject && subject.combat === (game.combat?.started ? game.combat.id : "") ? subject : null;
}

/** The roll effects of the character's own items. */
function ownRollEffects(actor, context) {
  // The character's facts, for damage per wound (step 49e).
  // Whether a combat is running, for "non-combat tests" (GAPS 194).
  const facts = {
    wounds: actor.system.wounds?.value ?? 0,
    inCombat: Boolean(game.combat?.started),
    combatId: game.combat?.started ? game.combat.id : "",
    kills: killsThisCombat(actor),
    // The worn armour's original tier, for "only in light armour" (Grace in Motion, step 51a).
    armourTier: wornArmourTier(actor),
    // Whether the character has Adrenaline (GAPS 206).
    adrenaline: hasAdrenaline(collectEffects(actor.items), game.combat?.started ? game.combat.id : ""),
    // The quarry named this encounter (GAPS 230).
    quarry: (() => {
      const quarry = actor.getFlag?.("var-borg", "quarry");
      return quarry && quarry.combat === (game.combat?.started ? game.combat.id : "") ? quarry.uuid : "";
    })()
  };
  return rollEffects(collectEffects(actor.items), { facts, ...context });
}

/** The original tier of the armour a character wears, or 0. */
function wornArmourTier(actor) {
  const worn = actor.items.filter(item => item.type === "armour" && item.system.equipped);
  return Math.max(0, ...worn.map(item => item.system.originalTier ?? item.system.tier ?? 0));
}

/**
 * The item modifiers applied by themselves to a roll: entries for the
 * roll's modifier list, next to its conditions. conditionNotes and
 * totalModifiers (conditions) take them as they are.
 */
export function itemRollMods(actor, context) {
  return withEffect(itemRollEffects(actor, context).auto);
}

/** The item reminders for a roll's dialog, such as "Hawkeye: when you can see far". */
export function itemReminderNotes(actor, context) {
  const i18n = game.i18n;
  return itemRollEffects(actor, context).reminders.map(({ item, note }) => (note
    ? i18n.format("VARBORG.Effects.ReminderNote", { item, note })
    : i18n.format("VARBORG.Effects.ReminderPlain", { item })));
}

const OPTIONAL_TEMPLATE = "systems/var-borg/templates/dice/optional-effects.hbs";

/**
 * The item modifiers a roll offers as unticked boxes, for situations only
 * the Dark Master can judge (PLAN step 49d). Same shape as itemRollMods.
 */
export function itemOptionalMods(actor, context) {
  return withEffect(itemRollEffects(actor, context).optional);
}

/**
 * The boxes for a dialog, such as "Acrobat (on tests involving balance):
 * Boon", or "" when there are none. Box i is named "optionalEffect<i>".
 * @param {object[]} mods  From itemOptionalMods.
 * @returns {Promise<string>}  HTML for the dialog's template ({{{optionalEffects}}}).
 */
export async function optionalEffectsField(mods) {
  if (!mods?.length) return "";
  const i18n = game.i18n;
  const list = mods.map(mod => {
    const parts = [];
    if (mod.boon) parts.push(i18n.localize("VARBORG.Test.Boon"));
    if (mod.bane) parts.push(i18n.localize("VARBORG.Test.Bane"));
    if (mod.dr) parts.push(i18n.format("VARBORG.Condition.DR", { dr: mod.dr > 0 ? `+${mod.dr}` : `−${Math.abs(mod.dr)}` }));
    if (mod.damage) parts.push(i18n.format("VARBORG.Effects.DamagePart", { damage: mod.damage }));
    if (mod.rerollOnes) parts.push(i18n.localize("VARBORG.Effects.RerollOnesPart"));
    if (mod.setDamage) parts.push(i18n.format("VARBORG.Effects.SetDamagePart", { damage: mod.setDamage }));
    if (mod.noRuin) parts.push(i18n.localize("VARBORG.Effects.NoRuinPart"));
    const name = mod.note ? i18n.format("VARBORG.Effects.ItemWithNote", { item: mod.item, note: mod.note }) : mod.item;
    return { label: i18n.format("VARBORG.Effects.OptionalLabel", { name, effect: parts.join(", ") }) };
  });
  return foundry.applications.handlebars.renderTemplate(OPTIONAL_TEMPLATE, { list });
}

/**
 * The offered modifiers whose boxes were ticked in the dialog. They join
 * the roll's modifier list like the automatic ones.
 * @param {object[]} mods  The list given to optionalEffectsField.
 * @param {object} data    The dialog's form data.
 */
export function tickedMods(mods, data) {
  return (mods ?? []).filter((_, index) => Boolean(data?.[`optionalEffect${index}`]));
}

/**
 * The hook effects of a character's items that act at an event (step 49f).
 * @param {Actor} actor
 * @param {string} event  One of HOOK_EVENTS.
 */
export function itemHooks(actor, event, context = {}) {
  if (!actor?.items) return [];
  return hookEffects(collectEffects(actor.items), event, {
    // The defence result, for "a creature that Ruins its defence" (step 52g).
    tier: context.tier ?? "",
    // The weapon that hit, for "damaged by its Needle teeth" (step 52h).
    weaponName: context.weaponName ?? "",
    hp: actor.system.hp?.value ?? 0, hpMax: actor.system.hp?.max ?? 0,
    // Damage types a foe took since its last turn (Regeneration, GAPS 238).
    damagedBy: actor.getFlag?.("var-borg", DAMAGED_BY_FLAG) ?? []
  });
}

/** The foe's flag that lists the damage types it took since its last turn (GAPS 238). */
export const DAMAGED_BY_FLAG = "damagedBy";

/**
 * Whether a weapon item is the Unarmed weapon (rules 4.1), by its
 * compendium source or its name.
 */
export function isUnarmed(item) {
  const source = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? "";
  if (source.endsWith(UNARMED_ID)) return true;
  const name = item?.name?.trim().toLowerCase();
  return name === "unarmed" || name === game.i18n.localize("VARBORG.Power.Bare.unarmed").toLowerCase();
}

/** The Flintlock pistol's id in the weapons compendium (Steel and Shot, GAPS 216). */
const PISTOL_ID = "vbExamplePistol0";

/** Whether a weapon item is the Flintlock pistol, by its compendium source or its name. */
export function isFlintlockPistol(item) {
  const source = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? "";
  return source.endsWith(PISTOL_ID) || item?.name?.trim().toLowerCase() === "flintlock pistol";
}

/**
 * A weapon's numbers after its owner's feats (step 50a3): Brawler's
 * unarmed die, Long shot's ranges, Quick reload's actions.
 * @param {Item} item  A weapon.
 * @returns {object}  A copy of its system data, or the data itself.
 */
export function effectiveWeapon(item) {
  const bonuses = item.actor?.type === "character" ? item.actor.system.statBonuses : null;
  if (!bonuses) return item.system;
  // The Flintlock pistol, for Steel and Shot (GAPS 216).
  const weapon = withWeaponStats(item.system, bonuses, isUnarmed(item), { pistol: isFlintlockPistol(item) });
  // Traits for the weapon the feat chose (step 50f).
  return { ...weapon, ...chosenWeaponTraits(collectEffects(item.actor.items), item.id) };
}

/**
 * Resist effects on damage a character takes (step 50b3b): Tempered by
 * the Forge halves fire, Ancestral Resonance takes d6 off its element.
 * The reductions are rolled once and kept in the card's state, so a
 * Fortune press does not roll them again.
 * @param {Actor} actor       Who takes the damage.
 * @param {string} damageType
 * @param {object} [kept]     A stored { items, totals } from before.
 * @returns {Promise<{kept: object, rolls: Roll[]}>}
 */
export async function rollResists(actor, damageType, kept = null, { persistent = false, weaponTags = null, confirmOptional = null } = {}) {
  if (kept) return { kept, rolls: [] };
  // weaponTags: the weapon attack's tags, for resists by weapon (step 52c); null for no weapon.
  const resists = actor?.items ? resistsFor(collectEffects(actor.items), damageType, { persistent, weaponTags }) : [];
  const rolls = [];
  const items = [];
  const totals = [];
  for (const effect of resists) {
    // An optional resist counts only when someone says it applies (Iron-Averse:
    // "iron or steel?", GAPS 247); without a question it never counts.
    if (effect.mode === "optional" && !(confirmOptional && await confirmOptional(effect))) continue;
    let value = null;
    if (["reduce", "extra"].includes(effect.resist)) {
      const roll = await new Roll(effect.amount || "0").evaluate();
      rolls.push(roll);
      value = roll.total;
      // Extra damage adds (step 52d): a negative reduction.
      totals.push(effect.resist === "extra" ? -value : value);
    }
    items.push({ item: effect.item, resist: effect.resist, value });
  }
  return { kept: { items, totals, damageType }, rolls };
}

/** The card lines for kept resists: "Tempered by the Forge: fire damage halved". */
export function resistLines(kept) {
  const i18n = game.i18n;
  const type = kept?.damageType ? i18n.localize(`VARBORG.DamageType.${kept.damageType}`) : "";
  return (kept?.items ?? []).map(entry => i18n.format(`VARBORG.Effects.Resist.${entry.resist}Line`, { item: entry.item, type, value: entry.value ?? 0 }));
}

/**
 * Damage taken after resists and soak, as the defence and gloom cards
 * work it out: no resists, the usual; resisted to 0, nothing; otherwise
 * soaked, at least 1.
 */
export function takenWithResists(before, usualTaken, soak, kept, minimum = 1) {
  if (!kept?.items?.length) return { taken: usualTaken, resisted: before };
  const resisted = resistedDamage(before, kept.items, kept.totals);
  return { taken: resisted > 0 ? Math.max(minimum, resisted - soak) : 0, resisted };
}

/**
 * Foes the character killed in the running combat (Bloodlust, GAPS 205),
 * kept in its flags as { combat, count }.
 */
export function killsThisCombat(actor) {
  const kills = actor?.getFlag?.("var-borg", "kills");
  return kills && game.combat?.started && kills.combat === game.combat.id ? kills.count : 0;
}

/** Count a kill made with the character's Inflict damage button, in combat. */
export async function countKill(actor) {
  if (actor?.type !== "character" || !game.combat?.started) return;
  await actor.setFlag("var-borg", "kills", { combat: game.combat.id, count: killsThisCombat(actor) + 1 });
}

/**
 * The character's companions of a kind (step 50g): the minions they own,
 * or the vehicles they are aboard (the rig they drive).
 */
function companionsOf(actor, kind) {
  if (kind === "minion") return game.actors.filter(other => other.type === "minion" && other.system.owner === actor.id);
  return game.actors.filter(other => other.type === "vehicle" && (other.system.occupants ?? []).some(occupant => occupant.uuid === actor.uuid));
}

/** Pick one companion: the only one, or the player's choice. */
async function pickCompanion(actor, effect) {
  const i18n = game.i18n;
  const found = companionsOf(actor, effect.companion);
  if (!found.length) {
    ui.notifications.warn(i18n.format(`VARBORG.Effects.NoCompanion.${effect.companion}`, { item: effect.item, name: actor.name }));
    return null;
  }
  if (found.length === 1) return found[0];
  const data = await foundry.applications.api.DialogV2.input({
    window: { title: effect.item },
    content: `<div class="form-group"><label>${i18n.localize("VARBORG.Effects.WhichCompanion")}</label><select name="id">`
      + found.map(other => `<option value="${other.id}">${foundry.utils.escapeHTML(other.name)}</option>`).join("") + "</select></div>",
    rejectClose: false
  });
  return data ? game.actors.get(data.id) ?? null : null;
}

/**
 * A feat that changes the character's minion or vehicle (step 50g):
 * new armour and speeds once (Hawk-Iron Barding, Bolted Plate), or HP
 * regained or lost (Grease Monkey, Bottled Breath).
 */
async function companionAction(actor, effect) {
  const i18n = game.i18n;
  const nothing = { lines: [], rolls: [], acted: false };
  const companion = await pickCompanion(actor, effect);
  if (!companion) return nothing;
  if (!companion.isOwner) {
    ui.notifications.warn(i18n.format("VARBORG.Effects.CompanionNotYours", { name: companion.name }));
    return nothing;
  }
  if (effect.action === "upgradeCompanion") {
    const mark = `${actor.id}.${effect.itemId}`;
    if ((companion.getFlag("var-borg", "upgrades") ?? []).includes(mark)) {
      ui.notifications.warn(i18n.format("VARBORG.Effects.AlreadyUpgraded", { item: effect.item, name: companion.name }));
      return nothing;
    }
    const changes = { [`flags.var-borg.upgrades`]: [...(companion.getFlag("var-borg", "upgrades") ?? []), mark] };
    if (effect.armour) changes["system.armour"] = effect.armour;
    if (effect.value && companion.type === "vehicle") changes["system.speed"] = changedSpeeds(companion.system.speed, Number(effect.value));
    await companion.update(changes);
    const lines = [i18n.format("VARBORG.Effects.Upgraded", { item: effect.item, name: companion.name, armour: effect.armour || "—" })];
    if (effect.value) lines.push(i18n.format(companion.type === "vehicle" ? "VARBORG.Effects.SpeedChanged" : "VARBORG.Effects.SpeedByHand", { feet: Math.abs(Number(effect.value)) }));
    return { lines, rolls: [], acted: true };
  }
  const roll = await new Roll(effect.amount || "0").evaluate();
  const from = companion.system.hp.value;
  const to = effect.action === "healCompanion"
    ? Math.min(companion.system.hp.max, from + roll.total)
    : Math.max(0, from - roll.total);
  await companion.update({ "system.hp.value": to });
  const key = effect.action === "healCompanion" ? "VARBORG.Effects.CompanionHealed" : "VARBORG.Effects.CompanionHurt";
  return { lines: [i18n.format(key, { item: effect.item, name: companion.name, amount: roll.total, from, to, note: effect.note || "" })], rolls: [roll], acted: true };
}

/** Mark an item's limited use spent (once per day and so on). */
export async function markUsed(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item || item.system.frequencyUsed) return;
  await item.update({ "system.frequencyUsed": true });
  // A relic rolls its Expendable d20 after each use (rules 4.2, step 53a).
  if (item.type === "relic") {
    const { rollRelicDie } = await import("./relics.mjs");
    await rollRelicDie(actor, item);
  }
}

/** The flag on a character whose relic guards the party's next rest (step 53a). */
export const REST_GUARD_FLAG = "restGuard";

/**
 * Do one hook's or Use effect's action: heal, roll, add to the Ember
 * pool, gain a condition, or a reminder ("Remind only" hooks just give
 * their note). Shared by events (step 49f) and the Use button (step 49g).
 * @param {Actor} actor
 * @param {object} effect  A collected effect (collectEffects).
 * @returns {Promise<{lines: string[], rolls: Roll[], acted: boolean}>}
 *   acted: false for reminders and when nothing could be done.
 */
export async function doEffectAction(actor, effect, context = {}) {
  const i18n = game.i18n;
  const item = effect.item;
  const note = effect.note || i18n.localize("VARBORG.Effects.SeeText");
  // "Remind only" Fortune: a button for the Dark Master (Doomsworn, GAPS 196).
  if (effect.mode === "optional" && effect.action === "gainFortune") {
    return {
      lines: [i18n.format("VARBORG.Effects.HookOptional", { item, note })],
      rolls: [],
      acted: false,
      button: { item, amount: effect.amount || "1" }
    };
  }
  if (effect.action === "stayAtOne") {
    return { lines: [i18n.format("VARBORG.Effects.StayOffer", { item, name: actor.name })], rolls: [], acted: false, stayButton: { item, itemId: effect.itemId } };
  }
  if (effect.mode === "optional" || effect.action === "reminder") {
    const key = effect.mode === "optional" ? "VARBORG.Effects.HookOptional" : "VARBORG.Effects.HookReminder";
    // A reminder with an amount rolls it too (Dust, Pressurised: GAPS 241).
    if (effect.action === "reminder" && effect.amount) {
      const roll = await new Roll(effect.amount).evaluate();
      return { lines: [i18n.format(key, { item, note }), i18n.format("VARBORG.Effects.HookRolled", { amount: effect.amount, total: roll.total })], rolls: [roll], acted: false };
    }
    return { lines: [i18n.format(key, { item, note })], rolls: [], acted: false };
  }
  if (effect.action === "gainGloom") {
    // Cold Heart (step 52b): in a running combat only, like Ember.
    if (!runningCombat()) return { lines: [i18n.format("VARBORG.Effects.HookGloomNoCombat", { item })], rolls: [], acted: false };
    const roll = await new Roll(effect.amount || "1").evaluate();
    await adjustPoolBy("gloom", roll.total);
    return { lines: [i18n.format("VARBORG.Effects.HookGloom", { item, amount: roll.total })], rolls: roll.isDeterministic ? [] : [roll], acted: true };
  }
  if (["targetCondition", "targetPersistent"].includes(effect.action)) {
    // The creature its attack hit (step 52f, GAPS 249): Burrow, Latch.
    const target = context.target ?? null;
    if (!target) return { lines: [i18n.format("VARBORG.Effects.HookReminder", { item, note })], rolls: [], acted: false };
    if (effect.action === "targetCondition") {
      const { addTimedCondition } = await import("./timers.mjs");
      // A timer in rounds when the effect has one (Hollow Shriek: 1, until the end of its next turn).
      const timer = Number(effect.value) > 0 ? { kind: "rounds", rounds: String(effect.value) } : null;
      const line = await addTimedCondition(target, effect.condition, timer);
      return { lines: [line, ...(effect.note ? [effect.note] : [])].filter(Boolean), rolls: [], acted: true };
    }
    const { addPersistentDamage } = await import("./persistent.mjs");
    await addPersistentDamage(target, effect.damageType, effect.amount);
    const type = i18n.localize(`VARBORG.DamageType.${effect.damageType}`).toLowerCase();
    return { lines: [i18n.format("VARBORG.Outcome.Persistent", { name: target.name, amount: effect.amount, type }), ...(effect.note ? [effect.note] : [])], rolls: [], acted: true };
  }
  if (effect.action === "dropToOne") {
    // Done by the foe's data before the update (step 52f); here only a line.
    return { lines: [], rolls: [], acted: false };
  }
  if (effect.action === "testButton") {
    // Adhesive Hide (GAPS 240): the creature that hit tests; the result is the note.
    const attacker = context.attacker ?? null;
    if (!attacker || !effect.ability) return { lines: [i18n.format("VARBORG.Effects.HookReminder", { item, note })], rolls: [], acted: false };
    const ability = i18n.localize(`VARBORG.Ability.${effect.ability}`);
    return {
      lines: [i18n.format("VARBORG.Effects.TestAsk", { item, name: attacker.name, ability, dr: effect.dr }), ...(effect.note ? [effect.note] : [])],
      rolls: [], acted: false,
      testButton: { uuid: attacker.uuid, ability: effect.ability, dr: effect.dr, item, label: i18n.format("VARBORG.Effects.TestButton", { name: attacker.name, ability, dr: effect.dr }) }
    };
  }
  if (["heal", "roll", "gainEmber"].includes(effect.action)) {
    if (effect.action === "gainEmber" && !game.combat?.started) {
      return { lines: [i18n.format("VARBORG.Effects.HookEmberNoCombat", { item })], rolls: [], acted: false };
    }
    const roll = await new Roll(effect.amount || "0").evaluate();
    let line;
    if (effect.action === "heal") {
      const from = actor.system.hp.value;
      await actor.update({ "system.hp.value": from + roll.total });
      line = i18n.format("VARBORG.Effects.HookHeal", { item, name: actor.name, amount: roll.total, from, to: actor.system.hp.value });
    } else if (effect.action === "roll") {
      line = i18n.format("VARBORG.Effects.HookRoll", { item, total: roll.total, note: effect.note });
    } else {
      await gainEmber(roll.total, actor, item);
      line = i18n.format("VARBORG.Effects.HookEmber", { item, amount: roll.total });
    }
    return { lines: [line], rolls: [roll], acted: true };
  }
  if (effect.action === "gainFortune") {
    const roll = await new Roll(effect.amount || "1").evaluate();
    const from = actor.system.fortune ?? 0;
    await actor.update({ "system.fortune": from + roll.total });
    return {
      lines: [i18n.format("VARBORG.Effects.HookFortune", { item, name: actor.name, amount: roll.total, from, to: from + roll.total })],
      rolls: roll.isDeterministic ? [] : [roll],
      acted: true
    };
  }
  if (effect.action === "makeMinion") return makeItemMinion(actor, effect);
  // Step 51a3: the Destrier, Raider-Beast or rig (GAPS 211), and thralls (GAPS 213).
  if (effect.action === "makeCompanion") return makeCompanion(actor, effect);
  if (effect.action === "raiseThrall") return raiseThrall(actor, effect);
  if (effect.action === "thrallAttack") {
    if (!ownedThralls(actor).length) {
      ui.notifications.warn(i18n.format("VARBORG.Thrall.None", { name: actor.name }));
      return { lines: [], rolls: [], acted: false };
    }
    const { rollThrallAttack } = await import("./dice/attack.mjs");
    await rollThrallAttack(actor, effect);
    return { lines: [i18n.format("VARBORG.Thrall.Attacks", { name: actor.name })], rolls: [], acted: true };
  }
  if (effect.action === "endBuff") {
    // Revert: the buff item ends itself (GAPS 226).
    const owned = actor.items.get(effect.itemId);
    if (owned) await owned.delete();
    return { lines: [i18n.format("VARBORG.Outcome.Reverted", { item, name: actor.name })], rolls: [], acted: true };
  }
  if (effect.action === "mount") {
    // In the saddle until switched off (GAPS 212).
    const mounted = !effect.mounted;
    await actor.items.get(effect.itemId)?.setFlag("var-borg", "mounted", mounted);
    return { lines: [i18n.format(mounted ? "VARBORG.Effects.MountedLine" : "VARBORG.Effects.DismountedLine", { item, name: actor.name })], rolls: [], acted: true };
  }
  if (effect.action === "recordKind") {
    // Field notes: the targeted creature's kind joins the list (GAPS 214).
    const target = [...game.user.targets][0]?.actor ?? null;
    if (!target) {
      ui.notifications.warn(i18n.localize("VARBORG.Effects.RecordNoTarget"));
      return { lines: [], rolls: [], acted: false };
    }
    const owned = actor.items.get(effect.itemId);
    const effects = foundry.utils.deepClone(owned.toObject().system.effects);
    const index = effects.findIndex(entry => entry.kind === "choice" && entry.choose === "text");
    if (index < 0) return { lines: [], rolls: [], acted: false };
    const list = withNotedKind(effects[index].chosen, target.name);
    effects[index].chosen = list;
    effects[index].chosenName = list;
    await owned.update({ "system.effects": effects });
    return { lines: [i18n.format("VARBORG.Effects.Recorded", { item, kind: target.name, list })], rolls: [], acted: true };
  }
  if (["upgradeCompanion", "healCompanion", "hurtCompanion"].includes(effect.action)) return companionAction(actor, effect);
  if (effect.action === "takeDamage") {
    // Damage nothing reduces (Blood price, step 50f). At Death's Door any damage kills.
    const roll = await new Roll(effect.amount || "0").evaluate();
    if (await killedByDamage(actor, roll.total)) return { lines: [], rolls: [roll], acted: true };
    const from = actor.system.hp.value;
    await actor.update({ "system.hp.value": Math.max(0, from - roll.total) });
    return { lines: [i18n.format("VARBORG.Effects.TookDamage", { item, name: actor.name, amount: roll.total, from, to: actor.system.hp.value })], rolls: [roll], acted: true };
  }
  if (effect.action === "switchOn") {
    // On for this combat, or "" outside combat (step 50c). Switched on
    // when initiative is rolled, before the combat begins, it is on for
    // that combat (Barbaric Rage, step 51a).
    const combat = game.combat;
    const on = combat && (combat.started || combat.getCombatantsByActor(actor).length) ? combat.id : "";
    await actor.items.get(effect.itemId)?.setFlag("var-borg", "on", on);
    return { lines: [i18n.format("VARBORG.Effects.SwitchedOn", { item, note })], rolls: [], acted: true };
  }
  if (effect.action === "adrenaline") {
    // Adrenaline lasts until the start of the next turn, in combat only (GAPS 206).
    const combat = game.combat;
    if (!combat?.started || !combat.getCombatantsByActor(actor).length) {
      return { lines: [i18n.format("VARBORG.Effects.AdrenalineNoCombat", { item, name: actor.name })], rolls: [], acted: false };
    }
    await actor.items.get(effect.itemId)?.setFlag("var-borg", "on", combat.id);
    return { lines: [i18n.format("VARBORG.Effects.AdrenalineGained", { item, name: actor.name, note: effect.note || "" })], rolls: [], acted: true };
  }
  if (effect.action === "photonicSurge") {
    // Autodidactism: a d6 on each spell and magic-themed power; a 1 is a Photonic Surge (GAPS 208).
    const roll = await new Roll(effect.amount || "1d6").evaluate();
    if (roll.total !== SURGE_ON) return { lines: [i18n.format("VARBORG.Effects.NoSurge", { item, total: roll.total })], rolls: [roll], acted: true };
    const table = await fromUuid(SURGE_TABLE).catch(() => null);
    if (table) await table.draw({ displayChat: true });
    // Items that act when a surge occurs (Harmonious Light, Surge Surfer).
    await runItemHooks(actor, "surge");
    return { lines: [i18n.format(table ? "VARBORG.Effects.Surge" : "VARBORG.Effects.SurgeNoTable", { item, total: roll.total })], rolls: [roll], acted: true };
  }
  if (effect.action === "guardRest") {
    // Hearth-tallow of Anashe (step 53a): lit when the party begins a
    // rest, that rest cannot be interrupted. The Rest button reads it.
    await actor.setFlag("var-borg", REST_GUARD_FLAG, item);
    return { lines: [i18n.format("VARBORG.Effects.RestGuarded", { item, note })], rolls: [], acted: true };
  }
  if (effect.action === "chanceDie") {
    // Pack Rat (step 50b2): the Chance Die posts its own card.
    await rollChanceDie(actor);
    return { lines: [i18n.format("VARBORG.Effects.ChanceRolled", { item, note })], rolls: [], acted: true };
  }
  if (effect.action === "addCondition" && effect.condition) {
    if (!actor.statuses.has(effect.condition)) await actor.toggleStatusEffect(effect.condition, { active: true });
    const condition = i18n.localize(`VARBORG.Condition.${effect.condition}`);
    return { lines: [i18n.format("VARBORG.Effects.HookCondition", { item, name: actor.name, condition })], rolls: [], acted: true };
  }
  return { lines: [], rolls: [], acted: false };
}

/**
 * Do what a character's hooks say at an event, and post one card with a
 * line each: heal, roll, add to the Ember pool, gain a condition, or a
 * reminder. "Remind only" hooks just post their note. Rolling twice is
 * done by the roll itself (rollTwiceFor). A dead character does nothing.
 * Called by the client that runs the event.
 * @param {Actor} actor
 * @param {string} event  One of HOOK_EVENTS.
 */
export async function runItemHooks(actor, event, context = {}) {
  // Characters, and foes' passives (step 52b). A foe at 0 HP only acts at that moment.
  if (actor?.type === "character") {
    if (isDead(actor)) return;
  } else if (actor?.type === "foe") {
    if (!(actor.system.hp?.value > 0) && event !== "zeroHp") return;
  } else return;
  // Rolling twice is done by the roll; Steady nerves and Dwarven
  // Doughtiness by the Panic test.
  const hooks = itemHooks(actor, event, context).filter(hook => !["rollTwice", "steadyNerves", "ruinAsFailure"].includes(hook.action));
  if (!hooks.length) return;
  const i18n = game.i18n;
  const lines = [];
  const rolls = [];
  const buttons = [];
  const stayButtons = [];
  const testButtons = [];
  for (const hook of hooks) {
    const done = await doEffectAction(actor, hook, context);
    if (done.testButton) testButtons.push(done.testButton);
    lines.push(...done.lines);
    rolls.push(...done.rolls);
    if (done.button) buttons.push(done.button);
    if (done.stayButton) stayButtons.push(done.stayButton);
    if (hook.frequency && done.acted) {
      await markUsed(actor, hook.itemId);
      lines.push(i18n.format("VARBORG.Effects.HookUsed", { item: hook.item }));
    }
  }
  const title = i18n.format("VARBORG.Effects.HookTitle", { name: actor.name, item: [...new Set(hooks.map(hook => hook.item))].join(", ") });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content: `<div class="var-borg-card"><h3>${foundry.utils.escapeHTML(title)}</h3>`
      + lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("")
      + buttons.map(button => fortuneButton(actor, button)).join("")
      + testButtons.map(button => `<button type="button" data-action="effectTest" data-actor-uuid="${button.uuid}" data-ability="${button.ability}" data-dr="${Number(button.dr) || 0}" data-item="${foundry.utils.escapeHTML(button.item)}"><i class="fa-solid fa-dice-d20"></i> ${foundry.utils.escapeHTML(button.label)}</button>`).join("")
      + stayButtons.map(button => `<button type="button" class="text-button" data-action="stayAtOne" data-actor-uuid="${actor.uuid}" data-item-id="${button.itemId}"><i class="fa-solid fa-masks-theater"></i> ${foundry.utils.escapeHTML(game.i18n.format("VARBORG.Effects.StayButton", { item: button.item }))}</button>`).join("")
      + "</div>",
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
}

/** A Dark Master's "+1 Fortune (Doomsworn)" button on a hook card. */
function fortuneButton(actor, { item, amount }) {
  const label = game.i18n.format("VARBORG.Effects.FortuneButton", { amount, item });
  return `<button type="button" class="text-button" data-action="effectFortune" data-actor-uuid="${actor.uuid}"`
    + ` data-amount="${foundry.utils.escapeHTML(amount)}" data-item="${foundry.utils.escapeHTML(item)}">`
    + `<i class="fa-solid fa-clover"></i> ${foundry.utils.escapeHTML(label)}</button>`;
}

/** Watch the Fortune buttons on hook cards (step 50a2). */
export function registerEffectButtons() {
  Hooks.on("renderChatMessageHTML", addFortuneButtonListeners);
  Hooks.on("renderChatMessageHTML", addStayListeners);
  Hooks.on("renderChatMessageHTML", addTestListeners);
}

/**
 * The test button on a foe's hook card (Adhesive Hide, GAPS 240): the
 * creature that hit makes the test, through the usual test dialog. Its
 * owner presses it; the card's text says what each result does.
 */
function addTestListeners(message, html) {
  for (const button of html.querySelectorAll("button[data-action='effectTest']")) {
    button.addEventListener("click", async () => {
      const actor = await fromUuid(button.dataset.actorUuid);
      if (!actor?.isOwner) {
        ui.notifications.warn(game.i18n.localize("VARBORG.Effects.TestNotYours"));
        return;
      }
      const { rollAbilityTest } = await import("./dice/ability-test.mjs");
      await rollAbilityTest(actor, button.dataset.ability, { dr: Number(button.dataset.dr), purpose: button.dataset.item });
    });
  }
}

/**
 * Not the face! (GAPS 227): the character's player keeps them at 1 HP
 * instead of 0, paying the power's ember and reaction; a wound gained at
 * this 0 HP is taken back. Once per card.
 */
function addStayListeners(message, html) {
  const button = html.querySelector("button[data-action='stayAtOne']");
  if (!button) return;
  if (message.getFlag("var-borg", "stayed")) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", async () => {
    const actor = await fromUuid(button.dataset.actorUuid);
    const power = actor?.items.get(button.dataset.itemId);
    if (!actor?.isOwner || !power) return;
    button.disabled = true;
    const { payReactionPower } = await import("./dice/power.mjs");
    const error = await payReactionPower(actor, power);
    if (error) {
      ui.notifications.warn(game.i18n.format(error, { name: power.name }));
      button.disabled = false;
      return;
    }
    if (message.canUserModify(game.user, "update")) await message.setFlag("var-borg", "stayed", true);
    const wounds = actor.system.wounds?.value ?? 0;
    await actor.update({ "system.hp.value": 1, "system.wounds.value": Math.max(0, wounds - 1) });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="var-borg-card"><p>${foundry.utils.escapeHTML(game.i18n.format("VARBORG.Effects.Stayed", { item: power.name, name: actor.name }))}</p></div>`
    });
  });
}

/** The Dark Master presses a Fortune button: the character gains it, once. */
function addFortuneButtonListeners(message, html) {
  const button = html.querySelector("button[data-action='effectFortune']");
  if (!button) return;
  if (!game.user.isGM || message.getFlag("var-borg", "fortuneGiven")) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    const actor = await fromUuid(button.dataset.actorUuid);
    if (!actor) return;
    await message.setFlag("var-borg", "fortuneGiven", true);
    const done = await doEffectAction(actor, { action: "gainFortune", amount: button.dataset.amount, item: button.dataset.item, mode: "auto" });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="var-borg-card">${done.lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("")}</div>`,
      rolls: done.rolls
    });
  });
}

/**
 * The character would die (step 50a2). Harkin's Reprieve stops it: the
 * scene fades to black, HP goes to its maximum and wounds to their
 * maximum − 1, the hours are rolled and the wake-up table drawn
 * (GAPS 195). Otherwise "when you would die" reminders (Diehard) are
 * given as lines for the death card.
 * @param {Actor} actor
 * @returns {Promise<{saved: boolean, lines: string[], rolls: Roll[]}>}
 */
export async function escapeDeath(actor) {
  const i18n = game.i18n;
  const hooks = itemHooks(actor, "death");
  const reprieve = hooks.find(hook => hook.action === "reprieve" && hook.mode !== "optional");
  if (!reprieve) {
    const lines = [];
    const rolls = [];
    for (const hook of hooks) {
      // A roll is rolled (Blood of power: 3d6 within 20', step 51a); the rest are reminders.
      const done = await doEffectAction(actor, hook.action === "roll" ? hook : { ...hook, action: "reminder" });
      lines.push(...done.lines);
      rolls.push(...done.rolls);
    }
    return { saved: false, lines, rolls };
  }
  for (const status of ["deathsDoor", "darkVessel"]) {
    if (actor.statuses.has(status)) await actor.toggleStatusEffect(status, { active: false });
  }
  const wounds = Math.max(0, actor.system.wounds.max - 1);
  await actor.update({ "system.hp.value": actor.system.hp.max, "system.wounds.value": wounds });
  const hours = await new Roll(HARKIN_HOURS).evaluate();
  const table = await fromUuid(HARKIN_TABLE).catch(() => null);
  if (table) await table.draw({ displayChat: true });
  return {
    saved: true,
    rolls: [hours],
    lines: [
      i18n.format("VARBORG.Effects.Reprieve", { item: reprieve.item, name: actor.name, hours: hours.total }),
      i18n.format("VARBORG.Effects.ReprieveWake", { hp: actor.system.hp.value, wounds, max: actor.system.wounds.max }),
      i18n.localize(table ? "VARBORG.Effects.ReprieveTable" : "VARBORG.Effects.ReprieveNoTable")
    ]
  };
}

/** The Photonic Surge table (content/tables). */
const SURGE_TABLE = "Compendium.var-borg.tables.RollTable.vbTableSurge0000";

/**
 * Adrenaline ends at the start of the character's turn (GAPS 206); it also
 * ends with the encounter, like any switched-on item. Posts a line.
 * @param {Actor} actor
 */
export async function endAdrenaline(actor) {
  if (!actor?.items) return;
  const ended = [];
  for (const item of actor.items) {
    const on = item.getFlag("var-borg", "on");
    if (on === undefined || on === null) continue;
    if (!(item.system.effects ?? []).some(effect => effect.action === "adrenaline")) continue;
    await item.unsetFlag("var-borg", "on");
    ended.push(item.name);
  }
  if (!ended.length) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${foundry.utils.escapeHTML(game.i18n.format("VARBORG.Effects.AdrenalineEnds", { name: actor.name }))}</p></div>`
  });
}

/** Harkin's Reprieve: "You wake d6 hours later". */
const HARKIN_HOURS = "1d6";

/** The "Harkin's Reprieve: you wake…" table (content/tables). */
const HARKIN_TABLE = "Compendium.var-borg.tables.RollTable.vbTableHarkin000";

/**
 * A Table of Agony result would kill the character (step 50a2): the item
 * that sends them to Death's Door instead (Hard to Kill), or null.
 * @param {Actor} actor
 * @returns {object|null}  The hook effect.
 */
export function agonyDeathsDoorInstead(actor) {
  return itemHooks(actor, "agonyDeath").find(hook => hook.action === "deathsDoorInstead" && hook.mode !== "optional") ?? null;
}

/**
 * Which of two rolls to keep, for initiative (a formula cannot ask):
 * "better", "worse" or null. Choosing counts as keeping the better.
 */
export function initiativeKeep(actor) {
  const keep = rollTwiceKeep(itemHooks(actor, "initiative"));
  return keep === "choose" ? "better" : keep;
}

/**
 * Roll a table twice when a character's hooks say so (Death's Door,
 * GAPS 192): keep the better, the worse, or ask the player. Items with a
 * limited use that counted are marked used.
 * @param {Actor} actor
 * @param {string} event    "deathsDoor".
 * @param {string} formula  The table's dice, such as "2d6".
 * @returns {Promise<{total: number, rolls: Roll[], line: string}|null>}  null: roll once as usual.
 */
export async function rollTwiceFor(actor, event, formula) {
  const hooks = itemHooks(actor, event).filter(hook => hook.action === "rollTwice" && hook.mode !== "optional");
  const keep = rollTwiceKeep(hooks);
  if (!keep) return null;
  const i18n = game.i18n;
  const first = await new Roll(formula).evaluate();
  const second = await new Roll(formula).evaluate();
  const items = [...new Set(hooks.map(hook => hook.item))].join(", ");
  let kept = keptRoll(first.total, second.total, keep);
  if (keep === "choose") {
    const picked = await DialogV2.wait({
      window: { title: i18n.format("VARBORG.Effects.ChooseTitle", { name: actor.name }) },
      content: `<p>${foundry.utils.escapeHTML(i18n.format("VARBORG.Effects.ChooseHint", { items }))}</p>`,
      buttons: [
        { action: "first", label: String(first.total), default: first.total >= second.total },
        { action: "second", label: String(second.total), default: second.total > first.total }
      ],
      rejectClose: false
    });
    // Closing the dialog keeps the better one.
    kept = picked === "first" ? first.total : picked === "second" ? second.total : Math.max(first.total, second.total);
  }
  for (const hook of hooks) if (hook.frequency) await markUsed(actor, hook.itemId);
  return {
    total: kept,
    rolls: [first, second],
    line: i18n.format("VARBORG.Effects.RolledTwice", { first: first.total, second: second.total, kept, items })
  };
}
