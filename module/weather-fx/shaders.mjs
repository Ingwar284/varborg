/**
 * Two weather shaders of our own (step 63, tier 3; GAPS 308: looks only).
 *
 * VeilShader: a wash of colour over the whole view, with a darker edge that
 * creeps in from the sides of the screen and an optional slow pulse.
 *   tint        the colour of the veil (red, green, blue from 0 to 1)
 *   intensity   how strongly the whole view takes that colour (0 to 1)
 *   vignette    how strongly the edges take it on top (0 to 1)
 *   reach       how far the edge creeps in towards the centre (0 to 1)
 *   creep       how ragged the edge is, like reaching shadows (0 to 1)
 *   pulse       how much the veil breathes in and out (0 to 1)
 *   glow        false: the veil darkens and tints (use MULTIPLY);
 *               true: it adds light of its colour (use SCREEN)
 *   speed       how fast the pulse and the ragged edge move
 *
 * FlashShader: now and then a flash of lightning, with a quick after-flicker.
 *   tint        the colour of the flash
 *   strength    how bright a flash is (0 to 1)
 *   interval    the average seconds between chances of a flash
 *   chance      the chance (0 to 1) that a flash comes in each interval
 *
 * The classes are made on first use, after Foundry has loaded its own
 * shader classes.
 */

let classes = null;

/** {VeilShader, FlashShader}. */
export function weatherShaders() {
  classes ??= makeClasses();
  return classes;
}

/** Small noise and hash helpers shared by both shaders. */
const NOISE = `
  float vbHash(in float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  float vbHash2(in vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vbNoise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(vbHash2(i), vbHash2(i + vec2(1.0, 0.0)), u.x),
               mix(vbHash2(i + vec2(0.0, 1.0)), vbHash2(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float vbFbm(in vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for ( int i = 0; i < 4; i++ ) { v += a * vbNoise(p); p *= 2.1; a *= 0.5; }
    return v;
  }
`;

function makeClasses() {
  const { AbstractWeatherShader } = foundry.canvas.rendering.shaders;

  class VeilShader extends AbstractWeatherShader {
    static get defaultUniforms() {
      return {
        ...super.defaultUniforms,
        intensity: 0.3,
        vignette: 0.5,
        reach: 0.5,
        creep: 0,
        pulse: 0,
        glow: false
      };
    }

    static _createFragmentShader() {
      return `
      ${this.FRAGMENT_HEADER}
      uniform float intensity;
      uniform float vignette;
      uniform float reach;
      uniform float creep;
      uniform float pulse;
      uniform bool glow;
      ${NOISE}

      void main() {
        ${this.COMPUTE_MASK}

        // Distance from the middle of the screen: 0 in the centre, 1 in the corners.
        vec2 screen = vUvsOcclusion - 0.5;
        float d = length(screen) * 1.4142;

        // A ragged edge: noise tied to the map, so the shadows move with it.
        float n = vbFbm(vUvs * 6.0 + vec2(time * 0.05, -time * 0.03)) - 0.5;
        float edge = smoothstep(1.0 - reach, 1.05, d + n * creep);

        // The pulse: 1 at its strongest, down to 1 - pulse.
        float breath = 1.0 - pulse * (0.5 + 0.5 * sin(time * 1.3));
        float amount = clamp((intensity + vignette * edge) * breath, 0.0, 1.0) * mask * alpha;

        if ( glow ) gl_FragColor = vec4(tint * amount, 1.0);
        else gl_FragColor = vec4(mix(vec3(1.0), tint, amount), 1.0);
      }
      `;
    }
  }

  class FlashShader extends AbstractWeatherShader {
    static get defaultUniforms() {
      return {
        ...super.defaultUniforms,
        strength: 0.6,
        interval: 6,
        chance: 0.6
      };
    }

    static _createFragmentShader() {
      return `
      ${this.FRAGMENT_HEADER}
      uniform float strength;
      uniform float interval;
      uniform float chance;
      ${NOISE}

      // The brightness of a flash that started 'since' seconds ago: a strike and a flicker.
      float flash(in float since) {
        if ( since < 0.0 ) return 0.0;
        float strike = exp(-since * 9.0);
        float flicker = (since > 0.14) ? 0.7 * exp(-(since - 0.14) * 12.0) : 0.0;
        return strike + flicker;
      }

      void main() {
        ${this.COMPUTE_MASK}

        // Time is cut into windows; each window may hold one flash at a random moment.
        float w = max(interval, 0.5);
        float window = floor(time / w);
        float light = 0.0;
        for ( int k = 0; k < 2; k++ ) {
          float win = window - float(k);
          if ( vbHash(win + 0.17) < chance ) {
            float start = win * w + vbHash(win + 4.31) * w * 0.8;
            light += flash(time - start);
          }
        }

        // Brighter towards one side of the screen, which changes from flash to flash.
        float side = vbHash(window + 9.7) * 6.2832;
        float slope = 0.75 + 0.25 * dot(vUvsOcclusion - 0.5, vec2(cos(side), sin(side))) * 2.0;

        gl_FragColor = vec4(tint * clamp(light * strength * slope, 0.0, 1.0) * mask * alpha, 1.0);
      }
      `;
    }
  }

  return { VeilShader, FlashShader };
}
