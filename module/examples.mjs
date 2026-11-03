/**
 * Example importer. Reads the example documents saved in content/examples/
 * and creates them in the world, or updates them if they are already there.
 *
 * Each example file has a fixed `_id`, so pressing the button twice finds
 * the same document again instead of making a copy.
 */

const EXAMPLES_PATH = "systems/var-borg/content/examples";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/** Load one JSON file from the examples folder. */
async function loadJson(file) {
  const response = await fetch(`${EXAMPLES_PATH}/${file}`);
  if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
  return response.json();
}

/**
 * An example actor can carry its own items (a foe's attacks and passives).
 * Reset each one to its saved values, or add it back if it was deleted.
 * Items added in the world by hand are left alone.
 */
async function updateOwnedItems(actor, items) {
  const toCreate = [];
  for (const item of items) {
    const owned = actor.items.get(item._id);
    if (owned) await owned.update(item);
    else toCreate.push(item);
  }
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate, { keepId: true });
}

/**
 * Create or update every example listed in content/examples/index.json.
 * The index maps a document type (such as "Actor") to a list of files.
 * GM only.
 */
export async function importExamples() {
  if (!game.user.isGM) {
    ui.notifications.warn("VARBORG.Examples.GMOnly", { localize: true });
    return;
  }

  let created = 0;
  let updated = 0;
  try {
    const index = await loadJson("index.json");
    for (const [documentName, files] of Object.entries(index)) {
      const documentClass = CONFIG[documentName].documentClass;
      const collection = game.collections.get(documentName);
      for (const file of files) {
        const data = await loadJson(file);
        const existing = collection.get(data._id);
        if (existing) {
          const { items, ...rest } = data;
          await existing.update(rest);
          if (items) await updateOwnedItems(existing, items);
          updated++;
        } else {
          await documentClass.create(data, { keepId: true, keepEmbeddedIds: true });
          created++;
        }
      }
    }
  } catch (err) {
    console.error("VÅR BORG | Example import failed", err);
    ui.notifications.error("VARBORG.Examples.Failed", { localize: true });
    return;
  }

  ui.notifications.info(game.i18n.format("VARBORG.Examples.Done", { created, updated }));
}

/** The small window opened by the Import examples button in the game settings. */
export class ImportExamplesApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "var-borg-import-examples",
    classes: ["var-borg", "import-examples"],
    window: { title: "VARBORG.Examples.Title", icon: "fa-solid fa-file-import" },
    position: { width: 420 },
    actions: { import: ImportExamplesApp.#onImport }
  };

  static PARTS = {
    main: { template: "systems/var-borg/templates/apps/import-examples.hbs" }
  };

  /** Run the import, then close the window. */
  static async #onImport(event, button) {
    button.disabled = true;
    await importExamples();
    this.close();
  }
}
