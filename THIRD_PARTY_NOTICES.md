# Third-party notices

## Foundry VTT command-line tool (build tool only)

`@foundryvtt/foundryvtt-cli` (MIT licence, copyright 2023 Foundry Virtual Tabletop) is installed
as a development tool to build the compendiums in `packs/` from `content/`
(see `tools/build-packs.mjs`). It is not part of the system Foundry loads
and is not shipped with it; `node_modules/` is not committed.

## Fonts (SIL Open Font Licence 1.1)

These fonts are shipped in `fonts/`, unmodified, downloaded from Google's
font repository (https://github.com/google/fonts). Each folder holds its
full licence as `OFL.txt`. They are loaded in `styles/base.css`.

- **UnifrakturMaguntia** (`fonts/unifraktur-maguntia/`): copyright 2010
  j. 'mach' wust, copyright 2009 Peter Wiegel. Reserved Font Name
  UnifrakturMaguntia.
- **IM FELL English SC** (`fonts/im-fell-english-sc/`): copyright 2010
  Igino Marini. Reserved Font Name IM FELL English SC.
- **Alegreya**, regular and italic (`fonts/alegreya/`): copyright 2011 The
  Alegreya Project Authors. The files are renamed from `Alegreya[wght].ttf`
  and `Alegreya-Italic[wght].ttf`; their contents are unchanged.

## Art

- **Skeleton figure** (`assets/equipment-skeleton.webp`): a public-domain
  engraving, supplied by the designer. Shown on the Equipment tab of the character sheet.

## Pirate Borg Foundry system (code only)

Some code in this system is adapted from the Pirate Borg Foundry VTT system
(https://github.com/Limithron-Foundry-VTT/pirate-borg-system), used under the
MIT licence below. Only code is adapted. No game text, compendium content,
art, fonts or name from Pirate Borg are used.

### Adapted files

None yet. Each adapted file will be listed here with the Pirate Borg file it
came from.

### Licence

MIT License

Copyright (c) 2022 Luke Stratton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
