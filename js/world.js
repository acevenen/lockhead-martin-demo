/* ============================================================================
   AEGIS OVERWATCH — world generator
   ----------------------------------------------------------------------------
   Turns an atlas entry (real lat/lon + a real 10x10 elevation grid + a styling
   record) into playable terrain, a city that matches how that place is actually
   laid out, and its water bodies.

   Vertical exaggeration is deliberate and reported in the HUD: raw relief would
   make Venice a flat sheet and Everest a wall. Relief is compressed into a
   readable band the way a real terrain-viz product does it.
   ============================================================================ */
(function (global) {
'use strict';

const MAP_W = 300, MAP_D = 200;          // demo units
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- deterministic noise (same seed => same city every visit) ---------- */
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123; return s - Math.floor(s); }
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function rngFrom(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function seedOf(site) {
  let h = 2166136261;
  for (let i = 0; i < site.id.length; i++) { h ^= site.id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/* ---------------------------------------------------------------------------
   TERRAIN — bilinear over the real elevation samples, plus fractal roughness
   scaled by how rugged the place actually is.
   --------------------------------------------------------------------------- */
function buildTerrain(site) {
  const N = site.elevN, g = site.elev;
  const relief = Math.max(1, site.elevMax - site.elevMin);
  /* The map is 300 units across 60 km, so true scale is 1 unit = 200 m. We keep
     that honest scale for terrain AND buildings — which is why Paris really does
     read flat and Dubai really does spike — and apply a single vertical
     exaggeration, reported in the HUD the way any terrain-viz product does.
     Exaggeration eases off in genuinely mountainous places so Everest still fits
     on the table, and rises on flat ones so Venice is not a blank sheet. */
  const M_PER_UNIT = 200;
  const exaggeration = clamp(5.0 * Math.pow(600 / Math.max(relief, 120), 0.35), 1.5, 9.0);
  const vScale = exaggeration / M_PER_UNIT;                // units per metre
  const targetRelief = relief * vScale;
  const rough = clamp(relief / 2200, 0.05, 1);             // rugged places get more detail

  function raw(u, v) {                                     // u,v in 0..1
    const fx = clamp(u, 0, 1) * (N - 1), fy = clamp(v, 0, 1) * (N - 1);
    const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fy));
    const tx = fx - i, ty = fy - j;
    const a = g[j * N + i], b = g[j * N + i + 1], c = g[(j + 1) * N + i], d = g[(j + 1) * N + i + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }

  const seaLevel = site.elevMin < 0 ? 0 : site.elevMin;

  function height(x, z) {
    const u = (x + MAP_W / 2) / MAP_W, v = (z + MAP_D / 2) / MAP_D;
    const metres = raw(u, v);
    let h = (metres - seaLevel) * vScale;
    /* fractal detail: ridged in the mountains, gentle on plains */
    const det = (fbm(x * 0.035 + 11, z * 0.035 + 7, 4) - 0.5) * targetRelief * 0.22 * rough
              + (fbm(x * 0.12 + 3, z * 0.12 + 5, 3) - 0.5) * targetRelief * 0.05;
    h += det;
    return h;
  }
  return {
    height, vScale, relief, targetRelief, seaLevel,
    exaggeration: Math.round(exaggeration * 10) / 10,
    metresAt(x, z) {
      const u = (x + MAP_W / 2) / MAP_W, v = (z + MAP_D / 2) / MAP_D;
      return Math.round(raw(u, v));
    },
  };
}

/* ---------------------------------------------------------------------------
   WATER — where the wet stuff goes depends on the real place.
   Returns { type, level, mask(x,z) } with mask 1 = fully submerged.
   --------------------------------------------------------------------------- */
function buildWater(site, terrain) {
  const t = site.water;
  const level = t === 'none' ? -999 : 0.06;
  const rnd = rngFrom(seedOf(site) + 91);
  const coastDir = rnd() * Math.PI * 2;
  const cd = { x: Math.cos(coastDir), z: Math.sin(coastDir) };
  const riverPhase = rnd() * 6.28;

  function riverX(z) { return -30 + z * 0.30 + 16 * Math.sin(z * 0.022 + riverPhase); }

  function mask(x, z) {
    if (t === 'none') return 0;
    if (t === 'river' || t === 'delta') {
      const w = t === 'delta' ? 7 : 3.2;
      let m = Math.max(0, 1 - Math.abs(x - riverX(z)) / w);
      if (t === 'delta') {
        const b = Math.max(0, 1 - Math.abs(x - riverX(z) + 34) / 4.5);
        m = Math.max(m, b);
      }
      return m;
    }
    if (t === 'lake') {
      const d = Math.hypot(x - 62, z + 34);
      return clamp((26 - d) / 12, 0, 1);
    }
    if (t === 'lagoon') {
      /* braided channels — Venice / Amsterdam read as water threading buildings */
      const a = Math.sin(x * 0.14) + Math.cos(z * 0.12);
      const chan = Math.max(0, 1 - Math.abs(a) / 0.30);
      const open = clamp((Math.hypot(x - 96, z - 62) - 40) / -18, 0, 1);
      return Math.max(chan * 0.85, open);
    }
    /* coast / harbour — a half-plane of sea with an irregular shoreline.
       The shoreline is held off the map centre so the built core is never
       half-drowned; the city sits on its land side the way real ports do. */
    const d = x * cd.x + z * cd.z;
    const wobble = (fbm(x * 0.02 + 21, z * 0.02 + 9, 3) - 0.5) * 26;
    const edge = 74 + wobble;
    let m = clamp((d - edge) / 14, 0, 1);
    if (t === 'harbour') {
      const inlet = Math.max(0, 1 - Math.abs(d - edge + 30) / 8) * clamp((60 - Math.abs(x * cd.z - z * cd.x)) / 30, 0, 1);
      m = Math.max(m, inlet);
    }
    return m;
  }
  return { type: t, level, mask, riverX, has: t !== 'none' };
}

/* ---------------------------------------------------------------------------
   CITY — layout archetypes. This is what makes Manhattan not look like Marrakesh.
   --------------------------------------------------------------------------- */
const CORE = { x: 0, z: 0 };

function cityRadius(site) {
  if (site.layout === 'none') return 0;
  return 34 + site.density * 26;
}

function buildCity(site, terrain, water, budget) {
  const out = [];
  if (site.layout === 'none' || site.density <= 0.02) return out;

  const MAX = budget || 430;
  const rnd = rngFrom(seedOf(site));
  const R = cityRadius(site);
  const rot = site.rot * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  /* real block size -> demo units (map is 60 km across 300 units => 200 m/unit).
     Street pitch is exaggerated to stay legible on the table. */
  const M_PER_UNIT = 200;
  const blockU = Math.max(1.6, site.block / M_PER_UNIT * 4.2);
  /* Buildings use a FIXED global metres-to-units scale, deliberately NOT the
     per-site terrain exaggeration. Tying them to terrain would inflate Paris
     (flat ground => high exaggeration) and flatten Hong Kong, inverting the very
     contrast we want. Fixed scale keeps every skyline true relative to every
     other: Paris 22 m stays a 0.5-unit carpet while the Burj is 18 units. */
  const BUILD_SCALE = 0.022;      // units per metre, global
  const mToU = BUILD_SCALE;
  const MAX_BUILD_U = 20;

  /* empirical negative-exponential height gradient:
        h(r) = hFloor + (hCore - hFloor) * exp(-r / L)     [metres, r in km]
     plus a lognormal spread and rare spikes. This is what makes Paris a flat
     cap, Hong Kong a wall, and Dubai a villa carpet with one needle. */
  const P = site.prof || { hFloor: 12, hCore: 70, L: 3, sigma: .5, pSpike: .006, spike: 5 };
  const KM_PER_UNIT = M_PER_UNIT / 1000;
  function heightMetres(x, z) {
    const rKm = Math.hypot(x - CORE.x, z - CORE.z) * KM_PER_UNIT;
    let m = P.hFloor + (P.hCore - P.hFloor) * Math.exp(-rKm / Math.max(0.05, P.L));
    /* lognormal-ish spread from two uniforms */
    const g1 = (rnd() + rnd() + rnd() - 1.5) * 1.2;
    m *= Math.exp(P.sigma * g1);
    if (rnd() < P.pSpike) m *= P.spike * (0.6 + rnd() * 0.7);
    return Math.min(m, site.peak * 1.05);
  }
  const roofs = site.roofs || [[0x8a8378, 1]];
  function pickRoof() {
    let r = rnd(), acc = 0;
    for (const [c, w] of roofs) { acc += w; if (r <= acc) return c; }
    return roofs[roofs.length - 1][0];
  }

  function inCore(x, z) { return Math.hypot(x - CORE.x, z - CORE.z) <= R; }
  /* Candidates are collected first and selected centre-outward at the end.
     Filling straight into a fixed budget would exhaust it in whichever map
     corner the grid loop happens to start from, leaving the core empty. */
  function place(x, z, w, d, boost, yaw) {
    if (water.mask(x, z) > 0.22) return;
    if (!inCore(x, z)) return;
    const base = terrain.height(x, z);
    if (base < -0.4) return;
    const metres = heightMetres(x, z) * (boost === undefined ? 1 : boost);
    const h = clamp(metres * mToU, 0.26, MAX_BUILD_U);
    out.push({ x, z, y: base - 0.05, w, d, h, hCur: h, yaw: yaw || 0, alive: true,
      metres: Math.round(metres), roof: pickRoof(),
      lit: rnd() < 0.55, floors: Math.max(1, Math.round(metres / 3.2)),
      _k: Math.hypot(x - CORE.x, z - CORE.z) * (0.65 + rnd() * 0.7) });
  }
  /* kept for the layout loops that still want a centre-weighted probability */
  function coreFalloff(x, z) {
    const d = Math.hypot(x - CORE.x, z - CORE.z) / R;
    return d > 1 ? 0 : 1 - d * 0.55;
  }

  const L = site.layout;

  if (L === 'grid' || L === 'colonial' || L === 'dense' || L === 'superblock') {
    const lots = L === 'dense' ? 3 : L === 'superblock' ? 5 : 2;
    /* Spacing is solved from the building budget so the fabric always fills the
       city radius. Fixed spacing made dense cities collapse into a tight knot
       once the budget cut in. Character comes from footprint size instead:
       dense = many small lots, superblock = few large ones. */
    const spread = 0.72 * R;
    const step = clamp(spread * Math.sqrt(Math.PI * lots * site.density / MAX),
      blockU * 0.55, blockU * 3.2);
    const lotFrac = L === 'dense' ? 0.30 : L === 'superblock' ? 0.55 : 0.36;
    const span = Math.ceil(R / step) + 1;
    for (let gi = -span; gi <= span; gi++) {
      for (let gj = -span; gj <= span; gj++) {
        const bx = gi * step, bz = gj * step;
        const x0 = CORE.x + bx * cos - bz * sin, z0 = CORE.z + bx * sin + bz * cos;
        const f = coreFalloff(x0, z0);
        if (f <= 0) continue;
        /* colonial cities keep a plaza at the centre */
        if (L === 'colonial' && Math.abs(gi) < 1 && Math.abs(gj) < 1) continue;
        for (let k = 0; k < lots; k++) {
          if (rnd() > site.density) continue;
          const jitter = L === 'dense' ? 0.5 : 0.22;
          const ox = (rnd() - 0.5) * step * jitter, oz = (rnd() - 0.5) * step * jitter;
          const lw = step * lotFrac * (0.7 + rnd() * 0.6);
          const ld = step * lotFrac * (0.7 + rnd() * 0.6);
          const px = x0 + ox * cos - oz * sin, pz = z0 + ox * sin + oz * cos;
          place(px, pz, lw, ld, 0.8 + rnd() * 0.45, rot);
        }
      }
    }
  } else if (L === 'radial') {
    /* concentric rings + boulevards: Paris, Moscow */
    const rings = Math.ceil(R / blockU);
    for (let ri = 1; ri <= rings; ri++) {
      const rad = ri * blockU;
      const count = Math.max(8, Math.round(2 * Math.PI * rad / blockU));
      for (let ai = 0; ai < count; ai++) {
        const a = (ai / count) * Math.PI * 2 + rot;
        if (ai % Math.max(3, Math.round(count / 12)) === 0) continue;   // boulevard gap
        if (rnd() > site.density) continue;
        const x = CORE.x + Math.cos(a) * rad, z = CORE.z + Math.sin(a) * rad;
        const f = coreFalloff(x, z);
        if (f <= 0) continue;
        place(x, z, blockU * 0.4 * (0.8 + rnd() * 0.5), blockU * 0.42 * (0.8 + rnd() * 0.5),
          0.85 + rnd() * 0.35, a + Math.PI / 2);
      }
    }
  } else if (L === 'canal') {
    /* dense low blocks that avoid the water channels entirely */
    const step = clamp(0.72 * R * Math.sqrt(Math.PI * site.density / MAX), blockU * 0.5, blockU * 3);
    const span = Math.ceil(R / step);
    for (let gi = -span; gi <= span; gi++) for (let gj = -span; gj <= span; gj++) {
      const x = gi * step + (rnd() - 0.5) * step * 0.35;
      const z = gj * step + (rnd() - 0.5) * step * 0.35;
      const f = coreFalloff(x, z);
      if (f <= 0 || rnd() > site.density) continue;
      if (water.mask(x, z) > 0.12) continue;
      place(x, z, step * 0.42 * (0.8 + rnd() * 0.5), step * 0.42 * (0.8 + rnd() * 0.5),
        0.8 + rnd() * 0.4, rnd() * 0.4);
    }
  } else {
    /* organic: clustered along wandering spines — medina, medieval core, favela */
    const spines = 7;
    for (let s = 0; s < spines; s++) {
      const a0 = rnd() * Math.PI * 2;
      let px = CORE.x + (rnd() - 0.5) * R * 0.4, pz = CORE.z + (rnd() - 0.5) * R * 0.4;
      let ang = a0;
      const steps = Math.round(R / Math.max(0.8, blockU * 0.55));
      for (let i = 0; i < steps; i++) {
        ang += (rnd() - 0.5) * 0.9;
        px += Math.cos(ang) * blockU * 0.62;
        pz += Math.sin(ang) * blockU * 0.62;
        const f = coreFalloff(px, pz);
        if (f <= 0) break;
        const n = 1 + Math.round(rnd() * 2 * site.density);
        for (let k = 0; k < n; k++) {
          const ox = (rnd() - 0.5) * blockU * 1.1, oz = (rnd() - 0.5) * blockU * 1.1;
          place(px + ox, pz + oz, blockU * 0.34 * (0.7 + rnd() * 0.7),
            blockU * 0.34 * (0.7 + rnd() * 0.7), 0.75 + rnd() * 0.5, rnd() * Math.PI);
        }
      }
    }
  }

  /* thin the field down to budget, keeping the core dense and the edge sparse */
  if (out.length > MAX) {
    out.sort((a, b) => a._k - b._k);
    out.length = MAX;
  }
  for (const b of out) delete b._k;

  /* signature towers: the handful of real supertalls that define a skyline.
     Without these a purely statistical field never produces the one needle that
     makes Dubai read as Dubai. */
  if (site.peak > 150 && out.length) {
    const spikes = P.spike >= 15 ? 2 : P.hCore >= 120 ? 6 : 4;
    for (let i = 0; i < spikes; i++) {
      const a = rnd() * Math.PI * 2, rad = rnd() * R * 0.30;
      const x = CORE.x + Math.cos(a) * rad, z = CORE.z + Math.sin(a) * rad;
      if (water.mask(x, z) > 0.2) continue;
      const metres = site.peak * (i === 0 ? 1 : 0.5 + rnd() * 0.4);
      const h = Math.min(metres * mToU, MAX_BUILD_U);
      out.push({ x, z, y: terrain.height(x, z) - 0.05, w: blockU * 0.26, d: blockU * 0.26,
        h, hCur: h, yaw: rot, alive: true, lit: true, tower: true,
        metres: Math.round(metres), roof: pickRoof(), floors: Math.round(metres / 3.6) });
    }
  }
  return out;
}

/* ---------- roads texture: matches the layout archetype ---------- */
function drawRoads(site, c, S) {
  const L = site.layout;
  const rnd = rngFrom(seedOf(site) + 5);
  c.strokeStyle = 'rgba(255,255,255,.6)';
  c.lineCap = 'butt';
  const cx = S / 2, cy = S / 2, R = S * 0.47;
  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, 7); c.clip();
  c.translate(cx, cy); c.rotate(site.rot * Math.PI / 180); c.translate(-cx, -cy);

  if (L === 'radial') {
    for (let i = 1; i <= 7; i++) {
      c.globalAlpha = i % 3 === 0 ? 0.75 : 0.32;
      c.lineWidth = i % 3 === 0 ? 3 : 1.4;
      c.beginPath(); c.arc(cx, cy, R * (i / 7.5), 0, 7); c.stroke();
    }
    c.globalAlpha = 0.8; c.lineWidth = 2.6;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      c.beginPath(); c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke();
    }
  } else if (L === 'organic') {
    c.lineWidth = 1.6; c.globalAlpha = 0.42;
    for (let s = 0; s < 34; s++) {
      let x = cx + (rnd() - 0.5) * R, y = cy + (rnd() - 0.5) * R, a = rnd() * 6.28;
      c.beginPath(); c.moveTo(x, y);
      for (let i = 0; i < 16; i++) {
        a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * S * 0.028; y += Math.sin(a) * S * 0.028;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  } else if (L === 'canal') {
    c.lineWidth = 1.4; c.globalAlpha = 0.34;
    for (let i = 0; i <= 26; i++) {
      const p = i * (S / 26);
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, S); c.stroke();
      c.beginPath(); c.moveTo(0, p); c.lineTo(S, p); c.stroke();
    }
  } else if (L === 'none') {
    /* trails only */
    c.lineWidth = 1.2; c.globalAlpha = 0.18;
    for (let s = 0; s < 5; s++) {
      let x = rnd() * S, y = rnd() * S, a = rnd() * 6.28;
      c.beginPath(); c.moveTo(x, y);
      for (let i = 0; i < 30; i++) { a += (rnd() - 0.5) * 0.6; x += Math.cos(a) * S * 0.03; y += Math.sin(a) * S * 0.03; c.lineTo(x, y); }
      c.stroke();
    }
  } else {
    const n = L === 'dense' ? 34 : L === 'superblock' ? 10 : 18;
    for (let i = 0; i <= n; i++) {
      const p = i * (S / n), major = i % 4 === 0;
      c.lineWidth = major ? 2.6 : 1; c.globalAlpha = major ? 0.8 : 0.3;
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, S); c.stroke();
      c.beginPath(); c.moveTo(0, p); c.lineTo(S, p); c.stroke();
    }
    if (L === 'colonial') {                       // central plaza
      c.globalAlpha = 0.9; c.lineWidth = 3;
      c.strokeRect(cx - S * 0.045, cy - S * 0.045, S * 0.09, S * 0.09);
    }
  }
  c.restore();
  const grd = c.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 1;
  c.fillStyle = grd; c.fillRect(0, 0, S, S);
  c.globalCompositeOperation = 'source-over';
}

global.AegisWorld = {
  MAP_W, MAP_D, buildTerrain, buildWater, buildCity, drawRoads,
  cityRadius, rngFrom, seedOf, fbm, clamp,
};
})(window);
