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

## Working rules for the build

- **Rules maths lives apart from Foundry.** Every calculation (test results,
  Boon and Bane, DRs, armour soak, carrying, pools, persistent damage,
  Death's Door) goes in plain files under `module/rules/`. These files know
  nothing about Foundry, so they can be tested on their own.
- **Automated tests.** Each rules file has a test file in `tests/`, run with
  Node's built-in test runner (Node is already installed, so no new
  packages):

  ```bash
  node --test tests/
  ```

  A step that adds or changes maths adds its tests in the same step, and all
  tests must pass before you commit.
- **Example content is saved, not retyped.** Every example used to test a
  step (the Warrior, the Ash-Choked Bellman, a dagger and so on) is saved
  once as a JSON file in `content/examples/`. A GM-only **Import examples**
  button creates or updates them in the world. The same files feed the
  automated tests. Example text is taken from our own rules document.
- **Milestones.** Steps are grouped into milestones. At the end of each
  milestone the game can do something whole that you can play-test, and we
  stop to review before going on.
- **Nothing is used before it exists.** A step only relies on earlier steps.
  Where a rule points ahead (for example a result that says "test Panic"),
  the chat card shows the instruction as text until the feature arrives.

---

## Milestone 1: A character can roll a test

1. ~~**System skeleton.**~~ Done: `system.json`, start-up script, language
   file, empty stylesheet.

2. ~~**Test harness.**~~ Done: `module/rules/ability-score.mjs` (the
   Ability Score Table: roll sum → −3 … +3) and `tests/ability-score.test.mjs`.
   *Test:* run `node --test tests/` and see every test pass. Foundry still
   loads with no errors.

3. ~~**Character data and sheet.**~~ Done: `module/data/character.mjs`
   (five abilities limited to −3 … +6, HP, wounds, Fortune, silver, story
   fields), `module/sheets/character-sheet.mjs` (first ApplicationV2 sheet),
   and `module/rules/abilities.mjs` and `module/rules/health.mjs` with tests.
   HP is capped at max HP (GAPS 44).
   *Test:* create a character, fill in values, then close and reopen it. The
   values are kept. An ability cannot go above +6 or below −3. HP cannot go
   above max HP.

4. ~~**Example importer.**~~ Done: `content/examples/` (with `index.json`
   listing the files), `module/examples.mjs` and a GM-only **Import
   examples** button in the game settings. The first example is a plain
   character, "Example Hero" (all abilities 0, HP 10, max wounds 3,
   Fortune 2), checked by `tests/examples.test.mjs`.
   *Test:* press the button and Example Hero appears. Press it again and
   it is updated, not duplicated.

5. ~~**Test maths.**~~ Done: `module/rules/test-roll.mjs` and
   `tests/test-roll.test.mjs`. In `module/rules/`, with tests: d20 + ability against
   DR 6–26. Triumph means beating the DR by 10 or more, Success means meeting
   it, Failure means missing it, and Ruin means missing by 10 or more. A
   natural 20 moves the result one tier up and a natural 1 one tier down. Boon
   and Bane mean 2d20 keeping the higher or lower die, any Boon with any Bane
   gives a plain roll, and the kept die decides a natural 20 or 1. Aid from
   allies counts +1 per success and −1 per failure, from −2 to +2.
   *Test:* `node --test tests/` passes. There is nothing new in Foundry yet.

6. ~~**Ability test in Foundry.**~~ Done: `module/dice/ability-test.mjs`,
   `templates/dice/ability-test-dialog.hbs`, `templates/chat/test-card.hbs`,
   and the DR table and dice formula added to `module/rules/test-roll.mjs`
   with tests. Click an ability to open a dialog (DR,
   default 12; Boon; Bane; aid) and get a chat card with the dice, the total
   and the tier.
   *Test:* roll Example Hero's Strength with Boon. The card shows two d20s,
   keeps the higher and names the tier. Check one roll by hand.

7. ~~**Contested test and chance die.**~~ Done: `module/rules/contested.mjs`,
   `module/rules/chance-die.mjs` and their dice and cards. These go into the rules files with
   tests. Contested: the higher total wins, a natural 20 counts +5, a natural
   1 counts −5, and a tie has no victor. Chance die: 2d6 + Fortune, where 2–5
   is negative, 6–9 neutral and 10+ positive. Both get buttons on the sheet.
   *Test:* tests pass, and both buttons post correct cards.

**Milestone 1 review:** play-test a few tests and check them against
rules 3.2–3.3.

## Milestone 2: An equipped character

8. ~~**Weapons, armour and shields.**~~ Done: `module/data/equipment.mjs`,
   `module/sheets/item-sheet.mjs`, `templates/item/`, `module/rules/equipment.mjs`
   with `tests/equipment.test.mjs`, seven examples in `content/examples/items/`
   and an Equipment section on the character sheet. Item data and sheets. Weapon: damage,
   kind (melee, shoot or throw), traits, reload, expendable die,
   suggested damage type. Armour: current tier, original tier, metal
   (true by default for tier 2 and up). Shield: light or heavy.
   *Examples:* dagger, flintlock pistol, greatsword, leather armour, chain
   shirt, breastplate, light shield.
   *Test:* import the examples, drag them onto Example Hero and equip the
   breastplate.

9. ~~**Gear, containers and carrying.**~~ Done: gear and container data and
   sheets in `module/data/equipment.mjs` and `module/sheets/item-sheet.mjs`,
   `module/rules/carrying.mjs` with `tests/carrying.test.mjs`, five examples,
   and Character and Inventory tabs on the character sheet. A "cumbersome"
   box on every carried item (the rules' heavy items, GAPS 48) and a
   "Stored in" choice per item. Gear and container items and an inventory
   tab. The carrying maths, with tests: the cumbersome limit is Toughness
   (minimum 1). Above it you are Encumbered. Above twice the limit
   your movement is 0.
   *Examples:* rope, torch, healing potion, medicine box, satchel.
   *Test:* tests pass. Mark items cumbersome until the sheet shows Encumbered,
   then movement 0.

10. ~~**Armour and Encumbered on tests.**~~ Done: `module/rules/test-modifiers.mjs`
    with `tests/test-modifiers.test.mjs`, wired into the ability test and
    contested test. The penalty follows the original tier (rules 3.8,
    "Damaged armour retains its penalties"), and GAPS 49–51.
    The rule, with tests: armour adds to
    Agility test DRs (tier 1 +0, tier 2 +2, tier 3 +4, tier 4 +6).
    Encumbered gives Bane on Strength and Agility tests. With several
    armours equipped, only the highest current tier counts (GAPS 46).
    *Test:* with the breastplate equipped, an Agility test card lists +4 DR.
    Become Encumbered and a Strength test shows Bane.

11. ~~**Expendable dice and reloading (by hand).**~~ Done:
    `module/rules/expendable.mjs` with `tests/expendable.test.mjs`,
    `module/dice/expendable.mjs`, two chat cards, and Expendable, Fire and
    Reload buttons in the Inventory tab (GAPS 52, 53). An **Expendable** button
    rolls the item's die and uses the item up on a 1. A weapon with reload
    tracks loaded or empty. Reloading spends its listed number of Interact
    actions (counted on the card for now).
    *Test:* use the healing potion (d2) until it runs out. Fire the pistol,
    then reload it (2 actions).

**Milestone 2 review:** kit out Example Hero from rules 2.6 and check the
prices, traits and tiers against 4.1.

## Milestone 3: The first fight (one PC against one foe)

12. ~~**Foe actor and feats.**~~ Done: `module/data/foe.mjs`,
    `module/data/feat.mjs`, `module/sheets/foe-sheet.mjs`, a feat sheet,
    `module/rules/foe.mjs` and `module/rules/feats.mjs` with
    `tests/foe.test.mjs`, a Feats list on the character sheet, and the
    Bellman in `content/examples/actors/` with its attack and passive inside
    it (the importer now brings an actor's own items). A mook shows 1 HP.
    Foe attacks show only melee/ranged, damage and reach or range, and
    foe armour has a name (GAPS 56–59). Foe data (tier, category, HP, Morale 2–11 or
    "–", armour die none/d2/d4/d6/d8, mook flag, initiative bonus) and
    sheet. A basic **feat** item (source, description, "gained through
    Improving" flag), used here for passives. Foe attacks are weapon items.
    *Example:* the Ash-Choked Bellman (HP 15, Morale 7, −d2), without its
    gloom ability for now.
    *Test:* import the Bellman. Its sheet shows its HP, armour, attack and
    passive.

13. **Initiative and turns.** PCs roll d6 + Agility, foes d6 + their bonus.
    Ties: PCs go first, then random among equals (tested). Each turn shows 3
    action pips and 1 reaction pip that reset at the start of the turn.
    *Test:* start combat with Example Hero and the Bellman. Check the order
    and that the pips reset each turn.

14. **Attack.** Rule, with tests: melee uses Strength, shoot Presence and
    throw Agility, at DR12. Heavy adds +2 DR. Versatile used one-handed adds
    +2 DR. Ranged beyond its range and thrown beyond its listed distance give
    Bane. Finesse lets you choose Agility or Strength. From the second attack
    in a turn you attack with Bane (with an agile weapon, from the third).
    Reactions count only on your own turn. Damage is rolled; a Triumph
    doubles it and steps the foe's armour die down one.
    *Test:* tests pass. Attack the Bellman twice in a turn and the second
    attack has Bane. A Triumph takes its armour from d2 to none.

15. **Attack Ruin and Recover.** A Ruin gives Bane on attacks until you
    press **Recover**, which spends one action.
    *Test:* force a Ruin. Attacks show Bane, then press Recover and one
    action pip is used.

16. **Defence and taking damage.** Rule, with tests: defence is Agility
    DR12. Tier 3 and 4 armour add +2 DR to defence; lower tiers add nothing.
    The armour soak die is subtracted from damage (t1 d2, t2 d4, t3 d6, t4
    d8), minimum 1 damage. Raising a shield (◈) gives light or heavy cover
    (−2 or −4 DR to defend) until your next turn. With several armours
    or shields equipped, only the strongest counts (GAPS 46). On a
    Ruin the damage is doubled and the armour drops one tier, and armour
    below tier 1 is destroyed. A **Take damage** button applies it to HP.
    *Test:* tests pass. The Bellman attacks, Example Hero defends and HP
    falls by the damage minus the soak roll.

17. **Damaging foes and Morale.** An **Inflict damage** button on attack
    cards subtracts the foe's armour die (minimum 1). A **Morale** button
    rolls 2d6; above the foe's Morale it is demoralised, then d6: 1–3 flees,
    4–6 surrenders. A foe with Morale "–" never rolls.
    *Test:* hit the Bellman until it is at a third of its HP, then roll
    Morale.

18. **Conditions.** Every 3.13 condition as a status effect with its PC
    effect and its **Foe** line, applied to tests where a computer can (Bane,
    DR changes, lost actions or reactions). A rule tested for each condition
    that changes numbers.
    *Test:* make Example Hero Prone. An attack shows +2 DR and a melee
    defence +2 DR. Make the Bellman Prone and melee attacks against it show
    −2 DR.

19. **Persistent damage.** One effect per damage type. Of the same type,
    only the one with the highest average damage applies (tested: 2d4 beats
    d6). It deals damage at the end of the turn. A PC tests Toughness DR12
    to end each one. For a foe the GM rolls a d20 and it ends on 12+.
    *Test:* tests pass. Give Example Hero two fire effects and one poison,
    end the turn, and check that one fire and the poison tick.

20. **Panic.** A Panic test (Sanity DR12). Triumph restores any Sanity lost
    for a while, Failure rolls 1d10 on the Panic table and Ruin rolls 2d10.
    The timed results become effects (for example Sluggish means 2 actions).
    *Test:* force a Ruin and get a 2d10 Panic result. A Sluggish character
    starts its turn with two action pips.

21. **Wounds and the Table of Agony.** At 0 HP: gain a wound and test
    Toughness DR12 (the GM can change it). On a failure the GM picks the
    damage type (the weapon suggests one) and rolls d10. The bands are 1
    flesh, 2–5 minor, 6–7 major, 8–9 lethal and 10 fatal. HP returns to max
    and leftover damage is ignored.
    *Test:* drop Example Hero to 0 HP. You see a wound, a test, an Agony
    result and full HP.

22. **Death's Door and Dark Vessel.** At max wounds and 0 HP, roll 2d6 on
    the table. Row 2 is Sanity DR10 + 1 per feat gained through Improving
    (tested). Rows 9–10 roll d10 for the lost body part (GAPS 36). Dark
    Vessel: d8 HP, attack −2 DR, defend +2 DR. A second Dark Vessel before a
    Long Rest kills. Until resting exists, the GM clears the count by hand.
    Any damage at Death's Door kills.
    *Test:* tests pass. Push Example Hero past max wounds and check each
    table row with forced rolls.

23. **Ammunition after combat.** When combat ends, the system asks for an
    expendable roll for each ranged weapon fired during that combat.
    *Test:* fire the pistol in combat, end combat, and a roll prompt
    appears.

**Milestone 3 review:** run a full fight, Example Hero against the Bellman,
from initiative to Morale.

## Milestone 4: Character building

24. **Class, ancestry and background.** Item data and sheets. Dropping a
    class sets the boosted ability (+1, after the table) and HP (X +
    Toughness, fixed at creation), and records max wounds, the spell list and
    the starting armour/weapon die. Its boosted ability is the key ability
    for powers. A background rolls wealth (for example 2d6 × 10 s).
    *Examples:* Warrior, Wizard, Human, Butcher.
    *Test:* drop the Warrior on a new character. Strength goes up 1, HP is
    10 + Toughness and max wounds is 3.

25. **Fortune.** Start with d3 Fortune, with no cap. Spend buttons on cards:
    Triumph → Success or Ruin → Failure, maximum damage, reroll, −d6 damage
    taken, and Boon or Bane before rolling (in the test dialog). You can
    spend several at once.
    *Test:* reroll a failed test with Fortune. The count drops by 1.

**Milestone 4 review:** build the example Warrior and Wizard by hand from
rules 2.1 and compare them with the sheet.

## Milestone 5: Ember, Gloom and magic

26. **Ember and Gloom pools.** A shared panel. Rule, with tests: at the start
    of each round the pool fills to round × 5 (5, 10, 15…). What isn't spent
    is lost at the end of the round, and both pools empty when combat ends.
    Players spend Ember through the GM (sockets).
    *Test:* tests pass. Run three rounds and see 5, 10 and 15, then an empty
    pool after combat.

27. **Powers in combat.** Power item (cost, actions, source, sustained,
    damage, outcome texts). Rule, with tests: DR 11 + listed cost, tested
    with the key ability. A power that is an attack uses that attack's
    ability, and it counts towards the multiple-attack Bane. Failure deals
    half damage (rounded down) and nothing else. **Sustain** spends one
    action each turn.
    *Example:* Power strike (🟒1 ◈◈).
    *Test:* tests pass. Use Power strike on the Bellman: it is DR12, Ember
    drops by 1 and two action pips are used.

28. **Ember abilities outside combat.** With no combat running, each ember
    ability (cantrips included) works once without spending Ember. It unlocks
    after a combat or a rest, or when the GM presses **Reset ember
    abilities**.
    *Test:* use Power strike twice outside combat. The second use is blocked
    until you press reset.

29. **Gloom abilities.** A power with resource Gloom on foes. It posts a
    card with a button for each target. By default that is Agility DR12
    defence (Triumph no effect, Success half, Failure full, Ruin double);
    otherwise it is the ability's own test with its Failure and Ruin text.
    *Example:* the Bellman's Toll for the Departed (☾3, Presence DR12).
    *Test:* the Bellman uses Toll. Example Hero tests Presence and on a
    Failure takes d6 and becomes Deafened.

30. **Spells.** Spell item. Rule, with tests: Sanity against DR 11 + cost.
    Bane for another spell list, for tier 2+ metal armour and for "foe in
    melee range". −2 DR for 1 minute of casting. Boon for 1 hour or for
    several casters. Boon and Bane cancel as in step 5.
    *Example:* And They Spoke of Fire (🟒3 ◈◈).
    *Test:* tests pass. Cast it in the chain shirt: DR14 with Bane.

31. **Shadowblight, life force and scrolls.** A Ruin on a spell rolls d20 on
    Shadowblight. Life force: test Toughness instead, take the chosen wounds
    (each tests Toughness, HP unchanged) and lower the DR by d4 per wound,
    never below 6 (tested). Scrolls cast without Ember and without the
    other-list Bane, and are destroyed either way.
    *Example:* a scroll of And They Spoke of Fire.
    *Test:* tests pass. Cast from the scroll: no Ember spent, and the scroll
    is gone.

**Milestone 5 review:** a fight with Ember and Gloom on both sides, with a
Warrior and a Wizard against the Bellman.

## Milestone 6: Time and rest

32. **Days.** A day counter and a **New day** button. At each new day:
    Doomed characters gain a wound, and a character without food for more
    than 2 days takes d6 damage.
    *Test:* make Example Hero Doomed and press New day. A wound is added.

33. **Resting.** Short rest heals to full HP. Long rest heals HP and one
    wound, starts a new day and resets the Dark Vessel count. Downtime heals
    everything except Doomed and conditions that name their own cure. Any
    rest unlocks ember abilities. An interrupted rest is a Toughness DR12
    test. Not sleeping adds a level of Fatigued, and a Long Rest removes one.
    Fortune regains d3 only when it is 0. Infected and Doomed characters get
    no benefit, and Infected ones take d6.
    *Test:* rest an Infected character. No healing, d6 damage.

34. **Medicine box.** Using it costs one action. The character tests
    Toughness DR12 to remove Infected, and the box's expendable die is rolled
    either way.
    *Test:* use the medicine box example on an Infected character.

35. **Light timer.** A real-time countdown that pauses with the game. Other
    lights lit while it runs join it. A lantern uses one hour of oil at a
    time.
    *Test:* light a torch (1 hour), pause the game and see the timer stop.

**Milestone 6 review:** play a short trip with rests, days and torches.

## Milestone 7: Minions, relics and vehicles

36. **Minions.** Minion actor (HP, Morale, armour, owner). It tests at +0,
    has 2 actions and 0 reactions, acts on its owner's initiative right
    after them, and the limit is Presence (minimum 1). There is a "Command a
    minion" action (◈).
    *Example:* a small vicious dog (Pitiful minion: HP 5, Morale 6, d4).
    *Test:* in combat the dog sits right after its owner and acts when
    commanded.

37. **Relics.** Relic item: use it (then roll the expendable d20, or daily
    for always-on relics), its Last Rite (always works and destroys the
    relic), and its "if lost" drawback shown when it is destroyed.
    *Example:* Shard of the Great Brazier (+3 to the Ember pool).
    *Test:* use the Shard. The pool goes up by 3 and the d20 is rolled.

38. **Vehicles.** Vehicle actor (HP, armour, three speeds, crew, passengers,
    fuel). Driving tests by speed and situation (Agility DR10, 12 or 14).
    Collision damage (1d6, 3d6 or 5d6) applies to the driver and passengers,
    after armour.
    *Example:* steam wagon.
    *Test:* drive fast and force a Ruin. The occupants take 5d6 minus their
    armour.

## Milestone 8: Growth and content

39. **Improving.** A button that runs rules 2.8. Each ability rolls d6: on a
    1 or below the ability it goes down 1, otherwise up 1 (−3 … +6). Choose a
    feat (marked "gained through Improving"). Roll 6d10, and if it is at
    least your max HP, max HP goes up d6. Then roll the d6 find table.
    Tested.
    *Test:* tests pass. Improve the example Warrior and check each step.

40. **Character creation helper.** Optional guided creation: the ability
    method, ancestry feat, background, class, and starting equipment by the
    class die.
    *Test:* make a character with the helper and check it against 2.1.

41. **Compendium packs.** Turn `content/` into real compendiums that ship
    with the system. Building packs from JSON files needs Foundry's official
    command-line tool (an npm package), so **I will ask before installing
    it**.
    *Test:* the compendiums appear in a new world and their entries work.

42. **Full content.** Enter all classes, ancestries, backgrounds, feats,
    gear, spells, relics, tables and foes from the rules into `content/`, a
    few files per step.
    *Test:* spot-check entries against the rules.
