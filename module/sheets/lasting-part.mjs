/**
 * The Lasting area part of the spell and power sheets (lingering areas,
 * GAPS 284): how long the area stays, whether it is difficult terrain, and
 * a list of effects. Like the outcome list, each change saves the whole
 * list (module/sheets/outcomes-part.mjs).
 */

import { blankLastingEffect } from "../rules/lasting.mjs";
import { outcomeOptions } from "../rules/outcomes.mjs";
import { DEFAULT_AREA_WIDTH } from "../rules/areas.mjs";
import { FOE_CATEGORIES } from "../rules/foe.mjs";
import { CONDITIONS } from "../rules/conditions.mjs";
import { TIMER_KINDS } from "../rules/timers.mjs";
import { AREA_SHAPE_LABELS, AREA_AFFECTS_LABELS, LASTING_DURATION_LABELS, LASTING_TRIGGER_LABELS, LASTING_KIND_LABELS } from "../data/area.mjs";

const labels = (keys, prefix) => Object.fromEntries(keys.map(key => [key, `VARBORG.${prefix}.${key}`]));

/** The part's context: the choices, and each effect row. */
export function lastingContext(system, damageTypes) {
  const lasting = system.area?.lasting;
  if (!lasting) return {};
  return {
    lastingPart: {
      durations: LASTING_DURATION_LABELS,
      isRounds: lasting.duration === "rounds",
      triggers: LASTING_TRIGGER_LABELS,
      kinds: LASTING_KIND_LABELS,
      affects: AREA_AFFECTS_LABELS,
      conditions: labels(CONDITIONS, "Condition"),
      timers: { "": "VARBORG.Timer.None", ...labels(TIMER_KINDS, "Timer.Kind") },
      damageTypes,
      list: lasting.effects.map((effect, index) => ({
        ...effect,
        index,
        isCondition: effect.kind === "condition",
        hasFormula: effect.kind !== "condition",
        isDamage: effect.kind === "damage",
        hasTimer: effect.kind === "condition" && effect.trigger !== "whileInside",
        isTimerRounds: ["rounds", "escapeStart", "escapeEnd"].includes(effect.duration?.kind),
        categoryList: FOE_CATEGORIES.filter(Boolean).map(key => ({
          key, label: `VARBORG.Foe.Category.${key}`, on: (effect.categories ?? []).includes(key)
        }))
      }))
    }
  };
}

function stored(document) {
  return foundry.utils.deepClone(document.toObject().system.area?.lasting?.effects ?? []);
}

async function addLastingEffect() {
  const list = stored(this.document);
  list.push(blankLastingEffect());
  await this.document.update({ "system.area.lasting.effects": list });
}

async function removeLastingEffect(event, target) {
  const index = Number(target.closest("[data-lasting-index]")?.dataset.lastingIndex);
  const list = stored(this.document);
  if (!list[index]) return;
  list.splice(index, 1);
  await this.document.update({ "system.area.lasting.effects": list });
}

export const LASTING_ACTIONS = { addLastingEffect, removeLastingEffect };

/** Each field in an effect row saves the whole list. Called from the sheet's _onRender. */
export function listenToLasting(sheet) {
  for (const input of sheet.element.querySelectorAll("[data-lasting-field]")) {
    input.addEventListener("change", async event => {
      event.stopPropagation();
      const index = Number(input.closest("[data-lasting-index]")?.dataset.lastingIndex);
      const list = stored(sheet.document);
      if (!list[index]) return;
      const field = input.dataset.lastingField;
      if (field === "categories") {
        const set = new Set(list[index].categories ?? []);
        if (input.checked) set.add(input.value);
        else set.delete(input.value);
        list[index].categories = [...set];
      } else foundry.utils.setProperty(list[index], field, input.value);
      await sheet.document.update({ "system.area.lasting.effects": list });
    });
  }
}

/* -------------------------------------------- */
/*  An area for each option (Songs of power)    */
/* -------------------------------------------- */

/** One row per option the item's outcomes name, with its own area if it has one. */
export function optionAreasContext(system) {
  const names = outcomeOptions(system.outcomeEffects ?? []);
  if (!names.length || !system.area) return {};
  const stored = system.area.options ?? [];
  return {
    optionAreas: {
      shapes: AREA_SHAPE_LABELS,
      affects: AREA_AFFECTS_LABELS,
      list: names.map(option => {
        const own = stored.find(entry => entry.option === option) ?? {};
        return { option, shape: own.shape ?? "", size: own.size ?? 0, range: own.range ?? 0, affects: own.affects ?? "all", includesUser: Boolean(own.includesUser), isBurst: own.shape === "burst" };
      })
    }
  };
}

/** Each field in an option row saves the whole list. Called from the sheet's _onRender. */
export function listenToOptionAreas(sheet) {
  for (const input of sheet.element.querySelectorAll("[data-option-area]")) {
    input.addEventListener("change", async event => {
      event.stopPropagation();
      const option = input.closest("[data-option-name]")?.dataset.optionName;
      if (!option) return;
      const list = foundry.utils.deepClone(sheet.document.toObject().system.area?.options ?? []);
      let entry = list.find(other => other.option === option);
      if (!entry) {
        entry = { option, shape: "", size: 0, range: 0, width: DEFAULT_AREA_WIDTH, affects: "all", includesUser: false };
        list.push(entry);
      }
      const field = input.dataset.optionArea;
      entry[field] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) || 0 : input.value;
      await sheet.document.update({ "system.area.options": list });
    });
  }
}
