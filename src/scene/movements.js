// Movement simulations on the Show Anatomy body parts: one rule each, a slider, Play, muscles that
// glow as they work, and the range where the patient said it hurts. Typical movement, for
// illustration: never a diagnosis, never a "normal" range.
//
//   Reach Up   (right shoulder)  for every 3° the arm goes up, about 2° come from the shoulder joint
//                                and 1° from the shoulder blade turning on the back
//   Turn Head  (neck)            about half of a head turn happens between the top two neck bones
//                                (C1 and C2); the five below share the other half
//   Bend Knee  (left knee)       a hinge: the shin swings back, and the kneecap glides down the
//                                front of the thigh bone about half as far
//
// Each rig is built in the region group's frame (the GLB's body frame, before the per-patient fit)
// by src/scene/anatomy.js; src/scene/movementSim.js drives it.
import * as THREE from 'three'

const rad = THREE.MathUtils.degToRad
export const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b)

function pivotGroup(parent, at) {
  const pivot = new THREE.Group()
  pivot.position.copy(at)
  parent.add(pivot)
  const turn = new THREE.Group()
  pivot.add(turn)
  return turn
}
// Move a mesh into a pivot group placed at `at` (both in the region group's frame).
function attach(turn, mesh, at) {
  turn.add(mesh)
  mesh.position.sub(at)
}
const byFma = (meshes) => new Map(meshes.map((m) => [m.userData.fma, m]))
// A mesh's bounding box in the region group's frame.
function boxOf(mesh) {
  mesh.updateMatrix()
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix)
}

// --- Rigs -----------------------------------------------------------------------------------------

const BLADE_FMA = ['FMA13395', 'FMA32544', 'FMA32547', 'FMA32553', 'FMA13414'] // scapula + rotator cuff
// Shoulder: the blade (with the rotator cuff) turns about the AC joint, and the arm (upper arm bone
// + deltoid) turns about the shoulder joint, which rides on the blade. The rest angle is the
// model's A-pose (fit.arm.z), so at rest nothing moves.
function shoulderRig(group, meshes, joints, fit) {
  const arm = fit.arm
  const bladeAt = joints.right_ac_joint.position.clone()
  const armAt = joints[arm.pivot].position.clone()
  const blade = pivotGroup(group, bladeAt)
  const upperArm = pivotGroup(blade, armAt.clone().sub(bladeAt))
  for (const mesh of meshes) {
    const fma = mesh.userData.fma
    if (arm.fma.includes(fma) || arm.muscles?.includes(fma)) attach(upperArm, mesh, armAt)
    else if (BLADE_FMA.includes(fma)) attach(blade, mesh, bladeAt)
  }
  const rest = -(arm.z ?? 0) // degrees out from the side in the A-pose
  return {
    rest,
    bandAt: armAt,
    set(theta) {
      blade.rotation.z = -rad((theta - rest) / 3)
      upperArm.rotation.z = -rad(rest + (2 * (theta - rest)) / 3)
    },
  }
}

// Neck: each bone turns about its own vertical axis (through the front of the bone, where the
// bodies stack), by its share of the whole turn, added up from the bottom: half at C1–C2.
const NECK = [
  ['FMA12525', 0.05], // C7
  ['FMA12524', 0.15], // C6
  ['FMA12523', 0.25], // C5
  ['FMA12522', 0.35], // C4
  ['FMA12521', 0.45], // C3
  ['FMA12520', 0.5], // C2
  ['FMA12519', 1.0], // C1 (the head turns with it)
]
const NECK_DISCS = 'FMA13895'
function neckRig(group, meshes) {
  const meshOf = byFma(meshes)
  const turns = []
  let top = null
  for (const [fma, share] of NECK) {
    const mesh = meshOf.get(fma)
    if (!mesh) continue
    const box = boxOf(mesh)
    const at = box.getCenter(new THREE.Vector3())
    at.z += (box.max.z - box.min.z) * 0.25 // toward the vertebral body, in front
    const turn = pivotGroup(group, at)
    attach(turn, mesh, at)
    turns.push([turn, share])
    top = at
  }
  const discs = meshOf.get(NECK_DISCS)
  if (discs && turns.length) {
    const at = boxOf(discs).getCenter(new THREE.Vector3())
    const turn = pivotGroup(group, at)
    attach(turn, discs, at)
    turns.push([turn, 0.3])
  }
  return {
    rest: 0,
    bandAt: top ? top.clone().add(new THREE.Vector3(0, 0.03, 0)) : new THREE.Vector3(),
    set(theta) {
      for (const [turn, share] of turns) turn.rotation.y = rad(theta * share)
    },
  }
}

// Knee: the shin bones and the calf swing back about the knee joint; the kneecap goes half as far.
const SHIN_FMA = ['FMA24478', 'FMA24481', 'FMA45958', 'FMA45961'] // tibia, fibula, calf heads
const KNEECAP_FMA = 'FMA24487'
function kneeRig(group, meshes, joints) {
  const at = joints.left_knee_joint.position.clone()
  const shin = pivotGroup(group, at)
  const kneecap = pivotGroup(group, at)
  for (const mesh of meshes) {
    const fma = mesh.userData.fma
    if (SHIN_FMA.includes(fma)) attach(shin, mesh, at)
    else if (fma === KNEECAP_FMA) attach(kneecap, mesh, at)
  }
  return {
    rest: 0,
    bandAt: at,
    set(theta) {
      shin.rotation.x = rad(theta)
      kneecap.rotation.x = rad(theta / 2)
    },
  }
}

// --- Movements ------------------------------------------------------------------------------------

const signed = (t) => (t === 0 ? '0°' : `${Math.abs(t)}° ${t > 0 ? 'left' : 'right'}`)

export const MOVEMENTS = {
  right_shoulder: {
    button: 'Reach Up',
    title: 'Reach Up',
    question: 'How does the shoulder move when you reach up?',
    rule: 'For every 3° the arm goes up, about 2° come from the shoulder joint and 1° from the shoulder blade turning on the back.',
    sliderLabel: 'How far the arm is raised, in degrees',
    min: 0,
    max: 180,
    peak: 180,
    rig: shoulderRig,
    readout: (t) => [`Arm up ${t}°`, `Shoulder joint ${Math.round((t * 2) / 3)}° + shoulder blade ${Math.round(t / 3)}°`],
    // How hard each muscle works (0–1) at angle θ. Typical, for illustration only.
    activity: {
      FMA32544: (t) => 0.45 + 0.45 * (1 - smooth(20, 60, t)), // supraspinatus: starts the lift
      FMA34682: (t) => smooth(10, 90, t) * (1 - 0.3 * smooth(130, 180, t)), // deltoid, side
      FMA34680: (t) => 0.75 * smooth(10, 90, t) * (1 - 0.3 * smooth(130, 180, t)), // deltoid, front
      FMA34684: (t) => 0.3 * smooth(10, 90, t), // deltoid, back
      FMA32547: (t) => 0.25 + 0.25 * smooth(60, 150, t), // infraspinatus: steadies the ball
      FMA32553: (t) => 0.2 + 0.25 * smooth(60, 150, t), // teres minor
      FMA13414: (t) => 0.25 + 0.2 * smooth(60, 150, t), // subscapularis
    },
    // The band lies in the body's front plane; hanging down is 270° on the ring, overhead 90°.
    band: { plane: 'frontal', radii: [0.36, 0.4], ringAngle: (t) => 270 - t },
    // The skin over the shoulder and the whole arm is a ghost: the arm bone rises inside it.
    ghost(entry) {
      const { target } = entry.fit
      const rest = rad(entry.rig.rest)
      return {
        a: target.clone(),
        b: new THREE.Vector3(target.x - Math.sin(rest) * 0.62, target.y - Math.cos(rest) * 0.62, target.z + 0.05),
        r: 0.2,
      }
    },
    // Front view, pulled back so the arm fits overhead, the shoulder right of center.
    camera: (entry) => ({ at: entry.fit.target.clone().add(new THREE.Vector3(-0.2, 0.1, 0)), radius: 2.1, phi: 1.45, theta: 0 }),
    describeArc: (a) => `Raising the right arm hurts from ${a.from}° to ${a.to}°`,
  },

  neck: {
    button: 'Turn Head',
    title: 'Turn Head',
    question: 'Which neck bones turn when you look over your shoulder?',
    rule: 'About half of a head turn happens between the top two neck bones (C1 and C2); the five below share the other half.',
    sliderLabel: 'How far the head is turned, in degrees: toward the left end turns it left',
    // Seen from behind, the patient's left is on the left of the screen: the slider runs the same way.
    mirrorSlider: true,
    // Turning left and turning right are different movements: a marked range stays on one side.
    oneSided: true,
    min: -80,
    max: 80,
    peak: 70,
    rig: neckRig,
    readout: (t) => [
      t === 0 ? 'Facing forward' : `Turned ${signed(t)}`,
      `Top two neck bones ${Math.abs(Math.round(t / 2))}° + the five below ${Math.abs(t) - Math.abs(Math.round(t / 2))}°`,
    ],
    activity: {
      FMA13407: (t) => 0.2 + 0.75 * smooth(5, 70, Math.abs(t)), // sternocleidomastoid turns the head
    },
    // The back-of-neck muscles would cover the bones from this view: hidden while it's open.
    hide: ['FMA22653', 'FMA32519', 'FMA32557'], // splenius capitis, levator scapulae, upper trapezius
    // The band circles the neck at chin height; facing forward is the ring's 270° (toward +z).
    band: { plane: 'horizontal', radii: [0.13, 0.16], ringAngle: (t) => t - 90 },
    // The neck and the back of the head are a ghost, so the bones show from above.
    ghost(entry) {
      const c4 = entry.joints.c4_c5_joint.position
      return { a: c4.clone().add(new THREE.Vector3(0, -0.08, 0)), b: c4.clone().add(new THREE.Vector3(0, 0.22, 0)), r: 0.12 }
    },
    // From behind, slightly above: the tips of the neck bones swing sideways, the top ones most.
    camera: (entry) => ({ at: entry.joints.c4_c5_joint.position.clone().add(new THREE.Vector3(0.05, 0.02, 0)), radius: 0.75, phi: 1.3, theta: Math.PI }),
    describeArc: (a) => `Turning the head hurts from ${signed(a.from)} to ${signed(a.to)}`,
  },

  left_knee: {
    button: 'Bend Knee',
    title: 'Bend Knee',
    question: 'What moves when you bend your knee?',
    rule: 'The knee is a hinge: the shin bone swings back, and the kneecap glides down the front of the thigh bone about half as far.',
    sliderLabel: 'How far the knee is bent, in degrees',
    min: 0,
    max: 140,
    peak: 120,
    rig: kneeRig,
    readout: (t) => [`Knee bent ${t}°`, `Kneecap glides ${Math.round(t / 2)}°`],
    activity: {
      FMA45889: (t) => 0.2 + 0.7 * smooth(5, 90, t), // hamstring, outer
      FMA22359: (t) => 0.2 + 0.7 * smooth(5, 90, t), // hamstring, inner
      FMA45958: (t) => 0.2 + 0.4 * smooth(5, 90, t), // calf, inner
      FMA45961: (t) => 0.2 + 0.4 * smooth(5, 90, t), // calf, outer
      FMA38929: () => 0.2, // front thigh: lengthening, not lifting
      FMA38931: () => 0.2,
      FMA38933: () => 0.2,
    },
    // The band lies in the body's side plane; straight down is the ring's 270°, bent back beyond.
    band: { plane: 'sagittal', radii: [0.3, 0.34], ringAngle: (t) => t - 90 },
    ghost(entry) {
      const knee = entry.joints.left_knee_joint.position
      return { a: knee.clone().add(new THREE.Vector3(0, 0.08, 0)), b: knee.clone().add(new THREE.Vector3(0, -0.42, 0)), r: 0.09 }
    },
    // From the patient's left side, so the bend is seen in profile.
    camera: (entry) => ({ at: entry.joints.left_knee_joint.position.clone().add(new THREE.Vector3(0, -0.12, 0)), radius: 1.7, phi: 1.45, theta: Math.PI / 2 }),
    describeArc: (a) => `Bending the left knee hurts from ${a.from}° to ${a.to}°`,
  },
}

// For anatomy.js: the movement rig for a region, if it has one.
export function buildRig(region, group, meshes, joints, fit) {
  const movement = MOVEMENTS[region]
  if (!movement || (region === 'right_shoulder' && !fit.arm)) return null
  const rig = movement.rig(group, meshes, joints, fit)
  rig.set(rig.rest)
  return { ...rig, group }
}

// "Raising the right arm hurts from 90° to 150°", for the summary and the reports.
export function describePainArc(region, arc) {
  return arc && MOVEMENTS[region] ? MOVEMENTS[region].describeArc(arc) : null
}
