/**
 * The character creation helper (rules 2.1 Creating your PC, GAPS 180).
 *
 * An optional window, opened from the Origins heading of a character sheet.
 * It walks through the steps of rules 2.1 in any order:
 * 1. Abilities (2.2): roll individually, roll together, or from zero to hero.
 * 2. Ancestry (2.3) and the one ancestry feat you begin with.
 * 3. Background (2.4): wealth and keepsake, as when it is dropped.
 * 4. Class (2.5): the class with its class feature and class power (both
 *    set by the class, no choice), and one spell from its list
 *    costing at most 3 ember.
 * 5. Starting equipment (2.6): the class die on armour and weaponry, then
 *    d6, d8 and d10 on the gear tables.
 * 6. Difficulty feat (rules 4.6): optional, Harkin's Reprieve or
 *    Doomsworn, and only one (step 50a2).
 * 7. Details: the name; the rest is in the sheet's Details section.
 * Ancestries, backgrounds, classes, feats, powers and spells are offered
 * from the world's Items and from every Item compendium. Ancestry feats and
 * class powers are those that belong to the chosen ancestry or class, or
 * whose "belongs to" is still blank (GAPS 180).
 *
 * Each step posts a card. The tables and maths are in module/rules/creation.mjs.
 */

import {
  ROLL_SUM_FORMULA, CARRYING_DIE, TOOLS_DIE, ODDS_DIE, DOG,
  ABILITY_METHODS, scoresFromSums, scoresFromArray, zeroScores,
  startingEquipment, learnableSpells, STARTING_SPELL_MAX_COST
} from "./rules/creation.mjs";
import { ABILITIES } from "./rules/abilities.mjs";
import { addOrigin } from "./origins.mjs";
import { belongsTo, classStarting } from "./rules/feats.mjs";
import { signed } from "./dice/ability-test.mjs";
import { fortuneFormula, FORTUNE_DIE } from "./rules/item-effects.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";
import { creationHelperOn } from "./settings.mjs";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const CARD_TEMPLATE = "systems/var-borg/templates/chat/origin-card.hbs";

/** The example small vicious dog (content/examples/actors/small-vicious-dog.json). */
const DOG_ID = "vbExampleDog0000";

/** The actor flag set once starting equipment is rolled. */
const EQUIPMENT_FLAG = "startingEquipment";

/** The item types the helper offers. */
const OFFERED_TYPES = ["ancestry", "background", "class", "feat", "power", "spell"];

/**
 * Every ancestry, background, class, feat, power and spell in the world's
 * Items and in Item compendiums, as { uuid, name, type, source, cost, spellList, from }.
 */
async function gatherSources() {
  const list = [];
  for (const item of game.items) {
    if (!OFFERED_TYPES.includes(item.type)) continue;
    list.push({
      uuid: item.uuid, name: item.name, type: item.type, from: "",
      source: item.system.source, cost: item.system.cost, spellList: item.system.spellList, ritual: Boolean(item.system.ritual),
      belongsTo: item.system.belongsTo
    });
  }
  for (const pack of game.packs) {
    if (pack.documentName !== "Item" || !pack.visible) continue;
    const index = await pack.getIndex({ fields: ["system.source", "system.cost", "system.spellList", "system.belongsTo", "system.ritual"] });
    for (const entry of index) {
      if (!OFFERED_TYPES.includes(entry.type)) continue;
      list.push({
        uuid: entry.uuid, name: entry.name, type: entry.type, from: pack.metadata.label,
        source: entry.system?.source, cost: entry.system?.cost, spellList: entry.system?.spellList, ritual: Boolean(entry.system?.ritual),
        belongsTo: entry.system?.belongsTo
      });
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/** The item data to create from a uuid, without its id. */
async function itemData(uuid) {
  const doc = uuid ? await fromUuid(uuid) : null;
  if (!doc) return null;
  const data = doc.toObject();
  delete data._id;
  // Remember the compendium it came from, so later effects reach it (step 49i).
  if (doc.compendium) data._stats = { ...data._stats, compendiumSource: doc.uuid };
  return data;
}

/** Post a helper card: a title and lines, with any dice rolled. */
async function postCard(actor, title, lines, rolls = []) {
  const content = await renderTemplate(CARD_TEMPLATE, { title, lines });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : undefined
  });
}

/** Roll a formula and keep the roll for the card. */
async function rollInto(rolls, formula) {
  const roll = await new Roll(formula).evaluate();
  rolls.push(roll);
  return roll.total;
}

/**
 * Remove the character's items of `type` with feat/power source `source`
 * that were not gained through Improving: a character begins with one
 * ancestry feat and one class power (rules 2.1). Returns their names.
 */
async function removeStarting(actor, type, source) {
  const old = actor.itemTypes[type].filter(item => item.system.source === source && !item.system.improving);
  if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map(item => item.id));
  return old.map(item => item.name);
}

/** Item data for one row of the starting equipment tables. */
function equipmentItem(spec) {
  const i18n = game.i18n;
  const textKey = `VARBORG.Creation.Item.${spec.key}Text`;
  return {
    name: i18n.localize(`VARBORG.Creation.Item.${spec.key}`),
    type: spec.type,
    img: spec.img,
    system: { ...spec.system, description: i18n.has(textKey) ? i18n.localize(textKey) : "" }
  };
}

export default class CreationHelper extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @param {Actor} actor  The character being made. */
  constructor(actor, options = {}) {
    super({ ...options, id: `var-borg-creation-${actor.id}` });
    this.actor = actor;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["var-borg", "themed", "theme-light", "creation-helper"],
    window: { icon: "fa-solid fa-user-plus", resizable: true },
    position: { width: 520, height: 700 },
    form: { handler: CreationHelper.#onChange, submitOnChange: true, closeOnSubmit: false },
    actions: {
      rollIndividual: CreationHelper.#onRollIndividual,
      rollArray: CreationHelper.#onRollArray,
      applyArray: CreationHelper.#onApplyArray,
      applyZero: CreationHelper.#onApplyZero,
      applyAncestry: CreationHelper.#onApplyAncestry,
      applyBackground: CreationHelper.#onApplyBackground,
      applyClass: CreationHelper.#onApplyClass,
      applyDifficulty: CreationHelper.#onApplyDifficulty,
      rollEquipment: CreationHelper.#onRollEquipment
    }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/creation-helper.hbs", scrollable: [""] }
  };

  /** What the player has picked so far (not yet applied). */
  state = {
    method: ABILITY_METHODS[0],
    array: ["", "", "", "", ""],
    assigned: {},
    ancestry: "", ancestryFeat: "", background: "", cls: "", spell: "", difficulty: ""
  };

  /** @override */
  get title() {
    return game.i18n.format("VARBORG.Creation.Title", { name: this.actor.name });
  }

  /** Re-render when the character changes, so "Now:" stays true. */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.actor.apps[this.id] = this;
  }

  _onClose(options) {
    super._onClose(options);
    delete this.actor.apps[this.id];
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const i18n = game.i18n;
    const actor = this.actor;
    const state = this.state;
    const sources = await gatherSources();
    const choices = (filter, chosen) => sources.filter(filter).map(s => ({
      uuid: s.uuid,
      label: s.from ? `${s.name} (${s.from})` : s.name,
      selected: s.uuid === chosen
    }));
    const now = type => actor.itemTypes[type]?.[0]?.name ?? "";

    // The ancestry whose feats are offered: the one picked, or the one the character has.
    const ancestryName = sources.find(s => s.uuid === state.ancestry)?.name ?? actor.itemTypes.ancestry?.[0]?.name ?? "";
    // The class whose power and spell are offered: the one picked, or the one the character has.
    const pickedClass = sources.find(s => s.uuid === state.cls);
    const className = pickedClass?.name ?? actor.itemTypes.class?.[0]?.name ?? "";
    const classList = pickedClass?.spellList ?? actor.itemTypes.class?.[0]?.system.spellList ?? "none";
    const spells = sources.filter(s => s.type === "spell");
    const learnable = new Set(learnableSpells(spells.map(s => ({ spellList: s.spellList, cost: s.cost ?? 0, ritual: s.ritual })), classList));

    const arrayPlaces = state.array.map((sum, index) => ({
      index,
      label: i18n.format("VARBORG.Creation.Abilities.Place", { place: index + 1, sum: sum === "" ? "–" : sum })
    }));

    Object.assign(context, {
      actor,
      methods: ABILITY_METHODS.map(key => ({
        key, label: `VARBORG.Creation.Method.${key}`, selected: key === state.method
      })),
      method: state.method,
      methodHint: `VARBORG.Creation.Method.${state.method}Hint`,
      isIndividual: state.method === "individual",
      isTogether: state.method === "together",
      isZero: state.method === "zero",
      currentScores: ABILITIES.map(key => `${i18n.localize(`VARBORG.Ability.${key}`)} ${signed(actor.system.rolledAbilities[key])}`).join(" · "),
      array: state.array.map((sum, index) => ({ index, sum })),
      assign: ABILITIES.map(key => ({
        key,
        label: `VARBORG.Ability.${key}`,
        places: arrayPlaces.map(place => ({ ...place, selected: state.assigned[key] === place.index }))
      })),
      ancestries: choices(s => s.type === "ancestry", state.ancestry),
      ancestryFeats: choices(s => s.type === "feat" && s.source === "ancestry" && belongsTo(s.belongsTo, ancestryName), state.ancestryFeat),
      backgrounds: choices(s => s.type === "background", state.background),
      difficultyFeats: choices(s => s.type === "feat" && s.source === "difficulty", state.difficulty),
      classes: choices(s => s.type === "class", state.cls),
      // The class's own feature and power (rules 2.5), named by the class.
      classStarting: await this.#classStartingNames(pickedClass?.uuid ?? actor.itemTypes.class?.[0]?.uuid),
      spells: choices(s => s.type === "spell" && learnable.has(spells.indexOf(s)), state.spell),
      hasSpellList: classList !== "none",
      spellHint: i18n.format("VARBORG.Creation.Class.SpellHint", {
        list: i18n.localize(`VARBORG.Class.SpellList.${classList}`), cost: STARTING_SPELL_MAX_COST
      }),
      now: {
        ancestry: now("ancestry"),
        background: now("background"),
        class: now("class"),
        ancestryFeat: actor.itemTypes.feat.filter(f => f.system.source === "ancestry" && !f.system.improving).map(f => f.name).join(", "),
        power: actor.itemTypes.power.filter(p => p.system.source === "class").map(p => p.name).join(", "),
        feature: actor.itemTypes.feat.filter(f => f.system.source === "feature").map(f => f.name).join(", "),
        spell: (actor.itemTypes.spell ?? []).map(s => s.name).join(", "),
        difficulty: actor.itemTypes.feat.filter(f => f.system.source === "difficulty").map(f => f.name).join(", ")
      },
      hasClass: Boolean(actor.itemTypes.class?.[0]),
      startingDie: actor.itemTypes.class?.[0]?.system.startingDie ?? "",
      fixedWeapons: Boolean(actor.itemTypes.class?.[0]?.system.startingWeapons?.length),
      equipmentRolled: Boolean(actor.getFlag(SYSTEM, EQUIPMENT_FLAG))
    });
    return context;
  }

  /** Keep what was picked; the name is written to the character at once. */
  static async #onChange(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const state = this.state;
    for (const key of ["method", "ancestry", "ancestryFeat", "background", "cls", "spell", "difficulty"]) {
      if (key in data) state[key] = data[key] ?? "";
    }
    if (data.array) {
      state.array = state.array.map((old, index) => {
        const value = data.array[index];
        return value === null || value === undefined || value === "" ? "" : Number(value);
      });
    }
    if (data.assigned) {
      for (const ability of ABILITIES) {
        const place = data.assigned[ability];
        if (place === "" || place === null || place === undefined) delete state.assigned[ability];
        else state.assigned[ability] = Number(place);
      }
    }
    // A new class may have another spell list: drop a spell it cannot learn.
    // A new ancestry or class has other feats, powers or spells: drop picks that may not fit.
    if (event?.target?.name === "cls") state.spell = "";
    if (event?.target?.name === "ancestry") state.ancestryFeat = "";
    if (typeof data.name === "string" && data.name.trim() && data.name !== this.actor.name) {
      await this.actor.update({ name: data.name.trim() });
    }
    this.render();
  }

  /** Ask before replacing scores that are not all ±0. */
  async #confirmAbilities() {
    const rolled = this.actor.system.rolledAbilities;
    if (ABILITIES.every(key => rolled[key] === 0)) return true;
    return DialogV2.confirm({
      classes: VB_DIALOG_CLASSES,
      window: { title: game.i18n.localize("VARBORG.Creation.Abilities.ReplaceTitle") },
      content: `<p>${game.i18n.localize("VARBORG.Creation.Abilities.Replace")}</p>`
    });
  }

  /** Write the scores as rolled and post a card. */
  async #setAbilities(scores, lines, rolls = []) {
    await this.actor.update(Object.fromEntries(ABILITIES.map(key => [`system.abilities.${key}`, scores[key]])));
    const title = game.i18n.format("VARBORG.Creation.Abilities.CardTitle", { name: this.actor.name });
    await postCard(this.actor, title, lines, rolls);
  }

  /** Roll individually: 3d6 for each ability (rules 2.2). */
  static async #onRollIndividual() {
    if (!(await this.#confirmAbilities())) return;
    const i18n = game.i18n;
    const rolls = [];
    const sums = {};
    for (const key of ABILITIES) sums[key] = await rollInto(rolls, ROLL_SUM_FORMULA);
    const scores = scoresFromSums(sums);
    const lines = ABILITIES.map(key => i18n.format("VARBORG.Creation.Abilities.Line", {
      ability: i18n.localize(`VARBORG.Ability.${key}`), sum: sums[key], score: signed(scores[key])
    }));
    await this.#setAbilities(scores, lines, rolls);
  }

  /** Roll together: five 3d6 for the group's array (rules 2.2). */
  static async #onRollArray() {
    const rolls = [];
    const array = [];
    for (let i = 0; i < ABILITIES.length; i++) array.push(await rollInto(rolls, ROLL_SUM_FORMULA));
    this.state.array = array;
    this.state.assigned = {};
    const title = game.i18n.format("VARBORG.Creation.Abilities.ArrayTitle", { name: this.actor.name });
    await postCard(this.actor, title, [game.i18n.format("VARBORG.Creation.Abilities.ArrayLine", { sums: array.join(", ") })], rolls);
    this.render();
  }

  /** Divide the array over the abilities. */
  static async #onApplyArray() {
    const i18n = game.i18n;
    const array = this.state.array;
    const scores = scoresFromArray(array, this.state.assigned);
    if (!scores) {
      ui.notifications.warn("VARBORG.Creation.Abilities.ArrayInvalid", { localize: true });
      return;
    }
    if (!(await this.#confirmAbilities())) return;
    const lines = ABILITIES.map(key => i18n.format("VARBORG.Creation.Abilities.Line", {
      ability: i18n.localize(`VARBORG.Ability.${key}`), sum: array[this.state.assigned[key]], score: signed(scores[key])
    }));
    await this.#setAbilities(scores, lines);
  }

  /** From zero to hero: every ability ±0. */
  static async #onApplyZero() {
    if (!(await this.#confirmAbilities())) return;
    await this.#setAbilities(zeroScores(), [game.i18n.localize("VARBORG.Creation.Abilities.ZeroLine")]);
  }

  /** The ancestry, and the one ancestry feat you begin with (rules 2.1, Step 2). */
  static async #onApplyAncestry() {
    const i18n = game.i18n;
    const actor = this.actor;
    const ancestry = await itemData(this.state.ancestry);
    const feat = await itemData(this.state.ancestryFeat);
    if (!ancestry && !feat) {
      ui.notifications.warn("VARBORG.Creation.PickFirst", { localize: true });
      return;
    }
    if (ancestry) await addOrigin(actor, ancestry);
    if (feat) {
      const removed = await removeStarting(actor, "feat", "ancestry");
      await actor.createEmbeddedDocuments("Item", [feat]);
      const lines = [i18n.format("VARBORG.Creation.Ancestry.FeatTaken", { name: actor.name, feat: feat.name })];
      if (removed.length) lines.push(i18n.format("VARBORG.Creation.Removed", { names: removed.join(", ") }));
      await postCard(actor, i18n.format("VARBORG.Creation.Ancestry.FeatTitle", { name: actor.name }), lines);
    }
  }

  /**
   * The difficulty feat (rules 4.6, step 50a2): optional, and only one, so
   * one taken earlier is replaced. A feat that changes the Fortune die
   * (Doomsworn: d2) rolls the starting Fortune again with it.
   */
  static async #onApplyDifficulty() {
    const i18n = game.i18n;
    const actor = this.actor;
    const feat = await itemData(this.state.difficulty);
    if (!feat) {
      ui.notifications.warn("VARBORG.Creation.PickFirst", { localize: true });
      return;
    }
    const removed = await removeStarting(actor, "feat", "difficulty");
    await actor.createEmbeddedDocuments("Item", [feat]);
    const lines = [i18n.format("VARBORG.Creation.Difficulty.Taken", { name: actor.name, feat: feat.name })];
    if (removed.length) lines.push(i18n.format("VARBORG.Creation.Removed", { names: removed.join(", ") }));
    const rolls = [];
    const formula = fortuneFormula(actor.system.statBonuses?.fortuneDie);
    if (formula !== `1d${FORTUNE_DIE}`) {
      const fortune = await rollInto(rolls, formula);
      await actor.update({ "system.fortune": fortune });
      lines.push(i18n.format("VARBORG.Creation.Difficulty.Fortune", { formula: formula.replace(/^1d/, "d"), fortune }));
    }
    await postCard(actor, i18n.format("VARBORG.Creation.Difficulty.CardTitle", { name: actor.name }), lines, rolls);
  }

  /** The background: wealth and keepsake (rules 2.4). */
  static async #onApplyBackground() {
    const background = await itemData(this.state.background);
    if (!background) {
      ui.notifications.warn("VARBORG.Creation.PickFirst", { localize: true });
      return;
    }
    await addOrigin(this.actor, background);
  }

  /**
   * The names of a class's feature and power (rules 2.5), for the step's
   * line, or null without a class.
   */
  async #classStartingNames(uuid) {
    const cls = uuid ? await fromUuid(uuid) : null;
    if (!cls) return null;
    const names = classStarting(cls.system.description);
    return names.feature || names.power ? names : null;
  }

  /**
   * The class (rules 2.1, Step 4): it comes with its class feature and its
   * class power, both set by the class (rules 2.5), replacing those of an
   * earlier class. Then one spell from its list.
   */
  static async #onApplyClass() {
    const i18n = game.i18n;
    const actor = this.actor;
    const cls = await itemData(this.state.cls);
    const spell = await itemData(this.state.spell);
    if (!cls && !spell) {
      ui.notifications.warn("VARBORG.Creation.PickFirst", { localize: true });
      return;
    }
    const lines = [];
    if (cls) {
      await addOrigin(actor, cls);
      const names = classStarting(cls.system.description);
      const sources = await gatherSources();
      const find = (type, source, name) => sources.find(s => s.type === type && s.source === source && s.name === name && belongsTo(s.belongsTo, cls.name));
      const removed = [...await removeStarting(actor, "feat", "feature"), ...await removeStarting(actor, "power", "class")];
      for (const [type, source, name, key] of [["feat", "feature", names.feature, "FeatureTaken"], ["power", "class", names.power, "PowerTaken"]]) {
        const found = name ? find(type, source, name) : null;
        const data = found ? await itemData(found.uuid) : null;
        if (!data) {
          lines.push(i18n.format("VARBORG.Creation.Class.NotFound", { name: name || "?" }));
          continue;
        }
        await actor.createEmbeddedDocuments("Item", [data]);
        lines.push(i18n.format(`VARBORG.Creation.Class.${key}`, { name: actor.name, power: data.name, feature: data.name }));
      }
      if (removed.length) lines.push(i18n.format("VARBORG.Creation.Removed", { names: removed.join(", ") }));
    }
    if (spell) {
      await actor.createEmbeddedDocuments("Item", [spell]);
      lines.push(i18n.format("VARBORG.Creation.Class.SpellLearned", { name: actor.name, spell: spell.name }));
    }
    if (lines.length) await postCard(actor, i18n.format("VARBORG.Creation.Class.CardTitle", { name: actor.name }), lines);
    this.state.cls = "";
  }

  /** Ask which carrying item to take, when the row offers a choice. */
  async #chooseCarrying(choice) {
    const i18n = game.i18n;
    const picked = await DialogV2.wait({
      classes: VB_DIALOG_CLASSES,
      window: { title: i18n.localize("VARBORG.Creation.Equipment.ChooseTitle") },
      content: `<p>${i18n.localize("VARBORG.Creation.Equipment.Choose")}</p>`,
      buttons: choice.map((spec, index) => ({
        action: String(index),
        label: i18n.localize(`VARBORG.Creation.Item.${spec.key}`),
        default: index === 0
      })),
      rejectClose: false
    });
    return choice[Number(picked ?? 0)] ?? choice[0];
  }

  /** Make the small vicious dog serve this character, if the example is in the world. */
  async #addDog() {
    const i18n = game.i18n;
    const example = game.actors.get(DOG_ID);
    if (!example || !game.user.can("ACTOR_CREATE")) return i18n.localize("VARBORG.Creation.Equipment.DogMissing");
    const data = example.toObject();
    delete data._id;
    data.system.owner = this.actor.id;
    data.folder = null;
    // Refused when the character has no room under their minion limit (GAPS 171).
    const dog = await Actor.create(data);
    if (!dog) return i18n.format("VARBORG.Creation.Equipment.DogRefused", { name: this.actor.name });
    return i18n.format("VARBORG.Creation.Equipment.DogAdded", { name: this.actor.name });
  }

  /** Starting equipment (rules 2.6). */
  static async #onRollEquipment() {
    const i18n = game.i18n;
    const actor = this.actor;
    const cls = actor.itemTypes.class?.[0];
    if (!cls) {
      ui.notifications.warn("VARBORG.Creation.Equipment.NeedClass", { localize: true });
      return;
    }
    if (actor.getFlag(SYSTEM, EQUIPMENT_FLAG)) {
      const again = await DialogV2.confirm({
        classes: VB_DIALOG_CLASSES,
        window: { title: i18n.localize("VARBORG.Creation.Equipment.AgainTitle") },
        content: `<p>${i18n.localize("VARBORG.Creation.Equipment.Again")}</p>`
      });
      if (!again) return;
    }

    const die = cls.system.startingDie;
    // A class with fixed starting weapons rolls on the armour table only (GAPS 183).
    const fixedWeapons = cls.system.startingWeapons ?? [];
    const rolls = [];
    const results = {
      armour: await rollInto(rolls, `1${die}`),
      weaponry: fixedWeapons.length ? null : await rollInto(rolls, `1${die}`),
      carrying: await rollInto(rolls, `1d${CARRYING_DIE}`),
      tools: await rollInto(rolls, `1d${TOOLS_DIE}`),
      odds: await rollInto(rolls, `1d${ODDS_DIE}`)
    };
    const found = startingEquipment(results, actor.system.abilities.sanity, fixedWeapons);
    if (found.carryingChoice) found.carrying = [await this.#chooseCarrying(found.carryingChoice)];

    const dice = { armour: die, weaponry: die, carrying: `d${CARRYING_DIE}`, tools: `d${TOOLS_DIE}`, odds: `d${ODDS_DIE}` };
    const toCreate = [];
    const lines = [];
    const extra = [];
    for (const table of ["armour", "weaponry", "carrying", "tools", "odds"]) {
      const names = [];
      for (const spec of found[table]) {
        if (spec === DOG) {
          names.push(i18n.localize("VARBORG.Creation.Item.dog"));
          extra.push(await this.#addDog());
          continue;
        }
        const data = equipmentItem(spec);
        toCreate.push(data);
        names.push(data.system.quantity > 1 ? `${data.name} ×${data.system.quantity}` : data.name);
      }
      const items = names.join(", ") || i18n.localize("VARBORG.Creation.Equipment.Nothing");
      const tableName = i18n.localize(`VARBORG.Creation.Equipment.Table.${table}`);
      lines.push(results[table] === null
        ? i18n.format("VARBORG.Creation.Equipment.FixedLine", { table: tableName, items })
        : i18n.format("VARBORG.Creation.Equipment.Line", { table: tableName, die: dice[table], roll: results[table], items }));
    }
    if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);
    await actor.setFlag(SYSTEM, EQUIPMENT_FLAG, true);
    lines.push(...extra, i18n.localize("VARBORG.Creation.Equipment.EquipHint"));
    await postCard(actor, i18n.format("VARBORG.Creation.Equipment.CardTitle", { name: actor.name }), lines, rolls);
  }
}

/** Open the helper for a character (one window per character). */
export function openCreationHelper(actor) {
  if (actor?.type !== "character" || !actor.isOwner || !creationHelperOn()) return null;
  const existing = foundry.applications.instances.get(`var-borg-creation-${actor.id}`);
  if (existing) return existing.render({ force: true });
  return new CreationHelper(actor).render({ force: true });
}
