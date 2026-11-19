/**
 * A foe's loot (GAPS 328): what it carries, and searching the fallen
 * (rules 5. Treasure, "Searching the fallen").
 *
 * - Loot is kept on the foe, set aside: its "Stored in" place is "dropped"
 *   (module/rules/dropped.mjs), so its effects are off and a loot weapon is
 *   never one of the foe's attacks. The foe also has silver of its own.
 * - The Spoils button on the foe sheet searches the foe: a d6, then d10 s
 *   or one roll on the Spoils table. What is found is added to its loot.
 *   Beasts carry nothing; every other foe is searched.
 * - When the foe drops to 0 HP, its loot and silver drop in a chest token
 *   on its square, on the Dark Master's Foundry.
 */

import { fallenKind, searchFallen } from "./rules/treasure.mjs";
import { DROPPED } from "./rules/dropped.mjs";
import { canHold } from "./rules/chests.mjs";
import { weaponList, itemsFor, findLine } from "./treasure.mjs";
import { placeChest } from "./chests.mjs";
import { movedItemData } from "./vehicles.mjs";
import { oneAtATime } from "./busy.mjs";

const { escapeHTML } = foundry.utils;

const LOOT_IMG = "icons/containers/bags/pack-leather-brown.webp";

/** Is this item one of a foe's loot (set aside, not an attack)? */
export function isLoot(item) {
  return canHold(item.type) && item.system?.storedIn === DROPPED;
}

/** A foe's loot items, in sheet order. */
export function lootOf(actor) {
  return actor.items.filter(isLoot).toSorted((a, b) => a.sort - b.sort);
}

/** Item data made into loot: set aside, not worn or wielded. */
export function asLoot(data) {
  data.system ??= {};
  data.system.storedIn = DROPPED;
  if ("equipped" in data.system) data.system.equipped = false;
  if ("place" in data.system) data.system.place = "";
  return data;
}

/* -------------------------------------------- */
/*  The Spoils button                            */
/* -------------------------------------------- */

/**
 * Search the fallen foe and add what is found to its loot. Posts a card to
 * the Dark Master only.
 * @param {Actor} actor  The foe.
 */
export async function searchFoe(actor) {
  if (!game.user.isGM) return;
  const i18n = game.i18n;
  const name = actor.name;
  if (fallenKind(actor.system.category) === "nothing") {
    return postCard(actor, [i18n.format("VARBORG.FoeLoot.Beast", { name })]);
  }

  const rolls = [];
  const roll = async formula => {
    const made = await new Roll(formula).evaluate();
    rolls.push(made);
    return made.total;
  };
  const weapons = weaponList();
  const found = await searchFallen(roll, { weapons: weapons.length });

  const lines = [];
  const items = [];
  if (found.result === "nothing") lines.push(i18n.format("VARBORG.FoeLoot.Nothing", { d6: found.d6 }));
  if (found.result === "coin") lines.push(i18n.format("VARBORG.FoeLoot.Coin", { d6: found.d6, silver: found.silver }));
  if (found.result === "spoils") {
    lines.push(i18n.format("VARBORG.FoeLoot.SpoilsRoll", { d6: found.d6 }));
    for (const find of found.finds) {
      const made = await itemsFor(find, weapons);
      items.push(...made.map(asLoot));
      const line = findLine(find, made);
      if (line) lines.push(line);
    }
  }

  if (items.length) await actor.createEmbeddedDocuments("Item", items);
  if (found.silver) await actor.update({ "system.silver": (actor.system.silver ?? 0) + found.silver });
  if (items.length || found.silver) lines.push(i18n.format("VARBORG.FoeLoot.Added", { name }));
  return postCard(actor, lines, rolls);
}

/** The search card, to the Dark Master only. */
function postCard(actor, lines, rolls = []) {
  const heading = game.i18n.format("VARBORG.FoeLoot.Heading", { name: actor.name });
  const [first, ...rest] = lines;
  const content = `<div class="var-borg-card treasure-card">
    <h3>${escapeHTML(heading)}</h3>
    <p><strong>${escapeHTML(first ?? "")}</strong></p>
    ${rest.length ? `<ul class="treasure-finds">${rest.map(line => `<li>${escapeHTML(line)}</li>`).join("")}</ul>` : ""}
  </div>`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: ChatMessage.getWhisperRecipients("GM").map(user => user.id),
    content,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : undefined
  });
}

/* -------------------------------------------- */
/*  Dropping the loot at 0 HP                    */
/* -------------------------------------------- */

/**
 * The foe has dropped to 0 HP: on the active Dark Master's Foundry, its
 * loot and silver drop in a chest token on its square. Nothing happens
 * when it carries nothing or has no token on a scene.
 * @param {Actor} actor  The foe.
 */
export function dropFoeLoot(actor) {
  if (game.user !== game.users.activeGM) return;
  return oneAtATime(`foeLoot:${actor.uuid}`, () => dropLoot(actor));
}

async function dropLoot(actor) {
  const loot = lootOf(actor);
  const silver = actor.system.silver ?? 0;
  if (!loot.length && !(silver > 0)) return;
  const token = actor.token ?? actor.getActiveTokens(false, true)[0];
  const scene = token?.parent;
  if (!scene) return;

  const name = game.i18n.format("VARBORG.FoeLoot.ChestName", { name: token.name || actor.name });
  const placed = await placeChest(scene, {
    // On the foe's own level, on a map with levels.
    x: token.x, y: token.y, level: token.level, elevation: token.elevation, name, img: LOOT_IMG,
    items: loot.map(item => movedItemData(item)),
    silver
  });
  if (!placed) return;
  await actor.deleteEmbeddedDocuments("Item", loot.map(item => item.id));
  if (silver) await actor.update({ "system.silver": 0 });
  ui.notifications.info(game.i18n.format("VARBORG.FoeLoot.Dropped", { name: token.name || actor.name }));
}
