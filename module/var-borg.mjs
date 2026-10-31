/**
 * VÅR BORG system entry point.
 * Foundry loads this file first (see "esmodules" in system.json).
 */

import CharacterData from "./data/character.mjs";
import CharacterSheet from "./sheets/character-sheet.mjs";
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
