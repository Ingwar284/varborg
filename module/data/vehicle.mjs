/**
 * Data for a vehicle (actor type "vehicle"), laid out like the vehicle stat
 * blocks of Subsystem: Vehicles: HP, armour, a speed per Move at safe,
 * normal and fast speed, crew, passengers, fuel and price. Its special
 * rules (the steam wagon's Boiler and Lamps) are feat items.
 *
 * Who is aboard (GAPS 175): actors dragged onto the sheet, each with a
 * role (driver, crew or passenger) and a "strapped in" box. The driver
 * rolls the driving tests; everyone aboard takes collision damage.
 * driveBoon: a Triumph gives Boon on the next driving test this encounter.
 * Cargo (GAPS 178): its items are its cargo. cargoLimit is how many heavy
 * (cumbersome) items it carries, passengerSeats how many passengers; each
 * passenger takes cargoLimit ÷ passengerSeats of room (rounded up).
 */

import { ROLES } from "../rules/vehicles.mjs";
import { FOE_ARMOUR_DICE } from "../rules/foe.mjs";
import { capHp } from "../rules/health.mjs";
import { missingTokenDefaults } from "../rules/tokens.mjs";

const { SchemaField, NumberField, StringField, BooleanField, ArrayField } = foundry.data.fields;

/** A whole number that can never go below `min`. */
function wholeNumber({ min = 0, initial = 0 } = {}) {
  return new NumberField({ required: true, nullable: false, integer: true, min, initial });
}

/** Turn a list of keys into { key: "VARBORG.<prefix>.<key>" } for selects. */
function labels(keys, prefix) {
  return Object.fromEntries(keys.map(key => [key, `VARBORG.${prefix}.${key || "none"}`]));
}

export default class VehicleData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ required: true, initial: "" }),
      hp: new SchemaField({
        value: wholeNumber({ initial: 10 }),
        max: wholeNumber({ initial: 10 })
      }),
      armour: new StringField({ required: true, blank: true, choices: FOE_ARMOUR_DICE, initial: "" }),
      armourName: new StringField({ required: true, blank: true, initial: "" }),
      // Feet per Move action at each speed.
      speed: new SchemaField({
        safe: wholeNumber({ initial: 20 }),
        normal: wholeNumber({ initial: 40 }),
        fast: wholeNumber({ initial: 60 })
      }),
      crew: new StringField({ required: true, blank: true, initial: "" }),
      passengers: new StringField({ required: true, blank: true, initial: "" }),
      passengerSeats: wholeNumber(),
      cargoLimit: wholeNumber(),
      fuel: new StringField({ required: true, blank: true, initial: "" }),
      price: wholeNumber(),
      occupants: new ArrayField(new SchemaField({
        uuid: new StringField({ required: true, blank: false }),
        role: new StringField({ required: true, choices: ROLES, initial: "passenger" }),
        strapped: new BooleanField({ initial: false })
      })),
      driveBoon: new BooleanField({ initial: false })
    };
  }

  static ARMOUR_DICE = labels(FOE_ARMOUR_DICE, "Foe.Armour");
  static ROLES = labels(ROLES, "Vehicle.Role");

  prepareDerivedData() {
    super.prepareDerivedData();
    this.hp.value = capHp(this.hp.value, this.hp.max);
  }

  /** On creation: HP no higher than max HP, and the token defaults (neutral, linked, HP bar). */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const capped = capHp(this.hp.value, this.hp.max);
    if (capped !== this.hp.value) this.parent.updateSource({ "system.hp.value": capped });
    this.parent.updateSource(missingTokenDefaults("vehicle", data));
  }

  /** HP stays at or below max HP. */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const hp = changes.system?.hp;
    if (!hp || !("value" in hp || "max" in hp)) return;
    hp.value = capHp(hp.value ?? this._source.hp.value, hp.max ?? this._source.hp.max);
  }
}
