/**
 * The VÅR BORG Active Effect document.
 *
 * An effect saved before the effect types existed (module/rules/effect-types.mjs)
 * is given its type and data when it loads, worked out from its old flags.
 * The flags stay for now; the world migration removes them.
 */

import { typedEffect } from "./rules/effect-types.mjs";
import { CONDITIONS, IN_DARKNESS } from "./rules/conditions.mjs";

const CONDITION_IDS = [...CONDITIONS, IN_DARKNESS];

export default class VarBorgActiveEffect extends foundry.documents.ActiveEffect {
  /** @override */
  static migrateData(source, options) {
    // A partial update carries only the changes: nothing to work out from.
    if (!options?.partial) {
      const typed = typedEffect(source, CONDITION_IDS);
      if (typed) {
        source.type = typed.type;
        source.system = { ...typed.system, ...(source.system ?? {}) };
      }
    }
    return super.migrateData(source, options);
  }
}
