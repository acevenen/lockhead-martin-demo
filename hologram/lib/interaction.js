// Hologram interaction core — pure logic, no DOM, no camera. This is the part
// that has to feel right, so it is separated out and unit-tested in Node. The
// browser demo (../index.html) feeds it either real hand landmarks (MediaPipe)
// or pointer coordinates; the logic is identical either way.
//
// It encodes the verified lesson from the company's learning loop: *every
// discrete gesture debounces its trigger edge* (see PinchDetector), so a grab
// never double-fires.

// --- One-euro filter: low latency + low jitter for the fingertip cursor -------
// Reference: Casiez et al., "1€ Filter". Smooths fast when moving, tight when still.
export class OneEuroFilter {
  constructor({ minCutoff = 1.2, beta = 0.03, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** Filter one scalar sample at time tMs. */
  filter(x, tMs) {
    if (this.tPrev === null) {
      this.tPrev = tMs; this.xPrev = x; this.dxPrev = 0;
      return x;
    }
    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-4);
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat; this.dxPrev = dxHat; this.tPrev = tMs;
    return xHat;
  }
}

/** A 2D fingertip smoother built from two one-euro filters. */
export class PointSmoother {
  constructor(opts) { this.fx = new OneEuroFilter(opts); this.fy = new OneEuroFilter(opts); }
  filter(p, tMs) { return { x: this.fx.filter(p.x, tMs), y: this.fy.filter(p.y, tMs) }; }
}

// --- Debounced pinch detector -------------------------------------------------
// Raw pinch (thumb-index distance below a threshold) is noisy at the boundary.
// We only COMMIT a state change after the raw signal holds for `debounceMs`, and
// require it to cross a hysteresis band, so chatter can never double-fire a grab.
export class PinchDetector {
  constructor({ closeAt = 0.05, openAt = 0.08, debounceMs = 60 } = {}) {
    this.closeAt = closeAt; // normalized distance to consider "closing"
    this.openAt = openAt;   // must exceed this to consider "opening" (hysteresis)
    this.debounceMs = debounceMs;
    this.committed = false;  // committed pinch state
    this.candidate = false;
    this.since = null;
  }

  /**
   * Feed the normalized thumb-index distance and a timestamp.
   * Returns 'pinchstart' | 'pinchend' | null (only on committed edges).
   */
  update(distance, tMs) {
    // Hysteresis: what raw state does this distance imply, given the current one?
    let raw = this.committed;
    if (distance <= this.closeAt) raw = true;
    else if (distance >= this.openAt) raw = false;

    if (raw !== this.committed) {
      if (this.candidate !== raw) { this.candidate = raw; this.since = tMs; }
      else if (tMs - this.since >= this.debounceMs) {
        this.committed = raw;
        this.candidate = raw;
        this.since = tMs;
        return raw ? 'pinchstart' : 'pinchend';
      }
    } else {
      this.candidate = raw; this.since = tMs;
    }
    return null;
  }

  get isPinched() { return this.committed; }
}

// --- Grab / drag controller ---------------------------------------------------
export class GrabController {
  constructor(object, { grabRadius = 60 } = {}) {
    this.object = object; // { x, y, r }
    this.grabRadius = grabRadius;
    this.grabbed = false;
    this.offset = { x: 0, y: 0 };
  }

  /** Try to grab if the cursor is on the object. Returns true if grabbed. */
  tryGrab(cursor) {
    const d = Math.hypot(cursor.x - this.object.x, cursor.y - this.object.y);
    if (d <= (this.object.r ?? 0) + this.grabRadius) {
      this.grabbed = true;
      this.offset = { x: this.object.x - cursor.x, y: this.object.y - cursor.y };
      return true;
    }
    return false;
  }

  /** While grabbed, move the object to follow the cursor. */
  drag(cursor) {
    if (!this.grabbed) return;
    this.object.x = cursor.x + this.offset.x;
    this.object.y = cursor.y + this.offset.y;
  }

  release() { this.grabbed = false; }
}

/** Map normalized [0,1] hand coords to canvas pixels, mirroring x for a selfie view. */
export function mapNormalizedToCanvas(p, width, height, { mirror = true } = {}) {
  return { x: (mirror ? 1 - p.x : p.x) * width, y: p.y * height };
}
