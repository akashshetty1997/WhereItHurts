// Show Anatomy: reference bones, muscles and joints (BodyParts3D, CC BY 4.0) placed inside the
// patient for one region. It's an illustration, not this patient's scan.
//
// public/models/anatomy.glb is built by tools/anatomy/build.mjs in the same body frame as the
// patient (meters, feet at y = 0, facing +z, patient's left = +x) but for a 1.70 m body in the
// anatomical position (arms hanging straight). Each patient's fit (src/scene/patientRegions.js →
// anatomy) moves one joint onto the patient, scales, and swings the arm out to the model's A-pose
// (src/scene/movements.js builds the moving parts).
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { buildRig } from './movements'

const URL = '/models/anatomy.glb'

// What each kind looks like; color is the legend's meaning too.
export const KIND_STYLES = {
  bone: { label: 'Bone', color: '#d8ccb2', roughness: 0.7, opacity: 1 },
  muscle: { label: 'Muscle', color: '#b03a33', roughness: 0.5, opacity: 0.9 },
  ligament: { label: 'Ligament', color: '#8fa3b8', roughness: 0.5, opacity: 0.95 },
  disc: { label: 'Disc', color: '#8fa3b8', roughness: 0.5, opacity: 0.95 },
  joint: { label: 'Joint', color: '#5ad1c4' },
}
const HOVER = new THREE.Color('#ffffff')

let loading = null
function loadGltf() {
  loading ??= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(URL)
    .catch((error) => {
      loading = null // try again next time
      throw error
    })
  return loading
}

function materialFor(kind) {
  const style = KIND_STYLES[kind] ?? KIND_STYLES.bone
  return new THREE.MeshStandardMaterial({
    color: style.color,
    roughness: style.roughness,
    metalness: 0,
    transparent: style.opacity < 1,
    opacity: style.opacity,
    emissive: HOVER,
    emissiveIntensity: 0,
    // Some BodyParts3D meshes have their faces wound the other way; draw both sides.
    side: THREE.DoubleSide,
  })
}

// Builds the anatomy for one patient under `parent` (patientRoot). Returns null-safe controls;
// the GLB loads the first time a region is shown.
export function createAnatomy(parent, fits) {
  const root = new THREE.Group()
  root.name = 'anatomy'
  root.visible = false
  parent.add(root)

  const regions = new Map() // region -> { group, meshes, joints, fit }
  let ready = null
  let current = null
  let highlighted = null

  // The loaded GLB is shared by every body (a patient switch remounts the scene), so each one
  // builds from its own copy; geometry is shared, materials are its own.
  function build(gltf) {
    const source = gltf.scene.clone(true)
    for (const group of [...source.children]) {
      const region = group.userData.region
      const fit = fits?.[region]
      if (!region || !fit) continue
      const meshes = []
      const joints = {}
      group.traverse((o) => {
        if (o.isMesh) {
          o.material = materialFor(o.userData.kind)
          o.geometry.computeBoundingSphere()
          o.castShadow = false
          o.receiveShadow = false
          // Translucent muscles draw before the see-through skin, which would otherwise hide them
          // behind its depth.
          o.renderOrder = -1
          meshes.push(o)
        } else if (o.userData.kind === 'joint') {
          joints[o.userData.joint] = o
        }
      })
      // Positions below are in the region group's frame (the GLB's body frame; groups have no transform).
      // Place: the anchor joint lands on the patient's target point, scaled about that joint.
      const anchor = joints[fit.anchor].position.clone()
      const placed = new THREE.Group()
      placed.name = `anatomy:${region}`
      placed.scale.setScalar(fit.scale)
      placed.position.copy(fit.target).sub(anchor.clone().multiplyScalar(fit.scale))
      if (fit.rotateY) placed.rotation.y = THREE.MathUtils.degToRad(fit.rotateY)
      placed.add(group)
      // The movement simulation's rig (Reach Up, Turn Head, Bend Knee), if this region has one.
      const rig = buildRig(region, group, meshes, joints, fit)
      placed.visible = false
      root.add(placed)
      // Labels and the see-through sphere use the joints' positions in body space.
      placed.updateMatrix()
      const jointsBody = Object.fromEntries(
        Object.entries(joints).map(([id, o]) => [id, { ...o.userData, position: o.position.clone().applyMatrix4(placed.matrix) }]),
      )
      regions.set(region, { group: placed, regionGroup: group, meshes, joints: jointsBody, fit, rig })
    }
  }

  // Loads once; a failed load can be tried again.
  const ensure = () =>
    (ready ??= loadGltf()
      .then(build)
      .catch((error) => {
        ready = null
        throw error
      }))

  return {
    // Loads once; resolves to whether this region has anatomy.
    // Start loading early (Record the Visit), so the first Reach Up doesn't wait for the file.
    preload() {
      return ensure().catch(() => {})
    },
    async show(region) {
      await ensure()
      const entry = regions.get(region)
      regions.forEach((r) => (r.group.visible = false))
      current = entry ? region : null
      root.visible = !!entry
      if (entry) entry.group.visible = true
      return !!entry
    },
    hide() {
      current = null
      root.visible = false
      this.highlight(null)
    },
    has: (region) => !!fits?.[region],
    current: () => current,
    region: () => regions.get(current) ?? null,
    // Meshes to raycast while open.
    meshes: () => regions.get(current)?.meshes.filter((m) => m.visible) ?? [],
    // Show or hide a layer: 'bone' | 'muscle' (ligaments and discs go with muscles).
    setLayer(kind, visible) {
      regions.forEach((r) =>
        r.meshes.forEach((m) => {
          const k = m.userData.kind
          if (k === kind || (kind === 'muscle' && (k === 'ligament' || k === 'disc'))) m.visible = visible
        }),
      )
    },
    highlight(mesh, level = 0.28) {
      if (highlighted && highlighted !== mesh) highlighted.material.emissiveIntensity = 0
      highlighted = mesh
      if (mesh) mesh.material.emissiveIntensity = level
    },
  }
}
