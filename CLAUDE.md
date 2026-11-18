# VÅR BORG Foundry system

## About me
I am a game designer, not a programmer. Explain what you change in plain
language. Work in small steps and tell me how to test each one in Foundry.

## Target
- Foundry VTT v14 only. System id: var-borg. Title: VÅR BORG.
- Modern patterns: ES modules, TypeDataModel, ApplicationV2 sheets.
- All visible text in lang/en.json, British spelling.

## Sources, in order of precedence
1. **The system as built** (code, compendium content, lang/en.json) and the
   designer's rulings in GAPS.md. Where the rules document disagrees with a
   ruling in GAPS.md, the ruling wins.
2. **Rules document**: `_reference/AI BRIDGE - VÅR BORG.md`. The authority
   for everything GAPS.md does not rule on. It is not in Git; a dated copy
   is kept in `_reference/backup/` before any large edit. Its section
   "House rulings (from the Foundry system)" sums up the GAPS rulings.
3. Never invent a mechanic. If a rule is missing or unclear, ask me and
   add it to GAPS.md (Open until I rule; Provisional rulings are what the
   system does meanwhile).
- Pirate Borg (MIT licence) was a code reference; its copy was removed on
  16 November 2026. Keep its licence notice in THIRD_PARTY_NOTICES.md for
  the code already adapted from it. Never copy its game text, compendium
  content, art, fonts or name.

## Project documents
- PLAN.md: the build plan, milestones and what was built after them.
- GAPS.md: every rules question and its ruling, numbered.
- UNTYPED_DAMAGE_REVIEW.md: the types given to untyped damage (GAPS 313,
  17 November 2026); the designer checks the judgement calls.
- REVIEW.md, DAMAGE_TYPES_REVIEW.md: one-off reviews (14 and 15 November
  2026); check their status before acting on them.
- styles/DESIGN.md: the visual spec (light and dark mood, tokens, which
  stylesheet owns what). Follow it for any CSS work.
- THIRD_PARTY_NOTICES.md: licences of adapted code and art.

## How the code is laid out
- `module/rules/`: plain rules maths, no Foundry. Each file has a test in
  `tests/`. Run all tests with `node --test tests/`; they must pass before
  a commit.
- `module/dice/`: the rolls and their chat cards. `module/data/`: the
  data models. `module/sheets/`: the sheets. `templates/`, `styles/`.
- `content/`: compendium content as JSON; `packs/` is built from it
  (`tools/`). Example content lives in `content/examples/`.
- Actor types: character, foe, minion, vehicle, chest. Item types: weapon,
  armour, shield, gear, container, ancestry, background, class, feat,
  power, spell, scroll, relic.

## Core rules summary
- Abilities: Strength, Agility, Toughness, Presence, Sanity.
- Test: d20 + ability vs DR (6 to 26; a modified DR never goes above 26).
  Triumph = beat DR by 10+. Success = meet DR. Failure = miss.
  Ruin = miss by 10+. Natural 20 moves the result one tier up,
  natural 1 one tier down. Foes add nothing to their d20.
- Boon: roll 2d20 keep highest. Bane: keep lowest. Any Boon with any Bane
  cancel to a plain roll. The kept die decides a natural 20 or 1.
- Aid: +1 per ally who succeeds, −1 per ally who fails, net −2 … +2.
- Contested test: highest total wins; natural 20 counts +5, natural 1 −5;
  a tie has no victor.
- Chance die: 2d6 + Fortune. 2-5 negative, 6-9 neutral, 10+ positive.
  Fortune has no maximum.
- Resources: Ember (players), Gloom (foes).
- Action symbols: ◈ action, ↻ reaction, ◇ free action, 🟒 ember, ☾ gloom.
- Damage types (fifteen, GAPS 289): bludgeoning, piercing, slashing; acid,
  cold, electricity, fire, sonic, force, light, dark; spirit, mental,
  poison, bleed. Bleed is only persistent; persistent types are fire,
  bleed, acid and poison.
- Conditions: only those listed in rules section 3.13.

## Working rules
- Plan first, then build. One feature at a time.
- After each working step, remind me to commit with Git.
- Don't install new packages without asking.
