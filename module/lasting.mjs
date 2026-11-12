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
        damageType: new fields.StringField({ required: true, blank: true, initial: "" })
      };
    }

    static events = {
      [CONST.REGION_EVENTS.TOKEN_ENTER]: async function (event) { await onTokenEvent(this, event, "enter"); },
      [CONST.REGION_EVENTS.TOKEN_TURN_START]: async function (event) { await onTokenEvent(this, event, "turnStart"); },
      [CONST.REGION_EVENTS.TOKEN_ROUND_START]: async function (event) { await onTokenEvent(this, event, "roundStart"); },
      [CONST.REGION_EVENTS.TOKEN_EXIT]: async function (event) { await onTokenExit(this, event); },
      [CONST.REGION_EVENTS.BEHAVIOR_ACTIVATED]: async function () { await onActivated(this); }
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
  if (name === "enter") await giveWhileInside(behavior, token);
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

/** The area was made: creatures already inside get its while-inside conditions. */
async function onActivated(behavior) {
  if (!isRunner()) return;
  for (const token of behavior.parent.region.tokens) await giveWhileInside(behavior, token);
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

/** Do one lasting effect to one creature. */
async function applyEffect(behavior, token, effect) {
  const actor = token.actor;
  if (!actor || !lastingReaches(effect, relation(behavior, token))) return;
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

/** Give a creature the area's while-inside conditions it does not already have. */
async function giveWhileInside(behavior, token) {
  const actor = token.actor;
  if (!actor) return;
  const region = behavior.parent.region;
  const ids = behavior.effects
    .filter(effect => effect.trigger === "whileInside" && effect.kind === "condition" && effect.condition)
    .filter(effect => lastingReaches(effect, relation(behavior, token)))
    .map(effect => effect.condition)
    .filter(id => !actor.statuses.has(id));
  if (!ids.length) return;
  const i18n = game.i18n;
  await actor.createEmbeddedDocuments("ActiveEffect", [...new Set(ids)].map(id => {
    const status = CONFIG.statusEffects.find(entry => entry.id === id);
    return {
      name: i18n.format("VARBORG.Outcome.ConditionFrom", { condition: i18n.localize(`VARBORG.Condition.${id}`), from: behavior.name || region.name }),
      img: status?.img,
      statuses: [id],
      description: i18n.localize("VARBORG.Area.Lasting.WhileInsideNote"),
      flags: { [SYSTEM]: { [INSIDE_FLAG]: region.uuid } }
    };
  }));
}

/** End the conditions an area gave a creature while it was inside. */
async function takeWhileInside(actor, regionUuid) {
  const ids = actor.effects.filter(effect => effect.getFlag(SYSTEM, INSIDE_FLAG) === regionUuid).map(effect => effect.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
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
