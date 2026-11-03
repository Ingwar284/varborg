/**
 * Damaging foes and Morale in Foundry (rules 3.4 Attack, 3.8 Armour,
 * 3.12 Panic and morale, GAPS 69-72).
 *
 * An attack card that hits has an Inflict damage button. It rolls the foe's
 * armour die, subtracts it (a hit always deals at least 1) and lowers the
 * foe's HP. On a Triumph the armour soaks with the die it had before the
 * hit, and only then steps down (GAPS 69). Only someone who may change the
 * foe (the Dark Master) can press it.
 *
 * The damage card offers Morale buttons when the last enemy standing is at
 * a third of its HP or less, or when this kill brings the group (the foes
 * in combat, mooks left out) to half eliminated (GAPS 70, 72). The foe
 * sheet always has a Morale button. At 0 HP the foe is marked defeated in
 * the Combat Tracker (GAPS 71).
 * Morale: 2d6, above the foe's Morale it is demoralised, then d6: 1-3 it
 * flees, 4-6 it surrenders. Morale "–" and mooks never roll.
 * All the maths lives in module/rules/morale.mjs; this file only rolls and
 * shows.
 */

import { hpAfterDamage } from "../rules/health.mjs";
import {
  MORALE_DICE, DEMORALISED_DIE, foeDamageTaken, canRollMorale, moraleTriggers, moraleResult
} from "../rules/morale.mjs";

const { renderTemplate } = foundry.applications.handlebars;

const SYSTEM = "var-borg";
const DAMAGE_TEMPLATE = "systems/var-borg/templates/chat/foe-damage-card.hbs";
const MORALE_TEMPLATE = "systems/var-borg/templates/chat/morale-card.hbs";

/**
 * Deal an attack's damage to a foe: roll its armour, lower its HP, post a
 * card.
 * @param {Actor} foe        The foe hit.
 * @param {number} damage    The attack's damage (already doubled on a Triumph).
 * @param {string} armour    The armour die that soaks this hit ("" for none).
 * @param {string} attack    The attack's name, for the card.
 */
export async function inflictDamage(foe, damage, armour, attack) {
  const i18n = game.i18n;
  const rolls = [];
  let soak = 0;
  if (armour) {
    const soakRoll = new Roll(armour);
    await soakRoll.evaluate();
    rolls.push(soakRoll);
    soak = soakRoll.total;
  }
  const { taken, minimum } = foeDamageTaken(damage, soak);
  const from = foe.system.hp.value;
  const to = hpAfterDamage(from, taken);
  await foe.update({ "system.hp.value": to });

  const max = foe.system.hp.max;
  const fallen = to === 0;
  if (fallen) await markDefeated(foe);

  // Who may roll Morale now: the last enemy, or everyone left when this
  // kill brings the group to half (GAPS 70, 72).
  const group = foeGroup(foe);
  const triggers = moraleTriggers(group, foe.uuid, fallen && from > 0);
  const moraleNotes = [
    triggers.lastEnemy ? i18n.format("VARBORG.FoeDamage.LastEnemy", { name: foe.name }) : null,
    triggers.halfDown ? i18n.localize("VARBORG.FoeDamage.HalfDown") : null
  ].filter(Boolean);
  const moraleFoes = triggers.roll.map(id => {
    const actor = group.find(member => member.id === id).actor;
    return { uuid: id, label: i18n.format("VARBORG.MoraleRoll.ButtonFor", { name: actor.name }) };
  });

  const content = await renderTemplate(DAMAGE_TEMPLATE, {
    title: i18n.format("VARBORG.FoeDamage.CardTitle", { name: foe.name }),
    attack: attack ? i18n.format("VARBORG.FoeDamage.From", { attack }) : null,
    damage,
    soakDie: armour ? i18n.localize(`VARBORG.Foe.Armour.${armour}`) : null,
    soak,
    taken,
    minimum,
    hp: i18n.format("VARBORG.FoeDamage.Hp", { from, to, max }),
    fallenNote: fallen ? i18n.format("VARBORG.FoeDamage.Fallen", { name: foe.name }) : null,
    moraleNotes: moraleFoes.length ? moraleNotes : [],
    moraleFoes
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: foe }),
    flavor: i18n.format("VARBORG.FoeDamage.CardTitle", { name: foe.name }),
    content,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : null
  });
}

/**
 * Roll the foe's Morale and post the result.
 * @param {Actor} foe
 */
export async function rollMorale(foe) {
  const i18n = game.i18n;
  if (!canRollMorale(foe.system)) {
    ui.notifications.warn(i18n.format("VARBORG.MoraleRoll.Never", { name: foe.name }));
    return;
  }
  const morale = foe.system.morale;
  const roll = new Roll(MORALE_DICE);
  await roll.evaluate();
  const rolls = [roll];

  // Only a demoralised foe rolls the d6.
  let d6 = null;
  if (roll.total > morale) {
    const reactionRoll = new Roll(DEMORALISED_DIE);
    await reactionRoll.evaluate();
    rolls.push(reactionRoll);
    d6 = reactionRoll.total;
  }
  const result = moraleResult(roll.total, morale, d6 ?? undefined);

  const content = await renderTemplate(MORALE_TEMPLATE, {
    title: i18n.format("VARBORG.MoraleRoll.CardTitle", { name: foe.name }),
    dice: roll.dice[0].results.map(r => r.result),
    total: roll.total,
    morale,
    demoralised: result.demoralised,
    outcome: result.demoralised
      ? i18n.format("VARBORG.MoraleRoll.Demoralised", { name: foe.name })
      : i18n.format("VARBORG.MoraleRoll.Holds", { name: foe.name }),
    d6,
    reaction: result.reaction ? i18n.format(`VARBORG.MoraleRoll.Reaction.${result.reaction}`, { name: foe.name }) : null
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: foe }),
    flavor: i18n.format("VARBORG.MoraleRoll.CardTitle", { name: foe.name }),
    content,
    rolls,
    sound: CONFIG.sounds.dice
  });
}

/**
 * The hit foe's group: every foe in the running combat, each listed once.
 * A foe not in combat is a group of one. Eliminated means defeated in the
 * Combat Tracker or at 0 HP. Mooks are left out later, by moraleTriggers.
 * @returns {Array<{id: string, actor: Actor, hp: number, max: number,
 *   eliminated: boolean, morale: number|null, mook: boolean}>}
 */
function foeGroup(foe) {
  const facts = (actor, defeated) => ({
    id: actor.uuid,
    actor,
    hp: actor.system.hp.value,
    max: actor.system.hp.max,
    eliminated: defeated || actor.system.hp.value === 0,
    morale: actor.system.morale,
    mook: actor.system.mook
  });
  const combatants = game.combat?.combatants.filter(c => c.actor?.type === "foe") ?? [];
  if (!combatants.some(c => c.actor.uuid === foe.uuid)) return [facts(foe, false)];
  const group = new Map();
  for (const combatant of combatants) {
    const actor = combatant.actor;
    if (!group.has(actor.uuid)) group.set(actor.uuid, facts(actor, combatant.defeated));
  }
  return [...group.values()];
}

/**
 * At 0 HP: mark the foe defeated in the running combat, with the usual
 * defeated icon on its token (GAPS 71).
 */
async function markDefeated(foe) {
  const combatants = game.combat?.combatants.filter(c => c.actor?.uuid === foe.uuid && !c.defeated) ?? [];
  for (const combatant of combatants) await combatant.update({ defeated: true });
  const defeatedId = CONFIG.specialStatusEffects.DEFEATED;
  if (CONFIG.statusEffects.some(effect => effect.id === defeatedId)) {
    await foe.toggleStatusEffect(defeatedId, { active: true, overlay: true });
  }
}

/**
 * Buttons on chat cards: Inflict damage on an attack card, Morale on a foe
 * damage card. Hooked to renderChatMessageHTML.
 */
export function addMoraleCardListeners(message, html) {
  const inflict = html.querySelector("button[data-action='inflictDamage']");
  if (inflict) {
    if (message.getFlag(SYSTEM, "damageInflicted")) inflict.disabled = true;
    else inflict.addEventListener("click", async () => {
      // The foe targeted when the attack was rolled, or else the one targeted now.
      const stored = inflict.dataset.foeUuid ? await fromUuid(inflict.dataset.foeUuid) : null;
      const foe = stored ?? [...game.user.targets].map(token => token.actor).find(actor => actor?.type === "foe");
      if (!foe) {
        ui.notifications.warn(game.i18n.localize("VARBORG.FoeDamage.NoFoe"));
        return;
      }
      if (!foe.isOwner) {
        ui.notifications.warn(game.i18n.localize("VARBORG.Attack.GMOnly"));
        return;
      }
      inflict.disabled = true;
      // The armour as it was before a Triumph lowered it (GAPS 69).
      const armour = stored ? inflict.dataset.armour : foe.system.armour;
      await message.setFlag(SYSTEM, "damageInflicted", true);
      await inflictDamage(foe, Number(inflict.dataset.damage), armour, inflict.dataset.attack);
    });
  }

  for (const button of html.querySelectorAll("button[data-action='rollMorale']")) {
    button.addEventListener("click", async () => {
      const foe = await fromUuid(button.dataset.foeUuid);
      if (!foe?.isOwner) {
        ui.notifications.warn(game.i18n.localize("VARBORG.Attack.GMOnly"));
        return;
      }
      await rollMorale(foe);
    });
  }
}
