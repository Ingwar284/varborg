/**
 * The VÅR BORG actor document.
 *
 * Persistent damage needs a type and damage (rules 3.13), so its icon in the
 * token's status effects does not switch on and off like the others: it
 * opens a dialog to add one (module/persistent.mjs). Every other status
 * works as usual.
 */

import { PERSISTENT_STATUS, askPersistentDamage } from "./persistent.mjs";

export default class VarBorgActor extends foundry.documents.Actor {
  /** @override */
  async toggleStatusEffect(statusId, options = {}) {
    if (statusId === PERSISTENT_STATUS) return askPersistentDamage(this);
    return super.toggleStatusEffect(statusId, options);
  }
}
