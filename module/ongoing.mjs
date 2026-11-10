/**
 * Everything going on with a character right now (player feedback): shown
 * in the sidebar of the character sheet and at the top of its Conditions
 * tab.
 *
 * Conditions, persistent damage, Panic and injuries already have their own
 * place in the Conditions tab; ongoingEffects() adds the rest:
 * - buffs given by powers and spells, with their timer, "next roll only"
 *   or "while sustained";
 * - powers and spells being Sustained;
 * - items switched on (Barbaric Rage…) or mounted;
 * - a raised shield, cover taken, a lit or dimmed light;
 * - an attack Ruin (Bane on attacks until Recover);
 * - temporary ability changes made with the − and + beside the boxes.
 */

import { timerText } from "./timers.mjs";
import { actorLight } from "./light.mjs";
import { takenCover } from "./rules/defence.mjs";
import { ABILITIES } from "./rules/abilities.mjs";
import { signed } from "./dice/ability-test.mjs";

const SYSTEM = "var-borg";

/**
 * The ongoing effects that are not conditions.
 * @param {Actor} actor  A character.
 * @returns {{img?: string, icon?: string, label: string, detail: string}[]}
 */
export function ongoingEffects(actor) {
  const i18n = game.i18n;
  const list = [];
  const add = (entry) => list.push({ detail: "", ...entry });

  for (const item of actor.items) {
    const buff = item.getFlag(SYSTEM, "buff");
    if (buff) {
      const detail = [
        timerText(item.getFlag(SYSTEM, "timer")),
        buff.nextOnly ? i18n.localize("VARBORG.Ongoing.NextOnly") : "",
        buff.sustained ? i18n.localize("VARBORG.Ongoing.WhileSustained") : ""
      ].filter(Boolean).join(", ");
      add({ img: item.img, label: item.name, detail });
    }
    if (item.system?.sustaining) {
      add({ icon: "fa-hourglass-half", label: i18n.format("VARBORG.Ongoing.Sustaining", { name: item.name }) });
    }
    // Switched on: the combat's id, or "" outside combat (step 50c).
    const on = item.getFlag(SYSTEM, "on");
    if (on !== undefined && on !== null && on !== false) {
      add({ icon: "fa-toggle-on", label: i18n.format("VARBORG.Ongoing.SwitchedOn", { name: item.name }) });
    }
    if (item.getFlag(SYSTEM, "mounted") === true) {
      add({ icon: "fa-horse", label: i18n.format("VARBORG.Ongoing.Mounted", { name: item.name }) });
    }
  }

  const system = actor.system;
  if (system.shieldRaised) {
    add({ icon: "fa-shield-halved", label: i18n.localize("VARBORG.Ongoing.ShieldRaised"), detail: i18n.localize("VARBORG.Ongoing.UntilTurn") });
  }
  if (system.cover) {
    const size = i18n.localize(`VARBORG.Cover.Size.${system.cover}`);
    add({
      icon: "fa-person-shelter",
      label: i18n.format("VARBORG.Ongoing.Cover", { size, dr: signed(-takenCover(system.cover)) }),
      detail: i18n.localize("VARBORG.Ongoing.UntilTurn")
    });
  }
  const light = actorLight(actor);
  if (light.lit) {
    add({ icon: "fa-fire-flame-curved", label: i18n.localize(light.dimmed ? "VARBORG.Light.StateDimmed" : "VARBORG.Light.StateLit") });
  }
  if (system.attackRuin) {
    add({ icon: "fa-heart-crack", label: i18n.localize("VARBORG.Ongoing.AttackRuin"), detail: i18n.localize("VARBORG.Attack.RuinedNow") });
  }
  for (const key of ABILITIES) {
    const change = system.abilityAdjust?.[key] ?? 0;
    if (!change) continue;
    add({
      icon: "fa-arrows-up-down",
      label: i18n.format("VARBORG.Ongoing.Adjust", { ability: i18n.localize(`VARBORG.Ability.${key}`), change: signed(change) })
    });
  }
  return list;
}
