/* ============================================================================
   AEGIS OVERWATCH — debris physics
   ----------------------------------------------------------------------------
   One pooled InstancedMesh per material (glass / concrete / metal / ember).
   Every shard is a rigid body with linear + angular velocity, gravity, ground
   collision with restitution and friction, and a settle-then-fade lifetime.

   Pooled and fixed-size on purpose: a presenter can level a city block and the
   frame cost never grows past the pool. Oldest shards are recycled first.
   ============================================================================ */
(function (global) {
'use strict';

const GRAVITY = -26;

/* irregular chunk — no two rubble pieces should read as the same box */
function chunkGeo(seed) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  let s = seed || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * (0.6 + rnd() * 0.8),
                p.getY(i) * (0.55 + rnd() * 0.9),
                p.getZ(i) * (0.6 + rnd() * 0.8));
  }
  g.computeVertexNormals();
  return g;
}
/* thin angular sliver — glass breaks into shards, not cubes */
function shardGeo() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0.5, 0, -0.28, -0.5, 0.06, 0.34, -0.42, -0.05,
    0, 0.5, 0, 0.34, -0.42, -0.05, 0.10, -0.5, 0.10,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/* sizes are in world units where a sedan is 0.90 long — a concrete chunk is
   roughly a wheel's width, glass is smaller still */
const MATERIALS = {
  glass:    { color: 0x9fdcff, size: 0.045, restitution: 0.30, life: 4.2, opacity: 0.85, geo: 'shard' },
  concrete: { color: 0x8c8378, size: 0.075, restitution: 0.18, life: 6.5, opacity: 1.00, geo: 'chunk' },
  metal:    { color: 0xb9c4cc, size: 0.055, restitution: 0.36, life: 5.0, opacity: 1.00, geo: 'chunk' },
  ember:    { color: 0xff9a40, size: 0.032, restitution: 0.42, life: 2.6, opacity: 0.95, geo: 'chunk' },
};

function makePool(scene, kind, count, groundAt) {
  const spec = MATERIALS[kind];
  const geo = spec.geo === 'shard' ? shardGeo() : chunkGeo(kind.length * 977 + 13);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
    color: spec.color, transparent: true, opacity: spec.opacity,
    vertexColors: false, depthWrite: spec.geo !== 'shard',
    blending: spec.geo === 'shard' ? THREE.AdditiveBlending : THREE.NormalBlending,
  }), count);
  mesh.frustumCulled = false;
  mesh.count = count;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const bodies = [];
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) {
    bodies.push({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, s: 1, t: 0, rest: 0 });
    mesh.setMatrixAt(i, HIDDEN);
  }
  mesh.instanceMatrix.needsUpdate = true;

  let cursor = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const vPos = new THREE.Vector3(), vScale = new THREE.Vector3();

  return {
    mesh, kind, spec,
    /* spawn n shards bursting from (x,y,z); power scales the initial impulse */
    burst(x, y, z, n, power, scale) {
      const pw = power === undefined ? 1 : power;
      const sc = scale === undefined ? 1 : scale;
      for (let k = 0; k < n; k++) {
        const b = bodies[cursor];
        cursor = (cursor + 1) % count;
        const th = Math.random() * Math.PI * 2;
        const el = Math.random() * Math.PI * 0.5;
        const sp = (3 + Math.random() * 13) * pw;
        b.live = true; b.t = 0; b.rest = 0;
        b.x = x + (Math.random() - 0.5) * 0.5;
        b.y = y + Math.random() * 0.5;
        b.z = z + (Math.random() - 0.5) * 0.5;
        b.vx = Math.cos(th) * Math.cos(el) * sp;
        b.vy = Math.sin(el) * sp * 1.35 + 2;
        b.vz = Math.sin(th) * Math.cos(el) * sp;
        b.wx = (Math.random() - 0.5) * 16;
        b.wy = (Math.random() - 0.5) * 16;
        b.wz = (Math.random() - 0.5) * 16;
        b.rx = Math.random() * 6.28; b.ry = Math.random() * 6.28; b.rz = Math.random() * 6.28;
        b.s = spec.size * sc * (0.55 + Math.random() * 0.9);
      }
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < count; i++) {
        const b = bodies[i];
        if (!b.live) continue;
        any = true;
        b.t += dt;
        if (b.rest < 1) {
          b.vy += GRAVITY * dt;
          b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
          const floor = groundAt(b.x, b.z) + b.s * 0.4;
          if (b.y <= floor) {
            b.y = floor;
            if (Math.abs(b.vy) < 1.1) {
              /* settled — stop integrating and let it lie on the ground */
              b.rest = 1; b.vx = b.vy = b.vz = 0; b.wx = b.wy = b.wz = 0;
              b.rx = Math.PI / 2 * Math.round(b.rx / (Math.PI / 2));
            } else {
              b.vy = -b.vy * spec.restitution;
              b.vx *= 0.62; b.vz *= 0.62;          // ground friction
              b.wx *= 0.5; b.wy *= 0.5; b.wz *= 0.5;
            }
          }
        }
        if (b.t >= spec.life) { b.live = false; mesh.setMatrixAt(i, HIDDEN); continue; }
        const fade = b.t > spec.life - 1 ? Math.max(0, spec.life - b.t) : 1;
        e.set(b.rx, b.ry, b.rz);
        q.setFromEuler(e);
        vPos.set(b.x, b.y, b.z);
        vScale.setScalar(b.s * fade);
        m4.compose(vPos, q, vScale);
        mesh.setMatrixAt(i, m4);
      }
      if (any) mesh.instanceMatrix.needsUpdate = true;
      return any;
    },
    clear() {
      for (let i = 0; i < count; i++) { bodies[i].live = false; mesh.setMatrixAt(i, HIDDEN); }
      mesh.instanceMatrix.needsUpdate = true;
    },
    setTint(hex) { mesh.material.color.set(hex); },
  };
}

function createDebrisSystem(scene, groundAt, budget) {
  const b = budget || {};
  const pools = {
    glass: makePool(scene, 'glass', b.glass || 260, groundAt),
    concrete: makePool(scene, 'concrete', b.concrete || 300, groundAt),
    metal: makePool(scene, 'metal', b.metal || 120, groundAt),
    ember: makePool(scene, 'ember', b.ember || 200, groundAt),
  };
  return {
    pools,
    /* a building coming down: concrete, blown-out glazing, a little structural steel */
    structureCollapse(x, y, z, scale) {
      const s = scale === undefined ? 1 : scale;
      pools.concrete.burst(x, y, z, Math.round(16 * s), 1.0, s);
      pools.glass.burst(x, y + 0.3, z, Math.round(20 * s), 1.15, s);
      pools.metal.burst(x, y, z, Math.round(5 * s), 0.9, s);
    },
    /* windows failing from overpressure, without the structure going down */
    glassBlowout(x, y, z, n, power) { pools.glass.burst(x, y, z, n, power || 1.3, 1); },
    explosion(x, y, z, scale) {
      const s = scale === undefined ? 1 : scale;
      pools.ember.burst(x, y, z, Math.round(30 * s), 1.5, s);
      pools.concrete.burst(x, y, z, Math.round(12 * s), 1.3, s);
    },
    update(dt) { for (const k in pools) pools[k].update(dt); },
    clear() { for (const k in pools) pools[k].clear(); },
    liveCount() {
      let n = 0;
      for (const k in pools) {
        const mesh = pools[k].mesh;
        for (let i = 0; i < mesh.count; i++) {
          const m = new THREE.Matrix4();
          mesh.getMatrixAt(i, m);
          if (m.elements[0] !== 0) n++;
        }
      }
      return n;
    },
  };
}

global.AegisPhysics = { createDebrisSystem, MATERIALS };
})(window);
