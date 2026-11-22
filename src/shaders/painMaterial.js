import * as THREE from 'three'

// One material for every body part: normal lighting (MeshStandardMaterial) plus a pain look
// added to the emissive light in the fragment shader. All parts share one compiled program;
// each part has its own uniforms.
//
//   burning: red to orange heat rising and flickering fast
//   sharp:   bright white-yellow crackles that jump to new spots ~7 times a second
//   aching:  deep purple, a slow steady pulse about once per second
//
// The rating (0–10) sets brightness. A speech glow mixes in on top (brightest channel wins).
// Every part also gets a hologram rim (Fresnel, brighter where the surface turns away from the
// camera) and faint scan lines rising up the body. Hover raises the rim.

export const PAIN_TYPE_IDS = { burning: 1, sharp: 2, aching: 3 }

// Shared by every material: advance once per frame with setPainTime().
const timeUniform = { value: 0 }

export function setPainTime(seconds) {
  timeUniform.value = seconds
}

const NOISE_GLSL = /* glsl */ `
  uniform float uTime;
  uniform int uPainType;
  uniform float uPainLevel;
  uniform vec3 uGlowColor;
  uniform float uGlowLevel;
  uniform vec3 uRimColor;
  uniform float uRimStrength;
  varying vec3 vPainPos;

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

  vec3 painLook(vec3 p, float t) {
    if (uPainType == 1) {
      // Burning: heat rising (noise scrolls upward), fast irregular flicker.
      float n1 = painNoise(p * 7.0 + vec3(0.0, -t * 2.2, 0.0));
      float n2 = painNoise(p * 16.0 + vec3(t * 1.3, -t * 3.6, 0.0));
      float heat = clamp(n1 * 0.75 + n2 * 0.45, 0.0, 1.0);
      float flicker = 0.72 + 0.28 * sin(t * 23.0 + n1 * 7.0);
      return mix(vec3(0.85, 0.07, 0.02), vec3(1.0, 0.6, 0.08), heat) * (0.35 + 1.0 * heat) * flicker;
    }
    if (uPainType == 2) {
      // Sharp: a yellow tint with small bright sparks. Each cell holds one spark at a random
      // spot; a new random set lights up ~7 times a second, so the stabs jump around.
      float tick = floor(t * 7.0);
      vec3 q = p * 11.0;
      vec3 cell = floor(q);
      vec3 seed = cell + tick * vec3(1.7, 9.2, 3.1);
      vec3 spot = vec3(painHash(seed), painHash(seed + 11.3), painHash(seed + 27.1));
      float d = length(fract(q) - (0.2 + 0.6 * spot));
      float on = step(0.7, painHash(seed + 5.7));
      float spark = on * pow(smoothstep(0.42, 0.0, d), 1.5);
      float flash = 0.5 + 0.5 * sin(t * 44.0);
      return vec3(1.0, 0.82, 0.1) * 0.5 + vec3(1.0, 0.97, 0.8) * spark * (2.4 + flash);
    }
    if (uPainType == 3) {
      // Aching: deep purple, one slow heavy beat per second, slightly uneven.
      float beat = pow(0.5 + 0.5 * sin(t * 6.2831853), 1.6);
      float n = painNoise(p * 5.0 + t * 0.25);
      return vec3(0.55, 0.25, 1.0) * (0.45 + 1.2 * beat) * (0.8 + 0.4 * n);
    }
    return vec3(0.0);
  }
`

// Darken the skin under a pain look so its color reads (light gray + red reads as peach).
const DIFFUSE_GLSL = /* glsl */ `
  #include <color_fragment>
  if (uPainType > 0 && uPainLevel > 0.0) diffuseColor.rgb *= 0.3;
`

const EMISSIVE_GLSL = /* glsl */ `
  #include <emissivemap_fragment>
  {
    // Rating 1/10 is still visible; 10/10 is about 3x brighter.
    float level = uPainLevel > 0.0 ? 0.35 + 0.85 * uPainLevel : 0.0;
    vec3 pain = painLook(vPainPos, uTime) * level;
    vec3 lit = max(pain, uGlowColor * uGlowLevel);

    // Hologram: Fresnel rim in view space (normal and vViewPosition are both view space here),
    // plus one soft scanner band sweeping up the body every ~5 s. Dimmed on painted parts so the
    // pain color stays readable.
    float facing = abs(dot(normal, normalize(vViewPosition)));
    float rim = pow(1.0 - facing, 2.4);
    float bandY = mod(uTime * 0.9, 5.0) - 2.3;
    float band = exp(-pow((vPainPos.y - bandY) * 7.0, 2.0));
    float keep = 1.0 - 0.7 * min(1.0, level + uGlowLevel);
    vec3 holo = uRimColor * (rim * uRimStrength + band * (0.12 + rim * 0.5)) * keep;

    totalEmissiveRadiance = max(totalEmissiveRadiance, lit) + holo;
  }
`

export function createPainMaterial(color) {
  // Dark glassy surface; the rim and the environment reflections do the shaping.
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 })
  const uniforms = {
    uTime: timeUniform,
    uPainType: { value: 0 },
    uPainLevel: { value: 0 },
    uGlowColor: { value: new THREE.Color(0, 0, 0) },
    uGlowLevel: { value: 0 },
    uRimColor: { value: new THREE.Color('#7fd6ff') },
    uRimStrength: { value: 0.9 },
  }
  material.userData.painUniforms = uniforms
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPainPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPainPos = (modelMatrix * vec4(position, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', DIFFUSE_GLSL)
      .replace('#include <emissivemap_fragment>', EMISSIVE_GLSL)
  }
  // Same code for every part, so three.js compiles it once.
  material.customProgramCacheKey = () => 'pain-material-v4'
  return material
}

// type: 'burning' | 'sharp' | 'aching' | null; level: 0–1.
export function setPain(material, type, level) {
  const u = material.userData.painUniforms
  u.uPainType.value = PAIN_TYPE_IDS[type] ?? 0
  u.uPainLevel.value = type ? level : 0
}

// color: THREE.Color or null; level: 0 (off) and up.
export function setGlow(material, color, level) {
  const u = material.userData.painUniforms
  if (color) u.uGlowColor.value.copy(color)
  u.uGlowLevel.value = color ? level : 0
}

// Hologram rim strength: ~0.9 normally, higher on hover or selection.
export function setRim(material, strength) {
  material.userData.painUniforms.uRimStrength.value = strength
}
