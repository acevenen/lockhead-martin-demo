/* ============================================================================
   AEGIS OVERWATCH — military model library
   ----------------------------------------------------------------------------
   PRACTICAL RULES THIS FILE OBEYS
   1. Everything is authored in REAL METRES and converted once by M. A soldier
      next to a Humvee next to an Abrams is therefore correct by construction,
      not by eye.
   2. Every model resolves to a small number of merged BufferGeometries with
      baked vertex colours, so a 60-unit battle is ~12 draw calls via
      InstancedMesh — not 600 objects.
   3. Anything that must animate independently (turret, gun barrel, rotor) is
      returned as its OWN geometry with a declared pivot, so the caller can
      instance and rotate it without rebuilding anything.
   ============================================================================ */
(function (global) {
'use strict';

const B = global.AegisModels;                 // mergeParts / mat / extrudeProfile
const { mergeParts, mat, extrudeProfile } = B;

/* units per metre. A 4.60 m sedan is 0.90 units long, so 1 m = 0.1957 u. */
const M = 0.1957;
const m = v => v * M;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s || 8);

/* military palette */
const C = {
  green:   0x4a5340,  greenDk: 0x38402f,
  sand:    0x9c8a63,  sandDk:  0x7d6e4e,
  track:   0x1e211f,  wheel:   0x17191a,
  steel:   0x6b7278,  glass:   0x2b4351,
  black:   0x121415,  rubber:  0x1a1c1d,
  olive:   0x545c3c,  optic:   0x8fd0e0,
  rotor:   0x24282a,  skin:    0xbf9a76,
};

/* ---------------------------------------------------------------------------
   Track unit: side skirt + road wheels + drive sprocket. Used by every tracked
   vehicle so they share a consistent running gear.
   --------------------------------------------------------------------------- */
function tracks(lenM, widthM, heightM, zOffM, wheelCount, color) {
  const parts = [];
  const L = m(lenM), W = m(widthM), H = m(heightM), Z = m(zOffM);
  for (const s of [-1, 1]) {
    /* skirt */
    parts.push({ geo: box(L, H * 0.72, W), matrix: mat([0, H * 0.60, s * Z]), color: color || C.track });
    /* track run, slightly proud of the skirt */
    parts.push({ geo: box(L * 1.01, H * 0.30, W * 1.12), matrix: mat([0, H * 0.22, s * Z]), color: C.track });
    const n = wheelCount || 7;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + L * (0.09 + 0.82 * (i / (n - 1)));
      parts.push({ geo: cyl(H * 0.30, H * 0.30, W * 1.16, 8),
        matrix: mat([x, H * 0.30, s * Z], [0, 0, Math.PI / 2]), color: C.wheel });
    }
    /* drive sprocket rear, idler front — slightly larger, reads as running gear */
    parts.push({ geo: cyl(H * 0.36, H * 0.36, W * 1.18, 8),
      matrix: mat([L * 0.46, H * 0.38, s * Z], [0, 0, Math.PI / 2]), color: C.steel });
  }
  return parts;
}

function roadWheels(positions, radiusM, widthM, color) {
  const parts = [];
  const r = m(radiusM), w = m(widthM);
  const tyre = cyl(r, r, w, 10), rim = cyl(r * 0.5, r * 0.5, w * 1.05, 6);
  for (const [xm, zm] of positions) {
    const mx = mat([m(xm), r, m(zm)], [0, 0, Math.PI / 2]);
    parts.push({ geo: tyre, matrix: mx, color: color || C.rubber });
    parts.push({ geo: rim, matrix: mx, color: C.steel });
  }
  return parts;
}

/* ---------------------------------------------------------------------------
   M1 ABRAMS — hull 7.93 m, 9.77 m gun-forward, 3.66 m wide, 2.44 m to turret roof.
   Returned as hull + turret so the turret can traverse independently.
   --------------------------------------------------------------------------- */
function buildAbrams() {
  const hullParts = tracks(7.6, 0.64, 0.95, 1.50, 7);
  /* lower hull + sharply sloped glacis, the Abrams' most readable feature */
  hullParts.push({ geo: extrudeProfile([
      [m(-3.95), m(0.55)], [m(-3.95), m(0.80)], [m(-1.60), m(1.28)],
      [m(3.20), m(1.30)], [m(3.95), m(1.15)], [m(3.95), m(0.55)],
    ], m(1.55), 0.06), color: C.green });
  /* fenders */
  for (const s of [-1, 1]) hullParts.push({ geo: box(m(7.4), m(0.10), m(0.42)),
    matrix: mat([0, m(1.30), s * m(1.72)]), color: C.greenDk });
  /* stowage bustle rack at the rear */
  hullParts.push({ geo: box(m(0.55), m(0.55), m(2.4)), matrix: mat([m(3.75), m(1.35), 0]), color: C.greenDk });

  /* turret: flat wedge, bustle to the rear, mantlet and 120 mm gun forward.
     Pivot is the turret ring, 0.55 m behind hull centre, 1.30 m up. */
  const tp = [0, m(1.30), 0];
  const turretParts = [];
  turretParts.push({ geo: extrudeProfile([
      [m(-2.35), 0], [m(-2.35), m(0.76)], [m(-0.30), m(0.98)],
      [m(1.55), m(0.98)], [m(2.05), m(0.72)], [m(2.05), 0],
    ], m(1.42), 0.22), matrix: mat([m(-0.20), 0, 0]), color: C.green });
  /* mantlet */
  turretParts.push({ geo: box(m(0.70), m(0.62), m(1.10)), matrix: mat([m(-2.55), m(0.50), 0]), color: C.greenDk });
  /* 120 mm smoothbore: 5.3 m of barrel, thermal sleeve then muzzle */
  turretParts.push({ geo: cyl(m(0.075), m(0.095), m(3.6), 10),
    matrix: mat([m(-4.55), m(0.50), 0], [0, 0, Math.PI / 2]), color: C.steel });
  turretParts.push({ geo: cyl(m(0.062), m(0.070), m(1.9), 10),
    matrix: mat([m(-7.10), m(0.50), 0], [0, 0, Math.PI / 2]), color: C.steel });
  /* commander's cupola + loader's hatch + coax MG */
  turretParts.push({ geo: cyl(m(0.42), m(0.44), m(0.34), 10), matrix: mat([m(0.35), m(1.12), m(0.55)]), color: C.greenDk });
  turretParts.push({ geo: cyl(m(0.34), m(0.34), m(0.22), 8), matrix: mat([m(0.20), m(1.06), m(-0.62)]), color: C.greenDk });
  turretParts.push({ geo: box(m(1.05), m(0.09), m(0.09)), matrix: mat([m(-0.25), m(1.34), m(0.55)]), color: C.black });
  /* independent thermal viewer */
  turretParts.push({ geo: box(m(0.34), m(0.30), m(0.30)), matrix: mat([m(-1.15), m(1.16), m(0.30)]), color: C.optic });

  return { hull: mergeParts(hullParts), turret: mergeParts(turretParts), turretPivot: tp,
    lengthM: 9.77, class: 'mbt' };
}

/* ---------------------------------------------------------------------------
   M2 BRADLEY IFV — 6.55 m x 3.6 m x 2.98 m. Small two-man turret offset to the
   left, TOW launcher box on the turret's right flank.
   --------------------------------------------------------------------------- */
function buildBradley() {
  const hullParts = tracks(6.3, 0.53, 0.86, 1.42, 6);
  hullParts.push({ geo: extrudeProfile([
      [m(-3.25), m(0.50)], [m(-3.25), m(0.86)], [m(-2.10), m(1.62)],
      [m(2.60), m(1.70)], [m(3.25), m(1.62)], [m(3.25), m(0.50)],
    ], m(1.48), 0.10), color: C.green });
  /* rear ramp line */
  hullParts.push({ geo: box(m(0.10), m(0.90), m(1.9)), matrix: mat([m(3.28), m(1.02), 0]), color: C.greenDk });
  /* firing-port / vision blocks down the flanks */
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++)
    hullParts.push({ geo: box(m(0.26), m(0.20), m(0.06)),
      matrix: mat([m(-0.4 + i * 1.1), m(1.34), s * m(1.50)]), color: C.glass });

  const tp = [m(-0.35), m(1.70), m(-0.30)];
  const turretParts = [];
  turretParts.push({ geo: box(m(1.85), m(0.78), m(1.35)), matrix: mat([0, m(0.39), 0]), color: C.green });
  turretParts.push({ geo: box(m(0.42), m(0.34), m(0.90)), matrix: mat([m(-1.05), m(0.42), 0]), color: C.greenDk });
  /* 25 mm chain gun */
  turretParts.push({ geo: cyl(m(0.045), m(0.055), m(2.15), 8),
    matrix: mat([m(-2.20), m(0.42), 0], [0, 0, Math.PI / 2]), color: C.steel });
  /* TOW twin launcher, the Bradley's signature box */
  turretParts.push({ geo: box(m(1.25), m(0.46), m(0.42)), matrix: mat([m(0.10), m(0.62), m(0.92)]), color: C.greenDk });
  turretParts.push({ geo: box(m(0.30), m(0.28), m(0.24)), matrix: mat([m(-0.72), m(0.72), m(-0.55)]), color: C.optic });
  return { hull: mergeParts(hullParts), turret: mergeParts(turretParts), turretPivot: tp,
    lengthM: 6.55, class: 'ifv' };
}

/* ---------------------------------------------------------------------------
   M109 PALADIN SPH — massive boxy turret, very long 155 mm barrel with a
   muzzle brake. Reads instantly as artillery because of barrel length.
   --------------------------------------------------------------------------- */
function buildPaladin() {
  const hullParts = tracks(6.1, 0.58, 0.92, 1.44, 7);
  hullParts.push({ geo: extrudeProfile([
      [m(-3.15), m(0.52)], [m(-3.15), m(1.05)], [m(-2.0), m(1.45)],
      [m(2.9), m(1.45)], [m(3.15), m(1.25)], [m(3.15), m(0.52)],
    ], m(1.52), 0.06), color: C.green });

  const tp = [m(0.30), m(1.45), 0];
  const t = [];
  t.push({ geo: box(m(3.7), m(1.35), m(2.7)), matrix: mat([0, m(0.68), 0]), color: C.green });
  t.push({ geo: box(m(0.9), m(0.75), m(2.2)), matrix: mat([m(2.15), m(0.60), 0]), color: C.greenDk });
  /* 155 mm: 6.0 m tube + pepperpot muzzle brake */
  t.push({ geo: cyl(m(0.085), m(0.105), m(5.2), 10),
    matrix: mat([m(-4.35), m(0.95), 0], [0, 0, Math.PI / 2]), color: C.steel });
  t.push({ geo: cyl(m(0.16), m(0.16), m(0.6), 8),
    matrix: mat([m(-7.20), m(0.95), 0], [0, 0, Math.PI / 2]), color: C.black });
  t.push({ geo: cyl(m(0.38), m(0.40), m(0.30), 10), matrix: mat([m(0.60), m(1.42), m(0.65)]), color: C.greenDk });
  return { hull: mergeParts(hullParts), turret: mergeParts(t), turretPivot: tp,
    lengthM: 9.7, class: 'artillery' };
}

/* ---------------------------------------------------------------------------
   M1126 STRYKER — 8x8, 6.95 x 2.72 x 2.64 m. Slab-sided hull, slat armour,
   remote weapon station on the roof.
   --------------------------------------------------------------------------- */
function buildStryker() {
  const parts = roadWheels(
    [[-2.55, -1.20], [-2.55, 1.20], [-1.25, -1.20], [-1.25, 1.20],
     [1.15, -1.20], [1.15, 1.20], [2.45, -1.20], [2.45, 1.20]], 0.55, 0.34);
  parts.push({ geo: extrudeProfile([
      [m(-3.45), m(0.62)], [m(-3.30), m(1.35)], [m(-1.60), m(1.95)],
      [m(2.55), m(2.05)], [m(3.45), m(1.95)], [m(3.45), m(0.62)],
    ], m(1.30), 0.16), color: C.sand });
  /* slat armour cage — the Stryker tell */
  for (const s of [-1, 1]) parts.push({ geo: box(m(6.2), m(1.0), m(0.06)),
    matrix: mat([0, m(1.35), s * m(1.55)]), color: C.steel });
  parts.push({ geo: box(m(0.08), m(1.0), m(2.6)), matrix: mat([m(3.62), m(1.35), 0]), color: C.steel });
  /* windscreen + RWS */
  parts.push({ geo: box(m(0.10), m(0.44), m(1.5)), matrix: mat([m(-3.22), m(1.62), 0]), color: C.glass });
  parts.push({ geo: box(m(0.75), m(0.42), m(0.62)), matrix: mat([m(0.20), m(2.28), 0]), color: C.sandDk });
  parts.push({ geo: cyl(m(0.045), m(0.05), m(1.0), 6),
    matrix: mat([m(-0.55), m(2.36), 0], [0, 0, Math.PI / 2]), color: C.black });
  return { hull: mergeParts(parts), turret: null, lengthM: 6.95, class: 'apc' };
}

/* ---------------------------------------------------------------------------
   HMMWV — 4.6 x 2.16 x 1.83 m. Wide stance, sloped hood, boxy cab, low bed.
   --------------------------------------------------------------------------- */
function buildHumvee() {
  const parts = roadWheels([[-1.65, -0.95], [-1.65, 0.95], [1.65, -0.95], [1.65, 0.95]], 0.47, 0.30);
  parts.push({ geo: extrudeProfile([
      [m(-2.30), m(0.42)], [m(-2.30), m(0.92)], [m(-1.55), m(1.10)],
      [m(-0.85), m(1.18)], [m(-0.60), m(1.78)], [m(0.75), m(1.80)],
      [m(0.90), m(1.20)], [m(2.30), m(1.16)], [m(2.30), m(0.42)],
    ], m(1.05), 0.12), color: C.sand });
  parts.push({ geo: box(m(0.10), m(0.42), m(1.55)), matrix: mat([m(-0.66), m(1.50), 0]), color: C.glass });
  for (const s of [-1, 1]) parts.push({ geo: box(m(1.2), m(0.38), m(0.06)),
    matrix: mat([m(0.15), m(1.48), s * m(1.02)]), color: C.glass });
  /* roof turret ring + M2 */
  parts.push({ geo: cyl(m(0.36), m(0.38), m(0.20), 10), matrix: mat([m(0.15), m(1.90), 0]), color: C.sandDk });
  parts.push({ geo: box(m(1.15), m(0.10), m(0.10)), matrix: mat([m(-0.25), m(2.06), 0]), color: C.black });
  return { hull: mergeParts(parts), turret: null, lengthM: 4.6, class: 'light' };
}

/* ---------------------------------------------------------------------------
   M142 HIMARS — 7 m 6x6 chassis, armoured cab forward, single six-pack launcher
   pod on a trainable/elevating cradle at the rear.
   --------------------------------------------------------------------------- */
function buildHimars() {
  const parts = roadWheels(
    [[-2.45, -1.05], [-2.45, 1.05], [1.55, -1.05], [1.55, 1.05], [2.65, -1.05], [2.65, 1.05]], 0.58, 0.36);
  parts.push({ geo: box(m(7.0), m(0.42), m(2.1)), matrix: mat([0, m(1.05), 0]), color: C.green });
  /* armoured cab */
  parts.push({ geo: extrudeProfile([
      [m(-3.55), m(1.10)], [m(-3.55), m(2.05)], [m(-3.05), m(2.55)],
      [m(-1.35), m(2.60)], [m(-1.35), m(1.10)],
    ], m(1.05), 0.08), color: C.green });
  parts.push({ geo: box(m(0.10), m(0.46), m(1.55)), matrix: mat([m(-3.36), m(2.22), 0]), color: C.glass });
  /* launcher pod: six 227 mm tubes in a 2x3 box */
  const podParts = [];
  podParts.push({ geo: box(m(3.1), m(1.30), m(1.55)), matrix: mat([0, 0, 0]), color: C.greenDk });
  for (let r = 0; r < 2; r++) for (let cI = 0; cI < 3; cI++)
    podParts.push({ geo: cyl(m(0.115), m(0.115), m(3.16), 8),
      matrix: mat([0, m(-0.32 + r * 0.64), m(-0.48 + cI * 0.48)], [0, 0, Math.PI / 2]), color: C.black });
  return { hull: mergeParts(parts), turret: mergeParts(podParts),
    turretPivot: [m(1.95), m(1.95), 0], lengthM: 7.0, class: 'mlrs' };
}

/* ---------------------------------------------------------------------------
   AH-64 APACHE — 15.06 m fuselage, 14.63 m rotor. Tandem stepped cockpit,
   chin turret, stub wings with pylons, tailwheel gear.
   Rotor returned separately so it can spin.
   --------------------------------------------------------------------------- */
function buildApache() {
  const p = [];
  /* slender fuselage */
  p.push({ geo: extrudeProfile([
      [m(-6.10), m(1.35)], [m(-5.60), m(1.75)], [m(-3.60), m(2.05)],
      [m(-2.20), m(2.45)], [m(1.10), m(2.35)], [m(4.60), m(1.85)],
      [m(6.60), m(1.72)], [m(6.60), m(1.30)], [m(2.60), m(1.05)],
      [m(-4.90), m(1.00)],
    ], m(0.62), 0.20), color: C.greenDk });
  /* tandem canopies, gunner low and forward, pilot stepped up behind */
  p.push({ geo: box(m(1.5), m(0.55), m(0.95)), matrix: mat([m(-4.20), m(1.95), 0]), color: C.glass });
  p.push({ geo: box(m(1.5), m(0.60), m(1.00)), matrix: mat([m(-2.55), m(2.42), 0]), color: C.glass });
  /* 30 mm chain gun in a chin turret */
  p.push({ geo: cyl(m(0.22), m(0.24), m(0.40), 8), matrix: mat([m(-4.15), m(1.00), 0]), color: C.black });
  p.push({ geo: cyl(m(0.05), m(0.055), m(1.5), 6),
    matrix: mat([m(-4.85), m(0.86), 0], [0, 0, Math.PI / 2.1]), color: C.black });
  /* mast-mounted sight */
  p.push({ geo: cyl(m(0.30), m(0.30), m(0.34), 8), matrix: mat([m(-5.35), m(2.05), 0]), color: C.optic });
  /* stub wings + pylons + rocket pods */
  p.push({ geo: box(m(1.1), m(0.16), m(5.4)), matrix: mat([m(-1.20), m(1.95), 0]), color: C.greenDk });
  for (const s of [-1, 1]) {
    p.push({ geo: cyl(m(0.30), m(0.30), m(1.9), 8),
      matrix: mat([m(-1.30), m(1.62), s * m(1.55)], [0, 0, Math.PI / 2]), color: C.black });
    p.push({ geo: box(m(0.9), m(0.30), m(0.55)), matrix: mat([m(-1.25), m(1.62), s * m(2.40)]), color: C.greenDk });
  }
  /* tail boom, vertical fin, stabilator, tail rotor */
  p.push({ geo: box(m(0.30), m(1.85), m(0.22)), matrix: mat([m(6.05), m(2.45), 0]), color: C.greenDk });
  p.push({ geo: box(m(0.85), m(0.12), m(3.3)), matrix: mat([m(6.35), m(3.05), 0]), color: C.greenDk });
  for (let i = 0; i < 4; i++)
    p.push({ geo: box(m(0.10), m(1.55), m(0.05)),
      matrix: mat([m(6.30), m(3.05), m(0.22)], [0, 0, i * Math.PI / 4]), color: C.rotor });
  /* main rotor head + gear */
  p.push({ geo: cyl(m(0.22), m(0.26), m(0.55), 8), matrix: mat([m(-1.10), m(2.75), 0]), color: C.steel });
  for (const s of [-1, 1]) p.push({ geo: cyl(m(0.26), m(0.26), m(0.16), 8),
    matrix: mat([m(-2.30), m(0.30), s * m(1.05)], [0, 0, Math.PI / 2]), color: C.rubber });
  p.push({ geo: cyl(m(0.20), m(0.20), m(0.14), 8), matrix: mat([m(5.60), m(0.28), 0], [0, 0, Math.PI / 2]), color: C.rubber });

  /* four-blade main rotor, pivot at the head */
  const rot = [];
  for (let i = 0; i < 4; i++)
    rot.push({ geo: box(m(7.30), m(0.07), m(0.55)), matrix: mat([0, 0, 0], [0, i * Math.PI / 2, 0]), color: C.rotor });
  return { hull: mergeParts(p), rotor: mergeParts(rot), rotorPivot: [m(-1.10), m(3.02), 0],
    lengthM: 15.06, class: 'attack-helo' };
}

/* ---------------------------------------------------------------------------
   INFANTRY — 1.8 m with kit. What separates a soldier from a civilian at range
   is bulk (plate carrier + ruck), the helmet dome, and the weapon line.
   Poses: standing / kneeling / prone.
   --------------------------------------------------------------------------- */
function rifle(matrix, color) {
  const g = mergeParts([
    { geo: box(m(0.84), m(0.055), m(0.045)), color: color || C.black },          // receiver + barrel
    { geo: box(m(0.22), m(0.10), m(0.04)), matrix: mat([m(0.30), m(-0.06), 0]), color: color || C.black }, // magazine
    { geo: box(m(0.20), m(0.07), m(0.05)), matrix: mat([m(0.42), m(0.02), 0]), color: 0x2a2d2e },          // stock
    { geo: box(m(0.16), m(0.05), m(0.04)), matrix: mat([m(-0.10), m(0.06), 0]), color: 0x35393a },         // optic
  ]);
  return { geo: g, matrix };
}

function buildSoldier(pose, faction) {
  const kit = faction === 'op' ? 0x4b4638 : C.olive;
  const skin = C.skin;
  const P = [];
  const standing = pose !== 'kneel' && pose !== 'prone';

  if (pose === 'prone') {
    /* flat, long silhouette — the whole point of going prone */
    P.push({ geo: box(m(0.95), m(0.26), m(0.46)), matrix: mat([0, m(0.16), 0]), color: kit });
    P.push({ geo: box(m(0.40), m(0.20), m(0.40)), matrix: mat([m(0.10), m(0.30), 0]), color: kit });
    P.push({ geo: new THREE.SphereGeometry(m(0.115), 7, 5), matrix: mat([m(-0.62), m(0.20), 0]), color: skin });
    P.push({ geo: new THREE.SphereGeometry(m(0.135), 7, 5, 0, 6.29, 0, 1.7), matrix: mat([m(-0.62), m(0.22), 0]), color: kit });
    for (const s of [-1, 1]) P.push({ geo: cyl(m(0.055), m(0.05), m(0.80), 5),
      matrix: mat([m(0.72), m(0.10), s * m(0.14)], [0, 0, Math.PI / 2]), color: kit });
    P.push(rifle(mat([m(-0.90), m(0.24), m(0.10)]), C.black));
    return mergeParts(P);
  }

  const hip = standing ? 0.95 : 0.62;
  const head = standing ? 1.66 : 1.28;
  /* legs */
  for (const s of [-1, 1]) {
    if (standing) {
      P.push({ geo: cyl(m(0.085), m(0.070), m(0.92), 6), matrix: mat([0, m(0.47), s * m(0.11)]), color: kit });
    } else {
      /* kneeling: one leg folded forward, one knee down */
      const fwd = s > 0;
      P.push({ geo: cyl(m(0.085), m(0.075), m(0.52), 6),
        matrix: mat([fwd ? m(0.16) : m(-0.12), m(0.30), s * m(0.13)], [fwd ? 0.5 : -0.9, 0, 0]), color: kit });
      P.push({ geo: cyl(m(0.075), m(0.065), m(0.46), 6),
        matrix: mat([fwd ? m(0.34) : m(-0.28), m(0.14), s * m(0.13)], [fwd ? -1.1 : 0.2, 0, 0]), color: kit });
    }
    P.push({ geo: box(m(0.26), m(0.09), m(0.12)),
      matrix: mat([standing ? m(0.03) : m(0.30), m(0.045), s * m(0.12)]), color: C.black });
  }
  /* torso with plate-carrier bulk — this is what reads as "kitted" */
  P.push({ geo: cyl(m(0.20), m(0.17), m(0.52), 7), matrix: mat([0, m(hip + 0.26), 0]), color: kit });
  P.push({ geo: box(m(0.26), m(0.46), m(0.46)), matrix: mat([m(-0.02), m(hip + 0.28), 0]), color: faction === 'op' ? 0x3c382c : 0x3f4630 });
  /* rucksack */
  P.push({ geo: box(m(0.24), m(0.44), m(0.38)), matrix: mat([m(0.22), m(hip + 0.30), 0]), color: faction === 'op' ? 0x4a4535 : 0x454c34 });
  /* head + helmet */
  P.push({ geo: new THREE.SphereGeometry(m(0.105), 7, 5), matrix: mat([0, m(head - 0.06), 0]), color: skin });
  P.push({ geo: new THREE.SphereGeometry(m(0.135), 8, 6, 0, 6.29, 0, 1.75), matrix: mat([0, m(head - 0.04), 0]), color: kit });
  /* arms brought up onto the weapon */
  for (const s of [-1, 1]) P.push({ geo: cyl(m(0.055), m(0.05), m(0.44), 5),
    matrix: mat([m(-0.12), m(hip + 0.34), s * m(0.22)], [0, 0, 0.55]), color: kit });
  P.push(rifle(mat([m(-0.30), m(hip + 0.30), m(0.16)], [0, 0, standing ? 0 : -0.12]), C.black));
  return mergeParts(P);
}

/* ---------------------------------------------------------------------------
   BUILDINGS — a real house instead of a box: pitched roof, door, window bays,
   chimney. Three residential styles + a shopfront block, all authored in metres.
   --------------------------------------------------------------------------- */
function windowRow(wM, hM, yM, zM, n, spanM, color) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({ geo: box(m(wM), m(hM), m(0.06)),
      matrix: mat([m(-spanM / 2 + spanM * t), m(yM), m(zM)]), color: color || C.glass });
  }
  return out;
}

/* two pitched planes + two gable triangles, sized in metres */
function gableRoof(wM, dM, riseM) {
  const w = m(wM) / 2, d = m(dM) / 2, r = m(riseM);
  const V = [], N = [];
  const tri = (a, b, c) => {
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx/=l; ny/=l; nz/=l;
    V.push(...a, ...b, ...c); N.push(nx,ny,nz, nx,ny,nz, nx,ny,nz);
  };
  /* ridge runs along X */
  const RA = [-w, r, 0], RB = [w, r, 0];
  const FL = [-w, 0, d], FR = [w, 0, d], BL = [-w, 0, -d], BR = [w, 0, -d];
  tri(FL, FR, RB); tri(FL, RB, RA);          // front pitch
  tri(BR, BL, RA); tri(BR, RA, RB);          // back pitch
  tri(FL, RA, BL);                            // left gable
  tri(FR, BR, RB);                            // right gable
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
  return g;
}

function buildHouse(style) {
  const wallC = style === 'adobe' ? 0xbf8b5e : style === 'brick' ? 0x8f5b46 : 0xd8cdb8;
  const roofC = style === 'adobe' ? 0xa8552f : style === 'brick' ? 0x4a4e52 : 0x6e7377;
  const P = [];
  const W = 9, D = 7.5, H = 5.4;                        // metres
  P.push({ geo: box(m(W), m(H), m(D)), matrix: mat([0, m(H / 2), 0]), color: wallC });
  if (style === 'adobe') {
    /* flat terrace roof with a parapet — no pitch in a medina or a desert town */
    P.push({ geo: box(m(W + 0.4), m(0.5), m(D + 0.4)), matrix: mat([0, m(H + 0.2), 0]), color: roofC });
  } else {
    /* Gable roof built explicitly: two pitched planes meeting at a ridge, with
       triangular gable ends. The cylinder-as-prism shortcut produced a sail
       that overhung the walls, so this is authored from real vertices. */
    const rise = 2.3, over = 0.45;                     // ridge height, eave overhang
    P.push({ geo: gableRoof(W + over * 2, D + over * 2, rise),
      matrix: mat([0, m(H), 0]), color: roofC });
    P.push({ geo: box(m(0.8), m(2.4), m(0.8)), matrix: mat([m(W * 0.26), m(H + 1.5), m(D * 0.18)]), color: roofC });
  }
  /* door — front face, and a step */
  P.push({ geo: box(m(1.1), m(2.2), m(0.10)), matrix: mat([m(-W * 0.18), m(1.1), m(D / 2)]), color: 0x4a3524 });
  P.push({ geo: box(m(0.12), m(0.12), m(0.10)), matrix: mat([m(-W * 0.18 + 0.38), m(1.05), m(D / 2 + 0.06)]), color: 0xc8b070 });
  P.push({ geo: box(m(1.6), m(0.12), m(0.7)), matrix: mat([m(-W * 0.18), m(0.06), m(D / 2 + 0.35)]), color: 0x9a9188 });
  /* window bays front, back and both flanks */
  P.push(...windowRow(1.2, 1.3, 1.5, D / 2 + 0.02, 2, W * 0.52));
  P.push(...windowRow(1.2, 1.3, 3.7, D / 2 + 0.02, 3, W * 0.66));
  P.push(...windowRow(1.2, 1.3, 3.7, -D / 2 - 0.02, 3, W * 0.66));
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++)
    P.push({ geo: box(m(0.06), m(1.3), m(1.2)),
      matrix: mat([s * m(W / 2 + 0.02), m(1.5 + i * 2.2), m(-1.4 + i * 2.8)]), color: C.glass });
  return mergeParts(P);
}

global.AegisMil = {
  M, m, C,
  buildAbrams, buildBradley, buildPaladin, buildStryker, buildHumvee, buildHimars, buildApache,
  buildSoldier, buildHouse, gableRoof,
  VEHICLES: {
    abrams: buildAbrams, bradley: buildBradley, paladin: buildPaladin,
    stryker: buildStryker, humvee: buildHumvee, himars: buildHimars,
  },
};
})(window);
