/**
 * The power and spell sheets' "What it gives" part (step 51c): one row per
 * outcome entry (rules/outcomes.mjs), with Add and remove buttons. Fields
 * save on change, like the effects part.
 */

import { OUTCOME_KINDS, OUTCOME_WHO, OUTCOME_TIERS, OUTCOME_WHEN, OUTCOME_PERSISTENT, blankOutcome, outcomeOptions } from "../rules/outcomes.mjs";
import { CONDITIONS } from "../rules/conditions.mjs";
import { TIMER_KINDS } from "../rules/timers.mjs";

export const OUTCOMES_TEMPLATE = "systems/var-borg/templates/item/item-outcomes.hbs";

const labels = (keys, prefix) => Object.fromEntries(keys.map(key => [key, `VARBORG.${prefix}.${key}`]));

/** The part's context, or nothing for an item without outcomes. */
export function outcomesContext(document) {
  const list = document.system.outcomeEffects;
  if (!Array.isArray(list)) return {};
  return {
    outcomesPart: {
      kinds: labels(OUTCOME_KINDS, "Outcome.Kind"),
      whos: labels(OUTCOME_WHO, "Outcome.Who"),
      conditions: labels(CONDITIONS, "Condition"),
      durations: { "": "VARBORG.Timer.None", ...labels(TIMER_KINDS, "Timer.Kind") },
      whens: labels(OUTCOME_WHEN, "Outcome.When"),
      persistentTypes: labels(OUTCOME_PERSISTENT, "DamageType"),
      // Options to choose from (GAPS 224): how many a Triumph picks.
      hasOptions: outcomeOptions(list).length > 0,
      triumphPicks: document.system.triumphPicks ?? 1,
      list: list.map((entry, index) => ({
        ...entry,
        index,
        tierList: OUTCOME_TIERS.map(key => ({ key, on: Boolean(entry.tiers?.[key]), label: `VARBORG.Tier.${key}` })),
        isCondition: ["condition", "cure"].includes(entry.kind),
        isHeal: ["heal", "persistent", "damage"].includes(entry.kind),
        isPersistent: entry.kind === "persistent",
        isDamage: entry.kind === "damage",
        isBuff: entry.kind === "buff",
        hasDuration: ["condition", "buff"].includes(entry.kind),
        isRounds: entry.duration?.kind === "rounds"
      }))
    }
  };
}

/** The entries as stored, safe to change. */
function stored(document) {
  return foundry.utils.deepClone(document.toObject().system.outcomeEffects ?? []);
}

async function addOutcome() {
  const list = stored(this.document);
  list.push(blankOutcome());
  await this.document.update({ "system.outcomeEffects": list });
}

async function removeOutcome(event, target) {
  const index = Number(target.closest("[data-outcome-index]")?.dataset.outcomeIndex);
  const list = stored(this.document);
  if (!list[index]) return;
  list.splice(index, 1);
  await this.document.update({ "system.outcomeEffects": list });
}

/** For a sheet's DEFAULT_OPTIONS.actions. */
export const OUTCOME_ACTIONS = { addOutcome, removeOutcome };

/** Called from the sheet's _onRender: saves a changed field. */
export function listenToOutcomes(sheet) {
  for (const input of sheet.element.querySelectorAll("[data-outcome-field]")) {
    input.addEventListener("change", async event => {
      event.stopPropagation();
      const index = Number(input.closest("[data-outcome-index]")?.dataset.outcomeIndex);
      const list = stored(sheet.document);
      if (!list[index]) return;
      foundry.utils.setProperty(list[index], input.dataset.outcomeField, input.type === "checkbox" ? input.checked : input.value);
      // A condition entry needs a condition.
      if (list[index].kind === "condition" && !list[index].condition) list[index].condition = CONDITIONS[0];
      await sheet.document.update({ "system.outcomeEffects": list });
    });
  }
}
