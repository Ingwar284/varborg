/**
 * The area of effect field shared by spells, scrolls and powers
 * (playtest feedback). The rules and the text reader are in
 * module/rules/areas.mjs; placing an area on the map is module/areas.mjs.
 */

import { AREA_SHAPES, AREA_AFFECTS, DEFAULT_AREA_WIDTH } from "../rules/areas.mjs";

const { NumberField, StringField, BooleanField, SchemaField } = foundry.data.fields;

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
    includesUser: new BooleanField({ initial: false })
  });
}

/** The choices for the sheet's Area section. */
export const AREA_SHAPE_LABELS = Object.fromEntries(["", ...AREA_SHAPES].map(key => [key, `VARBORG.Area.Shape.${key || "none"}`]));
export const AREA_AFFECTS_LABELS = Object.fromEntries(AREA_AFFECTS.map(key => [key, `VARBORG.Area.Affects.${key}`]));
