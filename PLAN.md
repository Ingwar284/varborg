# VÅR BORG build plan

Foundry VTT v14 only. TypeDataModel for data, ApplicationV2 for every sheet
and dialog, all visible text in `lang/en.json`. Rules authority:
`_reference/AI BRIDGE - VÅR BORG.md`, with the rulings in `GAPS.md`, which
win where the two disagree (see CLAUDE.md).

Each step is small and ends with a test you can do in Foundry. After each
working step, commit with Git.

Milestones 1 to 13 below are the original plan. Work done after it, mostly
from playtest feedback, is listed at the end under "Built after the plan".

## Design summary

- **Actor types:** character, foe, minion, vehicle, chest (treasure that
  holds items and silver on the scene).
- **Tokens** (`module/rules/tokens.mjs`): every name shows on hover to
  anyone. Characters are friendly and linked to their actor (damage on the
  token reaches the sheet), with HP and Wounds bars always shown to
  everyone. Foes are hostile and not linked, so each copy has its own HP,
  with an HP bar shown to everyone on hover.
- **Item types:** weapon, armour, shield, gear, container, ancestry,
  background, class, feat, power, spell, scroll, relic.
- **Shared state (world settings, five side panels):** Calendar & Time
  (date, clock, moon, day notes and day log), Weather, Misery, Light (the
  shared light timer) and Ember & Gloom (both pools, GM reset button for
  ember abilities). An Ongoing panel beside the sidebar lists each
  character's running effects.
- **Conditions:** Foundry status effects (only those in rules 3.13), plus
  the In Darkness marker from scene lighting (GAPS 274), which is not a
  3.13 condition. Persistent damage is one effect per damage type.
- **Damage types:** fifteen (GAPS 289); the Table of Agony keeps its five
  columns and the type only suggests one.
- **Mood:** the interface switches between a light and a dark mood
  (`module/mood.mjs`, spec in `styles/DESIGN.md`).
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

13. ~~**Initiative and turns.**~~ Done: `module/rules/initiative.mjs` and
    `module/rules/actions.mjs` with `tests/initiative.test.mjs` and
    `tests/actions.test.mjs`, and `module/combat.mjs` (turn order, a random
    tiebreak rolled with initiative, and clickable pips in the Combat
    Tracker). PCs roll d6 + Agility, foes d6 + their bonus.
    Ties: PCs go first, then random among equals (tested). Each turn shows 3
    action pips and 1 reaction pip that reset at the start of the turn.
    *Test:* start combat with Example Hero and the Bellman. Check the order
    and that the pips reset each turn.

14. ~~**Attack.**~~ Done: `module/rules/attack.mjs` with `tests/attack.test.mjs`,
    `module/dice/attack.mjs`, an attack dialog and card, an Attack button
    on each weapon in the Inventory tab, and an attack count per turn in
    `module/combat.mjs` (GAPS 60, 61). The target is your targeted token.
    Rule, with tests: melee uses Strength, shoot Presence and
    throw Agility, at DR12. Heavy adds +2 DR. Versatile used one-handed adds
    +2 DR. Ranged beyond its range and thrown beyond its listed distance give
    Bane. Finesse lets you choose Agility or Strength. From the second attack
    in a turn you attack with Bane (with an agile weapon, from the third).
    Reactions count only on your own turn. Damage is rolled; a Triumph
    doubles it and steps the foe's armour die down one.
    *Test:* tests pass. Attack the Bellman twice in a turn and the second
    attack has Bane. A Triumph takes its armour from d2 to none.

15. ~~**Attack Ruin and Recover.**~~ Done: `ruinedAfterAttack` and
    `recoverCost` in `module/rules/attack.mjs` with tests, an `attackRuin`
    box on the character, and a **Recover** button in the Inventory tab
    while it is set (GAPS 17, 63). A Ruin gives Bane on attacks until you
    press **Recover**, which spends one action.
    *Test:* force a Ruin. Attacks show Bane, then press Recover and one
    action pip is used.

16. ~~**Defence and taking damage.**~~ Done: `module/rules/defence.mjs`
    with `tests/defence.test.mjs`, `hpAfterDamage` in
    `module/rules/health.mjs`, `module/dice/defence.mjs`, a foe attack card
    with **Defend** buttons, a defence dialog and card with **Take
    damage**, an Attack button on foe attacks, **Raise shield** and
    **Lower** on the character, a "destroyed" box on shields, and raised
    shields lowered at the start of your next turn (GAPS 64–68).
    Rule, with tests: defence is Agility
    DR12. Tier 3 and 4 armour add +2 DR to defence; lower tiers add nothing.
    The armour soak die is subtracted from damage (t1 d2, t2 d4, t3 d6, t4
    d8), minimum 1 damage. Raising a shield (◈) gives light or heavy cover
    (−2 or −4 DR to defend) until your next turn. With several armours
    or shields equipped, only the strongest counts (GAPS 46). On a
    Ruin the damage is doubled and the armour drops one tier, and armour
    below tier 1 is destroyed. A **Take damage** button applies it to HP.
    *Test:* tests pass. The Bellman attacks, Example Hero defends and HP
    falls by the damage minus the soak roll.

17. ~~**Damaging foes and Morale.**~~ Done: `module/rules/morale.mjs` with
    `tests/morale.test.mjs`, `module/dice/morale.mjs`, a foe damage card
    and a Morale card, and a **Morale** button on the foe sheet (GAPS
    69–72). A Triumph's hit is soaked by the armour die from before the
    hit. The damage card offers Morale when the last enemy standing is at a
    third of its HP or less, or when a kill brings the foes in combat to
    half eliminated (mooks left out). At 0 HP the foe is marked defeated.
    An **Inflict damage** button on attack
    cards subtracts the foe's armour die (minimum 1). A **Morale** button
    rolls 2d6; above the foe's Morale it is demoralised, then d6: 1–3 flees,
    4–6 surrenders. A foe with Morale "–" never rolls.
    *Test:* hit the Bellman until it is at a third of its HP, then roll
    Morale.

18. ~~**Conditions.**~~ Done: `module/rules/conditions.mjs` with
    `tests/conditions.test.mjs`, `module/conditions.mjs` (status effects,
    a Conditions section with a Fatigue level on both sheets, notes on
    dialogs and cards), and condition changes in ability tests, contests,
    attacks, defences and turn starts (GAPS 73–75). Persistent Damage waits
    for step 19; Death's Door and Dark Vessel have their icons and numbers
    (cannot act; attack −2 DR, defend +2 DR) but their tables wait for
    step 22. Every 3.13 condition as a status effect with its PC
    effect and its **Foe** line, applied to tests where a computer can (Bane,
    DR changes, lost actions or reactions). A rule tested for each condition
    that changes numbers.
    *Test:* make Example Hero Prone. An attack shows +2 DR and a melee
    defence +2 DR. Make the Bellman Prone and melee attacks against it show
    −2 DR.

19. ~~**Persistent damage.**~~ Done: `module/rules/persistent.mjs` with
    `tests/persistent.test.mjs`, `module/persistent.mjs` (effects, the
    end-of-turn tick, a card with a Toughness button, a Persistent damage
    row and a GM Tick button in the Conditions section), and a DR and
    purpose for ability tests (GAPS 76–78). One effect per damage type. Of the same type,
    only the one with the highest average damage applies (tested: 2d4 beats
    d6); the weaker is removed. It deals damage at the end of the turn. A PC tests Toughness DR12
    to end each one. For a foe the GM rolls a d20 and it ends on 12+.
    *Test:* tests pass. Give Example Hero two fire effects and one poison,
    end the turn, and check that one fire and the poison tick.

20. ~~**Panic.**~~ Done: `module/rules/panic.mjs` with
    `tests/panic.test.mjs`, `module/panic.mjs` (the Panic button, the
    table, effects, the countdown and next-test Boon/Bane), a Panic card,
    Lost Sanity and Phobias on the sheet, Panic rows and a Dark Master's
    "Add a Panic result" menu in the Conditions section (GAPS 79–86).
    A Panic test (Sanity DR12). Triumph restores any Sanity lost
    for a while, Failure rolls 1d10 on the Panic table and Ruin rolls 2d10.
    The timed results become effects (for example Sluggish means 2 actions).
    *Test:* force a Ruin and get a 2d10 Panic result. A Sluggish character
    starts its turn with two action pips.

21. ~~**Wounds and the Table of Agony.**~~ Done: `module/rules/agony.mjs`
    with `tests/agony.test.mjs`, `module/agony.mjs` (wound card, Toughness
    button, Table of Agony button and dialog, injury effects), the 0 HP
    check in `module/data/character.mjs`, injuries in the condition
    modifiers and Conditions section, and Singed/Vomit used up like
    Rattled (GAPS 87–90). At 0 HP: gain a wound and test
    Toughness DR12 (the GM can change it). On a failure the GM picks the
    damage type (the weapon suggests one) and rolls d10. The bands are 1
    flesh, 2–5 minor, 6–7 major, 8–9 lethal and 10 fatal. HP returns to max
    and leftover damage is ignored.
    *Test:* drop Example Hero to 0 HP. You see a wound, a test, an Agony
    result and full HP.

22. ~~**Death's Door and Dark Vessel.**~~ Done: `module/rules/deaths-door.mjs`
    with `tests/deaths-door.test.mjs`, `module/deaths-door.mjs` (the card,
    the roll and the Dark Master's choice, the Sanity test, waking, death,
    killing blows), a Death's Door part in the Conditions section with the
    Dark Vessel count and lost body parts, a Wake countdown at turn end, and
    fatal Table of Agony results sending the character to Death's Door
    (GAPS 91–95). At max wounds and 0 HP, roll 2d6 on
    the table. Row 2 is Sanity DR10 + 1 per feat gained through Improving
    (tested). Rows 9–10 roll d10 for the lost body part (GAPS 36). Dark
    Vessel: d8 HP, attack −2 DR, defend +2 DR. A second Dark Vessel before a
    Long Rest kills. Until resting exists, the GM clears the count by hand.
    Any damage at Death's Door kills.
    *Test:* tests pass. Push Example Hero past max wounds and check each
    table row with forced rolls.

23. ~~**Ammunition after combat.**~~ Done: `usesAmmunition` and
    `needsAmmoRoll` in `module/rules/expendable.mjs` with tests,
    `module/ammunition.mjs` (marking a weapon fired, the card and its
    buttons) and an ammunition card (GAPS 39). A shooting weapon with an
    expendable die that is shot in combat (an attack or the Fire button)
    remembers that combat. When the combat ends, each character gets one
    card with an Expendable button per such weapon, rolled once by its
    owner. One roll per combat, however many shots. Thrown weapons, a sling
    and weapons already out of ammunition are left out. When combat ends,
    the system asks for an expendable roll for each ranged weapon fired
    during that combat.
    *Test:* fire the pistol in combat, end combat, and a roll prompt
    appears.

**Milestone 3 review:** run a full fight, Example Hero against the Bellman,
from initiative to Morale.
*Done:* played through in Foundry. Two rulings (GAPS 96, 97) and two fixes:
the last enemy is offered Morale once per fight, and in combat reloading
is done on your own turn and uses its action pips.

## Milestone 4: Character building

24. ~~**Class, ancestry and background.**~~ Done: `module/rules/origins.mjs`
    with `tests/origins.test.mjs`, `module/data/origins.mjs`, `module/origins.mjs`
    (the drop, the card, the wealth roll and keepsake), item sheets, an
    Origins section on the character sheet, the key ability on the character,
    and the examples (GAPS 98–102). A new class, ancestry or background
    replaces the old one; a replaced or deleted class takes its +1 back.
    Item data and sheets. Dropping a
    class sets the boosted ability (+1, after the table) and HP (X +
    Toughness, fixed at creation), and records max wounds, the spell list and
    the starting armour/weapon die. Its boosted ability is the key ability
    for powers. A background rolls wealth (for example 2d6 × 10 s).
    *Examples:* Warrior, Wizard, Human, Butcher.
    *Test:* drop the Warrior on a new character. Strength goes up 1, HP is
    10 + Toughness and max wounds is 3.

25. ~~**Fortune.**~~ Done: `module/rules/fortune.mjs` with
    `tests/fortune.test.mjs`, `module/fortune.mjs` (card buttons, the Dark
    Master query, dialog boxes, starting d3), and test, attack and defence
    cards that can be worked out again (GAPS 103–110).
    Start with d3 Fortune, with no cap. Spend buttons on cards:
    Triumph → Success or Ruin → Failure, maximum damage, reroll, −d6 damage
    taken, and Boon or Bane before rolling (in the test dialog). You can
    spend several at once.
    *Test:* reroll a failed test with Fortune. The count drops by 1.

**Milestone 4 review:** build the example Warrior and Wizard by hand from
rules 2.1 and compare them with the sheet.
*Done:* a Warrior built in rules order matched. Three rulings (GAPS 111–113)
and one fix: the sheet now stores the scores as rolled, and the class's +1
and lost Sanity are added on top (shown under each score), so the steps can
be done in any order. Max HP follows X + Toughness until the first Long Rest
or Improving. Old characters are brought over when the world loads
(`module/migrate.mjs`).

## Milestone 5: Ember, Gloom and magic

26. ~~**Ember and Gloom pools.**~~ Done: `module/rules/pools.mjs` with
    `tests/pools.test.mjs`, `module/pools.mjs` (the world setting, the
    Dark Master query for player spends, and the Table panel, opened from
    the token controls), round hooks in `module/combat.mjs` (GAPS 114–115).
    A shared panel. Rule, with tests: at the start
    of each round the pool fills to round × 5 (5, 10, 15…). What isn't spent
    is lost at the end of the round, and both pools empty when combat ends.
    Players spend Ember through the GM (sockets).
    *Test:* tests pass. Run three rounds and see 5, 10 and 15, then an empty
    pool after combat.

27. ~~**Powers in combat.**~~ Done: `module/rules/powers.mjs` with
    `tests/powers.test.mjs`, the power item (`module/data/power.mjs`, its
    sheet), `module/dice/power.mjs` (Use, Sustain, End; its card shares the
    attack card), Sustain checked at the end of each turn in
    `module/combat.mjs`, example `power-strike.json` (GAPS 116–121).
    Designer ruling: powers are never weapon attacks; they test the boosted
    ability unless the power names its own test (GAPS 117). A power can
    add a chosen weapon's damage dice to its own (Power strike, GAPS 121).
    Power item (cost, actions, source, sustained,
    damage, outcome texts). Rule, with tests: DR 11 + listed cost, tested
    with the key ability. A power that is an attack uses that attack's
    ability, and it counts towards the multiple-attack Bane. Failure deals
    half damage (rounded down) and nothing else. **Sustain** spends one
    action each turn.
    *Example:* Power strike (🟒1 ◈◈).
    *Test:* tests pass. Use Power strike on the Bellman: it is DR12, Ember
    drops by 1 and two action pips are used.

28. ~~**Ember abilities outside combat.**~~ Done: `powerUse` in
    `module/rules/powers.mjs` (tested), the power's `usedOutside` mark,
    `resetEmberAbilities` in `module/dice/power.mjs` (called when a started
    combat ends, for its characters, and by the Dark Master's button on the
    Table panel, for every character). Rests will call it in Milestone 6.
    With no combat running, each ember
    ability (cantrips included) works once without spending Ember. It unlocks
    after a combat or a rest, or when the GM presses **Reset ember
    abilities**.
    *Test:* use Power strike twice outside combat. The second use is blocked
    until you press reset.

29. ~~**Gloom abilities.**~~ Done: `module/rules/gloom.mjs` with
    `tests/gloom.test.mjs`, `module/dice/gloom.mjs` (Use on the foe sheet,
    the card with a Test button for each target, the test card, which works
    like a defence card with Fortune and Take), the power's Resource, DR,
    Ruin damage and conditions, and Toll for the Departed on the Bellman
    (GAPS 122–128). The Take button also adds the result's condition,
    with its timer (step 29a).
    A power with resource Gloom on foes. It posts a
    card with a button for each target. By default that is Agility DR12
    defence (Triumph no effect, Success half, Failure full, Ruin double);
    otherwise it is the ability's own test with its Failure and Ruin text.
    *Example:* the Bellman's Toll for the Departed (☾3, Presence DR12).
    *Test:* the Bellman uses Toll. Example Hero tests Presence and on a
    Failure takes d6 and becomes Deafened.

29a. ~~**Condition timers.**~~ Done (added at the designer's request):
    `module/rules/timers.mjs` with `tests/timers.test.mjs`,
    `module/timers.mjs`, hooks in `module/combat.mjs`, a clock button
    beside each condition on the sheets, and timers on gloom abilities'
    conditions (Toll: 1 round on a Failure, d4 rounds on a Ruin)
    (GAPS 127, 129–131). Rounds count down at the end of the creature's
    own turns, like Panic results; "until the start of its next turn"
    ends when its turn starts; every timed condition ends with combat.
    *Test:* the Bellman tolls and Example Hero fails: Deafened shows
    "1 round left" and ends at the end of the Hero's next turn.

30. ~~**Spells.**~~ Done: `module/rules/spells.mjs` with
    `tests/spells.test.mjs`, the spell item (`module/data/spell.mjs`, its
    sheet), `module/dice/spell.mjs` (Cast; the dialog pre-ticks the
    other-list and metal-armour Bane, and the card shares the power card),
    a Spells section on the character sheet, Sustain and the ember reset
    for spells too, example `and-they-spoke-of-fire.json` (GAPS 132–135).
    A Ruin's card says to roll on the Shadowblight table; the roll is step 31.
    Spell item. Rule, with tests: Sanity against DR 11 + cost.
    Bane for another spell list, for tier 2+ metal armour and for "foe in
    melee range". −2 DR for 1 minute of casting. Boon for 1 hour or for
    several casters. Boon and Bane cancel as in step 5.
    *Example:* And They Spoke of Fire (🟒3 ◈◈).
    *Test:* tests pass. Cast it in the chain shirt: DR14 with Bane.

31. ~~**Shadowblight, life force and scrolls.**~~ Done:
    `module/rules/shadowblight.mjs` with `tests/shadowblight.test.mjs`,
    `module/shadowblight.mjs` (the button on a spell's Ruin card), life
    force and scroll maths in `module/rules/spells.mjs` (tested), the life
    force box and scroll reading in `module/dice/spell.mjs`, life force
    wound cards in `module/agony.mjs`, the scroll item (`ScrollData`, its
    sheet, Scrolls in the Inventory tab), example
    `scroll-of-and-they-spoke-of-fire.json` (GAPS 136–140).
    A Ruin on a spell rolls d20 on
    Shadowblight. Life force: test Toughness instead, take the chosen wounds
    (each tests Toughness, HP unchanged) and lower the DR by d4 per wound,
    never below 6 (tested). Scrolls cast without Ember and without the
    other-list Bane, and are destroyed either way.
    *Example:* a scroll of And They Spoke of Fire.
    *Test:* tests pass. Cast from the scroll: no Ember spent, and the scroll
    is gone.

**Milestone 5 review:** a fight with Ember and Gloom on both sides, with a
Warrior and a Wizard against the Bellman.
*Done:* played through in Foundry; pools, powers, spells, life force,
Toll, timers, Fortune, scrolls and the ember reset all matched the rules.
Fixes: a fallen foe can no longer use gloom abilities; pool spend lines
name the character or foe spending; wording on the spell and Toll
dialogs and the scroll card. One open question: area spells and powers
(GAPS 141).

## Milestone 6: Time and rest

32. ~~**Days.**~~ Done: `module/rules/days.mjs` with `tests/days.test.mjs`,
    `module/days.mjs` (the day setting, the New day dialog with an
    "ate and drank" box per character, Doomed wound cards, starvation
    damage), the day and New day button on the Table panel, days without
    food on the character sheet (GAPS 142–143). Dead characters are left
    out. Long Rests will call `newDay` in step 33.
    A day counter and a **New day** button. At each new day:
    Doomed characters gain a wound, and a character without food for more
    than 2 days takes d6 damage.
    *Test:* make Example Hero Doomed and press New day. A wound is added.

33. ~~**Resting.**~~ Done: `module/rules/rest.mjs` with
    `tests/rest.test.mjs`, `module/rest.mjs` (the Rest button and dialog on
    the Table panel, interrupted rest tests, rest cards, Infected damage,
    Downtime clearing conditions), a "Slept" box on the New day dialog
    (GAPS 144–148).
    Short rest heals to full HP. Long rest heals HP and one
    wound, starts a new day and resets the Dark Vessel count. Downtime heals
    everything except Doomed and conditions that name their own cure. Any
    rest unlocks ember abilities. An interrupted rest is a Toughness DR12
    test. Not sleeping adds a level of Fatigued, and a Long Rest removes one.
    Fortune regains d3 only when it is 0. Infected and Doomed characters get
    no benefit, and Infected ones take d6. The first Long Rest fixes max HP
    (`system.hpFixed`, GAPS 111).
    *Test:* rest an Infected character. No healing, d6 damage.

34. ~~**Medicine box.**~~ Done: `module/rules/medicine.mjs` with
    `tests/medicine.test.mjs`, `module/medicine.mjs` (the Use button on a
    gear item with "Medicine box" ticked, the choice dialog, the patient's
    Toughness button on the card), data version 2 ticks existing medicine
    boxes (GAPS 149). Healing d6 HP and ending persistent bleeding are in
    too, each with the same test.
    Using it costs one action. The character tests
    Toughness DR12 to remove Infected, and the box's expendable die is rolled
    either way.
    *Test:* use the medicine box example on an Infected character.

35. ~~**Light timer.**~~ Done: `module/rules/light.mjs` with
    `tests/light.test.mjs`, `module/light.mjs` (the timer setting, the
    Light button on gear with a light kind, oil for lanterns, the New timer
    button on late lights, the lights-out card, pausing with the game), the
    light row and Dark Master controls on the Table panel, the Lantern and
    Lantern oil examples, data version 3 marks existing lights (GAPS 150–153).
    A real-time countdown that pauses with the game. Other
    lights lit while it runs join it. A lantern uses one hour of oil at a
    time.
    *Test:* light a torch (1 hour), pause the game and see the timer stop.

36. ~~**Token light.**~~ Done: a light range on light gear (usually 30
    feet; candle 10, torch 40, lantern 60), the lighting character's tokens
    shine bright light to that range, and every lit token goes dark and
    gets its own light back when the timer ends or is put out. Data
    version 4 gives existing torches, candles and lanterns their range
    (GAPS 154).
    *Test:* light a torch with a token on the scene, see 40 feet of bright
    light, then put the light out and see the token go dark.

**Milestone 6 review:** play a short trip with rests, days and torches.
*Code review done:* rests, days, the medicine box and the light timer
match the rules; 420 tests pass. Fix: the medicine box's "no actions
left" warning had the reloading text. Rulings from the review (GAPS
161–163) add steps 36a and 36b and a line to step 43 (Relics). The play-test in
Foundry is still to do.

36a. ~~**Healing at Death's Door.**~~ Done: `wakesFromHealing` in
    `module/rules/deaths-door.mjs` (tested), the character data notices HP
    gained at Death's Door and `healedAtDeathsDoor` ends it with a card;
    the medicine box refuses a dead patient.
    Gaining HP at Death's Door (the medicine
    box, the sheet or the token bar) wakes the character and ends Death's
    Door, with a card. A dead character stays dead. (GAPS 163)
    *Test:* put Example Hero at Death's Door, use the medicine box's Heal
    on them and pass the test. Death's Door goes and HP is above 0.

36b. ~~**Once per day.**~~ Done: `module/rules/uses.mjs` with
    `tests/uses.test.mjs`, `module/uses.mjs` (the Use button on feats, foe
    passives and gear, its card, the resets), a Use menu and Used box on
    feat and gear sheets, resets at round start, combat end and each new
    day, the "Until the next day begins" condition timer, data version 5
    sets frequencies from item text (GAPS 161, 164).
    Items and effects with "once per day" or "until the
    next day begins" (GAPS 161). A once-per-day use is marked used and comes
    back at each new day (New day, Long Rest, Downtime); an effect that
    lasts until the next day begins ends then. How items are marked and
    where the Use button sits to be settled with the designer before
    building.
    *Test:* use a once-per-day item, see it marked used, press New day and
    see it come back.

## Milestone 6b: Calendar, weather and travel

A lightweight calendar on Foundry's own world clock (no new packages):
the date, the time of day, the weather and the Misery, all on the Table
panel, and overland travel that spends phases of the day. Each step waits
on its open gaps.

37. ~~**Calendar and time of day.**~~ Done: `module/rules/calendar.mjs`
    with `tests/calendar.test.mjs`, `module/calendar.mjs` (the VÅR BORG
    calendar in Foundry's world clock, Next phase and ±1 hour for the
    Dark Master, New day dialog at dawn, Cowardice and Paranoid ending by
    the clock), the date row on the Table panel, each new day moving the
    clock to its dawn, data version 6 sets the clock from the day counter
    (GAPS 157, 158, 162, 165).
    VÅR BORG months and weekdays in
    Foundry's world clock (`CONFIG.time.worldCalendarConfig`). The Table
    panel shows the date, weekday and phase (Morning, Afternoon, Night).
    Dark Master buttons: Next phase, and hours on or back if hours are
    tracked. A new day starts at dawn (the New day button of step 32); a
    Long Rest or Downtime moves on to the next dawn. The day counter of
    step 32 carries over. If hours are tracked, Cowardice and Paranoid
    (1d10 hours) end when their hours have passed. (GAPS 157, 158, 162)
    *Test:* step through Morning, Afternoon and Night; at the next dawn
    the New day dialog opens and the date moves on.

38. ~~**Weather.**~~ Done: `module/rules/weather.mjs` with
    `tests/weather.test.mjs`, `module/weather.mjs` (the weather setting,
    the 2d6 move and hazard d10 at each new day, the weather card, Set
    weather for the Dark Master), the weather row and small hex flower on
    the Calendar panel (GAPS 155, 166).
    The hex flower as data, starting on Perfect day. At the
    start of each day, 2d6 moves the weather one hex; on a Minor or Major
    hazard, its d10 table is rolled and the hazard's card posted. It lasts
    until the next day begins. The panel shows today's weather; the Dark
    Master can set it by hand. (GAPS 155)
    *Test:* start several days and follow the weather on the flower.

39. ~~**Miseries.**~~ Done: `module/rules/misery.mjs` with
    `tests/misery.test.mjs`, `module/misery.mjs` (the Misery setting, the
    light die and sunrise die at each new day, the omen and end cards, Set
    Misery for the Dark Master), the Misery row on the Calendar panel
    (GAPS 156, 167).
    The Misery (I to VI) on the panel, the daily die at the
    start of each day, the d6 omen card, and the end card at VII. The Dark
    Master can set the Misery by hand. (GAPS 156)
    *Test:* set Misery VI and start days until no sun rises.

40. ~~**Overland travel.**~~ Done: `module/rules/travel.mjs` with
    `tests/travel.test.mjs`, `module/travel.mjs` (the Travel button and
    dialog on the Calendar panel, the encounter roll and travel card, the
    hardship roll, the current Misery's omen), `shiftWeather` in
    `module/weather.mjs` (GAPS 159, 160).
    A Travel button for the Dark Master: method (Trek,
    Gallop, Cruise) and region (Heartlands, Hinterlands). It spends one
    phase and rolls the d20 encounter table at its end, with Boon at night
    or in the Hinterlands. A result of 1 to 2 moves the weather; a Travel
    hardship rolls its d20 table and posts the hardship. (GAPS 159, 160)
    *Test:* travel by night through the Hinterlands and see the encounter
    rolled with Boon.

41. ~~**Weather effects (optional).**~~ Done: `module/rules/weather-effects.mjs`
    with `tests/weather-effects.test.mjs`; Day of ember and Day of gloom in
    `module/pools.mjs` (and the Ember and Gloom panel), Energy void and
    Energy font in `module/combat.mjs` (Slowed or Quickened at each turn
    start) and `module/travel.mjs` (×½ or ×1½ speed), Blackburn in
    `module/light.mjs` (the timer's burn rate and half-range tokens); the
    weather card names what the system applies (GAPS 168).
    Automate the hazards that touch what
    the system already does: Day of ember and Day of gloom (+5 to the pool
    each combat round), Blackburn (lights burn twice as fast, at half
    range), Energy void and Energy font (half or one and a half times the
    day's travel). The rest stay as cards.
    *Test:* set Day of ember and start a combat round.

**Milestone 6b review:** a three-day journey with weather, a Misery and a
rest at a wayshrine.
*Code review done:* the calendar, the hex flower (all 19 hexes, the six
directions, walls and wraps of GAPS 155), the Miseries, overland travel
(encounter and hardship tables, Boon by night or in the Hinterlands) and
the five weather effects match the rules and rulings; every text key
exists; 480 tests pass. No fixes needed. The Wayshrine works with the rest
dialog as it is (leave "Interrupted" unticked; the offering's d4 HP is
the Dark Master's). Rulings from the review: GAPS 165 and 167 confirmed,
and a day with no sun works like Looming dark (GAPS 167), which adds step
41a. The play-test in Foundry is still to do.

41a. **A day with no sun.** On a sunless day (GAPS 167), outdoors,
    anywhere lights do not reach is complete darkness, as in the Looming
    dark weather (rules 3.15: Bane on all tests, a random encounter roll
    for every hour in it). The system shows it as a reminder, it does not
    apply the Bane by itself: a line on the Misery card at that dawn, on
    the Misery row of the Calendar panel, and on travel cards that day.
    *Test:* use Set Misery to tick "No sun today" and see the reminder on
    the card and the panel; travel and see it on the travel card.

## Milestone 7: Minions, relics and vehicles

42. ~~**Minions.**~~ Done: `module/rules/minions.mjs` with
    `tests/minions.test.mjs`, `compareTurnOrder` in
    `module/rules/initiative.mjs`, the minion actor and sheet
    (`module/data/minion.mjs`, `module/sheets/minion-sheet.mjs`), the
    Minions list and Command button on the character sheet
    (`module/minions.mjs`), minions defending in `module/dice/defence.mjs`,
    the small vicious dog example (GAPS 169–172).
    Minion actor (HP, Morale, armour, owner). It tests at +0,
    has 2 actions and 0 reactions, acts on its owner's initiative right
    after them, and the limit is Presence (minimum 1). There is a "Command a
    minion" action (◈).
    *Example:* a small vicious dog (Pitiful minion: HP 5, Morale 6, d4).
    *Test:* in combat the dog sits right after its owner and acts when
    commanded.

43. ~~**Relics.**~~ Done: `module/rules/relics.mjs` with
    `tests/relics.test.mjs`, the relic item and sheet
    (`module/data/relic.mjs`, `RelicSheet`), the Use, Daily roll and Last
    Rite buttons in the Inventory tab (`module/relics.mjs`), `gainEmber` in
    `module/pools.mjs`, the Shard of the Great Brazier example
    (GAPS 173, 174).
    Relic item: use it (then roll the expendable d20, or daily
    for always-on relics), its Last Rite (always works and destroys the
    relic), and its "if lost" drawback shown when it is destroyed.
    "Once per day" uses the frequency and Use button of step 36b (GAPS
    164), and the Use button also rolls the expendable d20.
    *Example:* Shard of the Great Brazier (+3 to the Ember pool).
    *Test:* use the Shard. The pool goes up by 3 and the d20 is rolled.

44. ~~**Vehicles.**~~ Done: `module/rules/vehicles.mjs` with
    `tests/vehicles.test.mjs`, the vehicle actor and sheet
    (`module/data/vehicle.mjs`, `module/sheets/vehicle-sheet.mjs`), the
    Drive dialog and driving card with Prone tests and collision damage
    (`module/vehicles.mjs`), the Cargo list with passenger room, Encumbered
    and overloaded (GAPS 178), the steam wagon example (GAPS 34, 175–178).
    Vehicle actor (HP, armour, three speeds, crew, passengers,
    fuel). Driving tests by speed and situation (Agility DR10, 12 or 14).
    Collision damage (1d6, 3d6 or 5d6) applies to the driver and passengers,
    after armour.
    *Example:* steam wagon.
    *Test:* drive fast and force a Ruin. The occupants take 5d6 minus their
    armour.

## Milestone 8: Growth and content

45. ~~**Improving.**~~ Done: `module/rules/improving.mjs` with
    `tests/improving.test.mjs`, the Dark Master's Improve button, the
    "choose a feat" line with Skip, and the Improving card
    (`module/improving.mjs`, `templates/chat/improving-card.hbs`); a feat
    dropped while choosing is marked (GAPS 179).
    A button that runs rules 2.8. Each ability rolls d6: on a
    1 or below the ability it goes down 1, otherwise up 1 (−3 … +6). Choose a
    feat (marked "gained through Improving"). Roll 6d10, and if it is at
    least your max HP, max HP goes up d6. Then roll the d6 find table.
    Ability changes go on the rolled score, and Improving fixes max HP
    (`system.hpFixed`, GAPS 111). Tested.
    *Test:* tests pass. Improve the example Warrior and check each step.

46. ~~**Character creation helper.**~~ Done: `module/rules/creation.mjs`
    with `tests/creation.test.mjs`, the Creation helper window
    (`module/creation.mjs`, `templates/apps/creation-helper.hbs`) opened
    from the Origins heading of the character sheet (GAPS 180).
    Optional guided creation: the ability
    method, ancestry feat, background, class, and starting equipment by the
    class die.
    *Test:* make a character with the helper and check it against 2.1.

47. ~~**Compendium packs.**~~ Done: Foundry's official command-line tool
    installed as a build tool (`package.json`, approved), `tools/packs.mjs`
    with `tests/packs.test.mjs`, `tools/build-packs.mjs` (run with
    `npm run build:packs`), thirteen packs in `packs/` listed in `system.json`
    in a VÅR BORG folder (GAPS 181).
    Turn `content/` into real compendiums that ship
    with the system. Building packs from JSON files needs Foundry's official
    command-line tool (an npm package), so **I will ask before installing
    it**.
    *Test:* the compendiums appear in a new world and their entries work.

48. **Full content.** Enter all classes, ancestries, backgrounds, feats,
    gear, spells, relics, tables and foes from the rules into `content/`, a
    few files per step. Text is copied from the rules document by a script,
    not retyped, and `tests/content.test.mjs` checks it word for word.
    *Test:* spot-check entries against the rules.

    - 48a. ~~**Ancestries and ancestry feats.**~~ Done: the eight
      ancestries of 2.3 in `content/ancestries/` and their 64 optional
      feats (4.3.1–4.3.8) in `content/feats/ancestry/<ancestry>/`. The
      Human example moved there too (the Import examples button still
      finds it). Feats stay text only, as before.
    - 48b. ~~**Backgrounds.**~~ Done: the 100 backgrounds of the d100
      table (2.4, the same as 4.4) in `content/backgrounds/`, each with
      its wealth and keepsake and its d100 number in the description. The
      Butcher example moved there too. A roll table for them comes in 48i.
    - 48c. ~~**Classes.**~~ Done: the 20 classes of the class table
      (GAPS 1) and the Witch Hunter (GAPS 183) in `content/classes/`, each with its boosted ability, HP,
      max wounds, spell list and starting die, checked against both the
      class page and the table. The description holds the class's opening
      paragraph, its class feature in full and the name of its class power
      (the power itself comes in 48d). The Warrior and Wizard examples
      moved there too. A class can list fixed starting weapons
      (`system.startingWeapons`): the Witch Hunter starts with a rapier and
      a flintlock pistol and rolls its d8 on the armour table only.
      The stat blocks and tables on class pages (Destrier, Raider-Beast,
      Thrall, the rig, the Photonic Surge) come in 48i.
    - 48d. ~~**Class powers and class feats.**~~ Done, all 21 classes at
      once (the text is checked word for word, so batches were not
      needed): 169 class feats in `content/feats/class/<class>/` and 147
      powers (each class power and its six others) in
      `content/powers/class/<class>/`. Cost, actions, a named test,
      damage dice, adding weapon damage and Sustained are read from the
      text; result lines go into the power's outcomes. Powers with damage
      the dice cannot roll (maximum or triple weapon damage) or damage not
      dealt on use (Mark quarry, Entropic Shield, Armoured Chitin) keep it
      as text. New: reaction powers (↻), which use the reaction pip and
      work on any turn (GAPS 184). The Power strike example moved there.
    - 48e. ~~**General feats.**~~ Done: the 53 general feats of 4.6 in
      `content/feats/general/` and the two difficulty feats (Harkin's
      Reprieve with its d6 table, Doomsworn) in `content/feats/difficulty/`.
      New feat source "Difficulty feat": never marked "Gained through
      Improving", and dropping one while choosing an Improving feat does
      not count as the choice (4.6). Not yet done: the creation helper does
      not offer a difficulty feat, and nothing stops a character having
      both; their effects are text, like other feats (step 49).
    - 48f. ~~**Gear, weapons and armour.**~~ Done: from 4.1, 50 weapons in
      `content/weapons/` (38 melee, 9 ranged, the three grenades as thrown
      weapons), 14 armours and 2 shields in `content/armour/`, and 51 items
      in `content/gear/` (43 gear, the backpack, bandoleer and satchel as
      containers, arrows, bolts and gunpowder shot with the refill rule,
      and the fire pot and smoke bomb, which roll no damage dice). Traits,
      expendable dice, light sources and the medicine box are set from the
      text; each weapon's damage type is the obvious one (GAPS 15). The 14
      gear examples moved there. Services and beasts are prices, not items.
    - 48g. ~~**Spells.**~~ Done: the 64 spells of the Arcane, Divine, Primal
      and Profane pages (16 each, 4 at each cost) in
      `content/spells/<list>/`, read like powers (cost, actions, damage dice
      from the text or the Success line, Sustained, all four results).
      Spells can now be reactions (↻), like powers (No; GAPS 184). Bolts of
      Assurance's "◈-◈◈◈" is stored as 1 action (GAPS 185). The example
      spell moved there; it and its scroll now end their Ruin with "Roll on
      the Shadowblight table", as the rules do.
    - 48g2. ~~**Rituals.**~~ Done: a spell can be marked Ritual, with its
      own DR (14, 16, 18 or 20) and casting time
      (`module/rules/spells.mjs`: `castingDr`, `ritualUse`,
      `ritualModifiers`, with tests). The Cast button casts it outside
      combat only, with no ember, no actions and no once-only limit, at its
      DR, without the casting time choice; the other modifiers and life
      force work as for spells. The sheet line reads "Ritual · 10 minutes
      · DR14 · Arcane". The 63 rituals of the four spell pages are in
      `content/spells/<list>/rituals/`, in the Spells compendium. Rituals
      are not offered as the starting spell. Open questions: GAPS 186.
    - 48h. ~~**Relics.**~~ Done: the 22 relics of the table in 4.2 in
      `content/relics/`: effect, Last Rite, drawback ("If lost or
      destroyed"), sale and faction values and the faction. All are once
      per day; the rebreather and the compass ("rolled once per day") are
      always on; the Shard adds 3 ember (GAPS 174). The Shard example moved
      there unchanged. The "Rolling a relic" table (d2, then d12 or d10 +
      12) comes with the other tables in 48i.
    - 48i. ~~**Foes.**~~ Done: every stat block in the rules with stats
      outside the adventures (Operation and Exeunt pages, and the Carcosan
      Marionette of the Entities appendix, are left out for
      now, at the designer's wish), 149 foes in `content/foes/` and the Destrier and Raider-Beast in
      `content/minions/`. Tier, HP, Morale ("-" never rolls), armour die
      and name; attacks as weapons (melee or shoot, reach or range); gloom
      abilities as gloom powers with their own test, DR, Failure and Ruin
      damage, conditions and timers read from the text; passives as foe
      passive feats. Odd lines (", and the target is knocked Prone…",
      "Stuck: …") stay as text. Categories and damage types: GAPS 187.
    - 48j. ~~**Tables.**~~ Done: a fourteenth compendium, Roll Tables
      (`tools/packs.mjs` now packs roll tables, with tests), holding ten
      Foundry roll tables in `content/tables/`: Backgrounds (d100, linked
      to the background items), Relic (d2, linked to Relics 1–12, d12, and
      Relics 13–22, d10 + 12, linked to the relic items), Spoils (d20),
      Valuables (d12), Trinkets (d20), Searching the fallen (d6, its 6
      linked to Spoils), the Hedge Mage's Photonic Surge (d100) and
      Harkin's Reprieve (d6). Tables the system already rolls (Agony,
      Death's Door, Shadowblight, travel, weather, starting equipment) and
      adventure tables are not repeated; the spell scroll roll (list, tier,
      spell) stays as text. Also the Charioteer's rig (a vehicle) and the
      Gravecaller's Thrall (a mook foe, GAPS 187).

    **Step 48 is complete.** Next: the Milestone 8 review, then Milestone 9.

## Milestone 9: The item effects system

From here on the compendium's items start to do what their text says. Each
item gets a list of effects (`system.effects`) and an automation status
(`system.automation`: auto, partial, text or ruling). Effects are entered
by hand per item, not read from the text by a script. Kinds of effect:

- **stat:** adds to, sets or puts a minimum on a sheet number (max HP, max
  wounds, carry limit, movement, minion limit, initiative, an ability, the
  soak die, defence DR). *Mountain of Meat: max HP +4.*
- **roll:** Boon, Bane, DR or extra damage on one kind of roll (test,
  attack, defence, spell, power, Panic, contest, gloom test, driving, chance
  die, Morale), with filters (ability, condition, weapon group, target).
  Either automatic, or an optional tick in the dialog for situations only
  the Dark Master can judge (designer's choice). *Iron will: Boon to resist
  Charmed. Acrobat: optional Boon.*
- **hook:** one of a fixed set of actions at a fixed event (rest, new day,
  turn start, initiative, wound, Death's Door, Panic, natural 1 or Ruin,
  kill, 0 HP).
- **use:** what the Use button does (roll a die, heal, gain Ember, a reroll
  button on a card).
- **immune / resist:** a condition that cannot be given, or damage of a
  type taken ×½ or ×2. Applied by the system (designer's choice).
- **choice:** a choice made when the item is dropped (feat, spell, ability,
  weapon group, element), stored on the item.
- **reminder:** the item's name and text in the right dialog or card.

Designer's choices for this plan: feats first, then classes, powers and
spells, then foes, then relics and gear; area effects get one button per
targeted token, sharing one damage roll (GAPS 141).

49. ~~**Rulings first.**~~ Done: GAPS 182 and 188–191, and GAPS 141
    (area effects) resolved. Armour from feats: only the strongest soak
    counts, and natural armour has no penalties and never drops a tier.
    Afterimage's DR10 is the starting DR for ranged defence, and −2 DR
    feats add up. New frequencies: once per turn, per Long Rest, per
    Downtime, and per visit (reset by the Dark Master). Dragon's Shadow:
    Morale as 3d6 keeping the two highest, as an optional tick. Range
    changes (GAPS 191) stay provisional: Long shot is added to weapon
    ranges, and spell ranges get a reminder. Item-specific questions are
    asked at the start of their own content step.

49a. ~~**Effect data and maths.**~~ Done: `module/data/effects.mjs` (the
    effects list and the Automated status on feats, powers, spells,
    relics, weapons, armour, shields, gear, classes and ancestries; not on
    containers, scrolls or backgrounds), `module/rules/item-effects.mjs`
    (`collectEffects`, `statBonuses`, `withStat`, `rollEffects`,
    `effectProblems`; roll entries have the same shape as condition
    modifiers) with `tests/item-effects.test.mjs`, and an Effects section
    at the bottom of those item sheets (`module/sheets/item-effects-part.mjs`,
    `templates/item/item-effects.hbs`). The sheet offers the kinds built so
    far: sheet number, roll modifier and reminder. Weapons, armour and
    shields count only while equipped, and a destroyed relic or shield not
    at all. Nothing reads the effects yet (from step 49b on).
    *Test:* tests pass. Give a feat an effect on its sheet; it is kept.

49b. ~~**Numbers on the sheet.**~~ Done: the character's derived data
    (`module/data/character.mjs`) collects its items' sheet-number effects
    (`system.statBonuses`) and adds them to max HP, max wounds and the
    abilities in use (`withAbilityBonuses`, kept within −3 … +6). Max HP
    and max wounds are stored without them: the sheet's boxes show the
    stored number, with "+4 Mountain of Meat → 14" under it, and HP is
    kept within the max in use. Improving adds its d6 to the stored max.
    `carrying` (limit never below 1; overloaded movement stays 0),
    `minionLimit` and `initiativeFormula` take the bonuses, with tests;
    the sheet names them under movement, carrying and minions.
    Not yet: a Toughness bonus from an item does not move max HP while it
    follows Toughness (GAPS 111). The armour tier and defence DR targets
    are used in step 49c with the defence roll.
    *Test:* Mountain of Meat and Tough give +4 max HP and +1 max wounds,
    and removing them takes it back.

49c. ~~**Automatic roll modifiers.**~~ Done: `module/effects.mjs`
    (`itemRollMods`, `itemReminderNotes`) adds a character's "Always" roll
    modifiers to the condition modifiers of ability tests, attacks,
    defences, spellcasting, powers, contested tests and tests against
    gloom abilities, and their reminders to the dialogs; each shows as
    "Fey-World Glimmer: −2 DR, added for you". Kinds of roll: "Ability
    tests" covers every test made with the test dialog, Panic, wound,
    driving and contested tests included (Panic and driving can also be
    named alone). Attacks, defence, spellcasting and powers are only
    themselves. A gloom ability's test is also an ability test or a
    defence, and counts as resisting the conditions it gives (so "Boon to
    resist Charmed" works there). The defence also uses the Defence DR
    sheet number (the −2s add up), starts ranged defences at Afterimage's
    DR10, and soaks with natural armour when it is stronger than worn
    armour, in vehicle collisions too (`bestSoak`, `startingDefenceDr`,
    `statDrMods`, with tests; GAPS 188, 189). Not yet: the chance die
    (Boon on 2d6 is not ruled) and Morale (step 49d) are not offered.
    *Test:* with Iron will, a test to resist Charmed shows Boon and the
    feat's name.

49d. ~~**Optional ticks.**~~ Done: roll modifiers set to "Optional tick"
    appear in a "Does it apply?" box in the dialogs of ability tests
    (Panic, wound and driving tests included), attacks, defences, gloom
    tests, powers and spells (`itemOptionalMods`, `optionalEffectsField`,
    `tickedMods` in `module/effects.mjs`, `templates/dice/optional-effects.hbs`);
    a ticked one counts and shows on the card like an automatic one. For an
    attack the box is worked out for the weapon's usual ability. Morale
    (`moraleDice`, tested): Boon is 3d6 keeping the two lowest (the foe
    holds), Bane 3d6 keeping the two highest (it breaks), both or neither
    2d6; effects come from the foe and from the characters in the combat
    (every player character outside one), with a small dialog when any is
    optional (GAPS 182). Not yet: contested tests offer no boxes (their
    automatic effects work).
    *Test:* with Acrobat, an Agility test shows "Acrobat: Boon" unticked;
    ticked, the card shows Boon.

49e. ~~**Damage and weapon effects.**~~ Done: a roll modifier's Damage (a
    number or dice) is added to the damage of attacks, and of powers and
    spells that deal damage, automatically or when ticked, and shows as
    "+2 damage" in the notes; a Triumph doubles it and a power's Failure
    halves it with the rest. "Per wound" repeats it for each wound the
    character has (Battle Scars). "With weapon" limits an effect to attacks
    with melee, shooting or thrown weapons, or with a trait (heavy,
    finesse, two-handed, versatile, agile), such as the Barbarian's +2 on
    melee strikes. `isDamagePart`, `effectDamage`, `withExtraDamage`,
    `weaponTags`, with tests. Not yet: weapon groups such as axes or
    swords, and a chosen weapon (step 49h), and counts other than wounds
    (Bloodlust's kills).
    *Test:* Battle Scars with two wounds adds +2 damage.

49f. ~~**Event hooks.**~~ Done: a new kind of effect, **Event** (`hook`),
    with When (start of your turn, initiative, HP drops to 0, a wound is
    gained, Death's Door roll, Panic test passed or failed, any rest, Long
    Rest or Downtime, start of the day), Do (post a reminder, regain HP,
    roll and post, add to the Ember pool, gain a condition, roll twice),
    an amount, a condition, which roll to keep (the better, the worse, the
    player chooses), "only while at half HP or lower", and "Do it" or
    "Remind only". `runItemHooks` in `module/effects.mjs` is called from
    `module/combat.mjs`, `module/data/character.mjs`, `module/agony.mjs`
    (wounds at 0 HP, from life force and Doomed), `module/panic.mjs`,
    `module/rest.mjs` and `module/days.mjs` (after once-per-day uses come
    back), and posts one card per event. Rolling twice works for
    initiative (`initiativeFormula`, choosing counts as the better) and
    Death's Door (`rollTwiceFor`, with a choice dialog); a better or a
    choice with a worse cancel out (GAPS 192, provisional). An item with a
    limited use acts only while unused and is then marked used. Maths:
    `hookEffects`, `rollTwiceKeep`, `keptRoll`, with tests. Not yet: the
    natural 1, Ruin and kill moments, preventing a condition (step 52a's
    immunities) and Boon on the next roll.
    *Test:* Regenerative Marrow heals at turn start; Saint's knucklebone
    gives two Death's Door rolls.

49g. ~~**Uses and new frequencies.**~~ Done: the frequencies of GAPS 190
    (`module/rules/uses.mjs`, tested): once per turn (back at the start of
    the character's turn and when combat ends), once per Long Rest (back
    at a Long Rest or Downtime), once per Downtime, and once per visit
    (back when the Dark Master presses **Reset visit uses** on the Ember
    and Gloom panel); "once per …" in an item's text sets them. Seven
    content feats and three foe passives got the frequency their text
    names, and data version 7 does the same in existing worlds. A new kind
    of effect, **Use button** (`use`): roll and post, regain HP, add to the
    Ember pool, gain a condition (`doEffectAction`, shared with events), or
    offer a reroll: the item puts a "Reroll (item)" button on its owner's
    cards of one kind (ability test, attack, defence, gloom test, power,
    spell) wherever Fortune could reroll, paid with the item's use instead
    of Fortune (`rerollItems`, `module/fortune.mjs`). A feat or gear item
    with Use effects gets a Use button even without a limit. Not yet:
    relics' own Use buttons do not run Use effects (step 53a), and a reroll
    is only offered on its owner's own cards (Understudy helps an ally).
    *Test:* use Lucky Break and see its d10. A once-per-Long-Rest feat comes
    back after a Long Rest.

49h. ~~**Choices.**~~ Done: a new kind of effect, **Choice** (`choice`):
    one of the character's weapons (the designer's reading of "weapon
    group", GAPS 193), a feat or a spell from the compendiums (from any,
    another ancestry, another class, at random, or a spell already known,
    with a highest ember cost for spells), a Bestiary category, a damage
    type, or something written down. `module/choices.mjs` asks for every
    unmade choice when the item lands on a character, stores it on the
    effect ("Chosen: Greataxe"), and adds a picked feat or spell to the
    character; the Choose button in the Effects section asks again.
    Roll modifiers can use the choice: "With weapon: the chosen weapon"
    and "Against: foes of the chosen category" (attacks, powers and spells
    know their weapon and target). `choicesOf`, `choiceCandidates`, with
    tests. Not yet: damage types chosen for resistances (step 52a), and
    "passive feat" (Ancient One) cannot be told apart, so every class feat
    of another class is listed.
    *Test:* drop Weapon specialist, choose a weapon, and attacks with it get
    the bonus.

49i. ~~**Report, tests and existing worlds.**~~ Done:
    `tools/automation-report.mjs` with `tools/automation.mjs` (tested in
    `tests/automation.test.mjs`): `npm run report:automation` prints a
    table of the 1526 automatable compendium items by folder and status,
    `-- <folder>` lists one folder's items, `-- --open` lists every item
    not reviewed or waiting for a ruling, and effects with problems are
    listed at the end. `tests/content.test.mjs` fails on an effect the
    system would not understand, an unknown status, or an item marked
    fully or partly automated with no effects. `module/refresh-effects.mjs`
    copies a compendium entry's effects and status onto world items that
    came from it and have none of their own (Items tab, actors' items, and
    the items inside foes copied from the compendium), never touching items
    set by hand: by itself on load when `EFFECTS_CONTENT` is newer than the
    world's, and with the Dark Master's **Copy compendium effects** button
    in the game settings. The creation helper and feat or spell choices now
    remember the compendium an item came from. (The world copy uses its own
    counter instead of a data version, because every content step needs
    it.)
    **Rule for Milestones 10 to 13:** every step that adds effects to
    `content/` raises `EFFECTS_CONTENT` by one and rebuilds the packs.
    *Test:* run the report; an old world's compendium feat gets its effects
    after reloading.

**Milestone 9 review:** a fight with five hand-made test feats, one of
each kind.
*Code review done:* every text key the new code uses exists (also the
ones built at run time); the shared helpers are wired into every roll,
event and sheet as PLAN describes; 647 tests pass. No fixes needed. Added
for the play-test: seven test feats in `content/examples/test-feats/`
(one per kind of effect, brought in by **Import examples**), marked
"not packed" so they never reach the compendiums (`packFor`, tested).
Open for the content steps: does an event that heals (Regenerative
Marrow) wake a character at Death's Door, as other healing does
(GAPS 163)? To be asked at step 50d (Fleshwright).
*Play-test (to do in Foundry):* press Import examples, then give Example
Hero the seven "Test:" feats, a dagger and the greatsword, and fight the
Bellman:
- Sturdy Frame: max HP +4, movement 25 ft; take off the armour and the
  defence soaks d2 (natural t1) at −2 DR.
- Battle Fury: Strength tests have Boon; with 2 wounds the greatsword
  deals "+ 2".
- Light Feet: an Agility test offers "on tests involving balance"; the
  attack dialog shows the reminder.
- Knitting Flesh: at half HP or lower, d4 HP at the start of each turn; a
  reminder when a wound is gained.
- Lucky Charm: Use rolls a d10; or press "Reroll (Test: Lucky Charm)" on
  an ability test card; either way it is used until the next day.
- Favourite Weapon: choose the dagger when it is dropped; dagger attacks
  get +2.
- Dreadful Presence: the Bellman's Morale asks about it; ticked, 3d6 with
  the two highest kept.

## Milestone 10: Feats

Each step starts by listing its open questions, then enters the effects;
every feat in the batch ends with a status.

50. **Feats.**
    - ~~50a. General feats (54)~~. Done: rulings GAPS 194–197. Roll and
      reminder effects can be "only outside combat" (the 25 "non-combat
      tests" feats are optional ticks hidden during combat), and stat
      effects can multiply ("times", Carry-all). 47 general feats have
      effects and a status; EFFECTS_CONTENT 2.
    - ~~50a2. Difficulty feats and death.~~ Done: new event moments
      "when you would die", "when an Agony result would kill you" and
      "when a combat ends"; new actions Gain Fortune (as Remind only, a
      Dark Master's button), Harkin's Reprieve and Go to Death's Door
      instead; a Fortune die sheet number. Every death goes through one
      place, which asks the items first.
      - Harkin's Reprieve: the death fades to black, d6 hours, HP to
        maximum, wounds to maximum − 1, the wake-up table drawn (GAPS 195).
      - Doomsworn: −1 max wound (minimum 1), d2 Fortune (rolled again
        when taken in the creation helper, and after a Long Rest), Death's
        Door twice keeping the worse, and a "+1 Fortune" button when a
        combat ends (GAPS 196).
      - The creation helper has a 6th step: one difficulty feat, which
        replaces one taken earlier.
      - Hard to Kill: Death's Door instead of an Agony death. Diehard: a
        reminder on the death card (GAPS 197). EFFECTS_CONTENT 3.
    - ~~50a3. The last general feats.~~ Done:
      - Steady nerves: a failed Panic test, while the feat is unspent,
        posts a card with two buttons. One gives Success and +1 Fatigued
        and spends the feat; the other rolls the Panic table (GAPS 197).
      - Brawler: unarmed d4.
      - Long shot: Ranged and Thrown distances +½, rounded down to 5'
        (GAPS 191, provisional).
      - Quick reload: one fewer Interact action, minimum 1.
      - The weapon numbers after feats show on the sheet and count in
        attacks, reloads and power damage. EFFECTS_CONTENT 4.
    - 50b. Ancestry feats (64), in four parts (rulings GAPS 198–201):
      - ~~50b. The feats that fit the tools already built.~~ Done: 51
        feats have a status. New: an effect can reroll damage 1s (Hawkeye),
        and per-wound damage can have a limit (Battle Scars, up to +3).
        EFFECTS_CONTENT 5.
      - ~~50b2. Card buttons after a test.~~ Done: Whim of the Fey (on a
        Ruin; failing again rolls Shadowblight), Fortune's Favourite (on a
        natural 1), Savage Strength (failed Strength test) and Human
        Ingenuity (Success, once a day) are buttons on test cards, each
        once per card. Dwarven Doughtiness, Go Big or Go Home, Armoured
        Paragon and Pack Rat work. EFFECTS_CONTENT 6.
      - ~~50b3. Damage types (GAPS 199, 202, 203).~~ Done: poison, acid,
        lightning and radiant are damage types; powers, spells and gloom
        abilities have a damage type (40 filled in); roll effects can need
        one; Firebug +2 with fire. EFFECTS_CONTENT 7.
      - ~~50b3b. Damage the character takes by type.~~ Done: a resist
        effect halves, doubles or reduces damage of a type (or the chosen
        element) on defence, gloom ability and persistent damage cards,
        before armour (GAPS 204, provisional). Tempered by the Forge and
        Ancestral Resonance work.
      - ~~50b4. Gifts (GAPS 201).~~ Done: a gift effect gives a compendium
        item with the feat (the new Clan Heirloom relic: once a day +1
        Fortune), and a Use action makes a named Weak minion once
        (Beast-Tamer). All 64 ancestry feats have a status.
        EFFECTS_CONTENT 8.
    - ~~50c. Class feats: Barbarian, Bard, Brinkwalker, Cavalier,
      Charioteer.~~ Done: 32 feats have a status (the rig and destrier
      feats wait for 50g). New: feats switched on until the encounter
      ends (A good time), kills counted by Inflict damage (Bloodlust,
      GAPS 205), an effect that replaces the weapon's dice (Couched
      Lance, Cutting remark), Titan's grip, a minion of a rolled tier
      (Chains of gratitude). Brinkwalker's Adrenaline feats are ticks
      and reminders until 51a tracks Adrenaline. EFFECTS_CONTENT 9.
    - ~~50d. Class feats: Dancer, Druid, Fleshwright, Gravecaller, Hedge
      Mage.~~ Done: 40 feats have a status. New: a feat button that lowers
      damage on defence and gloom cards (Thickened dermis, Magical
      calluses; a hit still deals 1), immunity to a damage type (Internal
      alchemy), natural armour only without worn armour (Barkskin).
      Feats that lean on class features (dance partner, Primal Conduit
      stances, thralls, Photonic Surge) are reminders until 51a.
      EFFECTS_CONTENT 10.
    - ~~50e. Class feats: Paladin, Priest, Ranger, Rogue, Scholar.~~
      Done: 40 feats have a status. New: worn armour soaking a tier
      higher (Armour of faith), no spellcasting Bane up to t3 (Blessed
      plate), immunity to a condition (Incorruptible), half persistent
      damage (Chastisement). The Scholar's subject feats wait for 51a.
      EFFECTS_CONTENT 11.
    - ~~50f. Class feats: Skullrider, Sorcerer, Sword Saint, Warrior, Witch
      Hunter, Wizard.~~ Done: 47 feats have a status (A beast with no name
      waits for 50g). New: natural armour by wounds (Scar tissue), no
      duress Bane (Born to it), Frightened without attack Bane (Unbroken),
      shields raised as a free action (Shield expert), traits for a
      chosen weapon (Fencing-hall form, Bigger sword), damage that
      nothing reduces (Blood price), a feat reroll with Boon (Parry).
      EFFECTS_CONTENT 12.
    - Fix before the Milestone 10 review: each class feature is a feat
      (source "class feature", never gained through Improving) in the
      Feats compendium, and the creation helper gives a class its feature
      and its class power, both set by the class (rules 2.5), with no
      choice.
    - ~~50g. Companion and vehicle feats.~~ Done: the last 10 feats.
      A feat's Use can change the character's own minion or the vehicle
      they are aboard once (Hawk-Iron Barding, Bolted Plate: armour and
      speed), heal it (Grease Monkey) or hurt it (Bottled Breath);
      Ram-Plough halves the rig's own crash damage. Every feat now has
      a status. EFFECTS_CONTENT 13.

    *Test per step:* the report shows the batch done; spot-check three
    feats in Foundry.

**Milestone 10 review:** a character of each ancestry and three classes,
one fight and one rest.

## Milestone 11: Classes, powers and spells

51. **Classes, powers and spells.**
    - 51a. Class features (21) as effects on their class feature feats,
      in three parts:
      - ~~51a. The features that fit the tools.~~ Done: 10 features have a
        status. New: a hook can switch an item on when initiative is
        rolled, and stat effects can work only while it is on (Barbaric
        Rage: Boon on Strength tests, +2 melee damage, natural t2; items
        switch off when the combat ends); extra damage only on a Triumph,
        after doubling (Holy smite, provisional); shoot attacks with
        Agility (Wilderness hunter); extra damage against a Blinded,
        Restrained or Slowed target, else a tick (Hit 'em where it
        hurts); no armour DR up to t3 (Armour mastery); a d6 life force
        die and a 3d6 roll on the death card (Blood of power); DR12 for
        difficult driving at fast speed (No Number); a −2 DR defence tick
        in t1 armour or none (Grace in Motion). Bard of Renown and
        Malleable Body are text. EFFECTS_CONTENT 14.
      - ~~51a2. Adrenaline, Primal Conduit, Autodidactism, Call upon the
        divine.~~ Done (GAPS 206–209):
        - Adrenaline: a Gain Adrenaline button, and gained by itself when
          using a power whose text starts with "Risky". It lasts until the
          start of the character's next turn and ends with the combat (in
          combat only). Laugh in Its Face, Press the Advantage and Scramble
          only show while it lasts; the prop d6 is a reminder.
        - Primal Conduit: at the start of each combatant's turn, an ally
          within 5' of the Druid's token regains 1 HP, a foe takes 1 hit
          (through Inflict damage). The stance feats stay reminders.
        - Autodidactism: a spell list choice (other lists cast at Bane), a
          d6 after every spell, scroll and ritual, and after a power with
          the Magic-themed tick (ticked for the class's own powers); a 1
          draws the Photonic Surge table. Harmonious Light heals d4 on a
          surge; Surge Surfer reminds.
        - Call upon the divine: a once-a-day reroll button on the failed
          tests, attacks, defences, gloom tests and spells of the Priest
          and every other player character, pressed by the Priest's player.
        EFFECTS_CONTENT 15.
      - ~~51a3. Sworn to the Saddle, War-Gallop, No Number's rig, Dirge of
        the Unburied, Field notes, Spirit-Linked Steel, Steel and Shot,
        Tome keeper.~~ Done: every class feature has a status. New: an
        item with several Use actions asks which to do; weapons have an
        "Attacks with" ability (the new Spirit-linked sword in
        content/weapons/gifts); spells have an In spellbook box; roll
        effects can be limited to one power by name, and can turn a Ruin
        into a Failure. EFFECTS_CONTENT 16. Rulings GAPS 211–217: Use buttons that make the
        Destrier, Raider-Beast and rig; a Mount up / Dismount switch for
        the saddle benefits (+2 after riding 20' as a tick); Raise thrall
        and Thrall attack (Sanity DR12, d4, counts for multiple attacks;
        removed when the combat ends); a Record button and list for Field
        notes (Boon against listed kinds' gloom abilities, no Study Ruin);
        a new Spirit-linked sword weapon given with the feature (Presence);
        the Flintlock pistol with Agility; an In spellbook box on spells.
    - ~~51b. Area targets (GAPS 141, 218).~~ Done: a power or spell used
      with two or more creatures targeted gets one Inflict button per foe
      (each used once, armour soaks) and one Defend button per character
      or minion other than the user (an Agility defence against the
      card's damage); all share the card's one damage roll, and Fortune
      changes reach every button. A gloom ability with two or more
      targets rolls its damage once on its card; each Test uses it,
      unless Fortune rerolls or maximises that test's damage.
    - ~~51c. What outcomes do to targets (GAPS 219–221).~~ Done: powers
      and spells have a "What it gives" list. Each entry gives, on the
      results it ticks, to each target or to the user: a condition with a
      timer, healing, a buff (the power's buff effects as a temporary
      item named after it, ending with its timer) or a reminder. It is
      given when the card is posted and follows Fortune; the Dark
      Master's client changes creatures the caster cannot. A Sustained
      power's conditions on its user and all its buffs end with it.
      Examples filled in: Song of respite, Savage Leap, Beast Unleashed.
      EFFECTS_CONTENT 17.
    - 51d–51e. Powers (147), in two batches. 51d is Barbarian to Hedge
      Mage (70), in two parts (rulings GAPS 222–228):
      - ~~51d. Tools, then Barbarian, Bard, Brinkwalker, Cavalier and
        Dancer.~~ Done: 34 powers have a status (Not the face! waits for
        51d2's reaction buttons). New "What it gives" kinds: persistent
        damage, damage (armour soaks only when ticked), armour one step
        down until the encounter ends, a level of Fatigued, ending a
        condition, the dance partner (shown on the Dancer's sheet). Entries
        can belong to an option (asked in the power dialog; a second
        option on a Triumph), be given when a Sustained power ends, or go
        to the partner. Buffs on a foe with the new roll kind "Defending
        against this creature" work for its defenders, and can last for
        its next attack only. The report counts these entries and a
        power's own damage. EFFECTS_CONTENT 18.
      - ~~51d2. Tools, then Charioteer, Druid, Fleshwright, Gravecaller
        and Hedge Mage.~~ Done: all 70 powers of 51d have a status. New:
        a Morph's buff replaces the last Morph's and has a Revert (Use)
        button; buff effects can belong to one option (Morphic Surge); a
        buff's gifts go with it (the new Blade-arm weapon in
        content/weapons/gifts); "What it gives" can raise thralls (Call
        the Unburied), hurt the user's rig and trigger a Photonic Surge;
        powers can destroy one, some (asked in the dialog) or all of the
        user's thralls when used, each adding damage (Charnel Charge,
        Flesh Tide; destroyed whatever the result); Reactive Plating and
        Bend Fate are buttons on the character's defence and gloom cards,
        paying their ember and reaction; Not the face! offers a "stay at
        1 HP" button at 0 HP (the wound gained is taken back). Improvised
        Cantrip's damage is d8 (its text). EFFECTS_CONTENT 19.
      51e is Paladin to Wizard (77), in two parts (rulings GAPS 229–232):
      - ~~51e. Tools, then Paladin, Priest, Ranger, Rogue and Scholar.~~
        Done: 35 powers have a status. New: Guardian and Faithful
        intercession are buttons on other characters' defence and gloom
        cards (the protector takes the damage, or half, through their own
        armour); the quarry and the subject are recorded like the dance
        partner and shown on the sheet (Mark quarry's +d4 on the Ranger's
        attacks; Study the specimen's +d6 tick on allies' attacks); marks
        on a foe can help its attackers (Final citation: Boon) or ignore
        tiers of its armour (Read the beast, Point out the flaw); powers
        can ignore armour (Sacred flame, Assassinate); healing can be
        "full" (Absolution); "What it gives" can add to the Ember pool.
        Wounds move to 51e2 with the Sorcerer. EFFECTS_CONTENT 20.
      - ~~51e2. Tools, then Skullrider, Sorcerer, Sword Saint, Warrior,
        Witch Hunter and Wizard.~~ Done: every power has a status (44
        auto, 101 partial, 2 text). New: "What it gives" can add a wound,
        with the Toughness test (Overcharge) or without (Crimson
        bargain); buffs marked "next attack only" on a character are used
        up by their next spell (Overcharge, Perfect casting: Boon, no
        ember, a Ruin is a Failure, a Success is a Triumph); a resist can
        take a die off damage of any type from each hit (Ward of the
        faithful, Guardian's Orbit); roll effects can be limited to one
        power by name (Blood nova's +d6 per wound). EFFECTS_CONTENT 21.
    - 51f. Spells (64), in two parts (rulings GAPS 233–235):
      - ~~51f. Tools, then the Arcane and Divine spells.~~ Done: 32
        spells have a status (9 auto, 19 partial, 4 text). New: options
        in the spell dialog; healing "damage" (as much as the card's
        damage: Hope's Prayer, The Rapture); entries for only the
        targeted allies or only the targeted foes; "while sustained"
        conditions on targets end with the spell and can still have a
        timer; escape-roll timers (at the start or end of the creature's
        turns: a foe rolls d20 against the DR, a character gets a Strength
        test button; The King's Command's Sanity test is a note); "next
        roll only" buffs on characters are used up by the first roll of
        their kind. EFFECTS_CONTENT 22.
      - ~~51f2. The Primal and Profane spells; escape rolls and next-roll
        buffs on powers.~~ Done: all 64 spells have a status. Daring
        Stunt's Seize and Cold Iron Pin escape on d20 12+, Drag Behind on
        14+ (while sustained); Battle cry's Boon is used by the next
        attack. Rounds can be dice with a bonus ("d4 + 2"). Escape tests
        for characters are always Strength: where a spell says Sanity or
        Toughness, a note says so. EFFECTS_CONTENT 23.
    - ~~51g. Rituals (63).~~ Done: every ritual has a status. 60 are
      text (their card shows their text and result). The Zealot's
      Unbreaking Will gives Boon on Panic tests until the next day begins
      (and Frightened immunity is a note); Purge the Blight ends Infected
      (+d6 HP on a Triumph); Martyr's Restoration ends Doomed or Infected
      (an option). EFFECTS_CONTENT 24.

**Milestone 11 review:** a Warrior, a Wizard and a Priest against three
foes, with area spells.

## Milestone 12: Foes

52. **Foes.**
    - ~~52a. Immunities and resistances.~~ Done: `module/rules/resistance.mjs`
      (`foeDamageAfterResists`, `fatigueBlocked`) with
      `tests/resistance.test.mjs`. A foe's passives use the same resist
      and immune effects as characters' feats. Inflict damage buttons
      carry the weapon's, power's or spell's damage type; the foe damage
      card shows the type and a line per resistance ("Test: Fire-Hardened:
      fire damage halved"), before armour (GAPS 236). A
      blocked condition now gives a warning, and an actor immune to
      Fatigued keeps its level when something would raise it. Play-test
      foe: Test: Furnace Hulk in `content/examples/actors/` (not packed).
      Not yet: cold, necrotic and sonic damage, "crushing" and
      "non-magical" (GAPS 237, asked at 52c); Primal Conduit's 1 damage
      has no type.
    - ~~52b. Foe hooks.~~ Done (rulings GAPS 238–242):
      `module/rules/foe-hooks.mjs` with `tests/foe-hooks.test.mjs`. Foes'
      passives now run Events (`runItemHooks`). New events: start of each
      round, and "a creature hits it with a melee attack". New actions:
      add to the Gloom pool (Cold Heart, after the round's fill), and a
      test button for the attacker (Adhesive Hide). A reminder with an
      amount rolls it too. Regeneration: "Unless it took: fire, acid",
      with the damage types a foe took since its last turn remembered by
      Inflict damage and persistent damage. At 0 HP the foe's 0 HP events
      run (reminder and roll). A foe's aura posts a reminder when a player
      character or minion starts its turn within it. Morale: a Morale
      sheet number on a foe's passive, for itself (with an ally count) or
      its allies within a distance, measured between tokens and shown on
      the Morale card. Play-test foes: Test: Cinder Troll and Test: Scrap
      Peasant in `content/examples/actors/` (not packed).
    - ~~52c. Tools for the foes (GAPS 237, 243, 244).~~ Done: cold, necrotic
      and sonic damage; resists limited to weapon attacks ("Shooting or
      thrown weapons", "Any weapon"), passed by the Inflict damage button;
      roll effects for "Casting a spell at this creature"; gloom abilities
      have "What it gives", shown on the card and given when Take is
      pressed (persistent damage, buffs with a timer, Ember lost with
      "-1", through the new `loseEmber`). Test parts on Test: Furnace Hulk
      (Rubbery Hide, Warded Plates, Scorching Breath).
    - 52c2–52h. The 150 foes, about 25 per step, in the order they first
      appear in the rules document: passives and the remaining gloom
      abilities, every foe item with a status. ~~52c2~~ (done) is the
      first 25 (147 items: 91 auto, 16 partial, 40 text; weapons are
      auto, their card deals their damage; a Morale ally count with no
      distance counts allies anywhere on the scene; EFFECTS_CONTENT 25):
      Directorate Surveyor, Godstone Sentinel, Brass Revenant, Cinder
      Mote, Spill Ogre, Blood Vulture, Gasbloat Drake, Soot Drake, Sunscale
      Wyrm, Tenebrous Dragon, The Starless Wyrm, Ceiling Spider,
      Lamp-Snuffer Goblin, Dockside Brawler, Horse, Veilrender,
      Resurrection Man, Mardilar, Hedge Hexer, Charnelkin Warren-Mother,
      Charnelkin, Gear-Hound, Guildforge Journeyman, Sundrinker Bloom,
      Debt-Collector.
    - ~~52d. Foes 26–50 (GAPS 246, 247).~~ Done: The Calibrator to Barbed
      Creeper. New: a resist mode that adds damage ("extra": Sap-Soaked,
      Iron-Averse); resists set to "Optional tick" are asked on the Inflict
      damage card (Iron-Averse: an iron or steel weapon?); a gloom
      ability's own conditions count for the report. Duskborn's Boon and
      Bane, the Corpse Stealer's DR10/DR14, Shoulder to Shoulder are ticks;
      Mob Courage, Regeneration, Master Mechanism and Cold Heart work. The
      Last Hour's Ruin is Frightened for d4 rounds, as its text says, and
      Stupefied for 1. EFFECTS_CONTENT 26.
    - ~~52e. Foes 51–75 (GAPS 248).~~ Done: Heretic Priest to Pit Warden.
      New: spell damage is marked on the Inflict button, so a resist can
      be limited to spells (Aether Ward: d4 less). Adhesive Hide and Ember
      Robes use the 52b tools; Morale auras (Desecrated Symbol,
      Commander's Presence); regrowth at turn or round start; Iron-Bane;
      Brittle doubles blunt weapons. Snare of Seasons' Ruin is Restrained
      with no timer and Slowed for 1 round, as its text says; The Unmaking
      and The Great Silence add Deafened on a Ruin. Acid vomit and Acid
      seed volley deal acid. EFFECTS_CONTENT 27.
    - ~~52f. Foes 76–100 (GAPS 249–251).~~ Done: Gutter Cutpurse to
      Cairn-Crab. New: "when its weapon attack hits", run when the
      creature presses Take (the defence card now knows its foe): the
      creature gains a condition or persistent damage, or a reminder is
      posted (Burrow, Latch, Hardening Sap, Loose Threads; and Tangle and
      Death Grip from 52d). "The first time it would drop to 0 HP, stay at
      1 HP" (Abandon Shell, losing its armour), done before HP is saved, so
      the damage card shows the HP kept. Black Salt Haemorrhage's Ruin
      gives d4 persistent bleeding. EFFECTS_CONTENT 28.
    - ~~52g. Foes 101–125.~~ Done: Spine-Whistler to Tusked Boar. New: a
      "when its attack hits" passive can need a defence Ruin (Plague-
      Carrier, Eye-Taker, Oil-Slick: the defence card's Take passes its
      result), and the condition it gives can last a number of rounds
      (Hollow Shriek: Deafened for 1). Hollow Bones doubles blunt weapons;
      Venom gives d2 persistent poison; Dreaming Skin's Toughness button;
      Ferocity stays at 1 HP (falling at the end of its next turn is a
      note). Grey Wolf's Hamstring Ruin is Prone with no timer and Slowed
      for 1 round, as its text says. EFFECTS_CONTENT 29.
    - ~~52h. Foes 126–150 (GAPS 252).~~ Done: Pit Mastiff to Headless
      Courier. Every foe item now has a status (783: 507 auto, 120 partial,
      156 text). New: area Inflict buttons are marked as areas, so a
      resist can be limited to areas or to single-target hits (Flock); "stay
      at 1 HP" can skip fire ("Unless it took") and an attack's Triumph
      (Undying: the Inflict button passes the Triumph); "when its attack
      hits" can name one attack (Needle Teeth). An "any weapon" resist
      now needs a melee, shooting or thrown attack. Salt spit deals acid,
      Barrow-blade bleeding. EFFECTS_CONTENT 30.

**Milestone 12 review:** fight three foes with resistances and
regeneration.

## Milestone 13: Relics and gear

53. **Relics and gear.**
    - ~~53a. Relics (22): uses and hooks (GAPS 253, resolved).~~ Done: every relic
      has a status (5 auto, 1 partial, 16 text); a status covers the
      relic's effect, while Last Rites and drawbacks stay text. A relic's
      Use button now runs its Use effects. A relic spent anywhere else (a
      hook, an immunity, a card button) rolls its Expendable d20 on a card
      of its own and is destroyed on a 1. Saint's knucklebone: roll twice
      and choose on Death's Door. Vex's loaded die: a "Turn over" button on
      its owner's test, attack, defence, gloom, power and spell cards (21
      minus the kept die, never a natural 1 or 20; a reroll undoes it).
      Antler of the Glass Stag: once-per-day immunity to Charmed and
      Frightened, spent when it keeps one off (an unlimited immunity is
      used first). Hearth-tallow of Anashe (partial): Use when the party
      begins a rest; the Dark Master's next Rest ignores the Interrupted
      ticks and says why. The Shard's Ember gain counts as its effect in
      the report. EFFECTS_CONTENT 31.
    - 53b. Gear and weapons: poisons (a Toughness button and a condition),
      thrown area items and grenades (area targets of 51b), the
      blunderbuss's damage by range, lockpicks with a die per result (GAPS
      55). Partly done: red poison is used on targets or coats a weapon
      (GAPS 283); weapon attacks can hit several targets; the blunderbuss
      deals d10 in range and d4 beyond. Still open: lockpicks' two dice
      (GAPS 55).
    - ~~53c. Styled journal pages.~~ Done: a "Document (VÅR BORG)" page
      type with four looks (field journal, letter with signature and wax
      seal, notice, torn scrap), CSS only. Field notes' Record button also
      writes a page per kind into the Scholar's "Field notes" journal
      (GAPS 214); the Dark Master's Foundry makes the journal the first
      time.

**Final review:** the automation report shows no item without a status.

---

## Built after the plan

Work done after step 53, mostly from playtest and player feedback. Each
item names its GAPS ruling where there is one.

54. **Random generation** (done). 54a Creation Helper world setting, off by
    default. 54b personality tables and Details dice (GAPS 255). 54c random
    character generator (GAPS 256). 54d random Improving feat and finds
    (GAPS 257). 54e one chat card. 54f–g the randomiser wipes the old
    character and rolls a name (GAPS 256, 258).
55. **Player feedback** (done). Optional Weather subsystem setting (GAPS
    261); Ancient One picks a general feat (GAPS 262); players can improve
    and choose the feat group (GAPS 263); one Interact button for every
    consumable (GAPS 260); Take cover as a basic action (GAPS 264);
    flickering token light, putting out a light, dimming a lantern to 5
    feet; retargeting an attack card; the Ongoing panel of running
    effects; a quick-roll bar above the chat box.
56. **Treasure and encounters** (done). Chests with items and silver;
    spell scrolls made from spells (GAPS 266); the encounter builder
    (GAPS 267–269); the treasure generator (GAPS 270–273).
57. **The map** (done). In Darkness marker from scene lighting (GAPS 274);
    token movement with speeds, Move actions, leftover feet and difficult
    terrain (GAPS 275–282); token vision by default.
58. **Areas of effect** (done). Spell, power and gloom areas as Foundry
    Regions: aim, target everyone caught, keep sustained and lasting areas
    (GAPS 284); weapon attacks on several targets; red poison (GAPS 283).
59. **Code review** (done; REVIEW.md, 14 November 2026). Fixes from
    REVIEW.md steps 1–9; class drops give the class feature and power, with
    a confirmation (GAPS 285, 286); one shared Boon and Bane count;
    double-click guards; a tidy-up pass.
60. **Look and equipment** (done). Light and dark moods (styles/DESIGN.md);
    the Equipment tab with worn and held slots (GAPS 287, 288); fifteen
    damage types (GAPS 289, DAMAGE_TYPES_REVIEW.md).
61. **Calendar & Time panel** (done). Month grid,
    moon phases (GAPS 292), Set date (GAPS 291), day notes and a day log;
    moving the clock several days opens each New day in turn (GAPS 290).
62. **Omens of Misery** (done; GAPS 307). A world setting, Dying of the
    light, swaps the light die for the Omens of Misery: each Misery keeps a
    track of six omens, the travel Omen results move them on (random by a
    roll, nearest by the Dark Master), and the next Misery comes on the
    next Omen once the newest has had the set number (1 to 6). The full
    omen text of all 36 results is in lang/en.json.
