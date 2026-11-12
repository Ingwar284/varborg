/**
 * The encounter builder (rules 2. Building Encounters, Combat Tables;
 * GAPS 267 to 269).
 *
 * The Dark Master's Build encounter button in the token controls opens a
 * window: party size, difficulty and the Bestiary categories to draw from
 * (ticked by hand, or rolled on the d10 Type of creature table). Build
 * rolls the d6 encounter type for that difficulty, fits it to the party's
 * budget and picks a random foe for each tier from the ticked categories:
 * foes of one tier are the same creature. Any foe can be rerolled on its
 * own. Post to chat sends a card to the Dark Master only, with the foes
 * (click to open a sheet) and a Place tokens button that puts them on the
 * current scene, around the middle of the view.
 *
 * Foes come from the system's Bestiary compendium, plus world foes the
 * Dark Master made (world foes imported from a compendium are skipped, so
 * nothing is counted twice). Mooks are never picked.
 *
 * The maths lives in module/rules/encounters.mjs.
 */

import {
  DIFFICULTIES, PARTY_SIZES, TIER_POINTS, TIER_ORDER, budgetFor, cleanParty, cleanDifficulty,
  creatureTypeFor, rollEncounterType, isPickable, CREATURE_TYPES
} from "./rules/encounters.mjs";
import { FOE_CATEGORIES } from "./rules/foe.mjs";
import { encounterParty, setEncounterParty } from "./settings.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const FOE_PACK = "var-borg.foes";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/encounter-card.hbs";

/** Categories in the order of the d10 Type of creature table. */
const CATEGORIES = CREATURE_TYPES.flatMap(row => row.categories)
  .filter(category => FOE_CATEGORIES.includes(category));

/**
 * The last choices made, offered again next time. Difficulty and categories
 * last this session only; the party size is kept between sessions (a
 * setting of this user's, read when the builder first opens).
 */
const last = { players: null, difficulty: "standard", categories: [] };

/* -------------------------------------------- */
/*  Hooks                                        */
/* -------------------------------------------- */

export function registerEncounters() {
  Hooks.on("getSceneControlButtons", addBuilderButton);
  Hooks.on("renderChatMessageHTML", addEncounterCardListeners);
}

/** The Dark Master's Build encounter button in the token controls. */
function addBuilderButton(controls) {
  const tools = controls.tokens?.tools;
  if (!tools || !game.user.isGM) return;
  tools.varBorgEncounter = {
    name: "varBorgEncounter",
    title: "VARBORG.Encounter.Open",
    icon: "fa-solid fa-skull-crossbones",
    order: Object.keys(tools).length,
    button: true,
    visible: true,
    onChange: () => {
      const app = foundry.applications.instances.get(EncounterBuilder.DEFAULT_OPTIONS.id);
      if (app) app.close();
      else new EncounterBuilder().render({ force: true });
    }
  };
}

/* -------------------------------------------- */
/*  Foes to choose from                          */
/* -------------------------------------------- */

/**
 * Every foe that can be picked, as { uuid, name, img, tier, category }.
 * @param {string[]} categories  The ticked categories.
 */
async function foePool(categories) {
  const pool = [];
  const pack = game.packs.get(FOE_PACK);
  if (pack) {
    const index = await pack.getIndex({ fields: ["system.tier", "system.category", "system.mook"] });
    for (const entry of index) {
      if (entry.type && entry.type !== "foe") continue;
      const foe = { uuid: entry.uuid, name: entry.name, img: entry.img, ...entry.system };
      if (isPickable(foe, categories)) pool.push(foe);
    }
  }
  for (const actor of game.actors) {
    if (actor.type !== "foe" || actor._stats?.compendiumSource) continue;
    const foe = { uuid: actor.uuid, name: actor.name, img: actor.img, ...actor.system };
    if (isPickable(foe, categories)) pool.push(foe);
  }
  return pool;
}

/** A random foe of this tier from the pool, or null if there is none. */
function pickFoe(pool, tier) {
  const choices = pool.filter(foe => foe.tier === tier);
  if (!choices.length) return null;
  const foe = choices[Math.floor(CONFIG.Dice.randomUniform() * choices.length)];
  return { uuid: foe.uuid, name: foe.name, img: foe.img };
}

async function rollDie(formula) {
  const roll = await new Roll(formula).evaluate();
  return roll.total;
}

/* -------------------------------------------- */
/*  The window                                   */
/* -------------------------------------------- */

export class EncounterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "var-borg-encounter-builder",
    classes: ["var-borg", "themed", "theme-light", "encounter-builder"],
    window: { title: "VARBORG.Encounter.Title", icon: "fa-solid fa-skull-crossbones", resizable: true },
    // A fixed height: the contents scroll inside the window.
    position: { width: 460, height: 780 },
    actions: {
      rollCategory: EncounterBuilder.#onRollCategory,
      build: EncounterBuilder.#onBuild,
      rerollFoe: EncounterBuilder.#onRerollFoe,
      post: EncounterBuilder.#onPost
    }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/encounter-builder.hbs", scrollable: [""] }
  };

  /** The choices on the form. */
  players = last.players ?? cleanParty(encounterParty());
  difficulty = last.difficulty;
  categories = new Set(last.categories);
  /** The d10 line under the categories, or "". */
  categoryRoll = "";
  /** The built encounter, or null. */
  result = null;

  async _prepareContext(options) {
    const i18n = game.i18n;
    const players = this.players;
    const result = this.result;
    let encounter = null;
    if (result) {
      const total = result.foes.reduce((sum, foe) => sum + TIER_POINTS[foe.tier], 0);
      encounter = {
        heading: encounterHeading(result),
        rolls: rollsLine(result),
        total,
        budget: result.budget,
        notFit: !result.fits,
        missing: result.foes.some(foe => !foe.uuid),
        foes: result.foes.map((foe, index) => ({
          index,
          name: foe.name ?? i18n.localize("VARBORG.Encounter.NoFoe"),
          img: foe.img,
          missing: !foe.uuid,
          tier: i18n.localize(`VARBORG.Foe.Tier.${foe.tier}`),
          points: TIER_POINTS[foe.tier]
        }))
      };
    }
    return {
      players: PARTY_SIZES.map(n => ({ value: n, selected: n === players })),
      difficulties: DIFFICULTIES.map(key => ({
        key,
        checked: key === this.difficulty,
        label: i18n.localize(`VARBORG.Encounter.Difficulty.${key}`),
        feel: i18n.localize(`VARBORG.Encounter.Feel.${key}`),
        budget: budgetFor(key, players)
      })),
      categories: CATEGORIES.map(key => ({
        key,
        checked: this.categories.has(key),
        label: i18n.localize(`VARBORG.Foe.Category.${key}`)
      })),
      categoryRoll: this.categoryRoll,
      encounter
    };
  }

  /** Keep the form's choices as they change, and redraw the budgets. */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[name='players']")?.addEventListener("change", event => {
      this.players = cleanParty(event.target.value);
      last.players = this.players;
      setEncounterParty(this.players);
      this.render();
    });
    for (const input of this.element.querySelectorAll("[name='difficulty']")) {
      input.addEventListener("change", event => {
        this.difficulty = cleanDifficulty(event.target.value);
        last.difficulty = this.difficulty;
      });
    }
    for (const input of this.element.querySelectorAll("[name='category']")) {
      input.addEventListener("change", event => {
        if (event.target.checked) this.categories.add(event.target.value);
        else this.categories.delete(event.target.value);
        last.categories = [...this.categories];
      });
    }
  }

  /** Roll the d10 Type of creature table and tick what it gives. */
  static async #onRollCategory(event, button) {
    const roll = await rollDie("1d10");
    const categories = creatureTypeFor(roll);
    this.categories = new Set(categories);
    last.categories = [...categories];
    this.categoryRoll = game.i18n.format("VARBORG.Encounter.CategoryRolled", {
      roll,
      categories: categories.map(key => game.i18n.localize(`VARBORG.Foe.Category.${key}`)).join(", ")
    });
    this.render();
  }

  /** Roll the encounter type and pick its foes. */
  static async #onBuild(event, button) {
    if (!this.categories.size) {
      ui.notifications.warn("VARBORG.Encounter.NoCategory", { localize: true });
      return;
    }
    button.disabled = true;
    try {
      // Roll the d6s first (each a real roll), then work out the result.
      const dice = [];
      for (let i = 0; i < 50; i++) dice.push(await rollDie("1d6"));
      let next = 0;
      const rolled = rollEncounterType(this.difficulty, this.players, () => dice[next++ % dice.length]);

      const categories = [...this.categories];
      const pool = await foePool(categories);
      const foes = [];
      for (const tier of TIER_ORDER) {
        const count = rolled.foes[tier] ?? 0;
        if (!count) continue;
        const foe = pickFoe(pool, tier);
        for (let i = 0; i < count; i++) foes.push({ tier, ...foe });
      }

      this.result = {
        difficulty: this.difficulty,
        players: this.players,
        budget: budgetFor(this.difficulty, this.players),
        typeKey: rolled.type.key,
        rolls: rolled.rolls,
        fits: rolled.fits,
        categories,
        foes
      };
      if (foes.some(foe => !foe.uuid)) ui.notifications.warn("VARBORG.Encounter.MissingWarn", { localize: true });
    } finally {
      button.disabled = false;
    }
    this.render();
  }

  /** Pick another foe of the same tier for one place. */
  static async #onRerollFoe(event, button) {
    const foe = this.result?.foes[Number(button.dataset.index)];
    if (!foe) return;
    const pool = await foePool(this.result.categories);
    // Prefer a different creature when there is one.
    const others = pool.filter(other => other.uuid !== foe.uuid);
    const picked = pickFoe(others.some(other => other.tier === foe.tier) ? others : pool, foe.tier);
    Object.assign(foe, { uuid: null, name: null, img: null }, picked);
    this.render();
  }

  /** Send the encounter to the Dark Master's chat. */
  static async #onPost(event, button) {
    if (!this.result) return;
    button.disabled = true;
    try {
      await postEncounter(this.result);
    } finally {
      button.disabled = false;
    }
  }
}

/* -------------------------------------------- */
/*  Words                                        */
/* -------------------------------------------- */

/** "Hard encounter for 3 players: Pack". */
function encounterHeading(result) {
  const i18n = game.i18n;
  return i18n.format("VARBORG.Encounter.Heading", {
    difficulty: i18n.localize(`VARBORG.Encounter.Difficulty.${result.difficulty}`),
    players: result.players,
    type: i18n.localize(`VARBORG.Encounter.Type.${result.typeKey}`)
  });
}

/** "d6: 4" or "d6: 4, 2, 1 (rolled again until it fitted the party)". */
function rollsLine(result) {
  const i18n = game.i18n;
  const key = result.rolls.length > 1 ? "VARBORG.Encounter.RollsAgain" : "VARBORG.Encounter.Rolls";
  return i18n.format(key, { rolls: result.rolls.join(", ") });
}

/* -------------------------------------------- */
/*  The chat card                                */
/* -------------------------------------------- */

async function postEncounter(result) {
  const i18n = game.i18n;
  const foes = result.foes.filter(foe => foe.uuid);
  // One line per creature, with how many.
  const lines = [];
  for (const foe of foes) {
    const line = lines.find(other => other.uuid === foe.uuid);
    if (line) line.count++;
    else lines.push({ uuid: foe.uuid, name: foe.name, count: 1, tier: i18n.localize(`VARBORG.Foe.Tier.${foe.tier}`) });
  }
  for (const line of lines) line.many = line.count > 1;
  const total = foes.reduce((sum, foe) => sum + TIER_POINTS[foe.tier], 0);
  const content = await renderTemplate(CARD_TEMPLATE, {
    heading: encounterHeading(result),
    rolls: rollsLine(result),
    threat: i18n.format("VARBORG.Encounter.Threat", { total, budget: result.budget }),
    notFit: !result.fits,
    lines
  });
  await ChatMessage.create({
    speaker: { alias: i18n.localize("VARBORG.Encounter.Title") },
    whisper: ChatMessage.getWhisperRecipients("GM").map(user => user.id),
    content,
    flags: { [SYSTEM]: { encounter: { foes: foes.map(foe => foe.uuid) } } }
  });
}

/** Foe links and the Place tokens button on an encounter card. */
function addEncounterCardListeners(message, html) {
  const data = message.getFlag(SYSTEM, "encounter");
  if (!data) return;
  for (const link of html.querySelectorAll("[data-foe-uuid]")) {
    link.addEventListener("click", async event => {
      event.preventDefault();
      const actor = await fromUuid(link.dataset.foeUuid);
      actor?.sheet.render({ force: true });
    });
  }
  const button = html.querySelector("button[data-action='placeEncounter']");
  if (!button) return;
  if (!game.user.isGM) {
    button.disabled = true;
    return;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await placeFoes(data.foes);
    } finally {
      button.disabled = false;
    }
  });
}

/* -------------------------------------------- */
/*  Placing the tokens                           */
/* -------------------------------------------- */

/** The world folder imported encounter foes go into. */
async function encounterFolder() {
  const name = game.i18n.localize("VARBORG.Encounter.Folder");
  return game.folders.find(folder => folder.type === "Actor" && folder.name === name)
    ?? Folder.create({ name, type: "Actor" });
}

/**
 * The world actor for a foe: itself, the copy already imported from the
 * compendium, or a new import into the encounter folder.
 */
async function worldActor(uuid, cache) {
  if (cache.has(uuid)) return cache.get(uuid);
  const doc = await fromUuid(uuid);
  let actor = null;
  if (doc && !doc.pack) actor = doc;
  else if (doc) {
    actor = game.actors.find(other => other._stats?.compendiumSource === uuid) ?? null;
    if (!actor) {
      const folder = await encounterFolder();
      actor = await game.actors.importFromCompendium(game.packs.get(doc.pack), doc.id, { folder: folder.id });
    }
  }
  cache.set(uuid, actor);
  return actor;
}

/**
 * Put the foes on the current scene, in rows of four around the middle
 * of the view.
 * @param {string[]} uuids  One per foe (a creature appears once per copy).
 */
async function placeFoes(uuids) {
  const scene = canvas.scene;
  if (!scene) {
    ui.notifications.warn("VARBORG.Encounter.NoScene", { localize: true });
    return;
  }
  const cache = new Map();
  const actors = [];
  for (const uuid of uuids) {
    const actor = await worldActor(uuid, cache);
    if (actor) actors.push(actor);
  }
  if (!actors.length) return;

  const size = canvas.grid.size;
  // Room for the widest token, in grid squares.
  const step = Math.max(1, ...actors.map(actor => Math.ceil(actor.prototypeToken.width ?? 1))) * size;
  const perRow = Math.min(4, actors.length);
  const rows = Math.ceil(actors.length / perRow);
  const centre = canvas.stage.pivot;
  const left = centre.x - (perRow * step) / 2;
  const top = centre.y - (rows * step) / 2;

  const tokens = [];
  for (const [i, actor] of actors.entries()) {
    const point = canvas.grid.getTopLeftPoint({
      x: left + (i % perRow) * step + size / 2,
      y: top + Math.floor(i / perRow) * step + size / 2
    });
    const token = await actor.getTokenDocument({ x: point.x, y: point.y });
    tokens.push(token.toObject());
  }
  await scene.createEmbeddedDocuments("Token", tokens);
  ui.notifications.info(game.i18n.format("VARBORG.Encounter.Placed", { count: tokens.length, scene: scene.name }));
}
