import * as THREE from 'three'
import { REGION_IDS } from '../regions'

// Each region is a capsule (segment a→b with radius r) in the patient model's own space:
// meters, feet at y = 0, facing +z, so the PATIENT's left is +x. The shader paints inside these
// shapes with a soft edge; taps map to the nearest shape that contains the hit point.
// Each patient model has its own shapes, measured on its mesh (A-pose).
const v = (x, y, z) => new THREE.Vector3(x, y, z)

// Show Anatomy fit (src/scene/anatomy.js): the reference anatomy is a 1.70 m body with its arms
// hanging straight. `anchor` (a joint in public/models/anatomy.glb) lands on `target`, the whole
// region scales by `scale` about it, and the arm bone swings out about `arm.pivot` by `arm.z`
// degrees (negative = the patient's right arm away from the body) to match the A-pose; the
// shoulder muscles swing `muscleShare` of that.
const ARM_BONE = ['FMA23130'] // humerus
const ARM_MUSCLES = ['FMA34680', 'FMA34682', 'FMA34684'] // deltoid parts: swing part of the way

export const PATIENTS = {
  male: {
    label: 'Male',
    url: '/models/patient.glb', // Rocketbox Sports_Male_04, 1.81 m
    shapes: {
      // Painted on the forehead, temples and crown; tapping anywhere on the head or face counts.
      head: { a: v(0, 1.74, 0.02), b: v(0, 1.8, -0.02), r: 0.1, tapR: 0.17, label: v(0.0, 1.86, 0.06) },
      neck: { a: v(0, 1.45, -0.01), b: v(0, 1.56, 0.0), r: 0.07 },
      upper_back: { a: v(0, 1.16, -0.1), b: v(0, 1.37, -0.1), r: 0.13 },
      lower_back: { a: v(0, 0.93, -0.09), b: v(0, 1.07, -0.09), r: 0.13 },
      left_leg: { a: v(0.1, 0.84, 0.0), b: v(0.095, 0.1, 0.0), r: 0.12, label: v(0.16, 0.72, 0.08) },
      left_knee: { a: v(0.1, 0.47, 0.025), b: v(0.1, 0.53, 0.025), r: 0.075 },
      right_shoulder: { a: v(-0.19, 1.43, 0.0), b: v(-0.21, 1.4, 0.0), r: 0.09 },
    },
    anatomy: {
      right_shoulder: {
        anchor: 'right_glenohumeral_joint',
        // Tuned so the upper arm bone runs within ~1 cm of the arm's center line (measured on
        // the mesh; try others in dev with ?fit=right_shoulder:x,y,z,arm).
        target: v(-0.175, 1.38, -0.02),
        scale: 1.15, // broad, athletic shoulders: a bit bigger than height alone (1.065)
        arm: { pivot: 'right_glenohumeral_joint', z: -42, fma: ARM_BONE, muscles: ARM_MUSCLES, muscleShare: 1 },
      },
      // The rest: scaled by height (1.81 / 1.70), then moved so the spine sits ~1.5 cm under the
      // back's skin and the bones run down the middle of the limb (measured on the mesh).
      neck: { anchor: 'c4_c5_joint', target: v(-0.027, 1.582, -0.015), scale: 1.065 },
      upper_back: { anchor: 't6_t7_joint', target: v(-0.014, 1.392, -0.072), scale: 1.065 },
      lower_back: { anchor: 'l4_l5_joint', target: v(0.017, 1.086, -0.036), scale: 1.065 },
      left_knee: { anchor: 'left_knee_joint', target: v(0.078, 0.471, 0.005), scale: 1.065 },
      left_leg: {
        anchor: 'left_hip_joint',
        target: v(0.086, 0.949, -0.03),
        scale: 1.065,
        xray: { a: v(0.1, 0.95, -0.01), b: v(0.1, 0.12, 0.0), r: 0.17 }, // the whole leg
      },
      head: { anchor: 'jaw_joint', target: v(0.038, 1.66, 0.03), scale: 1.065 },
    },
  },
  female: {
    label: 'Female',
    url: '/models/patient-female.glb', // Rocketbox Sports_Female_02, 1.74 m
    // Measured by raycasting her surface: back at z ≈ −0.10…−0.14, front of shoulder and neck ≈ −0.02.
    shapes: {
      head: { a: v(0, 1.66, -0.04), b: v(0, 1.7, -0.07), r: 0.095, tapR: 0.16, label: v(0.0, 1.8, -0.01) },
      neck: { a: v(0, 1.42, -0.06), b: v(0, 1.51, -0.05), r: 0.065, tapR: 0.085, label: v(0, 1.45, 0.02) },
      upper_back: { a: v(0, 1.18, -0.11), b: v(0, 1.34, -0.13), r: 0.13 },
      lower_back: { a: v(0, 1.0, -0.1), b: v(0, 1.1, -0.1), r: 0.11 },
      left_leg: { a: v(0.1, 0.8, -0.03), b: v(0.1, 0.1, -0.03), r: 0.12, label: v(0.17, 0.7, 0.06) },
      left_knee: { a: v(0.1, 0.44, -0.04), b: v(0.1, 0.5, -0.04), r: 0.085 },
      right_shoulder: { a: v(-0.16, 1.39, -0.06), b: v(-0.18, 1.35, -0.06), r: 0.09, label: v(-0.24, 1.5, 0.0) },
    },
    anatomy: {
      right_shoulder: {
        anchor: 'right_glenohumeral_joint',
        target: v(-0.155, 1.34, -0.062),
        scale: 1.08,
        arm: { pivot: 'right_glenohumeral_joint', z: -45, fma: ARM_BONE, muscles: ARM_MUSCLES, muscleShare: 1 },
      },
      neck: { anchor: 'c4_c5_joint', target: v(-0.026, 1.521, -0.053), scale: 1.024 },
      upper_back: { anchor: 't6_t7_joint', target: v(-0.013, 1.338, -0.082), scale: 1.024 },
      lower_back: { anchor: 'l4_l5_joint', target: v(0.016, 1.044, -0.05), scale: 1.024 },
      left_knee: { anchor: 'left_knee_joint', target: v(0.086, 0.453, -0.025), scale: 1.024 },
      left_leg: {
        anchor: 'left_hip_joint',
        target: v(0.093, 0.912, -0.057),
        scale: 1.024,
        xray: { a: v(0.1, 0.9, -0.04), b: v(0.1, 0.12, -0.03), r: 0.17 },
      },
      head: { anchor: 'jaw_joint', target: v(0.037, 1.596, -0.029), scale: 1.024 },
    },
  },
}

export const DEFAULT_PATIENT = 'male'

// Fixed order shared with the shader's uniform arrays.
export const SHAPE_ORDER = REGION_IDS
export const SHAPE_COUNT = SHAPE_ORDER.length

const closest = new THREE.Vector3()
const segment = new THREE.Line3()

// Signed distance from p to a region's surface: < 0 inside.
export function regionDistance(p, shape, radius = shape.r) {
  segment.set(shape.a, shape.b)
  segment.closestPointToPoint(p, true, closest)
  return closest.distanceTo(p) - radius
}

// The region containing p (model space), the smallest one when shapes overlap
// (the knee wins over the leg), or null.
export function regionAt(p, shapes, slack = 0.015) {
  let best = null
  let bestScore = Infinity
  for (const id of SHAPE_ORDER) {
    const shape = shapes[id]
    const d = regionDistance(p, shape, shape.tapR ?? shape.r)
    if (d > slack) continue
    const score = shape.r + Math.max(d, -shape.r) * 0.1 // prefer smaller shapes
    if (score < bestScore) {
      bestScore = score
      best = id
    }
  }
  return best
}

// Where a region's label sits (model space): the shape's middle, pushed out to the skin.
export function regionAnchor(id, shapes) {
  const { a, b, r, label } = shapes[id]
  if (label) return label.clone()
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const out = new THREE.Vector3(mid.x, 0, mid.z)
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1)
  out.normalize().multiplyScalar(r * 0.6)
  return mid.add(out)
}
