/* ============================================================================
   AEGIS OVERWATCH — road network
   ----------------------------------------------------------------------------
   Before this module the streets were faked TWICE, independently, and the two
   fakes disagreed:

     * drawRoads() painted white lines onto a canvas that was mapped onto the
       ground. A picture of roads, with no data behind it.
     * the traffic system invented its own lane grid — a lane index and an axis
       flag — and drove cars along it.

   So cars drove on invisible lanes that had nothing to do with the painted
   streets, and straight through buildings.

   This is the single source of truth for both. It emits a real directed graph
   a car can drive, a ribbon mesh you can see, and a canvas painting of the SAME
   nodes — the painting is generated from the graph, which is what removes the
   entire class of "picture and data disagree" bug rather than papering over it.

   The grid is laid out on the HALF-OFFSETS of the same block step buildCity
   uses, so roads run BETWEEN blocks instead of through them. That number is
   exported as blockStep() and consumed by both, for the same reason.
   ============================================================================ */
(function (global) {
'use strict';

const WGEN = global.AegisWorld;

const CLASS = { ARTERIAL: 'arterial', STREET: 'street', TRACK: 'track' };

/* Road width is the one number in this file that has to satisfy two scales at
   once, and they disagree by a factor of nine.

   A car is authored at 0.1957 units/metre; the city fabric is authored at
   0.022. A true 20 m arterial is 3.9 units at car scale and 0.44 at city scale.
   Take the car's answer and the streets swallow the blocks — measured: half the
   city gets vetoed as standing in a carriageway. Take the city's answer and a
   car is four times wider than the road it drives on.

   So the width is set from the CAR — a street has to hold one, or the traffic
   is visibly wrong — and then trimmed to the narrowest that still does it. A
   sedan is 0.38 wide, so a 0.52-wide street is a single lane with a hand's
   clearance, and an arterial is two of those. Against a 3-4 unit block pitch
   that reads as a street rather than a runway. */
const LANE_W = 0.26;
const WIDTHS = {
  arterial: { hw: LANE_W * 2, lanes: 2, speed: 2.10 },
  street:   { hw: LANE_W,     lanes: 1, speed: 1.35 },
  track:    { hw: 0.18,       lanes: 1, speed: 0.85 },
};

/* Countries that drive on the left. Cars pick their lane side from this, which
   is the kind of detail a Lockheed audience notices in Tokyo and London. */
const DRIVE_LEFT = new Set(['london', 'capetown', 'nairobi', 'tokyo', 'hongkong',
  'singapore', 'mumbai', 'bangkok', 'kathmandu', 'sydney', 'auckland', 'jerusalem']);

/* The block pitch buildCity solves from its budget. Both callers must agree or
   the roads and the buildings drift apart, so it lives here once. */
function blockStep(site, budget) {
  const R = WGEN.cityRadius(site) || 34;
  const L = site.layout;
  const blockU = Math.max(1.6, site.block / 200 * 4.2);
  if (L === 'grid' || L === 'colonial' || L === 'dense' || L === 'superblock') {
    const lots = L === 'dense' ? 3 : L === 'superblock' ? 5 : 2;
    const spread = 0.72 * R;
    return WGEN.clamp(spread * Math.sqrt(Math.PI * lots * site.density / (budget || 430)),
      blockU * 0.55, blockU * 3.2);
  }
  if (L === 'canal') {
    return WGEN.clamp(0.72 * R * Math.sqrt(Math.PI * site.density / (budget || 430)),
      blockU * 0.5, blockU * 3);
  }
  return blockU;
}

function build(opts) {
  const site = opts.site, terrain = opts.terrain, water = opts.water;
  const cx = (opts.centre && opts.centre.x) || 0, cz = (opts.centre && opts.centre.z) || 0;
  const R = opts.radius || 34;
  const step = opts.step || blockStep(site, opts.budget);
  const rot = (site.rot || 0) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const rng = opts.rng || WGEN.rngFrom(WGEN.seedOf(site) + 5);
  const layout = site.layout || 'none';
  const driveLeft = DRIVE_LEFT.has(site.id);
  const extent = opts.extent || Math.max(40, R * 2.7);

  const nodes = [], edges = [], arterials = [];
  const nodeKey = new Map();

  /* local (u along the grid bearing, v across) -> world */
  const wx = (u, v) => cx + u * cos - v * sin;
  const wz = (u, v) => cz + u * sin + v * cos;

  function nodeAt(x, z) {
    /* quantise so shared corners fuse into one intersection */
    const k = (Math.round(x * 16) / 16) + '|' + (Math.round(z * 16) / 16);
    let i = nodeKey.get(k);
    if (i !== undefined) return i;
    i = nodes.length;
    nodeKey.set(k, i);
    nodes.push({ i, x, z, y: terrain.height(x, z), out: [], ctrl: 0, phase: 0 });
    return i;
  }

  let roadId = 0;
  function link(ai, bi, cls) {
    const A = nodes[ai], B = nodes[bi];
    const dx = B.x - A.x, dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const W = WIDTHS[cls] || WIDTHS.street;
    const ux = dx / len, uz = dz / len;
    const mk = (a, b, sx, sz) => {
      const e = { i: edges.length, a, b, twin: 0, cls, roadId, len,
        dx: sx, dz: sz, nx: sz, nz: -sx,
        hw: W.hw, lanes: W.lanes, speed: W.speed,
        ya: nodes[a].y, yb: nodes[b].y,
        water: water.has ? (water.mask((nodes[a].x + nodes[b].x) / 2,
                                       (nodes[a].z + nodes[b].z) / 2) > 0.2) : false,
        dead: false };
      edges.push(e); nodes[a].out.push(e.i);
      return e;
    };
    const e0 = mk(ai, bi, ux, uz);
    const e1 = mk(bi, ai, -ux, -uz);
    e0.twin = e1.i; e1.twin = e0.i;
    if (cls === CLASS.ARTERIAL) { arterials.push(e0.i, e1.i); }
  }

  /* a polyline of world points becomes a chain of edges sharing one roadId */
  function road(pts, cls) {
    if (pts.length < 2) return;
    roadId++;
    let prev = nodeAt(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const n = nodeAt(pts[i][0], pts[i][1]);
      if (n !== prev) { link(prev, n, cls); prev = n; }
    }
  }

  const inTown = (x, z) => Math.hypot(x - cx, z - cz) <= R * 1.02;
  /* a road may cross water — that becomes a bridge — but must not run along it */
  const drownedRun = (x0, z0, x1, z1) => {
    if (!water.has) return false;
    let n = 0, tot = 0;
    for (let t = 0; t <= 1.0001; t += 0.25) {
      tot++;
      if (water.mask(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) > 0.35) n++;
    }
    return n / tot > 0.7;
  };

  /* ---------------------------------------------------------------- layouts */
  function gridLike() {
    /* Roads sit on the HALF-OFFSETS of the building step, so a street runs down
       the gap between two rows of blocks instead of through their middles. */
    const span = Math.ceil(R / step) + 1;
    const everyArt = layout === 'superblock' ? 2 : layout === 'dense' ? 4 : 3;
    for (const axis of [0, 1]) {
      for (let g = -span; g <= span; g++) {
        const off = (g + 0.5) * step;
        const cls = (((g % everyArt) + everyArt) % everyArt === 0) ? CLASS.ARTERIAL : CLASS.STREET;
        const pts = [];
        for (let t = -span; t <= span; t++) {
          const a = (t + 0.5) * step;
          const x = axis ? wx(a, off) : wx(off, a);
          const z = axis ? wz(a, off) : wz(off, a);
          if (!inTown(x, z)) { if (pts.length > 1) road(pts, cls); pts.length = 0; continue; }
          if (pts.length) {
            const p = pts[pts.length - 1];
            if (drownedRun(p[0], p[1], x, z)) { if (pts.length > 1) road(pts, cls); pts.length = 0; continue; }
          }
          pts.push([x, z]);
        }
        if (pts.length > 1) road(pts, cls);
      }
    }
  }

  function radialLike() {
    /* boulevards out of the centre plus concentric rings: Paris, Moscow */
    const spokes = 12;
    for (let s = 0; s < spokes; s++) {
      const a = rot + (s / spokes) * Math.PI * 2;
      const pts = [];
      for (let r = step * 0.5; r <= R; r += step * 0.8) {
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (pts.length) {
          const p = pts[pts.length - 1];
          if (drownedRun(p[0], p[1], x, z)) { if (pts.length > 1) road(pts, CLASS.ARTERIAL); pts.length = 0; continue; }
        }
        pts.push([x, z]);
      }
      if (pts.length > 1) road(pts, CLASS.ARTERIAL);
    }
    let ring = 0;
    for (let r = step; r <= R; r += step * 1.15) {
      ring++;
      const n = Math.max(14, Math.round(2 * Math.PI * r / (step * 0.7)));
      const cls = ring % 3 === 0 ? CLASS.ARTERIAL : CLASS.STREET;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (pts.length) {
          const p = pts[pts.length - 1];
          if (drownedRun(p[0], p[1], x, z)) { if (pts.length > 1) road(pts, cls); pts.length = 0; continue; }
        }
        pts.push([x, z]);
      }
      if (pts.length > 1) road(pts, cls);
    }
  }

  function organicLike() {
    /* wandering lanes off a few spines — medina, medieval core, favela */
    const spines = 8;
    for (let s = 0; s < spines; s++) {
      let a = rng() * Math.PI * 2;
      let px = cx + (rng() - 0.5) * R * 0.3, pz = cz + (rng() - 0.5) * R * 0.3;
      const pts = [[px, pz]];
      const n = Math.round(R / (step * 0.5));
      for (let i = 0; i < n; i++) {
        a += (rng() - 0.5) * 0.8;
        px += Math.cos(a) * step * 0.6; pz += Math.sin(a) * step * 0.6;
        if (!inTown(px, pz)) break;
        const p = pts[pts.length - 1];
        if (drownedRun(p[0], p[1], px, pz)) break;
        pts.push([px, pz]);
      }
      if (pts.length > 1) road(pts, s < 3 ? CLASS.ARTERIAL : CLASS.STREET);
    }
    /* cross-links so the graph is not a set of disjoint threads */
    for (let s = 0; s < 10; s++) {
      const a = rng() * Math.PI * 2, r = rng() * R * 0.85;
      const x0 = cx + Math.cos(a) * r, z0 = cz + Math.sin(a) * r;
      const b = a + Math.PI * (0.35 + rng() * 0.3);
      const x1 = x0 + Math.cos(b) * step * 2.2, z1 = z0 + Math.sin(b) * step * 2.2;
      if (!inTown(x1, z1) || drownedRun(x0, z0, x1, z1)) continue;
      road([[x0, z0], [x1, z1]], CLASS.STREET);
    }
  }

  if (layout !== 'none') {
    if (layout === 'radial') radialLike();
    else if (layout === 'organic') organicLike();
    else gridLike();
  }

  /* one country road out to the range and one to the agri belt, so the world
     outside the city is not a trackless void */
  if (layout !== 'none') {
    road([[cx - R * 0.9, cz], [-60, 8], [-88, -14]], CLASS.TRACK);
    road([[cx + R * 0.9, cz], [70, 6], [102, 16]], CLASS.TRACK);
  }

  const empty = edges.length === 0;

  /* ------------------------------------------------- baked coverage fields */
  const RES = opts.maskRes || 256;
  const half = extent / 2;
  const field = new Float32Array(RES * RES);          // carriageway coverage
  const walk = new Float32Array(RES * RES);           // sidewalk band
  const cell = extent / RES;
  const gx = x => (x - cx + half) / cell;
  const gz = z => (z - cz + half) / cell;

  function stamp(buf, x0, z0, x1, z1, halfW, val) {
    const px0 = gx(x0), pz0 = gz(z0), px1 = gx(x1), pz1 = gz(z1);
    const r = halfW / cell;
    const lo = i => Math.max(0, Math.floor(i)), hi = i => Math.min(RES - 1, Math.ceil(i));
    const i0 = lo(Math.min(px0, px1) - r - 1), i1 = hi(Math.max(px0, px1) + r + 1);
    const j0 = lo(Math.min(pz0, pz1) - r - 1), j1 = hi(Math.max(pz0, pz1) + r + 1);
    const ex = px1 - px0, ez = pz1 - pz0;
    const L2 = ex * ex + ez * ez || 1e-6;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let t = ((i + 0.5 - px0) * ex + (j + 0.5 - pz0) * ez) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ddx = i + 0.5 - (px0 + ex * t), ddz = j + 0.5 - (pz0 + ez * t);
      const d = Math.hypot(ddx, ddz);
      if (d > r) continue;
      const k = j * RES + i;
      const v = val * (1 - Math.min(1, d / r) * 0.25);
      if (v > buf[k]) buf[k] = v;
    }
  }
  for (const e of edges) {
    if (e.i > e.twin) continue;                        // one stamp per centreline
    const A = nodes[e.a], B = nodes[e.b];
    stamp(field, A.x, A.z, B.x, B.z, e.hw, 1);
    stamp(walk, A.x, A.z, B.x, B.z, e.hw + 0.30, 1);
  }
  /* the sidewalk is the band OUTSIDE the carriageway, not the road itself */
  for (let k = 0; k < walk.length; k++) walk[k] = Math.max(0, walk[k] - field[k]);

  function sample(buf, x, z) {
    const u = gx(x) - 0.5, v = gz(z) - 0.5;
    const i = Math.floor(u), j = Math.floor(v);
    if (i < 0 || j < 0 || i >= RES - 1 || j >= RES - 1) return 0;
    const fx = u - i, fz = v - j, k = j * RES + i;
    return buf[k] * (1 - fx) * (1 - fz) + buf[k + 1] * fx * (1 - fz)
         + buf[k + RES] * (1 - fx) * fz + buf[k + RES + 1] * fx * fz;
  }
  const roadMask = (x, z) => empty ? 0 : sample(field, x, z);
  const walkMask = (x, z) => empty ? 0 : sample(walk, x, z);
  const onRoad = (x, z) => roadMask(x, z) >= 0.5;
  function clearOf(x, z, margin) {
    if (empty) return true;
    const m = margin || 0;
    if (roadMask(x, z) > 0.35) return false;
    if (!m) return true;
    return roadMask(x + m, z) <= 0.35 && roadMask(x - m, z) <= 0.35
        && roadMask(x, z + m) <= 0.35 && roadMask(x, z - m) <= 0.35;
  }

  /* ------------------------------------------------------- spatial hash */
  const HC = Math.max(2, Math.round(extent / Math.max(1, step)));
  const hash = new Array(HC * HC);
  const hi = (x, z) => {
    const i = Math.min(HC - 1, Math.max(0, Math.floor((x - cx + half) / extent * HC)));
    const j = Math.min(HC - 1, Math.max(0, Math.floor((z - cz + half) / extent * HC)));
    return j * HC + i;
  };
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b];
    const n = Math.max(1, Math.ceil(e.len / Math.max(0.5, step * 0.5)));
    for (let s = 0; s <= n; s++) {
      const k = hi(A.x + (B.x - A.x) * s / n, A.z + (B.z - A.z) * s / n);
      (hash[k] || (hash[k] = [])).push(e.i);
    }
  }

  /* --------------------------------------------------------------- driving */
  /* lane centre offset from the centreline, signed for the side of the road */
  function laneOffset(e, lane) {
    const side = driveLeft ? -1 : 1;
    return side * (LANE_W * 0.5 + lane * LANE_W);
  }
  function posOnEdge(ei, s, lane, out) {
    const e = edges[ei], A = nodes[e.a];
    const t = e.len ? Math.min(1, Math.max(0, s / e.len)) : 0;
    const o = laneOffset(e, lane || 0);
    out.x = A.x + e.dx * s + e.nx * o;
    out.z = A.z + e.dz * s + e.nz * o;
    out.y = e.ya + (e.yb - e.ya) * t;
    out.rot = Math.atan2(e.dx, e.dz);
    return out;
  }
  function nextEdge(ei, rnd) {
    const e = edges[ei];
    const outs = nodes[e.b].out.filter(i => !edges[i].dead && i !== e.twin);
    if (!outs.length) return e.twin;                   // dead end: turn around
    /* prefer straight on, then the same street, then anything */
    let best = -1, bestScore = -1e9;
    for (const i of outs) {
      const o = edges[i];
      const dot = o.dx * e.dx + o.dz * e.dz;
      let sc = dot * 2.2;
      if (o.roadId === e.roadId) sc += 1.4;
      if (o.cls === CLASS.ARTERIAL) sc += 0.5;
      sc += (rnd ? rnd() : Math.random()) * 1.5;       // enough noise to spread traffic
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    return best < 0 ? e.twin : best;
  }
  function spawn(rnd) {
    if (empty) return null;
    const r = rnd ? rnd() : Math.random();
    const pool = (r < 0.55 && arterials.length) ? arterials : null;
    const ei = pool ? pool[Math.floor((rnd ? rnd() : Math.random()) * pool.length)]
                    : Math.floor((rnd ? rnd() : Math.random()) * edges.length);
    const e = edges[ei];
    if (!e || e.dead) return null;
    return { edge: ei, s: (rnd ? rnd() : Math.random()) * e.len,
             lane: Math.floor((rnd ? rnd() : Math.random()) * e.lanes) };
  }
  function snap(x, z, maxDist) {
    if (empty) return null;
    const md = maxDist || step * 3;
    const list = hash[hi(x, z)];
    if (!list) return null;
    let best = null, bd = md * md;
    for (const ei of list) {
      const e = edges[ei];
      if (e.dead) continue;
      const A = nodes[e.a];
      let s = (x - A.x) * e.dx + (z - A.z) * e.dz;
      s = Math.max(0, Math.min(e.len, s));
      const px = A.x + e.dx * s, pz = A.z + e.dz * s;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < bd) { bd = d2; best = { edge: ei, s, lane: 0, dist: Math.sqrt(d2) }; }
    }
    return best;
  }
  function nearestWalk(x, z, out) {
    const h = snap(x, z, step * 4);
    if (!h) return false;
    const e = edges[h.edge], A = nodes[e.a];
    const off = (e.hw + 0.18) * ((x - A.x) * e.nx + (z - A.z) * e.nz >= 0 ? 1 : -1);
    out.x = A.x + e.dx * h.s + e.nx * off;
    out.z = A.z + e.dz * h.s + e.nz * off;
    return true;
  }
  /* two-phase signals at the busier crossings, so traffic pulses like traffic */
  for (const n of nodes) {
    n.deg = n.out.length;
    if (n.deg >= 4) { n.ctrl = 2; n.phase = (n.i & 1); }
    else if (n.deg === 3) n.ctrl = 1;
  }
  const signalGreen = (ni, t) => {
    const n = nodes[ni];
    if (!n || n.ctrl !== 2) return true;
    return (Math.floor(t / 6) & 1) === n.phase;
  };

  /* ------------------------------------------------------------- rendering */
  function buildRibbon(o) {
    o = o || {};
    const lift = o.lift === undefined ? 0.05 : o.lift;
    const asphalt = new THREE.Color(o.asphalt === undefined ? 0x33363c : o.asphalt);
    const kerb = new THREE.Color(o.kerb === undefined ? 0x8d949c : o.kerb);
    const heightFn = o.heightFn || ((x, z) => terrain.height(x, z));

    /* one cross-section every `vstep`, tightened until the budget is met */
    let vstep = o.vertexStep || Math.max(0.6, step * 0.42);
    let segs = 0;
    const centre = edges.filter(e => e.i < e.twin && !e.dead);
    for (const e of centre) segs += Math.max(1, Math.ceil(e.len / vstep));
    const MAXV = o.maxRibbonVerts || 26000;
    while (segs * 8 > MAXV && vstep < step * 6) {
      vstep *= 1.35; segs = 0;
      for (const e of centre) segs += Math.max(1, Math.ceil(e.len / vstep));
    }

    const rings = segs + centre.length;                 // 4 verts per cross-section
    const pos = new Float32Array(rings * 4 * 3);
    const col = new Float32Array(rings * 4 * 3);
    const idx = [];
    let v = 0;
    for (const e of centre) {
      const A = nodes[e.a];
      const n = Math.max(1, Math.ceil(e.len / vstep));
      const outer = e.hw + 0.07;
      const base = v;
      for (let s = 0; s <= n; s++) {
        const t = s / n, d = e.len * t;
        const px = A.x + e.dx * d, pz = A.z + e.dz * d;
        /* a bridge deck holds its height across the span instead of diving in */
        const y = (e.water ? Math.max(heightFn(px, pz), 0.30) : heightFn(px, pz)) + lift;
        const wsp = [-outer, -e.hw * 0.86, e.hw * 0.86, outer];
        for (let k = 0; k < 4; k++) {
          const w = wsp[k];
          const o3 = v * 3;
          pos[o3] = px + e.nx * w; pos[o3 + 1] = y; pos[o3 + 2] = pz + e.nz * w;
          /* only the outermost pair is kerb, so the carriageway stays asphalt.
             The centreline lives in the painted overlay, where a hairline is
             free — as ribbon geometry it needs its own vertex pair and ends up
             painting a third of the road yellow. */
          const c = (k === 0 || k === 3) ? kerb : asphalt;
          col[o3] = c.r; col[o3 + 1] = c.g; col[o3 + 2] = c.b;
          v++;
        }
        if (s > 0) {
          const p = base + (s - 1) * 4, q = base + s * 4;
          for (let k = 0; k < 3; k++)
            idx.push(p + k, q + k, q + k + 1, p + k, q + k + 1, p + k + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return { geo, verts: v, tris: idx.length / 3, vertexStep: vstep };
  }

  /* The SAME nodes painted into a canvas. No ctx.rotate: the bearing is already
     baked into the node coordinates, which is exactly why the picture can no
     longer disagree with the graph. */
  function paintTo(c, S, o) {
    o = o || {};
    const ext = o.extent || extent;
    const px = x => (x - cx + ext / 2) / ext * S;
    const pz = z => (z - cz + ext / 2) / ext * S;
    c.clearRect(0, 0, S, S);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const col = o.colour || '255,255,255';
    for (const pass of [0, 1]) {
      for (const e of edges) {
        if (e.i > e.twin || e.dead) continue;
        const art = e.cls === CLASS.ARTERIAL;
        if (pass === 0 && !art) continue;
        if (pass === 1 && art) continue;
        const A = nodes[e.a], B = nodes[e.b];
        c.strokeStyle = `rgba(${col},${art ? 0.62 : 0.38})`;
        c.lineWidth = Math.max(1, e.hw * 2 / ext * S);
        c.beginPath(); c.moveTo(px(A.x), pz(A.z)); c.lineTo(px(B.x), pz(B.z)); c.stroke();
      }
    }
  }

  /* strikes take roads out; the ribbon quads collapse so the gap is visible */
  function sever(x, z, r) {
    const out = [];
    for (const e of edges) {
      if (e.dead) continue;
      const A = nodes[e.a], B = nodes[e.b];
      if (Math.hypot((A.x + B.x) / 2 - x, (A.z + B.z) / 2 - z) > r) continue;
      e.dead = true; out.push(e.i);
    }
    if (out.length) for (const n of nodes) n.out = n.out.filter(i => !edges[i].dead);
    return { cut: out.length, edges: out };
  }

  return {
    version: 1, site, layout, rot, cos, sin, cx, cz, R, step, extent, driveLeft, empty,
    nodes, edges, arterials, CLASS, WIDTHS, LANE_W,
    posOnEdge, nextEdge, spawn, snap, nearestWalk, signalGreen,
    roadMask, walkMask, onRoad, clearOf,
    buildRibbon, paintTo, sever,
    stats: () => ({ nodes: nodes.length, edges: edges.length, arterials: arterials.length }),
  };
}

global.AegisRoadNet = { CLASS, WIDTHS, LANE_W, DRIVE_LEFT, build, blockStep };
})(window);
