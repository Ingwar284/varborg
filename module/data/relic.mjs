/**
 * Data for a relic (item type "relic"). Carried like gear: a price, a
 * cumbersome box and a container.
 *
 * Rules 4.2 Relics: one effect (the description), a Last Rite, a drawback
 * if it is lost or destroyed, the Expendable d20 trait, and two values: a
 * fence's and its faction's. GAPS 164, 173 and 174.
 * - frequency, frequencyUsed: once per day and the like (step 36b). An
 *   always-on relic is once per day: that is its daily d20.
 * - emberGain: added to the Ember pool when used, such as the Shard of the
 *   Great Brazier's 3 (GAPS 174).
 * - destroyed: used up or burnt out; it stays on the sheet with its
 *   drawback shown until the Dark Master unticks it (GAPS 173).
 */

import { CarriedData } from "./equipment.mjs";
import { frequencyFields, presetFrequency } from "./uses.mjs";

const { NumberField, StringField, BooleanField } = foundry.data.fields;

/** A whole number that can never go below 0. */
function wholeNumber() {
  return new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 });
}

export default class RelicData extends CarriedData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      lastRite: new StringField({ required: true, initial: "" }),
      drawback: new StringField({ required: true, initial: "" }),
      alwaysOn: new BooleanField({ initial: false }),
      emberGain: wholeNumber(),
      destroyed: new BooleanField({ initial: false }),
      saleValue: wholeNumber(),
      factionValue: wholeNumber(),
      faction: new StringField({ required: true, blank: true, initial: "" }),
      ...frequencyFields()
    };
  }

  /** "Once per day" in the text sets the frequency; an always-on relic is once per day. */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    presetFrequency(this, data);
    if (this.alwaysOn) this.parent.updateSource({ "system.frequency": "day" });
  }

  /** Ticking Always on makes the relic once per day: its daily d20. */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const system = changes.system;
    if (!system) return;
    const alwaysOn = system.alwaysOn ?? this.alwaysOn;
    if (alwaysOn && (system.alwaysOn || "frequency" in system)) system.frequency = "day";
  }
}
