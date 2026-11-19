/**
 * Prayer of the faithful in Foundry (GAPS 332). A power with "Prayer of
 * the faithful" ticked opens a choice instead of a power test:
 *
 * - Cast a Divine spell of 3 ember or less: the Priest's own Divine spells
 *   and those of the Spells compendium are offered. The spell is cast as
 *   usual (module/dice/spell.mjs, its own DR), but the prayer's 1 ember
 *   and 2 actions pay for it. A spell the Priest does not know is added to
 *   their sheet for the casting, marked as a prayer copy, and removed again
 *   once it is not being sustained.
 * - Demand the impossible: a Sanity test at the DR the Dark Master sets
 *   (16, 18 or 20; never below 16), with a line saying what came of it.
 *   A Ruin puts the Priest at Death's Door.
 *
 * The rules live in module/rules/prayer.mjs.
 */

import { prayerSpellChoices, DEMAND_DRS, demandDr, demandOutcome } from "./rules/prayer.mjs";
import { checkPowerUse, payPowerEmber, spendPowerActions, emberNote } from "./dice/power.mjs";
import { castSpell } from "./dice/spell.mjs";
import { rollAbilityTest } from "./dice/ability-test.mjs";
import { enterDeathsDoor } from "./deaths-door.mjs";
import { turnState } from "./combat.mjs";
import { VB_DIALOG_CLASSES } from "./dialog.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";
const COPY_FLAG = "prayerCopy";
const SPELLS_PACK = "var-borg.spells";

/** Set up the clean-up of prayer copies. Called at init. */
export function registerPrayer() {
  // A prayer copy that stops being sustained is removed (by the client that ended it).
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if (userId !== game.user.id || !isPrayerCopy(item)) return;
    if (changes.system?.sustaining === false) item.delete();
  });
}

/** A spell added only for one casting through the prayer. */
export function isPrayerCopy(item) {
  return Boolean(item?.getFlag?.(SYSTEM, COPY_FLAG));
}

/**
 * The Use button on Prayer of the faithful.
 * @param {Actor} actor  The Priest.
 * @param {Item} power   The prayer.
 */
export async function usePrayer(actor, power) {
  const i18n = game.i18n;
  const turn = turnState(actor);
  const use = checkPowerUse(actor, power, turn);
  if (!use) return;

  const spells = await spellChoices(actor);
  const escape = foundry.utils.escapeHTML;
  const spellOptions = spells.map(spell =>
    `<option value="${escape(spell.key)}">${escape(spell.name)} (🟒${spell.cost}${spell.known ? "" : `, ${escape(i18n.localize("VARBORG.Prayer.NotKnown"))}`})</option>`).join("");
  const drOptions = DEMAND_DRS.map(dr =>
    `<option value="${dr}">${escape(i18n.format("VARBORG.Prayer.DemandDr", { dr, name: i18n.localize(`VARBORG.Prayer.DemandSize.${dr}`) }))}</option>`).join("");
  const content = `
    <p class="hint automatic">${escape(i18n.format("VARBORG.Power.UseNote", { cost: use.ember, actions: use.actions }))}</p>
    <div class="form-group">
      <label><input type="radio" name="mode" value="spell" ${spells.length ? "checked" : "disabled"}> ${escape(i18n.localize("VARBORG.Prayer.CastLabel"))}</label>
      <div class="form-fields"><select name="spell" ${spells.length ? "" : "disabled"}>${spellOptions}</select></div>
      <p class="hint">${escape(i18n.localize(spells.length ? "VARBORG.Prayer.CastHint" : "VARBORG.Prayer.NoSpells"))}</p>
    </div>
    <div class="form-group">
      <label><input type="radio" name="mode" value="demand" ${spells.length ? "" : "checked"}> ${escape(i18n.localize("VARBORG.Prayer.DemandLabel"))}</label>
      <div class="form-fields"><select name="dr">${drOptions}</select></div>
      <p class="hint">${escape(i18n.localize("VARBORG.Prayer.DemandHint"))}</p>
    </div>`;
  const chosen = await DialogV2.input({
    classes: VB_DIALOG_CLASSES,
    window: { title: i18n.format("VARBORG.Power.DialogTitle", { name: power.name }) },
    content,
    ok: { label: "VARBORG.Power.Use", icon: "fa-solid fa-hands-praying" },
    rejectClose: false
  });
  if (!chosen) return;

  if (chosen.mode === "demand") return demand(actor, power, use, turn, demandDr(chosen.dr));
  const spell = spells.find(entry => entry.key === chosen.spell);
  if (!spell) return;
  const item = spell.item ?? await addPrayerCopy(actor, spell.uuid);
  if (!item) return;
  await castSpell(actor, item, { prayer: { item: power, use } });
  // The copy goes again unless it is now being sustained.
  if (isPrayerCopy(item) && actor.items.get(item.id) && !actor.items.get(item.id).system.sustaining) await item.delete();
}

/**
 * The Priest's own Divine spells, then the compendium's, as choices.
 * @returns {Promise<{key: string, name: string, cost: number, known: boolean, item?: Item, uuid?: string}[]>}
 */
async function spellChoices(actor) {
  const own = actor.itemTypes.spell.filter(item => !isPrayerCopy(item)).map(item => ({
    key: `own.${item.id}`, name: item.name, cost: item.system.cost, spellList: item.system.spellList,
    ritual: Boolean(item.system.ritual), known: true, item
  }));
  const pack = game.packs.get(SPELLS_PACK);
  const index = pack ? await pack.getIndex({ fields: ["system.cost", "system.spellList", "system.ritual"] }) : [];
  const listed = [...index].filter(entry => entry.type === "spell").map(entry => ({
    key: entry.uuid, name: entry.name, cost: entry.system?.cost, spellList: entry.system?.spellList,
    ritual: Boolean(entry.system?.ritual), known: false, uuid: entry.uuid
  }));
  return prayerSpellChoices([...own, ...listed]);
}

/** Add a compendium spell to the Priest's sheet for one casting. */
async function addPrayerCopy(actor, uuid) {
  const source = await fromUuid(uuid).catch(() => null);
  if (!source) return null;
  const data = game.items.fromCompendium(source);
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [SYSTEM]: { [COPY_FLAG]: true } });
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  return item ?? null;
}

/**
 * Demand the impossible: a Sanity test at the chosen DR (at least 16). The
 * prayer's ember and actions are paid once the test is rolled.
 */
async function demand(actor, power, use, turn, dr) {
  const i18n = game.i18n;
  const result = await rollAbilityTest(actor, "sanity", {
    dr, fortune: true,
    purpose: i18n.format("VARBORG.Prayer.DemandPurpose", { name: power.name })
  });
  if (!result) return;
  if (!(await payPowerEmber(actor, use, { boon: false, bane: false }))) return;
  if (use.marksUsed) await power.update({ "system.usedOutside": true });
  const pipNote = await spendPowerActions(turn, use);
  const outcome = demandOutcome(result.tier);
  const text = power.system.outcomes?.[outcome === "fulfilled" ? "success" : outcome === "smitten" ? "ruin" : "failure"]
    || i18n.localize(`VARBORG.Prayer.Outcome.${outcome}`);
  const lines = [text, emberNote(use, Boolean(turn.combatant)), pipNote].filter(Boolean);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="var-borg-card power-card">${lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("")}</div>`
  });
  if (outcome === "smitten") await enterDeathsDoor(actor);
}
