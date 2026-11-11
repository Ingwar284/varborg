/**
 * Data for a chest (actor type "chest"): a chest, crate, barrel or anything
 * else that holds items. Its items are what is inside; it only has a
 * description of its own. See module/chests.mjs for opening it.
 */

import { missingTokenDefaults } from "../rules/tokens.mjs";

const { StringField } = foundry.data.fields;

export default class ChestData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ required: true, initial: "" })
    };
  }

  /** On creation: the token defaults (neutral, not linked, no bars). */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    this.parent.updateSource(missingTokenDefaults("chest", data));
  }
}
