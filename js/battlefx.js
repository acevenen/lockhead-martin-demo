/* ============================================================================
   AEGIS OVERWATCH — battlefield effects
   ----------------------------------------------------------------------------
   The battle simulation was correct and inert. Units acquired, closed and
   engaged on published ranges, and then a killed unit simply STOPPED BEING
   DRAWN — no death, no wreck, no trace that a fight had happened there. Guns
   fired without recoil, tanks crossed open ground without raising dust, and a
   40-tonne hull braked as if it were on rails.

   This module supplies the parts that were missing, all pooled and fixed-size:
   nothing here allocates inside the frame loop, and every pool degrades by
   overwriting its oldest member rather than by growing.

   Dust is deliberately the largest pool. At MOVE_SCALE = 30 a tank crosses the
   table fast enough that wheel rotation would be a blur, while the plume behind
   it is what actually sells the weight.
   ============================================================================ */
(function (global) {
'use strict';

function softSprite(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 15);
  g.addColorStop(0, inner); g.addColorStop(0.55, outer); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

function create(ctx) {
  const scene = ctx.scene, sampleH = ctx.sampleH;
  const RM = ctx.rm;

  /* ---------------- dust / smoke: one instanced quad pool ---------------- */
  const DUST_N = 260;
  const dustTex = softSprite('rgba(255,255,255,0.95)', 'rgba(255,255,255,0.35)');
  const dustGeo = new THREE.PlaneGeometry(1, 1);
  const dustMat = new THREE.MeshBasicMaterial({ map: dustTex, transparent: true, depthWrite: false,
    vertexColors: true, opacity: 0.9, blending: THREE.NormalBlending });
  if (RM) RM.register(dustMat, 'fx');
  const dust = new THREE.InstancedMesh(dustGeo, dustMat, DUST_N);
  dust.frustumCulled = false; dust.count = DUST_N;
  dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(dust);
  const D = [];
  for (let i = 0; i < DUST_N; i++) D.push({ t: 0, life: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0,
    s0: 0.2, s1: 0.6, r: 0, cr: 1, cg: 1, cb: 1, a: 0.5 });
  let dCur = 0;
  function puff(x, y, z, o) {
    o = o || {};
    const p = D[dCur]; dCur = (dCur + 1) % DUST_N;
    p.t = 0; p.life = o.life === undefined ? 1.6 : o.life;
    p.x = x; p.y = y; p.z = z;
    const sp = o.spread === undefined ? 0.25 : o.spread;
    p.vx = (o.vx || 0) + (Math.random() - 0.5) * sp;
    p.vy = (o.vy === undefined ? 0.22 : o.vy) + Math.random() * 0.12;
    p.vz = (o.vz || 0) + (Math.random() - 0.5) * sp;
    p.s0 = o.s0 === undefined ? 0.22 : o.s0;
    p.s1 = o.s1 === undefined ? 0.85 : o.s1;
    p.r = Math.random() * Math.PI;
    const c = o.col || 0xbfae92;
    p.cr = ((c >> 16) & 255) / 255; p.cg = ((c >> 8) & 255) / 255; p.cb = (c & 255) / 255;
    p.a = o.alpha === undefined ? 0.42 : o.alpha;
    return p;
  }

  /* ---------------- sparks: pooled line segments ---------------- */
  const SPARK_N = 120;
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(SPARK_N * 6), sCol = new Float32Array(SPARK_N * 6);
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const sparkMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true,
    opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.LineSegments(sGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  const S = [];
  for (let i = 0; i < SPARK_N; i++) S.push({ live: false, t: 0, life: 0.4, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  let sCur = 0;
  function spark(x, y, z, n, hot) {
    for (let k = 0; k < (n || 5); k++) {
      const p = S[sCur]; sCur = (sCur + 1) % SPARK_N;
      p.live = true; p.t = 0; p.life = 0.22 + Math.random() * 0.3;
      p.x = x; p.y = y; p.z = z;
      const a = Math.random() * Math.PI * 2, e = 0.2 + Math.random() * 1.1;
      const sp = (hot ? 5.5 : 3.0) * (0.5 + Math.random());
      p.vx = Math.cos(a) * sp * 0.4; p.vy = e * sp * 0.35; p.vz = Math.sin(a) * sp * 0.4;
      p.hot = !!hot;
    }
  }

  /* ---------------- update ---------------- */
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler();
  const vp = new THREE.Vector3(), vs = new THREE.Vector3(), col = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  function update(dt, camera) {
    /* dust: billboarded to the camera, drifting up and spreading as it ages */
    for (let i = 0; i < DUST_N; i++) {
      const p = D[i];
      if (p.t >= p.life) { dust.setMatrixAt(i, ZERO); continue; }
      p.t += dt;
      const k = Math.min(1, p.t / p.life);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= dt * 0.06;                                  // settles rather than climbs forever
      p.vx *= 1 - dt * 0.9; p.vz *= 1 - dt * 0.9;
      const s = p.s0 + (p.s1 - p.s0) * k;
      vp.set(p.x, p.y, p.z); vs.set(s, s, s);
      if (camera) q.copy(camera.quaternion);
      else { e3.set(-Math.PI / 2, 0, p.r); q.setFromEuler(e3); }
      m4.compose(vp, q, vs);
      dust.setMatrixAt(i, m4);
      const a = p.a * (1 - k) * (k < 0.12 ? k / 0.12 : 1);
      col.setRGB(p.cr * a, p.cg * a, p.cb * a);          // premultiplied: one pool, no per-instance alpha
      dust.setColorAt(i, col);
    }
    dust.instanceMatrix.needsUpdate = true;
    if (dust.instanceColor) dust.instanceColor.needsUpdate = true;

    /* sparks */
    let any = false;
    for (let i = 0; i < SPARK_N; i++) {
      const p = S[i], o = i * 6;
      if (!p.live) { sPos[o] = sPos[o + 1] = sPos[o + 2] = sPos[o + 3] = sPos[o + 4] = sPos[o + 5] = 0; continue; }
      any = true;
      p.t += dt;
      if (p.t >= p.life) { p.live = false; sPos[o] = sPos[o + 1] = sPos[o + 2] = sPos[o + 3] = sPos[o + 4] = sPos[o + 5] = 0; continue; }
      p.vy -= dt * 3.2;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const tl = 0.035;
      sPos[o] = p.x; sPos[o + 1] = p.y; sPos[o + 2] = p.z;
      sPos[o + 3] = p.x - p.vx * tl; sPos[o + 4] = p.y - p.vy * tl; sPos[o + 5] = p.z - p.vz * tl;
      const f = 1 - p.t / p.life;
      const r = p.hot ? 1 : 0.95, g = p.hot ? 0.72 * f + 0.2 : 0.6 * f, b = p.hot ? 0.25 * f : 0.25 * f;
      sCol[o] = r; sCol[o + 1] = g; sCol[o + 2] = b;
      sCol[o + 3] = r * 0.3; sCol[o + 4] = g * 0.3; sCol[o + 5] = b * 0.3;
    }
    sGeo.attributes.position.needsUpdate = true;
    sGeo.attributes.color.needsUpdate = true;
    sparks.visible = any;
  }

  /* ---------------- authored events ---------------- */
  /* a track plume: low, wide, and thrown backwards off the hull */
  function trackDust(x, y, z, dx, dz, heavy) {
    puff(x - dx * 0.25, y + 0.05, z - dz * 0.25, {
      vx: -dx * 0.25, vz: -dz * 0.25, vy: 0.10 + Math.random() * 0.08,
      s0: heavy ? 0.30 : 0.20, s1: heavy ? 1.35 : 0.80,
      life: heavy ? 2.4 : 1.5, alpha: heavy ? 0.34 : 0.24, spread: 0.16,
    });
  }
  /* muzzle blast kicks the ground under the gun, which is what a main gun does */
  function muzzleBlast(x, y, z, dx, dz, big) {
    puff(x + dx * 0.5, y + 0.06, z + dz * 0.5, {
      vx: dx * 1.2, vz: dz * 1.2, vy: 0.16,
      s0: big ? 0.34 : 0.16, s1: big ? 1.7 : 0.7,
      life: big ? 1.5 : 0.7, alpha: big ? 0.5 : 0.28, col: 0xd6c9b0, spread: 0.3,
    });
    if (big) spark(x + dx * 0.4, y + 0.1, z + dz * 0.4, 7, true);
  }
  function rotorWash(x, y, z) {
    puff(x + (Math.random() - 0.5) * 1.2, y + 0.04, z + (Math.random() - 0.5) * 1.2,
      { vy: 0.06, s0: 0.3, s1: 1.5, life: 1.5, alpha: 0.16, spread: 0.55 });
  }
  /* an armour kill: fireball, then a smoke column that stands for a while */
  function killBurst(x, y, z, big) {
    for (let i = 0; i < (big ? 7 : 3); i++)
      puff(x, y + 0.1 + i * 0.05, z, { vy: 0.5 + i * 0.16, s0: 0.3, s1: big ? 2.4 : 1.2,
        life: 2.0 + i * 0.5, alpha: 0.5, col: i < 2 ? 0xffb257 : 0x4a4741, spread: 0.5 });
    spark(x, y + 0.15, z, big ? 16 : 8, true);
  }
  function burnColumn(x, y, z) {
    puff(x + (Math.random() - 0.5) * 0.25, y + 0.2, z + (Math.random() - 0.5) * 0.25,
      { vy: 0.55 + Math.random() * 0.3, s0: 0.22, s1: 1.8, life: 3.4, alpha: 0.26,
        col: 0x3d3a36, spread: 0.10 });
  }
  function hitArmour(x, y, z) { spark(x, y, z, 6, true); }
  function hitDirt(x, y, z) {
    puff(x, y + 0.04, z, { vy: 0.35, s0: 0.12, s1: 0.55, life: 0.8, alpha: 0.34, spread: 0.4 });
  }

  function clear() {
    for (const p of D) { p.t = p.life; }
    for (const p of S) p.live = false;
    for (let i = 0; i < DUST_N; i++) dust.setMatrixAt(i, ZERO);
    dust.instanceMatrix.needsUpdate = true;
    sparks.visible = false;
  }

  return { update, puff, spark, trackDust, muzzleBlast, rotorWash,
    killBurst, burnColumn, hitArmour, hitDirt, clear,
    liveDust: () => D.filter(p => p.t < p.life).length,
    liveSparks: () => S.filter(p => p.live).length };
}

global.AegisBattleFx = { create };
})(window);
