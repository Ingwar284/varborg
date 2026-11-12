/**
 * Data for a foe (actor type "foe"). A foe's attacks are weapon items and
 * its passives are feat items, both kept on the foe.
 *
 * Rules: 6. Designing Foes (tier, category, HP, Morale, armour, mooks),
 * 3.4 Violence (initiative bonus), GAPS 11, 12 and 44.
 * Foes have HP only: no abilities, wounds or Fortune. They never roll
 * on the wound table (rules 6, "Set its statistics").
 */

import {
  FOE_TIERS, FOE_CATEGORIES, FOE_ARMOUR_DICE, MORALE_MIN, MORALE_MAX, foeMaxHp
} from "../rules/foe.mjs";
import { capHp } from "../rules/health.mjs";
import { missingTokenDefaults } from "../rules/tokens.mjs";
import { collectEffects } from "../rules/item-effects.mjs";
import { heldBackByDamage } from "../rules/foe-hooks.mjs";

/** Passes "stayed at 1 HP instead" from _preUpdate to _onUpdate (step 52f). */
const STAYED_OPTION = "varBorgFoeStayed";
/** The item flag that marks a "first time it would drop to 0 HP" passive as used. */
const STAYED_FLAG = "droppedToOne";

/** Passes "dropped to 0 HP" from _preUpdate to _onUpdate (step 52b). */
const FELL_OPTION = "varBorgFoeFell";

const { SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

/** A whole number that can never go below `min`. */
function wholeNumber({ min = 0, max, initial = 0 } = {}) {
  return new NumberField({ required: true, nullable: false, integer: true, min, max, initial });
}

/** A text field that must be one of `choices`. */
function choice(choices, initial = choices[0]) {
  return new StringField({ required: true, blank: choices.includes(""), choices, initial });
}

/** Turn a list of keys into { key: "VARBORG.<prefix>.<key>" } for selects. */
function labels(keys, prefix) {
  return Object.fromEntries(keys.map(key => [key, `VARBORG.${prefix}.${key || "none"}`]));
}

export default class FoeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      tier: choice(FOE_TIERS, "weak"),
      category: choice(FOE_CATEGORIES, ""),
      description: new StringField({ required: true, initial: "" }),
      hp: new SchemaField({
        value: wholeNumber(),
        max: wholeNumber()
      }),
      // 2 … 11, or null for Morale "–" (never rolls Morale).
      morale: new NumberField({ required: true, nullable: true, integer: true, min: MORALE_MIN, max: MORALE_MAX, initial: 6 }),
      // Subtracted from damage that hits the foe. "" means none.
      armour: choice(FOE_ARMOUR_DICE, ""),
      // What the armour is, such as "Rusted mail". Text only.
      armourName: new StringField({ required: true, blank: true, initial: "" }),
      // Added to the foe's d6 initiative roll. It comes from the foe's
      // passives (GAPS 11), so the Dark Master types it in.
      initiative: new NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      // A mook has 1 HP, fails every test and never rolls Morale.
      mook: new BooleanField({ initial: false }),
      // Levels of the Fatigued condition, no maximum (rules 3.13, GAPS 20).
      fatigue: wholeNumber(),
      // Feet per Move action for each way of moving (rules 3.7). A blank
      // fly, swim or climb speed means it cannot move that way.
      movement: new SchemaField({
        walk: wholeNumber({ initial: 20 }),
        fly: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
        swim: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
        climb: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null })
      })
    };
  }

  static TIERS = labels(FOE_TIERS, "Foe.Tier");
  static CATEGORIES = labels(FOE_CATEGORIES, "Foe.Category");
  static ARMOUR_DICE = labels(FOE_ARMOUR_DICE, "Foe.Armour");

  /** A mook has 1 HP, whatever max HP is written for it. */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.hp.max = foeMaxHp(this.hp.max, this.mook);
    this.hp.value = capHp(this.hp.value, this.hp.max);
  }

  /**
   * On creation, HP can never start above max HP (GAPS 44), and the foe's
   * tokens get their defaults (module/rules/tokens.mjs): not linked,
   * hostile, name and HP bar on hover.
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const capped = capHp(this.hp.value, this.hp.max);
    if (capped !== this.hp.value) this.parent.updateSource({ "system.hp.value": capped });
    this.parent.updateSource(missingTokenDefaults("foe", data));
  }

  /**
   * When HP or max HP changes, keep HP at or below max HP (GAPS 44).
   * For a mook, max HP counts as 1.
   */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const hp = changes.system?.hp;
    if (!hp || !("value" in hp || "max" in hp)) return;
    const mook = changes.system.mook ?? this.mook;
    const max = foeMaxHp(hp.max ?? this._source.hp.max, mook);
    hp.value = capHp(hp.value ?? this._source.hp.value, max);
    if (hp.value === 0 && this.hp.value > 0) {
      // The first time it would drop to 0 HP, it stays at 1 HP (Abandon
      // Shell: step 52f, GAPS 250), and may lose its armour.
      const stay = collectEffects(this.parent?.items ?? [])
        .find(effect => effect.kind === "hook" && effect.event === "zeroHp" && effect.action === "dropToOne"
          && !this.parent.items.get(effect.itemId)?.getFlag("var-borg", STAYED_FLAG)
          // Undying (step 52h): not from fire, nor from an attack's Triumph.
          && !heldBackByDamage(effect, [options.varBorgHit?.damageType].filter(Boolean))
          && !(effect.requires === "notTriumph" && options.varBorgHit?.triumph));
      if (stay) {
        hp.value = 1;
        if (stay.loseArmour) changes.system.armour = "";
        options[STAYED_OPTION] = { itemId: stay.itemId, item: stay.item, note: stay.note, loseArmour: Boolean(stay.loseArmour) };
        return;
      }
      options[FELL_OPTION] = true;
    }
  }

  /**
   * At 0 HP, the foe's passives that act then (Dust, Pressurised: step
   * 52b, GAPS 241), on the client that made the change.
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user.id) return;
    const stayed = options[STAYED_OPTION];
    if (stayed) {
      this.parent.items.get(stayed.itemId)?.setFlag("var-borg", STAYED_FLAG, true);
      const i18n = game.i18n;
      const lines = [
        i18n.format("VARBORG.Effects.DroppedToOne", { item: stayed.item, name: this.parent.name }),
        stayed.loseArmour ? i18n.format("VARBORG.Effects.ArmourLost", { name: this.parent.name }) : null,
        stayed.note || null
      ].filter(Boolean);
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.parent }),
        content: `<div class="var-borg-card">${lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("")}</div>`
      });
      return;
    }
    if (!options[FELL_OPTION]) return;
    import("../effects.mjs").then(({ runItemHooks }) => runItemHooks(this.parent, "zeroHp"));
  }
}
