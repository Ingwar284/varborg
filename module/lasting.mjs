/**
 * Lasting areas on the map (rules section 3, Lingering areas; playtest
 * feedback, GAPS 284). The maths is in module/rules/lasting.mjs.
 *
 * A lasting area is a Region left by a spell or power (module/areas.mjs)
 * with up to two behaviours:
 * - Foundry's Modify Movement Cost, when it is difficult terrain (walking,
 *   crawling, climbing and swimming cost double; flying is left as it is,
 *   and the Dark Master can change it on the Region, GAPS 278);
 * - the system's "Lasting area" behaviour, which does its effects when a
 *   creature enters it, starts its turn in it, at the start of each round,
 *   at the start of the user's turns, or while a creature is inside.
 * Everything is done by the Dark Master's client, so it happens once. A
 * foe takes damage with Inflict damage (its armour soaks); a character or
 * minion gets a Defend button (Agility DR12; its armour soaks).
 * A timed area ends when its round comes or its encounter ends; a
 * Sustained one ends with the power (module/areas.mjs).
 */

import { lastingReaches, oncePerTurn, triggersFor } from "./rules/lasting.mjs";
import { addTimedCondition } from "./timers.mjs";
import { inflictDamage } from "./dice/morale.mjs";

const SYSTEM = "var-borg";
/** The behaviour type, declared in system.json. */
export const LASTING_TYPE = "lasting";
/** The flag on a Region that says when it ends: { combatId, endsAtRound, encounter }. */
export const ENDS_FLAG = "lastingEnds";
/** The flag on a condition a creature has only while inside: the Region's uuid. */
const INSIDE_FLAG = "lastingInside";

/** When each creature was last affected by each area, by turn: "regionUuid.tokenId" → turn key. */
const lastHit = new Map();

/** Only the active Dark Master's client does lasting effects. */
function isRunner() {
  return game.users.activeGM?.isSelf ?? false;
}

/** This turn, for "no more than once per turn". */
function turnKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}.${combat.round}.${combat.turn}` : `out.${game.time.worldTime}`;
}

/** Register the behaviour type and the hooks that end timed areas. Called once at init. */
export function registerLasting() {
  const { fields } = foundry.data;
  class LastingAreaBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {
    static LOCALIZATION_PREFIXES = ["VARBORG.Area.Lasting.Behavior"];

    static defineSchema() {
      return {
        effects: new fields.ArrayField(new fields.ObjectField()),
        userUuid: new fields.StringField({ required: true, blank: true, initial: "" }),
        userTokenId: new fields.StringField({ required: true, blank: true, initial: "" }),
        name: new fields.StringField({ required: true, blank: true, initial: "" }),
        damageType: new fields.StringField({ required: true, blank: true, initial: "" }),
        // The option chosen (Songs of power: Allegro), and the power's buff for it.
        option: new fields.StringField({ required: true, blank: true, initial: "" }),
        // The user is affected by their own area only when it says so ("you included").
        includesUser: new fields.BooleanField({ initial: false }),
        buffNote: new fields.StringField({ required: true, blank: true, initial: "" }),
        buffEffects: new fields.ArrayField(new fields.ObjectField())
      };
    }

    static events = {
      [CONST.REGION_EVENTS.TOKEN_ENTER]: async function (event) { await onTokenEvent(this, event, "enter"); },
      [CONST.REGION_EVENTS.TOKEN_TURN_START]: async function (event) { await onTokenEvent(this, event, "turnStart"); },
      [CONST.REGION_EVENTS.TOKEN_ROUND_START]: async function (event) { await onTokenEvent(this, event, "roundStart"); },
      // Foundry also sends enter and exit when the area itself appears, moves or goes.
      [CONST.REGION_EVENTS.TOKEN_EXIT]: async function (event) { await onTokenExit(this, event); }
    };
  }
  CONFIG.RegionBehavior.dataModels[LASTING_TYPE] = LastingAreaBehavior;
  CONFIG.RegionBehavior.typeIcons[LASTING_TYPE] = "fa-solid fa-fire-flame-curved";

  Hooks.on("updateCombat", onCombatUpdate);
  Hooks.on("deleteCombat", onCombatEnd);
  Hooks.on("deleteRegion", onRegionDeleted);
}

/* -------------------------------------------- */
/*  Events                                      */
/* -------------------------------------------- */

/** A creature entered, started its turn in, or saw a round start in an area. */
async function onTokenEvent(behavior, event, name) {
  if (!isRunner()) return;
  const token = event.data?.token;
  if (!token?.actor) return;
  const region = behavior.parent.region;
  const triggers = triggersFor(name);
  const effects = behavior.effects.filter(effect => triggers.includes(effect.trigger));
  // While inside: given on entering, and again at the start of each turn
  // inside in case it was taken away meanwhile.
  if (name === "enter" || name === "turnStart") await giveWhileInside(behavior, token);
  if (!effects.length) return;
  // Entering and starting a turn: no more than once per turn (rules: Lingering areas).
  if (name !== "roundStart") {
    const key = `${region.uuid}.${token.id}`;
    const now = turnKey();
    if (!oncePerTurn(lastHit.get(key), now)) return;
    lastHit.set(key, now);
  }
  for (const effect of effects) await applyEffect(behavior, token, effect);
}

/** A creature left: its while-inside conditions from this area end. */
async function onTokenExit(behavior, event) {
  if (!isRunner()) return;
  const token = event.data?.token;
  if (token?.actor) await takeWhileInside(token.actor, behavior.parent.region.uuid);
}

/**
 * The start of a turn: an area whose user's turn it is does its
 * "at the start of each of your turns" effects to everyone inside.
 */
async function onCombatUpdate(combat, changes) {
  if (!isRunner()) return;
  if ("round" in changes) await endTimedAreas(combat);
  if (!("turn" in changes) && !("round" in changes)) return;
  const tokenId = combat.combatant?.tokenId;
  if (!tokenId) return;
  for (const region of combat.scene?.regions ?? canvas.scene?.regions ?? []) {
    for (const behavior of region.behaviors.filter(b => b.type === LASTING_TYPE && !b.disabled)) {
      if (behavior.system.userTokenId !== tokenId) continue;
      const effects = behavior.system.effects.filter(effect => effect.trigger === "userTurn");
      for (const token of region.tokens) {
        for (const effect of effects) await applyEffect(behavior.system, token, effect);
      }
    }
  }
}

/** Timed areas whose round has come leave the map. */
async function endTimedAreas(combat) {
  for (const scene of game.scenes) {
    const ids = scene.regions.filter(region => {
      const ends = region.getFlag(SYSTEM, ENDS_FLAG);
      return ends?.combatId === combat.id && Number.isFinite(ends.endsAtRound) && combat.round >= ends.endsAtRound;
    }).map(region => region.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
}

/** The encounter ended: its timed and encounter-long areas leave the map. */
async function onCombatEnd(combat) {
  if (!isRunner()) return;
  for (const scene of game.scenes) {
    const ids = scene.regions.filter(region => region.getFlag(SYSTEM, ENDS_FLAG)?.combatId === combat.id).map(region => region.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
}

/** An area left the map: the while-inside conditions it gave end. */
async function onRegionDeleted(region) {
  if (!isRunner()) return;
  for (const token of region.parent?.tokens ?? []) {
    if (token.actor) await takeWhileInside(token.actor, region.uuid);
  }
}

/* -------------------------------------------- */
/*  Effects                                     */
/* -------------------------------------------- */

/** Who the creature is to the area's user. */
function relation(behavior, token) {
  const user = token.parent?.tokens.get(behavior.userTokenId);
  const isAlly = user ? token.disposition === user.disposition && token.id !== user.id : false;
  return { isAlly, category: token.actor?.system?.category ?? "" };
}

/**
 * Whether the area leaves this creature alone: its own user, unless the
 * area says "you included" (rules: Emanation, "not the user unless the text
 * says so").
 */
function sparesUser(behavior, token) {
  return token.id === behavior.userTokenId && !behavior.includesUser;
}

/** Do one lasting effect to one creature. */
async function applyEffect(behavior, token, effect) {
  const actor = token.actor;
  if (!actor || sparesUser(behavior, token) || !lastingReaches(effect, relation(behavior, token))) return;
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const name = behavior.name || behavior.parent?.region?.name || "";
  if (effect.kind === "condition" && effect.condition && effect.trigger !== "whileInside") {
    const line = await addTimedCondition(actor, effect.condition, effect.duration?.kind ? effect.duration : null);
    await postLine(actor, i18n.format("VARBORG.Area.Lasting.Caught", { name: actor.name, area: name }), line);
    return;
  }
  if (!effect.formula) return;
  const roll = await new Roll(effect.formula).evaluate().catch(() => null);
  if (!roll) return;
  if (effect.kind === "heal") {
    const hp = actor.system.hp;
    if (!hp) return;
    const to = Math.min(hp.max ?? Infinity, hp.value + roll.total);
    if (to !== hp.value) await actor.update({ "system.hp.value": to });
    await postLine(actor, i18n.format("VARBORG.Area.Lasting.Healed", { name: actor.name, area: name, amount: to - hp.value, formula: effect.formula }), "", [roll]);
    return;
  }
  // Damage: a foe takes it with Inflict damage (its armour soaks); a
  // character or minion defends at Agility DR12 (GAPS 284).
  const type = effect.damageType || behavior.damageType || "";
  if (actor.type === "foe") {
    await inflictDamage(actor, roll.total, actor.system.armour ?? "", name, type, ["area"]);
    return;
  }
  if (!["character", "minion"].includes(actor.type)) return;
  const userActor = behavior.userUuid ? fromUuidSync(behavior.userUuid) : null;
  const button = `<button type="button" data-action="areaDefend" data-actor-uuid="${actor.uuid}" data-damage="${roll.total}" data-name="${esc(name)}"`
    + ` data-caster-uuid="${userActor?.uuid ?? ""}" data-damage-type="${type}">`
    + `<i class="fa-solid fa-shield-halved"></i> ${esc(i18n.format("VARBORG.Area.DefendAs", { name: actor.name, damage: roll.total }))}</button>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${esc(i18n.format("VARBORG.Area.Lasting.Damage", { name: actor.name, area: name, formula: effect.formula, damage: roll.total }))}</p>${button}</div>`,
    rolls: [roll],
    sound: CONFIG.sounds.dice
  });
}

/**
 * Give a creature the area's while-inside conditions it does not already
 * have, and the power's buff (Songs of power: Defying Hymn).
 */
async function giveWhileInside(behavior, token) {
  const actor = token.actor;
  if (!actor || sparesUser(behavior, token)) return;
  const region = behavior.parent.region;
  const inside = behavior.effects
    .filter(effect => effect.trigger === "whileInside")
    .filter(effect => lastingReaches(effect, relation(behavior, token)));
  const i18n = game.i18n;
  const from = behavior.option ? i18n.format("VARBORG.Outcome.SourceOption", { power: behavior.name, option: behavior.option }) : behavior.name;
  // The buff: a temporary feat with the power's buff effects, as the outcome buff is.
  const hasBuff = actor.items.some(item => item.getFlag(SYSTEM, INSIDE_FLAG) === region.uuid);
  if (!hasBuff && inside.some(effect => effect.kind === "buff") && behavior.buffEffects?.length) {
    await actor.createEmbeddedDocuments("Item", [{
      name: i18n.format("VARBORG.Outcome.BuffName", { power: from }),
      type: "feat",
      img: "icons/svg/aura.svg",
      system: {
        description: [behavior.buffNote, i18n.localize("VARBORG.Area.Lasting.WhileInsideNote")].filter(Boolean).join(". "),
        source: "general", effects: foundry.utils.deepClone(behavior.buffEffects), automation: "auto"
      },
      flags: { [SYSTEM]: { [INSIDE_FLAG]: region.uuid } }
    }]);
  }
  const ids = inside
    .filter(effect => effect.kind === "condition" && effect.condition)
    .map(effect => effect.condition)
    .filter(id => !actor.statuses.has(id));
  if (!ids.length) return;
  await actor.createEmbeddedDocuments("ActiveEffect", [...new Set(ids)].map(id => {
    const status = CONFIG.statusEffects.find(entry => entry.id === id);
    return {
      type: "condition",
      name: i18n.format("VARBORG.Outcome.ConditionFrom", { condition: i18n.localize(`VARBORG.Condition.${id}`), from: from || region.name }),
      img: status?.img,
      statuses: [id],
      description: i18n.localize("VARBORG.Area.Lasting.WhileInsideNote"),
      // Named on the sheet and in the Ongoing panel: "From Songs of power: Allegro".
      system: { source: { power: behavior.name, option: behavior.option ?? "", note: i18n.localize("VARBORG.Area.Lasting.WhileInsideShort") } },
      flags: { [SYSTEM]: { [INSIDE_FLAG]: region.uuid } }
    };
  }));
}

/** End the conditions and buff an area gave a creature while it was inside. */
async function takeWhileInside(actor, regionUuid) {
  const ids = actor.effects.filter(effect => effect.getFlag(SYSTEM, INSIDE_FLAG) === regionUuid).map(effect => effect.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  const items = actor.items.filter(item => item.getFlag(SYSTEM, INSIDE_FLAG) === regionUuid).map(item => item.id);
  if (items.length) await actor.deleteEmbeddedDocuments("Item", items);
}

/**
 * Whether a creature holds a condition only because it stands in a lasting
 * area. Such a Quickened or Slowed works at the start of each turn inside
 * and does not end after one turn (module/combat.mjs).
 */
export function heldWhileInside(actor, id) {
  const effects = actor?.effects?.filter(effect => effect.statuses.has(id)) ?? [];
  return effects.length > 0 && effects.every(effect => effect.getFlag(SYSTEM, INSIDE_FLAG));
}

/** A short chat line, with any rolls. */
async function postLine(actor, text, extra = "", rolls = []) {
  const esc = foundry.utils.escapeHTML;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${esc(text)}</p>${extra ? `<p class="modifier">${esc(extra)}</p>` : ""}</div>`,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
}
