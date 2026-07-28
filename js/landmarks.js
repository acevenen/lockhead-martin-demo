/* ============================================================================
   AEGIS OVERWATCH — landmark model library
   ----------------------------------------------------------------------------
   RULES THIS FILE OBEYS (same as models-mil.js)
   1. Everything is authored in REAL METRES and converted once by M. The Eiffel
      Tower next to the Empire State Building next to a Sherman tank is
      therefore correct by construction, not by eye.
   2. Every landmark resolves to ONE merged BufferGeometry with baked vertex
      colours, so a skyline of six landmarks is six draw calls.
   3. These are stylised silhouettes, not CAD. Each model stays under ~1500
      vertices — the job is "recognisable in half a second from 300 m up".

   forSite() returns placements in WORLD units where 1 unit = 200 m of map, so
   the caller scales the geometry to whatever the tactical table is showing.
   ============================================================================ */
(function (global) {
'use strict';

const B = global.AegisModels;                 // mergeParts / mat / extrudeProfile
const { mergeParts, mat, extrudeProfile } = B;

/* units per metre — identical to models-mil.js so scales interoperate */
const M = 0.1957;
const m = v => v * M;

/* metre-native primitive wrappers -------------------------------------------- */
const B_ = (w, h, d) => new THREE.BoxGeometry(m(w), m(h), m(d));
const CY = (rt, rb, h, s, open) =>
  new THREE.CylinderGeometry(m(rt), m(rb), m(h), s || 8, 1, !!open);
const CO = (r, h, s) => new THREE.ConeGeometry(m(r), m(h), s || 8);
const SP = (r, ws, hs, ps, pl, ts, tl) =>
  new THREE.SphereGeometry(m(r), ws, hs, ps, pl, ts, tl);
const DISC = (r, s) => { const g = new THREE.CircleGeometry(m(r), s || 12); g.rotateX(-Math.PI / 2); return g; };
/* square prism: half-widths in metres, faces axis-aligned */
const SQ = (htTop, htBot, h) => {
  const g = new THREE.CylinderGeometry(m(htTop) * 1.41421, m(htBot) * 1.41421, m(h), 4);
  g.rotateY(Math.PI / 4); return g;
};
/* placement helper — position in metres */
const at = (x, y, z, rot, sc) => mat([m(x), m(y || 0), m(z || 0)], rot, sc);

/* ---------------------------------------------------------------------------
   Palette. Real materials, not neon: these read as stone/steel/glass under the
   HUD's flat lighting.
   --------------------------------------------------------------------------- */
const C = {
  orange:    0xC0362C,   // international orange (Golden Gate)
  orangeDk:  0x92281F,
  steel:     0x8892A0,
  steelDk:   0x5C6675,
  asphalt:   0x3E444B,
  concrete:  0xB9B4AA,
  limestone: 0xD8CDB8,
  travertine:0xC9B893,
  sandstone: 0xCBA97E,
  desert:    0xD9C08C,
  verdigris: 0x7FB09A,
  verdigrisD:0x5E8E7A,
  copper:    0x7A5236,
  marble:    0xEDE9E0,
  white:     0xF2EFE6,
  glass:     0x5D7F96,
  glassDk:   0x3C5B70,
  granite:   0x8A8177,
  darkstone: 0x6B6459,
  brick:     0x8F5B46,
  terracotta:0xA8552F,
  roofDk:    0x4A4E52,
  gold:      0xC9A227,
  bronze:    0x7B5E3B,
  snow:      0xF4F7FA,
  rock:      0x6E6A63,
  basalt:    0x4E4B46,
  forest:    0x3F5940,
  iron:      0x7A6A55,   // Eiffel's actual "Eiffel brown"
  ironDk:    0x5B4E3E,
  water:     0x2E4A5C,
};

/* ---------------------------------------------------------------------------
   Tiny mesh builder. Every face declares the normal it WANTS; the winding is
   corrected to match, so nothing ends up inside-out under FrontSide culling.
   Coordinates handed to these methods are already in units.
   --------------------------------------------------------------------------- */
function Mesh3() { this.P = []; this.N = []; }
Mesh3.prototype._push = function (a, b, c, n) {
  this.P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  this.N.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
};
Mesh3.prototype.tri = function (a, b, c, n) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
  if (!n) {
    const l = Math.hypot(gx, gy, gz);
    if (l < 1e-12) return;                       // degenerate — drop it
    n = [gx / l, gy / l, gz / l];
  }
  if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) this._push(a, b, c, n);
  else this._push(a, c, b, n);
};
Mesh3.prototype.quad = function (a, b, c, d, n) { this.tri(a, b, c, n); this.tri(a, c, d, n); };
Mesh3.prototype.geo = function () {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
  return g;
};

/* ---------------------------------------------------------------------------
   tube(pointsInMetres, radiusMetres|array, sides)
   A swept prism along a polyline — suspension cables, Eiffel legs and arches,
   lattice struts. 3 or 4 sides is plenty; these are 2 px wide on the table.
   --------------------------------------------------------------------------- */
function tube(ptsM, radiusM, sides) {
  sides = sides || 4;
  const V = THREE.Vector3;
  const n = ptsM.length;
  const pts = ptsM.map(p => new V(m(p[0]), m(p[1]), m(p[2])));
  const rad = Array.isArray(radiusM) ? radiusM.map(m) : pts.map(() => m(radiusM));
  const up = new V(0, 1, 0), alt = new V(1, 0, 0);
  const rings = [];
  for (let i = 0; i < n; i++) {
    const t = new V();
    if (i === 0) t.subVectors(pts[1], pts[0]);
    else if (i === n - 1) t.subVectors(pts[n - 1], pts[n - 2]);
    else t.subVectors(pts[i + 1], pts[i - 1]);
    if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
    t.normalize();
    const ref = Math.abs(t.y) > 0.94 ? alt : up;
    const u = new V().crossVectors(t, ref);
    if (u.lengthSq() < 1e-10) u.copy(alt);
    u.normalize();
    const w = new V().crossVectors(u, t).normalize();
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const dx = u.x * Math.cos(a) + w.x * Math.sin(a);
      const dy = u.y * Math.cos(a) + w.y * Math.sin(a);
      const dz = u.z * Math.cos(a) + w.z * Math.sin(a);
      ring.push({
        p: [pts[i].x + dx * rad[i], pts[i].y + dy * rad[i], pts[i].z + dz * rad[i]],
        d: [dx, dy, dz],
      });
    }
    rings.push(ring);
  }
  const G = new Mesh3();
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    const A = rings[i][k], Bv = rings[i][k2], Cv = rings[i + 1][k2], D = rings[i + 1][k];
    let nx = A.d[0] + Bv.d[0], ny = A.d[1] + Bv.d[1], nz = A.d[2] + Bv.d[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    G.quad(A.p, Bv.p, Cv.p, D.p, [nx / l, ny / l, nz / l]);
  }
  return G.geo();
}
const strut = (a, b, r, sides) => tube([a, b], r, sides || 3);

/* ---------------------------------------------------------------------------
   starPrism — the eleven-point star fort under the Statue of Liberty.
   --------------------------------------------------------------------------- */
function starPrism(rOut, rIn, points, h) {
  const G = new Mesh3();
  const n = points * 2, top = m(h);
  const P = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = m(i % 2 === 0 ? rOut : rIn);
    P.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i < n; i++) {
    const A = P[i], Bv = P[(i + 1) % n];
    let nx = Bv[1] - A[1], nz = -(Bv[0] - A[0]);
    const mx = (A[0] + Bv[0]) / 2, mz = (A[1] + Bv[1]) / 2;
    if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
    const l = Math.hypot(nx, nz) || 1;
    G.quad([A[0], 0, A[1]], [Bv[0], 0, Bv[1]], [Bv[0], top, Bv[1]], [A[0], top, A[1]],
      [nx / l, 0, nz / l]);
    G.tri([0, top, 0], [A[0], top, A[1]], [Bv[0], top, Bv[1]], [0, 1, 0]);
    G.tri([0, 0, 0], [A[0], 0, A[1]], [Bv[0], 0, Bv[1]], [0, -1, 0]);
  }
  return G.geo();
}

/* ---------------------------------------------------------------------------
   ellipseRing — one tier of the Colosseum: outer arcade wall (fluted so the
   piers read), inner wall facing the arena, and the walkable top annulus.
   --------------------------------------------------------------------------- */
function ellipseRing(o) {
  const seg = o.seg || 22;
  const t0 = o.t0 || 0, tLen = (o.tLen === undefined ? Math.PI * 2 : o.tLen);
  const y0 = m(o.y0), y1 = m(o.y1);
  const rxO = m(o.rxOut), rzO = m(o.rzOut), rxI = m(o.rxIn), rzI = m(o.rzIn);
  const rib = o.rib || 0;
  const G = new Mesh3();
  const out = i => {
    const a = t0 + tLen * (i / seg), k = (i % 2 === 0) ? 1 : (1 - rib);
    return [rxO * k * Math.cos(a), rzO * k * Math.sin(a)];
  };
  const inn = i => {
    const a = t0 + tLen * (i / seg);
    return [rxI * Math.cos(a), rzI * Math.sin(a)];
  };
  const nrm = (p, q, sign) => {
    let x = (p[0] + q[0]) * sign, z = (p[1] + q[1]) * sign;
    const l = Math.hypot(x, z) || 1; return [x / l, 0, z / l];
  };
  for (let i = 0; i < seg; i++) {
    const o0 = out(i), o1 = out(i + 1), i0 = inn(i), i1 = inn(i + 1);
    G.quad([o0[0], y0, o0[1]], [o1[0], y0, o1[1]], [o1[0], y1, o1[1]], [o0[0], y1, o0[1]],
      nrm(o0, o1, 1));
    G.quad([i0[0], y0, i0[1]], [i1[0], y0, i1[1]], [i1[0], y1, i1[1]], [i0[0], y1, i0[1]],
      nrm(i0, i1, -1));
    G.quad([o0[0], y1, o0[1]], [o1[0], y1, o1[1]], [i1[0], y1, i1[1]], [i0[0], y1, i0[1]],
      [0, 1, 0]);
  }
  return G.geo();
}

/* ---------------------------------------------------------------------------
   profileShell — revolve a [radius, height] profile as a stack of open-ended
   cones. Onion domes, volcanic cones, tapering towers, spires.
   --------------------------------------------------------------------------- */
function profileShell(prof, sides, color, yOff) {
  const parts = [];
  const y0 = yOff || 0;
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i], b = prof[i + 1];
    const h = b[1] - a[1];
    if (h <= 0) continue;
    parts.push({
      geo: CY(b[0], a[0], h, sides, true),
      matrix: at(0, y0 + (a[1] + b[1]) / 2, 0),
      color: Array.isArray(color) ? color[Math.min(i, color.length - 1)] : color,
    });
  }
  return parts;
}

/* ===========================================================================
   1. GOLDEN GATE BRIDGE — towers 227 m above water, deck at 67 m,
      1280 m main span, 343 m side spans. Runs along X.
   =========================================================================== */
function buildGoldenGate() {
  const P = [];
  const TX = 640, ANC = 880, DECK = 67, TOP = 227, CZ = 13;

  for (const s of [-1, 1]) {
    /* pier / fender block the tower stands on */
    P.push({ geo: B_(46, 28, 48), matrix: at(s * TX, 14, 0), color: C.concrete });
    /* two legs, 14 m square at the base tapering to 8 m at the top */
    for (const sz of [-1, 1])
      P.push({ geo: SQ(4.0, 7.0, TOP), matrix: at(s * TX, TOP / 2, sz * CZ), color: C.orange });
    /* portal bracing — the stacked rectangular openings that make the towers
       read as Golden Gate rather than "two posts" */
    for (const y of [86, 148, 200, 223])
      P.push({ geo: B_(13, 7, 30), matrix: at(s * TX, y, 0), color: C.orangeDk });
    /* approach pier */
    P.push({ geo: B_(16, DECK, 22), matrix: at(s * 770, DECK / 2, 0), color: C.concrete });
  }

  /* roadway deck + stiffening truss + rails */
  P.push({ geo: B_(2 * ANC, 2.6, 27), matrix: at(0, DECK, 0), color: C.asphalt });
  for (const sz of [-1, 1]) {
    P.push({ geo: B_(2 * ANC, 6.5, 2.2), matrix: at(0, DECK - 3.4, sz * 13.2), color: C.orangeDk });
    P.push({ geo: B_(2 * ANC, 2.4, 0.9), matrix: at(0, DECK + 2.6, sz * 13.4), color: C.orange });
  }
  /* anchorage blocks */
  for (const s of [-1, 1])
    P.push({ geo: B_(60, 46, 46), matrix: at(s * (ANC + 12), 23, 0), color: C.concrete });

  /* main cables: parabola across the main span, straight runs to the anchorages */
  const sag = 70;
  const cable = [[-ANC - 8, 26, 0], [-TX, TOP, 0]];
  for (let i = -3; i <= 3; i++) {
    const x = i * (TX / 4);
    cable.push([x, sag + (TOP - sag) * Math.pow(x / TX, 2), 0]);
  }
  cable.push([TX, TOP, 0], [ANC + 8, 26, 0]);
  for (const sz of [-1, 1]) {
    const pts = cable.map(p => [p[0], p[1], sz * CZ]);
    P.push({ geo: tube(pts, 3.2, 4), color: C.orangeDk });
  }
  /* vertical suspenders — the fan that says "suspension bridge" */
  for (let i = -3; i <= 3; i++) {
    const x = i * (TX / 4);
    const y = sag + (TOP - sag) * Math.pow(x / TX, 2);
    for (const sz of [-1, 1])
      P.push({ geo: strut([x, DECK, sz * CZ], [x, y, sz * CZ], 1.1, 3), color: C.orangeDk });
  }
  return mergeParts(P);
}

/* ===========================================================================
   2. SALESFORCE TOWER — 326 m, a tapering round-cornered obelisk with a
      perforated crown of fins.
   =========================================================================== */
function buildSalesforce() {
  const P = [];
  P.push({ geo: B_(58, 14, 52), matrix: at(0, 7, 0), color: C.concrete });
  const prof = [[19, 8], [17.6, 90], [15.6, 175], [13.4, 250], [11.6, 300]];
  P.push(...profileShell(prof, 12, [0x6C8CA3, 0x628297, 0x58788D, 0x4E6E83], 0));
  /* horizontal spandrel bands so the glass reads as floors, not a lampshade */
  for (const y of [60, 130, 205, 268])
    P.push({ geo: CY(17.4, 17.8, 3, 12), matrix: at(0, y, 0), color: C.steel });
  /* roof slab + the crown fins that continue past the last occupied floor */
  P.push({ geo: CY(11.4, 11.6, 3, 12), matrix: at(0, 301, 0), color: C.steelDk });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    P.push({
      geo: B_(2.4, 26, 5.2),
      matrix: mat([Math.cos(a) * m(8.5), m(315), Math.sin(a) * m(8.5)], [0, -a, 0]),
      color: C.steel,
    });
  }
  P.push({ geo: CY(0.5, 1.6, 12, 5), matrix: at(0, 332, 0), color: C.steelDk });
  return mergeParts(P);
}

/* ===========================================================================
   3. STATUE OF LIBERTY — 93 m torch tip to the base of the star fort.
      11-point star pedestal (Fort Wood), granite pedestal, robed figure,
      raised torch arm, seven-ray crown.
   =========================================================================== */
function buildLiberty() {
  const P = [];
  const SK = C.verdigris, SKD = C.verdigrisD;
  /* Fort Wood — the eleven-pointed star base */
  P.push({ geo: starPrism(37, 22, 11, 11), matrix: at(0, 0, 0), color: C.granite });
  /* pedestal: battered granite block, 13 m -> 47 m */
  P.push({ geo: SQ(13.5, 15.5, 6), matrix: at(0, 14, 0), color: C.granite });
  P.push({ geo: SQ(9.6, 12.8, 26), matrix: at(0, 32, 0), color: C.granite });
  P.push({ geo: SQ(10.6, 10.0, 4), matrix: at(0, 47, 0), color: C.darkstone });

  /* robe: a flared cone with a stepped hem, the statue's whole lower mass */
  P.push({ geo: CY(6.0, 9.4, 5, 10), matrix: at(0, 51.5, 0), color: SKD });
  P.push({ geo: CY(3.4, 6.0, 21, 10), matrix: at(0, 64.5, 0), color: SK });
  /* torso + shoulders */
  P.push({ geo: CY(2.9, 3.4, 5.5, 8), matrix: at(0, 77.8, 0), color: SK });
  /* neck + head */
  P.push({ geo: CY(1.0, 1.2, 2.0, 6), matrix: at(0, 81.6, 0), color: SK });
  P.push({ geo: SP(2.0, 7, 5), matrix: at(0, 84.0, 0.3, null, [0.85, 1.1, 0.95]), color: SK });
  /* seven-ray crown, rays radiating right round the diadem and canted outward */
  P.push({ geo: CY(2.5, 2.6, 1.4, 9), matrix: at(0, 85.3, 0), color: SK });
  for (let i = 0; i < 7; i++) {
    const a = i * (Math.PI * 2 / 7) + 0.3;
    const ox = Math.sin(a), oz = Math.cos(a), t = 0.55;
    P.push({
      geo: CO(0.55, 6.0, 3),
      matrix: mat([ox * m(3.0), m(88.4), oz * m(3.0)], [oz * t, 0, -ox * t]),
      color: SK,
    });
  }
  /* raised right arm -> torch. Tip lands at 93 m. */
  P.push({ geo: strut([2.6, 78.5, 0], [6.4, 86.0, -1.0], 1.35, 4), color: SK });
  P.push({ geo: strut([6.4, 86.0, -1.0], [7.6, 89.6, -1.0], 1.15, 4), color: SK });
  P.push({ geo: CY(2.1, 1.4, 2.0, 8), matrix: at(7.9, 90.4, -1.0), color: C.gold });
  P.push({ geo: CO(1.7, 3.4, 6), matrix: at(7.9, 92.4, -1.0), color: C.gold });
  /* left arm clutching the tablet against the chest */
  P.push({ geo: strut([-2.5, 78.5, 1.0], [-4.2, 72.0, 3.2], 1.3, 4), color: SK });
  P.push({
    geo: B_(7.5, 11.5, 2.0),
    matrix: mat([m(-4.4), m(69.5), m(3.4)], [0, 0.30, -0.38]), color: SKD,
  });
  return mergeParts(P);
}

/* ===========================================================================
   4. EMPIRE STATE BUILDING — 381 m to the roof, 443 m to the antenna tip.
      Five-storey base, Art Deco setbacks, the shaft, the crown, the mast.
   =========================================================================== */
function buildEmpireState() {
  const P = [];
  const S = C.limestone, T = 0xB7AE9B;
  P.push({ geo: B_(130, 32, 62), matrix: at(0, 16, 0), color: S });
  P.push({ geo: B_(118, 8, 56), matrix: at(0, 36, 0), color: T });
  P.push({ geo: B_(96, 22, 48), matrix: at(0, 51, 0), color: S });
  P.push({ geo: B_(64, 8, 40), matrix: at(0, 66, 0), color: T });
  /* the shaft — 60 storeys of unbroken setback-free tower */
  P.push({ geo: B_(58, 134, 38), matrix: at(0, 137, 0), color: S });
  /* vertical pilaster strips: the Art Deco cue that makes it not a slab */
  for (let i = -2; i <= 2; i++) {
    P.push({ geo: B_(3.2, 134, 39.6), matrix: at(i * 11.5, 137, 0), color: T });
    P.push({ geo: B_(59.6, 134, 3.2), matrix: at(0, 137, i * 7.6), color: T });
  }
  /* upper setbacks */
  P.push({ geo: B_(50, 34, 33), matrix: at(0, 221, 0), color: S });
  P.push({ geo: B_(42, 30, 28), matrix: at(0, 253, 0), color: T });
  P.push({ geo: B_(34, 30, 23), matrix: at(0, 283, 0), color: S });
  P.push({ geo: B_(26, 26, 18), matrix: at(0, 311, 0), color: T });
  /* 86th-floor observatory + crown */
  P.push({ geo: B_(30, 5, 22), matrix: at(0, 326, 0), color: C.steelDk });
  P.push({ geo: CY(9.5, 12.5, 26, 8), matrix: at(0, 341, 0), color: S });
  P.push({ geo: CY(7.5, 9.5, 5, 8), matrix: at(0, 356, 0), color: C.steelDk });
  /* the mooring mast + antenna */
  P.push({ geo: CY(4.2, 7.0, 20, 8), matrix: at(0, 368, 0), color: C.steel });
  P.push({ geo: CY(2.4, 4.2, 12, 8), matrix: at(0, 384, 0), color: C.steel });
  P.push({ geo: CY(0.6, 2.0, 52, 5), matrix: at(0, 416, 0), color: C.steelDk });
  return mergeParts(P);
}

/* ===========================================================================
   5. EIFFEL TOWER — 330 m to the antenna. Four splayed lattice legs, the
      decorative arch under the first platform, three platforms.
   =========================================================================== */
function buildEiffel() {
  const P = [];
  const H1 = 57, H2 = 115, H3 = 276, R0 = 57, R1 = 26, R2 = 12, R3 = 5.6;
  /* quadratic-bezier leg profile: heavily splayed at the foot, near vertical
     by the first platform — the tower's single most recognisable curve */
  const legR = y => {
    if (y <= H1) { const t = y / H1, u = 1 - t; return R0 * u * u + 0.62 * R0 * 2 * t * u + R1 * t * t; }
    if (y <= H2) { const t = (y - H1) / (H2 - H1); return R1 + (R2 - R1) * t; }
    const t = Math.min(1, (y - H2) / (H3 - H2)); return R2 + (R3 - R2) * t;
  };
  const corner = (i, y) => {
    const sx = (i === 0 || i === 3) ? 1 : -1, sz = (i < 2) ? 1 : -1;
    const r = legR(y); return [sx * r, y, sz * r];
  };
  /* legs, standing on the four masonry piers (which also keep the model's
     lowest vertex at y = 0 so the caller can drop it straight onto terrain) */
  for (let i = 0; i < 4; i++) {
    const foot = corner(i, 9);
    P.push({ geo: B_(26, 9, 26), matrix: at(foot[0], 4.5, foot[2]), color: C.darkstone });
    P.push({ geo: tube([foot, corner(i, 28), corner(i, H1)], [7.6, 5.4, 4.2], 4), color: C.iron });
    P.push({ geo: tube([corner(i, H1), corner(i, H2)], [4.0, 2.7], 4), color: C.iron });
  }
  /* X-bracing between adjacent legs — the lattice read */
  const faces = [[0, 1], [1, 2], [2, 3], [3, 0]];
  for (const [a, b] of faces) {
    P.push({ geo: strut(corner(a, 24), corner(b, H1 - 3), 1.5, 3), color: C.ironDk });
    P.push({ geo: strut(corner(b, 24), corner(a, H1 - 3), 1.5, 3), color: C.ironDk });
    P.push({ geo: strut(corner(a, H1 + 4), corner(b, H2 - 3), 1.2, 3), color: C.ironDk });
    P.push({ geo: strut(corner(b, H1 + 4), corner(a, H2 - 3), 1.2, 3), color: C.ironDk });
    P.push({ geo: strut(corner(a, 24), corner(b, 24), 1.3, 3), color: C.ironDk });
  }
  /* the arch: springs off the legs at 22 m, crowns at 47 m, bowing inward in
     plan as it rises because the legs do */
  const arch = [];
  for (let i = -3; i <= 3; i++) {
    const t = i / 3;
    const y = 22 + 25 * Math.sqrt(Math.max(0, 1 - t * t));
    arch.push([legR(22) * t, y, legR(y)]);
  }
  for (let k = 0; k < 4; k++)
    P.push({ geo: tube(arch, 3.6, 4), matrix: mat([0, 0, 0], [0, k * Math.PI / 2, 0]), color: C.iron });

  /* platforms */
  P.push({ geo: B_(74, 4.5, 74), matrix: at(0, H1, 0), color: C.ironDk });
  P.push({ geo: B_(78, 1.6, 78), matrix: at(0, H1 + 3.4, 0), color: C.iron });
  P.push({ geo: B_(42, 4.0, 42), matrix: at(0, H2, 0), color: C.ironDk });
  /* shaft, 115 m -> 276 m */
  P.push({ geo: SQ(9.0, 12.0, 60), matrix: at(0, 147, 0), color: C.iron });
  P.push({ geo: SQ(6.4, 9.0, 55), matrix: at(0, 204, 0), color: C.iron });
  P.push({ geo: SQ(4.6, 6.4, 45), matrix: at(0, 254, 0), color: C.iron });
  /* top platform, cupola, antenna */
  P.push({ geo: B_(20, 4, 20), matrix: at(0, H3, 0), color: C.ironDk });
  P.push({ geo: B_(15, 9, 15), matrix: at(0, 283, 0), color: C.iron });
  P.push({ geo: CY(4.4, 7.0, 10, 8), matrix: at(0, 292, 0), color: C.ironDk });
  P.push({ geo: CO(4.4, 8, 8), matrix: at(0, 301, 0), color: C.iron });
  P.push({ geo: CY(0.5, 1.4, 26, 5), matrix: at(0, 317, 0), color: C.steelDk });
  return mergeParts(P);
}

/* ===========================================================================
   6. MOUNT FUJI — 3776 m. A concave stratovolcano cone: flared skirt, steep
      upper flanks, snow above the treeline, small summit crater.
   =========================================================================== */
function buildFuji() {
  const P = [];
  const H = 3776;
  /* [radius, height] as fractions of H — gently concave flanks flaring into a
     wide skirt. That concave sweep is the whole silhouette; a straight cone
     reads as a party hat. */
  /* Slopes run ~25 deg at the skirt and steepen to ~44 deg below the crater —
     that upward steepening is the concave sweep that says Fuji. */
  const F = [
    [1.28, 0.00], [0.89, 0.18], [0.636, 0.38], [0.445, 0.58],
    [0.291, 0.76], [0.163, 0.90], [0.056, 1.00],
  ];
  const prof = F.map(p => [p[0] * H, p[1] * H]);
  P.push(...profileShell(prof, 18,
    [C.forest, 0x6B6A5C, C.rock, C.snow, C.snow, C.snow], 0));
  const rAt = y => {
    for (let i = 0; i < prof.length - 1; i++)
      if (y <= prof[i + 1][1]) return prof[i][0] + (prof[i + 1][0] - prof[i][0]) *
        (y - prof[i][1]) / (prof[i + 1][1] - prof[i][1]);
    return prof[prof.length - 1][0];
  };
  /* ragged snowline: flat tongues of snow lying ON the flank, three verts each */
  const G = new Mesh3();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.15;
    const d = 0.10, k = 1.012;
    const y0 = H * 0.58, y1 = H * (0.40 + 0.07 * (i % 3));
    const sp = (ang, y) => [m(Math.cos(ang) * rAt(y) * k), m(y), m(Math.sin(ang) * rAt(y) * k)];
    G.tri(sp(a - d, y0), sp(a + d, y0), sp(a, y1), [Math.cos(a), 0.25, Math.sin(a)]);
  }
  P.push({ geo: G.geo(), color: C.snow });
  /* crater rim + dark interior */
  P.push({ geo: CY(H * 0.062, H * 0.075, H * 0.03, 14), matrix: at(0, H * 1.005, 0), color: C.snow });
  P.push({ geo: DISC(H * 0.05, 12), matrix: at(0, H * 1.0, 0), color: C.basalt });
  return mergeParts(P);
}

/* ===========================================================================
   7. TOKYO SKYTREE — 634 m. Tripod base morphing to a round shaft, two disc
      observation pods at 350 m and 450 m, gain tower above.
   =========================================================================== */
function buildSkytree() {
  const P = [];
  /* tripod legs on concrete pile caps */
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    P.push({ geo: B_(26, 10, 26), matrix: mat([Math.cos(a) * m(33), m(5), Math.sin(a) * m(33)], [0, -a, 0]), color: C.concrete });
    P.push({
      geo: tube([[Math.cos(a) * 33, 10, Math.sin(a) * 33],
                [Math.cos(a) * 22, 62, Math.sin(a) * 22],
                [Math.cos(a) * 14, 130, Math.sin(a) * 14]], [9, 6.5, 4.5], 4),
      color: C.steelDk,
    });
  }
  /* shaft: concave taper, wide at the foot, waisted at 350 m */
  const prof = [[26, 10], [21, 110], [16.5, 220], [13, 330], [11, 430], [9, 497]];
  P.push(...profileShell(prof, 14, C.steel, 0));
  /* Tembo Deck (350 m) and Tembo Galleria (450 m) */
  P.push({ geo: CY(28, 26, 15, 16), matrix: at(0, 352, 0), color: C.glassDk });
  P.push({ geo: CY(27, 28, 3, 16), matrix: at(0, 361, 0), color: C.steelDk });
  P.push({ geo: CY(18, 17, 11, 14), matrix: at(0, 452, 0), color: C.glassDk });
  P.push({ geo: CY(17.5, 18, 2.5, 14), matrix: at(0, 458.5, 0), color: C.steelDk });
  /* gain tower + antenna to 634 m */
  P.push({ geo: CY(4.6, 8.0, 70, 10), matrix: at(0, 532, 0), color: C.steel });
  P.push({ geo: CY(2.4, 4.6, 32, 8), matrix: at(0, 583, 0), color: C.steelDk });
  P.push({ geo: CY(0.5, 2.4, 36, 5), matrix: at(0, 617, 0), color: C.steelDk });
  return mergeParts(P);
}

/* ===========================================================================
   8. ELIZABETH TOWER (BIG BEN) — 96 m. Square gothic shaft, four clock faces
      at 55 m, belfry, cast-iron spire.
   =========================================================================== */
function buildBigBen() {
  const P = [];
  const S = C.sandstone, D = 0xB08F63;
  P.push({ geo: B_(15, 6, 15), matrix: at(0, 3, 0), color: C.darkstone });
  P.push({ geo: SQ(6.2, 6.6, 46, 4), matrix: at(0, 29, 0), color: S });
  /* corner pilasters — the gothic vertical emphasis */
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    P.push({ geo: B_(2.6, 46, 2.6), matrix: at(sx * 6.0, 29, sz * 6.0), color: D });
  /* tall lancet windows down each face */
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    P.push({
      geo: B_(3.0, 24, 0.6),
      matrix: mat([Math.sin(a) * m(6.4), m(30), Math.cos(a) * m(6.4)], [0, a, 0]),
      color: C.glassDk,
    });
  }
  /* clock stage: slightly proud of the shaft, four faces */
  P.push({ geo: B_(15.4, 12, 15.4), matrix: at(0, 55, 0), color: S });
  P.push({ geo: B_(16.4, 1.6, 16.4), matrix: at(0, 48.6, 0), color: D });
  P.push({ geo: B_(16.4, 1.6, 16.4), matrix: at(0, 61.4, 0), color: D });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const nx = Math.sin(a), nz = Math.cos(a);
    const rimG = new THREE.CircleGeometry(m(5.4), 14);
    const faceG = new THREE.CircleGeometry(m(4.6), 14);
    const rot = [0, a, 0];
    P.push({ geo: rimG, matrix: mat([nx * m(7.75), m(55), nz * m(7.75)], rot), color: C.gold });
    P.push({ geo: faceG, matrix: mat([nx * m(7.85), m(55), nz * m(7.85)], rot), color: C.white });
    /* hands: flat quads, 6 verts each, but they are what says "clock" */
    const hourG = new THREE.PlaneGeometry(m(0.6), m(2.6));
    const minG = new THREE.PlaneGeometry(m(0.45), m(4.0));
    P.push({
      geo: hourG,
      matrix: mat([nx * m(7.95) + nz * m(0.7), m(56.0), nz * m(7.95) - nx * m(0.7)], [0, a, -1.1]),
      color: C.asphalt,
    });
    P.push({
      geo: minG,
      matrix: mat([nx * m(7.95) - nz * m(0.4), m(56.6), nz * m(7.95) + nx * m(0.4)], [0, a, 0.35]),
      color: C.asphalt,
    });
  }
  /* belfry housing the bell, then the spire */
  P.push({ geo: SQ(6.8, 7.4, 12), matrix: at(0, 68, 0), color: S });
  P.push({ geo: B_(15.6, 1.8, 15.6), matrix: at(0, 74.6, 0), color: D });
  P.push({ geo: CO(10.4, 15, 4), matrix: mat([0, m(83), 0], [0, Math.PI / 4, 0]), color: 0x53645C });
  P.push({ geo: CY(1.0, 2.4, 6, 6), matrix: at(0, 93, 0), color: C.gold });
  P.push({ geo: CO(1.6, 3, 6), matrix: at(0, 97.5, 0), color: C.gold });
  /* corner pinnacles */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.push({ geo: CO(2.0, 10, 4), matrix: mat([sx * m(6.6), m(80), sz * m(6.6)], [0, Math.PI / 4, 0]), color: D });
  }
  return mergeParts(P);
}

/* ===========================================================================
   9. COLOSSEUM — 188 x 156 m ellipse, 48 m tall, four tiers with the outer
      ring surviving on only one flank (the shape everyone actually pictures).
   =========================================================================== */
function buildColosseum() {
  const P = [];
  const T = C.travertine, TD = 0xB0A180;
  P.push({ geo: ellipseRing({ rxOut: 94, rzOut: 78, rxIn: 76, rzIn: 60, y0: 0, y1: 13.5, seg: 20 }), color: T });
  P.push({ geo: ellipseRing({ rxOut: 92, rzOut: 76, rxIn: 77, rzIn: 61, y0: 13.5, y1: 27, seg: 20 }), color: TD });
  /* third order and the attic survive across roughly half the perimeter */
  P.push({ geo: ellipseRing({ rxOut: 90, rzOut: 74, rxIn: 78, rzIn: 62, y0: 27, y1: 39, seg: 10, t0: -0.5, tLen: Math.PI }), color: T });
  P.push({ geo: ellipseRing({ rxOut: 88, rzOut: 72, rxIn: 79, rzIn: 63, y0: 39, y1: 48, seg: 6, t0: 0.21, tLen: Math.PI * 0.55 }), color: TD });
  /* Arch openings. A dark panel in every bay costs six verts each and is the
     single strongest "Colosseum" cue there is. */
  const ARCH = new THREE.PlaneGeometry(m(11.5), m(9.5));
  const bays = (rx, rz, y, n, from, span) => {
    for (let i = 0; i < n; i++) {
      const a = from + span * ((i + 0.5) / n);
      const px = rx * Math.cos(a) * 1.004, pz = rz * Math.sin(a) * 1.004;
      P.push({ geo: ARCH, matrix: mat([m(px), m(y), m(pz)], [0, Math.PI / 2 - a, 0]), color: 0x6E6555 });
    }
  };
  bays(94, 78, 6.8, 20, 0, Math.PI * 2);
  bays(92, 76, 20.2, 20, 0, Math.PI * 2);
  bays(90, 74, 33, 10, -0.5, Math.PI);
  /* inner cavea sloping down to the arena, and the arena floor itself */
  P.push({ geo: ellipseRing({ rxOut: 76, rzOut: 60, rxIn: 48, rzIn: 34, y0: 0, y1: 8, seg: 14 }), color: C.darkstone });
  P.push({ geo: DISC(1, 16), matrix: at(0, 3, 0, null, [48, 1, 34]), color: C.desert });
  return mergeParts(P);
}

/* ===========================================================================
   10. GREAT PYRAMID OF GIZA — 230 m square base, 139 m tall today,
       ~51.9-degree faces. Four courses so it catches light in bands.
   =========================================================================== */
function buildPyramid() {
  const P = [];
  const H = 139, HW = 115;
  P.push({ geo: B_(HW * 2.12, 4, HW * 2.12), matrix: at(0, 2, 0), color: C.desert });
  const n = 4;
  const cols = [C.sandstone, 0xC49F73, C.sandstone, 0xD3B489];
  for (let i = 0; i < n; i++) {
    const y0 = H * (i / n), y1 = H * ((i + 1) / n);
    const r0 = HW * (1 - y0 / H), r1 = HW * (1 - y1 / H);
    P.push({ geo: SQ(r1, r0 * 1.008, y1 - y0), matrix: at(0, (y0 + y1) / 2 + 3, 0), color: cols[i] });
  }
  /* remnant polished casing near the apex */
  P.push({ geo: SQ(0, HW * 0.14, H * 0.14), matrix: at(0, H * 0.93 + 3, 0), color: C.marble });
  /* entrance notch on the north face */
  P.push({ geo: B_(9, 8, 5), matrix: at(0, 20, HW * 0.83), color: 0x8A7350 });
  return mergeParts(P);
}

/* ===========================================================================
   11. SYDNEY OPERA HOUSE — nested spherical-section shells on a podium.
       Each shell is a quarter-sphere: flat chord at the back, dome forward.
   =========================================================================== */
/* One Utzon sail. The surface is a spherical section pinched toward the apex:
   radius falls as cos(t)^3 rather than cos(t), which is what turns a round
   dome into the pointed, ribbed shell everyone recognises. Unit-sized —
   the caller scales it into place. */
function sailShell(segs, rows) {
  const G = new Mesh3();
  const f = t => Math.pow(Math.cos(t * Math.PI / 2), 3);
  const g = t => Math.sin(t * Math.PI / 2);
  const pt = (u, t) => {
    const phi = -Math.PI / 2 + Math.PI * u, k = f(t);
    return [Math.sin(phi) * k, g(t), Math.cos(phi) * k];
  };
  for (let i = 0; i < segs; i++) for (let j = 0; j < rows; j++) {
    const u0 = i / segs, u1 = (i + 1) / segs, t0 = j / rows, t1 = (j + 1) / rows;
    G.quad(pt(u0, t0), pt(u1, t0), pt(u1, t1), pt(u0, t1));
  }
  return G.geo();
}
/* the flat chord face that closes the back of a sail */
function sailCap(rows) {
  const G = new Mesh3();
  const f = t => Math.pow(Math.cos(t * Math.PI / 2), 3);
  const g = t => Math.sin(t * Math.PI / 2);
  for (let j = 0; j < rows; j++) {
    const t0 = j / rows, t1 = (j + 1) / rows;
    G.quad([-f(t0), g(t0), 0], [-f(t1), g(t1), 0], [f(t1), g(t1), 0], [f(t0), g(t0), 0], [0, 0, -1]);
  }
  return G.geo();
}

function buildOperaHouse() {
  const P = [];
  const SHELL = sailShell(7, 4), CAP = sailCap(4);

  /* podium — long axis runs along Z, out into the harbour */
  P.push({ geo: B_(118, 5, 180), matrix: at(0, 2.5, 0), color: 0xA8A399 });
  P.push({ geo: B_(104, 12, 162), matrix: at(0, 9, 0), color: C.concrete });
  /* the monumental stair on the landward end */
  for (let i = 0; i < 4; i++)
    P.push({ geo: B_(92 - i * 7, 3.2, 11), matrix: at(0, 3.4 + i * 3.2, 78 - i * 5), color: 0xB6B1A6 });

  /* chord face at +Z, shell sweeping toward -Z: a row of them cascades down
     the podium toward the water */
  const sail = (x, z, w, h, d) => {
    const sc = [m(w / 2), m(h), m(d)];
    P.push({ geo: SHELL, matrix: mat([m(x), m(15), m(z)], [0, Math.PI, 0], sc), color: C.white });
    P.push({ geo: CAP, matrix: mat([m(x), m(15), m(z)], [0, Math.PI, 0], sc), color: 0xD6D2C8 });
  };
  /* concert hall — three sails, biggest inland, shrinking toward the point */
  sail(-26, 52, 50, 62, 46);
  sail(-26, 14, 44, 48, 36);
  sail(-26, -16, 34, 32, 26);
  /* opera theatre — offset across the podium and set forward */
  sail(27, 30, 42, 50, 38);
  sail(27, -2, 36, 38, 29);
  sail(27, -28, 27, 25, 20);
  /* the Bennelong restaurant shell out at the tip */
  sail(0, -62, 24, 19, 16);
  return mergeParts(P);
}

/* ===========================================================================
   12. BURJ KHALIFA — 828 m. Hexagonal buttressed core with three wings that
       set back in a spiral, then the 244 m needle spire.
   =========================================================================== */
function buildBurj() {
  const P = [];
  /* podium */
  P.push({ geo: CY(70, 82, 16, 6), matrix: at(0, 8, 0), color: C.concrete });
  /* core */
  const coreProf = [[26, 0], [23, 180], [19, 330], [15.5, 450], [12.5, 545], [10.5, 585]];
  P.push(...profileShell(coreProf, 6, [C.glass, C.glassDk, C.glass, C.glassDk, C.glass], 0));
  const coreR = y => {
    for (let i = 0; i < coreProf.length - 1; i++) {
      const a = coreProf[i], b = coreProf[i + 1];
      if (y <= b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
    }
    return coreProf[coreProf.length - 1][0];
  };
  /* three wings, each stepping back at staggered heights so the tower spirals */
  const stage = [
    [0, 175, 66, 30], [175, 300, 55, 26], [300, 395, 44, 22],
    [395, 470, 34, 18], [470, 530, 25, 15], [530, 578, 17, 12],
  ];
  for (let w = 0; w < 3; w++) {
    const a = w * (Math.PI * 2 / 3) + Math.PI / 6;
    const stagger = w * 26;                       // the setback spiral
    for (let s = 0; s < stage.length; s++) {
      const y0 = stage[s][0] + (s ? stagger : 0);
      const y1 = stage[s][1] + stagger;
      if (y1 <= y0) continue;
      const len = stage[s][2], wid = stage[s][3];
      const d = len / 2 + coreR((y0 + y1) / 2) * 0.35;
      P.push({
        geo: B_(len, y1 - y0, wid),
        matrix: mat([Math.cos(a) * m(d), m((y0 + y1) / 2), Math.sin(a) * m(d)], [0, -a, 0]),
        color: (s % 2) ? C.glassDk : C.glass,
      });
      /* rounded wing nose */
      P.push({
        geo: CY(wid / 2, wid / 2, y1 - y0, 5, true),
        matrix: mat([Math.cos(a) * m(d + len / 2), m((y0 + y1) / 2), Math.sin(a) * m(d + len / 2)]),
        color: (s % 2) ? C.glassDk : C.glass,
      });
    }
  }
  /* spire */
  P.push(...profileShell([[10, 585], [7, 640], [4.6, 700], [2.6, 760]], 6, C.steel, 0));
  P.push({ geo: CY(0.4, 2.6, 68, 5), matrix: at(0, 794, 0), color: C.steelDk });
  return mergeParts(P);
}

/* ===========================================================================
   13. CHRIST THE REDEEMER — 30 m figure with a 28 m arm span on an 8 m cube
       pedestal, the whole thing 38 m.
   =========================================================================== */
function buildChristRedeemer() {
  const P = [];
  const S = 0xCFC9BE;                               // soapstone
  P.push({ geo: B_(24, 3, 24), matrix: at(0, 1.5, 0), color: C.granite });
  P.push({ geo: B_(11, 8, 11), matrix: at(0, 7, 0), color: S });
  P.push({ geo: B_(12.6, 1.2, 12.6), matrix: at(0, 11.4, 0), color: C.darkstone });
  /* robe */
  P.push({ geo: CY(3.6, 6.4, 18, 10), matrix: at(0, 21, 0), color: S });
  P.push({ geo: CY(3.1, 3.6, 5, 10), matrix: at(0, 32.5, 0), color: S });
  /* shoulders + outstretched arms, 28 m tip to tip */
  P.push({ geo: B_(10.5, 2.6, 3.6), matrix: at(0, 34.4, 0), color: S });
  for (const s of [-1, 1]) {
    P.push({
      geo: B_(9.4, 2.2, 2.8),
      matrix: mat([s * m(9.6), m(34.0), 0], [0, 0, s * 0.05]), color: S,
    });
    P.push({ geo: B_(2.4, 2.6, 3.0), matrix: at(s * 13.8, 33.9, 0), color: S });
  }
  /* neck, head, hair */
  P.push({ geo: CY(1.25, 1.5, 2.2, 6), matrix: at(0, 36.4, 0), color: S });
  P.push({ geo: SP(2.35, 7, 5), matrix: at(0, 39.2, 0, null, [0.9, 1.05, 0.95]), color: S });
  P.push({ geo: SP(2.5, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), matrix: at(0, 39.5, -0.25), color: 0xBBB5AA });
  return mergeParts(P);
}

/* ===========================================================================
   14. TAJ MAHAL — 73 m to the finial. Marble plinth, chamfered cube with iwan
       arches, onion dome on a drum, four chattris, four corner minarets.
   =========================================================================== */
function buildTajMahal() {
  const P = [];
  const W = C.marble, WD = 0xD7D2C6;
  P.push({ geo: B_(132, 4, 132), matrix: at(0, 2, 0), color: 0xCFC6B4 });
  P.push({ geo: B_(102, 8, 102), matrix: at(0, 8, 0), color: WD });
  /* the mausoleum block — octagonal, i.e. a square with chamfered corners */
  P.push({ geo: CY(29, 30, 31, 8), matrix: mat([0, m(28.5), 0], [0, Math.PI / 8, 0]), color: W });
  /* the four great iwan arches */
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    P.push({
      geo: B_(19, 25, 3.0),
      matrix: mat([Math.sin(a) * m(27.5), m(24), Math.cos(a) * m(27.5)], [0, a, 0]),
      color: 0x9C9384,
    });
  }
  P.push({ geo: CY(31, 30.5, 3, 8), matrix: mat([0, m(45), 0], [0, Math.PI / 8, 0]), color: WD });
  /* drum + onion dome. The bulb has to overhang its neck or it reads as a
     cone; that overhang is the whole Mughal signature. */
  P.push({ geo: CY(15, 17, 12, 10), matrix: at(0, 51, 0), color: W });
  P.push(...profileShell([[13.5, 57], [17.6, 63], [17.2, 70], [13.2, 78], [6.5, 85], [0, 88.5]], 10, W, 0));
  P.push({ geo: CY(0.9, 2.2, 7, 5), matrix: at(0, 91, 0), color: C.gold });
  P.push({ geo: CO(1.4, 4, 5), matrix: at(0, 96, 0), color: C.gold });
  /* four chattri kiosks on the roof corners — small onion domes, not spikes */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 20, z = sz * 20;
    P.push({ geo: CY(6.0, 6.4, 9, 6, true), matrix: at(x, 51, z), color: W });
    P.push(...profileShell([[6.4, 55.5], [7.2, 58.5], [0, 64]], 6, WD, 0)
      .map(p => { p.matrix = mat([m(x), 0, m(z)]).multiply(p.matrix); return p; }));
    P.push({ geo: CO(0.8, 3, 4), matrix: at(x, 65.5, z), color: C.gold });
  }
  /* four minarets on the plinth corners, 41 m */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 44, z = sz * 44;
    P.push({ geo: CY(2.4, 3.4, 40, 6, true), matrix: at(x, 32, z), color: W });
    P.push({ geo: CY(4.4, 4.4, 1.6, 6, true), matrix: at(x, 34, z), color: WD });
    P.push({ geo: CY(4.2, 3.8, 2.2, 6, true), matrix: at(x, 53, z), color: WD });
    P.push(...profileShell([[3.8, 54], [4.6, 57], [0, 62.5]], 6, W, 0)
      .map(p => { p.matrix = mat([m(x), 0, m(z)]).multiply(p.matrix); return p; }));
    P.push({ geo: CO(0.7, 2.6, 4), matrix: at(x, 63.5, z), color: C.gold });
  }
  return mergeParts(P);
}

/* ===========================================================================
   15. SAGRADA FAMILIA — a thicket of tapering parabolic spires, the central
       Tower of Jesus Christ at 172 m.
   =========================================================================== */
function buildSagrada() {
  const P = [];
  const S = 0xCDBB9A, SD = 0xB3A183;
  /* nave, transept, apse */
  P.push({ geo: B_(92, 46, 58), matrix: at(0, 23, 0), color: S });
  P.push({ geo: B_(46, 40, 84), matrix: at(0, 20, 0), color: SD });
  P.push({ geo: B_(88, 12, 54), matrix: at(0, 52, 0), color: SD });
  P.push({ geo: CY(24, 26, 46, 8), matrix: at(-52, 23, 0), color: S });
  /* pointed-arch window slots so the mass reads gothic */
  for (let i = -3; i <= 3; i++) {
    P.push({ geo: B_(4.5, 22, 60), matrix: at(i * 12, 30, 0), color: 0x7E7259 });
  }

  /* parabolic spire: radius falls as (1 - t)^0.62 */
  const spire = (x, z, h, rBase, segs) => {
    const prof = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      prof.push([rBase * Math.pow(1 - t, 0.62), h * t]);
    }
    const parts = [];
    for (let i = 0; i < segs; i++) {
      const a = prof[i], b = prof[i + 1];
      parts.push({
        geo: CY(b[0], a[0], b[1] - a[1], 6, true),
        matrix: at(x, (a[1] + b[1]) / 2, z),
        color: i % 2 ? SD : S,
      });
    }
    /* the pinnacle: a bright ceramic-tiled finial, unmistakably Gaudi */
    parts.push({ geo: CO(rBase * 0.13, h * 0.07, 6), matrix: at(x, h * 1.02, z), color: C.gold });
    return parts;
  };
  P.push(...spire(0, 0, 172, 15, 4));               // Tower of Jesus Christ
  P.push(...spire(-4, 30, 138, 11, 3));             // Tower of the Virgin Mary
  P.push(...spire(-4, -30, 132, 11, 3));
  P.push(...spire(36, 20, 108, 9, 2));              // Nativity facade
  P.push(...spire(36, -20, 104, 9, 2));
  P.push(...spire(-38, 20, 112, 9, 2));             // Passion facade
  P.push(...spire(-38, -20, 108, 9, 2));
  return mergeParts(P);
}

/* ===========================================================================
   16. CAPITOL — the domed statehouse used by Denver. Long block, colonnaded
       portico, drum, ribbed dome, lantern and statue.
   =========================================================================== */
function buildCapitol() {
  const P = [];
  const S = C.limestone, SD = 0xC3B99F;
  P.push({ geo: B_(150, 6, 74), matrix: at(0, 3, 0), color: SD });
  P.push({ geo: B_(140, 22, 64), matrix: at(0, 17, 0), color: S });
  /* wings */
  for (const s of [-1, 1]) P.push({ geo: B_(38, 10, 56), matrix: at(s * 52, 33, 0), color: S });
  /* central mass under the dome */
  P.push({ geo: B_(58, 16, 58), matrix: at(0, 36, 0), color: S });
  /* portico: six columns and a pediment */
  for (let i = 0; i < 6; i++) {
    P.push({ geo: CY(1.9, 2.2, 18, 5, true), matrix: at(-17.5 + i * 7, 15, 36), color: C.marble });
  }
  P.push({ geo: B_(48, 3, 8), matrix: at(0, 25.4, 36), color: C.marble });
  P.push({
    geo: extrudeProfile([[m(-24), 0], [m(24), 0], [0, m(8)]], m(4), 0),
    matrix: at(0, 27, 36), color: C.marble,
  });
  P.push({ geo: B_(52, 4, 14), matrix: at(0, 6, 38), color: SD });
  /* window bands */
  for (const sz of [-1, 1]) for (let i = -2; i <= 2; i++)
    P.push({ geo: B_(14, 9, 1), matrix: at(i * 26, 18, sz * 32.4), color: C.glassDk });
  /* drum with a peristyle hinted by flutes */
  P.push({ geo: CY(21, 23, 8, 12), matrix: at(0, 48, 0), color: SD });
  P.push({ geo: CY(19.5, 20, 22, 12), matrix: at(0, 63, 0), color: C.marble });
  /* dome — kept hemispherical; too much rise and it reads as a rocket nose */
  P.push(...profileShell([[20, 74], [19.2, 81], [16.6, 89], [12, 96], [5.5, 101], [0, 104]], 12, C.gold, 0));
  /* lantern + statue */
  P.push({ geo: CY(4.2, 5.2, 8, 8), matrix: at(0, 107, 0), color: C.marble });
  P.push({ geo: CO(4.6, 6, 8), matrix: at(0, 113, 0), color: C.gold });
  P.push({ geo: CY(0.7, 1.0, 6, 4), matrix: at(0, 118, 0), color: C.bronze });
  return mergeParts(P);
}

/* ===========================================================================
   17. GENERIC MODERN TOWER — the fallback when a site has a landmark of type
       "tower"/"spire" but no signature building modelled.
   =========================================================================== */
function buildTower() {
  const P = [];
  const H = 240;
  P.push({ geo: B_(48, 10, 44), matrix: at(0, 5, 0), color: C.concrete });
  P.push({ geo: SQ(11, 16, H), matrix: at(0, H / 2 + 8, 0), color: C.glass });
  for (let i = 1; i <= 5; i++)
    P.push({ geo: SQ(16 - i * 0.85, 16 - i * 0.85, 3), matrix: at(0, 8 + i * (H / 6), 0), color: C.steel });
  P.push({ geo: SQ(9, 11, 22), matrix: at(0, H + 19, 0), color: C.glassDk });
  P.push({ geo: SQ(6, 9, 4), matrix: at(0, H + 32, 0), color: C.steel });
  P.push({ geo: CY(0.6, 1.8, 40, 5), matrix: at(0, H + 54, 0), color: C.steelDk });
  return mergeParts(P);
}

/* ===========================================================================
   18. GENERIC PEAK — fallback terrain landmark for alpine / range sites.
   =========================================================================== */
function buildMountain() {
  const P = [];
  const H = 2400;
  P.push(...profileShell([
    [H * 1.02, 0], [H * 0.76, H * 0.22], [H * 0.52, H * 0.46],
    [H * 0.30, H * 0.70], [H * 0.12, H * 0.90], [0, H],
  ], 14, [C.forest, C.rock, C.rock, C.snow, C.snow], 0));
  /* a subsidiary summit on one shoulder, so it is not a lone traffic cone */
  P.push(...profileShell([
    [H * 0.44, 0], [H * 0.28, H * 0.24], [H * 0.11, H * 0.46], [0, H * 0.60],
  ], 10, [C.forest, C.rock, C.snow], 0).map(p => {
    p.matrix = mat([m(H * 0.78), 0, m(-H * 0.32)], null, null).multiply(p.matrix);
    return p;
  }));
  return mergeParts(P);
}

/* ---------------------------------------------------------------------------
   Registry
   --------------------------------------------------------------------------- */
const BUILDERS = {
  goldengate:     buildGoldenGate,
  salesforce:     buildSalesforce,
  liberty:        buildLiberty,
  empirestate:    buildEmpireState,
  eiffel:         buildEiffel,
  fuji:           buildFuji,
  skytree:        buildSkytree,
  bigben:         buildBigBen,
  colosseum:      buildColosseum,
  pyramid:        buildPyramid,
  operahouse:     buildOperaHouse,
  burj:           buildBurj,
  christredeemer: buildChristRedeemer,
  tajmahal:       buildTajMahal,
  sagrada:        buildSagrada,
  capitol:        buildCapitol,
  tower:          buildTower,
  mountain:       buildMountain,
};

/* real-world heights in metres — lets the caller scale sanely */
const HEIGHT_M = {
  goldengate: 227, salesforce: 326, liberty: 93, empirestate: 443, eiffel: 330,
  fuji: 3776, skytree: 634, bigben: 96, colosseum: 48, pyramid: 139,
  operahouse: 65, burj: 828, christredeemer: 38, tajmahal: 73, sagrada: 172,
  capitol: 120, tower: 294, mountain: 2400,
};

const _cache = {};
function build(id) {
  if (!BUILDERS[id]) return null;
  if (!_cache[id]) _cache[id] = BUILDERS[id]();
  return _cache[id];
}

/* ---------------------------------------------------------------------------
   Placements. World units, 1 unit = 200 m of map, origin at the site centre.
   Kept inside +/-60 units so nothing lands off the edge of the table.
   --------------------------------------------------------------------------- */
const PLACEMENTS = {
  sanfrancisco: [
    { id: 'goldengate', x: -33, z: -31, rotY: 0.62 },
    { id: 'salesforce', x: 5, z: 3, rotY: 0.26 },
  ],
  newyork: [
    { id: 'liberty', x: -22, z: 33, rotY: 0.95 },
    { id: 'empirestate', x: 2, z: -3, rotY: 0.51 },
  ],
  tokyo: [
    { id: 'skytree', x: 15, z: -11, rotY: 0.30 },
    { id: 'fuji', x: -52, z: -40, rotY: 0 },
  ],
  paris:        [{ id: 'eiffel', x: -9, z: 6, rotY: 0.40 }],
  london:       [{ id: 'bigben', x: 4, z: 9, rotY: -0.32 }],
  rome:         [{ id: 'colosseum', x: 7, z: 5, rotY: 0.35 }],
  cairo: [
    { id: 'pyramid', x: -27, z: 13, rotY: 0.16, scale: 1.00 },
    { id: 'pyramid', x: -18, z: 21, rotY: 0.16, scale: 0.88 },
    { id: 'pyramid', x: -11, z: 27, rotY: 0.16, scale: 0.60 },
  ],
  sydney:       [{ id: 'operahouse', x: -4, z: -14, rotY: 0.70 }],
  dubai:        [{ id: 'burj', x: 3, z: -5, rotY: 0.20 }],
  riodejaneiro: [{ id: 'christredeemer', x: -19, z: 16, rotY: -0.85 }],
  barcelona:    [{ id: 'sagrada', x: 6, z: -4, rotY: 0.28 }],
  denver:       [{ id: 'capitol', x: 3, z: 4, rotY: 0.0 }],
  /* additional sites that already have signature landmarks in the atlas */
  agra:         [{ id: 'tajmahal', x: 0, z: 0, rotY: 0 }],
  mumbai:       [{ id: 'tower', x: 6, z: -6, rotY: 0.3 }],
  zermatt:      [{ id: 'mountain', x: -20, z: -24, rotY: 0.4 }],
  everest:      [{ id: 'mountain', x: -8, z: -14, rotY: 0.2 }],
};

function forSite(siteId) {
  const p = PLACEMENTS[siteId];
  if (!p) return [];
  return p.map(o => ({ id: o.id, x: o.x, z: o.z, rotY: o.rotY || 0, scale: o.scale === undefined ? 1 : o.scale }));
}

global.AegisLandmarks = {
  M, m, C, BUILDERS, HEIGHT_M, PLACEMENTS,
  build, forSite,
  list: Object.keys(BUILDERS),
  /* exposed for anyone extending the library */
  helpers: { tube, strut, starPrism, ellipseRing, profileShell, Mesh3 },
};
})(window);
