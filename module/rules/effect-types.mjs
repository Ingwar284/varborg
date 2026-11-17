/**
 * The types of Active Effect a creature can carry (unified effects, step 1).
 *
 * Every lasting state that is an Active Effect has a type, so code and the
 * sheets can tell them apart without guessing from flags:
 * - condition:  a condition of rules 3.13, or the In Darkness marker;
 * - persistent: persistent damage (fire, bleed, acid, poison);
 * - panic:      a lasting Panic result;
 * - injury:     an injury from the Table of Agony;
 * - bodyPart:   a body part lost at Death's Door.
 * Any other effect keeps Foundry's own "base" type.
 *
 * Effects saved before the types existed kept what they were in flags
 * (flags.var-borg.panic, .agony, .persistent, .bodyPart, .timer, .source).
 * typedEffect() works out the type and its data from those flags, so old
 * effects load as typed ones. No Foundry here: tested in
 * tests/effect-types.test.mjs.
 */

export const EFFECT_TYPES = ["condition", "persistent", "panic", "injury", "bodyPart"];

/** Foundry's own type for an effect with no type of its own. */
export const BASE_TYPE = "base";

const SYSTEM = "var-borg";

/**
 * The type and system data for an effect saved before the types existed.
 * @param {object} source  The effect's saved data.
 * @param {Iterable<string>} conditionIds  The statuses that are conditions (and In Darkness).
 * @returns {{type: string, system: object}|null}  null when the effect stays as it is.
 */
export function typedEffect(source, conditionIds) {
  if (!source || (source.type && source.type !== BASE_TYPE)) return null;
  const flags = source.flags?.[SYSTEM] ?? {};
  const number = value => (Number.isFinite(value) ? value : null);

  if (flags.persistent) {
    return {
      type: "persistent",
      system: {
        damageType: flags.persistent.type ?? "",
        formula: flags.persistent.formula ?? "",
        testedOn: flags.testedOn ?? null
      }
    };
  }
  if (flags.panic) {
    const panic = flags.panic;
    return {
      type: "panic",
      system: {
        result: panic.result ?? "",
        turns: number(panic.turns),
        hours: number(panic.hours),
        endsAt: number(panic.endsAt),
        freshTurn: Boolean(panic.freshTurn)
      }
    };
  }
  if (flags.agony) return { type: "injury", system: { result: flags.agony.result ?? "" } };
  if (flags.bodyPart) return { type: "bodyPart", system: { part: flags.bodyPart.part ?? "" } };

  const conditions = new Set(conditionIds);
  const statuses = [...(source.statuses ?? [])];
  if (statuses.length && statuses.every(id => conditions.has(id))) {
    return { type: "condition", system: { timer: flags.timer ?? null, source: flags.source ?? null } };
  }
  return null;
}
