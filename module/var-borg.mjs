/**
 * VÅR BORG system entry point.
 * Foundry loads this file first (see "esmodules" in system.json).
 */

import VarBorgActor from "./actor.mjs";
import CharacterData from "./data/character.mjs";
import CharacterSheet from "./sheets/character-sheet.mjs";
import FoeData from "./data/foe.mjs";
import FoeSheet from "./sheets/foe-sheet.mjs";
import MinionData from "./data/minion.mjs";
import MinionSheet from "./sheets/minion-sheet.mjs";
import { registerMinions } from "./minions.mjs";
import VehicleData from "./data/vehicle.mjs";
import VehicleSheet from "./sheets/vehicle-sheet.mjs";
import { registerVehicles } from "./vehicles.mjs";
import { WeaponData, ArmourData, ShieldData, GearData, ContainerData } from "./data/equipment.mjs";
import FeatData from "./data/feat.mjs";
import PowerData from "./data/power.mjs";
import SpellData, { ScrollData } from "./data/spell.mjs";
import { ClassData, AncestryData, BackgroundData } from "./data/origins.mjs";
import RelicData from "./data/relic.mjs";
import {
  WeaponSheet, ArmourSheet, ShieldSheet, GearSheet, ContainerSheet, FeatSheet, PowerSheet, SpellSheet, ScrollSheet, ClassSheet, AncestrySheet, BackgroundSheet,
  RelicSheet
} from "./sheets/item-sheet.mjs";
import { ImportExamplesApp } from "./examples.mjs";
import { VarBorgCombat, VarBorgCombatant, addTrackerPips } from "./combat.mjs";
import { addAttackCardListeners, settleAttackCard } from "./dice/attack.mjs";
import { addDefenceCardListeners, settleDefenceCard } from "./dice/defence.mjs";
import { addGloomCardListeners, settleGloomCard } from "./dice/gloom.mjs";
import { settleTestCard } from "./dice/ability-test.mjs";
import { registerFortune } from "./fortune.mjs";
import { CARD } from "./rules/fortune.mjs";
import { addMoraleCardListeners } from "./dice/morale.mjs";
import { registerConditions } from "./conditions.mjs";
import { registerPersistentDamage } from "./persistent.mjs";
import { registerAgony } from "./agony.mjs";
import { registerDeathsDoor } from "./deaths-door.mjs";
import { registerAmmunition } from "./ammunition.mjs";
import { registerMigrations, migrateWorld } from "./migrate.mjs";
import { registerEffectsRefresh, refreshWorldEffects, RefreshEffectsApp } from "./refresh-effects.mjs";
import { registerEffectButtons } from "./effects.mjs";
import { registerPanicButtons } from "./panic.mjs";
import { registerPanels } from "./panels.mjs";
import { registerShadowblight } from "./shadowblight.mjs";
import { registerMedicine } from "./medicine.mjs";
import { registerUses } from "./uses.mjs";
import { registerChoices } from "./choices.mjs";

Hooks.once("init", () => {
  console.log("VÅR BORG | Initialising system");

  // Actors: the document class, and which fields each actor type stores.
  CONFIG.Actor.documentClass = VarBorgActor;
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.foe = FoeData;
  CONFIG.Actor.dataModels.minion = MinionData;
  CONFIG.Actor.dataModels.vehicle = VehicleData;

  // Actor sheets.
  const Actors = foundry.documents.collections.Actors;
  Actors.registerSheet("var-borg", CharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "VARBORG.Sheet.Character"
  });
  Actors.registerSheet("var-borg", FoeSheet, { types: ["foe"], makeDefault: true, label: "VARBORG.Sheet.Foe" });
  Actors.registerSheet("var-borg", MinionSheet, { types: ["minion"], makeDefault: true, label: "VARBORG.Sheet.Minion" });
  Actors.registerSheet("var-borg", VehicleSheet, { types: ["vehicle"], makeDefault: true, label: "VARBORG.Sheet.Vehicle" });

  // Item data and sheets: weapons, armour, shields, gear, containers, feats,
  // powers, spells, scrolls, and the class, ancestry and background a character comes from.
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armour = ArmourData;
  CONFIG.Item.dataModels.shield = ShieldData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.container = ContainerData;
  CONFIG.Item.dataModels.feat = FeatData;
  CONFIG.Item.dataModels.power = PowerData;
  CONFIG.Item.dataModels.spell = SpellData;
  CONFIG.Item.dataModels.scroll = ScrollData;
  CONFIG.Item.dataModels.class = ClassData;
  CONFIG.Item.dataModels.ancestry = AncestryData;
  CONFIG.Item.dataModels.background = BackgroundData;
  CONFIG.Item.dataModels.relic = RelicData;

  const Items = foundry.documents.collections.Items;
  Items.registerSheet("var-borg", WeaponSheet, { types: ["weapon"], makeDefault: true, label: "VARBORG.Sheet.Weapon" });
  Items.registerSheet("var-borg", ArmourSheet, { types: ["armour"], makeDefault: true, label: "VARBORG.Sheet.Armour" });
  Items.registerSheet("var-borg", ShieldSheet, { types: ["shield"], makeDefault: true, label: "VARBORG.Sheet.Shield" });
  Items.registerSheet("var-borg", GearSheet, { types: ["gear"], makeDefault: true, label: "VARBORG.Sheet.Gear" });
  Items.registerSheet("var-borg", ContainerSheet, { types: ["container"], makeDefault: true, label: "VARBORG.Sheet.Container" });
  Items.registerSheet("var-borg", FeatSheet, { types: ["feat"], makeDefault: true, label: "VARBORG.Sheet.Feat" });
  Items.registerSheet("var-borg", PowerSheet, { types: ["power"], makeDefault: true, label: "VARBORG.Sheet.Power" });
  Items.registerSheet("var-borg", SpellSheet, { types: ["spell"], makeDefault: true, label: "VARBORG.Sheet.Spell" });
  Items.registerSheet("var-borg", ScrollSheet, { types: ["scroll"], makeDefault: true, label: "VARBORG.Sheet.Scroll" });
  Items.registerSheet("var-borg", ClassSheet, { types: ["class"], makeDefault: true, label: "VARBORG.Sheet.Class" });
  Items.registerSheet("var-borg", AncestrySheet, { types: ["ancestry"], makeDefault: true, label: "VARBORG.Sheet.Ancestry" });
  Items.registerSheet("var-borg", BackgroundSheet, { types: ["background"], makeDefault: true, label: "VARBORG.Sheet.Background" });
  Items.registerSheet("var-borg", RelicSheet, { types: ["relic"], makeDefault: true, label: "VARBORG.Sheet.Relic" });

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
  // The shared panels, each with its own toolbar button: the calendar
  // (days, clock, rest), the light timer, and the Ember and Gloom pools.
  registerPanels();
  // The Shadowblight table button on a spell's Ruin card (rules 3.11).
  registerShadowblight();
  // The Toughness button on medicine box cards (step 34).
  registerMedicine();
  // The Use button on once-per-round, -encounter and -day items (step 36b).
  registerUses();
  registerChoices();
  registerEffectButtons();
  registerPanicButtons();
  // Minions: their owners' sheets follow them (step 42).
  registerMinions();
  // Vehicles: the buttons on driving cards (step 44).
  registerVehicles();

  // Chat card buttons: lowering a foe's armour after a Triumph (rules 3.4).
  Hooks.on("renderChatMessageHTML", addAttackCardListeners);
  // Defend on a foe's attack card, Take damage on a defence card (rules 3.4).
  Hooks.on("renderChatMessageHTML", addDefenceCardListeners);
  // Test buttons on a foe's gloom ability card (rules 6, Gloom abilities).
  Hooks.on("renderChatMessageHTML", addGloomCardListeners);
  // Inflict damage on an attack card, Morale on a foe damage card (rules 3.12).
  Hooks.on("renderChatMessageHTML", addMoraleCardListeners);
  // Fortune buttons on test, attack, defence and gloom test cards (rules 3.9).
  registerFortune({
    [CARD.TEST]: settleTestCard,
    [CARD.ATTACK]: settleAttackCard,
    [CARD.DEFENCE]: settleDefenceCard,
    [CARD.GLOOM]: settleGloomCard
  });

  // The world's data version, for bringing old data up to date.
  registerMigrations();
  registerEffectsRefresh();

  // GM-only "Import examples" button in Game Settings → Configure Settings.
  game.settings.registerMenu("var-borg", "importExamples", {
    name: "VARBORG.Examples.MenuName",
    label: "VARBORG.Examples.Label",
    hint: "VARBORG.Examples.Hint",
    icon: "fa-solid fa-file-import",
    type: ImportExamplesApp,
    restricted: true
  });

  // GM-only "Copy compendium effects" button (step 49i).
  game.settings.registerMenu("var-borg", "refreshEffects", {
    name: "VARBORG.Effects.MenuName",
    label: "VARBORG.Effects.MenuLabel",
    hint: "VARBORG.Effects.MenuHint",
    icon: "fa-solid fa-wand-magic-sparkles",
    type: RefreshEffectsApp,
    restricted: true
  });
});

Hooks.once("ready", async () => {
  console.log("VÅR BORG | Ready");
  await migrateWorld();
  // Compendium item effects newer than the world's are copied in (step 49i).
  await refreshWorldEffects();
});
