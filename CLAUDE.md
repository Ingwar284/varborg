# VÅR BORG Foundry system

## About me
I am a game designer, not a programmer. Explain what you change in plain
language. Work in small steps and tell me how to test each one in Foundry.

## Target
- Foundry VTT v14 only. System id: var-borg. Title: VÅR BORG.
- Modern patterns: ES modules, TypeDataModel, ApplicationV2 sheets.
- All visible text in lang/en.json, British spelling.

## Sources
- Rules: _reference/AI_BRIDGE_-_VÅR_BORG.md is the authority.
  Never invent a mechanic. If a rule is missing or unclear, ask me and
  add it to GAPS.md.
- Code reference: _reference/pirateborg (MIT licence). You may adapt its
  code; keep its licence notice in THIRD_PARTY_NOTICES.md and note adapted
  files. Never copy its game text, compendium content, art, fonts or name.

## Core rules summary
- Abilities: Strength, Agility, Toughness, Presence, Sanity.
- Test: d20 + ability vs DR (6 to 26).
  Triumph = beat DR by 10+. Success = meet DR. Failure = miss.
  Ruin = miss by 10+. Natural 20 moves the result one tier up,
  natural 1 one tier down.
- Boon: roll 2d20 keep highest. Bane: keep lowest. Both cancel.
- Chance die: 2d6 + Fortune. 2-5 negative, 6-9 neutral, 10+ positive.
- Resources: Ember (players), Gloom (foes).
- Action symbols: ◈ action, ↻ reaction, ◇ free action, 🟒 ember, ☾ gloom.
- Conditions: only those listed in rules section 3.13.

## Working rules
- Plan first, then build. One feature at a time.
- After each working step, remind me to commit with Git.
- Don't install new packages without asking.
