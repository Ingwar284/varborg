/**
 * How a new actor's tokens look on the map. Not a game rule, but table
 * set-up chosen by the designer. Plain JavaScript, no Foundry, so the
 * example files can be tested against it.
 *
 * - Every token shows its name when anyone hovers over it.
 * - Characters are friendly and linked to their actor (damage on the token
 *   reaches the sheet). Everyone always sees their HP and Wounds bars.
 * - Foes are hostile and not linked, so each copy has its own HP. Everyone
 *   sees the HP bar on hover.
 * - Minions are friendly and linked to their actor, like characters, with
 *   the HP bar always shown (step 42).
 * - Vehicles are neutral and linked to their actor, with the HP bar shown
 *   on hover (step 44).
 * - Chests are neutral and not linked, so each chest placed on a map holds
 *   its own items. They have no bars.
 */

/** Foundry's CONST.TOKEN_DISPLAY_MODES (who sees a name or bar). */
export const DISPLAY = { NONE: 0, CONTROL: 10, OWNER_HOVER: 20, HOVER: 30, OWNER: 40, ALWAYS: 50 };

/** Foundry's CONST.TOKEN_DISPOSITIONS. */
export const DISPOSITION = { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 };

/** The prototype token settings for each actor type. */
export const TOKEN_DEFAULTS = {
  character: {
    actorLink: true,
    disposition: DISPOSITION.FRIENDLY,
    displayName: DISPLAY.HOVER,
    displayBars: DISPLAY.ALWAYS,
    bar1: { attribute: "hp" },
    bar2: { attribute: "wounds" }
  },
  foe: {
    actorLink: false,
    disposition: DISPOSITION.HOSTILE,
    displayName: DISPLAY.HOVER,
    displayBars: DISPLAY.HOVER,
    bar1: { attribute: "hp" },
    bar2: { attribute: null }
  },
  minion: {
    actorLink: true,
    disposition: DISPOSITION.FRIENDLY,
    displayName: DISPLAY.HOVER,
    displayBars: DISPLAY.ALWAYS,
    bar1: { attribute: "hp" },
    bar2: { attribute: null }
  },
  vehicle: {
    actorLink: true,
    disposition: DISPOSITION.NEUTRAL,
    displayName: DISPLAY.HOVER,
    displayBars: DISPLAY.HOVER,
    bar1: { attribute: "hp" },
    bar2: { attribute: null }
  },
  chest: {
    actorLink: false,
    disposition: DISPOSITION.NEUTRAL,
    displayName: DISPLAY.HOVER,
    displayBars: DISPLAY.NONE,
    bar1: { attribute: null },
    bar2: { attribute: null }
  }
};

/**
 * The defaults that new actor data does not already set, as
 * "prototypeToken.…" paths for Foundry's updateSource. An actor copied with
 * its own token settings keeps them.
 * @param {string} type  The actor type, such as "character".
 * @param {object} data  The data the actor is created with.
 * @returns {object}  Such as { "prototypeToken.displayName": 30 }.
 */
export function missingTokenDefaults(type, data = {}) {
  const missing = {};
  const walk = (defaults, given, path) => {
    for (const [key, value] of Object.entries(defaults)) {
      const here = given?.[key];
      if (value !== null && typeof value === "object") walk(value, here, `${path}.${key}`);
      else if (here === undefined) missing[`${path}.${key}`] = value;
    }
  };
  walk(TOKEN_DEFAULTS[type] ?? {}, data.prototypeToken, "prototypeToken");
  return missing;
}
