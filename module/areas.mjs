/**
 * Areas of effect on the map (rules section 3, Areas of Effect; playtest
 * feedback). Foundry 14's Regions give the shapes; the rules and the text
 * reader are in module/rules/areas.mjs.
 *
 * When a spell or power with an area is used:
 * 1. The area is aimed. An emanation sits around the user at once. A burst
 *    follows the mouse (no further than its range from the user). A cone or
 *    line starts at the user and turns toward the mouse. A wall follows the
 *    mouse and turns with the mouse wheel. Left-click places it; right-click
 *    or Escape cancels the spell or power.
 * 2. Every creature the area covers at least half of, and that it affects
 *    (foes only, allies only, the user only when included), becomes a
 *    target. The usual card follows: one roll for all, one button each.
 * 3. An instant area leaves nothing on the map. A Sustained one stays as a
 *    Region (an emanation moves with its user) until the power ends; a
 *    lasting one (module/lasting.mjs) stays for its rounds or encounter,
 *    or until the Dark Master removes it.
 * Gear and thrown weapons have areas too (GAPS 314): a square is placed
 * like a burst, on whole grid squares; a hidden area is seen only by the
 * Dark Master.
 *
 * A user with no token on the scene targets by hand, as before.
 */

import { CONE_ANGLE, POINT_SHAPES, isCaught, areaAffects, hasOptionAreas, areaForOption } from "./rules/areas.mjs";
import { tokenDistance } from "./rules/movement.mjs";
import { areaStays, endsAtRound, effectsForOption, roundsAreDice } from "./rules/lasting.mjs";
import { postSmallCard } from "./chat-card.mjs";
import { buffEffectsFor } from "./rules/outcomes.mjs";
import { LASTING_TYPE, ENDS_FLAG } from "./lasting.mjs";
import { AREA_COLOUR } from "./canvas/region.mjs";

const SYSTEM = "var-borg";
/** The flag on a Region that a Sustained power left: "actorUuid|itemId". */
const SOURCE_FLAG = "areaSource";
/** The query a player's client sends the Dark Master to keep an area. */
const KEEP_QUERY = "var-borg.keepArea";

/** The user's token on the scene being viewed, or null. */
function userToken(actor) {
  return actor.getActiveTokens().find(token => token.scene === canvas.scene) ?? null;
}

/** Feet to canvas pixels. */
function pixels(feet) {
  return feet * canvas.dimensions.distancePixels;
}

/**
 * The Region data for an area, before it is placed.
 * @param {object} area   system.area
 * @param {Token} token   The user's token.
 * @param {string} name   The spell's or power's name.
 */
function regionData(area, token, name) {
  const doc = token.document;
  const half = Math.max(doc.width, doc.height) * canvas.grid.size / 2;
  const centre = token.center;
  let shape;
  switch (area.shape) {
    case "emanation":
      shape = {
        type: "emanation",
        base: { type: "token", x: doc.x, y: doc.y, width: doc.width, height: doc.height, shape: doc.shape },
        radius: pixels(area.size),
        gridBased: true
      };
      break;
    case "burst":
      shape = { type: "circle", x: centre.x, y: centre.y, radius: pixels(area.size), gridBased: true };
      break;
    // A cone and a line start at the edge of the user's tile: measured from
    // the centre, they reach half a tile further.
    case "cone":
      shape = { type: "cone", x: centre.x, y: centre.y, radius: pixels(area.size) + half, angle: CONE_ANGLE, rotation: 0, curvature: "round", gridBased: false };
      break;
    case "line":
      shape = { type: "line", x: centre.x, y: centre.y, length: pixels(area.size) + half, width: pixels(area.width), rotation: 0, gridBased: false };
      break;
    case "wall":
      shape = { type: "rectangle", x: centre.x, y: centre.y, width: pixels(area.size), height: pixels(area.width), rotation: 0, gridBased: false };
      break;
    // A square at a point (Caltrops, the Fire pot, GAPS 314): placed by its centre.
    case "square":
      shape = { type: "rectangle", x: centre.x, y: centre.y, width: pixels(area.size), height: pixels(area.size), anchorX: 0.5, anchorY: 0.5, rotation: 0, gridBased: false };
      break;
    default:
      return null;
  }
  return {
    name,
    shapes: [shape],
    color: AREA_COLOUR,
    levels: [doc.level ?? canvas.level?.id].filter(Boolean),
    highlightMode: "coverage",
    displayMeasurements: true,
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    // A wall blocks movement (rules: Wall).
    restriction: { enabled: area.shape === "wall", type: "move" },
    ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
  };
}

/**
 * Aim a spell's or power's area and make every creature it catches a
 * target.
 * An item whose options have their own areas (Songs of power) is aimed
 * only once the option is chosen: before the dialog it does nothing, and
 * after it the chosen option's area is aimed.
 * @param {Actor} actor
 * @param {Item} item  A spell, scroll or power with system.area.
 * @param {object} [chosen]
 * @param {string|null} [chosen.option]  The option chosen in the dialog; undefined before it.
 * @param {object} [chosen.area]  An area to aim instead of the item's own (a toss's, GAPS 314).
 * @returns {Promise<{go: boolean, region: object|null}>}
 *   go: false when the player cancelled; region: the placed Region's data,
 *   to keep on the map if the power is Sustained.
 */
export async function aimArea(actor, item, { option, area: given } = {}) {
  const itemArea = item.system.area;
  const byOption = !given && hasOptionAreas(itemArea);
  // Before the dialog, an item with option areas waits for the option.
  if (byOption && option === undefined) return { go: true, region: null };
  // After it, only an item with option areas is aimed (the others were aimed already).
  if (!byOption && !given && option !== undefined) return { go: true, region: null };
  const area = given ?? (byOption ? areaForOption(itemArea, option) : itemArea);
  if (!area?.shape || !canvas.ready) return { go: true, region: null };
  const i18n = game.i18n;
  const token = userToken(actor);
  if (!token) {
    ui.notifications.info(i18n.format("VARBORG.Area.NoToken", { name: actor.name }));
    return { go: true, region: null };
  }
  const data = regionData(area, token, item.name);
  if (!data) return { go: true, region: null };

  let doc;
  if (area.shape === "emanation") {
    doc = new CONFIG.Region.documentClass(data, { parent: canvas.scene });
  } else {
    ui.notifications.info(i18n.format("VARBORG.Area.Aim", { name: item.name }));
    doc = await canvas.regions.placeRegion(data, {
      create: false,
      // A wall turns with the mouse wheel; a cone or line turns toward the mouse; a square fills whole squares.
      allowRotation: area.shape === "wall",
      onMove: ["cone", "line"].includes(area.shape) ? pointFrom(token) : area.shape === "square" ? onSquares(area.size) : undefined,
      preConfirm: POINT_SHAPES.includes(area.shape) && area.range > 0 ? withinRange(token, area.range) : undefined
    });
    // Placing an area switches to the Region layer: go back to the tokens.
    canvas.tokens.activate();
    if (!doc) return { go: false, region: null };
  }

  const caught = caughtTokens(doc, token, area);
  canvas.tokens.setTargets(caught.map(other => other.id), { mode: "replace" });
  if (!caught.length) ui.notifications.info(i18n.localize("VARBORG.Area.NoneCaught"));
  return { go: true, region: { ...doc.toObject(), _tokenId: token.id, _area: area, _option: option ?? "" } };
}

/**
 * A tossed area where it lands (GAPS 314): a burst or square at a point,
 * or at the thrower's feet. Every creature it catches becomes a target.
 * @param {Actor} actor
 * @param {object} area           The area, with the size it landed at.
 * @param {string} name
 * @param {{x: number, y: number}|null} point  Where it was aimed; null for the thrower's feet.
 * @returns {object|null}  The Region's data, as aimArea gives it (for keepArea), with `caught`: the tokens caught.
 */
export function landArea(actor, area, name, point) {
  if (!canvas.ready) return null;
  const token = userToken(actor);
  if (!token) return null;
  const data = regionData(area, token, name);
  if (!data) return null;
  const at = point ?? token.center;
  data.shapes[0] = { ...data.shapes[0], x: at.x, y: at.y };
  const doc = new CONFIG.Region.documentClass(data, { parent: canvas.scene });
  // A Ruin at the thrower's feet catches the thrower too.
  const caughtArea = point ? area : { ...area, includesUser: true };
  const caught = caughtTokens(doc, token, caughtArea);
  canvas.tokens.setTargets(caught.map(other => other.id), { mode: "replace" });
  return { ...doc.toObject(), _tokenId: token.id, _area: caughtArea, _option: "", caught };
}

/** The point a placed area was aimed at: its shape's centre. */
export function aimedPoint(region) {
  const shape = region?.shapes?.[0];
  return shape ? { x: shape.x, y: shape.y } : null;
}

/** onMove for a cone or line: it starts at the user and points at the mouse. */
function pointFrom(token) {
  return ({ shape, position }) => {
    const { x, y } = token.center;
    const rotation = Math.toDegrees(Math.atan2(position.y - y, position.x - x));
    shape.updateSource({ x, y, rotation });
    return false;
  };
}

/**
 * onMove for a square: it covers whole grid squares. An odd number of
 * squares across is centred on a square's centre, an even number on a
 * corner. On a gridless scene it follows the mouse.
 */
function onSquares(size) {
  return ({ shape, position, snap }) => {
    if (!snap || canvas.grid.isGridless) return true;
    const across = Math.max(1, Math.round(size / canvas.grid.distance));
    const M = CONST.GRID_SNAPPING_MODES;
    const { x, y } = canvas.grid.getSnappedPoint(position, { mode: across % 2 ? M.CENTER : M.VERTEX });
    shape.updateSource({ x, y });
    return false;
  };
}

/** preConfirm for a burst or square: its point no further than the range from the user. */
function withinRange(token, range) {
  return ({ shape }) => {
    const feet = tokenDistance({
      centreDistance: canvas.grid.measurePath([token.center, { x: shape.x, y: shape.y }]).distance,
      sizeA: Math.max(token.document.width, token.document.height),
      gridDistance: canvas.grid.distance
    });
    if (feet <= range) return true;
    ui.notifications.warn(game.i18n.format("VARBORG.Area.TooFar", { feet, range }));
    return false;
  };
}

/**
 * The tokens an area catches: at least half of their squares inside it,
 * and of a kind it affects. Hidden tokens only count for the Dark Master.
 * @param {RegionDocument} region
 * @param {Token} userToken
 * @param {object} area  system.area
 * @returns {TokenDocument[]}
 */
export function caughtTokens(region, user, area) {
  const size = canvas.grid.size;
  const side = user.document.disposition;
  const caught = [];
  for (const doc of canvas.scene.tokens) {
    if (!doc.actor || (doc.hidden && !game.user.isGM)) continue;
    const isUser = doc.id === user.document.id;
    const isAlly = !isUser && doc.disposition === side;
    if (!areaAffects(area, { isUser, isAlly })) continue;
    let total = 0;
    let covered = 0;
    for (let i = 0; i < Math.max(1, Math.round(doc.width)); i++) {
      for (let j = 0; j < Math.max(1, Math.round(doc.height)); j++) {
        total++;
        const point = { x: doc.x + (i + 0.5) * size, y: doc.y + (j + 0.5) * size, elevation: doc.elevation };
        if (region.testPoint(point)) covered++;
      }
    }
    if (isCaught(covered, total)) caught.push(doc);
  }
  return caught;
}

/**
 * After the card: the area stays on the map while the power is Sustained,
 * or for its rounds or encounter on a Triumph or Success (lingering
 * areas, GAPS 284). An emanation is attached to its user's token, so it
 * moves with them. A lasting area gets its difficult terrain and effects.
 * @param {Actor} actor
 * @param {Item} item
 * @param {object|null} region  From aimArea.
 * @param {string} tier         The card's result.
 */
export async function keepArea(actor, item, region, tier) {
  if (!region) return;
  // The area that was aimed: the chosen option's, or the item's.
  const area = region._area ?? item.system.area ?? {};
  const lasting = area.lasting ?? {};
  const sustaining = Boolean(item.system.sustaining);
  if (!areaStays(lasting, sustaining, tier)) return;
  // A Sustained power's area is kept even with nothing lasting, so it can be seen and moves with an emanation.
  const { _id, _tokenId, _area, _option = "", ...data } = region;
  const combat = game.combat?.started ? game.combat : null;
  const flags = {};
  if (sustaining) flags[SOURCE_FLAG] = `${actor.uuid}|${item.id}`;
  else if (lasting.duration === "rounds" || lasting.duration === "encounter") {
    // Rounds as dice ("for d6 rounds", GAPS 314) are rolled now, and said in chat.
    let rolled;
    if (lasting.duration === "rounds" && roundsAreDice(lasting.rounds)) {
      const roll = await new Roll(String(lasting.rounds)).evaluate().catch(() => null);
      if (roll) {
        rolled = Math.max(1, roll.total);
        await postSmallCard(actor, [game.i18n.format("VARBORG.Area.Lasting.RoundsRolled", { area: item.name, rounds: rolled, formula: lasting.rounds })], { rolls: [roll], sound: CONFIG.sounds.dice });
      }
    }
    flags[ENDS_FLAG] = { combatId: combat?.id ?? "", endsAtRound: endsAtRound(lasting, combat?.round ?? 1, rolled), encounter: lasting.duration === "encounter" };
  }
  // "Until removed" (Caltrops) has no end: the Dark Master deletes the Region.
  data.flags = { ...(data.flags ?? {}), [SYSTEM]: flags };
  // Hidden from the players (a Bear trap, GAPS 314).
  if (lasting.hidden) data.visibility = CONST.REGION_VISIBILITY.GAMEMASTER;
  if (area.shape === "emanation" && _tokenId) {
    data.attachment = { token: _tokenId };
    data.hidden = Boolean(canvas.scene.tokens.get(_tokenId)?.hidden);
  }
  const behaviors = [];
  // Difficult terrain: walking, crawling, climbing and swimming cost double;
  // flying is left for the Dark Master to decide on the Region (GAPS 278).
  if (lasting.difficult) {
    behaviors.push({ type: "modifyMovementCost", name: game.i18n.localize("VARBORG.Area.Lasting.Difficult"),
      system: { difficulties: { walk: 2, crawl: 2, climb: 2, swim: 2 } } });
  }
  // Only the chosen option's effects (Songs of power: Allegro), and its buff.
  const effects = effectsForOption(foundry.utils.deepClone(item.toObject().system.area?.lasting?.effects ?? []), _option);
  if (effects.length) {
    behaviors.push({ type: LASTING_TYPE, name: item.name, system: {
      effects,
      userUuid: actor.uuid, userTokenId: _tokenId ?? "", name: item.name, damageType: item.system.damageType ?? "",
      option: _option,
      includesUser: Boolean(area.includesUser),
      // Gone after its first effect (a Bear trap, sprung).
      once: Boolean(lasting.once),
      // What the buff does, from the chosen option's note ("allies in the area defend with -2 DR").
      buffNote: (item.system.outcomeEffects ?? []).find(entry => entry.note && (entry.option ?? "") === _option)?.note ?? "",
      buffEffects: buffEffectsFor(foundry.utils.deepClone(item.toObject().system.buffEffects ?? []), _option)
    } });
  }
  data.behaviors = behaviors;
  try {
    await keepRegion(canvas.scene.id, data);
  } catch (error) {
    console.error("VÅR BORG | Could not keep the area on the map", error);
  }
}

/**
 * Foundry lets only a Dark Master create a Region with behaviours, so a
 * player's client asks the active Dark Master to create it (the query
 * registered in registerAreaQuery). A Dark Master creates it directly.
 * @param {string} sceneId
 * @param {object} data  Plain Region data, behaviours included.
 * @returns {Promise<string|null>} The new Region's uuid, or null when no Dark Master could make it.
 */
async function keepRegion(sceneId, data) {
  if (game.user.isGM) return createKeptRegion(sceneId, data);
  const gm = game.users.activeGM;
  if (!gm) {
    ui.notifications.warn("VARBORG.Area.NoGM", { localize: true });
    return null;
  }
  try {
    return await gm.query(KEEP_QUERY, { sceneId, data }, { timeout: 30000 });
  } catch (error) {
    console.error("VÅR BORG | Area query failed", error);
    ui.notifications.warn("VARBORG.Area.KeepFailed", { localize: true });
    return null;
  }
}

/**
 * Create a kept area's Region. Runs on the Dark Master's client.
 * @param {string} sceneId
 * @param {object} data  Plain Region data.
 * @param {User} [user]  Who asked, when a player's request came through the query.
 * @returns {Promise<string>} The new Region's uuid.
 */
async function createKeptRegion(sceneId, data, user) {
  const scene = game.scenes.get(sceneId);
  if (!scene) throw new Error(`VÅR BORG | No scene ${sceneId} for a kept area`);
  if (!data || typeof data !== "object" || !Array.isArray(data.shapes)) throw new Error("VÅR BORG | Not Region data");
  // keepArea only ever puts these two behaviour types on a kept area.
  const allowed = new Set(["modifyMovementCost", LASTING_TYPE]);
  if ((data.behaviors ?? []).some(behaviour => !allowed.has(behaviour?.type))) throw new Error("VÅR BORG | Behaviour not allowed");
  // A player's area belongs to that player only.
  const created = user && !user.isGM ? { ...data, ownership: { [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } } : data;
  const [region] = await scene.createEmbeddedDocuments("Region", [created]);
  return region.uuid;
}

/** Register the query a player's client uses to keep an area. Called once at init. */
export function registerAreaQuery() {
  CONFIG.queries[KEEP_QUERY] = (request, { user }) => createKeptRegion(request?.sceneId, request?.data, user);
}

/**
 * A Sustained power ended: its areas leave the map, on every scene.
 * @param {string} source  "actorUuid|itemId"
 */
export async function removeSustainedAreas(source) {
  for (const scene of game.scenes) {
    const ids = scene.regions.filter(region => region.getFlag(SYSTEM, SOURCE_FLAG) === source && region.canUserModify(game.user, "delete"))
      .map(region => region.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
}

/**
 * A power's kept area must not outlive it: when the power is deleted (a
 * character rolled anew, an item removed by hand) or its actor is, its
 * areas leave the map too. Done by the active Dark Master's client.
 * Called once at init.
 */
export function registerAreaCleanup() {
  const runner = () => game.users.activeGM?.isSelf ?? false;
  Hooks.on("deleteItem", item => {
    if (runner() && item.parent) removeSustainedAreas(`${item.parent.uuid}|${item.id}`);
  });
  Hooks.on("deleteActor", actor => {
    if (runner()) removeAreasOfActor(actor.uuid);
  });
}

/** Remove every kept area an actor's powers left, on every scene. */
async function removeAreasOfActor(actorUuid) {
  for (const scene of game.scenes) {
    const ids = scene.regions.filter(region => String(region.getFlag(SYSTEM, SOURCE_FLAG) ?? "").startsWith(`${actorUuid}|`))
      .map(region => region.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
}
