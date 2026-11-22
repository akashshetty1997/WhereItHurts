import * as THREE from 'three'
import { REGION_IDS } from '../regions'

// Each region is a capsule (segment a→b with radius r) in the patient model's own space:
// meters, feet at y = 0, facing +z, so the PATIENT's left is +x. The shader paints inside these
// shapes with a soft edge; taps map to the nearest shape that contains the hit point.
// Each patient model has its own shapes, measured on its mesh (A-pose).
const v = (x, y, z) => new THREE.Vector3(x, y, z)

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
