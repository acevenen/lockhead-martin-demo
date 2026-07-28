/* ============================================================================
   AEGIS OVERWATCH — procedural model library
   ----------------------------------------------------------------------------
   Everything here builds a single merged THREE.BufferGeometry with baked vertex
   colors so a whole population (traffic, pedestrians, wildlife) renders as one
   or two InstancedMesh draw calls instead of hundreds of objects.

   Scale note: this is a tactical hologram, not a 1:1 world. Vehicles and people
   are rendered at symbolic scale (readable from the table) but with accurate
   *proportions* — a sedan really is 2.4x longer than it is wide, with the
   windshield raked and the cabin set back off the wheelbase.
   ============================================================================ */
(function (global) {
'use strict';

/* ---------- merge helper (r128 core has no BufferGeometryUtils) ---------- */
function mergeParts(parts) {
  /* De-index FIRST, then size the buffers. Box/Cylinder/Sphere geometries are
     indexed: a BoxGeometry reports 24 positions but expands to 36 once
     de-indexed. Sizing from the indexed count under-allocates, and the writes
     past the end are silently dropped by Float32Array — which quietly deletes
     whatever parts happen to come last. */
  const flat = parts.map(p => ({
    src: p,
    geo: p.geo.index ? p.geo.toNonIndexed() : p.geo,
  }));
  let vTotal = 0;
  for (const f of flat) vTotal += f.geo.attributes.position.count;
  const P = new Float32Array(vTotal * 3);
  const N = new Float32Array(vTotal * 3);
  const C = new Float32Array(vTotal * 3);
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  let o = 0;
  for (const f of flat) {
    const p = f.src, g = f.geo;
    const pos = g.attributes.position, nor = g.attributes.normal;
    const m = p.matrix || new THREE.Matrix4();
    nm.setFromMatrix4(m).invert().transpose();
    const col = new THREE.Color(p.color === undefined ? 0xffffff : p.color);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      P[o] = v.x; P[o + 1] = v.y; P[o + 2] = v.z;
      if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N[o] = v.x; N[o + 1] = v.y; N[o + 2] = v.z; }
      C[o] = col.r; C[o + 1] = col.g; C[o + 2] = col.b;
      o += 3;
    }
    if (g !== p.geo) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}

function mat(pos, rot, scale) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (rot) q.setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0));
  m.compose(new THREE.Vector3(pos[0] || 0, pos[1] || 0, pos[2] || 0), q,
    new THREE.Vector3(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1));
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/* ---------------------------------------------------------------------------
   Extrude a 2D side profile (the car silhouette) along Z with optional taper.
   pts run clockwise in the XY plane; this is what makes a vehicle read as a
   vehicle instead of a shoebox — the hood slopes, the windshield rakes back,
   the roofline steps down into the trunk.
   --------------------------------------------------------------------------- */
function extrudeProfile(pts, halfW, taperTop) {
  const P = [], NRM = [];
  const n = pts.length;
  const push = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    P.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    NRM.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  };
  /* half-width shrinks with height so the greenhouse tucks in like a real body */
  const maxY = pts.reduce((m, p) => Math.max(m, p[1]), 0) || 1;
  const wAt = y => halfW * (1 - (taperTop || 0) * (y / maxY));
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const wa = wAt(a[1]), wb = wAt(b[1]);
    push(a[0], a[1], -wa, b[0], b[1], -wb, b[0], b[1], wb);
    push(a[0], a[1], -wa, b[0], b[1], wb, a[0], a[1], wa);
  }
  /* flat caps via fan from the first vertex */
  for (let i = 1; i < n - 1; i++) {
    const a = pts[0], b = pts[i], c = pts[i + 1];
    push(a[0], a[1], wAt(a[1]), b[0], b[1], wAt(b[1]), c[0], c[1], wAt(c[1]));
    push(c[0], c[1], -wAt(c[1]), b[0], b[1], -wAt(b[1]), a[0], a[1], -wAt(a[1]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(NRM), 3));
  return g;
}

/* ---------------------------------------------------------------------------
   VEHICLES
   Each returns { body, trim } — body takes per-instance paint colour, trim
   carries fixed detail (tyres, glass, lamps) so headlights stay white and
   tyres stay black no matter what colour the car is painted.
   --------------------------------------------------------------------------- */
const GLASS = 0x2e4a5c, TYRE = 0x14181c, RIM = 0x8fa3b0, LAMP = 0xfff2cc, TAIL = 0xff3b30;

function wheels(cfg) {
  const parts = [];
  const r = cfg.wheelR, w = cfg.wheelW;
  const tyre = new THREE.CylinderGeometry(r, r, w, 10);
  const rim = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 1.04, 8);
  for (const [x, z] of cfg.wheelPos) {
    const m = mat([x, r, z], [0, 0, Math.PI / 2]);
    parts.push({ geo: tyre, matrix: m, color: TYRE });
    parts.push({ geo: rim, matrix: m, color: RIM });
  }
  return parts;
}

function vehicleFrom(cfg) {
  const bodyParts = [{ geo: extrudeProfile(cfg.profile, cfg.halfW, cfg.taper), color: 0xffffff }];
  if (cfg.extraBody) for (const e of cfg.extraBody) bodyParts.push(e);

  const trim = wheels(cfg);
  /* glazing sits a hair proud of the body shell so it never z-fights */
  for (const gset of cfg.glass) {
    trim.push({
      geo: box(gset.len, gset.h, cfg.halfW * 2 * (gset.wScale || 0.94)),
      matrix: mat([gset.x, gset.y, 0], [0, 0, gset.rake || 0]),
      color: GLASS,
    });
  }
  const lampGeo = box(cfg.lampD || 0.03, 0.045, 0.075);
  for (const s of [-1, 1]) {
    trim.push({ geo: lampGeo, matrix: mat([cfg.front, cfg.lampY, s * cfg.halfW * 0.62]), color: LAMP });
    trim.push({ geo: lampGeo, matrix: mat([cfg.rear, cfg.lampY, s * cfg.halfW * 0.62]), color: TAIL });
  }
  return { body: mergeParts(bodyParts), trim: mergeParts(trim) };
}

/* Sedan — 4.6m car rendered at 0.90 long : 0.38 wide : 0.30 tall */
function buildSedan() {
  return vehicleFrom({
    halfW: 0.19, taper: 0.30, wheelR: 0.075, wheelW: 0.055,
    wheelPos: [[-0.28, -0.16], [-0.28, 0.16], [0.28, -0.16], [0.28, 0.16]],
    front: -0.455, rear: 0.455, lampY: 0.155,
    profile: [
      [-0.45, 0.075], [-0.45, 0.165], [-0.40, 0.195], [-0.17, 0.215],
      [-0.05, 0.300], [0.16, 0.300], [0.30, 0.225], [0.42, 0.210],
      [0.45, 0.165], [0.45, 0.075],
    ],
    glass: [
      { x: -0.11, y: 0.262, len: 0.13, h: 0.075, rake: -0.62 },
      { x: 0.055, y: 0.296, len: 0.20, h: 0.02 },
      { x: 0.235, y: 0.268, len: 0.11, h: 0.065, rake: 0.55 },
    ],
  });
}

/* SUV — taller, boxier greenhouse, bigger wheels, more ground clearance */
function buildSUV() {
  return vehicleFrom({
    halfW: 0.205, taper: 0.16, wheelR: 0.088, wheelW: 0.062,
    wheelPos: [[-0.29, -0.17], [-0.29, 0.17], [0.29, -0.17], [0.29, 0.17]],
    front: -0.46, rear: 0.46, lampY: 0.20,
    profile: [
      [-0.46, 0.09], [-0.46, 0.215], [-0.40, 0.245], [-0.22, 0.265],
      [-0.14, 0.360], [0.30, 0.365], [0.40, 0.330], [0.46, 0.300],
      [0.46, 0.09],
    ],
    glass: [
      { x: -0.175, y: 0.315, len: 0.10, h: 0.09, rake: -0.42 },
      { x: 0.08, y: 0.360, len: 0.36, h: 0.02 },
      { x: 0.375, y: 0.322, len: 0.06, h: 0.075, rake: 0.32 },
    ],
  });
}

/* Pickup — separated cab and open bed, the silhouette that reads "truck" */
function buildPickup() {
  const v = vehicleFrom({
    halfW: 0.20, taper: 0.18, wheelR: 0.085, wheelW: 0.06,
    wheelPos: [[-0.28, -0.17], [-0.28, 0.17], [0.30, -0.17], [0.30, 0.17]],
    front: -0.47, rear: 0.47, lampY: 0.19,
    profile: [
      [-0.47, 0.085], [-0.47, 0.205], [-0.40, 0.235], [-0.24, 0.250],
      [-0.16, 0.350], [0.04, 0.352], [0.06, 0.235], [0.47, 0.235],
      [0.47, 0.085],
    ],
    glass: [
      { x: -0.195, y: 0.305, len: 0.085, h: 0.09, rake: -0.45 },
      { x: -0.06, y: 0.348, len: 0.16, h: 0.02 },
      { x: 0.045, y: 0.300, len: 0.03, h: 0.085 },
    ],
  });
  /* bed walls, so the tray reads as open rather than solid.
     Profile tops out at y=0.235 behind the cab, so rails sit just above it
     and inside the body half-width (0.20 minus the 0.18 taper at that height). */
  const railY = 0.272, railHalfW = 0.178;
  const rails = mergeParts([
    { geo: box(0.41, 0.072, 0.028), matrix: mat([0.265, railY, -railHalfW]), color: 0xffffff },
    { geo: box(0.41, 0.072, 0.028), matrix: mat([0.265, railY, railHalfW]), color: 0xffffff },
    { geo: box(0.028, 0.072, 0.356), matrix: mat([0.456, railY, 0]), color: 0xffffff },
  ]);
  const merged = mergeParts([{ geo: v.body }, { geo: rails }]);
  v.body.dispose(); rails.dispose();
  return { body: merged, trim: v.trim };
}

/* Bus / transit — long flat slab with a window band down each flank */
function buildBus() {
  const cfg = {
    halfW: 0.22, taper: 0.06, wheelR: 0.085, wheelW: 0.065,
    wheelPos: [[-0.52, -0.185], [-0.52, 0.185], [0.44, -0.185], [0.44, 0.185]],
    front: -0.70, rear: 0.70, lampY: 0.16, lampD: 0.035,
    profile: [
      [-0.70, 0.085], [-0.70, 0.44], [-0.64, 0.475], [0.62, 0.475],
      [0.70, 0.44], [0.70, 0.085],
    ],
    glass: [
      { x: -0.66, y: 0.36, len: 0.055, h: 0.16, rake: -0.18 },
      { x: 0.0, y: 0.375, len: 1.15, h: 0.13, wScale: 1.02 },
    ],
  };
  return vehicleFrom(cfg);
}

/* ---------------------------------------------------------------------------
   PEOPLE — a low-poly humanoid that still reads as a person: head, shoulders,
   torso taper, separated arms and legs. Limb pivots are exposed so the walk
   cycle can swing them.
   --------------------------------------------------------------------------- */
const SKIN = 0xd8b89a, CLOTH_A = 0x8fa9c2, CLOTH_B = 0x556577;
function buildPerson() {
  const H = 1.0;
  const parts = [
    { geo: new THREE.SphereGeometry(0.115 * H, 7, 5), matrix: mat([0, 0.885 * H, 0]), color: SKIN },
    { geo: new THREE.CylinderGeometry(0.055 * H, 0.07 * H, 0.09 * H, 6), matrix: mat([0, 0.79 * H, 0]), color: SKIN },
    /* torso: wider at the shoulders, tapering to the waist */
    { geo: new THREE.CylinderGeometry(0.155 * H, 0.115 * H, 0.34 * H, 7), matrix: mat([0, 0.58 * H, 0]), color: CLOTH_A },
    { geo: new THREE.CylinderGeometry(0.115 * H, 0.125 * H, 0.10 * H, 7), matrix: mat([0, 0.375 * H, 0]), color: CLOTH_B },
  ];
  for (const s of [-1, 1]) {
    parts.push({ geo: new THREE.CylinderGeometry(0.042 * H, 0.036 * H, 0.30 * H, 5),
      matrix: mat([0, 0.60 * H, s * 0.175 * H], [s * 0.12, 0, 0]), color: CLOTH_A });
    parts.push({ geo: new THREE.SphereGeometry(0.038 * H, 5, 4), matrix: mat([0, 0.45 * H, s * 0.185 * H]), color: SKIN });
    parts.push({ geo: new THREE.CylinderGeometry(0.058 * H, 0.048 * H, 0.37 * H, 5),
      matrix: mat([0, 0.19 * H, s * 0.072 * H]), color: CLOTH_B });
    parts.push({ geo: box(0.10 * H, 0.045 * H, 0.075 * H), matrix: mat([0.018 * H, 0.022 * H, s * 0.072 * H]), color: 0x2b3138 });
  }
  return mergeParts(parts);
}

/* ---------------------------------------------------------------------------
   ANIMALS — quadruped with a real body axis, four legs, neck, head and tail.
   `horns` gives the elk/deer silhouette that separates wildlife from people
   at a glance on the table.
   --------------------------------------------------------------------------- */
function buildQuadruped(opts) {
  const o = opts || {};
  const hide = o.hide === undefined ? 0xa87c4e : o.hide;
  const L = o.len === undefined ? 1.0 : o.len;
  const legLen = o.legLen === undefined ? 0.42 : o.legLen;
  const bodyY = legLen + 0.14;
  /* neck leans forward off the shoulder; the head is placed at the tip of that
     axis rather than eyeballed, so it never floats free of the neck */
  const neckLean = 0.62, neckLen = 0.30;
  const nx = 0.30 * L, ny = bodyY + 0.13;
  const ax = Math.sin(neckLean), ay = Math.cos(neckLean);
  const headX = nx + ax * neckLen * 0.5, headY = ny + ay * neckLen * 0.5;
  const parts = [
    /* barrel: deeper than wide, tapering to the rump like a real ungulate */
    { geo: new THREE.CylinderGeometry(0.135, 0.115, 0.64 * L, 8),
      matrix: mat([0, bodyY, 0], [0, 0, Math.PI / 2], [1, 1, 1.18]), color: hide },
    { geo: new THREE.SphereGeometry(0.145, 7, 5),
      matrix: mat([0.24 * L, bodyY + 0.02, 0], [0, 0, 0], [0.9, 1, 1.05]), color: hide },
    { geo: new THREE.SphereGeometry(0.125, 7, 5),
      matrix: mat([-0.28 * L, bodyY, 0], [0, 0, 0], [0.95, 1, 1]), color: hide },
    { geo: new THREE.CylinderGeometry(0.052, 0.078, neckLen, 6),
      matrix: mat([nx, ny, 0], [0, 0, -neckLean]), color: hide },
    /* wedge head: long muzzle, not a ball */
    { geo: new THREE.CylinderGeometry(0.032, 0.062, 0.185, 6),
      matrix: mat([headX + ax * 0.10, headY + ay * 0.06, 0], [0, 0, -1.30]), color: hide },
    { geo: new THREE.CylinderGeometry(0.011, 0.004, 0.24, 4),
      matrix: mat([-0.36 * L, bodyY + 0.05, 0], [0, 0, 1.30]), color: hide },
  ];
  /* ears */
  for (const s of [-1, 1]) {
    parts.push({ geo: new THREE.ConeGeometry(0.030, 0.085, 4),
      matrix: mat([headX + ax * 0.03, headY + ay * 0.07, s * 0.055], [s * 0.55, 0, 0]), color: hide });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    /* upper leg is chunky enough to stay readable when the model is small on
       the table; lower leg tapers to a hoof */
    parts.push({ geo: new THREE.CylinderGeometry(0.062, 0.042, legLen * 0.55, 5),
      matrix: mat([sx * 0.24 * L, legLen * 0.72, sz * 0.115]), color: hide });
    parts.push({ geo: new THREE.CylinderGeometry(0.040, 0.028, legLen * 0.52, 5),
      matrix: mat([sx * 0.24 * L, legLen * 0.26, sz * 0.115]), color: hide });
    parts.push({ geo: box(0.072, 0.045, 0.062), matrix: mat([sx * 0.24 * L, 0.022, sz * 0.115]), color: 0x3a2b1c });
  }
  if (o.horns) {
    /* antlers rise off the skull and fork — the elk/deer read at a glance */
    for (const s of [-1, 1]) {
      parts.push({ geo: new THREE.CylinderGeometry(0.011, 0.020, 0.26, 4),
        matrix: mat([headX - ax * 0.02, headY + 0.14, s * 0.05], [s * 0.42, 0, -0.18]), color: 0xcbb894 });
      parts.push({ geo: new THREE.CylinderGeometry(0.007, 0.012, 0.17, 4),
        matrix: mat([headX + 0.03, headY + 0.28, s * 0.115], [s * 0.75, 0, -0.32]), color: 0xcbb894 });
      parts.push({ geo: new THREE.CylinderGeometry(0.006, 0.010, 0.12, 4),
        matrix: mat([headX - 0.06, headY + 0.27, s * 0.10], [s * 0.60, 0, 0.45]), color: 0xcbb894 });
    }
  }
  return mergeParts(parts);
}

/* Birds — a simple swept delta that reads as a wing shape in flight */
function buildBird() {
  return mergeParts([
    { geo: new THREE.ConeGeometry(0.05, 0.30, 4), matrix: mat([0, 0, 0], [Math.PI / 2, 0, 0]), color: 0xdfe9f2 },
    { geo: box(0.42, 0.012, 0.10), matrix: mat([0, 0.01, 0.02]), color: 0xc8d8e6 },
  ]);
}

global.AegisModels = {
  mergeParts, mat, extrudeProfile,
  buildSedan, buildSUV, buildPickup, buildBus,
  buildPerson, buildQuadruped, buildBird,
  VEHICLE_BUILDERS: { sedan: buildSedan, suv: buildSUV, pickup: buildPickup, bus: buildBus },
};
})(window);
