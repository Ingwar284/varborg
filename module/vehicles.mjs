/**
 * Vehicles in Foundry (Subsystem: Vehicles, GAPS 34 and 175-177).
 *
 * The Drive button on a vehicle sheet asks for the speed (safe, normal,
 * fast) and what the driver is doing (driving, in reverse, under difficult
 * circumstances). Where the table needs no test, a chat line says so.
 * Otherwise the driver tests Agility at the table's DR, with Boon after a
 * driving Triumph. Then a driving card:
 * - Triumph: Boon on the next driving test (kept on the vehicle).
 * - Failure: half speed, and an Agility DR12 button for each character
 *   and minion aboard; a Failure or Ruin on it knocks them Prone. At fast
 *   speed, half the collision damage.
 * - Ruin: the crash, with the full collision damage. At fast speed, anyone
 *   not strapped in is thrown 20' and lands Prone.
 * Collision damage is rolled once. The vehicle and each one aboard halve it
 * on a Failure, halve it again when strapped in, then subtract their own
 * armour roll, never below 1 (GAPS 176). Each gets a Take damage button
 * for its owner (or the Dark Master).
 *
 * Cargo (GAPS 178): the vehicle's items. Above its cargo limit (heavy
 * items plus the room its passengers take) it is Encumbered: safe speed
 * only and Bane on driving tests. Above twice the limit it cannot move.
 * Dragging a cargo item between a vehicle and another actor moves it.
 *
 * The maths lives in module/rules/vehicles.mjs.
 */

import {
  SPEEDS, MANOEUVRES, DRIVING_ABILITY, COLLISION_DICE, PRONE_TEST_DR, THROWN_FEET,
  drivingDr, drivingOutcome, collisionDamage, driverOf, addOccupant,
  CARGO_TYPES, cargoLoad, allowedSpeeds, drivingBane
} from "./rules/vehicles.mjs";
import { bestSoak } from "./rules/defence.mjs";
import { withStat, drivingDrWith } from "./rules/item-effects.mjs";
import { wornArmour } from "./rules/test-modifiers.mjs";
import { hpAfterDamage } from "./rules/health.mjs";
import { rollAbilityTest } from "./dice/ability-test.mjs";
import { killedByDamage } from "./deaths-door.mjs";
import { markDefeated } from "./dice/morale.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";

/** On each damaged actor: the card buttons it has used, so each works once. */
const DONE_FLAG = "vehicleCards";
const DONE_KEEP = 30;

/** Actor types that can be aboard. */
export const OCCUPANT_TYPES = ["character", "minion", "foe"];

/** Actor types that roll their own Agility test to stay on their feet (foes do not roll). */
const ROLLERS = ["character", "minion"];

/** Hook up the buttons on driving cards. */
export function registerVehicles() {
  Hooks.on("renderChatMessageHTML", addVehicleCardListeners);
}

/**
 * Who is aboard, with their actors (null when the actor is gone).
 * @param {Actor} vehicle
 * @returns {Array<{index: number, uuid: string, role: string, strapped: boolean, actor: Actor|null}>}
 */
export function occupantsOf(vehicle) {
  return vehicle.system.occupants.map((occupant, index) => ({
    index, ...occupant, actor: fromUuidSync(occupant.uuid) ?? null
  }));
}

/**
 * Put an actor aboard (dragged onto the vehicle sheet). The first one
 * aboard drives.
 */
export async function boardVehicle(vehicle, actor) {
  if (!vehicle.isOwner || !OCCUPANT_TYPES.includes(actor?.type)) return null;
  const occupants = addOccupant(vehicle.system.occupants, actor.uuid);
  if (occupants.length === vehicle.system.occupants.length) return null;
  await vehicle.update({ "system.occupants": occupants });
  return actor;
}

/** Change one occupant's role or strapped-in box, or take them off (remove: true). */
export async function changeOccupant(vehicle, index, change) {
  const occupants = foundry.utils.deepClone(vehicle.system.occupants);
  if (!occupants[index]) return;
  if (change.remove) occupants.splice(index, 1);
  else Object.assign(occupants[index], change);
  await vehicle.update({ "system.occupants": occupants });
}

/**
 * The vehicle's load: its heavy cargo and its passengers' room against its
 * cargo limit (GAPS 178).
 */
export function vehicleLoad(vehicle) {
  const system = vehicle.system;
  return cargoLoad({
    items: vehicle.items.map(item => ({ type: item.type, ...item.system })),
    passengers: system.occupants.filter(occupant => occupant.role === "passenger").length,
    cargoLimit: system.cargoLimit,
    passengerSeats: system.passengerSeats
  });
}

/**
 * Move a cargo item dropped on `target` from the actor it is on (a vehicle
 * to a character or back): a copy goes on, the original comes off
 * (GAPS 178). From the Items sidebar it is simply added. Feats and other
 * items that are not cargo are copied as usual.
 * @param {Actor} target
 * @param {Item} item
 * @returns {Promise<Item|null|undefined>}  undefined: not a move, handle it the usual way.
 */
export async function moveCargo(target, item) {
  const source = item.parent;
  const isMove = source instanceof foundry.documents.Actor && source.uuid !== target.uuid
    && CARGO_TYPES.includes(item.type) && (source.type === "vehicle" || target.type === "vehicle");
  if (!isMove) return undefined;
  if (!target.isOwner || !source.isOwner) {
    ui.notifications.warn(game.i18n.format("VARBORG.Vehicle.CannotMove", { item: item.name, from: source.name }));
    return null;
  }
  const data = item.toObject();
  delete data._id;
  // It leaves its container behind, and is not worn or wielded in the cargo.
  data.system.storedIn = "";
  if ("equipped" in data.system) data.system.equipped = false;
  const [created] = await target.createEmbeddedDocuments("Item", [data]);
  if (!created) return null;
  await item.delete();
  return created;
}

/**
 * The soak die of anyone aboard, or of the vehicle: worn armour or natural
 * armour, whichever is stronger, for a character (GAPS 188), the armour die
 * otherwise.
 */
function soakDieOf(actor) {
  if (actor.type === "character") {
    const armour = wornArmour(actor.items.map(item => ({ id: item.id, type: item.type, ...item.system })));
    return bestSoak(armour, withStat(0, actor.system.statBonuses?.soak)).die;
  }
  return actor.system.armour || "";
}

/** "Safe speed" and the like. */
function speedLabel(speed) {
  return game.i18n.localize(`VARBORG.Vehicle.Speed.${speed}`);
}

/**
 * The Drive button.
 * @param {Actor} vehicle
 */
export async function driveVehicle(vehicle) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const occupants = occupantsOf(vehicle);
  const driver = driverOf(occupants)?.actor ?? null;
  if (!driver) {
    ui.notifications.warn(i18n.format("VARBORG.Vehicle.NoDriver", { name: vehicle.name }));
    return;
  }
  if (!driver.isOwner) {
    ui.notifications.warn(i18n.format("VARBORG.Vehicle.NotYourDriver", { name: driver.name }));
    return;
  }

  // Over twice its cargo limit it cannot move (GAPS 178).
  const load = vehicleLoad(vehicle);
  const speeds = allowedSpeeds(load.state);
  if (!speeds.length) {
    ui.notifications.warn(i18n.format("VARBORG.Vehicle.Overloaded", { name: vehicle.name, used: load.used, limit: load.limit }));
    return;
  }

  // No Number: difficult circumstances at fast speed at DR12 (step 51a).
  const fastDifficult = driver.system.statBonuses?.fastDifficultDr;
  const choice = await askDriving(vehicle, speeds, load, fastDifficult);
  if (!choice) return;
  const { speed, manoeuvre } = choice;
  const feet = vehicle.system.speed[speed];
  const dr = drivingDrWith(drivingDr(manoeuvre, speed), manoeuvre, speed, fastDifficult);
  const how = i18n.format("VARBORG.Vehicle.How", {
    vehicle: vehicle.name, speed: speedLabel(speed).toLowerCase(),
    manoeuvre: i18n.localize(`VARBORG.Vehicle.Manoeuvre.${manoeuvre}`).toLowerCase(), feet
  });

  // The table needs no test here.
  if (dr === null) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: driver }),
      content: `<div class="var-borg-card vehicle-card"><p>${esc(how)}</p><p class="modifier">${i18n.localize("VARBORG.Vehicle.NoTest")}</p></div>`
    });
    return;
  }

  const boon = vehicle.system.driveBoon;
  const bane = drivingBane(load.state);
  const purpose = [how,
    boon ? i18n.localize("VARBORG.Vehicle.BoonFromTriumph") : "",
    bane ? i18n.format("VARBORG.Vehicle.EncumberedBane", { used: load.used, limit: load.limit }) : ""
  ].filter(Boolean).join(" ");
  const result = await rollAbilityTest(driver, DRIVING_ABILITY, { dr, boon, bane, purpose, kind: "driving" });
  if (!result) return;
  const outcome = drivingOutcome(result.tier, speed);
  // The Triumph's Boon is used by this test; a new Triumph gives it again.
  if (vehicle.isOwner && (boon || outcome.boonNext)) await vehicle.update({ "system.driveBoon": outcome.boonNext });
  await postDrivingCard(vehicle, driver, occupants, { speed, feet, tier: result.tier, outcome });
}

/** The Drive dialog: speed (only those the load allows) and manoeuvre, with the table. */
async function askDriving(vehicle, allowed, load, fastDifficult = null) {
  const i18n = game.i18n;
  const option = (value, label, selected) => `<option value="${value}"${selected ? " selected" : ""}>${label}</option>`;
  const start = allowed.includes("normal") ? "normal" : allowed[0];
  const speeds = allowed.map(speed => option(speed,
    i18n.format("VARBORG.Vehicle.SpeedOption", { speed: speedLabel(speed), feet: vehicle.system.speed[speed] }), speed === start)).join("");
  const manoeuvres = MANOEUVRES.map(m => option(m, i18n.localize(`VARBORG.Vehicle.Manoeuvre.${m}`), m === "driving")).join("");
  const rows = MANOEUVRES.map(m => `<tr><th>${i18n.localize(`VARBORG.Vehicle.Manoeuvre.${m}`)}</th>`
    + SPEEDS.map(speed => {
      const dr = drivingDrWith(drivingDr(m, speed), m, speed, fastDifficult);
      return `<td>${dr === null ? i18n.localize("VARBORG.Vehicle.NA") : `DR${dr}`}</td>`;
    }).join("") + "</tr>").join("");
  const content = `<div class="var-borg-test-dialog vehicle-dialog">
    <div class="form-group"><label for="var-borg-drive-speed">${i18n.localize("VARBORG.Vehicle.SpeedLabel")}</label>
      <select id="var-borg-drive-speed" name="speed">${speeds}</select></div>
    <div class="form-group"><label for="var-borg-drive-manoeuvre">${i18n.localize("VARBORG.Vehicle.ManoeuvreLabel")}</label>
      <select id="var-borg-drive-manoeuvre" name="manoeuvre">${manoeuvres}</select></div>
    <table class="vehicle-table"><tr><th></th>${SPEEDS.map(s => `<th>${speedLabel(s)}</th>`).join("")}</tr>${rows}
      <tr><th>${i18n.localize("VARBORG.Vehicle.Collision")}</th>${SPEEDS.map(s => `<td>${COLLISION_DICE[s]}</td>`).join("")}</tr></table>
    ${load.state === "encumbered" ? `<p class="hint automatic">${i18n.format("VARBORG.Vehicle.EncumberedNote", { used: load.used, limit: load.limit })}</p>` : ""}
    ${vehicle.system.driveBoon ? `<p class="hint automatic">${i18n.localize("VARBORG.Vehicle.BoonFromTriumph")}</p>` : ""}
    <p class="hint">${i18n.localize("VARBORG.Vehicle.DriveHint")}</p>
  </div>`;
  const data = await DialogV2.input({
    window: { title: i18n.format("VARBORG.Vehicle.DriveTitle", { name: vehicle.name }) },
    content,
    ok: { label: "VARBORG.Vehicle.Drive", icon: "fa-solid fa-truck-monster" },
    rejectClose: false
  });
  if (!data) return null;
  const speed = allowed.includes(data.speed) ? data.speed : start;
  const manoeuvre = MANOEUVRES.includes(data.manoeuvre) ? data.manoeuvre : "driving";
  return { speed, manoeuvre };
}

/** The driving card: what happened, the Prone tests and the collision damage. */
async function postDrivingCard(vehicle, driver, occupants, { speed, feet, tier, outcome }) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const aboard = occupants.filter(occupant => occupant.actor);
  const rolls = [];
  const parts = [`<p><strong>${i18n.localize(`VARBORG.Tier.${tier}`)}:</strong> ${i18n.format(`VARBORG.Vehicle.Outcome.${tier}`, {
    feet: Math.floor(feet / 2), speed: speedLabel(speed).toLowerCase()
  })}</p>`];

  // Failure: everyone aboard tests Agility DR12 or is knocked Prone.
  if (outcome.proneTests && aboard.length) {
    parts.push(`<p class="sum">${i18n.format("VARBORG.Vehicle.ProneTests", { dr: PRONE_TEST_DR })}</p><div class="card-buttons">`);
    for (const { actor } of aboard) {
      parts.push(ROLLERS.includes(actor.type)
        ? `<button type="button" data-action="vehicleProne" data-actor-uuid="${actor.uuid}">`
          + `<i class="fa-solid fa-person-falling"></i> ${i18n.format("VARBORG.Vehicle.ProneButton", { name: esc(actor.name), dr: PRONE_TEST_DR })}</button>`
        : `<p class="hint">${i18n.format("VARBORG.Vehicle.FoeDecides", { name: esc(actor.name) })}</p>`);
    }
    parts.push("</div>");
  }

  // The collision: one roll, then each one's share (GAPS 176).
  if (outcome.collision) {
    const formula = COLLISION_DICE[speed];
    const roll = await new Roll(formula).evaluate();
    rolls.push(roll);
    const half = outcome.collision === "half";
    parts.push(`<p class="sum">${i18n.format(half ? "VARBORG.Vehicle.CollisionHalf" : "VARBORG.Vehicle.CollisionFull", {
      formula, rolled: roll.total
    })}</p>`);
    const hit = [{ actor: vehicle, strapped: false, isVehicle: true }, ...aboard];
    const rows = [];
    for (const [key, { actor, strapped, isVehicle }] of hit.entries()) {
      const die = soakDieOf(actor);
      let soak = 0;
      if (die) {
        const soakRoll = await new Roll(die).evaluate();
        rolls.push(soakRoll);
        soak = soakRoll.total;
      }
      // Ram-Plough: the driver's rig takes half (step 50g), like being strapped in.
      const ploughed = isVehicle && driver?.system?.statBonuses?.vehicleCrashHalf?.set > 0;
      const damage = collisionDamage(roll.total, { half, strapped: Boolean(strapped) || ploughed, soak });
      const thrown = outcome.thrown && !isVehicle && !strapped;
      const notes = [
        strapped ? i18n.localize("VARBORG.Vehicle.StrappedHalf") : "",
        ploughed ? i18n.format("VARBORG.Effects.Ploughed", { name: esc(driver.name) }) : "",
        die ? i18n.format("VARBORG.Vehicle.SoakNote", { die, soak }) : "",
        damage.minimum ? i18n.localize("VARBORG.Defence.Minimum") : "",
        thrown ? i18n.format("VARBORG.Vehicle.Thrown", { feet: THROWN_FEET }) : ""
      ].filter(Boolean).join(" · ");
      const label = i18n.format(thrown ? "VARBORG.Vehicle.TakeThrown" : "VARBORG.Vehicle.Take", { name: esc(actor.name), damage: damage.taken });
      rows.push(`<li><span>${esc(actor.name)}: <strong>${damage.taken}</strong>${notes ? ` <span class="hint">(${notes})</span>` : ""}</span>`
        + `<button type="button" data-action="vehicleDamage" data-key="${key}" data-actor-uuid="${actor.uuid}" data-damage="${damage.taken}"`
        + `${thrown ? ' data-prone="1"' : ""}><i class="fa-solid fa-heart-crack"></i> ${label}</button></li>`);
    }
    parts.push(`<ul class="collision-list">${rows.join("")}</ul>`);
  }
  if (outcome.crash || outcome.halfMove) parts.push(`<p class="hint">${i18n.localize("VARBORG.Vehicle.DarkMasterMoves")}</p>`);

  const title = i18n.format("VARBORG.Vehicle.CardTitle", { name: esc(vehicle.name), speed: speedLabel(speed).toLowerCase() });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: driver }),
    flavor: title,
    content: `<div class="var-borg-card vehicle-card"><h3>${title}</h3>${parts.join("")}</div>`,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
}

/** Has this actor already used this button of this card? */
function usedButton(actor, id) {
  return (actor?.getFlag(SYSTEM, DONE_FLAG) ?? []).includes(id);
}

/** Remember that this actor used this button (the last few only). */
async function markButton(actor, id) {
  const done = [...(actor.getFlag(SYSTEM, DONE_FLAG) ?? []), id].slice(-DONE_KEEP);
  await actor.setFlag(SYSTEM, DONE_FLAG, done);
}

/** Lower an actor's HP by collision damage: a character at Death's Door dies, foes and minions at 0 are defeated. */
async function takeCollision(actor, damage) {
  if (actor.type === "character" && await killedByDamage(actor, damage)) return null;
  const from = actor.system.hp.value;
  const to = hpAfterDamage(from, damage);
  // At 0 HP a character gains a wound (module/agony.mjs); a minion dies (module/minions.mjs).
  await actor.update({ "system.hp.value": to });
  if (actor.type === "foe" && to === 0 && from > 0) await markDefeated(actor);
  return { from, to };
}

/** The Take damage and Prone test buttons on driving cards. Hooked to renderChatMessageHTML. */
function addVehicleCardListeners(message, html) {
  const i18n = game.i18n;
  for (const button of html.querySelectorAll("button[data-action='vehicleDamage']")) {
    const id = `${message.id}.${button.dataset.key}`;
    const actor = fromUuidSync(button.dataset.actorUuid);
    if (!actor || usedButton(actor, id)) {
      button.disabled = true;
      continue;
    }
    button.addEventListener("click", async () => {
      if (!actor.isOwner) {
        ui.notifications.warn(i18n.format("VARBORG.Defence.NotYours", { name: actor.name }));
        return;
      }
      if (usedButton(actor, id)) return;
      button.disabled = true;
      await markButton(actor, id);
      const damage = Number(button.dataset.damage) || 0;
      const hp = await takeCollision(actor, damage);
      const thrown = Boolean(button.dataset.prone);
      if (thrown && !actor.statuses.has("prone")) await actor.toggleStatusEffect("prone", { active: true });
      if (!hp) return;
      const esc = foundry.utils.escapeHTML;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="var-borg-card"><p>${i18n.format("VARBORG.Defence.Took", { name: esc(actor.name), damage, from: hp.from, to: hp.to })}</p>`
          + (thrown ? `<p>${i18n.format("VARBORG.Vehicle.ThrownLine", { name: esc(actor.name), feet: THROWN_FEET })}</p>` : "")
          + "</div>"
      });
    });
  }

  for (const button of html.querySelectorAll("button[data-action='vehicleProne']")) {
    const id = `${message.id}.prone`;
    const actor = fromUuidSync(button.dataset.actorUuid);
    if (!actor || usedButton(actor, id)) {
      button.disabled = true;
      continue;
    }
    button.addEventListener("click", async () => {
      if (!actor.isOwner) {
        ui.notifications.warn(i18n.format("VARBORG.Defence.NotYours", { name: actor.name }));
        return;
      }
      if (usedButton(actor, id)) return;
      const result = await rollAbilityTest(actor, DRIVING_ABILITY, {
        dr: PRONE_TEST_DR, purpose: i18n.localize("VARBORG.Vehicle.PronePurpose")
      });
      if (!result) return;
      button.disabled = true;
      await markButton(actor, id);
      if (["failure", "ruin"].includes(result.tier) && !actor.statuses.has("prone")) {
        await actor.toggleStatusEffect("prone", { active: true });
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="var-borg-card"><p>${i18n.format("VARBORG.Vehicle.KnockedProne", { name: foundry.utils.escapeHTML(actor.name) })}</p></div>`
        });
      }
    });
  }
}
