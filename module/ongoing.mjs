/**
 * Everything going on with a creature right now, as one list of effects
 * (unified effects, step 4): the Ongoing panel beside Foundry's sidebar
 * (module/ongoing-panel.mjs), and in step 5 the Effects tab and the icon
 * strip on the sheet.
 *
 * actorEffects() gives one row per thing, each with a kind and its type
 * tag (module/rules/effect-kinds.mjs):
 * - conditions, one row per condition effect, with their timer and the
 *   power that gave them; Fatigued with its level; Death's Door with its
 *   stage; the In Darkness marker (GAPS 274: a marker, not a condition);
 * - persistent damage, Panic results, injuries and lost body parts;
 * - days without food (characters);
 * - buffs given by powers and spells, with their timer, "next roll only"
 *   or "while sustained", and buffs held inside a lasting area;
 * - powers and spells being Sustained, items switched on or mounted;
 * - a raised shield, cover taken, an attack Ruin, a lit or dimmed light;
 * - temporary ability changes made with the − and + beside the boxes.
 *
 * A left click raises a row by one and a right click lowers it by one,
 * removing it at 0 (changeOngoing). Each row says what it allows: `kind`
 * and `ref` name it, `up` and `down` whether the clicks do anything. A row
 * with no number of its own is removed by a right click. Sustaining,
 * Mounted, an attack Ruin, an area's buff, Death's Door and In Darkness
 * are left alone: they end their own way.
 */

import { timerText, timerOf, setTimer, askConditionTimer } from "./timers.mjs";
import { conditionDetails } from "./conditions.mjs";
import { sheetDeathsDoor } from "./deaths-door.mjs";
import { panicLabel, panicName, addPanicResult } from "./panic.mjs";
import { askPersistentDamage, tickPersistentDamage } from "./persistent.mjs";
import { PANIC_EFFECTS } from "./rules/panic.mjs";
import { CONDITIONS, IN_DARKNESS } from "./rules/conditions.mjs";
import { isStarving } from "./rules/days.mjs";
import { effectTag, sortEffects, steppedCount, rowButtons } from "./rules/effect-kinds.mjs";
import { actorLight, putOutActorLight, dimActorLight } from "./light.mjs";
import { takenCover } from "./rules/defence.mjs";
import { ABILITIES } from "./rules/abilities.mjs";
import { stepAbility } from "./rules/origins.mjs";
import { signed } from "./dice/ability-test.mjs";
import { descriptionText } from "./rules/random.mjs";
import { lowerShield } from "./dice/defence.mjs";

const SYSTEM = "var-borg";

/** Whether a timer counts rounds, so it can go up and down by one. */
function countsRounds(timer) {
  return timer?.kind === "rounds" && Number.isFinite(timer.rounds);
}

/**
 * The ongoing effects that are not Active Effects: buffs, items in use,
 * shield, cover, light, attack Ruin and ability changes.
 * @param {Actor} actor  A character, foe or minion.
 * @returns {{img?: string, icon?: string, label: string, detail: string, kind?: string, ref?: string, up?: boolean, down?: boolean}[]}
 */
export function ongoingEffects(actor) {
  const i18n = game.i18n;
  const list = [];
  const add = (entry) => list.push({ detail: "", kind: "", ref: "", up: false, down: false, ...entry });

  for (const item of actor.items) {
    const buff = item.getFlag(SYSTEM, "buff");
    if (buff) {
      const timer = timerOf(item);
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
      add({ img: item.img, label: item.name, detail: oneLine(item.system.description), kind: "area" });
    }
    if (item.system?.sustaining) {
      add({ icon: "fa-hourglass-half", label: i18n.format("VARBORG.Ongoing.Sustaining", { name: item.name }), kind: "sustaining" });
    }
    // Switched on: the combat's id, or "" outside combat (step 50c).
    const on = item.getFlag(SYSTEM, "on");
    if (on !== undefined && on !== null && on !== false) {
      add({ icon: "fa-toggle-on", label: i18n.format("VARBORG.Ongoing.SwitchedOn", { name: item.name }), kind: "switchedOn", ref: item.id, down: true });
    }
    if (item.getFlag(SYSTEM, "mounted") === true) {
      add({ icon: "fa-horse", label: i18n.format("VARBORG.Ongoing.Mounted", { name: item.name }), kind: "mounted" });
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
    add({ icon: "fa-heart-crack", label: i18n.localize("VARBORG.Ongoing.AttackRuin"), detail: i18n.localize("VARBORG.Attack.RuinedNow"), kind: "attackRuin" });
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

/** A description as one line of plain text, for a tooltip. */
function oneLine(text) {
  return descriptionText(text ?? "").split("\n").filter(Boolean).join(" ");
}

/** The rows that come from the creature's Active Effects, and its days without food. */
function effectRows(actor) {
  const i18n = game.i18n;
  const rows = [];
  const conditionIds = new Set(CONDITIONS);
  const deathsDoor = sheetDeathsDoor(actor);
  let fatigueShown = false;

  for (const effect of actor.effects) {
    if (effect.disabled) continue;
    switch (effect.type) {
      case "condition": {
        const id = [...effect.statuses][0] ?? "";
        if (id === IN_DARKNESS) {
          rows.push({ img: effect.img, label: i18n.localize(`VARBORG.Condition.${IN_DARKNESS}`), detail: i18n.localize("VARBORG.Ongoing.InDarknessText"), kind: "marker" });
          break;
        }
        if (!conditionIds.has(id)) break;
        // Fatigued has levels: one row for the level, however many effects give it.
        if (id === "fatigued") {
          if (fatigueShown) break;
          fatigueShown = true;
          const { img, label, text } = conditionDetails(actor, id, effect);
          rows.push({ img, label, detail: text, kind: "fatigue", up: true, down: true });
          break;
        }
        const { img, label, text, source } = conditionDetails(actor, id, effect);
        const timer = effect.system.timer;
        const stage = id === "deathsDoor" ? deathsDoor?.status ?? "" : "";
        rows.push({
          img, label, detail: [timerText(timer), stage, text, source].filter(Boolean).join(" "),
          kind: "condition", ref: effect.id,
          // The condition, for the sheet's timer button (Fatigued and Death's Door have none).
          timerFor: id === "deathsDoor" ? "" : id,
          // Death's Door ends through its own buttons and rolls.
          up: id !== "deathsDoor" && countsRounds(timer), down: id !== "deathsDoor"
        });
        break;
      }
      case "persistent":
        rows.push({ img: effect.img, label: effect.name, detail: i18n.localize(`VARBORG.Condition.${actor.type === "foe" ? "FoeText" : "Text"}.persistentDamage`), kind: "persistent", ref: effect.id, down: true });
        break;
      case "panic":
        // A Panic result and an injury: their rules text, as on the card (hover, playtest feedback).
        rows.push({
          img: effect.img, label: panicLabel(effect), detail: oneLine(effect.description), kind: "panic", ref: effect.id,
          up: Number.isFinite(effect.system.turns), down: true
        });
        break;
      case "injury":
        rows.push({ img: effect.img, label: effect.name, detail: oneLine(effect.description), kind: "injury", ref: effect.id, down: true });
        break;
      case "bodyPart":
        rows.push({ img: effect.img, label: effect.name, detail: oneLine(effect.description), kind: "bodyPart", ref: effect.id, down: true });
        break;
    }
  }

  // A Fatigue level with no icon yet (the icon follows the level, module/conditions.mjs).
  if (!fatigueShown && actor.system.fatigue > 0) {
    const { img, label, text } = conditionDetails(actor, "fatigued");
    rows.push({ img, label, detail: text, kind: "fatigue", up: true, down: true });
  }

  // Days without food: characters only (rules 3.16, module/days.mjs).
  const days = actor.type === "character" ? actor.system.daysWithoutFood ?? 0 : 0;
  if (days > 0) {
    rows.push({
      icon: "fa-utensils",
      label: i18n.format(isStarving(days) ? "VARBORG.Ongoing.Starving" : days === 1 ? "VARBORG.Ongoing.HungryOne" : "VARBORG.Ongoing.Hungry", { days }),
      detail: i18n.localize("VARBORG.Day.WithoutFoodHint"),
      kind: "hunger", up: true, down: true
    });
  }
  return rows;
}

/**
 * The whole list of effects for one creature, in list order, each row
 * with its kind's type tag.
 * @param {Actor} actor  A character, foe or minion.
 * @returns {{img?: string, icon?: string, label: string, detail: string, kind: string, tag: string, ref: string, up: boolean, down: boolean}[]}
 */
export function actorEffects(actor) {
  const rows = [...effectRows(actor), ...ongoingEffects(actor)]
    .map(entry => ({ detail: "", ref: "", up: false, down: false, ...entry, tag: effectTag(entry.kind) }));
  return sortEffects(rows);
}

/**
 * The Effects tab of a sheet: every row with its tag and buttons, and what
 * the Add menu offers. Conditions are for everyone; Panic results only for
 * characters, added by the Dark Master; persistent damage opens its dialog.
 * @param {Actor} actor  A character, foe or minion.
 */
export function sheetEffects(actor) {
  const i18n = game.i18n;
  const rows = actorEffects(actor).map(row => ({
    ...row,
    tagLabel: row.tag ? i18n.localize(`VARBORG.Ongoing.Tag.${row.tag}`) : "",
    buttons: rowButtons(row)
  }));
  return {
    rows,
    canChange: actor.isOwner,
    conditions: CONDITIONS.filter(id => !actor.statuses.has(id))
      .map(id => ({ id, label: i18n.localize(`VARBORG.Condition.${id}`) })),
    panic: actor.type === "character" && game.user.isGM
      ? PANIC_EFFECTS.map(id => ({ id, label: panicName(id) }))
      : null,
    canTick: game.user.isGM
  };
}

/**
 * The Effects tab's controls: each row's −, + and × (the same as the
 * Ongoing panel's clicks), a condition's timer button, the Add menu and
 * the Dark Master's Tick button. Called from the sheets' _onRender.
 */
export function activateEffectControls(element, actor) {
  for (const button of element.querySelectorAll("[data-effect-step]")) {
    button.addEventListener("click", event => {
      event.preventDefault();
      const { kind, ref, effectStep } = button.dataset;
      changeOngoing(actor, kind, ref, Number(effectStep));
    });
  }
  for (const button of element.querySelectorAll("[data-time-condition]")) {
    button.addEventListener("click", () => askConditionTimer(actor, button.dataset.timeCondition));
  }
  element.querySelector("select[data-add-effect]")?.addEventListener("change", event => {
    const value = event.currentTarget.value;
    event.currentTarget.value = "";
    const [type, id] = value.split(":");
    if (type === "condition" && CONDITIONS.includes(id)) actor.toggleStatusEffect(id, { active: true });
    else if (type === "persistent") askPersistentDamage(actor);
    else if (type === "panic") addPanicResult(actor, id);
  });
  element.querySelector("[data-tick-persistent]")?.addEventListener("click", () => tickPersistentDamage(actor));
}

/**
 * Raise (+1) or lower (−1) one entry of the Ongoing panel; at 0, or with
 * no number of its own, lowering removes it.
 * @param {Actor} actor
 * @param {string} kind  The entry's kind (see actorEffects).
 * @param {string} ref   Which one: an effect or item id, an ability.
 * @param {1|-1} step
 */
export async function changeOngoing(actor, kind, ref, step) {
  if (!actor?.isOwner) {
    ui.notifications.warn("VARBORG.Ongoing.NotYours", { localize: true });
    return;
  }
  const up = step > 0;
  switch (kind) {
    case "fatigue":
      // The Fatigued icon follows the level (module/conditions.mjs).
      await actor.update({ "system.fatigue": steppedCount(actor.system.fatigue, step) });
      return;
    case "hunger":
      await actor.update({ "system.daysWithoutFood": steppedCount(actor.system.daysWithoutFood, step) });
      return;
    case "condition": {
      const effect = actor.effects.get(ref);
      if (effect?.type !== "condition" || effect.statuses.has("deathsDoor")) return;
      const timer = timerOf(effect);
      if (countsRounds(timer)) {
        const rounds = timer.rounds + step;
        if (rounds > 0) return setTimer(effect, { ...timer, rounds });
      } else if (up) return;
      return effect.delete();
    }
    case "panic": {
      const effect = actor.effects.get(ref);
      if (effect?.type !== "panic") return;
      if (Number.isFinite(effect.system.turns)) {
        const turns = effect.system.turns + step;
        if (turns > 0) return effect.update({ "system.turns": turns });
      } else if (up) return;
      return effect.delete();
    }
    case "persistent":
    case "injury":
    case "bodyPart":
      // No number of their own, so only removed.
      if (!up) await actor.effects.get(ref)?.delete();
      return;
    case "buff": {
      const item = actor.items.get(ref);
      if (!item) return;
      const timer = timerOf(item);
      if (countsRounds(timer)) {
        const rounds = timer.rounds + step;
        if (rounds > 0) return setTimer(item, { ...timer, rounds });
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
