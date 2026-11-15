/**
 * Everything going on with a creature right now (player feedback): shown
 * in the Ongoing panel beside Foundry's sidebar (module/ongoing-panel.mjs),
 * and the non-condition part at the top of the character's Conditions tab.
 *
 * Conditions, persistent damage, Panic and injuries already have their own
 * place in the Conditions tab; ongoingEffects() adds the rest:
 * - buffs given by powers and spells, with their timer, "next roll only"
 *   or "while sustained";
 * - powers and spells being Sustained;
 * - items switched on (Barbaric Rage…) or mounted;
 * - a raised shield, cover taken, a lit or dimmed light;
 * - an attack Ruin (Bane on attacks until Recover);
 * - temporary ability changes made with the − and + beside the boxes.
 *
 * In the panel, a left click raises an entry by one and a right click
 * lowers it by one, removing it at 0 (changeOngoing). Each entry says what
 * it allows: `kind` and `ref` name it, `up` and `down` whether the clicks
 * do anything. An entry with no number of its own is removed by a right
 * click. Sustaining, Mounted and an attack Ruin are left alone: ending them
 * has its own button and cost.
 */

import { timerText } from "./timers.mjs";
import { sheetConditions } from "./conditions.mjs";
import { actorLight, putOutActorLight, dimActorLight } from "./light.mjs";
import { takenCover } from "./rules/defence.mjs";
import { ABILITIES } from "./rules/abilities.mjs";
import { stepAbility } from "./rules/origins.mjs";
import { signed } from "./dice/ability-test.mjs";
import { descriptionText } from "./rules/random.mjs";
import { lowerShield } from "./dice/defence.mjs";

const SYSTEM = "var-borg";
const TIMER_FLAG = "timer";

/** Whether a timer counts rounds, so it can go up and down by one. */
function countsRounds(timer) {
  return timer?.kind === "rounds" && Number.isFinite(timer.rounds);
}

/** The status effect that gives a condition, with its timer flag if any. */
function conditionDoc(actor, id) {
  return actor.effects.find(effect => effect.statuses.has(id) && !effect.getFlag(SYSTEM, "panic") && !effect.getFlag(SYSTEM, "agony")) ?? null;
}

/**
 * The ongoing effects that are not conditions.
 * @param {Actor} actor  A character.
 * @returns {{img?: string, icon?: string, label: string, detail: string, kind?: string, ref?: string, up?: boolean, down?: boolean}[]}
 */
export function ongoingEffects(actor) {
  const i18n = game.i18n;
  const list = [];
  const add = (entry) => list.push({ detail: "", kind: "", ref: "", up: false, down: false, ...entry });

  for (const item of actor.items) {
    const buff = item.getFlag(SYSTEM, "buff");
    if (buff) {
      const timer = item.getFlag(SYSTEM, TIMER_FLAG);
      const detail = [
        timerText(timer),
        buff.nextOnly ? i18n.localize("VARBORG.Ongoing.NextOnly") : "",
        buff.sustained ? i18n.localize("VARBORG.Ongoing.WhileSustained") : ""
      ].filter(Boolean).join(", ");
      // What the buff does, such as "allies within 15' defend with -2 DR" (hover, playtest feedback).
      const text = oneLine(item.system.description);
      const shown = [detail, text].filter(Boolean).join(". ");
      add({ img: item.img, label: item.name, detail: shown, kind: "buff", ref: item.id, up: countsRounds(timer), down: true });
    }
    // A buff held while standing in a lasting area (Songs of power: Defying
    // Hymn): it ends on leaving the area, so it has no clicks of its own.
    if (item.getFlag(SYSTEM, "lastingInside")) {
      add({ img: item.img, label: item.name, detail: oneLine(item.system.description) });
    }
    if (item.system?.sustaining) {
      add({ icon: "fa-hourglass-half", label: i18n.format("VARBORG.Ongoing.Sustaining", { name: item.name }) });
    }
    // Switched on: the combat's id, or "" outside combat (step 50c).
    const on = item.getFlag(SYSTEM, "on");
    if (on !== undefined && on !== null && on !== false) {
      add({ icon: "fa-toggle-on", label: i18n.format("VARBORG.Ongoing.SwitchedOn", { name: item.name }), kind: "switchedOn", ref: item.id, down: true });
    }
    if (item.getFlag(SYSTEM, "mounted") === true) {
      add({ icon: "fa-horse", label: i18n.format("VARBORG.Ongoing.Mounted", { name: item.name }) });
    }
  }

  const system = actor.system;
  if (system.shieldRaised) {
    add({
      icon: "fa-shield-halved", label: i18n.localize("VARBORG.Ongoing.ShieldRaised"),
      detail: i18n.localize("VARBORG.Ongoing.UntilTurn"), kind: "shield", down: true
    });
  }
  if (system.cover) {
    const size = i18n.localize(`VARBORG.Cover.Size.${system.cover}`);
    add({
      icon: "fa-person-shelter",
      label: i18n.format("VARBORG.Ongoing.Cover", { size, dr: signed(-takenCover(system.cover)) }),
      detail: i18n.localize("VARBORG.Ongoing.UntilTurn"),
      kind: "cover", up: system.cover === "light", down: true
    });
  }
  const light = actorLight(actor);
  if (light.lit) {
    add({
      icon: "fa-fire-flame-curved", label: i18n.localize(light.dimmed ? "VARBORG.Light.StateDimmed" : "VARBORG.Light.StateLit"),
      kind: "light", up: Boolean(light.dimmed), down: true
    });
  }
  if (system.attackRuin) {
    add({ icon: "fa-heart-crack", label: i18n.localize("VARBORG.Ongoing.AttackRuin"), detail: i18n.localize("VARBORG.Attack.RuinedNow") });
  }
  for (const key of ABILITIES) {
    const change = system.abilityAdjust?.[key] ?? 0;
    if (!change) continue;
    add({
      icon: "fa-arrows-up-down",
      label: i18n.format("VARBORG.Ongoing.Adjust", { ability: i18n.localize(`VARBORG.Ability.${key}`), change: signed(change) }),
      kind: "ability", ref: key, up: true, down: true
    });
  }
  return list;
}

/** An Active Effect's own description, as plain text. */
function effectText(actor, id) {
  return oneLine(actor.effects.get(id)?.description);
}

/** A description as one line of plain text, for a tooltip. */
function oneLine(text) {
  return descriptionText(text ?? "").split("\n").filter(Boolean).join(" ");
}

/**
 * Conditions, persistent damage, Panic and injuries, then the other
 * ongoing effects: the whole list for the Ongoing panel.
 * @param {Actor} actor  A character, foe or minion.
 */
export function allOngoing(actor) {
  const conditions = sheetConditions(actor);
  const fromConditions = [
    ...conditions.list.map(({ id, img, label, timer, text, source }) => ({
      img, label, detail: [timer, text, source].filter(Boolean).join(" "),
      kind: "condition", ref: id,
      // Fatigued has levels; a condition with a rounds timer counts rounds.
      up: id === "fatigued" || countsRounds(conditionDoc(actor, id)?.getFlag(SYSTEM, TIMER_FLAG)), down: true
    })),
    ...(conditions.persistent?.list ?? []).map(({ id, img, label, text }) => ({ img, label, detail: text ?? "", kind: "effect", ref: id, up: false, down: true })),
    // A Panic result and an injury: their rules text, as on the card (hover, playtest feedback).
    ...(conditions.panic?.list ?? []).map(({ id, img, label }) => ({
      img, label, detail: effectText(actor, id), kind: "panic", ref: id,
      up: Number.isFinite(actor.effects.get(id)?.getFlag(SYSTEM, "panic")?.turns), down: true
    })),
    ...(conditions.injuries ?? []).map(({ id, img, label }) => ({ img, label, detail: effectText(actor, id), kind: "effect", ref: id, up: false, down: true }))
  ];
  return [...fromConditions, ...ongoingEffects(actor)].map(entry => ({ kind: "", ref: "", up: false, down: false, ...entry }));
}

/**
 * Raise (+1) or lower (−1) one entry of the Ongoing panel; at 0, or with
 * no number of its own, lowering removes it.
 * @param {Actor} actor
 * @param {string} kind  The entry's kind (see allOngoing).
 * @param {string} ref   Which one: a status id, an effect or item id, an ability.
 * @param {1|-1} step
 */
export async function changeOngoing(actor, kind, ref, step) {
  if (!actor?.isOwner) {
    ui.notifications.warn("VARBORG.Ongoing.NotYours", { localize: true });
    return;
  }
  const up = step > 0;
  switch (kind) {
    case "condition": {
      if (ref === "fatigued") {
        // The Fatigued icon follows the level (module/conditions.mjs).
        await actor.update({ "system.fatigue": Math.max(0, (actor.system.fatigue ?? 0) + step) });
        return;
      }
      const effect = conditionDoc(actor, ref);
      const timer = effect?.getFlag(SYSTEM, TIMER_FLAG);
      if (countsRounds(timer)) {
        const rounds = timer.rounds + step;
        if (rounds > 0) return effect.setFlag(SYSTEM, TIMER_FLAG, { ...timer, rounds });
      } else if (up) return;
      return actor.toggleStatusEffect(ref, { active: false });
    }
    case "panic": {
      const effect = actor.effects.get(ref);
      const panic = effect?.getFlag(SYSTEM, "panic");
      if (!effect) return;
      if (Number.isFinite(panic?.turns)) {
        const turns = panic.turns + step;
        if (turns > 0) return effect.setFlag(SYSTEM, "panic", { ...panic, turns });
      } else if (up) return;
      return effect.delete();
    }
    case "effect":
      // Persistent damage and injuries: no number, so only removed.
      if (!up) await actor.effects.get(ref)?.delete();
      return;
    case "buff": {
      const item = actor.items.get(ref);
      const timer = item?.getFlag(SYSTEM, TIMER_FLAG);
      if (!item) return;
      if (countsRounds(timer)) {
        const rounds = timer.rounds + step;
        if (rounds > 0) return item.setFlag(SYSTEM, TIMER_FLAG, { ...timer, rounds });
      } else if (up) return;
      return item.delete();
    }
    case "switchedOn":
      if (!up) await actor.items.get(ref)?.unsetFlag(SYSTEM, "on");
      return;
    case "shield":
      if (!up) await lowerShield(actor);
      return;
    case "cover": {
      // Heavy ⇄ light ⇄ none.
      const order = ["", "light", "heavy"];
      const next = order[Math.min(2, Math.max(0, order.indexOf(actor.system.cover ?? "") + step))];
      if (next !== actor.system.cover) await actor.update({ "system.cover": next });
      return;
    }
    case "light": {
      // Full ⇄ dimmed (a lantern) ⇄ out. A light put out is spent.
      const light = actorLight(actor);
      if (up) {
        if (light.dimmed) await dimActorLight(actor, false);
      } else if (light.lamp && !light.dimmed) await dimActorLight(actor, true);
      else await putOutActorLight(actor);
      return;
    }
    case "ability": {
      const system = actor.system;
      const next = stepAbility(ref, step, { adjust: system.abilityAdjust?.[ref] ?? 0, sanityLost: system.sanityLost });
      await actor.update({ [`system.abilityAdjust.${ref}`]: next.adjust, "system.sanityLost": next.sanityLost });
      return;
    }
  }
}
