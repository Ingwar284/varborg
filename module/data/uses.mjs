/**
 * The fields for a limited use ("once per round/encounter/day"), shared by
 * feats and gear (rules 3.16, GAPS 161, 164). The maths lives in
 * module/rules/uses.mjs.
 */

import { FREQUENCIES, frequencyFromText } from "../rules/uses.mjs";

const { StringField, BooleanField } = foundry.data.fields;

/** frequency: "" (none) or one of FREQUENCIES in rules/uses.mjs; frequencyUsed: used until it comes back. */
export function frequencyFields() {
  return {
    frequency: new StringField({ required: true, blank: true, choices: FREQUENCIES, initial: "" }),
    frequencyUsed: new BooleanField({ initial: false })
  };
}

/** For the item sheet's menu. */
export const FREQUENCY_LABELS = Object.fromEntries(FREQUENCIES.map(key => [key, `VARBORG.Uses.Frequency.${key || "none"}`]));

/**
 * On creation: if nobody set a frequency, take it from the item's text
 * ("Once per day, ..."). The Dark Master can change it.
 * @param {foundry.abstract.TypeDataModel} model
 * @param {object} data  The creation data.
 */
export function presetFrequency(model, data) {
  if (data.system?.frequency !== undefined) return;
  const frequency = frequencyFromText(model.description);
  if (frequency) model.parent.updateSource({ "system.frequency": frequency });
}
