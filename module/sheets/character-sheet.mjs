/**
 * The character sheet (ApplicationV2). Every change is saved as soon as
 * you leave a field. Two tabs: Character (origins, abilities, resources,
 * conditions, feats, details) and Inventory (carrying, equipment, gear and
 * containers). Dropping a class, ancestry or background applies it.
 */

import { ABILITIES } from "../rules/abilities.mjs";
import { rollAbilityTest, signed } from "../dice/ability-test.mjs";
import { rollContestedTest } from "../dice/contested-test.mjs";
import { rollChanceDie } from "../dice/chance-die.mjs";
import { rollExpendable, fireWeapon, reloadWeapon } from "../dice/expendable.mjs";
import { rollAttack, recoverFromRuin } from "../dice/attack.mjs";
import { usePower, sustainPower, endPower } from "../dice/power.mjs";
import { castSpell } from "../dice/spell.mjs";
import { powerDr } from "../rules/powers.mjs";
import { spellDr } from "../rules/spells.mjs";
import { raiseShield, lowerShield } from "../dice/defence.mjs";
import { strongestShield, shieldCover } from "../rules/defence.mjs";
import { weaponTraits } from "../rules/equipment.mjs";
import { carrying, isOverCapacity, itemCount } from "../rules/carrying.mjs";
import { canRollExpendable, needsReload, canFire, canReload } from "../rules/expendable.mjs";
import { sheetConditions, activateConditionControls } from "../conditions.mjs";
import { rollPanicTest } from "../panic.mjs";
import { addOrigin, isOrigin } from "../origins.mjs";
import { ORIGIN_TYPES, currentAbilities } from "../rules/origins.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TEMPLATES = "systems/var-borg/templates/actor";

/** Item types shown in the Inventory tab, in this order. */
const INVENTORY_TYPES = ["weapon", "armour", "shield", "gear", "container", "scroll"];

/** Item types that can be equipped. */
const EQUIPPABLE_TYPES = ["weapon", "armour", "shield"];

/**
 * One short line about an item, such as "d4 · Melee · Agile, Thrown (20')".
 * `stored` counts the items kept in each container.
 */
function itemSummary(item, stored) {
  const i18n = game.i18n;
  const system = item.system;
  switch (item.type) {
    case "weapon": {
      const traits = weaponTraits(system).map(({ key, value }) => (value === undefined
        ? i18n.localize(`VARBORG.Trait.${key}`)
        : i18n.format(`VARBORG.Trait.${key}Value`, { value })));
      return [system.damage, i18n.localize(`VARBORG.Weapon.Kind.${system.kind}`), traits.join(", ")]
        .filter(Boolean).join(" · ");
    }
    case "armour": {
      const tier = i18n.format("VARBORG.Armour.TierOf", { tier: system.tier, original: system.originalTier });
      return system.metal ? `${tier} · ${i18n.localize("VARBORG.Armour.Metal")}` : tier;
    }
    case "shield":
      return i18n.localize(`VARBORG.Shield.Size.${system.size}`);
    case "gear":
      return system.expendable ? i18n.format("VARBORG.Trait.expendableValue", { value: system.expendable }) : "";
    case "container":
      return i18n.format("VARBORG.Container.Holds", { count: stored.get(item.id) ?? 0, capacity: system.capacity });
    case "scroll":
      return spellSummary(item);
  }
  return "";
}

/**
 * The short tag after an item's summary: "Loaded" or "Empty" for a weapon
 * with Reload, and "Used up" (or "Out of ammo") once its expendable die
 * rolled a 1. Returns [{ key, label }].
 */
function itemStates(item) {
  const system = item.system;
  const states = [];
  if (item.type === "weapon" && needsReload(system)) {
    states.push(system.loaded ? { key: "loaded", label: "VARBORG.Reload.Loaded" } : { key: "unloaded", label: "VARBORG.Reload.Empty" });
  }
  if (item.type === "shield" && system.destroyed) {
    states.push({ key: "destroyed", label: "VARBORG.Shield.Destroyed" });
  }
  if (item.type === "armour" && system.originalTier >= 1 && system.tier < 1) {
    states.push({ key: "destroyed", label: "VARBORG.Defence.Destroyed" });
  }
  if (system.usedUp) {
    states.push({ key: "used-up", label: item.type === "weapon" ? "VARBORG.Expendable.OutOfAmmo" : "VARBORG.Expendable.UsedUp" });
  }
  return states;
}

/** One short line about a class or background. */
function originSummary(item) {
  const i18n = game.i18n;
  const system = item.system;
  if (item.type === "class") {
    return [
      i18n.format("VARBORG.Class.KeyAbility", { ability: i18n.localize(`VARBORG.Ability.${system.boostedAbility}`) }),
      i18n.format("VARBORG.Class.HpSummary", { base: system.hpBase }),
      i18n.format("VARBORG.Class.WoundsSummary", { wounds: system.maxWounds }),
      i18n.localize(`VARBORG.Class.SpellList.${system.spellList}`),
      i18n.format("VARBORG.Class.DieSummary", { die: system.startingDie })
    ].join(" · ");
  }
  if (item.type === "background") {
    return [system.wealth, system.keepsake].filter(Boolean).join(" · ");
  }
  return "";
}

/** One short line about a power: cost, actions, DR, source, Sustained. */
function powerSummary(item) {
  const i18n = game.i18n;
  const system = item.system;
  return [
    `🟒${system.cost}${system.actions ? ` ${"◈".repeat(system.actions)}` : " ◇"}`,
    i18n.format("VARBORG.Power.DrShort", { dr: powerDr(system.cost) }),
    i18n.localize(`VARBORG.Power.Source.${system.source}`),
    system.sustained ? i18n.localize("VARBORG.Power.SustainedLabel") : ""
  ].filter(Boolean).join(" · ");
}

/** One short line about a spell: cost, actions, DR, spell list, Sustained. */
function spellSummary(item) {
  const i18n = game.i18n;
  const system = item.system;
  return [
    `🟒${system.cost}${system.actions ? ` ${"◈".repeat(system.actions)}` : " ◇"}`,
    i18n.format("VARBORG.Power.DrShort", { dr: spellDr(system.cost) }),
    i18n.localize(`VARBORG.Class.SpellList.${system.spellList}`),
    system.sustained ? i18n.localize("VARBORG.Power.SustainedLabel") : ""
  ].filter(Boolean).join(" · ");
}

export default class CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["var-borg", "character"],
    position: { width: 600, height: 680 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAbility: CharacterSheet.#onRollAbility,
      rollContest: CharacterSheet.#onRollContest,
      rollChance: CharacterSheet.#onRollChance,
      rollPanic: CharacterSheet.#onRollPanic,
      editItem: CharacterSheet.#onEditItem,
      deleteItem: CharacterSheet.#onDeleteItem,
      toggleEquipped: CharacterSheet.#onToggleEquipped,
      toggleCumbersome: CharacterSheet.#onToggleCumbersome,
      rollExpendable: CharacterSheet.#onRollExpendable,
      fireWeapon: CharacterSheet.#onFireWeapon,
      reloadWeapon: CharacterSheet.#onReloadWeapon,
      attack: CharacterSheet.#onAttack,
      recover: CharacterSheet.#onRecover,
      raiseShield: CharacterSheet.#onRaiseShield,
      lowerShield: CharacterSheet.#onLowerShield,
      usePower: CharacterSheet.#onUsePower,
      castSpell: CharacterSheet.#onCastSpell,
      sustainPower: CharacterSheet.#onSustainPower,
      endPower: CharacterSheet.#onEndPower
    }
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/character-header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: `${TEMPLATES}/character-main.hbs`, scrollable: [""] },
    inventory: { template: `${TEMPLATES}/character-inventory.hbs`, scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-user" },
        { id: "inventory", icon: "fa-solid fa-sack" }
      ],
      initial: "main",
      labelPrefix: "VARBORG.Sheet.Tab"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    context.actor = actor;
    context.system = system;
    // The box holds the score as rolled. Under it, what is added on top and
    // the score in use, such as "+1 Warrior → +3" (GAPS 111).
    const i18n = game.i18n;
    const cls = actor.itemTypes.class?.[0];
    context.abilities = ABILITIES.map(key => {
      const rolled = system.rolledAbilities[key];
      const parts = [];
      if (cls && key === system.keyAbility) {
        const boost = currentAbilities(system.rolledAbilities, key)[key] - rolled;
        if (boost) parts.push(i18n.format("VARBORG.Sheet.ClassPart", { boost, name: cls.name }));
      }
      if (key === "sanity" && system.sanityLost) parts.push(i18n.format("VARBORG.Sheet.LostPart", { lost: system.sanityLost }));
      return {
        key,
        label: `VARBORG.Ability.${key}`,
        value: rolled,
        inUse: parts.length ? i18n.format("VARBORG.Sheet.AbilityInUse", { parts: parts.join(", "), score: signed(system.abilities[key]) }) : ""
      };
    });
    // Max HP follows X + Toughness until it is fixed (GAPS 111).
    context.hpHint = cls && !system.hpFixed ? i18n.format("VARBORG.Sheet.HpFollows", { base: cls.system.hpBase }) : "";

    // Containers on this character, and how many items each one holds.
    // An item pointing at a container that is gone counts as loose.
    const containers = actor.itemTypes.container;
    const containerIds = new Set(containers.map(c => c.id));
    const stored = new Map();
    for (const item of actor.items) {
      const id = item.system.storedIn;
      // A stack fills one place per piece (GAPS 54).
      if (containerIds.has(id) && id !== item.id) stored.set(id, (stored.get(id) ?? 0) + itemCount(item.system));
    }
    context.containerOptions = {
      "": game.i18n.localize("VARBORG.Container.Loose"),
      ...Object.fromEntries(containers.map(c => [c.id, c.name]))
    };

    context.inventory = INVENTORY_TYPES.map(type => ({
      type,
      label: `VARBORG.Sheet.Inventory.${type}`,
      canEquip: EQUIPPABLE_TYPES.includes(type),
      canStore: type !== "container",
      hasQuantity: type === "gear",
      items: actor.itemTypes[type]
        .toSorted((a, b) => a.sort - b.sort)
        .map(item => ({
          item,
          summary: itemSummary(item, stored),
          storedIn: containerIds.has(item.system.storedIn) ? item.system.storedIn : "",
          states: itemStates(item),
          canAttack: item.type === "weapon",
          canCast: item.type === "scroll",
          canRaise: item.type === "shield" && item.system.equipped && !item.system.destroyed && !system.shieldRaised,
          canExpendable: canRollExpendable(item.system),
          canFire: item.type === "weapon" && canFire(item.system),
          canReload: item.type === "weapon" && canReload(item.system),
          reloadTooltip: game.i18n.format("VARBORG.Reload.ReloadTooltip", { count: item.system.reload ?? 0 }),
          overCapacity: type === "container" && isOverCapacity(stored.get(item.id) ?? 0, item.system.capacity)
        }))
    }));

    // Class, ancestry and background, one row each, with a short line such
    // as "Strength · 10 + Toughness HP · 3 wounds · No spell list · d10".
    context.origins = ORIGIN_TYPES.map(type => {
      const item = actor.itemTypes[type]?.[0];
      return { type, label: `TYPES.Item.${type}`, item, summary: item ? originSummary(item) : "" };
    });

    // Feats, with where each came from, such as "Class feat · Improving".
    context.feats = actor.itemTypes.feat
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({
        item,
        summary: [
          game.i18n.localize(`VARBORG.Feat.Source.${item.system.source}`),
          item.system.improving ? game.i18n.localize("VARBORG.Feat.Improving") : ""
        ].filter(Boolean).join(" · ")
      }));

    // Powers, with a line such as "🟒1 ◈◈ · DR12 · Class power".
    context.powers = actor.itemTypes.power
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({ item, summary: powerSummary(item) }));

    // Spells, with a line such as "🟒3 ◈◈ · DR14 · Arcane".
    context.spells = (actor.itemTypes.spell ?? [])
      .toSorted((a, b) => a.sort - b.sort)
      .map(item => ({ item, summary: spellSummary(item) }));

    const carried = carrying(
      actor.items.map(item => ({ type: item.type, ...item.system })),
      system.abilities.toughness
    );
    context.carrying = { ...carried, stateLabel: `VARBORG.Carrying.State.${carried.state}` };
    context.conditions = sheetConditions(actor);

    // A raised shield: which one counts, and its cover (GAPS 46).
    if (system.shieldRaised) {
      const shield = strongestShield(actor.items.map(item => ({ id: item.id, type: item.type, ...item.system })));
      const cover = shieldCover(shield, true);
      context.raisedShield = cover
        ? game.i18n.format("VARBORG.Defence.RaisedHint", { name: actor.items.get(shield.id)?.name, dr: cover })
        : game.i18n.localize("VARBORG.Defence.RaisedNoShield");
    }
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    activateConditionControls(this.element, this.document);
    // The "Stored in" menus and quantity boxes have no form name, so they
    // change the item, not the character.
    for (const select of this.element.querySelectorAll("select[data-stored-in]")) {
      select.addEventListener("change", event => {
        this.#itemFor(event.currentTarget)?.update({ "system.storedIn": event.currentTarget.value });
      });
    }
    for (const input of this.element.querySelectorAll("input[data-quantity]")) {
      input.addEventListener("change", event => {
        const quantity = Math.max(1, Math.floor(Number(event.currentTarget.value)) || 1);
        this.#itemFor(event.currentTarget)?.update({ "system.quantity": quantity });
      });
    }
  }

  /**
   * A dropped class, ancestry or background replaces the one the character
   * has and is applied (module/origins.mjs). Anything else is added as usual.
   * @override
   */
  async _onDropItem(event, item) {
    if (!isOrigin(item.type)) return super._onDropItem(event, item);
    if (!this.actor.isOwner || this.actor.uuid === item.parent?.uuid) return null;
    const data = item.inCompendium ? game.items.fromCompendium(item, { clearFolder: true }) : item.toObject();
    delete data._id;
    return addOrigin(this.actor, data);
  }

  /** The pencil button opens the item's own sheet. */
  static #onEditItem(event, button) {
    this.#itemFor(button)?.sheet.render(true);
  }

  /** The bin button asks first, then deletes the item from the character. */
  static async #onDeleteItem(event, button) {
    await this.#itemFor(button)?.deleteDialog();
  }

  /** The circle button equips or unequips the item. */
  static async #onToggleEquipped(event, button) {
    const item = this.#itemFor(button);
    await item?.update({ "system.equipped": !item.system.equipped });
  }

  /** The weight button marks the item cumbersome, or not. */
  static async #onToggleCumbersome(event, button) {
    const item = this.#itemFor(button);
    await item?.update({ "system.cumbersome": !item.system.cumbersome });
  }

  /** The dice button rolls the item's expendable die. */
  static async #onRollExpendable(event, button) {
    const item = this.#itemFor(button);
    if (item) await rollExpendable(this.document, item);
  }

  /** The Fire button empties a loaded weapon with Reload. */
  static async #onFireWeapon(event, button) {
    const item = this.#itemFor(button);
    if (item) await fireWeapon(this.document, item);
  }

  /** The Reload button loads an empty weapon and counts its Interact actions. */
  static async #onReloadWeapon(event, button) {
    const item = this.#itemFor(button);
    if (item) await reloadWeapon(this.document, item);
  }

  /** The sword button opens the attack dialog for that weapon. */
  static async #onAttack(event, button) {
    const item = this.#itemFor(button);
    if (item) await rollAttack(this.document, item);
  }

  /** The Recover button ends an attack Ruin, spending an action in combat. */
  static async #onRecover(event, button) {
    await recoverFromRuin(this.document);
  }

  /** The shield button raises the strongest equipped shield (one action in combat). */
  static async #onRaiseShield(event, button) {
    await raiseShield(this.document);
  }

  /** The Lower button ends the shield's cover. */
  static async #onLowerShield(event, button) {
    await lowerShield(this.document);
  }

  /** The fire button uses the power. */
  static async #onUsePower(event, button) {
    const item = this.#itemFor(button);
    if (item) await usePower(this.document, item);
  }

  /** The wand button casts the spell. */
  static async #onCastSpell(event, button) {
    const item = this.#itemFor(button);
    if (item) await castSpell(this.document, item);
  }

  /** The Sustain button keeps a Sustained power going (one action in combat). */
  static async #onSustainPower(event, button) {
    const item = this.#itemFor(button);
    if (item) await sustainPower(this.document, item);
  }

  /** The End button stops sustaining a power. */
  static async #onEndPower(event, button) {
    const item = this.#itemFor(button);
    if (item) await endPower(this.document, item);
  }

  /** The item a button in the inventory belongs to. */
  #itemFor(element) {
    return this.document.items.get(element.closest("[data-item-id]")?.dataset.itemId);
  }

  /** Clicking an ability name opens the test dialog for that ability, with Fortune buttons on its card. */
  static async #onRollAbility(event, button) {
    await rollAbilityTest(this.document, button.dataset.ability, { fortune: true });
  }

  /** The Contested test button opens the contest dialog. */
  static async #onRollContest(event, button) {
    await rollContestedTest(this.document);
  }

  /** The Chance Die button rolls 2d6 + Fortune straight away. */
  static async #onRollChance(event, button) {
    await rollChanceDie(this.document);
  }

  /** The Panic button tests Sanity DR12 and rolls on the Panic table if needed. */
  static async #onRollPanic(event, button) {
    await rollPanicTest(this.document);
  }
}
