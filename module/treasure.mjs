/**
 * The treasure generator (rules 5. Treasure; GAPS 270 to 273).
 *
 * The Dark Master picks the dungeon's size, where it lies and, for a lair,
 * whether a Mighty foe lives there. The dice are rolled by
 * module/rules/treasure.mjs; this file turns each find into an item and
 * posts a card to the Dark Master only.
 *
 * Two ways in:
 * - the Roll treasure button in the token controls: the card lists the
 *   treasure, with a Place treasure button that puts one chest token
 *   holding all of it (items and silver) in the middle of the view;
 * - the gem button in a chest's title bar: the items are put in that
 *   chest and the coin is added to its silver.
 *
 * Items come from the system's compendiums (gear, weapons, relics,
 * spells), from the armour table of 2.6 (as at character creation) and
 * from the Trinkets and Valuables roll tables.
 */

import {
  DUNGEON_SIZES, REGIONS, rollTreasure, coinFormula, damagedTier, lootWeapons, relicId
} from "./rules/treasure.mjs";
import { ARMOUR_TABLE } from "./rules/creation.mjs";
import { equipmentItem, itemData } from "./creation.mjs";
import { scrollOfSpell } from "./sheets/character-sheet.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";
import { placeChest } from "./chests.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const CARD_TEMPLATE = "systems/var-borg/templates/chat/treasure-card.hbs";
const SYSTEM = "var-borg";
const CHEST_IMG = "icons/containers/chest/chest-reinforced-steel-brown.webp";

/** Compendium items the Spoils table names. */
const GEAR = "Compendium.var-borg.gear.Item.";
const UUIDS = {
  healingPotion: `${GEAR}vbExampleHealPot`,
  medicineBox: `${GEAR}vbExampleMedBox0`,
  torch: `${GEAR}vbExampleTorch00`,
  lanternOil: `${GEAR}vbExampleLampOil`,
  firePot: `${GEAR}vbBomb0010000000`,
  poisonBlack: `${GEAR}vbGear0340000000`,
  poisonRed: `${GEAR}vbGear0350000000`,
  rations: `${GEAR}vbGear0360000000`,
  rope: `${GEAR}vbExampleRope000`,
  grapplingHook: `${GEAR}vbGear0140000000`,
  lockpicks: `${GEAR}vbGear0270000000`,
  grenade: "Compendium.var-borg.weapons.Item.vbWeap0490000000",
  trinkets: "Compendium.var-borg.tables.RollTable.vbTableTrinket00",
  valuables: "Compendium.var-borg.tables.RollTable.vbTableValuable0"
};
const SPELLS_PACK = "var-borg.spells";
const WEAPONS_PACK = "var-borg.weapons";

/** The weapons a Spoils "weapon" is rolled from (GAPS 270). */
function weaponList() {
  return lootWeapons([...game.packs.get(WEAPONS_PACK)?.index ?? []]);
}

/** Set up the Dark Master's button in the token controls. */
export function registerTreasure() {
  Hooks.on("getSceneControlButtons", addTreasureButton);
  Hooks.on("renderChatMessageHTML", addTreasureCardListeners);
}

function addTreasureButton(controls) {
  const tools = controls.tokens?.tools;
  if (!tools || !game.user.isGM) return;
  tools.varBorgTreasure = {
    name: "varBorgTreasure",
    title: "VARBORG.Treasure.Open",
    icon: "fa-solid fa-gem",
    order: Object.keys(tools).length,
    button: true,
    visible: true,
    onChange: () => openTreasureDialog()
  };
}

/* -------------------------------------------- */
/*  The dialog                                   */
/* -------------------------------------------- */

/**
 * Ask for the dungeon, then roll its treasure.
 * @param {object} [options]
 * @param {Actor} [options.chest]  Put the treasure in this chest.
 */
export async function openTreasureDialog({ chest = null } = {}) {
  if (!game.user.isGM) return;
  const i18n = game.i18n;
  const option = (value, label) => `<option value="${value}">${label}</option>`;
  const content = `
    <div class="form-group">
      <label>${i18n.localize("VARBORG.Treasure.SizeLabel")}</label>
      <select name="size">${DUNGEON_SIZES.map(size => option(size, i18n.localize(`VARBORG.Treasure.Size.${size}`))).join("")}</select>
    </div>
    <div class="form-group">
      <label>${i18n.localize("VARBORG.Treasure.RegionLabel")}</label>
      <select name="region">${REGIONS.map(region => option(region, i18n.localize(`VARBORG.Treasure.Region.${region}`))).join("")}</select>
    </div>
    <div class="form-group">
      <label>${i18n.localize("VARBORG.Treasure.Mighty")}</label>
      <input type="checkbox" name="mighty">
    </div>
    <p class="hint">${i18n.localize("VARBORG.Treasure.Hint")}</p>`;
  const choice = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: {
      title: chest ? i18n.format("VARBORG.Treasure.DialogTitleChest", { name: chest.name }) : i18n.localize("VARBORG.Treasure.DialogTitle"),
      icon: "fa-solid fa-gem"
    },
    content,
    ok: { label: i18n.localize("VARBORG.Treasure.Roll"), icon: "fa-solid fa-dice-d20" }
  });
  if (!choice) return;
  await generateTreasure({ size: choice.size, region: choice.region, mighty: !!choice.mighty, chest });
}

/* -------------------------------------------- */
/*  Rolling and making items                     */
/* -------------------------------------------- */

/**
 * Roll a dungeon's treasure, post the card and, with a chest, fill it.
 * @returns {Promise<object>} The rolled treasure.
 */
export async function generateTreasure({ size, region = "usual", mighty = false, chest = null }) {
  const i18n = game.i18n;
  const rolls = [];
  const roll = async formula => {
    const made = await new Roll(formula).evaluate();
    rolls.push(made);
    return made.total;
  };
  const weapons = weaponList();
  const treasure = await rollTreasure({ size, region, mighty, weapons: weapons.length }, roll);

  const lines = [];
  const items = [];
  for (const find of treasure.finds) {
    const made = await itemsFor(find, weapons);
    items.push(...made);
    const line = findLine(find, made);
    if (line) lines.push(line);
  }

  let chestLine = "";
  // The dungeon's coin and any purses from the Spoils table.
  const silver = treasure.silver + treasure.finds.reduce((sum, find) => sum + (find.silver ?? 0), 0);
  if (chest) {
    if (items.length) await chest.createEmbeddedDocuments("Item", items);
    if (silver) await chest.update({ "system.silver": (chest.system.silver ?? 0) + silver });
    chestLine = i18n.format("VARBORG.Treasure.AddedToChest", { name: chest.name, count: items.length, silver });
  }

  const sizeName = i18n.localize(`VARBORG.Treasure.SizeShort.${treasure.size}`);
  const content = await renderTemplate(CARD_TEMPLATE, {
    heading: chest
      ? i18n.format("VARBORG.Treasure.HeadingChest", { name: chest.name, size: sizeName })
      : i18n.format("VARBORG.Treasure.Heading", { size: sizeName }),
    settings: [
      treasure.region !== "usual" ? i18n.localize(`VARBORG.Treasure.RegionShort.${treasure.region}`) : "",
      treasure.mighty ? i18n.localize("VARBORG.Treasure.MightyShort") : ""
    ].filter(Boolean).join(" · "),
    coin: i18n.format(treasure.silver === treasure.rolledCoin ? "VARBORG.Treasure.Coin" : "VARBORG.Treasure.CoinChanged", {
      formula: coinFormula(treasure.size).replace(" * ", " × "),
      rolled: treasure.rolledCoin,
      silver: treasure.silver
    }),
    spoils: i18n.format("VARBORG.Treasure.SpoilsRolls", { count: treasure.spoilsRolls }),
    lines,
    chestLine,
    canPlace: !chest && (items.length > 0 || silver > 0)
  });
  await ChatMessage.create({
    speaker: { alias: i18n.localize("VARBORG.Treasure.Title") },
    whisper: ChatMessage.getWhisperRecipients("GM").map(user => user.id),
    content,
    rolls,
    sound: CONFIG.sounds.dice,
    // Kept for the Place treasure button.
    flags: chest ? {} : { [SYSTEM]: { treasure: { name: i18n.format("VARBORG.Treasure.ChestName", { size: sizeName }), items, silver } } }
  });
  return treasure;
}

/** The item data for one find (none for coin, nothing or a re-roll). */
async function itemsFor(find, weapons) {
  switch (find.kind) {
    case "weapon": {
      const entry = weapons[find.number - 1];
      const data = entry ? await itemData(entry.uuid) : null;
      return data ? [data] : [];
    }
    case "armour": {
      // One tier lower, in full repair at that tier (GAPS 271).
      const data = equipmentItem(ARMOUR_TABLE[find.row - 1][0]);
      data.system.tier = data.system.originalTier = damagedTier(data.system.tier);
      return [data];
    }
    case "healingPotion":
    case "medicineBox":
    case "firePot":
    case "grenade":
    case "lockpicks":
      return compendiumItems(find.kind);
    case "torches":
      return compendiumItems(["torch", find.quantity], "lanternOil");
    case "rations":
      return compendiumItems(["rations", find.quantity]);
    case "rope":
      return compendiumItems("rope", "grapplingHook");
    case "poison":
      return compendiumItems(find.colour === "black" ? "poisonBlack" : "poisonRed");
    case "trinket":
      return trinketItem(find.number);
    case "valuable":
      return valuableItem(find.number);
    case "scroll":
    case "tome":
      return spellItem(find.spell, find.kind === "tome");
    case "relic": {
      const data = await itemData(`Compendium.var-borg.relics.Item.${relicId(find.number)}`);
      return data ? [data] : [];
    }
    default:
      return [];
  }
}

/** Gear from the compendiums, by key or [key, quantity]. */
async function compendiumItems(...entries) {
  const made = [];
  for (const entry of entries) {
    const [key, quantity] = Array.isArray(entry) ? entry : [entry, null];
    const data = await itemData(UUIDS[key]);
    if (!data) continue;
    if (quantity && "quantity" in data.system) data.system.quantity = quantity;
    made.push(data);
  }
  return made;
}

/** The text of a roll table's row, without its paragraph tags. */
async function tableText(uuid, number) {
  const table = await fromUuid(uuid);
  const result = table?.results.find(entry => entry.range[0] <= number && number <= entry.range[1]);
  if (!result) return "";
  const div = document.createElement("div");
  div.innerHTML = result.description || result.name || "";
  return div.textContent.trim();
}

/** A trinket: named by its first sentence, with the whole text as its description. */
async function trinketItem(number) {
  const text = await tableText(UUIDS.trinkets, number);
  if (!text) return [];
  const name = text.split(/\.\s/)[0].replace(/\.$/, "");
  return [{
    name,
    type: "gear",
    img: "icons/commodities/treasure/figurine-idol.webp",
    system: { quantity: 1, price: 0, description: `${text}\n${game.i18n.localize("VARBORG.Treasure.TrinketText")}` }
  }];
}

/** A valuable: "A brass pocket watch ... (40 s)" becomes an item worth 40 s. */
async function valuableItem(number) {
  const text = await tableText(UUIDS.valuables, number);
  if (!text) return [];
  const match = text.match(/^(.*?)\s*\((\d+) s\)\s*$/);
  return [{
    name: match ? match[1] : text,
    type: "gear",
    img: "icons/commodities/treasure/brooch-gold-ruby.webp",
    system: { quantity: 1, price: match ? Number(match[2]) : 0, description: game.i18n.localize("VARBORG.Treasure.ValuableText") }
  }];
}

/** A scroll (or tome) of the rolled spell, made as when a spell is dropped on a sheet. */
async function spellItem(spell, tome) {
  const pack = game.packs.get(SPELLS_PACK);
  const entry = pack?.index.find(item => item.name === spell.name && item.type === "spell");
  const doc = entry ? await pack.getDocument(entry._id) : null;
  if (!doc) return [];
  const data = scrollOfSpell(doc);
  if (tome) {
    data.name = game.i18n.format("VARBORG.Treasure.TomeName", { spell: doc.name });
    data.system.description = `${game.i18n.localize("VARBORG.Treasure.TomeText")}\n${data.system.description ?? ""}`;
  }
  return [data];
}

/** One line of the card for a find. */
function findLine(find, items) {
  const i18n = game.i18n;
  const names = items.map(item => (item.system?.quantity > 1 ? `${item.name} ×${item.system.quantity}` : item.name)).join(", ");
  let what;
  switch (find.kind) {
    case "nothing": what = i18n.localize("VARBORG.Treasure.Nothing"); break;
    case "again": what = i18n.localize("VARBORG.Treasure.Again"); break;
    case "purse": what = i18n.format("VARBORG.Treasure.Purse", { silver: find.silver }); break;
    case "noRelic": return i18n.format("VARBORG.Treasure.NoRelic", { d6: find.d6 });
    case "scroll":
    case "tome": {
      const label = `${find.spell.name} (${i18n.localize(`VARBORG.Class.SpellList.${find.spell.list}`)}, DR${find.spell.dr})`;
      what = names ? label : i18n.format("VARBORG.Treasure.Missing", { name: label });
      break;
    }
    default: what = names || i18n.format("VARBORG.Treasure.Missing", { name: find.kind });
  }
  if (find.source === "spoils") return i18n.format("VARBORG.Treasure.SpoilsLine", { d20: find.d20, what });
  if (find.kind === "relic" && find.d6) return i18n.format("VARBORG.Treasure.RelicRolled", { d6: find.d6, what });
  return i18n.format(`VARBORG.Treasure.Line.${find.kind}`, { what });
}

/* -------------------------------------------- */
/*  Place treasure                               */
/* -------------------------------------------- */

/** The Place treasure button on a treasure card (Dark Master only). */
function addTreasureCardListeners(message, html) {
  const data = message.getFlag(SYSTEM, "treasure");
  const button = html.querySelector("button[data-action='placeTreasure']");
  if (!data || !button) return;
  if (!game.user.isGM || data.placed) {
    button.disabled = true;
    if (data.placed) button.innerHTML = `<i class="fa-solid fa-check"></i> ${game.i18n.localize("VARBORG.Treasure.Placed")}`;
    return;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    const placed = await placeTreasure(data);
    if (placed) await message.setFlag(SYSTEM, "treasure.placed", true);
    else button.disabled = false;
  });
}

/**
 * Put one chest token holding all the treasure in the middle of the view.
 * @returns {Promise<boolean>} Whether it was placed.
 */
async function placeTreasure({ name, items = [], silver = 0 }) {
  const scene = canvas.scene;
  if (!scene) {
    ui.notifications.warn("VARBORG.Treasure.NoScene", { localize: true });
    return false;
  }
  const centre = canvas.stage.pivot;
  const point = canvas.grid.isGridless
    ? { x: centre.x - canvas.grid.size / 2, y: centre.y - canvas.grid.size / 2 }
    : canvas.grid.getTopLeftPoint({ x: centre.x, y: centre.y });
  const token = await placeChest(scene, { x: point.x, y: point.y, name, img: CHEST_IMG, items, silver });
  if (!token) return false;
  ui.notifications.info(game.i18n.format("VARBORG.Treasure.PlacedOn", { name, scene: scene.name }));
  return true;
}
