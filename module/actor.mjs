/**
 * The VÅR BORG actor document.
 *
 * Persistent damage needs a type and damage (rules 3.13), so its icon in the
 * token's status effects does not switch on and off like the others: it
 * opens a dialog to add one (module/persistent.mjs). Every other status
 * works as usual.
 *
 * Lowering HP on the token bar of a character at Death's Door kills them:
 * any damage at Death's Door does (rules 3.6). HP is already 0, so the bar
 * itself would not change.
 */

import { PERSISTENT_STATUS, askPersistentDamage } from "./persistent.mjs";
import { killedByDamage } from "./deaths-door.mjs";

export default class VarBorgActor extends foundry.documents.Actor {
  /** @override */
  async toggleStatusEffect(statusId, options = {}) {
    if (statusId === PERSISTENT_STATUS) return askPersistentDamage(this);
    return super.toggleStatusEffect(statusId, options);
  }

  /** @override */
  async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
    if (attribute === "hp") {
      const damage = isDelta ? -value : this.system.hp.value - value;
      if (await killedByDamage(this, damage)) return this;
    }
    return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
  }
}
