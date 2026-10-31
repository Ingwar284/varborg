/**
 * VÅR BORG system entry point.
 * Foundry loads this file first (see "esmodules" in system.json).
 */

import CharacterData from "./data/character.mjs";
import CharacterSheet from "./sheets/character-sheet.mjs";
import { WeaponData, ArmourData, ShieldData, GearData, ContainerData } from "./data/equipment.mjs";
import { WeaponSheet, ArmourSheet, ShieldSheet, GearSheet, ContainerSheet } from "./sheets/item-sheet.mjs";
import { ImportExamplesApp } from "./examples.mjs";

Hooks.once("init", () => {
  console.log("VÅR BORG | Initialising system");

  // Actor data: which fields each actor type stores.
  CONFIG.Actor.dataModels.character = CharacterData;

  // Actor sheets.
  foundry.documents.collections.Actors.registerSheet("var-borg", CharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "VARBORG.Sheet.Character"
  });

  // Item data and sheets: weapons, armour, shields, gear and containers.
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armour = ArmourData;
  CONFIG.Item.dataModels.shield = ShieldData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.container = ContainerData;

  const Items = foundry.documents.collections.Items;
  Items.registerSheet("var-borg", WeaponSheet, { types: ["weapon"], makeDefault: true, label: "VARBORG.Sheet.Weapon" });
  Items.registerSheet("var-borg", ArmourSheet, { types: ["armour"], makeDefault: true, label: "VARBORG.Sheet.Armour" });
  Items.registerSheet("var-borg", ShieldSheet, { types: ["shield"], makeDefault: true, label: "VARBORG.Sheet.Shield" });
  Items.registerSheet("var-borg", GearSheet, { types: ["gear"], makeDefault: true, label: "VARBORG.Sheet.Gear" });
  Items.registerSheet("var-borg", ContainerSheet, { types: ["container"], makeDefault: true, label: "VARBORG.Sheet.Container" });

  // GM-only "Import examples" button in Game Settings → Configure Settings.
  game.settings.registerMenu("var-borg", "importExamples", {
    name: "VARBORG.Examples.MenuName",
    label: "VARBORG.Examples.Label",
    hint: "VARBORG.Examples.Hint",
    icon: "fa-solid fa-file-import",
    type: ImportExamplesApp,
    restricted: true
  });
});

Hooks.once("ready", () => {
  console.log("VÅR BORG | Ready");
});
