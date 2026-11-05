/**
 * Data for a feat (item type "feat"): ancestry, class and general feats for
 * characters, and passives for foes. For now a feat is text only; the
 * system does not apply its effect.
 *
 * Rules: 3.10 Feats and powers, 4.6 Feats, 6. Designing Foes (passives),
 * 2.8 Improving, GAPS 16 and 57.
 */

import { FEAT_SOURCES } from "../rules/feats.mjs";
import { frequencyFields, presetFrequency } from "./uses.mjs";
import { markImprovingFeat, endChoiceWith } from "../improving.mjs";
import { effectFields } from "./effects.mjs";

const { StringField, BooleanField } = foundry.data.fields;

export default class FeatData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ required: true, initial: "" }),
      source: new StringField({ required: true, choices: FEAT_SOURCES, initial: FEAT_SOURCES[0] }),
      // The ancestry or class it belongs to, by name, such as "Human" (GAPS 180).
      belongsTo: new StringField({ required: true, initial: "" }),
      // Gained through Improving (rules 2.8). Only these count for the
      // Death's Door Sanity test (GAPS 16).
      improving: new BooleanField({ initial: false }),
      // Once per round, encounter or day, and whether it is used (GAPS 161).
      ...frequencyFields(),
      // What it does, and how far it is automated (PLAN Milestone 9).
      ...effectFields()
    };
  }

  /**
   * On creation, "Once per day" in the text sets the frequency (GAPS 164).
   * While its character is choosing the feat of an Improving, it is marked
   * "Gained through Improving" (rules 2.8, module/improving.mjs).
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    presetFrequency(this, data);
    markImprovingFeat(this);
  }

  /** The feat of an Improving ends the choice. */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    endChoiceWith(this.parent, userId);
  }

  static SOURCES = Object.fromEntries(FEAT_SOURCES.map(key => [key, `VARBORG.Feat.Source.${key}`]));
}
