/* ============================================================================
   AEGIS OVERWATCH — battle simulation
   ----------------------------------------------------------------------------
   PRACTICAL DESIGN NOTES
   * Fixed-timestep deterministic tick. Rendering interpolates; the sim does not
     care about frame rate, so a slow device runs the same battle as a fast one.
   * Every unit type is ONE InstancedMesh pair (hull + turret) per faction, so
     a 48-unit engagement is roughly a dozen draw calls.
   * Projectiles, tracers and muzzle flashes are fixed-size pools. Nothing in
     the hot loop allocates.
   * Ranges, rates of fire and penetration are modelled on real engagement
     bands, scaled by the map's 200 m-per-unit ratio. Direct-fire weapons
     genuinely cannot reach across the map, which is why units have to close.
   ============================================================================ */
(function (global) {
'use strict';

const M_PER_UNIT = 200;
const u = metres => metres / M_PER_UNIT;      // real metres -> world units

/* TIME COMPRESSION — an honest fudge, called out rather than hidden.
   Real armour closes at ~6 m/s. Across a 60 km theater that is a 14-minute
   approach march, which nobody is going to stand and watch. Manoeuvre runs at
   MOVE_SCALE x real speed so an engagement resolves in about a minute, while
   rates of fire stay at their real values so the volume of fire still looks
   right. Ranges are NOT compressed — a rifle genuinely cannot reach a tank
   across the map, which is what forces the advance. */
const MOVE_SCALE = 30;

/* ---------------------------------------------------------------------------
   WEAPON TABLE — effective ranges and rates from real systems.
   dmg is per hit against a nominal 100-hp target.
   --------------------------------------------------------------------------- */
/* Ranges are the published effective bands. `burst` is the doctrinal burst
   length and `bgap` the interval inside a burst — belt-fed weapons fire 6-9
   rounds and pause, they do NOT stream continuously, and rifles are
   predominantly aimed semi-auto. Getting this rhythm right is the single
   biggest realism win in the whole model. */
const WEAPONS = {
  rifle:      { range: u(500),  rof: 1.2,  dmg: 7,  spread: 0.10, tracer: 0.9,  vsArmour: 0.12, name: 'SMALL ARMS', burst: 1 },
  /* M107 .50 anti-materiel: 1800 m against personnel, one deliberate shot at a
     time. It will not kill a tank, but it ends a soft-skin crew's day. */
  dmr:        { range: u(1800), rof: 4.6,  dmg: 34, spread: 0.012, tracer: 0.5, vsArmour: 0.30, name: 'M107 .50', burst: 1 },
  mg:         { range: u(1100), rof: 2.6,  dmg: 5,  spread: 0.08, tracer: 1.6,  vsArmour: 0.20, name: 'M240',  burst: 7, bgap: 0.09 },
  autocannon: { range: u(3000), rof: 2.2,  dmg: 12, spread: 0.05, tracer: 2.6,  vsArmour: 0.65, name: '25MM',  burst: 4, bgap: 0.30 },
  maingun:    { range: u(3500), rof: 7.5,  dmg: 78, spread: 0.02, tracer: 4.2,  vsArmour: 1.00, name: '120MM', burst: 1 },
  atgm:       { range: u(3750), rof: 9.0,  dmg: 88, spread: 0.01, tracer: 1.1,  vsArmour: 1.00, name: 'TOW',   burst: 1 },
  hellfire:   { range: u(8000), rof: 4.0,  dmg: 82, spread: 0.02, tracer: 2.0,  vsArmour: 1.00, name: 'HELLFIRE', burst: 1 },
  howitzer:   { range: u(21000),rof: 11.0, dmg: 62, spread: 0.9,  tracer: 0,    vsArmour: 0.55, name: '155MM', indirect: true, burst: 1 },
  rocket:     { range: u(32000),rof: 14.0, dmg: 55, spread: 1.5,  tracer: 0,    vsArmour: 0.45, name: 'GMLRS', indirect: true, salvo: 6, burst: 1 },
};

/* unit classes: hp, armour (0..1 damage reduction vs non-AP), speed m/s */
const UNITS = {
  mbt:       { model: 'abrams',  hp: 240, armour: 0.78, speed: 6.2, weapon: 'maingun',    second: 'mg',    scale: 1, label: 'MBT',   eye: 2.9, seat: 'TANK COMMANDER' },
  ifv:       { model: 'bradley', hp: 150, armour: 0.52, speed: 6.6, weapon: 'autocannon', second: 'atgm',  scale: 1, label: 'IFV',   eye: 3.1, seat: 'IFV GUNNER' },
  apc:       { model: 'stryker', hp: 110, armour: 0.38, speed: 8.0, weapon: 'mg',                          scale: 1, label: 'APC',   eye: 2.8, seat: 'VEHICLE CDR' },
  light:     { model: 'humvee',  hp: 60,  armour: 0.16, speed: 9.5, weapon: 'mg',                          scale: 1, label: 'LT VEH', eye: 2.1, seat: 'GUNNER' },
  artillery: { model: 'paladin', hp: 130, armour: 0.40, speed: 3.4, weapon: 'howitzer',                    scale: 1, label: 'SPH',   eye: 3.2, seat: 'GUN CHIEF' },
  mlrs:      { model: 'himars',  hp: 90,  armour: 0.22, speed: 7.6, weapon: 'rocket',                      scale: 1, label: 'MLRS',  eye: 2.9, seat: 'LAUNCHER CREW' },
  infantry:  { model: 'soldier', hp: 42,  armour: 0.06, speed: 1.6, weapon: 'rifle',      second: 'atgm',  scale: 1, label: 'INF',   eye: 1.68, seat: 'RIFLEMAN' },
  /* a sniper team occupies a hide and stays in it — `hold` keeps them off the
     advance so the POV from that seat is overwatch, not a foot chase */
  sniper:    { model: 'soldier', pose: 'prone', hp: 34, armour: 0.04, speed: 0.9, weapon: 'dmr', scale: 1, label: 'SNIPER', eye: 0.5, seat: 'SNIPER', hold: true },
  helo:      { model: 'apache',  hp: 120, armour: 0.30, speed: 22,  weapon: 'hellfire',   second: 'autocannon', scale: 1, label: 'ATK HELO', air: true, eye: 2.3, seat: 'PILOT' },
};

/* `tint` MULTIPLIES the model's baked vertex colours, so it has to be a light
   wash. A dark-green tint over already-dark-green camo renders the whole fleet
   near-black — the tint brightens and biases warm/cool instead. */
const FACTIONS = {
  blu: { name: 'BLUFOR', color: 0x5fb8ff, tracer: 0x9fe4ff, tint: 0xc4d8e8, ring: 0x5fb8ff },
  op:  { name: 'OPFOR',  color: 0xff6b5a, tracer: 0xffb060, tint: 0xe8c4a8, ring: 0xff6b5a },
};

function create(ctx) {
  const { scene, sampleH, log, onImpact, models, mil } = ctx;
  const THREE_ = THREE;

  /* ---------------- instanced render fleets ---------------- */
  const CAP = { mbt: 8, ifv: 8, apc: 6, light: 6, artillery: 4, mlrs: 4, infantry: 40, sniper: 6, helo: 4 };
  const fleets = {};                    // fleets[type][faction] = {hull,turret,pivot,n}
  const geoCache = {};

  function geoFor(type) {
    if (geoCache[type]) return geoCache[type];
    const spec = UNITS[type];
    let g;
    if (spec.model === 'soldier') g = { hull: mil.buildSoldier(spec.pose || 'stand', 'blu'), turret: null };
    else if (spec.model === 'apache') { const a = mil.buildApache(); g = { hull: a.hull, turret: a.rotor, pivot: a.rotorPivot, spin: true }; }
    else { const v = mil.VEHICLES[spec.model](); g = { hull: v.hull, turret: v.turret, pivot: v.turretPivot }; }
    geoCache[type] = g;
    return g;
  }

  function ensureFleet(type, faction) {
    if (!fleets[type]) fleets[type] = {};
    if (fleets[type][faction]) return fleets[type][faction];
    const g = geoFor(type), cap = CAP[type] || 8;
    const mkMat = () => new THREE_.MeshLambertMaterial({ vertexColors: true });
    const hull = new THREE_.InstancedMesh(g.hull, mkMat(), cap);
    hull.frustumCulled = false; hull.count = 0;
    hull.instanceMatrix.setUsage(THREE_.DynamicDrawUsage);
    scene.add(hull);
    let turret = null;
    if (g.turret) {
      turret = new THREE_.InstancedMesh(g.turret, mkMat(), cap);
      turret.frustumCulled = false; turret.count = 0;
      turret.instanceMatrix.setUsage(THREE_.DynamicDrawUsage);
      scene.add(turret);
    }
    /* faction tint via instance colour, applied once */
    const c = new THREE_.Color(FACTIONS[faction].tint);
    for (let i = 0; i < cap; i++) { hull.setColorAt(i, c); if (turret) turret.setColorAt(i, c); }
    if (hull.instanceColor) hull.instanceColor.needsUpdate = true;
    if (turret && turret.instanceColor) turret.instanceColor.needsUpdate = true;
    const f = { hull, turret, pivot: g.pivot || [0, 0, 0], spin: !!g.spin, cap, list: [] };
    fleets[type][faction] = f;
    return f;
  }

  /* ---------------- faction ID rings ---------------- */
  const RING_CAP = 60;
  const ringGeo = new THREE_.RingGeometry(0.62, 0.80, 20);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = {};
  for (const fac of ['blu', 'op']) {
    const mesh = new THREE_.InstancedMesh(ringGeo,
      new THREE_.MeshBasicMaterial({ color: FACTIONS[fac].ring, transparent: true, opacity: 0.72,
        side: THREE_.DoubleSide, depthWrite: false, blending: THREE_.AdditiveBlending }), RING_CAP);
    mesh.frustumCulled = false; mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE_.DynamicDrawUsage);
    scene.add(mesh);
    rings[fac] = mesh;
  }

  /* ---------------- projectile / tracer pools ---------------- */
  const PROJ_N = 160;
  const projGeo = new THREE_.BufferGeometry();
  const projPos = new Float32Array(PROJ_N * 2 * 3);       // line segments
  const projCol = new Float32Array(PROJ_N * 2 * 3);
  projGeo.setAttribute('position', new THREE_.BufferAttribute(projPos, 3));
  projGeo.setAttribute('color', new THREE_.BufferAttribute(projCol, 3));
  const projLines = new THREE_.LineSegments(projGeo, new THREE_.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.95, blending: THREE_.AdditiveBlending, depthWrite: false }));
  projLines.frustumCulled = false;
  scene.add(projLines);

  const projectiles = [];
  for (let i = 0; i < PROJ_N; i++) projectiles.push({ live: false });
  let projCursor = 0;

  const FLASH_N = 40;
  const flashes = [];
  {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const c2 = cv.getContext('2d');
    const gr = c2.createRadialGradient(16, 16, 1, 16, 16, 15);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,200,90,0.9)');
    gr.addColorStop(1, 'rgba(255,120,0,0)');
    c2.fillStyle = gr; c2.fillRect(0, 0, 32, 32);
    const tex = new THREE_.CanvasTexture(cv);
    for (let i = 0; i < FLASH_N; i++) {
      const s = new THREE_.Sprite(new THREE_.SpriteMaterial({ map: tex, transparent: true,
        blending: THREE_.AdditiveBlending, depthWrite: false, opacity: 0 }));
      s.scale.setScalar(0.6); s.visible = false;
      scene.add(s);
      flashes.push({ sprite: s, t: 0 });
    }
  }
  let flashCursor = 0;
  function muzzleFlash(x, y, z, size) {
    const f = flashes[flashCursor]; flashCursor = (flashCursor + 1) % FLASH_N;
    f.sprite.position.set(x, y, z);
    f.sprite.scale.setScalar(size || 0.6);
    f.sprite.visible = true; f.sprite.material.opacity = 1;
    f.t = 0.14;
  }

  /* ---------------- state ---------------- */
  const state = {
    running: false, units: [], tick: 0, acc: 0,
    score: { blu: 0, op: 0 }, start: { blu: 0, op: 0 },
    over: false, centre: { x: 0, z: 0 },
  };
  const TICK = 1 / 30;

  function unitAt(faction, type, x, z, yaw) {
    const spec = UNITS[type];
    return {
      faction, type, spec,
      x, z, y: 0, yaw: yaw || 0, turretYaw: yaw || 0,
      hp: spec.hp, maxHp: spec.hp,
      cd: Math.random() * 2, cd2: Math.random() * 3,
      target: null, alive: true, spin: 0,
      /* infantry advance in a loose wedge rather than a conga line */
      jitter: (Math.random() - 0.5) * 2,
    };
  }

  function spawn(faction, type, x, z, yaw) {
    const f = ensureFleet(type, faction);
    if (f.list.length >= f.cap) return null;
    const un = unitAt(faction, type, x, z, yaw);
    un.fleet = f; un.slot = f.list.length;
    f.list.push(un);
    state.units.push(un);
    return un;
  }

  /* ---------------- order of battle ---------------- */
  function deploy(centre, scale, terrainOk) {
    const cx = centre.x, cz = centre.z;
    const span = 15 * (scale || 1);
    const place = (fac, type, ox, oz, yaw) => {
      let x = cx + ox, z = cz + oz;
      if (terrainOk && !terrainOk(x, z)) {
        /* nudge off water / out of bounds rather than dropping the unit */
        for (let k = 0; k < 8 && !terrainOk(x, z); k++) { x += (Math.random() - 0.5) * 12; z += (Math.random() - 0.5) * 12; }
      }
      return spawn(fac, type, x, z, yaw);
    };
    /* BLUFOR advances from -Z, OPFOR holds +Z */
    const line = (fac, sign) => {
      const yaw = sign > 0 ? 0 : Math.PI;
      const base = sign * span;
      place(fac, 'mbt', -14, base - sign * 3, yaw);
      place(fac, 'mbt', -5, base, yaw);
      place(fac, 'mbt', 6, base, yaw);
      place(fac, 'mbt', 15, base - sign * 4, yaw);
      place(fac, 'ifv', -19, base + sign * 5, yaw);
      place(fac, 'ifv', -2, base + sign * 6, yaw);
      place(fac, 'ifv', 11, base + sign * 5, yaw);
      place(fac, 'apc', 19, base + sign * 7, yaw);
      place(fac, 'light', -24, base + sign * 9, yaw);
      place(fac, 'artillery', -8, base + sign * 12, yaw);
      place(fac, 'mlrs', 8, base + sign * 14, yaw);
      /* two rifle squads in wedge, forward of the armour so they actually make
         contact — rifles reach 450 m and would otherwise never close */
      for (let sq = 0; sq < 2; sq++) for (let i = 0; i < 6; i++) {
        place(fac, 'infantry', -12 + sq * 22 + (i % 3) * 2.2 - 2,
          base - sign * (4 + Math.floor(i / 3) * 2.0), yaw);
      }
      /* sniper pair in hides on either flank, well behind the line of departure */
      place(fac, 'sniper', -30, base + sign * 16, yaw);
      place(fac, 'sniper', 27, base + sign * 18, yaw);
      place(fac, 'helo', sq0(sign), base + sign * 20, yaw);
    };
    function sq0(sign) { return sign > 0 ? 12 : -12; }
    line('blu', -1);
    line('op', 1);
    state.units.forEach(un => { un.y = sampleH(un.x, un.z); });
    state.start.blu = state.units.filter(u2 => u2.faction === 'blu').length;
    state.start.op = state.units.filter(u2 => u2.faction === 'op').length;
  }

  /* ---------------- combat ---------------- */
  function nearestEnemy(un) {
    let best = null, bd = 1e9;
    for (const o of state.units) {
      if (!o.alive || o.faction === un.faction) continue;
      const d = (o.x - un.x) * (o.x - un.x) + (o.z - un.z) * (o.z - un.z);
      if (d < bd) { bd = d; best = o; }
    }
    un.targetDist = Math.sqrt(bd);
    return best;
  }

  function fire(un, wpnKey, tgt) {
    const w = WEAPONS[wpnKey];
    const p = projectiles[projCursor]; projCursor = (projCursor + 1) % PROJ_N;
    const muzzleY = un.y + (un.spec.air ? 0.5 : 0.28);
    const sx = un.x, sz = un.z;
    /* aim with dispersion — accuracy falls off with range like a real gunner */
    const rangeFrac = Math.min(1, un.targetDist / w.range);
    const err = w.spread * (0.4 + rangeFrac) * 6;
    const tx = tgt.x + (Math.random() - 0.5) * err;
    const tz = tgt.z + (Math.random() - 0.5) * err;
    p.live = true;
    p.x = sx; p.y = muzzleY; p.z = sz;
    p.tx = tx; p.ty = tgt.y + 0.2; p.tz = tz;
    p.t = 0;
    p.speed = w.indirect ? 0.5 : 2.6;                 // travel time, units/sec-ish
    p.dur = w.indirect ? 2.2 : Math.max(0.16, un.targetDist / 26);
    p.w = w; p.wpn = wpnKey;
    p.faction = un.faction;
    p.tracerLen = w.tracer;
    p.arc = w.indirect ? Math.max(6, un.targetDist * 0.45) : 0;
    p.tgt = tgt;
    p.shooter = un;
    if (!w.indirect) muzzleFlash(sx, muzzleY, sz, w === WEAPONS.maingun ? 1.5 : 0.7);
    else muzzleFlash(sx, muzzleY + 0.3, sz, 1.9);
  }

  /* queued rounds — a burst is scheduled on the sim clock, never with timers,
     so it stays deterministic and survives a paused tab */
  const queue = [];
  function fireBurst(un, wpnKey, tgt) {
    const w = WEAPONS[wpnKey];
    const n = w.salvo || w.burst || 1;
    const gap = w.salvo ? 0.18 : (w.bgap || 0.1);
    fire(un, wpnKey, tgt);
    for (let i = 1; i < n; i++) queue.push({ t: i * gap, un, wpnKey, tgt });
  }
  function stepQueue(dt) {
    for (let i = queue.length - 1; i >= 0; i--) {
      const q = queue[i];
      q.t -= dt;
      if (q.t <= 0) {
        if (q.un.alive && q.tgt.alive) fire(q.un, q.wpnKey, q.tgt);
        queue.splice(i, 1);
      }
    }
  }

  function damage(tgt, w, shooterFaction) {
    /* armour reduces non-AP hits hard; AP weapons cut through */
    const mitigation = tgt.spec.armour * (1 - w.vsArmour);
    const dmg = w.dmg * (1 - mitigation) * (0.75 + Math.random() * 0.5);
    tgt.hp -= dmg;
    if (tgt.hp <= 0 && tgt.alive) {
      tgt.alive = false;
      state.score[shooterFaction]++;
      if (onImpact) onImpact(tgt.x, tgt.y, tgt.z, tgt.spec.air ? 1.1 : 0.8, true);
      if (state.units.filter(x => x.alive && x.faction === tgt.faction).length % 4 === 0) {
        log(`BATTLE ▸ ${FACTIONS[tgt.faction].name} ${tgt.spec.label} DESTROYED`, tgt.faction === 'blu' ? 'crit' : 'warn');
      }
    }
  }

  function stepUnits(dt) {
    for (const un of state.units) {
      if (!un.alive) continue;
      const tgt = nearestEnemy(un);
      un.target = tgt;
      if (!tgt) continue;
      const dx = tgt.x - un.x, dz = tgt.z - un.z;
      const dist = un.targetDist;
      const face = Math.atan2(dx, dz);
      /* turret tracks faster than the hull turns — reads as a real fire-control */
      un.turretYaw += angleDelta(un.turretYaw, face) * Math.min(1, dt * 3.2);

      const w = WEAPONS[un.spec.weapon];
      const w2 = un.spec.second ? WEAPONS[un.spec.second] : null;
      const standoff = w.indirect ? w.range * 0.5 : w.range * 0.72;

      if (dist > standoff && !un.spec.hold) {
        /* close the distance */
        const sp = u(un.spec.speed) * MOVE_SCALE * dt;
        const nx = un.x + (dx / dist) * sp, nz = un.z + (dz / dist) * sp;
        un.x = nx; un.z = nz;
        un.yaw += angleDelta(un.yaw, face) * Math.min(1, dt * 1.6);
        un.y = un.spec.air ? sampleH(un.x, un.z) + 7 : sampleH(un.x, un.z);
      } else {
        un.yaw += angleDelta(un.yaw, face) * Math.min(1, dt * 1.1);
        un.y = un.spec.air ? sampleH(un.x, un.z) + 7 : sampleH(un.x, un.z);
      }

      un.cd -= dt;
      if (un.cd <= 0 && dist <= w.range) {
        un.cd = w.rof * (0.75 + Math.random() * 0.5);
        fireBurst(un, un.spec.weapon, tgt);
      }
      if (w2) {
        un.cd2 -= dt;
        if (un.cd2 <= 0 && dist <= w2.range) {
          un.cd2 = w2.rof * (0.8 + Math.random() * 0.6);
          fireBurst(un, un.spec.second, tgt);
        }
      }
      if (un.spec.air) un.spin += dt * 26;
    }
  }

  function angleDelta(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function stepProjectiles(dt) {
    let n = 0;
    for (let i = 0; i < PROJ_N; i++) {
      const p = projectiles[i];
      if (!p.live) continue;
      p.t += dt / p.dur;
      if (p.t >= 1) {
        p.live = false;
        if (p.tgt && p.tgt.alive) {
          /* hit probability already baked into dispersion: check final miss distance */
          const miss = Math.hypot(p.tx - p.tgt.x, p.tz - p.tgt.z);
          if (miss < (p.w.indirect ? 3.2 : 1.4)) damage(p.tgt, p.w, p.faction);
          else if (p.w.indirect && onImpact) onImpact(p.tx, sampleH(p.tx, p.tz), p.tz, 0.5, false);
        } else if (p.w.indirect && onImpact) onImpact(p.tx, sampleH(p.tx, p.tz), p.tz, 0.5, false);
        continue;
      }
      /* current position along the flight path */
      const k = p.t;
      const cx = p.x + (p.tx - p.x) * k;
      const cz = p.z + (p.tz - p.z) * k;
      let cy = p.y + (p.ty - p.y) * k;
      if (p.arc) cy += Math.sin(k * Math.PI) * p.arc * 0.06;
      /* tracer tail points back along the path */
      const back = Math.max(0.001, p.tracerLen * 0.06);
      const bk = Math.max(0, k - back);
      const bx = p.x + (p.tx - p.x) * bk;
      const bz = p.z + (p.tz - p.z) * bk;
      let by = p.y + (p.ty - p.y) * bk;
      if (p.arc) by += Math.sin(bk * Math.PI) * p.arc * 0.06;
      const o = n * 6;
      projPos[o] = bx; projPos[o + 1] = by; projPos[o + 2] = bz;
      projPos[o + 3] = cx; projPos[o + 4] = cy; projPos[o + 5] = cz;
      const col = FACTIONS[p.faction].tracer;
      const r = ((col >> 16) & 255) / 255, g = ((col >> 8) & 255) / 255, b = (col & 255) / 255;
      projCol[o] = r * 0.15; projCol[o + 1] = g * 0.15; projCol[o + 2] = b * 0.15;
      projCol[o + 3] = r; projCol[o + 4] = g; projCol[o + 5] = b;
      n++;
      if (n >= PROJ_N) break;
    }
    projGeo.setDrawRange(0, n * 2);
    projGeo.attributes.position.needsUpdate = true;
    projGeo.attributes.color.needsUpdate = true;
  }

  /* ---------------- rendering ---------------- */
  const m4 = new THREE_.Matrix4(), q = new THREE_.Quaternion(), eu = new THREE_.Euler(),
        vp = new THREE_.Vector3(), vs = new THREE_.Vector3(1, 1, 1), pv = new THREE_.Vector3();
  function render() {
    const ringN = { blu: 0, op: 0 };
    for (const un of state.units) {
      if (!un.alive) continue;
      const mesh = rings[un.faction];
      if (ringN[un.faction] >= RING_CAP) continue;
      /* ring scales with the unit so an MBT reads bigger than a rifleman */
      const rs = un.spec.air ? 1.5 : un.type === 'infantry' ? 0.42 : 1.0;
      vs.setScalar(rs);
      eu.set(0, 0, 0); q.setFromEuler(eu);
      vp.set(un.x, un.y + 0.04, un.z);
      m4.compose(vp, q, vs);
      mesh.setMatrixAt(ringN[un.faction]++, m4);
    }
    for (const fac in rings) { rings[fac].count = ringN[fac]; rings[fac].instanceMatrix.needsUpdate = true; }
    vs.setScalar(1);
    for (const type in fleets) for (const fac in fleets[type]) {
      const f = fleets[type][fac];
      let n = 0;
      for (const un of f.list) {
        if (!un.alive) continue;
        eu.set(0, un.yaw, 0); q.setFromEuler(eu);
        vp.set(un.x, un.y, un.z);
        m4.compose(vp, q, vs);
        f.hull.setMatrixAt(n, m4);
        if (f.turret) {
          if (f.spin) { eu.set(0, un.spin, 0); }
          else { eu.set(0, un.turretYaw, 0); }
          q.setFromEuler(eu);
          pv.set(f.pivot[0], f.pivot[1], f.pivot[2]);
          /* pivot is expressed in hull space, so rotate it with the hull */
          const hy = un.yaw, cs = Math.cos(hy), sn = Math.sin(hy);
          vp.set(un.x + pv.x * cs + pv.z * sn, un.y + pv.y, un.z - pv.x * sn + pv.z * cs);
          m4.compose(vp, q, vs);
          f.turret.setMatrixAt(n, m4);
        }
        n++;
      }
      f.hull.count = n; f.hull.instanceMatrix.needsUpdate = true;
      if (f.turret) { f.turret.count = n; f.turret.instanceMatrix.needsUpdate = true; }
    }
    for (const fl of flashes) {
      if (!fl.sprite.visible) continue;
      fl.t -= 1 / 60;
      fl.sprite.material.opacity = Math.max(0, fl.t / 0.14);
      if (fl.t <= 0) fl.sprite.visible = false;
    }
  }

  /* ---------------- public ---------------- */
  function start(centre, terrainOk) {
    stop();
    state.centre = centre || { x: 0, z: 0 };
    deploy(state.centre, 1, terrainOk);
    state.running = true; state.over = false; state.tick = 0;
    state.score.blu = 0; state.score.op = 0;
    log(`BATTLE ▸ FORCE-ON-FORCE ENGAGED · ${state.start.blu} v ${state.start.op} · SIM`, 'crit');
    return state;
  }
  function stop() {
    state.running = false;
    state.units.length = 0;
    for (const type in fleets) for (const fac in fleets[type]) {
      fleets[type][fac].list.length = 0;
      fleets[type][fac].hull.count = 0;
      if (fleets[type][fac].turret) fleets[type][fac].turret.count = 0;
    }
    for (let i = 0; i < PROJ_N; i++) projectiles[i].live = false;
    queue.length = 0;
    projGeo.setDrawRange(0, 0);
    for (const fl of flashes) { fl.sprite.visible = false; fl.t = 0; }
    for (const fac in rings) rings[fac].count = 0;
  }
  function update(dt) {
    if (!state.running) return;
    state.acc += Math.min(0.1, dt);
    let guard = 0;
    while (state.acc >= TICK && guard++ < 4) {
      state.acc -= TICK;
      state.tick++;
      stepUnits(TICK);
      stepQueue(TICK);
      stepProjectiles(TICK);
    }
    render();
    if (!state.over) {
      const b = alive('blu'), o = alive('op');
      if (b === 0 || o === 0) {
        state.over = true;
        const win = b > o ? 'BLUFOR' : o > b ? 'OPFOR' : 'MUTUAL ATTRITION';
        log(`BATTLE ▸ ENDEX — ${win} · BLU ${b}/${state.start.blu} · OP ${o}/${state.start.op}`, 'good');
      }
    }
  }
  function alive(fac) { let n = 0; for (const un of state.units) if (un.alive && un.faction === fac) n++; return n; }

  return {
    start, stop, update, state,
    isRunning: () => state.running,
    alive, FACTIONS, UNITS, WEAPONS, M_PER_UNIT,
    strength(fac) { return state.start[fac] ? alive(fac) / state.start[fac] : 0; },
    /* Live units in an order built for CYCLING, not for a roster listing.
       Grouping by type would mean eight presses of `]` and you are still
       looking at helicopters, so the types are drained round-robin: one pass
       through the list shows a pilot, a tank commander, a gunner, a sniper —
       the whole combined-arms picture — before it repeats a role. */
    liveUnits(fac) {
      const order = ['helo', 'mbt', 'ifv', 'apc', 'artillery', 'mlrs', 'light', 'sniper', 'infantry'];
      const bucket = new Map(order.map(t => [t, []]));
      for (const x of state.units) {
        if (!x.alive || (fac && x.faction !== fac)) continue;
        (bucket.get(x.type) || bucket.get('infantry')).push(x);
      }
      const out = [];
      for (let round = 0; out.length < state.units.length; round++) {
        let added = 0;
        for (const t of order) { const b = bucket.get(t); if (b[round]) { out.push(b[round]); added++; } }
        if (!added) break;
      }
      return out;
    },
    unitCount: () => state.units.filter(x => x.alive).length,
  };
}

global.AegisBattle = { create, UNITS, WEAPONS, FACTIONS };
})(window);
