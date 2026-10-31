/**
 * VÅR BORG system entry point.
 * Foundry loads this file first (see "esmodules" in system.json).
 */

import CharacterData from "./data/character.mjs";
import CharacterSheet from "./sheets/character-sheet.mjs";

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
});

Hooks.once("ready", () => {
  console.log("VÅR BORG | Ready");
});
