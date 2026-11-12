/**
 * The system's token on the canvas. It keeps what chests need (double
 * clicking a chest, module/chests.mjs) and adds movement:
 * - a Prone creature that would walk crawls instead (rules 3.13);
 * - while dragged in combat, the squares it can reach are shaded
 *   (module/canvas/reach-overlay.mjs);
 * - while it travels, its picture hops, flies, sways, climbs or crawls
 *   (module/canvas/motion.mjs). Each user can switch this off.
 */

import { ChestAwareToken } from "../chests.mjs";
import { showReach, hideReach } from "./reach-overlay.mjs";
import { motionPose, stepPresence } from "./motion.mjs";

const SYSTEM = "var-borg";
/** The client setting that switches movement animations on or off. */
export const MOVEMENT_ANIMATIONS = "movementAnimations";

/** Register the setting. Off by default when the computer asks for reduced motion. */
export function registerMovementAnimations() {
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  game.settings.register(SYSTEM, MOVEMENT_ANIMATIONS, {
    name: "VARBORG.Settings.MovementAnimations.Name",
    hint: "VARBORG.Settings.MovementAnimations.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: !reduced
  });
}

/** A Prone creature crawls when it would walk. Other ways of moving stay. */
function crawlIfProne(token, action) {
  return action === "walk" && token.actor?.statuses?.has("prone") ? "crawl" : action;
}

export default class VarBorgToken extends ChestAwareToken {
  /** @override  Dragging the token. */
  _getDragMovementAction() {
    return crawlIfProne(this, super._getDragMovementAction());
  }

  /** @override  Moving with the arrow keys. */
  _getKeyboardMovementAction() {
    return crawlIfProne(this, super._getKeyboardMovementAction());
  }

  /** @inheritDoc  Start of a drag: shade the squares this token can reach. */
  _initializeDragLeft(event) {
    super._initializeDragLeft(event);
    try {
      showReach(this);
    } catch (error) {
      // The overlay is only a guide; never let it stop the drag.
      console.error("VÅR BORG | Reach overlay failed", error);
    }
  }

  /** @inheritDoc  End of a drag (dropped or cancelled): remove the shading. */
  _onDragEnd() {
    hideReach();
    super._onDragEnd();
  }

  /** @override  Moving from the token HUD (elevation). */
  _getHUDMovementAction() {
    return crawlIfProne(this, super._getHUDMovementAction());
  }

  /* -------------------------------------------- */
  /*  Movement animations                         */
  /* -------------------------------------------- */

  /**
   * The current movement pose: the way it moves, squares travelled on this
   * stretch, and how far the effect has eased in (presence) and toward what.
   * Null when still.
   * @type {{action: string, squares: number, presence: number, target: number}|null}
   */
  #motion = null;

  /** The ticker that eases the effect in and out, while it runs. */
  #easing = null;

  /** The movement animation promise already watched for its end. */
  #watched = null;

  /** The ground shadow under a flying token. */
  #shadow = null;

  /**
   * Called on every frame of a movement animation (from the movement
   * action's ontick, module/movement.mjs).
   * @param {string} action  The way it moves on this stretch.
   * @param {object} animation  Foundry's running CanvasAnimation.
   */
  varBorgMotionTick(action, animation) {
    if (!game.settings.get(SYSTEM, MOVEMENT_ANIMATIONS)) return;
    const done = attribute => animation.attributes?.find(a => a.attribute === attribute)?.done ?? 0;
    const squares = Math.hypot(done("x"), done("y")) / (canvas.grid.size || 1);
    this.#motion = { presence: 0, ...this.#motion, action, squares, target: 1 };
    // When the whole move ends, ease the effect out.
    const promise = this.movementAnimationPromise;
    if (promise && promise !== this.#watched) {
      this.#watched = promise;
      promise.finally(() => {
        if (this.#watched !== promise) return;
        this.#watched = null;
        if (this.#motion) this.#motion.target = 0;
        this.#startEasing();
      });
    }
    this.#startEasing();
  }

  /** Run the ease-in/ease-out ticker if it is not running yet. */
  #startEasing() {
    if (this.#easing || this.destroyed) return;
    this.#easing = () => {
      const motion = this.#motion;
      if (!motion || this.destroyed) return this.#stopMotion();
      motion.presence = stepPresence(motion.presence, motion.target, canvas.app.ticker.deltaMS);
      if (motion.presence === 0 && motion.target === 0) return this.#stopMotion();
      this.renderFlags.set({ refreshPosition: true });
    };
    canvas.app.ticker.add(this.#easing);
  }

  /** Back to still: stop the ticker, hide the shadow and redraw plainly. */
  #stopMotion() {
    if (this.#easing) canvas.app.ticker.remove(this.#easing);
    this.#easing = null;
    this.#motion = null;
    if (this.#shadow) this.#shadow.visible = false;
    if (!this.destroyed) {
      this.renderFlags.set({ refreshPosition: true, refreshMesh: true, refreshRotation: true, refreshState: true });
    }
  }

  /** @inheritDoc  Put the picture in its movement pose. */
  _refreshPosition() {
    super._refreshPosition();
    const motion = this.#motion;
    if (!motion || !this.mesh) return;
    const pose = motionPose(motion.action, motion.squares, motion.presence);
    const size = canvas.grid.size;
    const centre = this.center;
    this.mesh.position.set(centre.x + pose.dx * size, centre.y + pose.dy * size);
    this._refreshMeshSizeAndScale();
    this.mesh.scale.x *= pose.scaleX;
    this.mesh.scale.y *= pose.scaleY;
    this.mesh.angle = (this.document.lockRotation ? 0 : this.document.rotation) + pose.angle;
    this.mesh.alpha = this.alpha * this.document.alpha * pose.alpha;
    this.#drawShadow(centre, pose.shadow);
  }

  /** A dark ellipse on the ground under a flying token, below the token picture. */
  #drawShadow(centre, opacity) {
    if (!(opacity > 0)) {
      if (this.#shadow) this.#shadow.visible = false;
      return;
    }
    if (!this.#shadow || this.#shadow.destroyed) {
      this.#shadow = new PIXI.Graphics();
      canvas.interface.grid.highlight.addChild(this.#shadow);
    }
    const { width } = this.document.getSize();
    const shadow = this.#shadow;
    shadow.clear();
    shadow.beginFill(0x000000, opacity);
    shadow.drawEllipse(0, 0, width * 0.35, width * 0.12);
    shadow.endFill();
    shadow.position.set(centre.x, centre.y + width * 0.3);
    shadow.visible = true;
  }

  /** @inheritDoc */
  _destroy(options) {
    if (this.#easing) canvas.app.ticker.remove(this.#easing);
    this.#easing = null;
    this.#shadow?.destroy();
    this.#shadow = null;
    super._destroy(options);
  }
}
