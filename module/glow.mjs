/**
 * Holy smite's glow in Foundry (GAPS 330). After an attack Triumph that
 * adds extra light damage, the attacker gets a buff item, "Holy smite:
 * glowing <weapon>", until the encounter ends (the buff timers of
 * module/timers.mjs remove it when combat ends; outside combat it stays
 * until removed by hand). The item carries an Active Effect that changes
 * the attacker's tokens (Foundry v14 "token." changes): dim light out to
 * 10 feet in pale gold. Deleting the item puts the light out. A new glow
 * replaces the old one.
 *
 * The rules live in module/rules/glow.mjs.
 */

import { glowChanges, GLOW_TIMER, GLOW_RANGE } from "./rules/glow.mjs";
import { newTimer } from "./rules/timers.mjs";
import { postSmallCard } from "./chat-card.mjs";

const SYSTEM = "var-borg";
const FLAG = "glow";
const IMG = "icons/magic/light/explosion-star-glow-yellow.webp";

/**
 * Light the attacker's weapon up.
 * @param {Actor} actor  The attacker.
 * @param {Item} weapon  The weapon that scored the Triumph.
 */
export async function startGlow(actor, weapon) {
  if (!actor?.isOwner) return;
  const i18n = game.i18n;
  const old = actor.items.filter(item => item.getFlag(SYSTEM, FLAG)).map(item => item.id);
  if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
  const name = i18n.format("VARBORG.Glow.Name", { weapon: weapon?.name ?? i18n.localize("VARBORG.Glow.Weapon") });
  const description = i18n.format("VARBORG.Glow.Description", { range: GLOW_RANGE });
  await actor.createEmbeddedDocuments("Item", [{
    name,
    type: "feat",
    img: IMG,
    system: { description, source: "general", effects: [], automation: "auto" },
    flags: { [SYSTEM]: { [FLAG]: true, timer: newTimer(GLOW_TIMER.kind) } },
    effects: [{ name, img: IMG, type: "base", transfer: true, system: { changes: glowChanges() } }]
  }]);
  await postSmallCard(actor, [i18n.format("VARBORG.Glow.Started", { name: actor.name, weapon: weapon?.name ?? "", range: GLOW_RANGE })]);
}
