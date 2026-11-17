/**
 * The VÅR BORG scene weather effects (step 63, GAPS 308).
 *
 * Each effect is added to CONFIG.weatherEffects, so it shows in Scene
 * Configuration → Ambience → Weather beside Foundry's own. Their ids and
 * which weather they stand for are in module/rules/scene-weather.mjs.
 * The effects are looks only; they never change a rule.
 *
 * How an effect is built (Foundry v14):
 * - shader parts: Foundry's rain, snow and fog shaders, with our own
 *   colour (tint, red/green/blue from 0 to 1), speed and strength;
 * - particle parts: little pictures that drift across the screen
 *   (count, speed, angle in degrees with 0 = right and 90 = down, size,
 *   opacity, colour), using the white shapes in assets/particles/.
 *
 * To tweak a look, change the numbers below and reload Foundry (F5).
 */

import { PREFIX } from "../rules/scene-weather.mjs";
import { weatherShaders } from "./shaders.mjs";

/* -------------------------------------------- */
/*  Building blocks                              */
/* -------------------------------------------- */

const shaders = () => foundry.canvas.rendering.shaders;

/** A part drawn by a weather shader: one of Foundry's (by name) or one of ours (a class). */
function shaderPart(id, shader, config, { blendMode = PIXI.BLEND_MODES.SCREEN, performanceLevel } = {}) {
  const part = {
    id,
    effectClass: shaders().WeatherShaderEffect,
    shaderClass: typeof shader === "string" ? shaders()[shader] : shader,
    blendMode,
    config
  };
  if (performanceLevel) part.performanceLevel = performanceLevel;
  return part;
}

/** Rain: opacity, tint, intensity (how many drops), strength (how long), rotation (slant, radians), speed. */
const rain = (id, config) => shaderPart(id, "RainShader", config);

/** Snow: tint, direction (drift), speed, scale (flake size). */
const snow = (id, config) => shaderPart(id, "SnowShader", config);

/** Fog: tint, intensity, slope (how patchy), speed, scale. */
const fog = (id, config, options) => shaderPart(id, "FogShader", config, options);

/**
 * Our veil (module/weather-fx/shaders.mjs): tint, intensity, vignette, reach,
 * creep, pulse, speed. It darkens and tints; with glow: true it adds light instead.
 */
const veil = (id, config) => shaderPart(id, weatherShaders().VeilShader, config, {
  blendMode: config.glow ? PIXI.BLEND_MODES.SCREEN : PIXI.BLEND_MODES.MULTIPLY
});

/** Our lightning flashes: tint, strength, interval (seconds), chance. */
const flash = (id, config) => shaderPart(id, weatherShaders().FlashShader, config);

/** A particle part: one or more streams of little pictures drifting across the screen. */
function particles(id, ...streams) {
  return { id, particles: streams.map(config => ({ viewPadding: 0.1, ...config })) };
}

/** One of our particle shapes (assets/particles/, white so they can be tinted). */
const shape = name => `systems/var-borg/assets/particles/${name}.svg`;

/** Glowing particles add their light to the scene. */
const GLOW = () => PIXI.BLEND_MODES.ADD;

/** Opacity over a particle's life: fade in, hold, fade out (with min/max for variety). */
const twinkle = (min, max) => ({
  min, max, curve: [{ time: 0, value: 0 }, { time: 0.3, value: 1 }, { time: 0.7, value: 1 }, { time: 1, value: 0 }]
});

/** Drawn upright and never turned. */
const UPRIGHT = { spread: 0 };
/** Drawn pointing the way it travels. */
const ALONG = { alignVelocity: true, spread: 0 };

/** A velocity that jerks in a new random direction every frame (Shadowblight). */
function jitter(strength) {
  return { fn: (particle, dt, out) => {
    out.x = (Math.random() - 0.5) * strength;
    out.y = (Math.random() - 0.5) * strength;
  } };
}

/* -------------------------------------------- */
/*  Tier 1: Foundry's shaders, re-tuned          */
/* -------------------------------------------- */

/** The storm's racing clouds and driving rain, shared by Storm (rain) and Lightstrike. */
function stormParts() {
  return [
    fog("stormCloud", { tint: [0.6, 0.65, 0.75], intensity: 0.06, slope: 1.5, speed: -40, scale: 25 },
      { performanceLevel: 2 }),
    rain("rain", { opacity: 0.5, tint: [0.7, 0.85, 1], intensity: 1.7, strength: 1.6, rotation: 0.55, speed: 0.34 })
  ];
}

const TIER_ONE = {
  // Slow cloud shadows drifting over the land.
  clouded: [
    fog("cloudShadow", { tint: [1, 1, 1], intensity: 0.3, slope: 0.6, speed: 0.15, scale: 0.6 },
      { blendMode: PIXI.BLEND_MODES.MULTIPLY })
  ],

  lightRain: [
    rain("rain", { opacity: 0.32, tint: [0.7, 0.85, 1], intensity: 0.95, strength: 1.05, rotation: 0.2, speed: 0.2 })
  ],
  heavyRain: [
    rain("rain", { opacity: 0.35, tint: [0.7, 0.85, 1], intensity: 1.4, strength: 1.3, rotation: 0.3, speed: 0.28 })
  ],
  // The storm, with a flash of lightning now and then (rarer than Lightstrike's).
  rainStorm: [
    ...stormParts(),
    flash("lightning", { tint: [0.85, 0.9, 1], strength: 0.55, interval: 15, chance: 0.4 })
  ],

  lightSnow: [
    snow("snow", { tint: [0.85, 0.95, 1], direction: 0.3, speed: 1.2, scale: 3 })
  ],
  heavySnow: [
    snow("snow", { tint: [0.9, 0.97, 1], direction: 0.6, speed: 3, scale: 2.2 })
  ],
  blizzard: [
    snow("snow", { tint: [0.95, 1, 1], direction: 0.9, speed: 9, scale: 2.4 }),
    fog("whiteout", { tint: [1, 1, 1], intensity: 0.2, slope: 1, speed: -5 }, { performanceLevel: 2 })
  ],

  // A greasy, grey downpour; slick brown mud underneath.
  siltRain: [
    fog("mud", { tint: [0.75, 0.62, 0.45], intensity: 0.22, slope: 0.4, speed: 0.1 },
      { blendMode: PIXI.BLEND_MODES.MULTIPLY }),
    rain("rain", { opacity: 0.45, tint: [0.62, 0.58, 0.5], intensity: 1.5, strength: 1.5, rotation: 0.45, speed: 0.3 })
  ],

  // Runoff from the refineries settles as a metallic fog.
  hazefall: [
    fog("haze", { tint: [0.72, 0.76, 0.8], intensity: 0.7, slope: 0.3, speed: 0.12 }),
    fog("hazeLow", { tint: [0.55, 0.6, 0.65], intensity: 0.35, slope: 0.8, speed: -0.3, scale: 2 },
      { performanceLevel: 2 })
  ],

  // A prismatic vapour: two thin fogs of different colours shifting over each other.
  oilmist: [
    fog("mistViolet", { tint: [0.8, 0.45, 1], intensity: 0.28, slope: 0.5, speed: 0.2, rotation: 0.6 }),
    fog("mistTeal", { tint: [0.35, 1, 0.8], intensity: 0.22, slope: 0.6, speed: -0.25, rotation: 2.2 },
      { performanceLevel: 2 })
  ],

  // Windy weather: near-sideways streaks and leaves torn across the map.
  strongGales: [
    rain("gust", { opacity: 0.12, tint: [0.85, 0.85, 0.85], intensity: 0.5, strength: 2, rotation: 1.35, speed: 0.6 }),
    particles("leaves", {
      textures: Array.fromRange(6).map(n => `ui/particles/leaf${n + 1}.png`),
      count: 120,
      lifetime: 4000,
      velocity: { speed: [350, 600], angle: [-8, 12] },
      rotation: { speed: [300, 600] },
      alpha: [0.6, 0.9],
      scale: [0.1, 0.3],
      fade: { out: 0.2 }
    })
  ]
};

/* -------------------------------------------- */
/*  Tier 2: our own particle shapes              */
/* -------------------------------------------- */

const TIER_TWO = {
  // An eerie whistling: faint thin streaks racing by.
  whistling: [
    particles("streaks", {
      textures: [shape("streak")], count: 80, lifetime: [900, 1600],
      velocity: { speed: [700, 1100], angle: [-4, 4] }, rotation: ALONG,
      alpha: twinkle(0.45, 0.8), scale: [1.2, 2.8], tint: 0xDCE6F2
    })
  ],

  // A thin blue ice: pale glints twinkling on and off.
  // (Drawn normally rather than as added light, so it shows on bright maps too,
  // with a cold blue edge creeping in.)
  creepfrost: [
    veil("cold", { tint: [0.72, 0.86, 1], intensity: 0.08, vignette: 0.4, reach: 0.55, creep: 0.6, speed: 0.3 }),
    particles("glints", {
      textures: [shape("frost-glint")], count: 170, lifetime: [2500, 5000],
      velocity: { speed: [2, 8], angle: [0, 360] }, rotation: { spread: Math.PI, speed: [-20, 20] },
      alpha: twinkle(0.6, 1), scale: [0.25, 0.6], tint: 0x8FC4FF
    }, {
      textures: [shape("spark")], count: 40, lifetime: [600, 1400],
      velocity: { speed: [0, 3], angle: [0, 360] }, rotation: { spread: Math.PI },
      alpha: twinkle(0.7, 1), scale: [0.1, 0.25], tint: 0xE8F6FF, blend: GLOW()
    })
  ],

  // Slow, wandering fires: drifting embers and tongues of flame.
  tamefire: [
    particles("flames", {
      textures: [shape("wisp")], count: 25, lifetime: [3000, 6000],
      velocity: { speed: [10, 30], angle: [250, 290] }, rotation: UPRIGHT, drift: { enabled: true, intensity: 15 },
      alpha: twinkle(0.25, 0.5), scale: [0.4, 1], blend: GLOW(),
      tint: { curve: [{ time: 0, value: 0xFFD27A }, { time: 0.5, value: 0xFF7A1F }, { time: 1, value: 0x8A1E0A }] }
    }, {
      textures: [shape("ember")], count: 120, lifetime: [2000, 4500],
      velocity: { speed: [30, 80], angle: [240, 300] }, rotation: UPRIGHT, drift: { enabled: true, intensity: 20 },
      alpha: twinkle(0.5, 1), scale: [0.12, 0.3], blend: GLOW(),
      tint: { curve: [{ time: 0, value: 0xFFE08A }, { time: 1, value: 0xFF4A10 }] }
    })
  ],

  // Black spores drifting from twisted trees, tumbling as they go.
  blightPollen: [
    particles("spores", {
      textures: [shape("spore")], count: 160, lifetime: [5000, 9000],
      velocity: { speed: [10, 35], angle: [20, 70] }, rotation: { spread: Math.PI, speed: [-60, 60] },
      drift: { enabled: true, intensity: 12 },
      alpha: twinkle(0.55, 0.9), scale: [0.12, 0.35], tint: 0x14130F
    })
  ],

  // Magic is abundant: the sky shimmers with bright, many-coloured sparks.
  photonStorm: [
    ...[0xFFF6C8, 0x9FE8FF, 0xFFA8F0, 0xB6FFB0].map((tint, i) => particles(`sparks${i}`, {
      textures: [shape("spark")], count: 45, lifetime: [800, 2200],
      velocity: { speed: [5, 40], angle: [0, 360] }, rotation: { spread: Math.PI, speed: [-90, 90] },
      alpha: twinkle(0.5, 1), scale: [0.1, 0.45], tint, blend: GLOW()
    }))
  ],

  // Everything weighed down: grey motes falling straight down.
  heavyGravity: [
    particles("falling", {
      textures: [shape("mote")], count: 140, lifetime: [1500, 3000],
      velocity: { speed: { min: 60, max: 160, curve: [{ time: 0, value: 0.4 }, { time: 1, value: 1.6 }] }, angle: [88, 92] },
      alpha: twinkle(0.3, 0.6), scale: [0.08, 0.2], tint: 0x8A8C90
    })
  ],

  // The world lets go: pale motes rising slowly.
  lightGravity: [
    particles("rising", {
      textures: [shape("mote")], count: 110, lifetime: [5000, 9000],
      velocity: { speed: [10, 30], angle: [260, 280] }, drift: { enabled: true, intensity: 8 },
      alpha: twinkle(0.25, 0.55), scale: [0.08, 0.25], tint: 0xE8EEF8, blend: GLOW()
    })
  ],

  // Unnatural vitality: green-gold motes rising quickly.
  energyFont: [
    particles("vitality", {
      textures: [shape("mote")], count: 150, lifetime: [1500, 3000],
      velocity: { speed: [80, 160], angle: [255, 285] }, drift: { enabled: true, intensity: 15 },
      alpha: twinkle(0.4, 0.8), scale: [0.08, 0.22], blend: GLOW(),
      tint: { curve: [{ time: 0, value: 0xC8FF6A }, { time: 1, value: 0xFFD54A }] }
    })
  ],

  // Lethargy: dull motes hanging almost still, slowly fading.
  energyVoid: [
    veil("dull", { tint: [0.5, 0.5, 0.56], intensity: 0.22, vignette: 0.3, reach: 0.5, pulse: 0.15, speed: 0.3 }),
    particles("lethargy", {
      textures: [shape("mote")], count: 170, lifetime: [7000, 12000],
      velocity: { speed: [1, 6], angle: [0, 360] },
      alpha: twinkle(0.5, 0.85), scale: [0.15, 0.4], tint: 0x45414F
    })
  ],

  // A glorious day: warm embers rising (the golden glow comes in tier 3).
  dayOfEmber: [
    particles("embers", {
      textures: [shape("ember")], count: 110, lifetime: [2500, 5000],
      velocity: { speed: [40, 90], angle: [250, 290] }, rotation: UPRIGHT, drift: { enabled: true, intensity: 15 },
      alpha: twinkle(0.5, 0.95), scale: [0.12, 0.28], blend: GLOW(),
      tint: { curve: [{ time: 0, value: 0xFFF0B0 }, { time: 1, value: 0xFF9A2A }] }
    })
  ],

  // Magic turns unstable: purple-black motes jerking about (a pulsing veil comes in tier 3).
  shadowblightOutbreak: [
    particles("blight", {
      textures: [shape("mote")], count: 130, lifetime: [1500, 3500],
      velocity: jitter(240),
      alpha: twinkle(0.5, 0.85), scale: [0.1, 0.3], tint: 0x3A1450
    }, {
      textures: [shape("spark")], count: 30, lifetime: [300, 900],
      velocity: jitter(400), rotation: { spread: Math.PI },
      alpha: twinkle(0.4, 0.8), scale: [0.1, 0.3], tint: 0xB46AFF, blend: GLOW()
    })
  ]
};

/* -------------------------------------------- */
/*  Tier 3: our own shaders                      */
/* -------------------------------------------- */

const TIER_THREE = {
  // Thunder and lightning: the storm, with flashes now and then.
  lightstrike: [
    ...stormParts(),
    flash("lightning", { tint: [0.85, 0.9, 1], strength: 0.7, interval: 6, chance: 0.6 })
  ],

  // The clouds dip low and swallow the light.
  loomingDark: [
    fog("lowCloud", { tint: [1, 1, 1], intensity: 0.3, slope: 0.5, speed: 0.1, scale: 0.6 },
      { blendMode: PIXI.BLEND_MODES.MULTIPLY }),
    veil("darkness", { tint: [0.1, 0.1, 0.14], intensity: 0.45, vignette: 0.45, reach: 0.6, creep: 0.3, speed: 0.5 })
  ],

  // Every shadow stretches and sharpens: ragged dark edges creeping in.
  shadowstretch: [
    veil("shadows", {
      tint: [0.05, 0.04, 0.08], intensity: 0.08, vignette: 0.85, reach: 0.7, creep: 0.9, pulse: 0.15, speed: 0.4
    })
  ],

  // The dark is strong today: a dark wash, and black embers and ash rising.
  blackburn: [
    veil("dark", { tint: [0.08, 0.06, 0.06], intensity: 0.3, vignette: 0.5, reach: 0.5, creep: 0.4, speed: 0.4 }),
    particles("blackEmbers", {
      textures: [shape("ember")], count: 60, lifetime: [3000, 6000],
      velocity: { speed: [20, 50], angle: [255, 285] }, rotation: UPRIGHT, drift: { enabled: true, intensity: 10 },
      alpha: twinkle(0.5, 0.85), scale: [0.12, 0.28], tint: 0x0E0A0A
    }, {
      textures: [shape("ash")], count: 50, lifetime: [4000, 8000],
      velocity: { speed: [10, 30], angle: [240, 300] }, rotation: { spread: Math.PI, speed: [-40, 40] },
      alpha: twinkle(0.4, 0.75), scale: [0.1, 0.25], tint: 0x1A1616
    })
  ],

  // A sword day, a red day: a faint red wash that breathes, dark motes falling.
  dayOfGloom: [
    veil("red", { tint: [0.75, 0.2, 0.2], intensity: 0.22, vignette: 0.45, reach: 0.5, pulse: 0.25, speed: 0.8 }),
    particles("gloom", {
      textures: [shape("mote")], count: 80, lifetime: [4000, 8000],
      velocity: { speed: [8, 25], angle: [80, 100] }, drift: { enabled: true, intensity: 6 },
      alpha: twinkle(0.35, 0.65), scale: [0.1, 0.25], tint: 0x2A0808
    })
  ],

  // A glorious day: a warm golden glow under the rising embers.
  dayOfEmber: [
    veil("glow", {
      tint: [0.45, 0.3, 0.08], intensity: 0.1, vignette: 0.25, reach: 0.6, pulse: 0.2, speed: 0.6, glow: true
    }),
    ...TIER_TWO.dayOfEmber
  ],

  // Magic turns unstable: a violet veil that throbs fast and unevenly.
  shadowblightOutbreak: [
    veil("throb", {
      tint: [0.35, 0.15, 0.45], intensity: 0.15, vignette: 0.5, reach: 0.6, creep: 0.6, pulse: 0.6, speed: 2.5
    }),
    ...TIER_TWO.shadowblightOutbreak
  ]
};

/* -------------------------------------------- */
/*  Registration                                 */
/* -------------------------------------------- */

/** Every effect, by name (without the prefix). A later tier adds to or replaces an earlier one. */
const EFFECTS = { ...TIER_ONE, ...TIER_TWO, ...TIER_THREE };

/** Add the VÅR BORG effects to Foundry's weather list. Called at init. */
export function registerWeatherFx() {
  for (const [name, effects] of Object.entries(EFFECTS)) {
    const id = PREFIX + name;
    CONFIG.weatherEffects[id] = {
      id,
      label: `VARBORG.WeatherFx.Label.${name}`,
      // Like Foundry's shader weather: drawn over the whole scene, roofs included.
      filter: { enabled: false },
      effects: foundry.utils.deepClone(effects)
    };
  }
}
