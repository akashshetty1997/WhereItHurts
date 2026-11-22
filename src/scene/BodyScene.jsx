import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { visitStore } from '../visitStore'
import { registerBody, emitRegionClick, glow } from './bodyApi'
import { DEV_SEGMENTS, DEV_SEGMENT_GAP_MS } from './devSegments'

// Placeholder body: capsules and boxes (PLAN fallback) until a GLB is ready.
// The body faces +z (toward the camera), so the PATIENT's left is +x.
const SKIN = '#cfd8dc'
const BONE = '#f5f1e6'
const PAIN_COLORS = { burning: '#ff5722', sharp: '#fff59d', aching: '#7e57c2' }
// Used when the visit JSON has no color for a speaker (v1 mock says "doctor", v2 says "pt").
const SPEAKER_COLORS = { pt: '#4FC3F7', doctor: '#4FC3F7', patient: '#FFB74D' }

// Glow envelope, in seconds: quick rise, then a slow fade.
const GLOW_RISE_S = 0.15
const GLOW_FADE_S = 2.35
const GLOW_PEAK = 1.4

function part(geometry, position, region = null, color = SKIN) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  )
  mesh.position.set(...position)
  mesh.userData.region = region
  return mesh
}

function buildBody() {
  const body = new THREE.Group()
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 8, 16)
  body.add(
    part(new THREE.SphereGeometry(0.28, 32, 16), [0, 1.55, 0], 'head'),
    part(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 16), [0, 1.2, 0], 'neck'),
    part(cap(0.36, 0.5), [0, 0.7, 0]),
    part(cap(0.32, 0.2), [0, 0.15, 0]),
    part(new THREE.BoxGeometry(0.6, 0.5, 0.08), [0, 0.72, -0.33], 'upper_back'),
    part(new THREE.BoxGeometry(0.55, 0.4, 0.08), [0, 0.2, -0.3], 'lower_back'),
    part(cap(0.3, 0.1), [0, -0.25, 0]),
    part(new THREE.SphereGeometry(0.17, 24, 12), [-0.46, 0.98, 0], 'right_shoulder'),
    part(new THREE.SphereGeometry(0.17, 24, 12), [0.46, 0.98, 0]),
    part(cap(0.1, 0.9), [-0.58, 0.4, 0]),
    part(cap(0.1, 0.9), [0.58, 0.4, 0]),
    // patient's left leg (+x)
    part(cap(0.14, 0.55), [0.2, -0.75, 0], 'left_leg'),
    part(new THREE.SphereGeometry(0.15, 24, 12), [0.2, -1.17, 0], 'left_knee'),
    part(cap(0.12, 0.55), [0.2, -1.6, 0], 'left_leg'),
    // patient's right leg (-x)
    part(cap(0.14, 0.55), [-0.2, -0.75, 0]),
    part(new THREE.SphereGeometry(0.15, 24, 12), [-0.2, -1.17, 0]),
    part(cap(0.12, 0.55), [-0.2, -1.6, 0]),
    ...buildSpine(),
  )
  return body
}

// A visible spine on the back, one small vertebra per level, each belonging to its region:
// cervical = neck, thoracic = upper_back, lumbar = lower_back. Lights up with its region.
const SPINE_SECTIONS = [
  { region: 'neck', count: 4, top: 1.3, bottom: 1.1, z: -0.12, size: 0.07 },
  { region: 'upper_back', count: 8, top: 0.95, bottom: 0.48, z: -0.385, size: 0.08 },
  { region: 'lower_back', count: 5, top: 0.38, bottom: 0.02, z: -0.355, size: 0.09 },
]

function buildSpine() {
  return SPINE_SECTIONS.flatMap(({ region, count, top, bottom, z, size }) =>
    Array.from({ length: count }, (_, i) => {
      const y = top - ((top - bottom) * i) / Math.max(1, count - 1)
      return part(new THREE.BoxGeometry(size, size * 0.6, 0.03), [0, y, z], region, BONE)
    }),
  )
}

// 0..1: how strong a glow started at `start` is at time `t`.
function glowEnvelope(t, start) {
  const age = t - start
  if (age < 0) return 0
  if (age < GLOW_RISE_S) return age / GLOW_RISE_S
  return Math.max(0, 1 - (age - GLOW_RISE_S) / GLOW_FADE_S)
}

// v1 mock stores intensity 0–1, v2 stores 0–10.
const normalizeIntensity = (i) => (i > 1 ? i / 10 : i)

function speakerColor(speaker) {
  return visitStore.get().speakers?.[speaker]?.color ?? SPEAKER_COLORS[speaker] ?? '#ffffff'
}

let devDemoPlayed = false
function playDevSegments() {
  // Until mockVisit.js moves to v2, the PT is still called "doctor" there.
  const ptRole = visitStore.get().speakers?.pt ? 'pt' : 'doctor'
  DEV_SEGMENTS.forEach((seg, i) => {
    setTimeout(() => {
      const speaker = seg.speaker === 'pt' ? ptRole : seg.speaker
      visitStore.addSegment({ id: `dev-${Date.now()}-${i}`, path: [], ...seg, speaker })
    }, i * DEV_SEGMENT_GAP_MS)
  })
}

export default function BodyScene({ onRegionClick }) {
  const mountRef = useRef(null)
  const clickRef = useRef(onRegionClick)
  clickRef.current = onRegionClick

  useEffect(() => {
    const mount = mountRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 0.2, 7)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#ffffff', '#334', 1.2))
    const key = new THREE.DirectionalLight('#ffffff', 1.5)
    key.position.set(3, 4, 5)
    scene.add(key)

    const body = buildBody()
    scene.add(body)

    // region id -> its meshes (left_leg has two)
    const regionMeshes = new Map()
    body.children.forEach((mesh) => {
      const region = mesh.userData.region
      if (!region) return
      if (!regionMeshes.has(region)) regionMeshes.set(region, [])
      regionMeshes.get(region).push(mesh)
    })

    const clock = new THREE.Clock()
    // region id -> { color, start }
    const glows = new Map()

    registerBody({
      glow(region, color) {
        if (!regionMeshes.has(region)) return
        glows.set(region, { color: new THREE.Color(color), start: clock.getElapsedTime() })
      },
    })

    // Integration: every new segment lights its regions in the speaker's color.
    const offSegment = visitStore.onSegment((segment) => {
      const color = speakerColor(segment.speaker)
      segment.regions.forEach((region) => glow(region, color))
    })

    // Left button is reserved for tapping regions; right-drag rotates, scroll zooms.
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    controls.enablePan = false
    controls.enableDamping = true
    const onContextMenu = (e) => e.preventDefault()
    renderer.domElement.addEventListener('contextmenu', onContextMenu)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onPointerDown = (e) => {
      if (e.button !== 0) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(body.children)[0]
      const region = hit?.object.userData.region ?? null
      emitRegionClick(region)
      clickRef.current?.(region)
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const paintColor = new THREE.Color()
    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime()
      const painted = new Map(visitStore.get().painted.map((p) => [p.region, p]))
      body.children.forEach((mesh) => {
        const region = mesh.userData.region
        const mat = mesh.material
        // Paint look (placeholder until the pain-type shader, D6): slow pulse in the type's color.
        const p = painted.get(region)
        const paintLevel = p ? normalizeIntensity(p.intensity) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI)) : 0
        if (p) paintColor.set(PAIN_COLORS[p.type] ?? SKIN)

        const g = glows.get(region)
        const glowLevel = g ? glowEnvelope(t, g.start) * GLOW_PEAK : 0
        if (g && glowLevel === 0 && t - g.start > GLOW_RISE_S) glows.delete(region)

        if (glowLevel > paintLevel) {
          mat.emissive.copy(g.color)
          mat.emissiveIntensity = glowLevel
        } else if (p) {
          mat.emissive.copy(paintColor)
          mat.emissiveIntensity = paintLevel
        } else {
          mat.emissiveIntensity = 0
        }
      })
      controls.update()
      renderer.render(scene, camera)
    })

    // Dev-only URL options: ?demo plays the script, ?view=back starts facing the back,
    // ?glow=<region> lights one region (repeats every 3 s).
    let devGlowTimer = null
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(location.search)
      if (params.get('view') === 'back') camera.position.set(0, 0.2, -7)
      const devRegion = params.get('glow')
      if (devRegion) {
        const fire = () => glow(devRegion, SPEAKER_COLORS.pt)
        fire()
        devGlowTimer = setInterval(fire, 3000)
      }
      if (!devDemoPlayed && params.has('demo')) {
        devDemoPlayed = true
        playDevSegments()
      }
    }

    return () => {
      registerBody(null)
      offSegment()
      clearInterval(devGlowTimer)
      renderer.setAnimationLoop(null)
      observer.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('contextmenu', onContextMenu)
      body.traverse((o) => {
        o.geometry?.dispose()
        o.material?.dispose()
      })
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="scene" />
}
