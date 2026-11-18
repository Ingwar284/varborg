/**
 * Tossing a bomb in Foundry (rules 4.1 Gear, Bombs; GAPS 314, 315; PLAN
 * step 68c). The maths is in module/rules/toss.mjs.
 *
 * A grenade's Attack button, or a Fire pot's or Smoke bomb's Use button:
 * 1. The thrower aims the area at a point within the throw range (the
 *    Triumph's size, so the player sees the most it can catch).
 * 2. The thrower tests Agility DR12 (the usual test dialog and card).
 * 3. The bomb is used up: one of the stack, or the grenade itself.
 * 4. Triumph or Success: it lands on the point aimed at; Failure: it
 *    misses; Ruin: it lands at the thrower's feet. A grenade's burst is
 *    10' on a Triumph and 5' on a Success or Ruin.
 * 5. Every creature caught becomes a target. A grenade rolls its damage
 *    once: a foe gets an Inflict button (its armour soaks), a character or
 *    minion a Defend button, as from any area (GAPS 284). A Fire pot or
 *    Smoke bomb leaves its lasting area on the map (module/areas.mjs).
 * Only a character tests: a foe never makes tests, so its grenades stay
 * plain attacks.
 */

import { TOSS_ABILITY, TOSS_DR, TOSS_ACTIONS, isTossed, isPlaced, tossRange, tossLanding, canToss, tossSpent } from "./rules/toss.mjs";
import { aimArea, aimedPoint, landArea, keepArea } from "./areas.mjs";
import { rollAbilityTest } from "./dice/ability-test.mjs";
import { turnState } from "./combat.mjs";
import { postSmallCard } from "./chat-card.mjs";
import { oneAtATime } from "./busy.mjs";

/**
 * Whether this actor tosses this item instead of attacking or using it:
 * a character with an item whose area is marked thrown.
 * @param {Actor} actor
 * @param {Item} item
 */
export function tossesItem(actor, item) {
  return actor?.type === "character" && isTossed(item?.system);
}

/**
 * Whether this actor places this item's area by hand when using it
 * (Caltrops, a Bear trap, GAPS 314, PLAN step 68e): a character with gear
 * whose area is not thrown. Its Use button aims the area, then the usual
 * card and expendable die follow, and the area stays on the map.
 * @param {Actor} actor
 * @param {Item} item
 */
export function placesItem(actor, item) {
  return actor?.type === "character" && item?.type === "gear" && isPlaced(item?.system);
}

/**
 * Toss a bomb. One at a time per item.
 * @param {Actor} actor
 * @param {Item} item
 */
export function tossItem(actor, item) {
  return oneAtATime(`toss:${item.uuid}`, () => tossItemNow(actor, item));
}

async function tossItemNow(actor, item) {
  const i18n = game.i18n;
  if (!actor.isOwner) return;
  if (!canToss(item.system)) {
    ui.notifications.warn(i18n.format("VARBORG.Toss.NoneLeft", { item: item.name }));
    return;
  }
  // In combat, on your own turn only, like any action.
  const turn = turnState(actor);
  if (turn.combatant && !turn.onOwnTurn) {
    ui.notifications.warn(i18n.localize("VARBORG.Manual.NotYourTurn"));
    return;
  }

  // 1. Aim: the Triumph's area, within the throw range.
  const area = { ...item.system.area, shape: item.system.area.shape, range: tossRange(item.system) };
  const aimed = await aimArea(actor, item, { area });
  if (!aimed.go) return;
  const point = aimedPoint(aimed.region);

  // 2. The Agility DR12 test.
  const result = await rollAbilityTest(actor, TOSS_ABILITY, {
    dr: TOSS_DR, purpose: i18n.format("VARBORG.Toss.Purpose", { item: item.name }), kind: "toss"
  });
  if (!result) {
    canvas.tokens.setTargets([], { mode: "replace" });
    return;
  }

  // 3. It is used up whatever the result (GAPS 315), and costs an action.
  await item.update(tossSpent(item.system));
  if (turn.combatant) {
    if (turn.combatant.actionsLeft < TOSS_ACTIONS) ui.notifications.warn(i18n.localize("VARBORG.Manual.NoActions"));
    await turn.combatant.adjustPips("actions", -TOSS_ACTIONS);
  }

  // 4. Where it lands. With no token on the scene, the player targets by hand.
  const landing = tossLanding(result.tier, item.system.area);
  if (!landing.lands) {
    canvas.tokens.setTargets([], { mode: "replace" });
    await postSmallCard(actor, [i18n.format("VARBORG.Toss.Missed", { name: actor.name, item: item.name })], { heading: item.name });
    return;
  }
  const landed = landArea(actor, { ...area, size: landing.size }, item.name, landing.lands === "aimed" ? point : null);
  const where = i18n.format(landing.lands === "aimed" ? "VARBORG.Toss.Landed" : "VARBORG.Toss.AtFeet", {
    name: actor.name, item: item.name, size: landing.size
  });
  const caught = landed?.caught ?? [...game.user.targets].map(token => token.document);
  const lines = [where, caught.length
    ? i18n.format("VARBORG.Toss.Caught", { names: caught.map(doc => doc.name).join(", ") })
    : i18n.localize(landed ? "VARBORG.Area.NoneCaught" : "VARBORG.Toss.ByHand")];

  // 5. A grenade's damage, or a lasting area (smoke, fire).
  if (item.type === "weapon" && item.system.damage) await postGrenadeDamage(actor, item, caught, lines);
  else await postSmallCard(actor, lines, { heading: item.name });
  if (landed) {
    const { caught: _caught, ...region } = landed;
    await keepArea(actor, item, region, "success");
  }
}

/**
 * A grenade's damage card: one roll for everyone caught; Inflict on each
 * foe (its armour soaks), Defend for each character or minion.
 */
async function postGrenadeDamage(actor, item, caught, lines) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const roll = await new Roll(item.system.damage).evaluate();
  const damage = Math.max(0, roll.total);
  const type = item.system.damageType ?? "";
  const actors = [...new Set(caught.map(doc => doc.actor).filter(Boolean))];
  const buttons = actors.map(target => {
    if (target.type === "foe") {
      return `<button type="button" data-action="inflictDamage" data-key="${target.uuid}" data-damage="${damage}" data-foe-uuid="${target.uuid}"`
        + ` data-armour="${esc(target.system.armour ?? "")}" data-attack="${esc(item.name)}" data-damage-type="${type}" data-weapon-tags="area" data-melee="false" data-triumph="false">`
        + `<i class="fa-solid fa-droplet"></i> ${esc(i18n.format("VARBORG.FoeDamage.InflictOn", { damage, name: target.name }))}</button>`;
    }
    if (["character", "minion"].includes(target.type)) {
      return `<button type="button" data-action="areaDefend" data-actor-uuid="${target.uuid}" data-damage="${damage}" data-name="${esc(item.name)}"`
        + ` data-caster-uuid="${actor.uuid}" data-damage-type="${type}">`
        + `<i class="fa-solid fa-shield-halved"></i> ${esc(i18n.format("VARBORG.Area.DefendAs", { name: target.name, damage }))}</button>`;
    }
    return "";
  }).join("");
  const typeLabel = type ? i18n.localize(`VARBORG.DamageType.${type}`).toLowerCase() : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card toss-card"><h3>${esc(item.name)}</h3>`
      + lines.map(line => `<p>${esc(line)}</p>`).join("")
      + `<p class="sum">${esc(i18n.format("VARBORG.Toss.Damage", { formula: item.system.damage, damage, type: typeLabel }))}</p>`
      + (buttons ? `<p class="hint">${esc(i18n.localize("VARBORG.Area.Hint"))}</p>${buttons}` : "")
      + `</div>`,
    rolls: [roll],
    sound: CONFIG.sounds.dice
  });
}
