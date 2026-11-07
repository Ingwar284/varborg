/**
 * The Effects section of item sheets (PLAN step 49a): the item's automation
 * status and its list of effects, which can be added, changed and removed.
 * Shared by every item sheet whose item has effects.
 *
 * Effect fields have no form name: each change saves the whole list at
 * once, so changing one effect never resets the fields of another.
 */

import {
  BUILT_KINDS, AUTOMATION, STAT_TARGETS, STAT_OPS, ROLL_KINDS, GRANTS, ROLL_MODES, WEAPON_TAGS, DAMAGE_PER,
  HOOK_EVENTS, HOOK_ACTIONS, USE_ACTIONS, KEEPS, HOOK_REQUIRES, ROLL_REQUIRES, STAT_REQUIRES, CARD_REQUIRES, FAIL_AGAIN, CHOICE_KINDS, CHOICE_FROM, VERSUS, RESIST_MODES, COMPANIONS, COMPANION_ARMOUR, blankEffect
} from "../rules/item-effects.mjs";
import { makeChoice } from "../choices.mjs";
import { ABILITIES } from "../rules/abilities.mjs";
import { CONDITIONS } from "../rules/conditions.mjs";
import { DAMAGE_TYPES } from "../rules/equipment.mjs";

export const EFFECTS_TEMPLATE = "systems/var-borg/templates/item/item-effects.hbs";

/** { key: "VARBORG.<prefix>.<key>" } for a select. */
function labels(keys, prefix, blankKey) {
  return Object.fromEntries(keys.map(key => [key, key ? `VARBORG.${prefix}.${key}` : blankKey]));
}

const NUMBER_FIELDS = ["value", "dr", "radius", "allyCount"];

/** The cards a reroll can be offered on (step 49g). */
const REROLL_CARDS = ["test", "attack", "defence", "gloomTest", "power", "spell"];

/**
 * The sheet's part of the context, or nothing for an item without effects.
 * @param {Item} document
 * @param {string} [path]  "effects", or "buffEffects" for the buff a power
 *   or spell gives (step 51c), shown as its own part as `buffPart`.
 */
export function effectsContext(document, path = "effects") {
  const system = document.system;
  if (!Array.isArray(system[path])) return {};
  return {
    [path === "effects" ? "effectsPart" : "buffPart"]: {
      path,
      isBuff: path !== "effects",
      automation: system.automation,
      automations: labels(AUTOMATION, "Effects.Automation", "VARBORG.Effects.Automation.none"),
      targets: labels(STAT_TARGETS, "Effects.Target"),
      ops: labels(STAT_OPS, "Effects.Op"),
      rolls: labels(ROLL_KINDS, "Effects.Roll"),
      abilities: labels(["", ...ABILITIES], "Ability", "VARBORG.Effects.AnyAbility"),
      conditions: labels(["", ...CONDITIONS], "Condition", "VARBORG.Effects.AnyCondition"),
      grants: labels(GRANTS, "Effects.Grant", "VARBORG.Effects.Grant.none"),
      modes: labels(ROLL_MODES, "Effects.Mode"),
      hookModes: labels(ROLL_MODES, "Effects.HookMode"),
      weapons: labels(WEAPON_TAGS, "Effects.Weapon", "VARBORG.Effects.Weapon.any"),
      pers: labels(DAMAGE_PER, "Effects.Per", "VARBORG.Effects.Per.once"),
      events: labels(HOOK_EVENTS, "Effects.Event"),
      actions: labels(HOOK_ACTIONS, "Effects.Action"),
      useActions: labels(USE_ACTIONS, "Effects.Action"),
      rerollRolls: labels(REROLL_CARDS, "Effects.RerollCard"),
      keeps: labels(KEEPS, "Effects.Keep"),
      requireList: labels(HOOK_REQUIRES, "Effects.Requires", "VARBORG.Effects.Requires.always"),
      rollRequireList: labels(ROLL_REQUIRES, "Effects.Requires", "VARBORG.Effects.Requires.always"),
      statRequireList: labels(STAT_REQUIRES, "Effects.Requires", "VARBORG.Effects.Requires.always"),
      cardRequireList: labels(CARD_REQUIRES, "Effects.Requires", "VARBORG.Effects.Requires.always"),
      failAgainList: labels(FAIL_AGAIN, "Effects.FailAgain", "VARBORG.Effects.FailAgain.none"),
      hookConditions: labels(CONDITIONS, "Condition"),
      choiceKinds: labels(CHOICE_KINDS, "Effects.Choice.Kind"),
      choiceFrom: labels(CHOICE_FROM, "Effects.Choice.From"),
      versusList: labels(VERSUS, "Effects.Versus", "VARBORG.Effects.Versus.any"),
      // Whose cards a reroll button is on: the owner's, or every player character's (step 51a2).
      cardOwnerList: labels(["", "allies"], "Effects.Versus", "VARBORG.Effects.Versus.own"),
      damageTypes: labels(["", ...DAMAGE_TYPES], "DamageType", "VARBORG.Effects.AnyDamageType"),
      resistTypes: labels(["", ...DAMAGE_TYPES], "DamageType", "VARBORG.Effects.ChosenDamageType"),
      resistModes: labels(RESIST_MODES, "Effects.Resist"),
      persistentTypes: labels(["fire", "bleeding", "acid", "poison"], "DamageType"),
      // Whose Morale a Morale effect changes (step 52b).
      moraleWho: { "": "VARBORG.Effects.MoraleWho.own", allies: "VARBORG.Effects.MoraleWho.allies" },
      companions: labels(COMPANIONS, "Effects.Companion"),
      companionArmour: Object.fromEntries(COMPANION_ARMOUR.map(die => [die, die || "—"])),
      // The Choose button needs a character to choose for.
      canChoose: Boolean(document.actor) && document.isOwner,
      list: system[path].map((effect, index) => ({
        ...effect,
        index,
        // An effect of a kind not built yet (from a later step's content)
        // still shows its own kind.
        kinds: labels([...new Set([...BUILT_KINDS, effect.kind])], "Effects.Kind"),
        isStat: effect.kind === "stat",
        isRoll: effect.kind === "roll",
        isHook: effect.kind === "hook",
        isUse: effect.kind === "use",
        isChoice: effect.kind === "choice",
        choiceHasFrom: ["feat", "spell"].includes(effect.choose),
        choiceIsSpell: effect.choose === "spell",
        // Reroll and Success buttons on cards (steps 49g, 50b2).
        isReroll: ["reroll", "success"].includes(effect.action),
        isRerollOnly: effect.action === "reroll",
        hasAmount: ["reminder", "gainGloom", "targetPersistent", "heal", "roll", "gainEmber", "gainFortune", "makeMinion", "takeDamage", "lowerDamage", "healCompanion", "hurtCompanion", "photonicSurge", "auraHeal", "auraHurt"].includes(effect.action),
        // An aura's radius in feet (Primal Conduit, step 51a2).
        isAura: effect.kind === "hook" && effect.event === "aura",
        hasCondition: ["addCondition", "targetCondition"].includes(effect.action),
        // Step 52f: persistent damage on the creature hit; Abandon Shell's armour.
        isTargetPersistent: effect.kind === "hook" && effect.action === "targetPersistent",
        isTargetCondition: effect.kind === "hook" && effect.action === "targetCondition",
        isDropToOne: effect.kind === "hook" && effect.action === "dropToOne",
        // Step 52b (foes): Morale effects, the attacker's test, Regeneration's exception.
        isMorale: effect.kind === "stat" && effect.target === "morale",
        isTestButton: effect.kind === "hook" && effect.action === "testButton",
        hasUnlessDamaged: effect.kind === "hook" && ["turnStart", "roundStart"].includes(effect.event),
        hasKeep: effect.action === "rollTwice",
        perWound: ["wound", "kill"].includes(effect.per),
        isReminder: effect.kind === "reminder",
        isResist: effect.kind === "resist",
        isGift: effect.kind === "gift",
        isImmune: effect.kind === "immune",
        isCompanion: effect.kind === "use" && ["upgradeCompanion", "healCompanion", "hurtCompanion"].includes(effect.action),
        isUpgrade: effect.kind === "use" && effect.action === "upgradeCompanion",
        // The compendium actor a Use makes (GAPS 211, 213).
        makesActor: effect.kind === "use" && ["makeCompanion", "raiseThrall"].includes(effect.action),
        resistReduce: effect.kind === "resist" && ["reduce", "extra"].includes(effect.resist)
      }))
    }
  };
}

/** The effects as stored, safe to change. */
function storedEffects(document, path = "effects") {
  return foundry.utils.deepClone(document.toObject().system[path] ?? []);
}

/** Which list a button or field belongs to: the item's effects, or its buff's (step 51c). */
function pathOf(element) {
  return element?.closest("[data-effects-path]")?.dataset.effectsPath || "effects";
}

/** The Add button: a new stat effect at the end of the list. */
async function addEffect(event, target) {
  const path = pathOf(target);
  const effects = storedEffects(this.document, path);
  effects.push(blankEffect());
  await this.document.update({ [`system.${path}`]: effects });
}

/** The remove button on an effect. */
async function removeEffect(event, target) {
  const path = pathOf(target);
  const index = Number(target.closest("[data-effect-index]")?.dataset.effectIndex);
  const effects = storedEffects(this.document, path);
  if (!effects[index]) return;
  effects.splice(index, 1);
  await this.document.update({ [`system.${path}`]: effects });
}

/** The Choose button on a choice effect: ask again (step 49h). */
async function chooseEffect(event, target) {
  const index = Number(target.closest("[data-effect-index]")?.dataset.effectIndex);
  await makeChoice(this.document, index);
}

/** For a sheet's DEFAULT_OPTIONS.actions. */
export const EFFECT_ACTIONS = { addEffect, removeEffect, chooseEffect };

/** Called from the sheet's _onRender: saves a changed effect field. */
export function listenToEffects(sheet) {
  for (const input of sheet.element.querySelectorAll("[data-effect-field]")) {
    input.addEventListener("change", async event => {
      // Not the sheet's own form submit: this field has no name.
      event.stopPropagation();
      const index = Number(input.closest("[data-effect-index]")?.dataset.effectIndex);
      const field = input.dataset.effectField;
      const path = pathOf(input);
      const effects = storedEffects(sheet.document, path);
      if (!effects[index]) return;
      effects[index][field] = input.type === "checkbox" ? input.checked
        : NUMBER_FIELDS.includes(field) ? Math.trunc(Number(input.value) || 0) : input.value;
      // A new kind starts with an action it can have (step 49g).
      const effect = effects[index];
      if (field === "kind" && effect.kind === "use" && !USE_ACTIONS.includes(effect.action)) effect.action = USE_ACTIONS[0];
      if (field === "kind" && effect.kind === "hook" && !HOOK_ACTIONS.includes(effect.action)) effect.action = HOOK_ACTIONS[0];
      // Hooks and rolls have different "only while" lists (step 50a).
      if (field === "kind" && effect.kind === "hook" && !HOOK_REQUIRES.includes(effect.requires)) effect.requires = "";
      if (field === "kind" && ["roll", "reminder"].includes(effect.kind) && !ROLL_REQUIRES.includes(effect.requires)) effect.requires = "";
      if (field === "kind" && effect.kind === "use" && !CARD_REQUIRES.includes(effect.requires)) effect.requires = "";
      if (field === "kind" && effect.kind === "stat" && !STAT_REQUIRES.includes(effect.requires)) effect.requires = "";
      // A different kind of choice forgets the old choice (step 49h).
      if (["choose", "from"].includes(field)) {
        effect.chosen = "";
        effect.chosenName = "";
      }
      await sheet.document.update({ [`system.${path}`]: effects });
    });
  }
}
