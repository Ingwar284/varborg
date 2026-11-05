/**
 * Resting in Foundry (rules 3.16 Resting, 3.13 Fatigued, 3.9 Fortune;
 * GAPS 111, 144–148).
 *
 * The Dark Master's Rest button on the Calendar panel asks which rest (Short,
 * Long or Downtime) and, for each living character not at Death's Door:
 * whether they take part, whether they ate and drank (Long rest and
 * Downtime) and whether the rest was interrupted. Then:
 * 1. each interrupted character tests Toughness DR12 (closing a test's
 *    dialog cancels the whole rest before anything changes);
 * 2. each character who rests heals, or gets no benefit (Infected, Doomed,
 *    no food, a failed interruption test), with a card that says why;
 *    Infected characters then take d6 damage;
 * 3. their ember abilities unlock (GAPS 22);
 * 4. a Long rest starts the next day, Downtime three (module/days.mjs).
 *    Those who rested slept; characters left out are treated as having
 *    eaten and slept (GAPS 148).
 *
 * The maths lives in module/rules/rest.mjs.
 */

import {
  REST, INTERRUPTION_ABILITY, INTERRUPTION_DR, INFECTION_DAMAGE, FORTUNE_REGAIN,
  isLongRest, daysPassed, noBenefitReasons, restOutcome, downtimeRemoves
} from "./rules/rest.mjs";
import { hpAfterDamage } from "./rules/health.mjs";
import { rollAbilityTest } from "./dice/ability-test.mjs";
import { resetEmberAbilities } from "./dice/power.mjs";
import { livingCharacters, startDays } from "./days.mjs";
import { atDeathsDoor, killedByDamage } from "./deaths-door.mjs";
import { runItemHooks } from "./effects.mjs";

const { DialogV2 } = foundry.applications.api;

const SYSTEM = "var-borg";

/** The characters who can rest: living, and not at Death's Door (GAPS 148). */
function restingCandidates() {
  return livingCharacters().filter(actor => !atDeathsDoor(actor));
}

/**
 * Dark Master only: ask about the rest, then run it.
 * @returns {Promise<boolean>}  Whether the rest happened.
 */
export async function rest() {
  if (!game.user.isGM) return false;
  const i18n = game.i18n;
  const candidates = restingCandidates();
  if (!candidates.length) {
    ui.notifications.warn("VARBORG.Rest.NoCharacters", { localize: true });
    return false;
  }

  const data = await askRest(candidates);
  if (!data || !Object.values(REST).includes(data.kind)) return false;
  const kind = data.kind;
  const resting = candidates.filter(actor => data[`rests-${actor.id}`]);
  if (!resting.length) {
    ui.notifications.warn("VARBORG.Rest.NobodyRests", { localize: true });
    return false;
  }

  // 1. Interrupted rest tests, before anything changes.
  const tiers = new Map();
  for (const actor of resting.filter(actor => data[`interrupted-${actor.id}`])) {
    const result = await rollAbilityTest(actor, INTERRUPTION_ABILITY, {
      dr: INTERRUPTION_DR,
      purpose: i18n.localize("VARBORG.Rest.InterruptedPurpose")
    });
    if (!result) {
      ui.notifications.info("VARBORG.Rest.Cancelled", { localize: true });
      return false;
    }
    tiers.set(actor.id, result.tier);
  }

  await ChatMessage.create({
    content: `<div class="var-borg-card rest-card"><h3>${i18n.localize(`VARBORG.Rest.Kind.${kind}`)}</h3>`
      + `<p>${i18n.format("VARBORG.Rest.Who", { names: resting.map(actor => foundry.utils.escapeHTML(actor.name)).join(", ") })}</p></div>`
  });

  // 2. Healing, or no benefit; Infected damage.
  const ate = new Set();
  for (const actor of resting) {
    const ateAndDrank = !isLongRest(kind) || !!data[`ate-${actor.id}`];
    if (ateAndDrank) ate.add(actor.id);
    await restFor(actor, kind, ateAndDrank, tiers.get(actor.id) ?? null);
  }

  // 3. Any rest unlocks ember abilities.
  await resetEmberAbilities(resting);

  // 4. New days. Characters left out of the rest count as fed and rested.
  const days = daysPassed(kind);
  if (days) {
    const everyone = livingCharacters();
    const restingIds = new Set(resting.map(actor => actor.id));
    for (const actor of everyone) if (!restingIds.has(actor.id)) ate.add(actor.id);
    await startDays(everyone, { ate, slept: new Set(everyone.map(actor => actor.id)) }, days);
  }
  return true;
}

/** The rest dialog: which rest, and a row of ticks per character. */
async function askRest(candidates) {
  const i18n = game.i18n;
  const kinds = Object.values(REST).map(id => `<option value="${id}"${id === REST.LONG ? " selected" : ""}>`
    + `${i18n.localize(`VARBORG.Rest.Kind.${id}`)}</option>`).join("");
  const rows = candidates.map(actor => {
    const tags = [
      actor.statuses.has("infected") ? i18n.localize("VARBORG.Condition.infected") : null,
      actor.statuses.has("doomed") ? i18n.localize("VARBORG.Condition.doomed") : null
    ].filter(Boolean);
    const hint = tags.length ? ` <span class="hint">(${tags.join(", ")})</span>` : "";
    return `<tr><td>${foundry.utils.escapeHTML(actor.name)}${hint}</td>`
      + `<td><input type="checkbox" name="rests-${actor.id}" checked></td>`
      + `<td><input type="checkbox" name="ate-${actor.id}" checked></td>`
      + `<td><input type="checkbox" name="interrupted-${actor.id}"></td></tr>`;
  }).join("");
  const content = `<div class="form-group"><label>${i18n.localize("VARBORG.Rest.KindLabel")}</label>`
    + `<select name="kind">${kinds}</select></div>`
    + `<p class="hint">${i18n.localize("VARBORG.Rest.KindHint")}</p>`
    + `<table class="var-borg-tick-table"><thead><tr><th></th>`
    + `<th>${i18n.localize("VARBORG.Rest.Rests")}</th>`
    + `<th>${i18n.localize("VARBORG.Day.Ate")}</th>`
    + `<th>${i18n.localize("VARBORG.Rest.Interrupted")}</th></tr></thead>`
    + `<tbody>${rows}</tbody></table>`
    + `<p class="hint">${i18n.localize("VARBORG.Rest.AteHint")}</p>`
    + `<p class="hint">${i18n.format("VARBORG.Rest.InterruptedHint", { dr: INTERRUPTION_DR })}</p>`;
  return DialogV2.input({
    window: { title: "VARBORG.Rest.DialogTitle" },
    content,
    ok: { label: "VARBORG.Rest.Begin", icon: "fa-solid fa-bed" },
    rejectClose: false
  });
}

/** What the rest does to one character, with its card. */
async function restFor(actor, kind, ate, interruptionTier) {
  const i18n = game.i18n;
  const system = actor.system;
  const reasons = noBenefitReasons(kind, {
    infected: actor.statuses.has("infected"),
    doomed: actor.statuses.has("doomed"),
    ate,
    interruptionTier
  });
  const outcome = restOutcome(kind, {
    hp: system.hp,
    wounds: system.wounds.value,
    fatigue: system.fatigue,
    fortune: system.fortune,
    sanityLost: system.sanityLost
  }, reasons.length === 0);

  const lines = [];
  const rolls = [];
  const changes = {};
  if (reasons.length) {
    const why = reasons.map(reason => i18n.localize(`VARBORG.Rest.Reason.${reason}`)).join(", ");
    lines.push(i18n.format("VARBORG.Rest.NoBenefit", { reasons: why }));
  } else {
    if (outcome.hp !== system.hp.value) {
      changes["system.hp.value"] = outcome.hp;
      lines.push(i18n.format("VARBORG.Rest.Hp", { from: system.hp.value, to: outcome.hp }));
    }
    if (outcome.wounds !== system.wounds.value) {
      changes["system.wounds.value"] = outcome.wounds;
      lines.push(i18n.format("VARBORG.Rest.Wounds", { from: system.wounds.value, to: outcome.wounds, max: system.wounds.max }));
    }
    if (outcome.fatigue !== system.fatigue) {
      changes["system.fatigue"] = outcome.fatigue;
      lines.push(i18n.format("VARBORG.Rest.Fatigue", { from: system.fatigue, to: outcome.fatigue }));
    }
    if (outcome.sanityLost !== system.sanityLost) {
      changes["system.sanityLost"] = outcome.sanityLost;
      lines.push(i18n.format("VARBORG.Rest.Sanity", { amount: system.sanityLost }));
    }
    if (outcome.regainFortune) {
      const roll = await new Roll(FORTUNE_REGAIN).evaluate();
      rolls.push(roll);
      changes["system.fortune"] = system.fortune + roll.total;
      lines.push(i18n.format("VARBORG.Rest.Fortune", { amount: roll.total }));
    }
    if (!lines.length) lines.push(i18n.localize("VARBORG.Rest.NothingToHeal"));
  }
  if (outcome.resetDarkVessels && system.darkVessels) {
    changes["system.darkVessels"] = 0;
    lines.push(i18n.localize("VARBORG.Rest.DarkVessels"));
  }
  if (outcome.fixHp && !system.hpFixed) {
    changes["system.hpFixed"] = true;
    lines.push(i18n.format("VARBORG.Rest.HpFixed", { max: system.hp.max }));
  }
  if (Object.keys(changes).length) await actor.update(changes);
  if (outcome.clearConditions) {
    const removed = await clearConditions(actor);
    if (removed.length) lines.push(i18n.format("VARBORG.Rest.Conditions", { names: removed.join(", ") }));
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls,
    content: `<div class="var-borg-card rest-card"><h3>${i18n.format("VARBORG.Rest.CardTitle", { name: actor.name })}</h3>`
      + lines.map(line => `<p class="sum">${line}</p>`).join("") + `</div>`
  });

  if (actor.statuses.has("infected")) await infectionDamage(actor);
  // Item effects after a rest (step 49f).
  await runItemHooks(actor, "rest");
  if (isLongRest(kind)) await runItemHooks(actor, "longRest");
}

/**
 * Downtime: remove every condition except Doomed, Infected and Death's
 * Door, and keep lasting injuries (GAPS 147). Fatigued follows its level,
 * which the rest has already set to 0.
 * @returns {Promise<string[]>}  The names of the effects removed.
 */
async function clearConditions(actor) {
  const gone = actor.effects.filter(effect => {
    if (effect.getFlag(SYSTEM, "agony")) return false;
    const statuses = [...effect.statuses].filter(id => id !== "fatigued");
    if (!statuses.length) return false;
    return downtimeRemoves(statuses).length === statuses.length;
  });
  if (!gone.length) return [];
  await actor.deleteEmbeddedDocuments("ActiveEffect", gone.map(effect => effect.id));
  return gone.map(effect => effect.name);
}

/** Infected: d6 damage at the end of a rest, with its own card. */
async function infectionDamage(actor) {
  const i18n = game.i18n;
  const roll = await new Roll(INFECTION_DAMAGE).evaluate();
  const damage = roll.total;
  const from = actor.system.hp.value;
  const to = hpAfterDamage(from, damage);
  // The card first, so a wound card from reaching 0 HP follows it.
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `<div class="var-borg-card rest-card"><h3>${i18n.format("VARBORG.Rest.InfectedTitle", { name: actor.name })}</h3>`
      + `<p class="sum">${i18n.format("VARBORG.Rest.InfectedDamage", { damage })}</p>`
      + `<p class="sum">${i18n.format("VARBORG.Day.Hp", { from, to, max: actor.system.hp.max })}</p></div>`
  });
  if (await killedByDamage(actor, damage)) return;
  await actor.update({ "system.hp.value": to });
}
