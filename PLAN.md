# VÅR BORG build plan

Foundry VTT v14 only. TypeDataModel for data, ApplicationV2 for every sheet
and dialog, all visible text in `lang/en.json`. Rules authority:
`_reference/AI_BRIDGE_-_VÅR_BORG.md`, with the rulings in `GAPS.md`.

Each step is small and ends with a test you can do in Foundry. After each
working step, commit with Git.

## Design summary

- **Actor types:** character, foe, minion, vehicle.
- **Item types:** weapon, armour, shield, gear, container, ancestry,
  background, class, feat, power, spell, scroll, relic.
- **Shared state (world settings, one table panel):** Ember pool, Gloom pool,
  day counter, light timer, GM reset button for ember abilities.
- **Conditions:** Foundry status effects (only those in rules 3.13).
  Persistent damage is one effect per damage type.
- **From Pirate Borg (code ideas only, credited in THIRD_PARTY_NOTICES.md):**
  defence rolled by players, armour soak dice, DR modifiers from gear,
  reloading, morale, initiative, rest dialog, chat-card buttons, sockets,
  token HUD statuses.

## Foundations

1. **System skeleton.** `system.json` (id `var-borg`, title VÅR BORG, v14
   only), an empty start-up script, `lang/en.json`, an empty stylesheet.
   *Test:* VÅR BORG appears in Game Systems. Create a world with it and it
   loads with no errors in the console (F12).

2. **Character data and sheet.** Character TypeDataModel (five abilities,
   HP, wounds, Fortune, silver, story fields) and a first ApplicationV2 sheet.
   *Test:* create a character, type in abilities and HP, close and reopen.
   The values are kept. An ability can't be set above +6 or below −3.

3. **Ability test.** Click an ability → dialog (DR 6–26, default 12) →
   d20 + ability → chat card showing Triumph, Success, Failure or Ruin, with
   natural 20 and natural 1 moving the result one tier.
   *Test:* roll a few times. Check the card's maths and the tier by hand.
   Use the console to force a natural 20 and a natural 1.

4. **Boon, Bane and aid.** The test dialog gets Boon and Bane toggles
   (2d20 keep highest or lowest, and they cancel) and an "allies aiding"
   modifier (−2 to +2).
   *Test:* roll with Boon and check that the card shows two dice and keeps
   the higher. Boon + Bane rolls one die.

5. **Contested test and chance die.** Contested roll (natural 20 = +5,
   natural 1 = −5, a tie means no victor). Chance die: 2d6 + Fortune →
   negative, neutral or positive.
   *Test:* run both from the sheet and check the results against the rules.

## Equipment

6. **Gear items.** Data and item sheets for weapon, armour, shield, gear and
   container. An inventory tab on the character with equip and carry
   toggles. Heavy-item limit = Toughness (minimum 1). Above it you are
   Encumbered; above twice the limit, movement is 0.
   *Test:* create items, drag them onto a character, equip armour, and mark
   items heavy until the sheet shows Encumbered.

7. **Armour effects on tests.** The armour tier adds to Agility test DRs
   (+2, +4 or +6), and Encumbered gives Bane on Strength and Agility.
   *Test:* equip a breastplate and roll Agility. The card lists +4 DR.

8. **Expendable dice and reload.** An "Expendable" button rolls the item's
   die and uses it up on a 1. Weapons with reload track whether they are
   loaded, and reloading takes the listed number of Interact actions.
   *Test:* use a healing potion until it runs out. Fire a pistol, then
   reload it.

## Combat

9. **Attack.** Melee (Strength), shoot (Presence) or throw (Agility) at
   DR12. Weapon traits (finesse, heavy, versatile one-handed, ranged beyond
   range). The multiple-attack Bane counter per turn, which starts later for
   agile weapons. Damage roll; Triumph doubles it. Ruin sets "Bane on
   attacks" with a **Recover** button.
   *Test:* attack twice in one turn. The second attack shows Bane, or the
   third with a dagger. Force a Ruin, then press Recover.

10. **Defence and taking damage.** A "Defend" button (Agility DR12, plus the
    armour defence penalty, and Warrior Armour mastery later). The chat card
    gets a "Take damage" button: armour soak die, minimum 1 damage, and
    Ruin = double damage and armour drops a tier.
    *Test:* defend, take a hit and check that HP falls by the damage minus
    the armour roll. On a Ruin the armour tier goes down.

11. **Wounds and the Table of Agony.** At 0 HP: gain a wound, Toughness test
    at DR12 (the GM can change it). On a failure the GM picks the column
    (weapons suggest one) and d10 is rolled on the table. HP resets to max
    and leftover damage is ignored.
    *Test:* drop a character to 0 HP. You get a wound, a test, an Agony
    result and full HP.

12. **Death's Door and Dark Vessel.** At max wounds and 0 HP: roll 2d6 on
    the Death's Door table. Row 2 uses DR10 + feats gained through Improving.
    Dark Vessel applies (d8 HP, attack −2 DR, defend +2 DR). A second Dark
    Vessel before a Long Rest kills. Any damage while at Death's Door kills.
    *Test:* push a character past max wounds and check each table result.

13. **Conditions.** All 3.13 conditions become status effects with their
    rules applied to tests where a computer can (Bane, DR changes, actions).
    Persistent damage: one per type, the strongest of a type, damage at the
    end of the turn, and a Toughness DR12 test to end each one.
    *Test:* apply Prone and roll an attack (+2 DR). Apply two persistent fire
    and one poison, end the turn, and check that one fire and the poison
    tick.

14. **Foe actor.** Foe data (tier, category, HP, Morale, armour die, mook
    flag, initiative bonus) and sheet. Attacks are weapon items, passives
    are feat items. Attack Triumph steps the foe's armour die down. A Morale
    button (2d6 against Morale, then flee or surrender). Foe conditions use
    their **Foe** lines.
    *Test:* make the Ash-Choked Bellman example, attack it with a Triumph
    and see its armour drop from d2 to none. Roll Morale.

15. **Initiative and turns.** PCs roll d6 + Agility, foes d6 + their bonus.
    A per-turn tracker for 3 actions and 1 reaction (Slowed, Quickened and
    the Panic results change it). The multiple-attack counter resets each
    turn.
    *Test:* start combat with two PCs and a foe. Check the order and that the
    action pips reset each turn.

## Ember, Gloom and powers

16. **Ember and Gloom pools.** A shared panel that fills to round × 5 at the
    start of each round, empties at the end of the round and when combat
    ends. Players spend from Ember through the GM (sockets).
    *Test:* run three rounds. The pool shows 5, 10, 15 and is empty after
    combat. A player can spend from it.

17. **Powers.** Power item (cost, actions, source, sustained, damage,
    outcome texts). Test with the class key ability (the boosted ability)
    against DR 11 + cost. Power attacks use the attack's ability. Failure
    deals half damage. Outside combat: once per ability until combat, rest
    or the GM's reset button.
    *Test:* use Power strike in combat (DR12, Ember drops by 1). Outside
    combat it works once, then stays locked until you press reset.

18. **Gloom abilities.** The same power item with resource Gloom on foes.
    Using one posts a card with a "Defend" button for each targeted PC:
    Agility DR12 with the gloom-defence outcomes, or the ability's own test
    and its Failure/Ruin text.
    *Test:* the Bellman uses Toll for the Departed. A PC defends and takes
    the right damage.

## Character building

19. **Ancestry, background, class and feats.** Dropping a class sets the
    boosted ability (+1), HP (X + Toughness, fixed), max wounds and spell
    list. A background rolls wealth. Feats track their source and whether
    they were gained through Improving.
    *Test:* drop a Warrior on a new character. Strength goes up by 1, HP is
    10 + Toughness and max wounds is 3.

20. **Spells and scrolls.** Spell item. Sanity test at DR 11 + cost. Bane
    for another spell list, metal armour (t2 and up unless marked not metal)
    and a "foe in melee" toggle. −2 DR for 1 minute, Boon for 1 hour or for
    several casters. Life force (Toughness, one d4 per wound, DR at least 6).
    Ruin rolls on Shadowblight. Scrolls cast without ember and without the
    other-list Bane, then are destroyed.
    *Test:* cast And They Spoke of Fire in a chain shirt (Bane), then from a
    scroll (no ember, scroll gone).

21. **Fortune.** Starts at d3, no cap. Spend buttons on chat cards: shift
    Triumph or Ruin, maximum damage, reroll, −d6 damage taken, Boon or Bane
    before rolling.
    *Test:* spend Fortune to reroll a failed test. The count drops by 1.

22. **Panic.** Panic test (Sanity DR12). Failure rolls 1d10 and Ruin 2d10 on
    the Panic table, with the timed results applied as effects.
    *Test:* force a Ruin and check that a 2d10 Panic result appears.

## Time and resting

23. **Days and resting.** Day counter and "New day" button. Short rest, Long
    rest (it also starts a new day) and Downtime. Interrupted rest is a
    Toughness DR12 test. Fatigued for no sleep. Starvation, Infected and
    Doomed are applied. Fortune regains d3 only when it is 0. The Dark
    Vessel count resets.
    *Test:* make a Doomed character take a Long Rest. It gains no healing
    and gets a wound at the new day.

24. **Light timer.** Real-time countdown for lit light sources. Extra lights
    join the running timer. The GM can start, stop and restart it.
    *Test:* light a torch (1 hour). The timer counts down and warns when the
    light runs out.

## The rest

25. **Minions.** Minion actor (HP, Morale, armour, owner). It tests at +0,
    has 2 actions and 0 reactions, acts on its owner's initiative right
    after them, and the limit is Presence (minimum 1). There's a "Command a
    minion" action.
    *Test:* give a PC a small dog minion. In combat it sits right after its
    owner.

26. **Relics.** Relic item: use (then roll expendable d20), daily roll for
    always-on relics, Last Rite (always works, destroys it), and "if lost"
    text shown when it is destroyed.
    *Test:* use a relic until a 1 comes up. It is marked destroyed and its
    drawback is shown.

27. **Vehicles.** Vehicle actor (HP, armour, speeds, crew, passengers,
    fuel). Driving tests by speed. Collision damage to the driver and
    passengers, with armour applying.
    *Test:* make a steam wagon, drive it fast and fail. The occupants take
    collision damage minus their armour.

28. **Improving.** A button that rolls each ability (d6), adds a feat,
    rolls 6d10 for more HP and rolls the "you find…" d6.
    *Test:* improve a character and check every step against rules 2.8.

29. **Character creation helper.** Optional guided creation: ability
    method, ancestry, background, class, starting equipment by the class
    die.
    *Test:* make a full character with the helper and check it against 2.1.

30. **Compendiums.** VÅR BORG content entered from the rules (our own text
    only): classes, ancestries, feats, gear, spells, relics, tables and
    foes.
    *Test:* open each compendium, drag an entry onto a sheet and check that
    it works.
