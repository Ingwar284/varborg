/**
 * Data for where a character comes from: class, ancestry and background
 * (item types "class", "ancestry", "background"). A character has one of
 * each. Dropping one on a character sheet applies it (module/origins.mjs).
 *
 * Rules: 2.1 Creating your PC, 2.3 Pick an ancestry, 2.4 Pick a background,
 * 2.5 Pick a class, 2.6 Starting Equipment, GAPS 2, 3, 5, 98–102 and 111.
 */

import { ABILITIES } from "../rules/abilities.mjs";
import { SPELL_LISTS, STARTING_DICE } from "../rules/origins.mjs";
import { WEAPONRY_KEYS } from "../rules/creation.mjs";
import { effectFields } from "./effects.mjs";

const { ArrayField, NumberField, StringField } = foundry.data.fields;

/** A whole number that can never go below `min`. */
function wholeNumber({ min = 0, max, initial = 0 } = {}) {
  return new NumberField({ required: true, nullable: false, integer: true, min, max, initial });
}

/** A text field that must be one of `choices`. */
function choice(choices, initial = choices[0]) {
  return new StringField({ required: true, choices, initial });
}

/** Turn a list of keys into { key: "VARBORG.<prefix>.<key>" } for selects. */
function labels(keys, prefix) {
  return Object.fromEntries(keys.map(key => [key, `VARBORG.${prefix}.${key}`]));
}

/** The class table (rules 2.5): boosted ability, HP, max wounds, spell list, starting die. */
export class ClassData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ required: true, initial: "" }),
      // Goes up 1 while the class is on a character, and is the key
      // ability for powers (GAPS 2).
      boostedAbility: choice(ABILITIES),
      // HP is this number + Toughness, fixed at creation (GAPS 3).
      hpBase: wholeNumber({ initial: 8 }),
      maxWounds: wholeNumber({ initial: 2 }),
      spellList: choice(SPELL_LISTS),
      // The die rolled on the armour and weaponry tables (rules 2.6).
      startingDie: choice(STARTING_DICE),
      // Weapons the class starts with instead of rolling on the weaponry
      // table, such as the Witch Hunter's rapier and pistol (GAPS 183).
      startingWeapons: new ArrayField(new StringField({ required: true, choices: WEAPONRY_KEYS })),
      // What its class feature does (PLAN Milestone 9).
      ...effectFields()
    };
  }

  static ABILITIES = labels(ABILITIES, "Ability");
  static WEAPONRY = labels(WEAPONRY_KEYS, "Creation.Item");
  static SPELL_LISTS = labels(SPELL_LISTS, "Class.SpellList");
  static STARTING_DICE = Object.fromEntries(STARTING_DICE.map(die => [die, die]));
}

/** An ancestry is text only; its feats are separate feat items (rules 2.1, Step 2). */
export class AncestryData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ required: true, initial: "" }),
      ...effectFields()
    };
  }
}

/** A background's wealth and keepsake (rules 2.4). */
export class BackgroundData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({ required: true, initial: "" }),
      // As the rules write it, such as "2d6 × 10 s" (rolled when dropped, GAPS 101).
      wealth: new StringField({ required: true, initial: "2d6 × 10 s" }),
      // Becomes a gear item when dropped (GAPS 100).
      keepsake: new StringField({ required: true, initial: "" })
    };
  }
}
