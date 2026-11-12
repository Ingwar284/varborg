/**
 * Bringing compendium effects into a world (PLAN step 49i). The effects
 * and automation status of compendium items are filled in step by step
 * (Milestones 10 to 13), but items already copied into a world keep the
 * data they had when copied. When the system's effects content is newer
 * than the world's, the Dark Master's client copies the effects and status
 * onto every world item that came from a VÅR BORG compendium and has none
 * of its own: items in the Items tab, items on actors, and the items
 * inside foes, minions and vehicles copied from the compendiums. An item
 * with its own effects or status is never changed, so nothing set by hand
 * is lost. A choice copied this way is unmade: press Choose on the item.
 *
 * EFFECTS_CONTENT goes up by one in every step that adds effects to
 * content/, so worlds catch up the next time they load.
 */

const SYSTEM = "var-borg";
const SETTING = "effectsContent";

/** The effects content of this version of the system. */
export const EFFECTS_CONTENT = 32;

/** Register the world setting that remembers the effects content. */
export function registerEffectsRefresh() {
  game.settings.register(SYSTEM, SETTING, { scope: "world", config: false, type: Number, default: 0 });
}

/** On ready: one Dark Master brings older worlds' items up to date. */
export async function refreshWorldEffects() {
  if (game.users.activeGM !== game.user) return;
  if (game.settings.get(SYSTEM, SETTING) >= EFFECTS_CONTENT) return;
  const count = await refreshEffectsFromCompendiums();
  await game.settings.set(SYSTEM, SETTING, EFFECTS_CONTENT);
  if (count) {
    ui.notifications.info(game.i18n.format("VARBORG.Effects.Refreshed", { count }));
    console.log(`VÅR BORG | Item effects copied from the compendiums onto ${count} items`);
  }
}

/** A compendium document by uuid, loaded once per refresh. */
function cachedLoader() {
  const cache = new Map();
  return async uuid => {
    if (!uuid?.startsWith(`Compendium.${SYSTEM}.`)) return null;
    if (!cache.has(uuid)) cache.set(uuid, await fromUuid(uuid).catch(() => null));
    return cache.get(uuid);
  };
}

/** Whether an item has neither effects nor a status of its own. */
function isBlank(item) {
  return Array.isArray(item.system?.effects) && !item.system.effects.length && !item.system.automation;
}

/** The changes that copy a source item's effects and status, or null. */
function copyFrom(source) {
  const effects = source?.system?.effects ?? [];
  const automation = source?.system?.automation ?? "";
  if (!effects.length && !automation) return null;
  return { "system.effects": foundry.utils.deepClone(source.toObject().system.effects), "system.automation": automation };
}

/**
 * The changes for one world item: its source's effects and status when
 * it has none of its own, and its source's damage type when it has none
 * (step 50b3). null when nothing changes.
 */
function changesFor(item, source) {
  const changes = { ...(isBlank(item) ? copyFrom(source) : null) };
  const type = source?.system?.damageType;
  if (type && item.system?.damageType === "") changes["system.damageType"] = type;
  // What a power or spell gives its targets, and its buff (step 51c), when it has none.
  const outcomes = source?.system?.outcomeEffects ?? [];
  if (outcomes.length && Array.isArray(item.system?.outcomeEffects) && !item.system.outcomeEffects.length) {
    const stored = source.toObject().system;
    changes["system.outcomeEffects"] = foundry.utils.deepClone(stored.outcomeEffects);
    changes["system.buffEffects"] = foundry.utils.deepClone(stored.buffEffects ?? []);
  }
  // Its area of effect, when it has none (playtest feedback).
  const area = source?.system?.area;
  if (area?.shape && item.system?.area && !item.system.area.shape) changes["system.area"] = foundry.utils.deepClone(source.toObject().system.area);
  return Object.keys(changes).length ? changes : null;
}

/**
 * Copy effects onto every blank world item that came from a compendium.
 * @returns {Promise<number>}  How many items were changed.
 */
export async function refreshEffectsFromCompendiums() {
  const load = cachedLoader();
  let count = 0;

  // Items with their own compendium source.
  const updatesFor = async items => {
    const updates = [];
    for (const item of items) {
      const changes = changesFor(item, await load(item._stats?.compendiumSource));
      if (changes) updates.push({ _id: item.id, ...changes });
    }
    return updates;
  };
  const worldUpdates = await updatesFor(game.items);
  if (worldUpdates.length) await Item.updateDocuments(worldUpdates);
  count += worldUpdates.length;

  for (const actor of game.actors) {
    const updates = await updatesFor(actor.items);
    // Items inside an actor copied from a compendium (a foe's attacks,
    // gloom abilities and passives): matched by id, then by name and type.
    const source = await load(actor._stats?.compendiumSource);
    if (source?.items) {
      for (const item of actor.items) {
        if (updates.some(update => update._id === item.id)) continue;
        const match = source.items.get(item.id) ?? source.items.find(other => other.name === item.name && other.type === item.type);
        const changes = changesFor(item, match);
        if (changes) updates.push({ _id: item.id, ...changes });
      }
    }
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    count += updates.length;
  }
  return count;
}

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * The small window opened by the Copy compendium effects button in the
 * game settings: runs the copy now, for items added since the last one.
 */
export class RefreshEffectsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "var-borg-refresh-effects",
    classes: ["var-borg", "themed", "theme-light", "import-examples"],
    window: { title: "VARBORG.Effects.RefreshTitle", icon: "fa-solid fa-wand-magic-sparkles" },
    position: { width: 420 },
    actions: { refresh: RefreshEffectsApp.#onRefresh }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/refresh-effects.hbs" }
  };

  /** Run the copy, say how many items changed, then close the window. */
  static async #onRefresh(event, button) {
    if (!game.user.isGM) return;
    button.disabled = true;
    const count = await refreshEffectsFromCompendiums();
    ui.notifications.info(game.i18n.format("VARBORG.Effects.RefreshDone", { count }));
    this.close();
  }
}
