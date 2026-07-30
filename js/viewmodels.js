/* ============================================================================
   AEGIS OVERWATCH — first-person view models
   ----------------------------------------------------------------------------
   The crew POV put the camera at a soldier's eye and showed them holding
   nothing. A first-person view lives or dies on the weapon in frame: it is
   the one object that tells you who you are.

   These are FPS view models in the classic sense — fake-scale props parented
   to the camera, not the world-scale weapon the instanced soldier carries.
   Every shooter does it this way: the world model and the view model are
   different geometry serving different jobs. Ours sit ~1 unit in front of the
   lens (the camera near plane is 0.5, so true 0.08-unit scale would clip),
   sway with movement, and kick with the unit's actual recoil state.

   One group per seat class, built once, swapped by visibility. Materials all
   register with the render-mode authority so a rifle reads solid in REAL and
   projected in HOLO like everything else.
   ============================================================================ */
(function (global) {
'use strict';

const M = global.AegisModels;

const GUN = 0x494f57, GRIP = 0x585d50, GLOVE = 0x6a6250, SLEEVE = 0x66735a,
      SCOPE = 0x363a40, LENS = 0x7fd4e8, DASH = 0x3a4046, BRASS = 0xc9a24a;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n) => new THREE.CylinderGeometry(r0, r1, h, n || 8);

/* All view models are authored looking down -Z? No: the camera looks down its
   local -Z, so "forward, away from the eye" is -Z in camera space. The muzzle
   points -Z; the stock points at the viewer. */

function rifleParts(long, scoped) {
  const L = long ? 1.35 : 1.0;           // barrel group length multiplier
  const P = [
    /* receiver + handguard, running away from the eye */
    { geo: box(0.055, 0.07, 0.46), matrix: M.mat([0, 0, -0.30]), color: GUN },
    { geo: box(0.045, 0.05, 0.34 * L), matrix: M.mat([0, 0.004, -0.62 - 0.17 * (L - 1)]), color: GRIP },
    /* barrel + muzzle device */
    { geo: cyl(0.011, 0.011, 0.30 * L, 7), matrix: M.mat([0, 0.012, -0.90 - 0.32 * (L - 1)], [Math.PI / 2, 0, 0]), color: GUN },
    { geo: cyl(0.017, 0.017, 0.06, 7), matrix: M.mat([0, 0.012, -1.06 - 0.45 * (L - 1)], [Math.PI / 2, 0, 0]), color: GUN },
    /* magazine, canted forward */
    { geo: box(0.04, 0.14, 0.06), matrix: M.mat([0, -0.10, -0.34], [0.25, 0, 0]), color: GUN },
    /* support hand on the handguard, trigger hand at the grip */
    { geo: box(0.07, 0.06, 0.10), matrix: M.mat([-0.005, -0.045, -0.58], [0, 0, 0.2]), color: GLOVE },
    { geo: box(0.075, 0.085, 0.075), matrix: M.mat([0.012, -0.075, -0.16], [0, 0, -0.12]), color: GLOVE },
    /* forearm sleeve entering frame from bottom-right */
    { geo: box(0.085, 0.085, 0.30), matrix: M.mat([0.06, -0.135, -0.02], [0.5, -0.25, 0]), color: SLEEVE },
  ];
  if (scoped) {
    P.push({ geo: cyl(0.030, 0.030, 0.17, 9), matrix: M.mat([0, 0.075, -0.42], [Math.PI / 2, 0, 0]), color: SCOPE });
    P.push({ geo: cyl(0.026, 0.026, 0.012, 9), matrix: M.mat([0, 0.075, -0.335], [Math.PI / 2, 0, 0]), color: LENS });
  } else {
    /* iron post + rear sight block */
    P.push({ geo: box(0.008, 0.03, 0.008), matrix: M.mat([0, 0.055, -0.78]), color: GUN });
    P.push({ geo: box(0.03, 0.025, 0.02), matrix: M.mat([0, 0.05, -0.22]), color: GUN });
  }
  return P;
}

/* pintle .50 — spade grips, receiver box, heavy barrel. The commander's and
   the truck gunner's view. */
function fiftyParts() {
  return [
    { geo: box(0.10, 0.11, 0.34), matrix: M.mat([0, -0.02, -0.46]), color: GUN },
    { geo: cyl(0.020, 0.020, 0.52, 8), matrix: M.mat([0, 0.005, -0.90], [Math.PI / 2, 0, 0]), color: GUN },
    { geo: cyl(0.030, 0.030, 0.10, 8), matrix: M.mat([0, 0.005, -0.66], [Math.PI / 2, 0, 0]), color: GUN },
    /* spade grips + both fists */
    { geo: cyl(0.016, 0.016, 0.09, 6), matrix: M.mat([-0.07, -0.06, -0.30], [0, 0, Math.PI / 2 * 0.9]), color: GRIP },
    { geo: cyl(0.016, 0.016, 0.09, 6), matrix: M.mat([0.07, -0.06, -0.30], [0, 0, Math.PI / 2 * 0.9]), color: GRIP },
    { geo: box(0.075, 0.075, 0.075), matrix: M.mat([-0.115, -0.06, -0.30]), color: GLOVE },
    { geo: box(0.075, 0.075, 0.075), matrix: M.mat([0.115, -0.06, -0.30]), color: GLOVE },
    /* ammo box + belt feeding in from the left */
    { geo: box(0.12, 0.09, 0.11), matrix: M.mat([-0.15, -0.04, -0.48]), color: 0x4a5340 },
    { geo: box(0.06, 0.015, 0.04), matrix: M.mat([-0.095, 0.01, -0.46], [0, 0, 0.3]), color: BRASS },
  ];
}

/* helicopter office: canopy frame, glareshield, cyclic centred low */
function cockpitParts() {
  return [
    /* glareshield across the bottom */
    { geo: box(1.15, 0.10, 0.30), matrix: M.mat([0, -0.34, -0.85], [0.25, 0, 0]), color: DASH },
    /* three MFD-ish blocks on it */
    { geo: box(0.20, 0.14, 0.02), matrix: M.mat([-0.30, -0.30, -0.80], [0.35, 0, 0]), color: LENS },
    { geo: box(0.20, 0.14, 0.02), matrix: M.mat([0, -0.30, -0.82], [0.35, 0, 0]), color: 0x9fe4b0 },
    { geo: box(0.20, 0.14, 0.02), matrix: M.mat([0.30, -0.30, -0.80], [0.35, 0, 0]), color: LENS },
    /* canopy pillars converging overhead */
    { geo: box(0.045, 1.05, 0.05), matrix: M.mat([-0.62, 0.10, -0.80], [0, 0, 0.42]), color: DASH },
    { geo: box(0.045, 1.05, 0.05), matrix: M.mat([0.62, 0.10, -0.80], [0, 0, -0.42]), color: DASH },
    { geo: box(1.15, 0.045, 0.05), matrix: M.mat([0, 0.56, -0.85]), color: DASH },
    /* cyclic grip */
    { geo: cyl(0.016, 0.016, 0.26, 6), matrix: M.mat([0, -0.42, -0.55], [0.25, 0, 0]), color: GRIP },
    { geo: box(0.05, 0.09, 0.05), matrix: M.mat([0, -0.28, -0.585], [0.25, 0, 0]), color: GUN },
    { geo: box(0.07, 0.07, 0.07), matrix: M.mat([0, -0.36, -0.57]), color: GLOVE },
  ];
}

/* fire-direction post: binoculars resting at the bottom of the view + map board */
function observerParts() {
  return [
    { geo: cyl(0.035, 0.030, 0.11, 8), matrix: M.mat([-0.045, -0.26, -0.52], [Math.PI / 2 - 0.5, 0, 0]), color: SCOPE },
    { geo: cyl(0.035, 0.030, 0.11, 8), matrix: M.mat([0.045, -0.26, -0.52], [Math.PI / 2 - 0.5, 0, 0]), color: SCOPE },
    { geo: box(0.075, 0.02, 0.05), matrix: M.mat([0, -0.27, -0.52], [-0.5, 0, 0]), color: SCOPE },
    { geo: box(0.075, 0.07, 0.075), matrix: M.mat([-0.09, -0.31, -0.50]), color: GLOVE },
    { geo: box(0.075, 0.07, 0.075), matrix: M.mat([0.09, -0.31, -0.50]), color: GLOVE },
    { geo: box(0.44, 0.30, 0.02), matrix: M.mat([0.30, -0.36, -0.72], [0.9, -0.25, 0]), color: 0x6a6f5e },
  ];
}

/* seat label -> which view model it holds */
const SEAT_VM = {
  'RIFLEMAN': 'rifle', 'INF': 'rifle',
  'SNIPER': 'sniper',
  'TANK COMMANDER': 'fifty', 'VEHICLE CDR': 'fifty', 'GUNNER': 'fifty', 'IFV GUNNER': 'fifty',
  'PILOT': 'cockpit',
  'GUN CHIEF': 'observer', 'LAUNCHER CREW': 'observer',
};

function create(rm) {
  const root = new THREE.Group();
  /* The camera near plane is 0.5, so geometry authored around z = -0.3 would be
     clipped. Scaling the whole group pushes every part past the near plane and
     grows it by the same factor, so the visual angle — how much of the frame
     the weapon fills — stays what was authored. */
  root.scale.setScalar(2.1);
  root.visible = false;
  /* Deliberately NOT registered with the render-mode authority. The weapon is
     the operator's own hands, not part of the projection — washing it to a
     translucent cyan ghost in HOLO made it disappear against a dark theater.
     It stays a solid lit object in both looks, like the HUD chrome. */
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x14171c });
  const models = {};
  const build = (name, parts) => {
    const mesh = new THREE.Mesh(M.mergeParts(parts), mat);
    mesh.visible = false;
    mesh.frustumCulled = false;         // parented to the camera; its sphere lies
    root.add(mesh);
    models[name] = mesh;
  };
  build('rifle', rifleParts(false, false));
  build('sniper', rifleParts(true, true));
  build('fifty', fiftyParts());
  build('cockpit', cockpitParts());
  build('observer', observerParts());

  /* muzzle flash card at the view-model muzzle, flashed on the unit's shot */
  const flashTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,204,110,0.9)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(cv);
  })();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0 }));
  flash.scale.setScalar(0.5);
  root.add(flash);

  let active = null, activeName = null, flashT = 0, lastRecoil = 0;

  function show(seat) {
    const name = SEAT_VM[seat] || 'rifle';
    for (const k in models) models[k].visible = false;
    active = models[name] || models.rifle;
    activeName = name;
    active.visible = true;
    root.visible = true;
    lastRecoil = 0;
    return name;
  }
  function hide() { root.visible = false; active = null; }

  /* sway + recoil, driven from POV each frame */
  function update(dt, opts) {
    if (!active) return;
    const t = opts.t || 0, speed = opts.speed || 0, recoil = opts.recoil || 0;
    /* figure-of-eight sway scaled by movement, breathing at rest */
    const w = 0.5 + Math.min(1, speed * 2.2);
    const bobX = Math.sin(t * 5.4 * w) * 0.006 * w;
    const bobY = -Math.abs(Math.cos(t * 5.4 * w)) * 0.008 * w - Math.sin(t * 1.4) * 0.0025;
    /* the shot: recoil rising past its last value means the unit just fired */
    if (recoil > lastRecoil + 0.08 && activeName !== 'cockpit' && activeName !== 'observer') {
      flashT = 0.07;
      const mz = activeName === 'sniper' ? -1.55 : activeName === 'fifty' ? -1.0 : -1.1;
      flash.position.set(0, activeName === 'fifty' ? 0.005 : 0.012, mz);
      flash.material.opacity = 1;
      flash.scale.setScalar(activeName === 'rifle' ? 0.35 : 0.5);
    }
    lastRecoil = recoil;
    flashT = Math.max(0, flashT - dt);
    flash.material.opacity = flashT > 0 ? flashT / 0.07 : 0;
    const kick = recoil * (activeName === 'fifty' ? 0.05 : 0.035);
    root.position.set(0.24 + bobX, -0.25 + bobY, 0);
    if (activeName === 'cockpit' || activeName === 'observer') root.position.set(bobX * 0.5, bobY * 0.5, 0);
    root.position.z += kick;
    root.rotation.set(kick * 1.6, 0.10 + bobX * 0.5, bobX * 0.3);
    if (activeName === 'cockpit' || activeName === 'observer') root.rotation.y = bobX * 0.5;
  }

  return { root, show, hide, update, has: seat => !!SEAT_VM[seat] };
}

global.AegisViewModels = { create, SEAT_VM };
})(window);
