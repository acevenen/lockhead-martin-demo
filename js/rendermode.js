/* ============================================================================
   AEGIS OVERWATCH — render mode authority
   ----------------------------------------------------------------------------
   Two complete looks over ONE scene graph:

     HOLO  — the tactical hologram. Additive wireframe terrain, unlit emissive
             models washed to a single hue, black void, scanlines. Everything
             reads as projected light.
     REAL  — a lit world. Solid shaded terrain with real ground colour, sky
             gradient, distance fog, directional sun + ambient fill, and models
             in their authored materials.

   PRACTICAL DESIGN
   * Modes swap MATERIAL STATE, never geometry. Nothing is rebuilt, so toggling
     is instant and cannot desync the sim.
   * Every material the app creates is REGISTERED here with a role. Adding a new
     object later means one register() call, not edits in two places — that is
     the whole point of routing it through one authority.
   * Model materials keep their authored vertex colours in REAL and are washed
     to the hologram hue in HOLO, so the same geometry serves both looks.
   ============================================================================ */
(function (global) {
'use strict';

const ROLES = ['terrain', 'model', 'wire', 'water', 'veg', 'grass', 'fx', 'overlay', 'road', 'life'];

function create(opts) {
  const scene = opts.scene, renderer = opts.renderer;
  const registry = [];                 // {mat, role, base:{...}}
  let mode = 'holo';

  /* lighting rigs, both built once and toggled */
  const ambHolo = new THREE.AmbientLight(0xffffff, 0.55);
  const keyHolo = new THREE.DirectionalLight(0xffffff, 0.85); keyHolo.position.set(60, 120, 40);
  const rimHolo = new THREE.DirectionalLight(0x66c8ff, 0.35); rimHolo.position.set(-70, 40, -60);

  const ambReal = new THREE.AmbientLight(0xb9cfe0, 0.62);
  const sunReal = new THREE.DirectionalLight(0xfff2dc, 1.15); sunReal.position.set(90, 150, 60);
  const bounceReal = new THREE.DirectionalLight(0x6a5c46, 0.30); bounceReal.position.set(-60, -30, -40);
  scene.add(ambHolo, keyHolo, rimHolo, ambReal, sunReal, bounceReal);

  /* sky dome for REAL — a big inverted sphere with a vertical gradient */
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(0x2f6fa8) }, uBot: { value: new THREE.Color(0xcfd8dc) },
                uHaze: { value: new THREE.Color(0xe8e2d4) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uTop, uBot, uHaze; varying vec3 vP;
      void main(){
        float h = clamp(vP.y / 900.0, -1.0, 1.0);
        vec3 c = mix(uHaze, uTop, smoothstep(0.0, 0.55, h));
        c = mix(uBot, c, smoothstep(-0.25, 0.06, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.visible = false;
  scene.add(sky);

  const fogReal = new THREE.Fog(0xc9d4dc, 190, 640);

  /* snapshot a material so we can restore it exactly */
  function snapshot(mat) {
    return {
      color: mat.color ? mat.color.clone() : null,
      opacity: mat.opacity,
      transparent: mat.transparent,
      blending: mat.blending,
      depthWrite: mat.depthWrite,
      vertexColors: mat.vertexColors,
      wireframe: mat.wireframe,
      fog: mat.fog,
      map: mat.map || null,
    };
  }

  /* Register a material with the role that decides how each mode treats it.
     Call this once for anything new; both looks then come for free. */
  function register(mat, role) {
    if (!mat) return mat;
    if (Array.isArray(mat)) { mat.forEach(m2 => register(m2, role)); return mat; }
    if (mat.__aegisRole) return mat;                       // already registered
    mat.__aegisRole = role || 'model';
    registry.push({ mat, role: mat.__aegisRole, base: snapshot(mat) });
    apply(registry[registry.length - 1]);
    return mat;
  }
  function registerObject(obj, role) {
    obj.traverse(n => { if (n.material) register(n.material, role); });
    return obj;
  }
  /* Anything rebuilt per destination (the street overlay, for one) has to drop
     its old material here as well as dispose it, or the registry accumulates
     dead entries that setMode still walks on every toggle. */
  function unregister(mat) {
    if (!mat) return;
    if (Array.isArray(mat)) { mat.forEach(unregister); return; }
    const i = registry.findIndex(e => e.mat === mat);
    if (i >= 0) registry.splice(i, 1);
    delete mat.__aegisRole;
  }

  const HOLO_HUE = new THREE.Color(0x53e6ff);
  function applyHolo(e) {
    const m = e.mat, b = e.base;
    switch (e.role) {
      case 'model':
      case 'life':
        /* wash the authored colours toward the hologram hue and go emissive */
        m.vertexColors = b.vertexColors;
        m.transparent = true; m.opacity = 0.72;
        m.blending = THREE.AdditiveBlending;
        m.depthWrite = false;
        if (m.color) m.color.copy(HOLO_HUE);
        m.fog = false;
        break;
      case 'wire':
      case 'road':
        m.transparent = true; m.opacity = b.opacity;
        m.blending = THREE.AdditiveBlending; m.depthWrite = false;
        if (m.color && b.color) m.color.copy(b.color);
        m.fog = false;
        break;
      case 'veg':
        m.transparent = true; m.opacity = 0.55;
        m.blending = THREE.AdditiveBlending; m.depthWrite = false;
        m.fog = false;
        break;
      case 'grass':
        /* ground cover is a soft sprite in both looks — never made opaque, or
           a point near the camera fills the screen with a hard square */
        m.transparent = true; m.opacity = b.opacity;
        m.blending = THREE.AdditiveBlending; m.depthWrite = false;
        m.fog = false;
        break;
      case 'water':
        /* the mask rides in the vertex colour here — additive blending turns a
           dry vertex into nothing at all, which is exactly the falloff wanted */
        m.vertexColors = b.vertexColors;
        m.transparent = true; m.opacity = 0.5;
        m.blending = THREE.AdditiveBlending; m.depthWrite = false;
        m.fog = false;
        break;
      default:
        m.transparent = b.transparent; m.opacity = b.opacity;
        m.blending = b.blending; m.depthWrite = b.depthWrite;
        if (m.color && b.color) m.color.copy(b.color);
        m.fog = false;
    }
    m.needsUpdate = true;
  }
  function applyReal(e) {
    const m = e.mat, b = e.base;
    switch (e.role) {
      case 'model':
      case 'life':
        m.vertexColors = b.vertexColors;
        m.transparent = false; m.opacity = 1;
        m.blending = THREE.NormalBlending; m.depthWrite = true;
        if (m.color) m.color.setRGB(1, 1, 1);   // let the baked vertex colours through
        m.fog = true;
        break;
      case 'veg':
        m.transparent = false; m.opacity = 1;
        m.blending = THREE.NormalBlending; m.depthWrite = true;
        m.fog = true;
        break;
      case 'grass':
        m.transparent = true; m.opacity = Math.min(0.7, b.opacity * 1.6);
        m.blending = THREE.NormalBlending; m.depthWrite = false;
        m.fog = true;
        break;
      case 'water':
        /* lit water is one colour shaped by its alphaMap — the vertex mask is
           dropped, or the shoreline reads as a black fringe instead of shallows */
        m.vertexColors = false;
        m.transparent = true; m.opacity = 0.82;
        m.blending = THREE.NormalBlending; m.depthWrite = false;
        m.fog = true;
        break;
      case 'wire':
        /* the holo scaffolding has no place in a lit world */
        m.transparent = true; m.opacity = 0;
        m.blending = THREE.NormalBlending; m.depthWrite = false;
        m.fog = false;
        break;
      case 'overlay':
        m.transparent = true; m.opacity = b.opacity * 0.35;
        m.blending = THREE.NormalBlending; m.depthWrite = false;
        m.fog = true;
        break;
      case 'road':
        /* The street canvas is drawn in projection cyan. Its ALPHA is the road
           network, so tinting the material asphalt and blending normally turns
           the same texture into a real street grid — no second canvas. */
        m.transparent = true; m.opacity = 0.72;
        m.blending = THREE.NormalBlending; m.depthWrite = false;
        if (m.color) m.color.setHex(0x2f3238);
        m.fog = true;
        break;
      default:
        m.transparent = b.transparent; m.opacity = b.opacity;
        m.blending = b.blending; m.depthWrite = b.depthWrite;
        if (m.color && b.color) m.color.copy(b.color);
        m.fog = false;
    }
    m.needsUpdate = true;
  }
  function apply(e) { (mode === 'holo' ? applyHolo : applyReal)(e); }

  function setMode(next) {
    if (next !== 'holo' && next !== 'real') return mode;
    mode = next;
    for (const e of registry) apply(e);
    const real = mode === 'real';
    ambHolo.visible = keyHolo.visible = rimHolo.visible = !real;
    ambReal.visible = sunReal.visible = bounceReal.visible = real;
    sky.visible = real;
    scene.fog = real ? fogReal : null;
    renderer.setClearColor(real ? 0xc9d4dc : 0x04080f, 1);
    document.body.classList.toggle('realmode', real);
    return mode;
  }

  /* keep the sky centred on the viewer so it never clips */
  function update(camera) { if (sky.visible) sky.position.copy(camera.position); }

  return {
    register, registerObject, unregister, setMode, update,
    get mode() { return mode; },
    isReal: () => mode === 'real',
    count: () => registry.length,
    ROLES,
  };
}

global.AegisRenderMode = { create, ROLES };
})(window);
