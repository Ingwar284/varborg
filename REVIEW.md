# VÅR BORG code review — 14 November 2026

**Overall health.** The system is in good shape for its size. The rules tables were compared with the rule document and match almost everywhere; the compendium content (1,053 files) has no schema errors, no broken links and no invalid effects; the language file has no missing keys and British spelling throughout; and the chat-card hook handlers all return early when a card is not theirs, so they are not a speed problem. Most of what is wrong is small and sits at the edges: buttons that can be pressed twice, chat cards that forget they were used, and the same logic written several times.

**Tally across the four checking passes:** 170 confirmed, 75 refuted (alarms that turned out to be fine), 13 unsettled. About eight findings appear in two checking files and are counted twice, so the unique figures are slightly lower (12 distinct unsettled). I found no case of two checking files giving opposite verdicts; the Death's Door feat count is "unsettled" in both, with differing impact ratings (section 7, Q1).

**Most worth doing first:**
1. The one HIGH bug: a player's lingering spell or power area silently never appears (section 2, B1).
2. Dragon's Shadow does the opposite of the feat (section 1, R1), plus the other four small rule fixes there (Blinded, Stupefied, foe not marked defeated, dropped-item tick).
3. One shared "this card button can only be used once" helper, which removes a whole family of repeat-use bugs (section 3, S1).
4. Relic number 2 cannot be found by the treasure roll (B9), a one-line identifier fix.

Sizes below: small = under an hour of work, medium = a few hours, large = a day or more.

---

## 1. Rules contradictions (the game plays wrongly)

| # | What happens at the table | What the rules say | Where | Fix | Size |
|---|---|---|---|---|---|
| R1 | **Dragon's Shadow makes foes braver.** A Dragonkin ticks the feat and the foe's Morale roll keeps its two lowest dice, so it is less likely to flee. Impact HIGH. | GAPS 182: foes within 10' roll Morale as 3d6 keeping the two highest. The test feat `test-dreadful-presence.json` already does this with a Bane. | [dragons-shadow.json:25](content/feats/ancestry/dragonkin/dragons-shadow.json:25), [morale.mjs:112](module/rules/morale.mjs:112), [morale.mjs:176](module/dice/morale.mjs:176) | Change the feat's grant from "boon" to "bane"; keep the card wording as the designer wants. | Small |
| R2 | **Blinded does not make terrain difficult.** A Blinded token pays normal movement. Impact MEDIUM. | Rule document 3.13 Blinded: "All terrain is difficult terrain." | [movement.mjs:103](module/rules/movement.mjs:103) | Add a Blinded case to the "always difficult" test. | Small |
| R3 | **A Stupefied foe's gloom abilities give the defender no Boon.** Impact MEDIUM. | Rule document 3.13 Stupefied (Foe line): "Creatures defend against its gloom abilities with Boon." GAPS 75 does not cover it. | [gloom.mjs:164](module/dice/gloom.mjs:164); compare [defence.mjs:463](module/dice/defence.mjs:463) | Add a Stupefied-foe Boon to the gloom defence modifiers. (The other Foe lines are a question, Q6.) | Small |
| R4 | **A foe dropped to 0 HP by a power's secondary damage is not marked defeated.** It stays active in the Combat Tracker and gets no Morale prompt. 11 shipped powers use this (e.g. Blood Bolt, Flesh Tide). Impact MEDIUM. | GAPS 71: a foe at 0 HP is marked defeated. Five other code paths already do it. | [outcomes.mjs:285](module/outcomes.mjs:285) | Call the defeat step after the damage (see S8). | Small |
| R5 | **A dropped weapon, armour or shield still has a working equip tick** that equips and picks it up in one click. Impact MEDIUM. | GAPS 254: a dropped item's buttons are hidden until it is picked up through "Stored in". | [inventory-row.hbs:4](templates/actor/inventory-row.hbs:4), [character-sheet.mjs:622](module/sheets/character-sheet.mjs:622) | Hide the tick for dropped items (and decide the same for the cumbersome toggle). | Small |
| R6 | **Two drivers can be set on a vehicle**; the second is silently ignored and the first still rolls. Impact MEDIUM. | GAPS 175 describes one driver. | [vehicles.mjs:85](module/vehicles.mjs:85), [vehicles.mjs:140](module/rules/vehicles.mjs:140) | When someone is made Driver, set any other driver to crew. | Small |
| R7 | **A Triumph's free driving Boon never expires**, so it can help a driving test weeks later. Impact MEDIUM. | The rules say the Boon is for the next driving test "this encounter". | [vehicles.mjs:209](module/vehicles.mjs:209), [vehicle.mjs:10](module/data/vehicle.mjs:10) | Clear it when the combat ends, or store the combat with it. | Small to medium |
| R8 | **"A metal file and lockpicks" is priced at 5 s** in starting kit; it should be 15 s. Impact LOW. | Rule document 4.1: Lockpicks 5 s, Metal file 10 s; GAPS 180(c): each item in a two-item row gets its 4.1 price. | [creation.mjs:172](module/rules/creation.mjs:172) | Price 15, or split into two items. | Small |

Known deliberate differences from the rule document (not bugs; recorded in GAPS): overloaded movement 0 (GAPS 21), medicine box needs a Toughness DR12 test (GAPS 41/43/149), DR12 scrolls priced 120 s (GAPS 266), Handcart replacing the small wagon (GAPS 259), Fortune able to lower damage to 0 (GAPS 109, still marked Open). Several are questions in section 7.

---

## 2. Bugs

### HIGH impact

**B1. A player's lingering area never appears.** When a player casts a spell or power whose area lingers with difficult ground or lasting effects (for example Songs of power), Foundry only lets a Dark Master create such an area. The player's attempt fails, only a console error is written, and nobody is told.
- Where: [areas.mjs:238](module/areas.mjs:238); callers [spell.mjs:341](module/dice/spell.mjs:341), [power.mjs:446](module/dice/power.mjs:446).
- Fix: send the request to the connected Dark Master (the same pattern light.mjs and pools.mjs already use, see S3), and warn the player if no Dark Master is online.
- Size: medium.

### MEDIUM impact

**B2. A contested test does not use up "next roll only" buffs.** The buff helps the contest and is then still there for the next ordinary test, so the player gets it twice. [contested-test.mjs:80](module/dice/contested-test.mjs:80). Fix: call the use-up step for both "test" and "contest" kinds after line 80 (S7). Small.

**B3. Fortune is spent and not refunded when a thrall power has no thralls.** A player buys a Boon with Fortune, the power needs thralls, there are none, and the Fortune is lost for nothing. [power.mjs:349](module/dice/power.mjs:349), [fortune.mjs:462](module/fortune.mjs:462). Fix: move the thrall check above the Fortune payment. Small.

**B4. Ember gained by an outcome is not taken back when Fortune changes the result.** Triumph, Success, Triumph again would pay the Ember twice. Affects Unravel and Purge Pulse. [outcomes.mjs:367](module/outcomes.mjs:367), [outcomes.mjs:412](module/outcomes.mjs:412). Fix: record the amount and reverse it in the undo (S8). Small.

**B5. Rig damage is skipped silently when the user does not own the vehicle.** The card says the rig was hurt; its HP does not change. [outcomes.mjs:335](module/outcomes.mjs:335). Fix: route the write through the Dark Master (S3). Small to medium.

**B6. "Once only" card buttons are not remembered for players.** Foundry only lets a card's author or a Dark Master change the card. When a player presses "Not the face!" (Stay), "Resist" on a poison card, "Steady nerves" or the Panic table button on a card someone else posted, the effect happens but the "used" mark is not saved. After a page reload the button works again: the wound is removed twice, poison damage taken twice, a second Panic table roll, ember paid twice.
- Where: [effects.mjs:648](module/effects.mjs:648) (payment at :661, mark at :667), [poison.mjs:147](module/poison.mjs:147), [panic.mjs:287](module/panic.mjs:287), [panic.mjs:311](module/panic.mjs:311).
- Fix: the shared once-only helper (S1). Medium.

**B7. The Shadowblight button can be pressed again and again.** The button re-enables itself after every roll and the card is never marked, so a player can reroll the table until they like the result. [shadowblight.mjs:30](module/shadowblight.mjs:30). Fix: S1. Small.

**B8. Two players pressing Fortune buttons on one card at the same moment can both burn Fortune** while only one change shows on the card. [fortune.mjs:273](module/fortune.mjs:273), [fortune.mjs:418](module/fortune.mjs:418). Fix: run Fortune spending through the same one-at-a-time queue that pools.mjs uses (S2). Small.

**B9. Relic number 2 cannot be found.** One roll in 24 on the relic table says the relic "is not found in the compendiums", although the Shard of the Great Brazier exists. It still carries an old example identifier (`vbExampleShard00`) while the treasure code looks for `vbRelic002000000`. [treasure.mjs:226](module/treasure.mjs:226), [shard-of-the-great-brazier.json:2](content/relics/shard-of-the-great-brazier.json:2), also [relics-1-12.json:30](content/tables/relics-1-12.json:30). Fix: give it the normal identifier, update the table reference, rebuild packs. A test that relics 1 to 22 all resolve would catch this class of mistake (S12). Small.

**B10. Dropping a class on a character sheet does not add its class feature or class power**, and dropping a second class leaves the first one's feature and power behind. Only the Creation Helper and Random character do it properly, and the helper is hidden unless a world setting is on (GAPS 256). No GAPS entry rules this out (GAPS 102 only covers replacing). [character-sheet.mjs:600](module/sheets/character-sheet.mjs:600), [origins.mjs:43](module/origins.mjs:43), [creation.mjs:145](module/creation.mjs:145). Fix: call the same class-applying routine from the drop. Medium. (Q27 asks whether this is wanted.)

**B11. The Light button can be pressed twice**: two lights, two torches used up (or an error on the last one), two cards. [light.mjs:414](module/light.mjs:414), [character-sheet.mjs:647](module/sheets/character-sheet.mjs:647). Fix: the busy guard (S2). Small.

### LOW impact (compact table, duplicates merged)

| # | What | Where | Size |
|---|---|---|---|
| L1 | Take damage writes a card mark a non-author cannot write; the button can be reused | [defence.mjs:685](module/dice/defence.mjs:685) | S |
| L2 | Gloom hit that kills: effects applied but no card lists them | [defence.mjs:678](module/dice/defence.mjs:678) | S |
| L3 | Gloom card passes a blank damage type, so no suggested injury type at 0 HP | [gloom.mjs:262](module/dice/gloom.mjs:262) | S |
| L4 | Names put into chat cards without escaping (a name with "<" or "&" garbles the card) | [defence.mjs:547](module/dice/defence.mjs:547), [attack.mjs:592](module/dice/attack.mjs:592), [timers.mjs:113](module/timers.mjs:113), [persistent.mjs:145](module/persistent.mjs:145), [combat.mjs:363](module/combat.mjs:363), [agony.mjs:171](module/agony.mjs:171), [deaths-door.mjs:279](module/deaths-door.mjs:279), [panic.mjs:112](module/panic.mjs:112), [shadowblight.mjs:53](module/shadowblight.mjs:53), [pools.mjs:244](module/pools.mjs:244), [days.mjs:184](module/days.mjs:184) | S each, M overall |
| L5 | Renamed "Steady nerves" item shows `&#39;` (name escaped twice) | [panic.mjs:137](module/panic.mjs:137) | S |
| L6 | Reaction power paid with no "no reaction left" warning | [power.mjs:131](module/dice/power.mjs:131) | S |
| L7 | Area targets and single target read at different times; retargeting with the dialogue open can split them | [power.mjs:273](module/dice/power.mjs:273), [spell.mjs:144](module/dice/spell.mjs:144) | S |
| L8 | Spell dialogue lacks the armour and Encumbered notes the power dialogue shows | [spell.mjs:163](module/dice/spell.mjs:163) | S |
| L9 | A failed Dark Master request is recorded as done; a failed undo is dropped | [outcomes.mjs:109](module/outcomes.mjs:109) | S–M |
| L10 | Stale sustained-condition mark after a Fortune undo can switch off another power's condition | [outcomes.mjs:128](module/outcomes.mjs:128) | S |
| L11 | Thrall count typed as a dice formula ("1d3") raises none | [outcomes.mjs:328](module/outcomes.mjs:328) | S |
| L12 | Restored armour value can be stale; unused `combat` field | [outcomes.mjs:305](module/outcomes.mjs:305) | S |
| L13 | Heal line says "healed 0" at full HP | [outcomes.mjs:243](module/outcomes.mjs:243) | S |
| L14 | Morale button has no guard; a second click posts a second card | [morale.mjs:368](module/dice/morale.mjs:368) | S |
| L15 | Item sheet cannot set the amount for thralls, rig damage or Ember outcomes | [outcomes-part.mjs:35](module/sheets/outcomes-part.mjs:35) | S |
| L16 | A mistyped dice formula in an item effect stops the whole item card (9 places) | [effects.mjs:389](module/effects.mjs:389) | S |
| L17 | Overlapping lasting areas: leaving one drops a condition the other still gives | [lasting.mjs:259](module/lasting.mjs:259) | S |
| L18 | Escape timer on a power's buff throws an error at turn start/end (no shipped content does this) | [timers.mjs:147](module/timers.mjs:147) | S |
| L19 | Persistent-damage hook claims the damage was done when the formula was refused, and spends a use | [effects.mjs:413](module/effects.mjs:413) | S |
| L20 | Marks on a foe and ally bonuses ignore the character's facts (no shipped content affected) | [effects.mjs:46](module/effects.mjs:46) | S |
| L21 | Death hooks with a limited use are never marked used (all four shipped have none) | [effects.mjs:717](module/effects.mjs:717) | S |
| L22 | Wake button on the sheet can wake twice on a double click | [deaths-door.mjs:491](module/deaths-door.mjs:491) | S |
| L23 | Fight-end clean-up starts about ten jobs with no waiting and no error message | [combat.mjs:201](module/combat.mjs:201) | M |
| L24 | Player spending Ember with no Dark Master sees a literal "{pool}" | [pools.mjs:152](module/pools.mjs:152) | S |
| L25 | Limited-use item, relic Use, medicine box and Last Rite can each be applied twice from two open dialogues | [uses.mjs:138](module/uses.mjs:138), [relics.mjs:94](module/relics.mjs:94), [relics.mjs:158](module/relics.mjs:158), [medicine.mjs:86](module/medicine.mjs:86) | S each |
| L26 | A character killed by poison still gets persistent poison damage | [poison.mjs:187](module/poison.mjs:187) | S |
| L27 | Blank line on a poison card if the coated weapon is gone | [poison.mjs:89](module/poison.mjs:89) | S |
| L28 | Creation Helper: applying the class twice adds the spell twice | [creation.mjs:598](module/creation.mjs:598) | S |
| L29 | Creation Helper: changing ancestry without picking a feat keeps the old ancestry's feat | [creation.mjs:525](module/creation.mjs:525) | S |
| L30 | Creation Helper: changing from Doomsworn keeps the d2 Fortune | [creation.mjs:548](module/creation.mjs:548) | S |
| L31 | Creation Helper: class step posts two cards; no-permission message says the dog is missing | [creation.mjs:148](module/creation.mjs:148), [creation.mjs:169](module/creation.mjs:169) | S |
| L32 | Repeated Personality draws are posted to chat; random character card omits the Details dice and a background's d100 | [personality.mjs:38](module/personality.mjs:38), [random-character.mjs:132](module/random-character.mjs:132) | S |
| L33 | A capped ability still shows an arrow ("▲ +6 → +6") | [improving.mjs:297](module/improving.mjs:297) | S |
| L34 | A failed migration would re-run the Sanity restore on every load (current world is fine) | [migrate.mjs:84](module/migrate.mjs:84) | S |
| L35 | "Choose again" leaves the old feat or spell on the sheet beside the new one | [choices.mjs:156](module/choices.mjs:156) | S |
| L36 | Import of examples stops half-way and does not say what was created | [examples.mjs:48](module/examples.mjs:48) | S |
| L37 | Encounter card drops places with no foe silently; builder and card threat totals disagree | [encounters.mjs:153](module/encounters.mjs:153), [encounters.mjs:319](module/encounters.mjs:319) | S |
| L38 | Chests: silver can be paid twice on near-simultaneous requests; a second "Dropped items" chest on first use; Dark Master side does not check the player is next to the chest | [chests.mjs:227](module/chests.mjs:227), [chests.mjs:352](module/chests.mjs:352), [chests.mjs:373](module/chests.mjs:373) | S each |
| L39 | New day can be started again while the previous day is still running | [panels.mjs:106](module/panels.mjs:106), [days.mjs:84](module/days.mjs:84) | S |
| L40 | Spend panel stays disabled if the spend fails; calendar panel cannot draw if the clock is negative | [panels.mjs:244](module/panels.mjs:244), [calendar.mjs:57](module/calendar.mjs:57) | S |
| L41 | Ability + and − and the equip/cumbersome ticks can lose a step on a fast double click | [character-sheet.mjs:870](module/sheets/character-sheet.mjs:870) | S |
| L42 | Prone test button stays live while its test dialogue is open | [vehicles.mjs:385](module/vehicles.mjs:385) | S |
| L43 | Light timer checkpoint save is not queued with light changes | [light.mjs:160](module/light.mjs:160) | S |
| L44 | Thrall that cannot join combat fails silently; moving cargo can duplicate if the delete fails; stray entry in movement charges map | [minions.mjs:273](module/minions.mjs:273), [vehicles.mjs:125](module/vehicles.mjs:125), [movement.mjs:161](module/movement.mjs:161) | S each |
| L45 | Scroll sheet has no Area section; hand-made scrolls cannot have an area (rated LOW; no GAPS ruling) | [item-sheet.mjs:393](module/sheets/item-sheet.mjs:393) | M |
| L46 | Needle Teeth hook compares the weapon name case-sensitively and silently stops if retyped | [item-effects.mjs:1139](module/rules/item-effects.mjs:1139) | S |
| L47 | With two Dark Masters online, "Lower armour", "Table of Agony", "Place treasure", "Fortune gift" and "New timer" can be pressed by both | [effects.mjs:678](module/effects.mjs:678), [light.mjs:515](module/light.mjs:515), [agony.mjs:349](module/agony.mjs:349), [treasure.mjs:326](module/treasure.mjs:326) | S once S1 exists |

---

## 3. Shared fixes (one change that removes many problems)

Suggested order is the number in the first column.

| Order | Shared fix | What it is | Fixes | Places it would be used | Size |
|---|---|---|---|---|---|
| S1 (3rd) | **Once-only chat-card button helper** (`card-once.mjs`) | One routine that remembers a card button was used, asks the Dark Master's client to save the mark when the player cannot, and releases it if the action was refused. | B6, B7, L47, L1 | [effects.mjs:648](module/effects.mjs:648) and :678, [poison.mjs:135](module/poison.mjs:135), [panic.mjs:274](module/panic.mjs:274) and :298, [shadowblight.mjs:22](module/shadowblight.mjs:22), [light.mjs:515](module/light.mjs:515), [treasure.mjs:326](module/treasure.mjs:326), [agony.mjs:343](module/agony.mjs:343), [morale.mjs:337](module/dice/morale.mjs:337), [attack.mjs:602](module/dice/attack.mjs:602), [defence.mjs:690](module/dice/defence.mjs:690), optionally persistent.mjs:251, vehicles.mjs:370, medicine.mjs, ammunition.mjs. Also a small "not yours" warning helper replacing 11 copies. | Medium |
| S2 (6th) | **Busy guard and queued Fortune spending** | A small "this is already running" guard for buttons that read, wait, then write; and Fortune spending sent through the existing one-at-a-time queue. | B8, B11, L14, L22, L25, L38 (silver), L39, L41, L42 | lightItem in [light.mjs](module/light.mjs), [character-sheet.mjs:622](module/sheets/character-sheet.mjs:622) and :870, [vehicles.mjs:385](module/vehicles.mjs:385), [morale.mjs:368](module/dice/morale.mjs:368), [deaths-door.mjs:491](module/deaths-door.mjs:491), uses.mjs, relics.mjs, medicine.mjs, chests.mjs, days.mjs; fortune.mjs applyFortune. The checking passes proposed this as two helpers (`onceClick`, `guardOnce`); one small file can hold both. | Small–medium |
| S3 (1st) | **Ask-the-Dark-Master helper** | One routine for "a player's computer needs something only a Dark Master may do", using the request pattern light.mjs and pools.mjs already have. | B1, B5, L1 | areas.mjs keepArea, outcomes.mjs rig damage, defence.mjs card mark, S1's card claim | Medium |
| S4 (7th) | **Shared "post a small card" helper that escapes names** | One routine that builds a card line, escapes names and chooses the speaker; also "spend an action and post a card". | L4, L5, L6 | timers.mjs, persistent.mjs, combat.mjs, agony.mjs, deaths-door.mjs, manual-actions.mjs, panic.mjs, shadowblight.mjs, pools.mjs, effects.mjs, days.mjs, attack/defence/power/expendable/gloom/outcomes (action-spending cards), creation/origins/improving/random-character/rest/relics/uses/weather/travel (card posting) | Medium overall |
| S5 (8th) | **One Boon/Bane counting helper** | One function, in rules/test-roll.mjs, that works out how many dice to roll from the Boons and Banes. | Tidy-up; makes new Boon/Bane sources one-place changes | ability-test.mjs (two places), attack.mjs, defence.mjs, contested-test.mjs, power.mjs, spell.mjs, gloom.mjs, dialog.mjs summary | Medium |
| S6 (11th) | **One shared power/spell roll flow** | The power and spell pipelines repeat about a dozen steps and have drifted (B3 and L8 both came from that). | B3 (root), L6, L7, L8 | [power.mjs:260](module/dice/power.mjs:260) to :449, [spell.mjs:132](module/dice/spell.mjs:132) to :348 | Large |
| S7 (5th) | **One "use up next-roll buffs" call per roll kind** | A single `afterRoll(actor, kinds)` so no roll kind can forget it. | B2 | ability-test, attack, defence, power, spell, gloom, contested-test | Small |
| S8 (4th) | **Complete undo records and one foe-defeat step** | Everything an outcome gives must be recorded so a Fortune change can undo it; one `applyFoeHp` step for "foe reaches 0 HP". | R4, B4, B5, L9, L10 | settleOutcomes/undoOutcome in outcomes.mjs; morale.mjs, vehicles.mjs, persistent.mjs, minions.mjs, deaths-door.mjs | Small–medium |
| S9 (12th) | **Shared sheet base for foe, minion, vehicle and chest sheets** | One base class and one data-helper file for what those sheets repeat. | Tidy-up only | foe, minion, vehicle, chest sheets; about ten data files (`wholeNumber`, `choice`, `labels`); item-buttons partial | Large |
| S10 (9th) | **One definition for repeated rule constants** | Export each constant once and import it. | Tidy-up; prevents future disagreement | Fortune die (three copies in rules/rest.mjs, rules/fortune.mjs, rules/item-effects.mjs), persistent types (three), effect amount actions, EFFECT_KINDS, armour dice (rules/defence.mjs, rules/foe.mjs), MINIMUM_DAMAGE (rules/vehicles.mjs, rules/defence.mjs), edge-distance bulk, move budget, speeds, origin-card path, hazardName, `signed`, `rollInto`, `findJson` | Small each |
| S11 (10th) | **Small helpers**: `isActiveGM()`, `runningCombatId()`, `safeRoll(formula)`, one `ownCharacter()`, `conditionEffect` shared | Replace repeated one-liners. | L16 (safeRoll), tidy-up | lasting, areas, combat, darkness, calendar, light, pools, chests, field-journal, migrate, refresh-effects (GM check); effects.mjs (formula and combat id); defence/gloom/chat-rolls | Small |
| S12 (2nd) | **A test that every relic 1 to 22 resolves to a file** | Catches identifier mismatches like B9. | B9 (and the class of bug) | tests/ | Small |

Suggested order, in words: S3 first (it fixes the HIGH bug), then S12 with B9, then S1, S8, S7, S2, S4, S5, then S10 and S11 alongside tidy-up, and S6 and S9 last because they are large and change a lot of code at once.

---

## 4. Speed

Honest summary: **nothing confirmed here would be noticed at a normal table.** Most were refuted outright (the 22 chat-render handlers, new-day loops, darkness check, refresh-effects, area hooks) because they run rarely, are guarded early or touch a handful of items.

Confirmed and worth knowing:

| What | Where | Would anyone notice? |
|---|---|---|
| The Ongoing panel redraws (debounced 100 ms) on every token move and every item or effect change in the world, even for other characters | [ongoing-panel.mjs:119](module/ongoing-panel.mjs:119) | Possibly, on a busy scene with many tokens moving. Fix is a small early return for other actors. Small. |
| Minion changes redraw the owner's open sheet immediately each time | [minions.mjs:380](module/minions.mjs:380) | Slightly, with a swarm of minions taking damage. Small. |
| Two small database writes per attack in combat | [attack.mjs:146](module/dice/attack.mjs:146), [combat.mjs:279](module/combat.mjs:279) | No. |
| Item and actor lookups repeated on each attack, power or spell roll; every new effect walks the item list first | [effects.mjs:49](module/effects.mjs:49), [conditions.mjs:78](module/conditions.mjs:78) | No. |
| Random character makes about twenty separate updates; Calendar panel redraws several times per new day; shared silver and thrall writes one at a time | random-character.mjs, panels.mjs:310, chests.mjs:239 | A short pause once per use at most. |
| Small repeated work on sheet redraws, flying-token shadow per frame, per-second light tick, effect label maps, area scans on item delete | character-sheet.mjs, token.mjs, light.mjs, item-effects-part.mjs, areas.mjs | No; negligible at table sizes. |

Unsettled (needs a running Foundry, see Q22 and Q24): the reach search per token drag (up to 5,000 squares on a walled map) and the character data preparation with about 100 items.

---

## 5. Tidy-up

"V" = confirmed by a second reader; "L" = an unverified lead (found by a script or first reader, not re-checked).

### Dead code and unused items

| What | Where | V/L |
|---|---|---|
| Exports used only by tests: `sortInitiative`, `freshTurn`, `classFeatureText`, `dieFaces`, `formatFoeArmour`, `isMorale`, `START_MISERY`, `miseryAfterDawn`, `spellOutcome`, the `counterAttack` field | rules/initiative.mjs:97, rules/actions.mjs:15, rules/feats.mjs:50, rules/creation.mjs:27, rules/foe.mjs:44/61, rules/misery.mjs:52/109, rules/spells.mjs:119, rules/defence.mjs:131 | V |
| Exports with no user: `CARRYING_STATES`, `MOOK_POINTS`, `PHASES`, weather `KINDS`, `areaKey`, `MOVEMENT_TYPES`, `DISPLAY.*`/`DISPOSITION.SECRET`, `rollAgony` (export only), `CalendarPanel` (export only), `BUILT_KINDS` (same list as `EFFECT_KINDS`) | rules/carrying.mjs:21, rules/encounters.mjs:24, rules/calendar.mjs:53, rules/weather.mjs:31, rules/areas.mjs:176, rules/movement.mjs:19, rules/tokens.mjs, agony.mjs:217, panels.mjs:80, rules/item-effects.mjs:29 | V |
| `restOutcome` returns a `days` field nobody reads; unused import `withNotedKind`; unused parameter `old`; unread `context.isGM` | rules/rest.mjs:127, effects.mjs:17, creation.mjs:426, character-sheet.mjs:444 | V |
| Relic `saleValue`, `factionValue`, `faction` are typed in but never read (record-keeping; confirm intent) | data/relic | V |
| Lang keys never used: `SystemTitle`, `Panic.LostSanity`, `Panic.LostSanityHint`, `Effects.RerollSpent`, `Improving.Button`, `Creation.Button` | [en.json:33](lang/en.json:33), :1147, :1148, :3178, :2597, :2657 | V (Q31) |
| Stylesheet: rule for `.heading-with-button` has no user — Fixed in the UI redesign (see styles/DESIGN.md). | [sheets.css:730](styles/sheets.css:730) | V |
| Stylesheet: custom properties `--vb-hatch`, `--vb-neutral`, `--vb-magic` unused — Fixed in the UI redesign (see styles/DESIGN.md). | [tokens.css:24](styles/tokens.css:24), :44, :47 | L (grep-checked by the auditor, not re-read) |
| Stylesheet: overridden declarations that never apply (pool-count colours and width, misery-icon opacity, attack-ruin colour) — Fixed in the UI redesign (see styles/DESIGN.md). | apps.css:92-105, :412-415; [sheets.css:297](styles/sheets.css:297) | L |
| Dead default value `"loseArmour": false` in Hollow Prior | content/foes/hollow-prior.json | L |
| Other dead leads not re-checked: `CATEGORIES` filter in the encounter builder, unused `all` parameter, effect actions on sheets without effects, several unread sheet context fields (partly wrong: `reloadTooltip` is read), dead custom properties | various | L |

### Duplicated code (all verified unless marked)

| What | Where | V/L |
|---|---|---|
| Boon/Bane counting written in 7 places | see S5 | V |
| `armourLabel` and `dieLabel` identical; armour die list twice; `withChosen` written twice; `MINIMUM_DAMAGE` twice | attack.mjs:693, defence.mjs:439, outcomes.mjs:307; rules/defence.mjs:46, rules/foe.mjs:24; power.mjs:47, spell.mjs:296; rules/vehicles.mjs:74, rules/defence.mjs:55 | V |
| `conditionDoc` copies `conditionEffect`; `ownCharacter()` defined twice; "I am the GM" written three ways — Partly fixed in PLAN step 66 (one list of effects, GAPS 312): `conditionDoc` is gone, the Ongoing panel and sheet share timers.mjs (`timerOf`, `setTimer`). The other two are not rechecked. | ongoing.mjs:43, timers.mjs:31; defence.mjs:731, gloom.mjs:431 | V |
| Panic test logic twice; two near-identical click handlers; Misery glue re-implements the dawn logic the tests check | panic.mjs:82/202, :274/:298; misery.mjs:115, rules/misery.mjs:109 | V |
| `cardText`, frequency label helper, `signed`, `rollInto`, origin card path (3 files), `hazardName` (3 files), `findJson` (2 tools), compendium copy onto actor, two migration steps, window-redraw loop, `removeThralls`/`deleteThralls`, speeds worked out twice, move budget twice, thrall flag read three ways, `scrollOfSpell` lives in the sheet but treasure.mjs imports it | relics.mjs:38/uses.mjs:101; origins.mjs:26/ability-test.mjs:289; creation.mjs:106/improving.mjs:86; build-packs.mjs:28/automation-report.mjs:26; choices.mjs:53/159; migrate.mjs:137/147; settings.mjs:94/101; minions.mjs:280; token-ruler.mjs:73/reach-overlay.mjs:50; character-sheet.mjs:209/treasure.mjs:26 | V |
| Persistent damage types in 3 places; effect amount lists disagree; mook rule in two places; "var-borg" typed 17 times in effects.mjs | rules/persistent.mjs:21, rules/item-effects.mjs:1058, item-effects-part.mjs:75; effects.mjs | V |
| Chat-card wiring repeated in 22 places; pools/chat card boilerplate; item sheet DEFAULT_OPTIONS blocks; PowerSheet/SpellSheet; outcome boxes; "Fortune label by five item kinds" | hook files, item-sheet.mjs | V for the 22 and DEFAULT_OPTIONS; L for the rest |
| Same heal line under three lang keys; two other triple-key groups (leave alone) | en.json (Effects.AuraHeal, HookHeal, CompanionHealed) | V (by script) |
| 17 repeated selectors in the stylesheets (the media-query pairs are intended); literal colours bypassing tokens.css (the two shadows used 8 and 4 times; `#ff6b5b` is not a palette colour) — Partly fixed in the UI redesign (see styles/DESIGN.md). The literal colours are gone (only tokens.css holds literals). Still repeated: `.var-borg-table-panel .pool-count` (apps.css lines 97 and 599), `.var-borg-table-panel .misery-icon` (apps.css lines 408 and 635) and `.var-borg-table-panel button.adjust` (apps.css lines 101 and 621). The full count of 17 was not rechecked. | apps.css, stage.css | L |

### Hard-coded text, wording, stale comments

| What | Where | V/L |
|---|---|---|
| English in code: ritual labels "DR14" and placeholder "10 minutes"; "−1 h"/"+1 h" on the calendar; ": " in the random card; " s" on the chest sheet; internal keys such as "healingPotion" shown in the "not found" line | [spell.mjs:81](module/data/spell.mjs:81), [spell-details.hbs:23](templates/item/spell-details.hbs:23), [calendar-panel.hbs:16](templates/apps/calendar-panel.hbs:16), random-character.mjs:255, chest-sheet.hbs:33, treasure.mjs:311 | V |
| "dialog" against "dialogue" in 8 lang values (Q33) | [en.json:1266](lang/en.json:1266), :2012, :2013, :2420, :2533, :2939, :3368, :3507 | V |
| Ability limits (−3, 6) typed in the template | [character-main.hbs:29](templates/actor/character-main.hbs:29) | V |
| Stale or misplaced comments: gloom.mjs:17 (armour "helps"); outcomes.mjs:80 (markOf has partnerOf's comment); ongoing.mjs:127; combat.mjs:15; character-sheet.mjs:166 and :845; data/feat.mjs:3 and data/origins.mjs:60 ("text only"); item-chat.mjs header; data/uses.mjs:11; settings.mjs:66 and :122; days.mjs:5; rules/panic.mjs:36; rules/health.mjs:22; rules/equipment.mjs:12 ("five damage types", there are twelve); rules/misery.mjs:20 ("Provisional"); data/effects.mjs:76 | various | V for the first group; L for the last four (from the docs reviewer only) |
| Button font set twice in base.css; the later rule (head font) wins; decide which is wanted | [base.css:93](styles/base.css:93), :176 | V |
| Apostrophes: straight and curly mixed in names and text (47 files straight, 12 curly; "Death's Door" both ways) (Q32) | content/ | L (counted by script, not re-checked) |
| File `zweih-nder.json` should be `zweihander.json`; Ash-choked Bellman has an armour die but no armour name; mixed dice-formula style and capitalisation (informational; the rule document mixes them too); foes and example actors have no image (probably waiting for art) | content/ | L |
| Redundant GM check in `_onStartRound`; Restore Sanity stores `.lost`, always 0 | [combat.mjs:160](module/combat.mjs:160), [panic.mjs:117](module/panic.mjs:117) | V |

---

## 6. Documents and housekeeping

**PLAN.md is stale.** It ends at step 53 and says the build is at Milestone 13, while GAPS and the code show much more was built: random character generation (steps 54b–54g), encounter builder (GAPS 267–269), treasure generator (270–273), token movement (275–282), In Darkness markers (274), Take cover (264), poison (283), area and lingering damage (284). Step 41a is done in the code but not marked, and the number 41a appears twice (PLAN.md 653 and 655). Step 53b is partly built (poisons, area targets and the blunderbuss are done; lockpicks GAPS 55 and black poison are not). The summary line "Actor types: character, foe, minion, vehicle" omits chest. About 1,470 lines are mostly "Done" history; options are to add a Milestone 14 block, or move steps 1–53 to an archive file and keep a short open-work list.

**GAPS.md problems.** The "Open questions" table holds about 60 rows already marked Resolved, mixed with the genuinely Open ones; row 172 has the undefined status "To confirm"; the first table's separator line (line 13) comes after the first data row (258), so that row shows as the header; some Resolved rows still say "Provisional". Rows made stale by later rows: GAPS 83 (says the Dark Master removes Cowardice/Paranoid by hand; GAPS 162 says the clock does it); GAPS 186 (Open, but partly answered by the rule document); GAPS 52/54/260 overlap. GAPS 257 (Improving: d10 table) and GAPS 270 (Spoils: whole compendium) give two different dice for "a weapon" (Q8). Fix: move Resolved rows into their topic tables and keep the top table for Open rows only.

**Rule document still contains text that GAPS says was replaced.** GAPS 117 ("Powers that strike", still at rule document lines 8401, 26337, 41601), GAPS 182 (Dragon's Shadow "Boon", line 21299) and GAPS 113 (Fortune "up to their maximum", lines 25114, 35007, 38894). The code follows GAPS. Anyone checking code against the rule document will find these as false bugs. Either edit the document or add a "Known deviations" list at the top of GAPS.md (Q13). Also: CLAUDE.md's line "Conditions: only those listed in 3.13" is stricter than the system (Panic results and Table of Agony injuries are stored as statuses; "In Darkness" is added on tokens, GAPS 274). The token HUD itself offers exactly the 16 listed plus Persistent Damage.

**File name mismatch.** CLAUDE.md, PLAN.md (line 4) and GAPS.md (line 4) write the rule document as `_reference/AI_BRIDGE_-_VÅR_BORG.md` with underscores; the real file is `_reference/AI BRIDGE - VÅR BORG.md` with spaces. Tools or AI sessions that open the path as written will fail. Update the three references or rename the file.

### Option: stop keeping packs/ in git

*The problem.* The folder packs/ holds the compiled compendium databases (70 tracked files, 14 packs). Foundry rewrites them every session, deleting old numbered files and creating new ones, so git always shows over a hundred changed files, and 57 of the 63 commits that touch packs/ carry them along as noise (only 6 commits are the clean-up ones). The existing ignore lines only cover lock and log files, not the files that change. The packs are built from content/ by `npm run build:packs`, so in principle they need not be stored in git.

*What must be proven first.*
1. That content/ is the complete source: nothing exists only inside packs/ (for example an entry edited in the compendium window in Foundry would be lost at the next build). No tool for this exists yet; it needs a small throw-away script that unpacks the packs to a temporary folder with Foundry closed and compares them with content/ entry by entry (compare the unpacked JSON, not the database bytes).
2. That a clean rebuild works: copy the folder, run `npm ci` then `npm run build:packs`, start Foundry and check all 14 compendiums open with the right counts. This test also settles whether Foundry starts cleanly when the pack folders are missing (unsettled, Q25).
3. How the system will be delivered. While it stays on your own machine nothing more is needed. The "nobody could install from the repository" worry is only hypothetical today (no remote, and system.json has no manifest or download address); it becomes real when you publish, and then the release step must build the packs and include them in the release zip.

*Switching.* Add `packs/` to .gitignore, then remove the files from tracking (this stops tracking without deleting anything on disk; Foundry keeps working). Old pack files stay in history.

*Day-to-day routine afterwards.* (1) Change game data only in the JSON files under content/ (never edit entries in the compendium window in Foundry). (2) Close the world, run `npm run build:packs`, reopen the world and test. (3) Commit as usual; packs/ no longer appears. (4) If packs/ ever shows in git status again, the ignore line was lost. CLAUDE.md says to ask before installing packages, so note once that restoring the already-listed ones with `npm install` is fine.

*Trade-off.* A calm git history and no Foundry noise, against needing a rebuild step before every launch and a one-off proof that content/ is complete. The reviewers' view: not yet; start with step 1. This is your decision.

---

## 7. Questions for the designer

Answerable in a sentence each. "In Foundry" means it needs a look in a running Foundry.

1. **Death's Door feat count.** The rule document (3.6) says every feat adds 1 to the Sanity DR; code and GAPS 16 count only feats gained through Improving ("confirmed again at step 22"). Keep GAPS 16, or change to every feat? (If every feat counted, a new character starts at DR 12 or 13.) **Decided 16 November 2026: keep GAPS 16.** The rule document now matches.
2. **Boon on a Morale roll.** After R1, Boon on Morale rolls 3d6 keeping the two lowest (foe braver). Is that what you want for a Boon from other sources, or should Boon and Bane on Morale be left to the Dark Master?
3. **Medicine box test (GAPS 41/43/149).** The rule document says the box heals d6 or removes Infected with no test; the system asks a Toughness DR12 test. Keep, or follow the document?
4. **Fortune below 1 damage (GAPS 109, Open).** Fortune's "lower damage dealt to you by d6" can take a hit to 0, while the rule document says hits deal at least 1 despite shield or armour. Keep, or minimum 1?
5. **Carrying more than twice the limit (GAPS 21).** The rule document says "the weight is the death of you"; the system sets movement to 0. Keep, or make it a Death's Door result?
6. **Foe lines on gloom abilities.** Should a Blinded, Restrained, Prone or Fatigued foe's gloom abilities also give the defender Boon or −2 DR, as the Stupefied line explicitly does? Today none do.
7. **Starvation.** The system starts damage on the third day without food. Confirm "third day", or should it be the second dawn?
8. **"A weapon" dice.** Improving's find uses the d10 table (GAPS 257) and Spoils uses the whole weapon compendium (GAPS 270). Intended difference, or make both the same?
9. **Searching the fallen** (d6, 1–3 nothing, 4–5 d10 s, 6 one Spoils roll): fine as a roll table only?
10. **Unautomated rules**: surprise (Boon on first attack), falling damage, campfires, wretched lifestyle. Left to the Dark Master on purpose?
11. **Mule and handcart (GAPS 259).** Mule's darkness test is DR12 but the rule document's Horse is DR14. Confirm DR12?
12. **Black poison.** The Spoils table can give it, but only red poison has an automatic test. Is text-only intended?
13. **Rule document edits owed (GAPS 113, 117, 182).** Edit `_reference/`, or keep them as listed deviations in GAPS?
14. **Hearth-tallow of Anashe.** Does its protection from interruption cover the whole party (as now, even if the holder is not resting) or only the holder?
15. **Action pips on the tracker.** Should a player be able to click their pips during someone else's turn (manual correction, as now), or only on their own turn?
16. **Encounter card "Place tokens".** Should it place its foes only once (as the treasure card does), or stay repeatable for reinforcements?
17. **Rerolling one foe in an encounter** can break "same tier is the same creature" (GAPS 268). Allow it, or reroll the whole tier together?
18. **Scrolls in the automation report.** Should scrolls count towards automation status? If yes, add "scroll" to two lists in tools/automation.mjs.
19. **Example items in the packs.** Should "Small vicious dog", "Ash-choked bellman", "Steam wagon" and the example scroll ship in the compendiums, or be marked not-packed?
20. **Gloom ability Use button, double click (In Foundry).** Double-click Use on a foe's gloom ability: does it spend Gloom and pips twice and post two cards?
21. **Unlinked tokens (In Foundry).** On a poison or medicine card for a foe token not linked to an actor, are the buttons greyed out? If yes, switch to the waiting lookup.
22. **Reach overlay speed (In Foundry).** On your largest walled map in combat, is dragging a token slow? (Under about 50 ms means no action.)
23. **Cancelling a drag (In Foundry).** Cancel a token drag mid-move with the console open: any "Uncaught (in promise)" message?
24. **Large inventories (In Foundry).** Is a character with about 100 items slow to open? Settles the data-preparation speed question.
25. **Missing packs (In Foundry).** Does Foundry start cleanly with the 14 pack folders absent? Part of the packs proof in section 6.
26. **Scroll area.** Should the scroll sheet have an Area section (hand-made scrolls), or should it be recorded in GAPS that scrolls take their area from the spell?
27. **Class drop.** Should dragging a class onto a character sheet also give its class feature and class power (as the Creation Helper does)?
28. **Dragon's Shadow card text.** After R1, keep the rule document's "Boon" wording on the card, or reword?
29. **GAPS 172 "To confirm".** Still to confirm, or Open?
30. **Foe image art.** Foes show Foundry's default icon; leave until token art exists?
31. **Dead lang keys.** Delete the six unused keys, or are `Panic.LostSanity` / `Effects.RerollSpent` meant for something planned?
32. **Apostrophes.** Use curly (matches lang/en.json) or straight in content names and text?
33. **"dialog" or "dialogue box"** for windows in the language file?
34. **Relic fields `saleValue`, `factionValue`, `faction`** are typed in but nothing reads them. Keep as record-keeping, or remove?

---

## 8. Claims that were checked and found to be fine

- **Double-click on "disable after await" buttons** (Take damage, Lower armour, Inflict damage, Wound test, Shadowblight roll, Death's Door and about nine others): looking up a world actor does not let a second click through, so these cannot run twice. (The Shadowblight button has a different real problem, B7.)
- **"No actions left" still lets the action happen:** the designed house style (warn, "the Dark Master decides"); also reloads, powers, commands, Improvise, Move and Interact. Action pips never go below zero.
- **Defend button never disables:** by design, one attack card may be answered by several characters.
- **A hit with 0 damage still deals 1:** matches GAPS 64.
- **`clampAbility` unused:** it is used in four files.
- **Triumph "react with an Attack" is not acted on:** it is shown on the card.
- **Photonic Surge rolls for every spell:** the designer's ruling (GAPS 208).
- **`_del` undeclared:** it is a real Foundry v14 global. **`_getFrameButtons`, `setTargets`, `dropActorSheetData`, `renderChatInput`**, region internals, `checkCollision`, light tests: all exist and work in v14.
- **Aura, `_onStartRound` and `_onStartTurn` running on every client:** Foundry runs them for one Dark Master only; pools fill once.
- **Healing above maximum:** capped on every path. **Gifts dropping flags, dynamic import with no catch:** nothing affected.
- **Foundry's `yearZero` disagreeing with the calendar:** core never reads it; changing it would do nothing.
- **Containers inside containers still carried when dropped:** the sheet does not allow nested containers.
- **Re-applying a background adds keepsake and silver:** that is the GAPS 102 ruling.
- **Same id reused across 30 roll tables:** ids only need to be unique inside a table.
- **Lantern 60 ft, candle 10, torch 40, dim 5 ft:** match rule document 4.1.
- **Moral check "standing" comment, gridless placement, pack index not loaded, dropping compendium items on a scene:** all work.
- **Speed alarms:** the 22 chat-render handlers, new-day loops, darkness check, area scans, refresh-effects, the lastHit map, random-character helper rebuild and the O(n squared) spell filter are not noticeable.

---

## 9. Suggested order of work

One feature at a time, with a Git commit after each working step.

1. **Let players' lingering areas appear (B1, with the ask-the-Dark-Master helper S3).** Test: as a player with a Dark Master connected, cast a spell or power whose area lingers (e.g. a Song of power with difficult ground); the area should appear on the map for everyone. With no Dark Master connected, the player should see a warning.
2. **Dragon's Shadow (R1).** Test: on a Dragonkin with the feat, make a foe roll Morale with the option ticked; the roll should keep the two highest of three dice.
3. **Blinded makes all terrain difficult (R2).** Test: in combat, give a token Blinded and drag it across open ground; the movement cost should be higher than for the same token without Blinded.
4. **Stupefied foe's gloom Boon (R3).** Test: give a foe Stupefied, use one of its gloom abilities on a character, and check the defence roll gets a Boon (two dice, keep highest).
5. **Foe defeated by a power's extra damage (R4) and Ember undo (B4).** Test: use a power with secondary damage to take a foe to 0 HP; it should show as defeated in the Combat Tracker. Then use Fortune to change an Unravel result and watch the Ember pool go back.
6. **Dropped-item tick (R5), two drivers (R6), driving Boon expiry (R7).** Test: drop a weapon through the hazard and confirm no equip tick shows; make a second occupant Driver and confirm the first becomes crew; win a Triumph on a driving test, end the combat and confirm "Boon ready" disappears.
7. **Relic 2 (B9) with the "every relic resolves" test (S12).** Test: after rebuilding packs, roll treasure repeatedly or place relic 2 by number; "Shard of the Great Brazier" should appear instead of "not found".
8. **Once-only card buttons (S1: B6, B7, L47).** Test: as a player, press "Not the face!", poison Resist and Panic table buttons on a card the Dark Master posted, reload the page, and confirm the buttons stay used; the Shadowblight button should work once only.
9. **Fortune queue and refund, contested-buff use-up, outcome undo (S2 part, B2, B3, B5).** Test: buy a Boon with Fortune on a thrall power with no thralls and confirm the Fortune comes back; use an "Overcharge" style next-roll buff in a contested test and confirm it is gone for the next test; hurt a rig as a player who does not own it and confirm the rig's HP drops.
10. **Class drop gives feature and power (B10, after Q27).** Test: drag a class onto a blank character sheet; the class feature and class power should appear, and a second class should replace them.
11. **Busy guards for double-click buttons (S2: B11 and the L-list).** Test: double-click Light on a torch; only one torch should be used. Double-click ability + and confirm it adds two.
12. **One card-posting helper with name escaping (S4).** Test: rename a character "A<B & C", then trigger a turn start, a Panic card and a new day; all cards should read normally.
13. **One Boon/Bane helper and shared constants (S5, S10).** Test: roll an ability test with one Boon, one Bane, and two Boons; dice counts should be the same as before.
14. **Small tidy-up pass (S11, dead code, stale comments, lang keys, stylesheet leftovers, "dialog"/"dialogue" and apostrophes after your answers).** Test: open each sheet and the Ongoing, Calendar and Pools panels; nothing should look or read differently.
15. **Documents and optional large work, last (PLAN.md, GAPS.md table, file-name references; S6, S9; packs option):** shared power/spell roll flow (S6), shared NPC sheet base (S9), and the packs-out-of-git option (section 6) once its proof has passed.

---

## 10. What was not reviewed

- **Nothing was run.** No tests, no code in Foundry. Anything marked "In Foundry" in section 7 is untested.
- **Content text:** the 150 foe stat blocks, class, ancestry, feat and spell texts in content/ were not compared with the rule document (content was checked for structure only). Game text was not judged.
- **Rule glue not compared in depth:** item-effects.mjs, foe-hooks.mjs, resistance.mjs, feats.mjs, uses.mjs, timers.mjs, dropped.mjs, and parts of outcomes, lasting, random, origins and relics.
- **The packs/ folder** was off limits, so no pack was unpacked or compared with content/ (needed for section 6).
- **First-pass items the checkers skipped**, so unverified:
  - dice-core: exports used only by tests, `wholeCount`, `rollQuietTest`, two `diceOf` helpers, the 12 DR in three files, `settleDefenceCard` doing too much.
  - powers-spells: card wrapper twice, `payReactionPower` checking Ember twice. outcomes: `rollMorale` repeating a test.
  - effects: item modifier text built in three places, combat id expression four times, labels helper twice, English placeholder at item-effects.hbs:129, `timerAtStartOfTurn`.
  - combat-dying: five near-identical dialogues, wound-card payload thrice, small card built five ways.
  - panic-fortune-misery: card boilerplate in pools.mjs, redundant reroll condition, Fortune label by five kinds.
  - hooks-map: two chat-roll bar helpers, duplicate socket channel name (refuted).
  - rest-medicine-gear: relics roll-and-destroy, rest.mjs card markup, dynamic import in poison.mjs.
  - creation-improving: five card-posting styles, spell eligibility and ancestry-feat filter built twice, DialogV2 reached twice.
  - encounters: `CATEGORIES` filter.
  - character-sheet, npc-sheets, item-sheet, canvas-light, areas-movement-vehicles: most DUPLICATION and DEAD sub-items (action button block, thirteen identical handlers, attackSummary, PowerSheet/SpellSheet, outcome boxes, hover distance text object, `LOW_MS` vs `LENIENCY_MINUTES`, hard-coded panel labels and "ft", `darkUpdate`, `carriedOf`, `caughtTokens` comment).
  - lang: duplicate groups; the `Effects.Target`, `Event`, `Requires` and `Weapon` key families and 48 placeholder keys with no literal reference were not checked.
  - css: dead custom properties, 17 duplicate selectors, literal colours and dead overrides were script-driven and not re-read by the checkers.
  - content: apostrophe mix, `zweih-nder` file name, `armourName` blank, capitalisation, dice style, missing foe images, core icon paths (not checkable here), empty descriptions, dead default value.
- **Code-versus-rule items not re-checked by the second pass:** Mule DR12 and the wagon and handcart rows; black poison, searching the fallen, surprise and starvation (raised as questions only).
- **Foundry-version risk:** region drawing uses Foundry internals that exist in build 369 and could break on a future update.
