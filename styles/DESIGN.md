# VÅR BORG: design specification

This is the shared spec for restyling the system. Follow it literally. Where it says "exactly", copy it. Where it does not cover a case, use the "how to decide" note in section 5 and keep the existing layout. Do not redesign. British spelling in every comment you write. Section 12 says which stylesheet owns which selectors (style only your own), and section 13 has a short list for each stylesheet: what changes, what keeps palette constants, which literal colour becomes which token, and which declarations are dead.

Contrast figures use the WCAG 2.x formula: relative luminance L = 0.2126 R + 0.7152 G + 0.0722 B, where each channel c (0 to 1) becomes c/12.92 if c <= 0.03928, otherwise ((c + 0.055) / 1.055) ^ 2.4. Ratio = (L1 + 0.05) / (L2 + 0.05), lighter colour first. Minimums: body text 7:1, other text and essential controls 4.5:1, lines and graphics 3:1. Translucent colours were first blended over the surface they sit on. Anything below its minimum is kept as specified and listed in section 11.

---

## 1. The idea

One identity, two moods. Both moods share layout, type, spacing, square corners, 2px frames, double-rule headings and the four result shapes (section 7). Only colour, texture and ornament change.

**Light, "the last sun" (hopeful).** Warm bone paper. Ink stipple. Lozenge fleurons. Ink corner marks. A faint warm glow from the top of each window. Ember orange and sun yellow as accents. Hard ink offset shadows. No ambient motion.

**Dark, "Lun's cold eye" (threatening).** Soot page, bone text, moon-silver lines. The stipple becomes faint bone flecks. An edge vignette closes in on each window. The fleuron becomes a crescent between two dots. Corner marks are moon-silver. The accent line under bands turns moon-silver. Ember orange is the only warm colour left (Ember, hover, the Failure bar). Hard shadows turn pure black. No motion in windows.

No green anywhere, in either mood.

---

## 2. How the mood is expressed in CSS

- `document.body` carries `data-vb-mood="light"` or `data-vb-mood="dark"`. It is set by `module/mood.mjs`; never write it in CSS or templates.
- `document.body` also gets the attribute `data-vb-mood-ready` once Foundry is ready. Transitions are allowed only under `body[data-vb-mood-ready]`, except the mood's colour fade, which runs under `body.vb-mood-changing` (section 6.4).
- For 1000 ms after a change, `document.body` carries the class `vb-mood-changing` (the colour fade, section 6.4), with or without reduced motion.
- For 900 ms after a change, `document.body` carries the class `vb-mood-to-dark` or `vb-mood-to-light` (used by the flourish, section 8).
- `tokens.css` has exactly three blocks, in this order:
  1. `:root { palette constants, font stacks, hex-flower and weather tokens, fixed shades and art tints, paper-prop rules and textures }`
  2. `body { role tokens for light, all aliases, light textures, spacing }`
  3. `body[data-vb-mood="dark"] { dark role tokens, dark textures }`
- **Alias rule.** Any token that refers to another token with `var(--vb-…)` is declared in the `body` block, never in `:root`. A `var()` in `:root` is resolved once at `:root`, so it would keep its light value in dark mood. The only `var()` references allowed in `:root` point at other palette constants (the weather and hex tokens do this today and stay there).
- Stylesheets other than `tokens.css` never contain a literal colour: no `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, and no named colours except `transparent`, `currentColor` and `inherit`. If a new colour is needed, it becomes a token in `tokens.css` first.
- Dark-only rules in other stylesheets are written `body[data-vb-mood="dark"] <selector>`. Do not use `@media (prefers-color-scheme)`.
- **Foundry's layers.** Foundry loads this system's stylesheets in its `system` cascade layer, which beats Foundry's own layers whatever the specificity. So a plain rule of ours always beats Foundry's rule for the same property. Foundry, however, writes its own variables (`--input-background-color`, `--button-*`, `--checkbox-*`) on each control element itself, so setting such a variable on a window or container does nothing for the controls inside it. Set it on the control, or set the real property.
- **Buttons: use the variables, not raw properties.** To restyle a button, set `--vb-btn-bg`, `--vb-btn-fg`, `--vb-btn-border` and, only if it must differ, `--vb-btn-hover-bg`, `--vb-btn-hover-fg`, `--vb-btn-hover-border` on the button's selector (base.css and cards.css pass them on to Foundry's `--button-*` variables, and Foundry applies the hover). Do not write a raw `background`, `color` or `border-color` on a button: it would beat Foundry's hover rule and the button would never react. Do not add a `button:hover` rule.
- **Disabled buttons.** Foundry makes a disabled button's hover colours equal to its normal colours (it sets the `--button-hover-*` variables to the normal ones). base.css (sheets, dialogs, panels) and cards.css do exactly the same through the same variables: in the `:disabled` rule they set `--button-hover-background-color`, `--button-hover-text-color` and `--button-hover-border-color` to `--vb-btn-bg`, `--vb-btn-fg` and `--vb-btn-border`, plus `opacity: .45`. No raw colour is written on a disabled button. For the same reason a button whose text colour must differ (the minion "over the limit" button) sets `--vb-btn-fg`, never a raw `color`.
- **Mood on windows.** `module/mood.mjs` swaps `theme-light` and `theme-dark` on every `.var-borg` window so Foundry's own controls match. Never write `.theme-dark` or `.theme-light` in our CSS; use `body[data-vb-mood="dark"]`.
- **Night on the side panels.** From dusk to dawn on the world clock, `module/mood.mjs` gives the five table panels the class `vb-night` (and Foundry's `theme-dark`), whatever the screen's mood; "Always light" in the settings keeps them light. `tokens.css` declares the body block and the dark block on `.application.var-borg.vb-night` too, so that window alone takes every dark token, aliases included. A dark-only rule that must reach the panels at night is written for both: `body[data-vb-mood="dark"] .x, .application.var-borg.vb-night .x` (as the dark field rules in `base.css` are).

---

## 3. Palette constants (stay on `:root`, never change with mood)

| Token | Value |
|---|---|
| `--vb-ink` | #141210 |
| `--vb-ink-soft` | #4a433a |
| `--vb-paper` | #ece4d2 |
| `--vb-paper-shade` | #d9cfb8 |
| `--vb-orange` | #ec6a1f |
| `--vb-yellow` | #f2c230 |
| `--vb-rust` | #8f3208 |

The weather and hex tokens already in `tokens.css` (`--vb-hex-text`, `--vb-hex-text-light`, `--vb-hex-token`, `--vb-hex-token-ring`, `--vb-weather-*`, including `#f7f2e6` and `#b3a68c`) stay on `:root` exactly as they are. Fonts `--vb-font-display`, `--vb-font-head`, `--vb-font-body` stay exactly as they are.

**Fixed shades, art tints and paper-prop tokens.** These are also on `:root` and never change with the mood. They exist so that no stylesheet needs a literal colour.

| Token | Value | Used for |
|---|---|---|
| `--vb-black` | #000000 | The solid end of a `mask-image` gradient |
| `--vb-black-25`, `-35`, `-45`, `-55`, `-60`, `-70`, `-80` | rgba(0,0,0, .25 / .35 / .45 / .55 / .6 / .7 / .8) | Blurred shadows, `drop-shadow()` colours, mask fades, a seal's ring. The number is the opacity in percent. |
| `--vb-glow-orange` | rgba(236,106,31,.8) | Triumph splash word glow |
| `--vb-glow-rust` | rgba(143,50,8,.9) | Ruin splash word glow |
| `--vb-bruise-rust` | rgba(143,50,8,.45) | Ruin splash: the bruise at the edges |
| `--vb-vignette-ink` | rgba(20,18,16,.9) | Ruin splash: the dark corners |
| `--vb-smudge-ink` | rgba(74,67,58,.18) | Torn-page smudge (journal scrap) |
| `--vb-smudge-rust` | rgba(143,50,8,.12) | Torn-page stain (journal scrap) |
| `--vb-paper-rule`, `-faint`, `-strong` | rgba(20,18,16, .35 / .2 / .5) | Rules and borders on journal paper (the same as the light `--vb-line-soft`, `-faint`, `-strong`, but they do not change in the dark mood) |
| `--vb-paper-stipple` | the light stipple texture | Paper grain on journal props |
| `--vb-paper-fleuron` | the light (ink) fleuron | Ornament on journal props |

Journal props must also set an explicit paper colour on anything Foundry colours by its interface theme (plain links, definition lists, tables, code, rules; see 8.11), because the page's window carries `theme-dark` in the dark mood. Journal props must use these `--vb-paper-*` tokens and not `--vb-rule*`, `--vb-line*`, `--vb-stipple` or `--vb-fleuron`: those change in the dark mood and would turn the paper's rules and grain silver and invisible.

**Where palette constants may be used directly (the only exceptions):**
1. Ember and Gloom orb art: everything inside `.vb-orbs` (the orbs, their name plates, the round plate and rules between them).
2. Torch art: everything inside `.vb-light` (the light orb, the weather and time-of-day mini orbs, their plates).
3. Triumph and Ruin splash (`.vb-splash*`). Its one `data:` image (the crack) keeps its hex colours; it is the only data URI outside `tokens.css`.
4. Journal document props: letters, notices, scraps, the field journal (`.vb-page*`).
5. The weather hex flower on its fixed paper plate (background `--vb-paper`, frame `--vb-ink`, in both moods), and everything inside it.

Everywhere else, use role tokens (section 4).

---

## 4. Role tokens

All role tokens are declared on `body` (light value) and overridden on `body[data-vb-mood="dark"]` (dark value). Contrast is stated for the pair that matters; "surf" is `--vb-surface`, "raised" is `--vb-surface-raised`.

### 4.1 Surfaces, text, lines

| Token | Light | Dark | Used for | Contrast (light / dark) |
|---|---|---|---|---|
| `--vb-surface` | #ece4d2 | #161412 | Page background | n/a |
| `--vb-surface-raised` | #d9cfb8 | #25211d | Panels, hover rows, dropped dice, roll summary | n/a |
| `--vb-surface-wash` | rgba(217,207,184,.5) | rgba(37,33,29,.5) | A half-strength raised panel, such as an opened item description | n/a |
| `--vb-field-focus` | #f2c230 | #3a3226 | Background of a focused text field | text on it 11.15 / 9.52 |
| `--vb-text` | #141210 | #e8dfcb | Body text | on surf 14.77 / 13.87; on raised 12.07 / 12.06 |
| `--vb-text-soft` | #4a433a | #ada38d | Hints, secondary text, − and + steps | on surf 7.70 / 7.35; on raised 6.30 / 6.39 |
| `--vb-text-faint` | #5e5647 | #958b76 | Placeholders and small notes only | on surf 5.73 / 5.45; on raised 4.68 / 4.74 |
| `--vb-alert` | #8f3208 | #f08a5d | Warning text (destroyed, over capacity, hazards) | on surf 6.32 / 7.44; on raised 5.16 / 6.47 |
| `--vb-line` | #141210 | #8f979c | Frames, borders, field underlines | on surf 14.77 / 6.19 |
| `--vb-line-soft` | rgba(20,18,16,.35) | rgba(195,204,210,.30) | Medium rules, dashed borders | 2.20 / 2.10 |
| `--vb-line-faint` | rgba(20,18,16,.2) | rgba(195,204,210,.16) | Row separators, hover tints | 1.53 / 1.42 |
| `--vb-line-strong` | rgba(20,18,16,.5) | rgba(195,204,210,.45) | Emphasised rules | 3.33 / 3.21 |

### 4.2 Bands (title bar, character header band, tab bar, card headline, black plates)

| Token | Light | Dark | Used for | Contrast (light / dark) |
|---|---|---|---|---|
| `--vb-band` | #141210 | #0b0a09 | Band background | n/a |
| `--vb-band-text` | #ece4d2 | #c3ccd2 | Text on a band | 14.77 / 12.14 |
| `--vb-band-hover` | #f2c230 | #e8dfcb | Link or control text on a band when hovered; text on a band that needs emphasis | 11.15 / 14.93 |
| `--vb-band-accent` | #ec6a1f | #8f979c | The line under a band, the active-tab top line, decorative marks on a band | 5.92 / 6.66 |
| `--vb-focus-on-band` | #f2c230 | #e3b93a | Focus ring on a band | 11.15 / 10.61 |

### 4.3 Accent, highlight, focus, buttons

| Token | Light | Dark | Used for | Contrast (light / dark) |
|---|---|---|---|---|
| `--vb-accent` | #ec6a1f | #e0742e | Fill for hover and emphasis | n/a |
| `--vb-on-accent` | #141210 | #141210 | Text on an accent fill | 5.92 / 5.97 |
| `--vb-highlight` | #f2c230 | #e3b93a | Fill for Triumph, ticked Boon | n/a |
| `--vb-on-highlight` | #141210 | #141210 | Text on a highlight fill | 11.15 / 10.03 |
| `--vb-focus` | #141210 | #e3b93a | Focus ring on a surface | on surf 14.77 / 9.86 |
| `--vb-btn-bg` | #141210 | #2e2924 | Button fill | n/a |
| `--vb-btn-fg` | #ece4d2 | #e8dfcb | Button text | 14.77 / 10.86 |
| `--vb-btn-border` | #141210 | #8f979c | Button border | on surf 14.77 / 6.19 |
| `--vb-btn-hover-bg` | = `--vb-accent` | = `--vb-accent` | Button hover fill | n/a |
| `--vb-btn-hover-fg` | = `--vb-on-accent` | = `--vb-on-accent` | Button hover text | 5.92 / 5.97 |
| `--vb-btn-hover-border` | = `--vb-accent` | = `--vb-accent` | Button hover border | n/a |

The three `-hover-` tokens are aliases, so declare them in the `body` block with `var()`; they then follow the dark accent automatically. The hover border is the accent in every window and card (base.css no longer overrides it with the line colour). A place that wants a different hover sets `--vb-btn-hover-bg`, `-fg` and `-border` on its own selector.

### 4.4 Game meanings

| Token | Light | Dark | Used for | Contrast (light / dark) |
|---|---|---|---|---|
| `--vb-ember` | #8f3208 | #e0742e | Ember count and symbol, as text on the page | on surf 6.32 / 5.87 |
| `--vb-gloom` | #141210 | #c3ccd2 | Gloom count and crescent, as text on the page. In light mood it equals `--vb-band`, so it is never used on a band (use `--vb-band-text` there) | on surf 14.77 / 11.28 |
| `--vb-bane-bg` | #141210 | #7d2a08 | Fill of a ticked Bane toggle | n/a |
| `--vb-bane-fg` | #ece4d2 | #f1e7d0 | Text on a ticked Bane toggle | 14.77 / 7.74 |
| `--vb-ruler-far` | `#f08a5d` | `#f08a5d` (same in both moods; declared in the `body` block as a plain value, not an alias of `--vb-alert`, because it sits on Foundry's own dark ruler label) | Token ruler "too far" label | light salmon on Foundry's own dark ruler label |

`--vb-bane-bg` and `--vb-bane-fg` are new. They hold the same values as `--vb-tier-ruin-bg` / `--vb-tier-ruin-fg` in dark mood, but in light mood Bane uses a band look, not the orange-on-ink Ruin look. Keep them as separate tokens.

### 4.5 Shadows, overlay HUD, atmosphere, seal

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--vb-shadow-hard` | `3px 3px 0 #141210` | `3px 3px 0 #000000` | Stamped objects only: chat card, die, tier block, ability score box. A whole `box-shadow` value. |
| `--vb-shadow-soft` | `0 3px 6px rgba(0,0,0,.55)` | `0 3px 6px rgba(0,0,0,.55)` | Overlays over the map only (orbs, HUD). Also valid inside `drop-shadow()`. |
| `--vb-hud-bg` | rgba(20,18,16,.85) | rgba(8,8,10,.9) | Panels over the map (Ongoing panel, turn strip) |
| `--vb-hud-text` | #ece4d2 | #c3ccd2 | Text on a HUD panel (12.52 / 11.30 over a mid-grey map) |
| `--vb-hud-line` | rgba(236,228,210,.35) | rgba(195,204,210,.35) | Border of a HUD panel |
| `--vb-hud-hover` | rgba(236,228,210,.14) | rgba(195,204,210,.14) | Hovered row or control on a HUD panel |
| `--vb-atmosphere` | `radial-gradient(ellipse at 50% -10%, rgba(242,194,48,.12), transparent 60%)` | `radial-gradient(ellipse at 50% 45%, transparent 50%, rgba(0,0,0,.45) 100%)` | Window background layer (warm glow from the top / edge vignette) |
| `--vb-seal-hi` | #b8481a | #b8481a | Journal wax seal, highlight (same in both moods) |
| `--vb-seal-lo` | #5e2004 | #5e2004 | Journal wax seal, shadow (same in both moods) |

Declare the two seal tokens in the `body` block as plain values (they are not on `:root` because they are not palette constants, and they never change).

### 4.6 Result tiers

| Token | Light | Dark |
|---|---|---|
| `--vb-tier-triumph-bg` | = `--vb-highlight` | = `--vb-highlight` |
| `--vb-tier-triumph-fg` | = `--vb-on-highlight` | = `--vb-on-highlight` |
| `--vb-tier-success-fg` | = `--vb-text` | = `--vb-text` |
| `--vb-tier-failure-bar` | #8f3208 | #e0742e |
| `--vb-tier-failure-fg` | = `--vb-text` | = `--vb-text` |
| `--vb-tier-ruin-bg` | #141210 | #7d2a08 |
| `--vb-tier-ruin-fg` | #ec6a1f | #f1e7d0 |
| `--vb-tier-ruin-border` | #141210 | #f1e7d0 |

Contrast: Triumph 11.15 / 10.03. Failure bar against the page 6.32 / 5.87. Ruin text on fill 5.92 / 7.74. Ruin border against the page 14.77 / 14.95.

### 4.7 Spacing

`--vb-space-1` .25rem, `--vb-space-2` .5rem, `--vb-space-3` .75rem, `--vb-space-4` 1rem, `--vb-space-5` 1.5rem. Declared once, in the `body` block (not repeated in the dark block).

### 4.8 Aliases kept for existing code

All declared in the `body` block, all pointing at role tokens:

| Alias | Points at |
|---|---|
| `--vb-bad`, `--vb-hazard`, `--vb-warning` | `--vb-alert` |
| `--vb-good`, `--vb-shield`, `--vb-magic-strong` | `--vb-text` |
| `--vb-muted` | `--vb-text-soft` |
| `--vb-light` | `--vb-ember` |
| `--vb-rule` | `--vb-line-soft` |
| `--vb-rule-faint` | `--vb-line-faint` |
| `--vb-rule-strong` | `--vb-line-strong` |
| `--vb-misery-end-bg` | `--vb-band` |
| `--vb-misery-end-text` | `--vb-band-text` |
| `--vb-tier-triumph` | `--vb-tier-triumph-fg` |
| `--vb-tier-success` | `--vb-tier-success-fg` |
| `--vb-tier-failure` | `--vb-tier-failure-fg` |
| `--vb-tier-ruin` | `--vb-tier-ruin-fg` |

`--vb-ember` and `--vb-gloom` are now role tokens (4.4), so remove their old `var(--vb-rust)` and `var(--vb-ink)` definitions from `:root`.

### 4.9 Textures

Declared in the `body` block (light) and overridden in the dark block. They are data-URI SVGs. The light ones move from `:root` to `body` unchanged.

**Light (ink `%23141210`, exactly as today):**

```css
--vb-stipple: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cg fill='%23141210' fill-opacity='.08'%3E%3Ccircle cx='3' cy='5' r='.6'/%3E%3Ccircle cx='17' cy='2' r='.5'/%3E%3Ccircle cx='29' cy='11' r='.7'/%3E%3Ccircle cx='9' cy='21' r='.5'/%3E%3Ccircle cx='35' cy='27' r='.6'/%3E%3Ccircle cx='22' cy='33' r='.5'/%3E%3Ccircle cx='5' cy='36' r='.7'/%3E%3Ccircle cx='26' cy='19' r='.4'/%3E%3C/g%3E%3C/svg%3E");
--vb-crosshatch: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='6'%3E%3Cpath d='M0 6l6-6M-1 1l2-2M5 7l2-2M0 0l6 6M-1 5l2 2M5 -1l2 2' stroke='%23141210' stroke-width='.6'/%3E%3C/svg%3E");
--vb-fleuron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 10'%3E%3Cpath d='M13 0l5 5-5 5-5-5z' fill='%23141210'/%3E%3Ccircle cx='3.5' cy='5' r='1.6' fill='%23141210'/%3E%3Ccircle cx='22.5' cy='5' r='1.6' fill='%23141210'/%3E%3C/svg%3E");
--vb-corner-bl: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M1.5 0v10.5H12' fill='none' stroke='%23141210' stroke-width='1.5'/%3E%3Crect x='4' y='5' width='2.5' height='2.5' fill='%23141210'/%3E%3C/svg%3E");
--vb-corner-br: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M10.5 0v10.5H0' fill='none' stroke='%23141210' stroke-width='1.5'/%3E%3Crect x='5.5' y='5' width='2.5' height='2.5' fill='%23141210'/%3E%3C/svg%3E");
```

**Dark (bone flecks, moon-silver lines, crescent fleuron):**

```css
--vb-stipple: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cg fill='%23e8dfcb' fill-opacity='.06'%3E%3Ccircle cx='3' cy='5' r='.6'/%3E%3Ccircle cx='17' cy='2' r='.5'/%3E%3Ccircle cx='29' cy='11' r='.7'/%3E%3Ccircle cx='9' cy='21' r='.5'/%3E%3Ccircle cx='35' cy='27' r='.6'/%3E%3Ccircle cx='22' cy='33' r='.5'/%3E%3Ccircle cx='5' cy='36' r='.7'/%3E%3Ccircle cx='26' cy='19' r='.4'/%3E%3C/g%3E%3C/svg%3E");
--vb-crosshatch: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='6'%3E%3Cpath d='M0 6l6-6M-1 1l2-2M5 7l2-2M0 0l6 6M-1 5l2 2M5 -1l2 2' stroke='%23c3ccd2' stroke-width='.6'/%3E%3C/svg%3E");
--vb-fleuron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 10'%3E%3Cpath d='M15.5 1.8A4 4 0 1 0 15.5 8.2A3.4 3.4 0 0 1 15.5 1.8Z' fill='%23c3ccd2'/%3E%3Ccircle cx='3.5' cy='5' r='1.6' fill='%23c3ccd2'/%3E%3Ccircle cx='22.5' cy='5' r='1.6' fill='%23c3ccd2'/%3E%3C/svg%3E");
--vb-corner-bl: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M1.5 0v10.5H12' fill='none' stroke='%238f979c' stroke-width='1.5'/%3E%3Crect x='4' y='5' width='2.5' height='2.5' fill='%238f979c'/%3E%3C/svg%3E");
--vb-corner-br: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M10.5 0v10.5H0' fill='none' stroke='%238f979c' stroke-width='1.5'/%3E%3Crect x='5.5' y='5' width='2.5' height='2.5' fill='%238f979c'/%3E%3C/svg%3E");
```

Colour hex values inside these data URIs are allowed only in `tokens.css`.

---

## 5. Mapping: palette name used today to role token

| Where the old name is used | Use instead |
|---|---|
| `--vb-ink` as text on paper | `--vb-text` |
| `--vb-ink` as a border, rule or field underline | `--vb-line` |
| `--vb-ink` as a black band, header or plate background | `--vb-band` |
| `--vb-ink` inside `box-shadow: Npx Npx 0 …` | `--vb-shadow-hard` (replace the whole value, so `4px 4px 0 var(--vb-ink)` becomes `var(--vb-shadow-hard)`) |
| `--vb-paper` as a background | `--vb-surface` |
| `--vb-paper` as text on black | `--vb-band-text` (on a button: `--vb-btn-fg`) |
| `--vb-paper-shade` | `--vb-surface-raised` |
| `--vb-ink-soft` | `--vb-text-soft` |
| `--vb-orange` as a fill | `--vb-accent`; text on it is `--vb-on-accent` |
| `--vb-orange` as the line under a band | `--vb-band-accent` |
| `--vb-orange` as text on a black band | `--vb-band-accent` only if purely decorative, otherwise `--vb-band-hover` |
| `--vb-yellow` as a fill | `--vb-highlight`; text on it is `--vb-on-highlight` |
| `--vb-yellow` as hover text on black | `--vb-band-hover` |
| `--vb-yellow` as a focus ring | `--vb-focus` (on a surface) or `--vb-focus-on-band` (on a band) |
| `--vb-yellow` as the background of a focused text field | `--vb-field-focus` |
| `--vb-rust` as text | `--vb-alert` |
| `--vb-rule`, `--vb-rule-faint`, `--vb-rule-strong` | `--vb-line-soft`, `--vb-line-faint`, `--vb-line-strong` (on journal props: `--vb-paper-rule`, `-faint`, `-strong`) |
| A button's hover border (`--vb-btn-hover-border`) | Leave it as the token: it is the accent. Never set it to `--vb-line` or `--vb-ink`, unless the button is meant to show no change (`.ability-step`: `transparent`). |
| `--vb-ink` or `--vb-paper` as the fill or text of a button on a band (bone stamps on black) | `--vb-btn-bg: var(--vb-band-text); --vb-btn-fg: var(--vb-band); --vb-btn-border: var(--vb-band-text);` with the hover tokens left alone |
| `--vb-paper-shade` as secondary text on a band | `--vb-band-text` with `opacity: .8` |
| `--vb-paper-shade` or `--vb-ink-soft` as a ring, outline or border on a band or HUD plate | `--vb-hud-line` (a ring) or `--vb-band-text` (a bright edge) |
| `--vb-orange` as the open-description bar or other bar down a row's left | `--vb-accent` |
| `--vb-orange` or `--vb-ink` as an `accent-color` (tick boxes) | `--vb-accent` (on a band, too) |
| `rgba(255,255,255,.12)` hover tint on a HUD panel | `--vb-hud-hover` |
| `rgba(217,207,184,.5)` | `--vb-surface-wash` |
| A literal blurred shadow, `drop-shadow()` or mask colour on art or an overlay | exactly `0 3px 6px rgba(0,0,0,.55)` becomes `var(--vb-shadow-soft)`; any other blur or opacity keeps its geometry and takes `--vb-black-NN` (section 3) for the colour |
| A literal black shadow on a map overlay | `--vb-shadow-soft` |
| A literal dark HUD background, light HUD text or HUD border | `--vb-hud-bg`, `--vb-hud-text`, `--vb-hud-line` |

**How to decide in ambiguous cases.** Ask what the colour is for (text, line, band, surface, accent), not what colour it is. The same black may be text in one rule and a band in the next, and they take different tokens. If two answers seem possible, the purpose with the stricter contrast need wins (text before line before fill). If no role fits, stop and add a new token to `tokens.css` instead of using a palette name.

---

## 6. Type, spacing, borders, states

### 6.1 Type

| Role | Face | Size | Notes |
|---|---|---|---|
| Display | UnifrakturMaguntia (`--vb-font-display`) | Character name 2.3rem, foe name 2.1rem, item name 1.9rem; weight 400 | Sheet name inputs (`input.actor-name`, `input.item-name`) and the splash word only. At most one per window. The item name is smaller because the item window is only 480px wide: beside a 64px picture a long name still fits at 1.9rem (about 24 letters) but not at 2.3rem (about 20). |
| Band title | IM Fell English SC (`--vb-font-head`) | 1.1rem, letter-spacing .04em | Chat card headline. Window title is .95rem. |
| h2 | IM Fell English SC | 1.2rem | 3px double rule underneath, with the fleuron on the rule |
| h3 | IM Fell English SC | 1.05rem | 1px rule underneath |
| Label | IM Fell English SC | .85rem, letter-spacing .06em | Ability names, resource labels. Tabs are .95rem. |
| Body | Alegreya (`--vb-font-body`) | .95rem / 1.4, weight 400 | |
| Numbers | Alegreya, weight 800, `font-variant-numeric: tabular-nums` | ability score 1.8rem; HP and Wounds 1.4rem; die 1.25rem; total 1.3rem; tier word 1.5rem | |
| Hint | Alegreya italic | .85rem, colour `--vb-text-soft` | Never dim `--vb-text-soft` further with `opacity`: at any opacity below 1 it falls under 4.5:1 (light 2.95 at .6, 4.14 at .75). |

**Sizes, weights and faces not listed in this table keep their existing values.** Change a size only where this table or section 7 or 8 names it. The journal notice heading keeps its blackletter (`--vb-font-display`) because a notice is a paper prop.

### 6.2 Borders and shadows

- Window frame: 2px solid `--vb-line`.
- Rows: 1px `--vb-line-soft`, in every list of rows (item, condition, pool, light, weather, Miseries and encounter rows, dialog form groups, group Panic rows). It is visible in both moods (2.20 : 1) without competing with the 3px double rule under h2 and the 1px full-strength rule under h3. `--vb-line-faint` is only for tints (a hovered Boon or Bane toggle) and is never a row divider.
- Dimmed text: `opacity` on text is never below .7 for the page text colour (5.6 : 1 on a raised panel), and never below .6 for `--vb-band-text` on a band (4.85 : 1 in dark mood).
- Text and number fields: 2px bottom line in `--vb-line`; no other sides.
- Square corners everywhere: `border-radius: 0`. Round shapes that exist for a reason (orbs, hex token) keep their shape.
- `--vb-shadow-hard` only on stamped objects (chat card, die, tier block, ability score box).
- Blurred shadows (`--vb-shadow-soft`) only on overlays over the map.

### 6.3 Focus and hover

- **General rule:** every control: `:focus-visible { outline: 2px solid var(--vb-focus); outline-offset: 2px; }`.
- **Exceptions, and only these:**
  - Boxed fields (`select`, `textarea`) keep an inset ring: `outline: 2px solid var(--vb-focus); outline-offset: -2px;`, so it sits inside the field's border (base.css has this).
  - On a band (title-bar controls, tabs, orbs and turn portraits over the map): `outline: 2px solid var(--vb-focus-on-band); outline-offset: -2px;` (orbs and turn portraits keep their own existing offset of 2px; the turn portrait ring is an outline too, so its focus ring is pushed out by 2px to stay distinct from it).
  - The Boon and Bane toggle uses `outline-offset: 1px` (7.3).
  - A focused text or number field gets `background: var(--vb-field-focus)` and no outline.
- Hover: buttons fill with `--vb-btn-hover-bg` (accent) and take `--vb-btn-hover-fg` and `--vb-btn-hover-border` (also accent). This comes from the variables (see section 2); never write a `button:hover` rule. A row gets `--vb-surface-raised` on hover, and the stylesheet that owns the row writes that rule (section 12). Links on a band turn `--vb-band-hover` and are underlined.

### 6.4 Mood transition

For 1000 ms after a real change (never at start-up), `module/mood.mjs` puts the class `vb-mood-changing` on `document.body`. While it is there, `base.css` gives every element (and its `::before` and `::after`) inside `.application.var-borg`, `.var-borg-card` and `#var-borg-ongoing` a 900 ms `!important` transition of its colours: background, text, border, outline, text decoration, box and text shadows, fill and stroke. The portrait sun (`.portrait-sun` and everything in it) is left out; it has its own longer fade in `sheets.css`.

Write it once, in `base.css`. It is already there; do not copy it into another file, and do not add transitions anywhere else for the mood's colours.

A colour fade is not movement, so it runs even under `prefers-reduced-motion: reduce` (the designer's decision, 15 November 2026). **The Gloom glow and the flourish are reduced-motion matters of `stage.css` only** (8.12); `base.css` does not mention them. Keep both existing reduced-motion queries in `stage.css` and add to them, do not replace them.

---

## 7. Game elements

### 7.1 Result tiers (class names fixed)

The tier word is always present and is the largest text on the card (1.5rem). Each shape works without colour. Tier block base (all four): `margin: 0.4rem 0 0.3rem; padding: 0.15rem 0.4rem; border: 2px solid transparent; text-align: center;` in the head font.

| Class | Shape |
|---|---|
| `.tier-triumph`, `.chance-positive` | Full fill `--vb-tier-triumph-bg`; text `--vb-tier-triumph-fg`; border `2px solid var(--vb-tier-triumph-fg)`; plus `box-shadow: inset 0 0 0 2px var(--vb-tier-triumph-bg), inset 0 0 0 3px var(--vb-tier-triumph-fg);` |
| `.tier-success`, `.chance-neutral` | No fill. `border-top` and `border-bottom` 3px solid `--vb-tier-success-fg`. Text `--vb-tier-success-fg`. |
| `.tier-failure` | No fill. `border-left: 8px solid var(--vb-tier-failure-bar)`. Text `--vb-tier-failure-fg`. |
| `.tier-ruin`, `.chance-negative` | Full fill `--vb-tier-ruin-bg`; text `--vb-tier-ruin-fg`; border `2px solid var(--vb-tier-ruin-border)`; crosshatch overlay at 15% opacity: a `::before` with `position: absolute; inset: 0; z-index: -1; background: var(--vb-crosshatch); opacity: .15; pointer-events: none;` on a block with `position: relative; z-index: 0`. The block's own stacking layer holds the crosshatch behind the word, so it can never lie over the letters. (In light mood the crosshatch is ink on an ink fill and does not show; the black fill, the ink border and the word carry the shape.) The rolled outcome `.tier-outcome.rolled.tier-*` repeats each shape with four classes, so it beats the plain `.tier-outcome` rule (two classes) that gives every outcome a transparent 2px border. The unrolled outcomes carry no `tier-*` class, are faded to .7 and have no shape. |

### 7.2 Ember, Gloom, action symbols

- Ember symbol and counts as text on the page: colour `--vb-ember`. Gloom crescent and counts as text on the page: colour `--vb-gloom`.
- The Ember and Gloom pool counts in the table panel (`.pool-count`) are the most striking things in that panel: 1.8rem, weight 800, on stamped tiles with the hard shadow. Ember is an accent tile (`--vb-accent` fill, `--vb-on-accent` text: 5.92 / 5.97), Gloom a band tile (`--vb-band` fill, `--vb-band-text` text: 14.77 / 12.14, framed in `--vb-line`). Warm for the sun, cold for the moon, in both moods.
- Action symbols (◈ ↻ ◇ 🟒 ☾, `.action-symbols`) sit on a plate: `font-size: 1.35rem; letter-spacing: .15em;`.
  - Light: `background: var(--vb-band); color: var(--vb-band-text);`.
  - Dark: `background: transparent; border: 1px solid var(--vb-line); color: var(--vb-band-text);`.
  - Write the light rule normally and the dark rule as `body[data-vb-mood="dark"] .var-borg-card .action-symbols`. In light mood add `border: 1px solid transparent` so the plate size is the same in both moods.

### 7.3 Boon and Bane toggles

The markup is `.vb-toggles > label.vb-toggle > input + span`. Boon is always the first `.vb-toggle`, Bane the last. This is true in `boon-bane.hbs` and in `fortune-fields.hbs`. The two buttons have no other class to tell them apart, so use `:first-child` and `:last-child`.

| State | Rule |
|---|---|
| Unticked | `border: 1px solid var(--vb-line); color: var(--vb-text); background: transparent;` |
| Unticked, hover | `background: var(--vb-line-faint);` |
| Ticked Boon (`.vb-toggle:first-child input:checked + span`) | `background: var(--vb-highlight); color: var(--vb-on-highlight);` |
| Ticked Bane (`.vb-toggle:last-child input:checked + span`) | `background: var(--vb-bane-bg); color: var(--vb-bane-fg);` |
| Focus (`input:focus-visible + span`) | `outline: 2px solid var(--vb-focus); outline-offset: 1px;` |
| Disabled | keep the existing `opacity: .4`, transparent background |

### 7.4 DR and abilities

- DR stays in the existing total line: `.var-borg-card .total strong`, 1.3rem, weight 800, tabular numbers.
- Abilities: five equal blocks (`.ability-row` grid of five stays).
  - The name is the `.ability-roll` button, 0.85rem head font, directly above the score.
  - The score is `input[type="number"]` inside `.ability`: 1.8rem, weight 800, `border: 2px solid var(--vb-line)`, `background: var(--vb-surface)`, `box-shadow: var(--vb-shadow-hard)`. Keep the existing box width and height (3.6rem). The `.boosted-total` overlay uses the same 1.8rem so it lines up with the input.
  - Small − and + (`.ability-step`) sit either side: keep their existing size (1.2rem wide, 2rem high; a wider button would not fit five boxes across a normal sheet), colour `--vb-text-soft`, hover background `--vb-accent` with `--vb-on-accent`.

### 7.5 In Darkness

- The whole screen is in dark mood (set by `module/mood.mjs`; CSS does nothing extra).
- In the character sheet header band there is a stamp `.vb-dark-stamp`: colour `--vb-band-text`; `border: 1px solid var(--vb-band-accent)`; head font .85rem; padding `0.1rem 0.5rem`; `::before { content: "☾ "; }`. It is inside `header.var-borg-sheet` (after the portrait and the name, in `templates/actor/character-header.hbs`), and is placed on the band with `position: absolute; top: .35rem; right: .9rem` (the band is `position: relative`). So it takes no width from the name field, and it sits in the strip above the name's letters, where a long name does not run under it.

---

## 8. Hierarchy changes per area

Selectors are those that exist today. Never remove a selector; restyle it. Where a rule below says "replace", edit the existing rule in place.

### 8.1 Window shell (`base.css`)
- `.application.var-borg`: `border: 2px solid var(--vb-line); border-radius: 0;`
- `.application.var-borg .window-header`: `--color-header-background: var(--vb-band);` title colour `--vb-band-text`; `button.header-control` symbol colour `--vb-band-text`, hover `--vb-band-hover` (Foundry reads the hover colour from `--button-hover-text-color`, so base.css sets that, and `--button-hover-background-color: transparent`). Window title `.95rem`, letter-spacing `.04em`.
- `.application.var-borg .window-content` background. This is the complete, exact declaration (already in base.css; copy it, do not vary it). The atmosphere layer is `var(--vb-atmosphere) 0 0 / 100% 100% no-repeat`:

```css
background:
  var(--vb-corner-bl) left 2px bottom 2px / 10px 10px no-repeat,
  var(--vb-corner-br) right 2px bottom 2px / 10px 10px no-repeat,
  var(--vb-atmosphere) 0 0 / 100% 100% no-repeat,
  var(--vb-stipple),
  var(--vb-surface);
color: var(--vb-text);
```

The stipple repeats at its own size (no size or repeat given), and the corner marks sit 2px inside the bottom corners. Layers run from the top: corner marks, atmosphere, stipple, page colour. `.window-content` also gets `backdrop-filter: none` (Foundry's dark theme would otherwise blur behind a solid page).

- The `--vb-btn-*` lines that base.css used to set on its containers are deleted, because the tokens now provide them (including the hover border, which is the accent). The `--input-*` lines stay on the containers (pointing at `--vb-line`, `--vb-text`, `--vb-focus`, `--vb-text-faint`) but, as section 2 says, Foundry's own variables on each field beat them, so they change nothing today. `--button-focus-outline-color: var(--vb-focus)` is set on the button rule itself.
- **Foundry's own controls in the dark mood** (base.css, already written): fields (`text`, `number`, `search`, `password`, `select`, `textarea`) get transparent background, `--vb-line` border, `--vb-text` text, `--vb-text-faint` placeholder; a disabled or read-only one gets `--vb-surface-raised` and `--vb-text-soft`; tick boxes and radios get a `--vb-line` box and an accent tick; the window gets `--color-select-option-bg: var(--vb-surface-raised)` for drop-down lists. Sliders (`range`) are deliberately left as Foundry draws them. The light mood is left as Foundry draws it. Do not repeat these in another file.
- h2 `::after` fleuron background: `var(--vb-fleuron) center / 26px 10px no-repeat content-box, var(--vb-surface)`. The h2 rule is `3px double var(--vb-line)`; h3 `1px solid var(--vb-line)`.

### 8.2 Character header (`sheets.css`: `.var-borg.character header.var-borg-sheet`)
- Background `--vb-band`, colour `--vb-band-text`.
- Portrait: `border: 2px solid var(--vb-band-text); outline: 1px solid var(--vb-band-text); background: var(--vb-surface-raised) var(--vb-crosshatch);`.
- `.actor-name`: colour `--vb-band-text`, `text-shadow: 3px 2px 0 var(--vb-band-accent)`, placeholder `--vb-band-text` at opacity .6, hover underline `--vb-band-accent`, focus underline `--vb-band-hover`.

### 8.3 Tab bar (`sheets.css`: `.var-borg.character nav.sheet-tabs`)
- The bar: `background: var(--vb-band); border-bottom: 3px solid var(--vb-band-accent);`.
- Inactive tab `> a`: colour `--vb-band-text`.
- Hover `> a:hover`: colour `--vb-band-hover`, `text-decoration: underline`.
- Active tab `> a.active`: `background: var(--vb-surface); color: var(--vb-text); border-top: 3px solid var(--vb-band-accent); margin-bottom: -3px;` so it overlaps the bar's 3px bottom line and joins the page. Keep `position: relative` on it so the overlap shows. It is no longer an orange fill.
- Focus `> a:focus-visible`: `outline: 2px solid var(--vb-focus-on-band); outline-offset: -2px;`. On the active tab (page-coloured) use `--vb-focus` instead.

### 8.4 Abilities row
As 7.4. Bonus line `.ability-in-use` colour `--vb-text-soft`. Width check for the 600px sheet: each of the five columns is about 107px wide (596px window, 12px tab padding each side, four gaps of .5rem). A column needs the 3.6rem box with its 4px shadow margin (61.6px), two steppers of 1.2rem (38.4px) and two gaps of .1rem (3.2px), so 103.2px. That leaves about 3px, and about 0px if the tab shows a scrollbar, which is why the gaps are small. Do not widen the steppers or the gaps without making room.

Hierarchy on the character tab, strongest first: ability scores (1.8rem, 2px frame, hard shadow, black name button), HP and Wounds (1.4rem, 2px frame, no shadow), Fortune and Movement (1rem, no frame), the other rolls (outlined 1px, quiet), and the open tab (page-coloured, accent line on top), which only marks where you are.

### 8.5 Other rolls (Contest, Chance, Panic), selector `.var-borg-sheet .other-rolls button`
There is no rule for these buttons today; add one: `.application.var-borg .var-borg-sheet .other-rolls button { --vb-btn-bg: transparent; --vb-btn-fg: var(--vb-text); --vb-btn-border: var(--vb-line); border-width: 1px; }`. The hover (accent fill, `--vb-on-accent` text, accent border) comes from the hover tokens by itself. Do not write raw `background` or `border-color` (section 2). They must look quieter than the black ability buttons.

### 8.6 Resources (`.var-borg-sheet .resources`, `.resource`)
- HP and Wounds are the number inputs inside `.pair` (the template has no other class for them): `.application.var-borg .var-borg-sheet .resource .pair input[type="number"]`. The number is 1.4rem, weight 800, tabular numbers, in a `border: 2px solid var(--vb-line)` frame, `background: var(--vb-surface)`. The input stays the same width (3rem); the frame is the input's own border. Their `.boosted-total` overlay (`.resource .boosted-total`) becomes 1.4rem too, so it lines up.
- Fortune is the lone `.resource > input[type="number"]`: 1rem, no frame (change the existing 1.15rem rule `.resource input[type="number"]` to 1rem). Movement stays unframed: `.movement-value` becomes 1rem, weight 800 (from 1.3rem).
- The `.resources:not(.silver-footer)` double rules use `--vb-line`. The label `.resource > span:first-child` is a Label (6.1).

### 8.7 Chat card (`base.css` for the base card, `cards.css` for the rest)
- **base.css** owns only the base card `.var-borg-card`: `background: var(--vb-surface); color: var(--vb-text); border: 1px solid var(--vb-line); box-shadow: var(--vb-shadow-hard);` plus its padding, margin and fonts. It is done.
- **cards.css** owns the headline band `.var-borg-card > h3:first-child`, and every other card rule. base.css has no headline rule. Keep the headline's existing geometry exactly (`margin: -0.3rem -0.4rem 0.45rem; padding: 0.2rem 0.5rem; line-height: 1.35`, which makes the band reach the card's edges). Change only: `background: var(--vb-band); color: var(--vb-band-text); border-bottom: 3px solid var(--vb-band-accent); font-size: 1.1rem;` (the font size is already 1.1rem).
- The item card's own band `.var-borg-card .item-card-header` is a second headline band and follows the same colours.
- `.tier` is the largest text, with a .4rem margin above (7.1).
- `.die`: `border: 2px solid var(--vb-line); background: var(--vb-surface); box-shadow: var(--vb-shadow-hard); color: var(--vb-text);` 1.25rem.
- `.die.dropped`: `border: 1px dashed var(--vb-line-soft); background: var(--vb-surface-raised); box-shadow: none; color: var(--vb-text-soft); text-decoration: line-through;`.
- `.mode` and `.sum` colour `--vb-text-soft`.

### 8.8 Roll dialogs (`apps.css`)
- `.application.var-borg-dialog .vb-roll-summary` is a plate: `background: var(--vb-surface-raised); border-top: 2px solid var(--vb-line); color: var(--vb-text); padding: 0.4rem 0.6rem;` plus its existing font and centring.
- The main footer button (`.application.var-borg-dialog .form-footer button[autofocus]`): `width: 100%; font-size: 1.1rem;` and the variables `--vb-btn-bg: var(--vb-accent); --vb-btn-fg: var(--vb-on-accent); --vb-btn-border: var(--vb-line); --vb-btn-hover-bg: var(--vb-band); --vb-btn-hover-fg: var(--vb-band-accent); --vb-btn-hover-border: var(--vb-line);` (replacing the existing orange/ink variable lines; the hover inverts to a band). Other footer buttons keep the normal button look.
- Boon and Bane as 7.3.

### 8.9 Ongoing panel (`apps.css`: `#var-borg-ongoing .ongoing-inner`)
`background: var(--vb-hud-bg); color: var(--vb-hud-text); border: 1px solid var(--vb-hud-line);` Remove the `var(--color-border, #444)` fallback and the literal colours. Its hovered toggle and hovered clickable entry use `background: var(--vb-hud-hover)`.

### 8.10 Weather hex flower (`apps.css`: `.var-borg-hex-flower`)
Today it has no plate. Give `.var-borg-hex-flower` a fixed plate in both moods: `background: var(--vb-paper); box-shadow: 0 0 0 3px var(--vb-paper), 0 0 0 5px var(--vb-ink);` (palette constants, allowed by section 3). Use the two-ring box-shadow, not a border: the hexes are positioned inside the box with fixed sizes, and a border would shift them. This is a frame, not a stamped shadow. Everything inside the flower (`.hex`, `.hex::before`, `.hex-name`, `.hex-token`, the `.kind-*` rules) keeps palette constants, `--vb-hex-*` and `--vb-weather-*`; the hex outline `.hex { background: var(--vb-ink) }` and the fallback `var(--hex-fill, var(--vb-paper))` stay.

### 8.11 Journal (`journal.css`)
Document pages (letters, notices, scraps, field journal) keep palette constants in both moods. journal.css has no window chrome of its own to restyle; the window around the page is styled by base.css. Replace the literal seal colours with `--vb-seal-hi` and `--vb-seal-lo`. Replace every mood-changing token a prop uses with its fixed twin: `--vb-rule` / `--vb-rule-faint` / `--vb-rule-strong` become `--vb-paper-rule` / `-faint` / `-strong`; `--vb-stipple` becomes `--vb-paper-stipple`; `--vb-fleuron` becomes `--vb-paper-fleuron` (section 3). Otherwise the page would turn silver on paper in the dark mood.

The page's window is a `.var-borg` window, so `module/mood.mjs` puts `theme-dark` on it in the dark mood, and Foundry then colours several elements by its own interface theme. Nothing inside `.vb-page-sheet` may inherit such a colour, so journal.css sets paper colours explicitly on: the sheet itself (`color` ink, `text-shadow: none`), headings and the subtitle, blockquote, content links and inline rolls (and their icons), plain `a[href]` links (rust, underlined; Foundry's would follow the theme), `dt`, `dd`, `th`, `td`, `figcaption`, `p.inactive`, `span.highlight`, tables (transparent stripes, paper-shade header), `code` (paper-shade) and `hr`. When a new element type can appear in a page, give it an explicit paper colour here too.

### 8.12 Stage (`stage.css`)
- HUD panels (the turn strip) use `--vb-hud-*` and the band tokens (section 13, stage.css). The orb art, torch art and splash keep their palette constants (section 3). The orb `filter: drop-shadow(0 3px 6px rgba(…))` becomes `filter: drop-shadow(var(--vb-shadow-soft))`.
- The turn strip portrait is a dark gap (the 2px `border`, `--vb-band`) inside a 2px outline ring: foes `--vb-band-text` (pale), players `--vb-accent` (warm; the band accent would be silver in dark mood and hard to tell from the foes' ring). The one acting now is larger (54px against 40px) with a 3px `--vb-highlight` ring and a glow, so ring colour, size and glow all differ. Shadows over the map are `--vb-shadow-soft` everywhere (orbs, light orb, turn portraits, plates); the one blur that is not it (the speaker art, `0 6px 10px`) uses `--vb-black-60`.
- Focus rings over the map (`.vb-orbs .vb-orb:focus-visible`, `.vb-turns .vb-turn:focus-visible`, `.vb-light .vb-light__orb:focus-visible`, `.vb-light .vb-light__mini:focus-visible`, `.vb-dialogue__box:focus-visible`) use `--vb-focus-on-band` and keep their existing offsets.
- **stage.css is the single owner of the Gloom glow, the flourish and their reduced-motion switches.** base.css has none of them.
- Dark canvas pieces, exactly:

```css
body[data-vb-mood="dark"] .vb-orb--ember { filter: drop-shadow(var(--vb-shadow-soft)) saturate(.7) brightness(.85); }
body[data-vb-mood="dark"] .vb-orb--gloom:not(.is-empty, .is-filling, .is-spending) {
  animation: vb-moon-glow 6s ease-in-out infinite;
}
@keyframes vb-moon-glow {
  0%, 100% { filter: drop-shadow(var(--vb-shadow-soft)) brightness(1); }
  50% { filter: drop-shadow(var(--vb-shadow-soft)) brightness(1.18); }
}
```

  Why the `:not(...)`: a CSS animation beats every normal rule, so without it the glow would replace the existing fill and spend animations (`.is-filling`, `.is-spending`) and the grey look of an empty orb (`.is-empty`) on the Gloom orb. For the dark Ember rule no such guard is needed: the existing `.vb-orbs .vb-orb.is-empty` rule (three classes) already beats it, which is wanted. Add the off switch inside the **second** (last) `prefers-reduced-motion` block of stage.css, with the identical selector so it wins by position: `body[data-vb-mood="dark"] .vb-orb--gloom:not(.is-empty, .is-filling, .is-spending) { animation: none; }`.
- Flourish: fixed, full-screen, click-through, lasting 900 ms:

```css
body.vb-mood-to-dark::after,
body.vb-mood-to-light::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  animation: vb-mood-flourish 900ms ease-out forwards;
}
body.vb-mood-to-dark::after  { background: var(--vb-atmosphere-dark-flourish); }
body.vb-mood-to-light::after { background: var(--vb-atmosphere-light-flourish); }
@keyframes vb-mood-flourish { from { opacity: 1; } to { opacity: 0; } }
```

  The flourish backgrounds are tokens already in `tokens.css`, on `body` and identical in both moods: `--vb-atmosphere-dark-flourish` (edge vignette) and `--vb-atmosphere-light-flourish` (warm top flare). In the same last reduced-motion block add `body.vb-mood-to-dark::after, body.vb-mood-to-light::after { display: none; }`. (mood.mjs also skips the classes under reduced motion, and while the game is loading.)

### 8.13 Token ruler (`apps.css`: `.waypoint-label.var-borg-too-far .var-borg-move-cost`)
`color: var(--vb-ruler-far);` replaces the literal `#ff6b5b`. See section 11.

### 8.15 Cards strip (`stage.css`: `.vb-cards*`)
At the top-left corner of the hotbar (fixed; its left and bottom follow the hotbar), with Foundry Cards only. A 28 × 28 toggle button on HUD colours sits at its left; minimised, only the toggle shows, with a count in a `--vb-accent` / `--vb-on-accent` tab at its corner. One HUD plate per character (`.vb-cards__group`): `background: var(--vb-hud-bg); color: var(--vb-hud-text); border: 1px solid var(--vb-hud-line); box-shadow: var(--vb-shadow-soft)`, square corners, like the turn strip. The character's name is a borderless button with `--vb-hud-hover` on hover and the band focus ring. Cards are 32 × 48 with a `--vb-hud-line` frame; a turned card is faded to .55; a reading card that can be turned is a button that lifts 4px with a `--vb-accent` frame on hover and has the band focus ring; the Card Slinger's last card is 40 × 60 with a 2px `--vb-accent` outline. The card faces are Foundry's own art and stay as they are in both moods.

### 8.14 Chat cards in the chat log

The chat log is Foundry's sidebar, which has its own light or dark interface theme chosen by each user, independent of our mood. A card is therefore a complete object that depends on nothing around it: its surface (`--vb-surface`), border (`--vb-line`), hard shadow, text colour and headline band are all set on the card or its parts, every button on it sets all six `--button-*` variables, and its role tokens come from `body`, not from the sidebar. So a dark-mood card on a light sidebar is a soot plate with a silver edge, and a light-mood card on a dark sidebar is a bone plate with a hard ink edge; in both cases the card's own fill separates it from the sidebar. Do not add a rule that makes a card transparent or lets it inherit a colour from the message.

---

## 9. Never change

- Class names read by code: `var-borg`, `var-borg-card`, `var-borg-dialog`, `tier`, `tier-triumph`, `tier-success`, `tier-failure`, `tier-ruin`, `chance-positive`, `chance-neutral`, `chance-negative`, `tier-outcome`, `rolled`, `themed`, `theme-light`, `theme-dark`, every `vb-*` class, every `is-*` class, every `data-action`.
- Lang keys, templates (unless a task says so), JS behaviour, game mechanics.
- Never remove a selector; restyle it.
- Keep existing layout dimensions unless section 8 says otherwise.
- Keep both reduced-motion queries in `stage.css`.
- Do not rename or remove a palette constant.
- Do not touch another agent's stylesheet. Each stylesheet has one owner (section 12). If you need a token that does not exist, say so in your report instead of editing `tokens.css`.

---

## 10. Checklist before finishing a stylesheet

1. No literal colours: no `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, no named colours except `transparent`, `currentColor`, `inherit`. (Search the file for `#`, `rgb`, `hsl`, and for words like `white`, `black`, `red`, `gray`.)
2. No palette-constant names (`--vb-ink`, `--vb-ink-soft`, `--vb-paper`, `--vb-paper-shade`, `--vb-orange`, `--vb-yellow`, `--vb-rust`) outside the section 3 exceptions. Also no `--vb-weather-*` or `--vb-hex-*` outside the weather hex flower and the `.vb-light` weather orbs.
3. No `rgba(...)` or `#hex` anywhere, including inside `box-shadow`, `filter`, `text-shadow`, `mask-image` and gradients. A shadow that is exactly the stamped block shadow is `var(--vb-shadow-hard)`; exactly `0 3px 6px rgba(0,0,0,.55)` is `var(--vb-shadow-soft)`; every other shadow, glow or mask keeps its geometry and takes a token from section 3 or 4 for its colour (for example `0 10px 30px var(--vb-black-55)`).
4. Every selector that was in the file before is still in the file (restyled, not removed). Every protected class in section 9 still appears wherever it did.
5. The file still parses: braces and parentheses balanced, every declaration ends in `;`.
6. Every dark-only rule is written `body[data-vb-mood="dark"] <selector>`.
7. Every control you touched has a visible `:focus-visible` rule (6.3).
8. Any new transition sits under `body[data-vb-mood-ready]` and has a `prefers-reduced-motion` off switch. (The mood's colour fade in section 6.4 is the one exception.)
9. The comment header at the top of the file is updated, in British spelling, to say what the file now covers and that colours come from role tokens.
10. You edited only the files your task names.
11. You wrote no `button:hover` rule and no raw `background`, `color` or `border-color` on a button (section 2). Tick boxes use `accent-color: var(--vb-accent)`.
12. `npm test` passes, including the literal-colour test: every stylesheet must report 0 hits (`ℹ yourfile.css: 0 literal colour hit(s)`).

---

## 11. Open issues

Values below are kept as specified, or are known limits of the design. They are listed so the owner can decide. Anything that was only a disagreement between the code and this spec has been settled in the sections above and is not listed.

| # | Item | Figure | Minimum | Note |
|---|---|---|---|---|
| 1 | `--vb-text-soft` on `--vb-surface-raised` (hints, dropped dice, roll summary, hovered rows) | 6.30 light, 6.39 dark | 7:1 for body text | Passes 4.5:1. Fails 7:1 only where body-size text sits on a raised panel. |
| 2 | `--vb-text-soft` on `--vb-field-focus` (dark) | 5.05 | 7:1 body | Passes 4.5:1. |
| 3 | `--vb-alert` on the page, light | 6.32 (rust on paper) | 7:1 if used for body-size text | Passes 4.5:1. Also 5.16 on raised. |
| 4 | `--vb-ember` as text | 6.32 / 5.87 on the page; 5.16 / 5.10 on raised | 7:1 for body-size text | Passes 4.5:1. |
| 5 | `--vb-text-faint` on raised | 4.68 / 4.74 | 4.5:1 | Passes, narrowly. Placeholders and small notes only. |
| 6 | Accent-filled button text (`--vb-on-accent` on `--vb-accent`) | 5.92 / 5.97 | 7:1 if read as body text | Passes 4.5:1 as a control label. |
| 7 | `--vb-line-soft` as a row divider; `--vb-line-faint` as a tint | 2.20 / 2.10 and 1.53 / 1.42 | 3:1 | Row dividers (all of them `--vb-line-soft`, see 6.2) and decorative rules only. The dashed dropped-die border uses `--vb-line-soft`; the strike-through and the faded fill carry the meaning. Use `--vb-line-strong` (3.33 / 3.22) for any line that must be seen. |
| 8 | Hover row (`--vb-surface-raised` against `--vb-surface`) | 1.22 / 1.15 | 3:1 | Hover only. Text stays 12:1, and the pointer shows the target. |
| 9 | Accent hover border against the page, light | 2.50 | 3:1 | Button hover border is `--vb-accent`. The button text inside passes (5.92). |
| 10 | Highlight fill against the page, light | 1.32 | 3:1 | Ticked Boon: the 1px `--vb-line` border from the unticked state is kept, and the text passes. Triumph: has its own ink border. |
| 11 | Dark Ruin fill against the page | 1.93 | 3:1 | The 2px `--vb-tier-ruin-border` (14.95) carries the edge. |
| 12 | `--vb-text-faint` on `--vb-field-focus` (a placeholder in a focused field) | 4.33 light, 3.75 dark | 4.5:1 | Fails 4.5:1. The placeholder is hint text that disappears as soon as the person types; kept as specified. |
| 13 | The Ruin crosshatch in light mood | not visible | n/a | The crosshatch token is ink, drawn on an ink fill, so it only shows in dark mood. Light Ruin is carried by the black fill, the ink border and the word. A visible light crosshatch would need a new token (a bone-coloured one). |
| 14 | `.ability-step` (the minus and plus beside a score) at rest | opacity .2 | 3:1 | Deliberately faint until the ability is hovered or the button has keyboard focus (7.4). It cannot be found by touch alone. |
| 15 | The hex flower plate | n/a | n/a | A bone plate with an ink frame in both moods, so in dark mood it is the brightest thing in the panel. Chosen so the printed weather colours stay true. |

Not an accessibility issue but a layout choice made in this spec: the ability score shadow was `4px 4px 0` and becomes the shared `3px 3px 0` (`--vb-shadow-hard`).

---

## 12. Ownership

Each stylesheet has one owner. If a selector is in the right-hand column of a file, only that file's agent writes rules for it, even if it looks like another file's business. If you find a rule for a selector you do not own, leave it alone and say so in your report.

| File | Owns |
|---|---|
| `tokens.css` | Every custom property. Nobody else edits it. |
| `base.css` | The three `@font-face` rules. The window frame, title bar and its controls (`.application.var-borg`, `.window-header`, `.window-title`, `button.header-control`). The window background and text (`.window-content`). Heading and name fonts. The base chat card `.var-borg-card` (surface, text, border, shadow, margin, padding, fonts) and **nothing else about cards**. The shared "etched controls" inside `.application.var-borg :is(.var-borg-sheet, .var-borg-item-details, .var-borg-item-description, .var-borg-item-effects, .var-borg-table-panel, .var-borg-import, .var-borg-encounter, .dialog-content, .form-footer)`: `h2` (with its fleuron), `h3`, buttons, text and number fields, `select`, `textarea`. Foundry's own controls in the dark mood. The mood transition rule and its reduced-motion switch. |
| `sheets.css` | Character, foe, minion, vehicle and chest sheets: the header band and portrait, the actor name in the header, the tab bar, abilities (`.ability*`, `.boosted-*`), `.other-rolls`, resources, item and condition rows **and their hover**, opened item descriptions, `.condition-strip`, warning panels (`.attack-ruin`, `.shield-raised`, `.improving-choice`), `.foe-stats`, `.attack-mark`, `.gloom-abilities`, `.equip-toggle`, `.item-icon`, `.add-item`, `.light-controls`, `.speeds-button`, and the `.vb-dark-stamp` style. |
| `items.css` | Item sheets: `.application.var-borg.item`, `.var-borg-item-header` (the item header band) and everything `.var-borg-item-*`, the effects editor, `.lasting-effect`. |
| `cards.css` | Every chat card rule except the base `.var-borg-card`: the headline band `.var-borg-card > h3:first-child` (it owns this, base.css does not), `.item-card-header`, dice, `.tier*`, `.chance-*`, `.tier-outcome`, `.action-symbols`, `.damage-total`, card buttons (`.var-borg-card button`), fortune lines, and every `.var-borg-card.<kind>-card` rule. |
| `apps.css` | Roll dialogs and other system dialogs (`.application.var-borg-dialog`, `.var-borg-test-dialog`), the Boon and Bane toggles, the steppers, the roll summary, the dialog footer; table panels (`.var-borg-table-panel`: pools, calendar, light, weather, Miseries) **and their rows**; the weather hex flower and its plate; the creation helper, travel dialog and encounter builder; the Ongoing panel (`#var-borg-ongoing`); combat pips (`.var-borg-pips`); token ruler labels (`.waypoint-label`); the chat quick-roll buttons (`.var-borg-chat-rolls`). |
| `journal.css` | `.vb-document-page` and every `.vb-page*` (the four paper looks and the edit strip). |
| `stage.css` | The dialogue box (`.vb-dialogue*`), the splashes (`.vb-splash*`), the Ember and Gloom orbs (`.vb-orbs*`, `.vb-orb*`), the turn strip (`.vb-turns*`, `.vb-turn*`), the cards strip (`.vb-cards*`), the light, weather and time-of-day orbs (`.vb-light*`), the mood flourish, the dark Ember dimming and the Gloom glow, **and the reduced-motion switches for the glow and the flourish**. |

Row hover (`--vb-surface-raised`) belongs to whichever stylesheet owns the row (the table above). A hover rule for something you do not own is never yours to write.

---

## 13. Per-file notes

How to read these: "Changes" are the deliberate differences beyond the plain mapping of section 5. "Keeps constants" lists what may keep palette names. "Literals" lists every literal colour in the file today and what replaces it. "Dead" lists declarations that never apply and may be removed (REVIEW.md, section 5): remove one only after checking that a later rule of equal or higher specificity in the same file sets the same property on the same element.

### 13.1 sheets.css

**Changes.** 8.2 character header (band, portrait, name, plus the same for the foe header `.application.var-borg.foe .foe-sheet > .sheet-header`, whose name stays 2.1rem). 8.3 tab bar (the active tab becomes a page-coloured tab; the existing rule `.var-borg.character nav.sheet-tabs > a.active` is edited in place). 7.4 and 8.4 abilities: the score box `.application.var-borg .var-borg-sheet .ability input[type="number"]` goes from 1.9rem to 1.8rem and `box-shadow: var(--vb-shadow-hard)` (was 4px), and so does `.ability .boosted-total` (1.9rem to 1.8rem); the focused score box uses `--vb-field-focus`. 8.5 add the `.other-rolls button` rule. 8.6 resources (use `.pair`). 7.5 add the `.vb-dark-stamp` style (the element may not exist yet). Row hover `.item-row:hover, .condition-row:hover` uses `--vb-surface-raised`.

**Patterns for the rest of the file (not literals, but palette names the mapping does not spell out).**
- Bands: `header.var-borg-sheet`, `.foe-sheet > .sheet-header`, `nav.sheet-tabs`, `.attack-ruin`, `.gloom-abilities h2`, `.attack-mark`, the stat plates: `--vb-band` with `--vb-band-text`. Yellow text or border on a band (`.item-state` in the foe header, `.gloom-abilities h2`, the Gloom `.attack-mark`) becomes `--vb-band-hover`. Orange text on a band (`.attack-ruin strong`) becomes `--vb-band-hover`. The orange line under the foe header becomes `--vb-band-accent`.
- Buttons on a band (foe header, `.attack-ruin button`, the over-limit `.text-button`, the minion button in the band): use the "buttons on a band" row of section 5. The over-limit text on its button (`--vb-orange`) becomes `--vb-band-hover`.
- `.equip-toggle`: unticked `--vb-btn-bg` and `--vb-btn-fg` both `var(--vb-surface)`, border `--vb-line`, hover bg `--vb-surface-raised`, hover fg `--vb-text`, hover border `--vb-line`. Ticked (`.active`): `--vb-btn-bg` and `--vb-btn-hover-bg` `var(--vb-text)`, `--vb-btn-hover-fg: var(--vb-surface)`, and `box-shadow: 2px 2px 0 var(--vb-accent)`. The tick colour stays the same as the unticked fill (`--vb-surface`).
- `.ability-step`: `--vb-btn-fg: var(--vb-text-soft)`, `--vb-btn-border: transparent`, `--vb-btn-hover-bg: var(--vb-accent)`, `--vb-btn-hover-fg: var(--vb-on-accent)`, `--vb-btn-hover-border: transparent` (replacing its existing variable lines). Keep its size, its faint resting opacity and its `border: none`.
- `.item-icon:hover img` and its focus ring (orange outline): `outline: 2px solid var(--vb-accent)`. Focus rings on sheets (`:focus-visible`): section 6.3.
- `.foe-stats`, `.shield-raised`, `.improving-choice`, the portrait backgrounds: `--vb-surface-raised`. `.condition-strip:hover`: `--vb-surface-raised` with border `--vb-line`.
- `accent-color: var(--vb-orange)` (foe header tick box): `var(--vb-accent)`.
- The foe header `select`: `background: var(--vb-surface); color: var(--vb-text)`.
- `.var-borg-sheet .attack-ruin` (the first one, near the start of the file) and the later `.application.var-borg .var-borg-sheet .attack-ruin` are the same object; the later one wins (see Dead).

**Keeps constants.** None.

**Literals.** Line 920 `.item-list .item-description`: `background: rgba(217, 207, 184, 0.5)` becomes `var(--vb-surface-wash)`. Its `border-left: 3px solid var(--vb-orange)` becomes `--vb-accent`, and its `color: var(--vb-ink)` becomes `--vb-text`.

**Dead (removed in the second review).** The early `.attack-ruin strong` colour; the early `.shield-raised` and `.improving-choice` borders and 4px corners (the etched rules set them square); the early `border-bottom` and `padding` on `.item-row` and `.condition-row`; the early width, size and height of `.ability input`; the early `.movement-value` and `.ability .boosted-total` sizes; the `opacity` on `.ability-in-use`, `.item-summary`, `.hint`, `.empty`; the `.equip-toggle` opacity rules; the early description border and size; the early h2, h3 and `.actor-name` sizes (base.css sets them). `.heading-with-button` is no longer in the file.

### 13.2 items.css

**Changes.** The item header band (`.application.var-borg.item .var-borg-item-header`) follows 8.2: band, portrait frame `--vb-band-text` with `--vb-surface-raised` and the crosshatch, name shadow `2px 2px 0 var(--vb-band-accent)` (keeps its 2px size), hover underline `--vb-band-accent`, focus underline `--vb-band-hover`, placeholder `--vb-band-text` at opacity .6. Its fields on the band: text `--vb-band-text`, bottom line `--vb-band-text`, focus background `--vb-field-focus` with `--vb-text` text; its `select`: `background: var(--vb-surface); color: var(--vb-text)`. Its `.hint`: `--vb-band-text` at opacity .8. Tick boxes: `accent-color: var(--vb-accent)` in the band and in the body.

**Rest.** The effect rows (`.effect-row`): border `--vb-line`, left border 4px `--vb-line`, background `--vb-surface-raised`. Fieldsets and the double rule under `.effects-header h3`: `--vb-line`. `.hint`: `--vb-text-soft`. `.effect-remove` and `.effect-chosen` use the button variables and `--vb-text-soft`. `.lasting-effect` border `--vb-line-soft`.

**Keeps constants.** None.

**Literals.** None.

The item name is 1.9rem (6.1), set in both base.css and items.css.

**Dead (removed in the second review).** `.var-borg-item-header .item-name` (the etched rule sets size and height), the early `.effect-row` border and corners, the `.effect-chosen` opacity, and the early h3 border under `.var-borg-item-details`.

### 13.3 cards.css

**Changes.** 8.7 (the headline band keeps its geometry; colours become band tokens). The `.tier` base rule: the font size goes from 1.35rem to 1.5rem and `margin: 0.3rem 0` becomes `0.4rem 0 0.3rem`; its `border: 2px solid transparent` stays. The two `.tier` rules (lines 78 and 87) may be merged. Tier shapes as 7.1 (replace the existing colour rules in place: `.tier-triumph, .chance-positive` gain the inset rings; `.tier-failure` keeps its 8px left bar; `.tier-ruin, .chance-negative` gain `position: relative` and the `::before` crosshatch). `.die`, `.die.dropped` (dropped: `border: 1px dashed`, as 8.7), `.mode`, `.sum`: 8.7. `.action-symbols`: 7.2. `.damage-total` and the Improving `.die`: `box-shadow: var(--vb-shadow-hard)` (the Improving die has a 2px shadow today; it becomes the shared 3px). Card button block (`.var-borg-card { --vb-btn-* }` and `.var-borg-card button { --button-* }`): delete the `--vb-btn-*` lines on `.var-borg-card` (the tokens now provide them), keep the `--button-*` wiring, add `--button-focus-outline-color: var(--vb-focus)`. Card button focus ring: `outline: 2px solid var(--vb-focus); outline-offset: 2px`. Fortune buttons keep their quiet outline (`--vb-btn-bg: transparent; --vb-btn-fg: var(--vb-text)`).

**Palette names to replace (no literals in this file).**
- `.group-panic-row`, `.fortune` (dashed), `.verdict` (3px double), `improving-card h4`: borders become `--vb-line` (the dashed fortune rule `--vb-line-soft`).
- `.contested-card .side.winner`: left bar `--vb-line` (it was `--vb-good`, which is now the text colour); background `--vb-surface-raised`.
- `.gloom-card .gloom-cost` (yellow text inside the headline band): `--vb-band-hover`.
- `.light-card.out > h3:first-child`: `color: var(--vb-band-hover)`; `border-bottom-color: var(--vb-band-accent)`.
- `.item-card-header`: `background: var(--vb-band); color: var(--vb-band-text); border-bottom: 3px solid var(--vb-band-accent)`; its `img`: `border: 1px solid var(--vb-band-text); background: var(--vb-surface-raised)`; its `h3` colour `--vb-band-text`; `.item-card-type` colour `--vb-band-text` with `opacity: .8`.
- `.misery-end` already uses the aliases `--vb-misery-end-*`; leave them.
- `.power-description`, `.hint`: `--vb-text-soft`.
- Aliases (`--vb-bad`, `--vb-good`, `--vb-hazard`, `--vb-magic-strong`, `--vb-rule`) keep working and follow the mood; use them as they are or switch to the role token.

**Keeps constants.** None.

**Literals.** None.

The Ruin crosshatch sits behind the word (7.1). Unrolled outcomes are faded to .7, not .6 (.6 gave 4.51 : 1 on a plain page and 4.19 on a raised one). The group Panic rows use `--vb-line-soft` like every other row.

**Dead.** None. The disabled card button follows Foundry's own way (section 2).

### 13.4 apps.css

**Changes.** 8.8 (roll summary plate; main footer button), 7.3 (Boon and Bane toggles: the ticked rule `.vb-toggle input:checked + span` is replaced by the two rules on `.vb-toggle:first-child` and `.vb-toggle:last-child`; focus ring `outline-offset: 1px` stays), 8.9 (Ongoing panel), 8.10 (hex plate), 8.13 (ruler). Dialog and panel text: `--vb-text`, hints `--vb-text-soft`, rules `--vb-line` / `--vb-line-faint`, fieldset borders `--vb-line`, `.hint.automatic` left bar `--vb-accent`, tick boxes `accent-color: var(--vb-accent)`. Table-panel rows (`.pool`, `.light-row`, `.weather-row`, `.misery-row`), dialog form groups and encounter foe rows: borders `--vb-line-soft`. The pool counts (`.pool-count`): Ember is an accent tile with `--vb-on-accent` text, Gloom a band tile with `--vb-band-text` text (7.2). `.misery-row.end` (the black block): `--vb-band` with `--vb-band-text`; its name, sunless and icon (orange): `--vb-band-hover`; its label, light and omen (paper-shade): `--vb-band-text` at opacity .8; its button: the "buttons on a band" row of section 5. The stepper buttons (`--vb-btn-bg: transparent; --vb-btn-fg`): `--vb-text`. `.vb-have` and `.vb-stepper label`: `--vb-text-soft`. `.hex.pick:hover` and the like stay as they are (inside the plate).

**Keeps constants.** Everything inside `.var-borg-hex-flower` (hex fills, hex text, token, ring, outlines, plate). The footer and table panels do not.

**Literals.** Line 899: `var(--color-border, #444)` becomes `var(--vb-hud-line)`. Line 901: `rgba(11, 10, 19, 0.82)` becomes `var(--vb-hud-bg)`. Line 902: `#f0f0e0` becomes `var(--vb-hud-text)`. Lines 927 and 968: `rgba(255, 255, 255, 0.12)` (hovered toggle, hovered clickable entry) become `var(--vb-hud-hover)`. Line 1114: `#ff6b5b` becomes `var(--vb-ruler-far)`.

**Dead (removed in the second review).** The generic ticked-toggle rule (the Boon and Bane rules replace it), the repeated `border-top-color` rule on the panel rows, the early `.pool-count` size and weight, the `opacity` on `.day-number`, `.weather-label`, `.misery-label`, `.misery-light` and the creation helper hint, the `.misery-icon` opacity, and the `color` on `.misery-row.end .misery-name` (the band rule sets it). Earlier note, now done: REVIEW named apps.css lines 92 to 105 and 412 to 415. Check these: the early `.pool-count` (size 1.6rem, bold, centred), `.pool-name` and `button.adjust` rules near line 85 to 105 are repeated by later `.var-borg-table-panel` rules (around lines 600 to 615: `.pool.gloom .pool-count`, `button.adjust`), and the early `.misery-icon` and `.misery-label` / `.misery-light` opacity near lines 405 to 420 are overridden by the later `.misery-icon { opacity: 1 }`. Merge a duplicate only when the later rule sets the same property on the same selector; keep the properties that differ.

### 13.5 journal.css

**Changes.** None to layout. The pages are paper props. Foundry's themed link, table, code and list colours are overridden with paper colours (8.11).

**Keeps constants.** Everything. Props use `--vb-ink`, `--vb-ink-soft`, `--vb-paper`, `--vb-paper-shade`, `--vb-rust` directly.

**Replace mood-changing tokens with fixed twins (section 8.11).** `--vb-rule` becomes `--vb-paper-rule` (the content-link border, the body heading rules); `--vb-rule-strong` becomes `--vb-paper-rule-strong` (blockquote); `--vb-rule-faint` becomes `--vb-paper-rule-faint` (the ruled lines of the field journal); `--vb-stipple` becomes `--vb-paper-stipple` (the sheet, the field journal and the scrap backgrounds); `--vb-fleuron` becomes `--vb-paper-fleuron` (the notice, the seal; the seal keeps its `filter: invert(1)`).

**Literals.**
- Line 38 `.vb-page .vb-page-sheet` `box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35)`: `0 2px 10px var(--vb-black-35)`.
- Line 188 (seal ring) `rgba(0, 0, 0, 0.25)`: `var(--vb-black-25)`.
- Line 189 (seal body) `radial-gradient(circle at 38% 34%, #b8481a, var(--vb-rust) 55%, #5e2004)`: `var(--vb-seal-hi), var(--vb-rust) 55%, var(--vb-seal-lo)`.
- Line 190 (seal) `box-shadow: 0 2px 4px rgba(0, 0, 0, 0.45)`: `0 2px 4px var(--vb-black-45)`.
- Line 247 (scrap smudge) `rgba(74, 67, 58, 0.18)`: `var(--vb-smudge-ink)`.
- Line 248 (scrap stain) `rgba(143, 50, 8, 0.12)`: `var(--vb-smudge-rust)`.
(Seven literals in six lines: line 189 has two.)

**Dead.** None known.

### 13.6 stage.css

**Changes.** 8.12 (Gloom glow, Ember dimming, flourish, focus rings). The dialogue box is an overlay panel: `.vb-dialogue__box` gets `background: var(--vb-band)` (replacing the near-opaque ink gradient, which looked the same), `color: var(--vb-band-text)`, `border: 2px solid var(--vb-band)`, `outline: 1px solid var(--vb-band-accent)`; its name plate `.vb-dialogue__name`: `background: var(--vb-accent); color: var(--vb-on-accent); border: 2px solid var(--vb-band); box-shadow: var(--vb-shadow-hard)`; the emote text `--vb-band-text` at opacity .8; the next lozenge `--vb-accent`. The turn strip (`.vb-turns*`, `.vb-turn*`) is an overlay HUD: plates (`.vb-turn`, `.vb-turn__init`, `.vb-turn__actions`) use `--vb-band` with border `--vb-band-accent`, text `--vb-band-hover`; the portrait is a `--vb-band` border (a dark gap) inside an outline ring `2px solid var(--vb-band-text)` (foes), `var(--vb-accent)` (players); the current turn `.is-now`: outline `3px solid var(--vb-highlight)` and glow `0 0 10px var(--vb-highlight), var(--vb-shadow-soft)`; spent action `--vb-text-soft` is wrong on a band, use `--vb-band-text` at opacity .6 (.5 gave 3.68 : 1 in dark mood); the `.vb-turns__round-mark` and `.vb-turns__more` text `--vb-band-text` with `text-shadow: 0 0 3px var(--vb-band), 0 0 6px var(--vb-band)`; the defeated cross `--vb-band-text`.

**Keeps constants.** The splash (`.vb-splash*`): flash, rays, band, words, art. The orbs (`.vb-orbs*`, `.vb-orb*`): art, count, name plate, round plate and rules. The torch and its companions (`.vb-light*`): orb, ring, flame, plate, weather and time orbs (they use `--vb-weather-*`). These keep `--vb-ink`, `--vb-paper`, `--vb-paper-shade`, `--vb-orange`, `--vb-yellow`, `--vb-rust`, `--vb-ink-soft`. The inline styles in `module/pool-orbs.mjs` also use palette names; they are not touched. The splash's crack `data:` image keeps its hex colours (section 3).

**Literals.** Replace as follows. A shadow that is exactly `0 3px 6px rgba(0, 0, 0, 0.55)` becomes `var(--vb-shadow-soft)` (lines 443, 499 inside `drop-shadow`, 533, 579, 602, 740, 784). The orb and light-orb variants at `0.6` (lines 699 and 751) become `var(--vb-shadow-soft)` as well.
- 34 `drop-shadow(0 6px 10px rgba(0, 0, 0, 0.6))`: `var(--vb-black-60)`.
- 35 `mask-image: linear-gradient(to bottom, #000 70%, transparent 100%)`: `var(--vb-black)`.
- 52 dialogue box background: replace the whole two-part value with `var(--vb-band)` (see Changes).
- 58 `0 10px 30px rgba(0, 0, 0, 0.55)`: `0 10px 30px var(--vb-black-55)`.
- 169 `radial-gradient(circle, #000 0%, rgba(0, 0, 0, 0.6) 18%, transparent 42%)`: `var(--vb-black) 0%, var(--vb-black-60) 18%`.
- 179 Ruin bruise: `rgba(143, 50, 8, 0.45)` becomes `var(--vb-bruise-rust)`; `rgba(20, 18, 16, 0.9)` becomes `var(--vb-vignette-ink)`.
- 195 `0 20px 60px rgba(0, 0, 0, 0.7)`: `var(--vb-black-70)`.
- 229 `0 0 30px rgba(236, 106, 31, 0.8)`: `var(--vb-glow-orange)`.
- 244 `0 0 24px rgba(143, 50, 8, 0.9)`: `var(--vb-glow-rust)`.
- 288 `drop-shadow(0 16px 24px rgba(0, 0, 0, 0.7))`: `var(--vb-black-70)`; 297 `... 0.8`: `var(--vb-black-80)`.
- That covers all 23 hits the test counts for stage.css; afterwards it must report 0.

**Dead.** None known. The two reduced-motion queries (around lines 395 and 838) must both stay.

### 13.7 base.css (for reference; already done)

Pilot restyle. Review fixes already applied: no hover rule, hover border is the accent, the card headline and the Gloom/flourish reduced-motion rules removed, header-control hover set through Foundry's hover variables, Foundry's dark-theme controls overridden for the dark mood, `backdrop-filter: none`. Known and left alone: the early `font-family` rule for `input, select, textarea, button` is overridden for buttons in the shared containers by the later head-font button rule (REVIEW section 5).
