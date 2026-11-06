/**
 * Choices in Foundry (PLAN step 49h): an item with a choice effect, such as
 * Weapon specialist ("choose a weapon"), asks for its choice when it is
 * dropped on a character, and stores it on the effect. The item's other
 * effects can then use it ("the chosen weapon", "foes of the chosen
 * category"). A feat or spell choice adds the picked compendium item to the
 * character (Ancient One, Magically Attuned). The Choose button in the
 * item's Effects section asks again (Favoured prey changes in Downtime).
 *
 * Designer's choices: a "weapon group" is one of the character's own
 * weapons; a feat or spell is picked and added.
 * The maths lives in module/rules/item-effects.mjs.
 */

import { choiceCandidates, CHOOSABLE_SPELL_LISTS } from "./rules/item-effects.mjs";
import { FOE_CATEGORIES } from "./rules/foe.mjs";
import { DAMAGE_TYPES, ELEMENTS } from "./rules/equipment.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";

/** Ask for unmade choices when an item with them lands on a character. */
export function registerChoices() {
  Hooks.on("createItem", (item, options, userId) => {
    if (userId !== game.user.id || item.actor?.type !== "character") return;
    giveGifts(item).then(() => askOpenChoices(item));
  });
  // A buff's gifts go with it (a Morph's Blade-arm, step 51d2).
  Hooks.on("deleteItem", (item, options, userId) => {
    if (userId !== game.user.id || !item.getFlag(SYSTEM, "buff") || !item.actor) return;
    const given = item.actor.items.filter(other => other.getFlag(SYSTEM, "grantedBy") === item.id).map(other => other.id);
    if (given.length) item.actor.deleteEmbeddedDocuments("Item", given);
  });
}

/**
 * The gifts of an item that just landed on a character (step 50b4): each
 * compendium item it names is added, unless the character already has it.
 */
async function giveGifts(item) {
  const actor = item.actor;
  const names = [];
  for (const effect of item.system.effects ?? []) {
    if (effect.kind !== "gift" || !effect.gift) continue;
    if (actor.items.some(other => other._stats?.compendiumSource === effect.gift)) continue;
    const source = await fromUuid(effect.gift);
    if (!source) {
      ui.notifications.warn(game.i18n.format("VARBORG.Effects.GiftMissing", { item: item.name }));
      continue;
    }
    const data = source.toObject();
    data._stats = { ...data._stats, compendiumSource: effect.gift };
    // Remember the giver, so the gift goes when a buff that gave it ends (Blade-Arm, step 51d2).
    data.flags = { ...data.flags, [SYSTEM]: { ...(data.flags?.[SYSTEM] ?? {}), grantedBy: item.id } };
    await actor.createEmbeddedDocuments("Item", [data]);
    names.push(source.name);
  }
  if (!names.length) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${foundry.utils.escapeHTML(game.i18n.format("VARBORG.Effects.GiftGiven", { name: actor.name, item: item.name, gifts: names.join(", ") }))}</p></div>`
  });
}

/** Every choice effect of the item that has not been made yet, one after another. */
async function askOpenChoices(item) {
  const effects = item.system.effects ?? [];
  for (let index = 0; index < effects.length; index++) {
    if (effects[index].kind === "choice" && !effects[index].chosen) await makeChoice(item, index);
  }
}

/** The compendium items a feat or spell choice may pick from. */
async function compendiumEntries(choose) {
  const packs = choose === "spell" ? ["spells"] : ["feats", "powers"];
  const docs = [];
  for (const name of packs) {
    const pack = game.packs.get(`${SYSTEM}.${name}`);
    if (pack) docs.push(...await pack.getDocuments());
  }
  return docs;
}

/**
 * The options for one choice: [{ value, label, uuid? }], or null when it is
 * typed (text).
 */
async function choiceOptions(actor, effect) {
  const i18n = game.i18n;
  switch (effect.choose) {
    case "weapon":
      return actor.itemTypes.weapon.map(weapon => ({ value: weapon.id, label: weapon.name }));
    case "category":
      return FOE_CATEGORIES.filter(Boolean).map(key => ({ value: key, label: i18n.localize(`VARBORG.Foe.Category.${key}`) }));
    case "damageType":
      return (effect.from === "element" ? ELEMENTS : DAMAGE_TYPES).map(key => ({ value: key, label: i18n.localize(`VARBORG.DamageType.${key}`) }));
    case "spellList":
      // Autodidactism (step 51a2).
      return CHOOSABLE_SPELL_LISTS.map(key => ({ value: key, label: i18n.localize(`VARBORG.Class.SpellList.${key}`) }));
    case "feat":
    case "spell": {
      if (effect.from === "known") return actor.itemTypes.spell.map(spell => ({ value: spell.id, label: spell.name }));
      const owner = { ancestry: actor.itemTypes.ancestry?.[0]?.name ?? "", className: actor.itemTypes.class?.[0]?.name ?? "" };
      const docs = await compendiumEntries(effect.choose);
      return choiceCandidates(docs, effect, owner).map(doc => ({ value: doc.uuid, label: doc.name, uuid: doc.uuid }));
    }
    default:
      return null;
  }
}

/**
 * Ask for one choice of an item on a character and store it. A feat or
 * spell from the compendiums is added to the character as well.
 * @param {Item} item
 * @param {number} index  The choice effect's place in the item's effects.
 */
export async function makeChoice(item, index) {
  const i18n = game.i18n;
  const actor = item.actor;
  const effect = item.system.effects?.[index];
  if (!actor || effect?.kind !== "choice") return;
  const esc = foundry.utils.escapeHTML;
  const options = await choiceOptions(actor, effect);
  if (options && !options.length) {
    ui.notifications.warn(i18n.format(`VARBORG.Effects.Choice.None.${effect.choose}`, { name: actor.name, item: item.name }));
    return;
  }

  let picked;
  if (effect.from === "random" && options) {
    picked = options[Math.floor(Math.random() * options.length)];
  } else {
    const field = options
      ? `<select name="chosen">${options.map(option => `<option value="${esc(option.value)}"${option.value === effect.chosen ? " selected" : ""}>${esc(option.label)}</option>`).join("")}</select>`
      : `<input type="text" name="chosen" value="${esc(effect.chosen)}">`;
    const data = await DialogV2.input({
      window: { title: i18n.format("VARBORG.Effects.Choice.Title", { item: item.name }) },
      content: `<p>${esc(i18n.localize(`VARBORG.Effects.Choice.Ask.${effect.choose}`))}</p>`
        + (effect.note ? `<p class="hint">${esc(effect.note)}</p>` : "")
        + `<div class="form-group">${field}</div>`,
      ok: { label: "VARBORG.Effects.Choice.Ok", icon: "fa-solid fa-check" },
      rejectClose: false
    });
    if (!data) return;
    const value = String(data.chosen ?? "").trim();
    if (!value) return;
    picked = options ? options.find(option => option.value === value) : { value, label: value };
  }
  if (!picked) return;

  // A feat or spell from the compendiums joins the character.
  let chosen = picked.value;
  if (picked.uuid) {
    const doc = await fromUuid(picked.uuid);
    if (doc) {
      const data = doc.toObject();
      // Remember the compendium it came from, so later effects reach it (step 49i).
      if (doc.compendium) data._stats = { ...data._stats, compendiumSource: doc.uuid };
      const [created] = await actor.createEmbeddedDocuments("Item", [{ ...data, flags: { [SYSTEM]: { grantedBy: item.id } } }]);
      chosen = created?.id ?? chosen;
    }
  }
  const effects = foundry.utils.deepClone(item.toObject().system.effects);
  effects[index].chosen = chosen;
  effects[index].chosenName = picked.label;
  await item.update({ "system.effects": effects });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card"><p>${esc(i18n.format(picked.uuid ? "VARBORG.Effects.Choice.Added" : "VARBORG.Effects.Choice.Made", { name: actor.name, item: item.name, chosen: picked.label }))}</p></div>`
  });
}
