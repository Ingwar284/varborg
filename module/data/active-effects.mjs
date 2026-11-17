/**
 * Data for each type of Active Effect (module/rules/effect-types.mjs).
 * What used to be kept in flags.var-borg is kept here, in effect.system.
 */

const { StringField, NumberField, BooleanField, ObjectField } = foundry.data.fields;

const text = () => new StringField({ required: true, blank: true, initial: "" });
const maybeNumber = () => new NumberField({ required: false, nullable: true, initial: null });

/** A condition of rules 3.13, or the In Darkness marker. */
export class ConditionEffectData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // The timer of module/rules/timers.mjs: {kind, rounds?, dr?, freshTurn?}.
      timer: new ObjectField({ required: false, nullable: true, initial: null }),
      // The power that gave it: {power, option, note}.
      source: new ObjectField({ required: false, nullable: true, initial: null })
    };
  }
}

/** Persistent damage: d4 fire and so on. */
export class PersistentEffectData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      damageType: text(),
      formula: text(),
      // The chat card whose test was last rolled for it.
      testedOn: new StringField({ required: false, nullable: true, blank: true, initial: null })
    };
  }
}

/** A lasting Panic result. */
export class PanicEffectData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      result: text(),
      turns: maybeNumber(),
      hours: maybeNumber(),
      endsAt: maybeNumber(),
      freshTurn: new BooleanField({ initial: false })
    };
  }
}

/** An injury from the Table of Agony. */
export class InjuryEffectData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { result: text() };
  }
}

/** A body part lost at Death's Door. */
export class BodyPartEffectData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { part: text() };
  }
}

/** Each type and its data, for CONFIG.ActiveEffect.dataModels. */
export const EFFECT_DATA_MODELS = {
  condition: ConditionEffectData,
  persistent: PersistentEffectData,
  panic: PanicEffectData,
  injury: InjuryEffectData,
  bodyPart: BodyPartEffectData
};
