import * as THREE from 'three'
import { PATIENTS, DEFAULT_PATIENT, SHAPE_ORDER, SHAPE_COUNT } from '../scene/patientRegions'

// The realistic patient's material: the model's own PBR textures on a MeshPhysicalMaterial (sheen
// for the soft grazing light on skin and fabric), plus everything the app draws on the body,
// inside each region's capsule (scene/patientRegions.js) with a soft edge:
//
//   pain look   burning (rising flickering heat), sharp (jumping sparks), aching (slow pulse),
//               glowing through the skin, brighter with the 0–10 rating
//   speech glow the speaker's color, fading out
//   ring        a thin outline on the region's edge: selected, listening, hovered
//   breathing   the chest rises and falls slightly (vertex displacement)
//   see-through Show Anatomy: inside a capsule around one region the skin turns see-through
//               (a Fresnel rim keeps the outline), so the reference anatomy inside shows
//
// One program for both materials (body and head); uniforms are shared, so a region painted on
// the shoulder shows wherever the shoulder's capsule touches either texture.

export const PAIN_TYPE_IDS = { burning: 1, sharp: 2, aching: 3 }
const N = SHAPE_COUNT

const uniforms = {
  uTime: { value: 0 },
  uShapeA: { value: SHAPE_ORDER.map(() => new THREE.Vector3()) },
  uShapeB: { value: SHAPE_ORDER.map(() => new THREE.Vector3()) },
  uShapeR: { value: new Array(N).fill(0) },
  uPainType: { value: new Array(N).fill(0) },
  uPainLevel: { value: new Array(N).fill(0) },
  uGlowColor: { value: Array.from({ length: N }, () => new THREE.Color(0, 0, 0)) },
  uGlowLevel: { value: new Array(N).fill(0) },
  uRingColor: { value: Array.from({ length: N }, () => new THREE.Color(1, 1, 1)) },
  uRingLevel: { value: new Array(N).fill(0) },
  // Pain-path pulse: a point of light (head + two trailing samples) in body space.
  uPulse: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uPulseColor: { value: new THREE.Color(1, 1, 1) },
  uPulseLevel: { value: 0 },
  // Show Anatomy (src/scene/anatomy.js): a see-through capsule (a→b, radius) in body space,
  // faded in and out.
  uXrayA: { value: new THREE.Vector3() },
  uXrayB: { value: new THREE.Vector3() },
  uXrayRadius: { value: 0.2 },
  uXrayLevel: { value: 0 },
  uXrayShowMark: { value: 1 },
}

const index = Object.fromEntries(SHAPE_ORDER.map((id, i) => [id, i]))

export const patientUniforms = {
  // The region capsules of the patient on screen (scene/patientRegions.js → PATIENTS).
  setShapes(shapes) {
    SHAPE_ORDER.forEach((id, i) => {
      uniforms.uShapeA.value[i].copy(shapes[id].a)
      uniforms.uShapeB.value[i].copy(shapes[id].b)
      uniforms.uShapeR.value[i] = shapes[id].r
    })
  },
  setTime(t) {
    uniforms.uTime.value = t
  },
  // Show Anatomy: a capsule a→b with radius in body space (meters); level 0 = normal skin,
  // 1 = see-through.
  setXray(a, b, radius, level, showMark = true) {
    if (a) uniforms.uXrayA.value.copy(a)
    if (b) uniforms.uXrayB.value.copy(b)
    if (radius) uniforms.uXrayRadius.value = radius
    uniforms.uXrayLevel.value = level
    uniforms.uXrayShowMark.value = showMark ? 1 : 0
  },
  xrayLevel: () => uniforms.uXrayLevel.value,
  setPain(region, type, level) {
    const i = index[region]
    if (i === undefined) return
    uniforms.uPainType.value[i] = PAIN_TYPE_IDS[type] ?? 0
    uniforms.uPainLevel.value[i] = type ? level : 0
  },
  setGlow(region, color, level) {
    const i = index[region]
    if (i === undefined) return
    if (color) uniforms.uGlowColor.value[i].copy(color)
    uniforms.uGlowLevel.value[i] = color ? level : 0
  },
  setRing(region, color, level) {
    const i = index[region]
    if (i === undefined) return
    if (color) uniforms.uRingColor.value[i].set(color)
    uniforms.uRingLevel.value[i] = level
  },
  // points: head, then two trailing positions (body space); level 0 hides the pulse.
  setPulse(points, color, level) {
    points.forEach((p, i) => uniforms.uPulse.value[i].copy(p))
    if (color) uniforms.uPulseColor.value.copy(color)
    uniforms.uPulseLevel.value = level
  },
  clearRings() {
    uniforms.uRingLevel.value.fill(0)
  },
}

const COMMON_GLSL = /* glsl */ `
  #define SHAPES ${N}
  uniform float uTime;
  uniform vec3 uShapeA[SHAPES];
  uniform vec3 uShapeB[SHAPES];
  uniform float uShapeR[SHAPES];
  uniform float uPainType[SHAPES];
  uniform float uPainLevel[SHAPES];
  uniform vec3 uGlowColor[SHAPES];
  uniform float uGlowLevel[SHAPES];
  uniform vec3 uRingColor[SHAPES];
  uniform float uRingLevel[SHAPES];
  uniform vec3 uPulse[3];
  uniform vec3 uPulseColor;
  uniform float uPulseLevel;
  uniform vec3 uXrayA;
  uniform vec3 uXrayB;
  uniform float uXrayRadius;
  uniform float uXrayLevel;
  uniform float uXrayShowMark;
  varying vec3 vRest;

  float capsuleDist(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }
`

const NOISE_GLSL = /* glsl */ `
  float painHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float painNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(painHash(i), painHash(i + vec3(1, 0, 0)), f.x),
          mix(painHash(i + vec3(0, 1, 0)), painHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(painHash(i + vec3(0, 0, 1)), painHash(i + vec3(1, 0, 1)), f.x),
          mix(painHash(i + vec3(0, 1, 1)), painHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // p in meters on the 1.8 m body.
  vec3 painLook(float type, vec3 p, float t) {
    if (type < 0.5) return vec3(0.0);
    if (type < 1.5) {
      float n1 = painNoise(p * 16.0 + vec3(0.0, -t * 2.2, 0.0));
      float n2 = painNoise(p * 36.0 + vec3(t * 1.3, -t * 3.6, 0.0));
      float heat = clamp(n1 * 0.75 + n2 * 0.45, 0.0, 1.0);
      float flicker = 0.75 + 0.25 * sin(t * 23.0 + n1 * 7.0);
      return mix(vec3(0.9, 0.08, 0.02), vec3(1.0, 0.55, 0.08), heat) * (0.45 + 1.0 * heat) * flicker;
    }
    if (type < 2.5) {
      float tick = floor(t * 7.0);
      vec3 q = p * 26.0;
      vec3 seed = floor(q) + tick * vec3(1.7, 9.2, 3.1);
      vec3 spot = vec3(painHash(seed), painHash(seed + 11.3), painHash(seed + 27.1));
      float d = length(fract(q) - (0.2 + 0.6 * spot));
      float spark = step(0.7, painHash(seed + 5.7)) * pow(smoothstep(0.42, 0.0, d), 1.5);
      return vec3(1.0, 0.8, 0.12) * 0.45 + vec3(1.0, 0.97, 0.8) * spark * (2.4 + 0.5 * sin(t * 44.0));
    }
    float beat = pow(0.5 + 0.5 * sin(t * 6.2831853), 1.6);
    float n = painNoise(p * 12.0 + t * 0.25);
    return vec3(0.55, 0.25, 1.0) * (0.45 + 1.2 * beat) * (0.8 + 0.4 * n);
  }
`

const VERTEX_GLSL = /* glsl */ `
  #include <begin_vertex>
  // Compressed models store positions quantized; uRestMatrix maps them back to body meters.
  vRest = (uRestMatrix * vec4(position, 1.0)).xyz;
  // Breathing: the chest and upper back move a few millimeters along the normal, ~14 breaths/min.
  float chest = smoothstep(1.02, 1.22, vRest.y) * (1.0 - smoothstep(1.38, 1.5, vRest.y))
              * (1.0 - smoothstep(0.16, 0.24, abs(vRest.x)));
  transformed += objectNormal * chest * 0.0035 * (0.5 + 0.5 * sin(uTime * 1.45));
`

const DIFFUSE_GLSL = /* glsl */ `
  #include <color_fragment>
  // Per-region masks, used again for emissive below.
  float painMask[SHAPES];
  float painCore[SHAPES];
  float ringBand[SHAPES];
  float anyPain = 0.0;
  for (int i = 0; i < SHAPES; i++) {
    float d = capsuleDist(vRest, uShapeA[i], uShapeB[i], uShapeR[i]);
    painMask[i] = 1.0 - smoothstep(-0.025, 0.02, d);
    // Strongest at the center of the region, fading toward its edge, like pain under the skin.
    painCore[i] = mix(0.3, 1.0, smoothstep(0.0, -0.75 * uShapeR[i], d));
    ringBand[i] = 1.0 - smoothstep(0.0, 0.009, abs(d + 0.004));
    anyPain = max(anyPain, painMask[i] * painCore[i] * step(0.5, uPainType[i]) * (0.4 + 0.6 * uPainLevel[i]));
  }
  // Inflamed skin reads darker and redder under the glow, so the color carries.
  diffuseColor.rgb *= 1.0 - 0.45 * anyPain;
`

const EMISSIVE_GLSL = /* glsl */ `
  #include <emissivemap_fragment>
  {
    vec3 extra = vec3(0.0);
    for (int i = 0; i < SHAPES; i++) {
      float level = uPainType[i] > 0.5 ? 0.4 + 0.8 * uPainLevel[i] : 0.0;
      vec3 pain = painLook(uPainType[i], vRest, uTime) * level * painMask[i] * painCore[i];
      vec3 glow = uGlowColor[i] * uGlowLevel[i] * painMask[i] * 0.9;
      extra = max(extra, max(pain, glow));
      extra += uRingColor[i] * uRingLevel[i] * ringBand[i] * 1.6;
    }
    // Pain-path pulse: a bright core with a fading tail, through skin and clothes alike.
    if (uPulseLevel > 0.0) {
      float p0 = exp(-pow(length(vRest - uPulse[0]) / 0.075, 2.0));
      float p1 = exp(-pow(length(vRest - uPulse[1]) / 0.065, 2.0)) * 0.55;
      float p2 = exp(-pow(length(vRest - uPulse[2]) / 0.055, 2.0)) * 0.3;
      vec3 core = mix(uPulseColor, vec3(1.0), 0.35);
      extra += core * (p0 + p1 + p2) * uPulseLevel * 2.6;
    }
    totalEmissiveRadiance += extra;
  }
`

// Show Anatomy: see-through skin near the region, solid outline at grazing angles (Fresnel), and
// the patient's own pain mark kept visible unless "Hide Mark" is on.
const XRAY_GLSL = /* glsl */ `
  if (uXrayLevel > 0.0) {
    float d = capsuleDist(vRest, uXrayA, uXrayB, 0.0);
    float inside = 1.0 - smoothstep(uXrayRadius * 0.7, uXrayRadius, d);
    float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
    float rim = pow(1.0 - facing, 2.5);
    float seeThrough = clamp(mix(1.0, 0.08 + 0.55 * rim, uXrayLevel * inside), 0.0, 1.0);
    seeThrough = max(seeThrough, uXrayShowMark * min(uXrayLevel, 1.0) * inside * anyPain * 0.35);
    diffuseColor.a *= seeThrough;
  }
  #include <opaque_fragment>
`

// Wrap a loaded glTF material: same textures, physical shading, the app's overlays.
// restMatrix: the mesh's transform into body space (meters, feet at y = 0).
export function createPatientMaterial(source, restMatrix, maxAnisotropy = 8) {
  const material = new THREE.MeshPhysicalMaterial({
    name: source.name,
    map: source.map,
    normalMap: source.normalMap,
    roughnessMap: source.roughnessMap,
    metalnessMap: source.metalnessMap,
    roughness: 1,
    metalness: 0,
    // Soft grazing light on skin and fabric.
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#ffd9c4'),
    specularIntensity: 0.55,
    // Hair cards are alpha-cut and two-sided; keep the model's settings.
    alphaMap: source.alphaMap,
    alphaTest: source.alphaTest,
    transparent: source.transparent,
    side: source.side,
  })
  for (const t of [material.map, material.normalMap, material.roughnessMap]) {
    if (t) t.anisotropy = maxAnisotropy
  }
  const own = { uRestMatrix: { value: restMatrix.clone() } }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, own)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_GLSL}\nuniform mat4 uRestMatrix;`)
      .replace('#include <begin_vertex>', VERTEX_GLSL)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_GLSL}\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', DIFFUSE_GLSL)
      .replace('#include <emissivemap_fragment>', EMISSIVE_GLSL)
      .replace('#include <opaque_fragment>', XRAY_GLSL)
  }
  material.customProgramCacheKey = () => 'patient-material-v4'
  return material
}

patientUniforms.setShapes(PATIENTS[DEFAULT_PATIENT].shapes)
