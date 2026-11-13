/**
 * The system's Region on the canvas: a quieter, etched look.
 * Foundry 14 fills a Region at half strength with broad stripes. Here the
 * fill is fainter and the stripes are fine, like an engraving's hatching,
 * and a thin line marks the edge so the shape still reads at a glance.
 * Hovering or selecting a Region still shows it solid, as Foundry does.
 * Every Region gets this look; the colour is the Region's own.
 */

/** The VÅR BORG orange (styles/tokens.css, --vb-orange): areas made by spells and powers. */
export const AREA_COLOUR = "#ec6a1f";

/** How strong the fill is (Foundry: 0.5). */
const FILL_ALPHA = 0.22;
/** How wide each hatching stripe is, in screen pixels at normal zoom (Foundry: 4). */
const HATCH_WIDTH = 2;
/** The edge line: its width in screen pixels and its strength. */
const EDGE_WIDTH = 1.5;
const EDGE_ALPHA = 0.75;

export default class VarBorgRegion extends foundry.canvas.placeables.Region {

  /** The thin edge line. */
  #edge;

  /** Foundry's fill for this Region (it keeps it to itself, so it is found on the layer). */
  #fill() {
    return this.layer._highlights.children.find(mesh => mesh.region === this) ?? null;
  }

  /** @inheritDoc */
  async _draw(options) {
    await super._draw(options);
    const fill = this.#fill();
    if (fill) {
      fill.alpha = FILL_ALPHA;
      fill.shader.uniforms.hatchThickness = HATCH_WIDTH * canvas.dimensions.uiScale;
    }
    // Under Foundry's own border and handles, which show on hover.
    this.#edge = this.addChildAt(new PIXI.Graphics(), 0);
    this.#edge.eventMode = "none";
  }

  /** @inheritDoc */
  _refreshState() {
    super._refreshState();
    if (this.#edge) this.#edge.tint = this.document.color ?? AREA_COLOUR;
  }

  /** @inheritDoc */
  _refreshBorder() {
    super._refreshBorder();
    const edge = this.#edge;
    if (!edge) return;
    edge.clear();
    edge.lineStyle({ width: EDGE_WIDTH * canvas.dimensions.uiScale, color: 0xffffff, alpha: EDGE_ALPHA, alignment: 0.5 });
    this.animationState.polygonTree.drawShape(edge);
  }
}
