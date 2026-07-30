/* ============================================================================
   AEGIS OVERWATCH — articulated locomotion
   ----------------------------------------------------------------------------
   An InstancedMesh gives you exactly one matrix per instance, so a merged
   person can never swing a leg and a merged car can never spin a wheel. Every
   population in this demo was merged, which is why the crowd slid and the
   traffic rolled on welded tyres.

   The fix is to split each rig into a handful of instanced PARTS that share an
   instance index. Five meshes draw 120 pedestrians with a real gait; one more
   draws every wheel on the road. Draw calls stay in single digits.

   Two rules make the difference between a walk and a slide:

     1. GAIT PHASE COMES FROM DISTANCE TRAVELLED, never from the clock. Feet
        then land where the ground is, stride length scales with speed, and a
        figure that stops has its legs stop with it. Driving the cycle off
        elapsed time is the single most obvious tell of a fake walk.
     2. Every part geometry is authored with its PIVOT AT THE ORIGIN — hip for
        legs, shoulder for arms, axle for wheels — so the instance matrix can
        rotate it about the right point without a second transform.
   ============================================================================ */
(function (global) {
'use strict';

const M = global.AegisModels;

/* proportions lifted from AegisModels.buildPerson so the rig and the original
   silhouette are the same figure */
const SKIN = 0xe8c9a8, CLOTH_A = 0x6f8496, CLOTH_B = 0x3f4a55, SHOE = 0x2b3138;
const H = 1.0;
const HIP_Y = 0.375 * H;          // leg pivot
const SHO_Y = 0.735 * H;          // arm pivot
const LEG_Z = 0.072 * H;          // hip half-separation
const ARM_Z = 0.180 * H;          // shoulder half-separation
const LEG_L = 0.375 * H;          // hip to sole
const ARM_L = 0.300 * H;

function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

/* ---------------------------------------------------------------- pedestrian
   Five parts. The torso carries head, neck, chest and hips and pivots at the
   feet; legs pivot at the hip; arms at the shoulder. */
function buildPersonRig(opt) {
  const o = opt || {};
  const skin = o.skin === undefined ? SKIN : o.skin;
  const a = o.clothA === undefined ? CLOTH_A : o.clothA;
  const b = o.clothB === undefined ? CLOTH_B : o.clothB;

  const torso = M.mergeParts([
    { geo: new THREE.SphereGeometry(0.115 * H, 7, 5), matrix: M.mat([0, 0.885 * H, 0]), color: skin },
    { geo: new THREE.CylinderGeometry(0.055 * H, 0.07 * H, 0.09 * H, 6), matrix: M.mat([0, 0.79 * H, 0]), color: skin },
    { geo: new THREE.CylinderGeometry(0.155 * H, 0.115 * H, 0.34 * H, 7), matrix: M.mat([0, 0.58 * H, 0]), color: a },
    { geo: new THREE.CylinderGeometry(0.115 * H, 0.125 * H, 0.10 * H, 7), matrix: M.mat([0, 0.375 * H, 0]), color: b },
  ]);

  /* A leg hangs DOWN from the origin, so the origin is the hip joint.
     The foot points along +Z, because +Z is forward: the rest of the app sets
     a walker's rotation to atan2(dx, dz), which maps model +Z onto the heading.
     The original merged person had its foot along +X, so the whole crowd was
     walking sideways — visible as a shuffle rather than a stride. */
  const leg = M.mergeParts([
    { geo: new THREE.CylinderGeometry(0.058 * H, 0.048 * H, LEG_L, 5),
      matrix: M.mat([0, -LEG_L * 0.5, 0]), color: b },
    { geo: box(0.075 * H, 0.045 * H, 0.10 * H),
      matrix: M.mat([0, -LEG_L + 0.022 * H, 0.018 * H]), color: SHOE },
  ]);

  /* an arm hangs DOWN from the origin, so the origin is the shoulder */
  const arm = M.mergeParts([
    { geo: new THREE.CylinderGeometry(0.042 * H, 0.036 * H, ARM_L, 5),
      matrix: M.mat([0, -ARM_L * 0.5, 0]), color: a },
    { geo: new THREE.SphereGeometry(0.038 * H, 5, 4), matrix: M.mat([0, -ARM_L, 0]), color: skin },
  ]);

  return { torso, leg, arm, HIP_Y, SHO_Y, LEG_Z, ARM_Z, LEG_L, ARM_L };
}

/* ------------------------------------------------------------------- wheel
   Axle along LOCAL Z, centred on the origin, so an instance matrix built as
   Euler(0, yaw + steer, roll, 'YXZ') rolls it about its own axle. (The merged
   vehicles had their wheel axles along X — fore and aft — which is invisible
   while they are welded solid and very visible the moment they turn.) */
function buildWheel(r, w) {
  const TYRE = 0x14181c, RIM = 0x8fa3b0;
  const rot = [Math.PI / 2, 0, 0];
  return M.mergeParts([
    { geo: new THREE.CylinderGeometry(r, r, w, 10), matrix: M.mat([0, 0, 0], rot), color: TYRE },
    { geo: new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 1.05, 8), matrix: M.mat([0, 0, 0], rot), color: RIM },
    /* one spoke bar, so rotation is legible instead of a featureless disc */
    { geo: box(r * 1.5, r * 0.18, w * 1.08), matrix: M.mat([0, 0, 0], rot), color: RIM },
  ]);
}

/* ------------------------------------------------------------------ gait math
   Advance the phase by the distance covered, not the time elapsed. */
const TAU = Math.PI * 2;

/* Stride grows with speed the way a real one does — a fast walk lengthens the
   step rather than just cycling the same short step faster. */
function strideFor(speed) { return 0.34 + Math.min(0.55, speed * 0.30); }

function stepGait(g, dist, speed) {
  return (g + (dist / strideFor(speed)) * TAU) % TAU;
}

/* Returns the pose for one walker. Amplitudes fall off to an idle stance as
   speed goes to zero, so a stopped figure stands instead of marking time. */
function walkPose(gait, speed, out) {
  const drive = Math.min(1, speed / 0.55);
  const swing = 0.62 * drive;
  const s = Math.sin(gait), c = Math.cos(gait);
  out.legL = s * swing;
  out.legR = -s * swing;
  /* arms counter-swing at about two thirds of the leg amplitude */
  out.armL = -s * swing * 0.66;
  out.armR = s * swing * 0.66;
  /* the body drops at mid-stance and rises over the straight leg: two bobs per
     cycle, which is why the term is 2*gait and not gait */
  out.bob = -Math.abs(c) * 0.022 * drive;
  out.lean = drive * 0.06;
  return out;
}

/* -------------------------------------------------------------- bird flap */
function buildBirdRig() {
  const body = M.mergeParts([
    { geo: new THREE.SphereGeometry(0.055, 6, 4), matrix: M.mat([0, 0, 0], null, [1.7, 0.8, 0.8]), color: 0xd8ecff },
  ]);
  /* wing roots at the origin so a roll rotation flaps it */
  const wing = M.mergeParts([
    { geo: box(0.10, 0.012, 0.20), matrix: M.mat([0, 0, 0.10]), color: 0xd8ecff },
  ]);
  return { body, wing };
}

global.AegisAnim = {
  buildPersonRig, buildWheel, buildBirdRig,
  stepGait, walkPose, strideFor, TAU,
  HIP_Y, SHO_Y, LEG_Z, ARM_Z, LEG_L, ARM_L,
};
})(window);
