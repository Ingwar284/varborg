/**
 * The local link check (playtest feedback). A browser refuses to load a
 * file:/// address from a hosted game ("Security Error: Content at … may
 * not load or link to file:///"). Such an address is usually an image or
 * sound picked from someone's own computer and saved in the world: a
 * scene background, a tile, an actor portrait, a journal image…
 *
 * The Dark Master's "Check for local file links" button in Configure
 * Settings looks through the world's documents (and everything inside
 * them: tokens, tiles, items, effects, pages) and whispers the Dark Master
 * a list of each place that holds one, with a link to open it. Nothing is
 * changed: the Dark Master replaces each file with one uploaded to the game.
 */

const SYSTEM = "var-borg";

/** The world collections to look through. */
const COLLECTIONS = ["scenes", "actors", "items", "journal", "tables", "playlists", "macros", "cards", "users"];

/** Whether a text holds a local file address. */
export function hasLocalLink(text) {
  return typeof text === "string" && /file:\/\//i.test(text);
}

/**
 * Every place in a plain object that holds a local file address, as dotted
 * paths ("tokens.0.texture.src").
 * @param {object} data
 * @returns {string[]}
 */
export function localLinkPaths(data) {
  const found = [];
  const walk = (value, path) => {
    if (hasLocalLink(value)) found.push(path);
    else if (Array.isArray(value)) value.forEach((entry, index) => walk(entry, path ? `${path}.${index}` : String(index)));
    else if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) walk(entry, path ? `${path}.${key}` : key);
    }
  };
  walk(data, "");
  return found;
}

/** Register the Dark Master's button. Called once at init. */
export function registerLocalLinks() {
  /** The menu "window": it runs the check and opens nothing. */
  class LocalLinksCheck extends foundry.applications.api.ApplicationV2 {
    /** @override */
    async render() {
      await checkLocalLinks();
      return this;
    }
  }
  game.settings.registerMenu(SYSTEM, "localLinks", {
    name: "VARBORG.LocalLinks.MenuName",
    label: "VARBORG.LocalLinks.Label",
    hint: "VARBORG.LocalLinks.Hint",
    icon: "fa-solid fa-link-slash",
    type: LocalLinksCheck,
    restricted: true
  });
}

/**
 * Look through the world and whisper the Dark Master what was found.
 * @returns {Promise<number>} How many documents hold a local link.
 */
export async function checkLocalLinks() {
  if (!game.user.isGM) return 0;
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const rows = [];
  for (const name of COLLECTIONS) {
    for (const doc of game[name] ?? []) {
      const paths = localLinkPaths(doc.toObject());
      if (!paths.length) continue;
      const kind = i18n.localize(doc.constructor.metadata?.label ?? doc.documentName);
      rows.push(`<li><a class="content-link" draggable="true" data-uuid="${doc.uuid}" data-link>`
        + `<i class="fa-solid fa-link"></i> ${esc(doc.name ?? doc.id)}</a> (${esc(kind)}): `
        + `<code>${paths.slice(0, 5).map(esc).join(", ")}${paths.length > 5 ? ", …" : ""}</code></li>`);
    }
  }
  const content = rows.length
    ? `<div class="var-borg-card"><h3>${esc(i18n.localize("VARBORG.LocalLinks.Title"))}</h3>`
      + `<p>${esc(i18n.format("VARBORG.LocalLinks.Found", { count: rows.length }))}</p><ul>${rows.join("")}</ul></div>`
    : `<div class="var-borg-card"><h3>${esc(i18n.localize("VARBORG.LocalLinks.Title"))}</h3><p>${esc(i18n.localize("VARBORG.LocalLinks.None"))}</p></div>`;
  await ChatMessage.create({ content, whisper: [game.user.id] });
  return rows.length;
}
