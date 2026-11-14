/* Lean Atlas — 3D anatomy viewer (three.js)
   Model: assets/body.glb, derived from Z-Anatomy / BodyParts3D (CC BY-SA).
   The body sits on a turntable under fixed studio lights; the camera only dollies.
   Talks to app.js through window events (la:progress, la:ready, la:hover, la:pick)
   and the window.LAView API. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const stage = document.getElementById("stage");
const canvas = document.getElementById("gl");
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
const coarse = matchMedia("(pointer: coarse)").matches;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
} catch (e) {
  emit("la:error", { message: "WebGL unavailable" });
  throw e;
}
const DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const BG = new THREE.Color("#050406");
const scene = new THREE.Scene();
scene.background = BG;
scene.fog = new THREE.Fog(BG, 7.5, 15);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 40);

/* ---------- lights: warm key, teal + crimson rims ---------- */
const key = new THREE.DirectionalLight("#fff1e0", 2.5);
key.position.set(2.6, 3.3, 3.0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -1.3, right: 1.3, top: 2.1, bottom: -0.3, near: 0.5, far: 9 });
key.shadow.bias = -0.0005; key.shadow.normalBias = 0.012; key.shadow.radius = 5;
key.target.position.set(0, 0.9, 0);
const rimCool = new THREE.DirectionalLight("#59d0e6", 3.4); rimCool.position.set(-3.2, 2.2, -3);
const rimHot = new THREE.DirectionalLight("#ff3b30", 2.6); rimHot.position.set(3.4, 1.4, -2.6);
const fill = new THREE.DirectionalLight("#8d9bff", 0.55); fill.position.set(-2.6, 0.8, 2.6); fill.intensity = 0.42;
const under = new THREE.PointLight("#ff4a3a", 1.4, 3.2, 1.6); under.position.set(0, 0.12, 0.9);
scene.add(key, key.target, rimCool, rimHot, fill, under, new THREE.HemisphereLight("#b9c4ff", "#1a0b0b", 0.22));

/* ---------- set: plinth, haze, light shaft, dust ---------- */
const set = new THREE.Group(); scene.add(set);
const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(0.62, 0.66, 0.06, 128),
  new THREE.MeshStandardMaterial({ color: "#0d0c10", roughness: 0.28, metalness: 0.85, envMapIntensity: 0.9 })
);
plinth.position.y = -0.03; plinth.receiveShadow = true; set.add(plinth);
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.675, 0.0035, 12, 200),
  new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff3b30").multiplyScalar(2.4) }));
ring.rotation.x = Math.PI / 2; ring.position.y = -0.028; set.add(ring);

function radialTexture(stops, size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"), r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) r.addColorStop(o, col);
  g.fillStyle = r; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64),
  new THREE.MeshStandardMaterial({ color: "#09080b", roughness: 0.55, metalness: 0.4, envMapIntensity: 0.25 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.06; floor.receiveShadow = true; set.add(floor);
const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.MeshBasicMaterial({
  map: radialTexture([[0, "rgba(255,70,50,.34)"], [0.35, "rgba(120,30,40,.12)"], [1, "rgba(0,0,0,0)"]]),
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
pool.rotation.x = -Math.PI / 2; pool.position.y = -0.055; set.add(pool);

const haze = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({
  map: radialTexture([[0, "rgba(70,150,175,.30)"], [0.4, "rgba(60,40,90,.14)"], [1, "rgba(0,0,0,0)"]]),
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
haze.position.set(0, 1.25, -3.2); set.add(haze);

const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 1.05, 3.4, 48, 1, true), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uColor: { value: new THREE.Color("#ffe9cf") } },
  vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }",
  fragmentShader: "uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float edge=pow(abs(dot(normalize(vN),normalize(vV))),2.2); float a=smoothstep(0.0,0.9,vUv.y)*edge*0.075; gl_FragColor=vec4(uColor*a,a); }"
}));
shaft.position.y = 1.7; set.add(shaft);

const DUST = 260, dustPos = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) {
  const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.1;
  dustPos.set([Math.cos(a) * r, Math.random() * 2.6, Math.sin(a) * r * 0.8], i * 3); dustSeed[i] = Math.random() * 100;
}
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: 0.012, map: radialTexture([[0, "rgba(255,235,215,1)"], [1, "rgba(255,235,215,0)"]], 64),
  transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
set.add(dust);

/* ---------- muscle material with procedural fibres ---------- */
const FIBRE_GLSL = /* glsl */`
uniform float uFibre; uniform float uGhost;
varying vec3 vFib; varying vec3 vObj;
float h13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fibreStrand(vec3 p, vec3 a){
  a=normalize(a+vec3(1e-4));
  vec3 t1=normalize(cross(a, abs(a.y)<0.95?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0))); vec3 t2=cross(a,t1);
  vec3 q=vec3(dot(p,t1),dot(p,t2),dot(p,a));
  float bundles=vnoise(vec3(q.xy*150.0,q.z*6.0));
  float fine=vnoise(vec3(q.xy*620.0,q.z*14.0));
  float fw=length(fwidth(p))*620.0;
  float k=1.0-smoothstep(0.3,1.0,fw);
  float k2=1.0-smoothstep(0.5,1.6,length(fwidth(p))*150.0);
  return mix(0.5, mix(bundles, 0.5*bundles+0.5*fine, k), k2);
}
vec3 fibreBump(vec3 p, vec3 n, float h){
  vec3 dpdx=dFdx(p), dpdy=dFdy(p); float dhx=dFdx(h), dhy=dFdy(h);
  vec3 r1=cross(dpdy,n), r2=cross(n,dpdx); float det=dot(dpdx,r1);
  return normalize(abs(det)*n - sign(det)*(dhx*r1+dhy*r2));
}`;
function fibreMaterial(params, strength) {
  const m = new THREE.MeshPhysicalMaterial(params);
  const u = { value: strength }, ghost = { value: 0 };
  m.userData.ghost = ghost;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFibre = u; sh.uniforms.uGhost = ghost;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 fiber;\nvarying vec3 vFib;\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFib = fiber * 2.0 - 1.0;\nvObj = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FIBRE_GLSL)
      .replace("#include <color_fragment>", "#include <color_fragment>\nfloat fS = fibreStrand(vObj, vFib);\ndiffuseColor.rgb *= mix(1.0, mix(0.58, 1.22, fS), uFibre);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (0.5 - fS) * 0.3 * uFibre, 0.06, 1.0);")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = fibreBump(-vViewPosition, normal, fS * uFibre * 0.0009);")
      // x-ray: a ghosted muscle keeps only its rim so deeper, selected muscles show through
      .replace("#include <dithering_fragment>", "#include <dithering_fragment>\nif (uGhost > 0.001) { float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4); gl_FragColor.a *= mix(1.0, 0.03 + 0.5 * fr, uGhost); }");
  };
  m.customProgramCacheKey = () => "fibre";
  return m;
}

const COL = {
  belly: new THREE.Color("#8f1a17"), bellyDim: new THREE.Color("#a33a35"), bellySel: new THREE.Color("#e3231c"),
  bellySec: new THREE.Color("#c9741c"), bellyHot: new THREE.Color("#b8221c"),
  tendon: new THREE.Color("#cdbdaa"), tendonDim: new THREE.Color("#b9aea2"),
  bone: new THREE.Color("#b9ab92"), boneDim: new THREE.Color("#5b534b"),
  cartilage: new THREE.Color("#a8958a"),
  glowSel: new THREE.Color("#ff2a12"), glowSec: new THREE.Color("#ff8a1e"), glowHot: new THREE.Color("#ff3d2a"), black: new THREE.Color(0, 0, 0)
};
const mkBelly = () => fibreMaterial({ color: COL.belly.clone(), roughness: 0.46, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.38,
  sheen: 0.6, sheenColor: new THREE.Color("#ff8a70"), sheenRoughness: 0.5, envMapIntensity: 0.55, emissive: new THREE.Color(0, 0, 0) }, 1);
const mkTendon = () => fibreMaterial({ color: COL.tendon.clone(), roughness: 0.44, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.4,
  sheen: 0.4, sheenColor: new THREE.Color("#ffffff"), envMapIntensity: 0.6, emissive: new THREE.Color(0, 0, 0) }, 0.55);
const boneMats = {
  bone: new THREE.MeshPhysicalMaterial({ color: COL.bone.clone(), roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.4 }),
  cartilage: new THREE.MeshPhysicalMaterial({ color: new THREE.Color("#a8958a"), roughness: 0.5, clearcoat: 0.3, envMapIntensity: 0.4 }),
  teeth: new THREE.MeshPhysicalMaterial({ color: new THREE.Color("#f1ede2"), roughness: 0.25, clearcoat: 0.8, envMapIntensity: 0.6 })
};
const passive = { belly: mkBelly(), tendon: mkTendon() };   // shared by non-interactive muscles + tendons

/* ---------- model ---------- */
const body = new THREE.Group(); scene.add(body);
const groups = {};            // id -> { parts:[{name, belly, tendon}], centroid, dir, radius, state }
const pickable = [];          // meshes used for ray casting (interactive + blockers)
let ready = false, bvhReady = false;

const draco = new DRACOLoader();
draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/");
const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
const MODEL_BYTES = 3253424;
loader.load("assets/body.glb?v=4", onModel,
  (e) => emit("la:progress", { p: Math.min(0.96, e.loaded / (e.lengthComputable && e.total ? e.total : MODEL_BYTES)) }),
  (err) => emit("la:error", { message: String(err && err.message || err) }));

function ownerKey(o) { return (o.userData && o.userData.name) || (o.parent && o.parent.userData && o.parent.userData.name) || o.name; }

function onModel(gltf) {
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const key = ownerKey(o), kind = o.material && o.material.name;
    const g = o.geometry;
    if (g.attributes.color) { g.setAttribute("fiber", g.attributes.color); g.deleteAttribute("color"); }
    o.castShadow = true; o.receiveShadow = true;
    if (key.startsWith("m|")) {
      const [, gid, name] = key.split("|");
      const grp = groups[gid] || (groups[gid] = { id: gid, parts: [], mats: [], state: "idle" });
      let part = grp.parts.find((p) => p.name === name);
      if (!part) grp.parts.push(part = { name });
      const mat = kind === "tendon" ? mkTendon() : mkBelly();
      mat.userData.kind = kind === "tendon" ? "tendon" : "belly";
      o.material = mat; grp.mats.push(mat);
      o.userData.gid = gid; o.userData.part = name;
      part[mat.userData.kind] = o;
    } else if (key === "skeleton") {
      o.material = boneMats[kind] || boneMats.bone;
    } else {
      o.material = kind === "tendon" || key === "tendons" ? passive.tendon : passive.belly;
    }
    pickable.push(o);
  }
  body.add(gltf.scene);

  // per-group centroid + facing direction (from the body's +x half) for camera focus
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const grp of Object.values(groups)) {
    const c = new THREE.Vector3(), d = new THREE.Vector3(); let count = 0; const box = new THREE.Box3();
    for (const p of grp.parts) for (const m of [p.belly, p.tendon]) {
      if (!m) continue;
      const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal;
      for (let i = 0; i < pos.count; i += 5) {
        v.fromBufferAttribute(pos, i);
        if (v.x < 0) continue;
        n.fromBufferAttribute(nor, i); c.add(v); d.add(n); box.expandByPoint(v); count++;
      }
    }
    c.divideScalar(Math.max(count, 1)); d.y = 0;
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    grp.centroid = c; grp.dir = d.normalize(); grp.size = box.getSize(new THREE.Vector3()).length();
  }

  ready = true;
  emit("la:progress", { p: 1 });
  emit("la:ready", { groups: Object.fromEntries(Object.values(groups).map((g) => [g.id, g.parts.map((p) => p.name)])) });
  intro.t0 = performance.now();

  // build ray-casting BVHs off the critical path, one mesh per tick
  let i = 0;
  const step = () => {
    const t = performance.now();
    while (i < pickable.length && performance.now() - t < 12) pickable[i++].geometry.computeBoundsTree();
    if (i < pickable.length) setTimeout(step, 0); else bvhReady = true;
  };
  setTimeout(step, 900);
}

/* ---------- view state ---------- */
const view = {
  rot: -0.5, rotTarget: -0.5, auto: !reduced, autoHold: 0,
  dist: 4.9, distTarget: 4.9, zoom: 1,
  ty: 0.93, tyTarget: 0.93, pitch: 0.035,
  shiftX: 0, shiftY: 0, shiftXT: 0, shiftYT: 0,
  sel: null, sec: [], hot: null
};
const intro = { t0: 0 };
const BASE_DIST = 4.9;
/* best viewing angle per group, in degrees (0 = front, 180 = back, 90 = the body's left side) */
const YAW = { upperChest: 18, midChest: 22, frontDelt: 38, sideDelt: 82, rearDelt: 148, upperTraps: 166, midBack: 172, rotatorCuff: 158,
  lats: 152, lowerBack: 176, biceps: 32, triceps: 146, forearms: 44, abs: 10, obliques: 48, serratus: 62, glutes: 164, gluteMed: 112,
  quads: 20, adductors: 8, hamstrings: 164, calves: 170, tibialis: 26 };

function applyStates() {
  for (const g of Object.values(groups)) {
    g.state = g.id === view.sel ? "sel" : view.sec.includes(g.id) ? "sec" : view.sel ? "dim" : "idle";
    g.hot = g.id === view.hot;
  }
}
const tmp = new THREE.Color();
function setGhost(m, target, k) {
  const g = m.userData.ghost; g.value += (target - g.value) * k;
  if (Math.abs(target - g.value) < 0.004) g.value = target;
  const on = g.value > 0.004;
  if (m.transparent !== on) { m.transparent = on; m.needsUpdate = true; }
  m.depthWrite = g.value < 0.5;
}
function stepMaterials(k) {
  for (const g of Object.values(groups)) for (const m of g.mats) {
    const belly = m.userData.kind === "belly";
    let c, e, ei = 0;
    if (g.state === "sel") { c = belly ? COL.bellySel : COL.tendon; e = COL.glowSel; ei = belly ? 0.55 : 0.1; }
    else if (g.state === "sec") { c = belly ? COL.bellySec : COL.tendon; e = COL.glowSec; ei = belly ? 0.22 : 0.04; }
    else if (g.state === "dim") { c = belly ? COL.bellyDim : COL.tendonDim; e = COL.black; }
    else { c = belly ? COL.belly : COL.tendon; e = COL.black; }
    if (g.hot && g.state !== "sel") { c = belly ? COL.bellyHot : COL.tendon; e = COL.glowHot; ei = belly ? 0.32 : 0.08; }
    m.color.lerp(c, k);
    m.emissive.lerp(tmp.copy(e).multiplyScalar(ei), k);
    setGhost(m, g.state === "dim" && !g.hot ? 1 : 0, k);
  }
  const dim = !!view.sel;
  passive.belly.color.lerp(dim ? COL.bellyDim : COL.belly, k);
  passive.tendon.color.lerp(dim ? COL.tendonDim : COL.tendon, k);
  setGhost(passive.belly, dim ? 1 : 0, k); setGhost(passive.tendon, dim ? 1 : 0, k);
  boneMats.bone.color.lerp(dim ? COL.boneDim : COL.bone, k);
  boneMats.cartilage.color.lerp(dim ? COL.boneDim : COL.cartilage, k);
}

/* ---------- pointer: drag to turn, hover to name, click to pick ---------- */
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
const ndc = new THREE.Vector2();
let drag = null, hoverQueued = null;

function pickAt(x, y) {
  if (!ready || !bvhReady) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickable, false)[0];
  return hit && hit.object.userData.gid ? { group: hit.object.userData.gid, muscle: hit.object.userData.part } : null;
}
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, rot: view.rotTarget, moved: false, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (drag && drag.id === e.pointerId) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; canvas.classList.add("dragging"); setHot(null); emit("la:hover", null); }
    if (drag.moved) { view.rotTarget = drag.rot + dx * 0.0085; view.autoHold = performance.now() + 2600; }
    return;
  }
  if (e.pointerType === "mouse") hoverQueued = { x: e.clientX, y: e.clientY };
});
const endDrag = (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const wasClick = !drag.moved; drag = null; canvas.classList.remove("dragging");
  if (wasClick && e.type === "pointerup") {
    const hit = pickAt(e.clientX, e.clientY);
    if (hit) emit("la:pick", hit); else emit("la:pick", null);
  }
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => { hoverQueued = null; if (!drag) { setHot(null); emit("la:hover", null); } });

function setHot(id) { if (view.hot !== id) { view.hot = id; applyStates(); canvas.style.cursor = id ? "pointer" : ""; } }

/* ---------- post: bloom, then grade (vignette, grain, edge aberration) ---------- */
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: coarse ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(DPR);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.3, 0.7, 0.93);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uFade; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 d=vUv-0.5; float r2=dot(d,d);
      vec2 off=d*r2*0.012;
      vec3 c=vec3(texture2D(tDiffuse,vUv+off).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-off).b);
      c*=mix(1.0,0.2,smoothstep(0.12,0.62,r2));
      c=mix(c, c*vec3(1.05,0.99,0.95)+vec3(0.0,0.006,0.012), 0.6);
      c+=(hash(vUv*vec2(1920.0,1080.0)+fract(uTime)*91.7)-0.5)*0.045;
      gl_FragColor=vec4(c*uFade,1.0);
    }`
});
composer.addPass(grade);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();

let visible = true;
new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.02 }).observe(stage);

/* ---------- loop ---------- */
const clock = new THREE.Clock();
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
  if (!visible) return;
  const k = 1 - Math.exp(-dt * 7);

  if (view.auto && !view.sel && !drag && now > view.autoHold) view.rotTarget += dt * 0.26;
  view.rot += (view.rotTarget - view.rot) * (1 - Math.exp(-dt * 6));
  body.rotation.y = view.rot;

  // dolly-in on first reveal
  let introK = 1;
  if (ready) { introK = easeOut(Math.min(1, (now - intro.t0) / 2400)); grade.uniforms.uFade.value = Math.min(1, (now - intro.t0) / 1300); }
  const aspectFit = Math.max(1, 0.62 / camera.aspect);            // pull back on narrow screens
  const dist = (view.dist + (1 - introK) * 2.2) * aspectFit;
  view.dist += (view.distTarget / view.zoom - view.dist) * k;
  view.ty += (view.tyTarget - view.ty) * k;
  view.shiftX += (view.shiftXT - view.shiftX) * k; view.shiftY += (view.shiftYT - view.shiftY) * k;
  const pitch = view.pitch + (1 - introK) * 0.16;
  camera.position.set(0, view.ty + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  camera.lookAt(0, view.ty, 0);
  const w = stage.clientWidth, h = stage.clientHeight;
  if (Math.abs(view.shiftX) > 0.5 || Math.abs(view.shiftY) > 0.5) camera.setViewOffset(w, h, view.shiftX, view.shiftY, w, h);
  else camera.clearViewOffset();

  if (hoverQueued && !drag) {
    const hit = pickAt(hoverQueued.x, hoverQueued.y);
    setHot(hit ? hit.group : null);
    emit("la:hover", hit ? { ...hit, x: hoverQueued.x, y: hoverQueued.y } : null);
    hoverQueued = null;
  }
  stepMaterials(1 - Math.exp(-dt * 9));

  const t = clock.elapsedTime;
  const p = dust.geometry.attributes.position;
  for (let i = 0; i < DUST; i++) {
    let y = p.getY(i) + dt * (0.012 + (dustSeed[i] % 1) * 0.02); if (y > 2.6) y = 0;
    p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t * 0.3 + dustSeed[i]) * dt * 0.01);
  }
  p.needsUpdate = true;
  ring.material.color.setRGB(2.4, 0.45, 0.32).multiplyScalar(0.85 + Math.sin(t * 1.4) * 0.15);
  grade.uniforms.uTime.value = t;
  composer.render();
}
frame();

/* ---------- API for app.js ---------- */
function nearestAngle(target, from) { const two = Math.PI * 2; return from + ((((target - from) % two) + two + Math.PI) % two - Math.PI); }
window.LAView = {
  get ready() { return ready; },
  select(id, secondary = []) {
    view.sel = groups[id] ? id : null; view.sec = secondary.filter((s) => groups[s] && s !== id);
    applyStates();
    if (view.sel) {
      const g = groups[view.sel];
      const yaw = YAW[view.sel] != null ? YAW[view.sel] : THREE.MathUtils.radToDeg(Math.atan2(g.centroid.x * 0.6, g.centroid.z));
      view.rotTarget = nearestAngle(-THREE.MathUtils.degToRad(yaw), view.rot);
      view.tyTarget = THREE.MathUtils.clamp(g.centroid.y, 0.45, 1.42);
      view.distTarget = THREE.MathUtils.clamp(2.2 + g.size * 1.9, 2.5, 3.9);
    } else { view.tyTarget = 0.93; view.distTarget = BASE_DIST; view.autoHold = performance.now() + 900; }
  },
  setSecondary(secondary = []) { view.sec = secondary.filter((s) => groups[s] && s !== view.sel); applyStates(); },
  hover(id) { view.hot = groups[id] ? id : null; applyStates(); },
  setShift(x, y = 0) { view.shiftXT = x; view.shiftYT = y; },
  face(name) {
    const a = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[name] || 0;
    view.rotTarget = nearestAngle(a, view.rot); view.autoHold = performance.now() + 6000;
  },
  zoom(dir) { view.zoom = THREE.MathUtils.clamp(view.zoom * (dir > 0 ? 1.22 : 1 / 1.22), 0.8, 2.6); },
  setAuto(on) { view.auto = !!on; view.autoHold = 0; },
  get auto() { return view.auto; }
};
emit("la:viewer", {});
