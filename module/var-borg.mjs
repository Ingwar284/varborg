/**
 * VÅR BORG system entry point.
 * Foundry loads this file first (see "esmodules" in system.json).
 */

import VarBorgActor from "./actor.mjs";
import VarBorgActiveEffect from "./active-effect.mjs";
import { EFFECT_DATA_MODELS } from "./data/active-effects.mjs";
import VarBorgRegion from "./canvas/region.mjs";
import CharacterData from "./data/character.mjs";
import CharacterSheet from "./sheets/character-sheet.mjs";
import FoeData from "./data/foe.mjs";
import FoeSheet from "./sheets/foe-sheet.mjs";
import MinionData from "./data/minion.mjs";
import MinionSheet from "./sheets/minion-sheet.mjs";
import { registerMinions, registerCompanionCleanup } from "./minions.mjs";
import VehicleData from "./data/vehicle.mjs";
import VehicleSheet from "./sheets/vehicle-sheet.mjs";
import { registerVehicles } from "./vehicles.mjs";
import ChestData from "./data/chest.mjs";
import ChestSheet from "./sheets/chest-sheet.mjs";
import { registerChests } from "./chests.mjs";
import { registerEncounters } from "./encounters.mjs";
import { registerTreasure } from "./treasure.mjs";
import { WeaponData, ArmourData, ShieldData, GearData, ContainerData } from "./data/equipment.mjs";
import FeatData from "./data/feat.mjs";
import PowerData from "./data/power.mjs";
import SpellData, { ScrollData } from "./data/spell.mjs";
import { ClassData, AncestryData, BackgroundData } from "./data/origins.mjs";
import RelicData from "./data/relic.mjs";
import DocumentPageData from "./data/document-page.mjs";
import DocumentPageSheet from "./sheets/document-page-sheet.mjs";
import { registerFieldJournal } from "./field-journal.mjs";
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
import { registerPoisons } from "./poison.mjs";
import { registerLocalLinks } from "./local-links.mjs";
import { registerLasting } from "./lasting.mjs";
import { registerAreaCleanup, registerAreaQuery } from "./areas.mjs";
import { registerConditions } from "./conditions.mjs";
import { registerDarkness } from "./darkness.mjs";
import { registerPersistentDamage } from "./persistent.mjs";
import { registerAgony } from "./agony.mjs";
import { registerDeathsDoor } from "./deaths-door.mjs";
import { registerAmmunition } from "./ammunition.mjs";
import { registerMigrations, migrateWorld } from "./migrate.mjs";
import { registerEffectsRefresh, refreshWorldEffects, RefreshEffectsApp } from "./refresh-effects.mjs";
import { registerEffectButtons } from "./effects.mjs";
import { registerOutcomes } from "./outcomes.mjs";
import { addEscapeListeners } from "./timers.mjs";
import { registerPanicButtons } from "./panic.mjs";
import { registerPanels } from "./panels.mjs";
import { registerOngoingPanel } from "./ongoing-panel.mjs";
import { registerShadowblight } from "./shadowblight.mjs";
import { registerCardOnce } from "./card-once.mjs";
import { registerMedicine } from "./medicine.mjs";
import { registerUses } from "./uses.mjs";
import { registerChoices } from "./choices.mjs";
import { registerDialogControls } from "./dialog.mjs";
import { registerSettings } from "./settings.mjs";
import { registerCards, registerCardsCleanup } from "./cards.mjs";
import { registerArcanaCards } from "./arcana-cards.mjs";
import { registerCardsStrip } from "./cards-strip.mjs";
import { registerMovement } from "./movement.mjs";
import { registerChatRolls } from "./chat-rolls.mjs";
import { registerItemChatHelpers } from "./item-chat.mjs";
import { registerStage } from "./stage.mjs";
import { registerMood } from "./mood.mjs";
import { registerWeatherFx } from "./weather-fx/config.mjs";
import { registerSceneWeather } from "./scene-weather.mjs";
import { registerSceneDarkness } from "./scene-darkness.mjs";

Hooks.once("init", () => {
  console.log("VÅR BORG | Initialising system");

  // Actors: the document class, and which fields each actor type stores.
  CONFIG.Actor.documentClass = VarBorgActor;
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.foe = FoeData;
  CONFIG.Actor.dataModels.minion = MinionData;
  CONFIG.Actor.dataModels.vehicle = VehicleData;
  CONFIG.Actor.dataModels.chest = ChestData;

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
  Actors.registerSheet("var-borg", ChestSheet, { types: ["chest"], makeDefault: true, label: "VARBORG.Sheet.Chest" });

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

  // Active Effects: each lasting state has a type (conditions, persistent
  // damage, Panic, injuries, lost body parts) with its own data.
  CONFIG.ActiveEffect.documentClass = VarBorgActiveEffect;
  Object.assign(CONFIG.ActiveEffect.dataModels, EFFECT_DATA_MODELS);

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

  // Styled journal pages: field journal, letter, notice and scrap.
  CONFIG.JournalEntryPage.dataModels.document = DocumentPageData;
  CONFIG.JournalEntryPage.typeIcons.document = "fa-solid fa-scroll";
  foundry.applications.apps.DocumentSheetConfig.registerSheet(foundry.documents.JournalEntryPage, "var-borg", DocumentPageSheet, {
    types: ["document"], makeDefault: true, label: "VARBORG.Sheet.DocumentPage"
  });
  // Field notes also write the Scholar's Field journal (GAPS 214).
  registerFieldJournal();

  // Combat: initiative, turn order and action pips (rules 3.4).
  CONFIG.Combat.documentClass = VarBorgCombat;
  CONFIG.Combatant.documentClass = VarBorgCombatant;
  Hooks.on("renderCombatTracker", addTrackerPips);

  // Conditions (rules 3.13) as status effects on tokens and sheets.
  registerConditions();
  // Persistent Damage: one effect per type, ticking at the end of the turn.
  registerPersistentDamage();
  // In Darkness: a marker from the scene's lighting, Bane on all tests (rules 3.15).
  registerDarkness();
  registerMood();
  // Scene weather effects for every weather kind and hazard, and scenes
  // that follow today's weather (step 63).
  registerWeatherFx();
  registerSceneWeather();
  // Outdoor scenes whose darkness follows the time of day (GAPS 311).
  registerSceneDarkness();
  // Wounds at 0 HP: the wound test and the Table of Agony (rules 3.5).
  registerAgony();
  // Death's Door and Dark Vessel (rules 3.6).
  registerDeathsDoor();
  // Ammunition: an expendable roll after a combat it was used in (rules 4.1).
  registerAmmunition();
  // The shared panels, each with its own toolbar button: the calendar
  // (days, clock, rest), the light timer, and the Ember and Gloom pools.
  registerPanels();
  // The Ongoing panel beside the sidebar (player feedback).
  registerOngoingPanel();
  // The Shadowblight table button on a spell's Ruin card (rules 3.11).
  registerShadowblight();
  // The Toughness button on medicine box cards (step 34).
  registerMedicine();
  // The Use button on once-per-round, -encounter and -day items (step 36b).
  registerUses();
  registerChoices();
  registerEffectButtons();
  // What powers and spells do to their targets (step 51c).
  registerOutcomes();
  // Escape rolls' Strength test buttons (GAPS 234).
  Hooks.on("renderChatMessageHTML", addEscapeListeners);
  registerPanicButtons();
  // Minions: their owners' sheets follow them (step 42).
  registerMinions();
  // Vehicles: the buttons on driving cards (step 44).
  registerVehicles();
  // Chests: opened by double clicking their token when next to it.
  registerChests();
  // Movement: speeds, movement types and what moves cost (rules 3.7).
  registerMovement();
  // Quick roll buttons above the chat message box.
  registerChatRolls();
  registerItemChatHelpers();
  // In-character chat as a visual novel dialogue box, and the Triumph splash.
  registerStage();
  // The Dark Master's encounter builder (rules 2. Building Encounters).
  registerEncounters();
  // The Dark Master's treasure generator (rules 5. Treasure), also on chests.
  registerTreasure();

  // Chat card buttons: lowering a foe's armour after a Triumph (rules 3.4).
  Hooks.on("renderChatMessageHTML", addAttackCardListeners);
  // Defend on a foe's attack card, Take damage on a defence card (rules 3.4).
  Hooks.on("renderChatMessageHTML", addDefenceCardListeners);
  // Test buttons on a foe's gloom ability card (rules 6, Gloom abilities).
  Hooks.on("renderChatMessageHTML", addGloomCardListeners);
  // Inflict damage on an attack card, Morale on a foe damage card (rules 3.12).
  Hooks.on("renderChatMessageHTML", addMoraleCardListeners);
  registerPoisons();
  // Regions on the map: a fainter, etched look (module/canvas/region.mjs).
  CONFIG.Region.objectClass = VarBorgRegion;
  // Lasting areas: their Region behaviour and the hooks that end them (GAPS 284).
  registerLasting();
  // A deleted power or actor takes its kept areas with it.
  registerAreaCleanup();
  // A player's kept area is created by the Dark Master (module/areas.mjs).
  registerAreaQuery();
  // Once-only card buttons: a player's claim is recorded by the Dark Master (module/card-once.mjs).
  registerCardOnce();
  // The − and + buttons in roll dialogs.
  registerDialogControls();
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

  // World settings: the Creation Helper toggle.
  registerSettings();
  // Foundry Cards decks for the Razor deck, when that setting is on (GAPS 320).
  registerCards();
  // A character's card stacks go with them (step 71).
  registerCardsCleanup();
  // A deleted character's minions and the vehicles made for them go too (step 72).
  registerCompanionCleanup();
  registerArcanaCards();
  // The cards strip above the hotbar (step 70).
  registerCardsStrip();

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

  // GM-only "Check for local file links" button (playtest feedback).
  registerLocalLinks();
});

Hooks.once("ready", async () => {
  console.log("VÅR BORG | Ready");
  await migrateWorld();
  // Compendium item effects newer than the world's are copied in (step 49i).
  await refreshWorldEffects();
});
