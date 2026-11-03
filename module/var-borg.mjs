/**
 * VÅR BORG system entry point.
 * Foundry loads this file first (see "esmodules" in system.json).
 */

import VarBorgActor from "./actor.mjs";
import CharacterData from "./data/character.mjs";
import CharacterSheet from "./sheets/character-sheet.mjs";
import FoeData from "./data/foe.mjs";
import FoeSheet from "./sheets/foe-sheet.mjs";
import { WeaponData, ArmourData, ShieldData, GearData, ContainerData } from "./data/equipment.mjs";
import FeatData from "./data/feat.mjs";
import { ClassData, AncestryData, BackgroundData } from "./data/origins.mjs";
import {
  WeaponSheet, ArmourSheet, ShieldSheet, GearSheet, ContainerSheet, FeatSheet, ClassSheet, AncestrySheet, BackgroundSheet
} from "./sheets/item-sheet.mjs";
import { ImportExamplesApp } from "./examples.mjs";
import { VarBorgCombat, VarBorgCombatant, addTrackerPips } from "./combat.mjs";
import { addAttackCardListeners } from "./dice/attack.mjs";
import { addDefenceCardListeners } from "./dice/defence.mjs";
import { addMoraleCardListeners } from "./dice/morale.mjs";
import { registerConditions } from "./conditions.mjs";
import { registerPersistentDamage } from "./persistent.mjs";
import { registerAgony } from "./agony.mjs";
import { registerDeathsDoor } from "./deaths-door.mjs";
import { registerAmmunition } from "./ammunition.mjs";

Hooks.once("init", () => {
  console.log("VÅR BORG | Initialising system");

  // Actors: the document class, and which fields each actor type stores.
  CONFIG.Actor.documentClass = VarBorgActor;
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.foe = FoeData;

  // Actor sheets.
  const Actors = foundry.documents.collections.Actors;
  Actors.registerSheet("var-borg", CharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "VARBORG.Sheet.Character"
  });
  Actors.registerSheet("var-borg", FoeSheet, { types: ["foe"], makeDefault: true, label: "VARBORG.Sheet.Foe" });

  // Item data and sheets: weapons, armour, shields, gear, containers, feats,
  // and the class, ancestry and background a character comes from.
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armour = ArmourData;
  CONFIG.Item.dataModels.shield = ShieldData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.container = ContainerData;
  CONFIG.Item.dataModels.feat = FeatData;
  CONFIG.Item.dataModels.class = ClassData;
  CONFIG.Item.dataModels.ancestry = AncestryData;
  CONFIG.Item.dataModels.background = BackgroundData;

  const Items = foundry.documents.collections.Items;
  Items.registerSheet("var-borg", WeaponSheet, { types: ["weapon"], makeDefault: true, label: "VARBORG.Sheet.Weapon" });
  Items.registerSheet("var-borg", ArmourSheet, { types: ["armour"], makeDefault: true, label: "VARBORG.Sheet.Armour" });
  Items.registerSheet("var-borg", ShieldSheet, { types: ["shield"], makeDefault: true, label: "VARBORG.Sheet.Shield" });
  Items.registerSheet("var-borg", GearSheet, { types: ["gear"], makeDefault: true, label: "VARBORG.Sheet.Gear" });
  Items.registerSheet("var-borg", ContainerSheet, { types: ["container"], makeDefault: true, label: "VARBORG.Sheet.Container" });
  Items.registerSheet("var-borg", FeatSheet, { types: ["feat"], makeDefault: true, label: "VARBORG.Sheet.Feat" });
  Items.registerSheet("var-borg", ClassSheet, { types: ["class"], makeDefault: true, label: "VARBORG.Sheet.Class" });
  Items.registerSheet("var-borg", AncestrySheet, { types: ["ancestry"], makeDefault: true, label: "VARBORG.Sheet.Ancestry" });
  Items.registerSheet("var-borg", BackgroundSheet, { types: ["background"], makeDefault: true, label: "VARBORG.Sheet.Background" });

  // Combat: initiative, turn order and action pips (rules 3.4).
  CONFIG.Combat.documentClass = VarBorgCombat;
  CONFIG.Combatant.documentClass = VarBorgCombatant;
  Hooks.on("renderCombatTracker", addTrackerPips);

  // Conditions (rules 3.13) as status effects on tokens and sheets.
  registerConditions();
  // Persistent Damage: one effect per type, ticking at the end of the turn.
  registerPersistentDamage();
  // Wounds at 0 HP: the wound test and the Table of Agony (rules 3.5).
  registerAgony();
  // Death's Door and Dark Vessel (rules 3.6).
  registerDeathsDoor();
  // Ammunition: an expendable roll after a combat it was used in (rules 4.1).
  registerAmmunition();

  // Chat card buttons: lowering a foe's armour after a Triumph (rules 3.4).
  Hooks.on("renderChatMessageHTML", addAttackCardListeners);
  // Defend on a foe's attack card, Take damage on a defence card (rules 3.4).
  Hooks.on("renderChatMessageHTML", addDefenceCardListeners);
  // Inflict damage on an attack card, Morale on a foe damage card (rules 3.12).
  Hooks.on("renderChatMessageHTML", addMoraleCardListeners);

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
