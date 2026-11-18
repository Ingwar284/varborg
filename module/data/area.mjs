/**
 * The area of effect field shared by spells, scrolls, powers, gear and
 * weapons (playtest feedback; gear and grenades, GAPS 314). The rules and the text reader are in
 * module/rules/areas.mjs and module/rules/lasting.mjs; placing an area on
 * the map is module/areas.mjs, and lasting areas module/lasting.mjs.
 */

import { AREA_SHAPES, AREA_AFFECTS, DEFAULT_AREA_WIDTH } from "../rules/areas.mjs";
import { LASTING_DURATIONS, LASTING_TRIGGERS, LASTING_KINDS, isLastingRounds } from "../rules/lasting.mjs";
import { CONDITIONS } from "../rules/conditions.mjs";
import { DAMAGE_TYPES } from "../rules/equipment.mjs";
import { FOE_CATEGORIES } from "../rules/foe.mjs";
import { TIMER_KINDS } from "../rules/timers.mjs";

const { NumberField, StringField, BooleanField, SchemaField, ArrayField } = foundry.data.fields;

/** One lasting effect: when, what, and to whom. */
function lastingEffectField() {
  return new SchemaField({
    trigger: new StringField({ required: true, choices: LASTING_TRIGGERS, initial: LASTING_TRIGGERS[0] }),
    kind: new StringField({ required: true, choices: LASTING_KINDS, initial: LASTING_KINDS[0] }),
    // Damage or healing dice, such as "d4".
    formula: new StringField({ required: true, initial: "" }),
    damageType: new StringField({ required: true, blank: true, choices: ["", ...DAMAGE_TYPES], initial: "" }),
    condition: new StringField({ required: true, blank: true, choices: ["", ...CONDITIONS], initial: "" }),
    // How long a condition given on entering or at the start of a turn
    // lasts ("Slowed until the end of their turn"); a whileInside
    // condition lasts while the creature is inside.
    duration: new SchemaField({
      kind: new StringField({ required: true, blank: true, choices: ["", ...TIMER_KINDS], initial: "" }),
      rounds: new StringField({ required: true, initial: "1" })
    }),
    affects: new StringField({ required: true, choices: AREA_AFFECTS, initial: "all" }),
    // Only foes of these categories ("Undead, fiends and duskborn"); empty for any.
    categories: new ArrayField(new StringField({ required: true, choices: FOE_CATEGORIES.filter(Boolean) })),
    // Only when this option was chosen (Songs of power: Allegro); blank for always.
    option: new StringField({ required: true, initial: "" })
  });
}

/** system.area: blank shape for none. Sizes are in feet. */
export function areaField() {
  const feet = initial => new NumberField({ required: true, nullable: false, integer: true, min: 0, initial });
  return new SchemaField({
    // emanation, burst, cone, line or wall; blank for none.
    shape: new StringField({ required: true, blank: true, choices: ["", ...AREA_SHAPES], initial: "" }),
    // The radius (emanation, burst) or length (cone, line, wall).
    size: feet(0),
    // A burst: how far away its point may be; 0 for no limit.
    range: feet(0),
    // A line's or wall's width.
    width: feet(DEFAULT_AREA_WIDTH),
    // Everyone, or only foes or allies.
    affects: new StringField({ required: true, choices: AREA_AFFECTS, initial: "all" }),
    // The user is caught too ("you included").
    includesUser: new BooleanField({ initial: false }),
    // Gear and grenades: tossed with Agility DR12 to land (GAPS 314, module/rules/toss.mjs).
    toss: new BooleanField({ initial: false }),
    // A tossed area's size on a Success (and a Ruin); 0 for the same size on every result.
    successSize: feet(0),
    // An area for each option that has its own (Songs of power): it takes
    // the place of the area above when that option is chosen.
    options: new ArrayField(new SchemaField({
      option: new StringField({ required: true, initial: "" }),
      shape: new StringField({ required: true, blank: true, choices: ["", ...AREA_SHAPES], initial: "" }),
      size: feet(0),
      range: feet(0),
      width: feet(DEFAULT_AREA_WIDTH),
      affects: new StringField({ required: true, choices: AREA_AFFECTS, initial: "all" }),
      includesUser: new BooleanField({ initial: false })
    })),
    // An area that stays on the map after it is used (lingering areas).
    lasting: new SchemaField({
      // "" while Sustained (or not at all), "rounds", "encounter" or
      // "removed" (until the Dark Master removes it, GAPS 314).
      duration: new StringField({ required: true, blank: true, choices: LASTING_DURATIONS, initial: "" }),
      // A number, or dice rolled when the area is placed ("d6", GAPS 314).
      // Old areas stored a number; it is read as text.
      rounds: new StringField({ required: true, initial: "1", validate: value => isLastingRounds(value) }),
      // Difficult terrain while it lasts.
      difficult: new BooleanField({ initial: false }),
      // Gone after its first effect (a Bear trap, sprung, GAPS 314).
      once: new BooleanField({ initial: false }),
      // Only the Dark Master sees it on the map (a Bear trap, GAPS 314).
      hidden: new BooleanField({ initial: false }),
      effects: new ArrayField(lastingEffectField())
    })
  });
}

/** The choices for the sheet's Area section. */
export const AREA_SHAPE_LABELS = Object.fromEntries(["", ...AREA_SHAPES].map(key => [key, `VARBORG.Area.Shape.${key || "none"}`]));
export const AREA_AFFECTS_LABELS = Object.fromEntries(AREA_AFFECTS.map(key => [key, `VARBORG.Area.Affects.${key}`]));
export const LASTING_DURATION_LABELS = Object.fromEntries(LASTING_DURATIONS.map(key => [key, `VARBORG.Area.Lasting.Duration.${key || "none"}`]));
export const LASTING_TRIGGER_LABELS = Object.fromEntries(LASTING_TRIGGERS.map(key => [key, `VARBORG.Area.Lasting.Trigger.${key}`]));
export const LASTING_KIND_LABELS = Object.fromEntries(LASTING_KINDS.map(key => [key, `VARBORG.Area.Lasting.Kind.${key}`]));
