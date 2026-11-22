import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { visitStore, useVisit } from '../visitStore'
import { regionLabel } from '../regions'
import { registerBody, emitRegionClick, glow, setListening } from './bodyApi'
import { DEV_SEGMENTS, DEV_SEGMENT_GAP_MS } from './devSegments'
import IntakePicker from './IntakePicker'
import { toTen, toUnit } from './intensity'
import { createPainMaterial, setPain, setGlow, setPainTime } from '../shaders/painMaterial'
import './scene.css'

// Placeholder body: capsules and boxes (PLAN fallback) until a GLB is ready.
// The body faces +z (toward the camera), so the PATIENT's left is +x.
const SKIN = '#cfd8dc'
const BONE = '#f5f1e6'
// Used when the visit JSON has no color for a speaker (v1 mock says "doctor", v2 says "pt").
const SPEAKER_COLORS = { pt: '#4FC3F7', doctor: '#4FC3F7', patient: '#FFB74D' }

// Glow envelope, in seconds: quick rise, then a slow fade.
const GLOW_RISE_S = 0.15
const GLOW_FADE_S = 2.35
const GLOW_PEAK = 1.4

// Ring around a tapped region (inverted hull): white when selected, pulsing orange while listening.
const RING_SCALE = 1.12
const RING_SELECTED = '#ffffff'
const RING_LISTENING = '#FFB74D'
// Regions on the back: their labels show only when the camera is behind the body.
const BACK_REGIONS = new Set(['upper_back', 'lower_back'])

function part(geometry, position, region = null, color = SKIN) {
  const mesh = new THREE.Mesh(geometry, createPainMaterial(color))
  mesh.position.set(...position)
  mesh.userData.region = region
  return mesh
}

function buildBody() {
  const body = new THREE.Group()
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 8, 16)
  body.add(
    part(new THREE.SphereGeometry(0.28, 32, 16), [0, 1.74, 0], 'head'),
    part(new THREE.CylinderGeometry(0.12, 0.14, 0.36, 16), [0, 1.38, 0], 'neck'),
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
  { region: 'neck', count: 4, top: 1.5, bottom: 1.32, z: -0.135, size: 0.07 },
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


// Dev-only: ?fakevoice pretends the patient spoke after a tap, so intake works without speech.
function fakeVoiceIntake(region) {
  setListening(region)
  setTimeout(() => {
    setListening(null)
    const painted = visitStore.get().painted.filter((p) => p.region !== region)
    visitStore.setPainted([
      ...painted,
      { region, type: 'aching', intensity: 5, note: 'It aches, about a five, when I reach up.' },
    ])
  }, 1500)
}

export default function BodyScene({ onRegionClick, mode = 'paint' }) {
  const mountRef = useRef(null)
  const clickRef = useRef(onRegionClick)
  clickRef.current = onRegionClick
  const modeRef = useRef(mode)
  modeRef.current = mode

  const visit = useVisit()
  const [selected, setSelected] = useState(null)
  const [listening, setListeningState] = useState(null)
  const selectedRef = useRef(null)
  const listeningRef = useRef(null)
  selectedRef.current = selected
  listeningRef.current = listening

  // Leaving intake (Start visit) closes the picker.
  useEffect(() => {
    if (mode !== 'paint') setSelected(null)
  }, [mode])

  useEffect(() => {
    const mount = mountRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 0.2, 7)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    // HTML labels pinned to regions; they never take clicks.
    const labelRenderer = new CSS2DRenderer()
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.inset = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'
    mount.appendChild(labelRenderer.domElement)

    scene.add(new THREE.HemisphereLight('#ffffff', '#334', 1.2))
    const key = new THREE.DirectionalLight('#ffffff', 1.5)
    key.position.set(3, 4, 5)
    scene.add(key)

    const body = buildBody()
    scene.add(body)

    // region id -> its meshes (left_leg has two; spine regions include their vertebrae)
    const regionMeshes = new Map()
    body.children.forEach((mesh) => {
      const region = mesh.userData.region
      if (!region) return
      if (!regionMeshes.has(region)) regionMeshes.set(region, [])
      regionMeshes.get(region).push(mesh)
    })

    // Per region: a ring (inverted hull on each mesh) and a label at the region's center.
    const rings = new Map()
    const labels = new Map()
    regionMeshes.forEach((meshes, region) => {
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: RING_SELECTED,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.7,
      })
      meshes.forEach((mesh) => {
        const hull = new THREE.Mesh(mesh.geometry, ringMaterial)
        hull.scale.setScalar(RING_SCALE)
        hull.raycast = () => {}
        hull.visible = false
        hull.userData.isRing = true
        mesh.add(hull)
      })
      rings.set(region, { material: ringMaterial, meshes })

      // Anchor on the region's first (main) mesh: the thigh for left_leg, not the vertebrae.
      const center = meshes[0].position.clone()
      const el = document.createElement('div')
      el.className = 'region-label'
      const label = new CSS2DObject(el)
      label.position.copy(center)
      label.visible = false
      body.add(label)
      labels.set(region, { label, el, text: '', center })
    })

    const clock = new THREE.Clock()
    // region id -> { color, start }
    const glows = new Map()

    registerBody({
      glow(region, color) {
        if (!regionMeshes.has(region)) return
        glows.set(region, { color: new THREE.Color(color), start: clock.getElapsedTime() })
      },
      setListening(region) {
        if (region) setSelected(region)
        setListeningState(region)
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

    const fakeVoice = import.meta.env.DEV && new URLSearchParams(location.search).has('fakevoice')
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
      if (modeRef.current === 'paint') {
        setSelected(region)
        if (region && fakeVoice) fakeVoiceIntake(region)
      }
      emitRegionClick(region)
      clickRef.current?.(region)
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKeyDown)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      renderer.setSize(w, h)
      labelRenderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime()
      setPainTime(t)
      const painted = new Map(visitStore.get().painted.map((p) => [p.region, p]))
      body.children.forEach((mesh) => {
        if (!mesh.isMesh) return
        const region = mesh.userData.region
        // Pain look (src/shaders/painMaterial.js), brightness from the 0–10 rating.
        const p = painted.get(region)
        setPain(mesh.material, p?.type ?? null, p ? toUnit(p.intensity) : 0)
        // Speech glow on top, fading out.
        const g = glows.get(region)
        const glowLevel = g ? glowEnvelope(t, g.start) * GLOW_PEAK : 0
        if (g && glowLevel === 0 && t - g.start > GLOW_RISE_S) glows.delete(region)
        setGlow(mesh.material, g ? g.color : null, glowLevel)
      })

      // Rings: selected = steady white, listening = pulsing orange.
      rings.forEach(({ material, meshes }, region) => {
        const isListening = listeningRef.current === region
        const show = isListening || selectedRef.current === region
        meshes.forEach((m) => m.children.forEach((c) => c.userData.isRing && (c.visible = show)))
        if (!show) return
        material.color.set(isListening ? RING_LISTENING : RING_SELECTED)
        material.opacity = isListening ? 0.45 + 0.4 * Math.sin(t * 6) : 0.6
      })

      // Labels: during intake, every marked region shows "Right shoulder · aching · 5/10".
      const intake = modeRef.current === 'paint'
      const cameraBehind = camera.position.z < 0
      labels.forEach((entry, region) => {
        const p = painted.get(region)
        const facing = !BACK_REGIONS.has(region) || cameraBehind
        entry.label.visible = intake && !!p && facing
        if (!entry.label.visible) return
        const text = `${regionLabel(region)} · ${p.type} · ${toTen(p.intensity)}/10`
        if (text !== entry.text) entry.el.textContent = entry.text = text
      })

      controls.update()
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
    })

    // Dev-only URL options: ?demo plays the script, ?view=back starts facing the back,
    // ?glow=<region> lights one region (repeats every 3 s), ?fakevoice fakes speech after a tap,
    // ?paint=right_shoulder:burning:8,left_knee:aching:5 replaces the painted list.
    let devGlowTimer = null
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(location.search)
      const devPaint = params.get('paint')
      if (devPaint) {
        visitStore.setPainted(
          devPaint.split(',').map((item) => {
            const [region, type, rating] = item.split(':')
            return { region, type, intensity: Number(rating ?? 5) }
          }),
        )
      }
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
      window.removeEventListener('keydown', onKeyDown)
      rings.forEach(({ material }) => material.dispose())
      body.children.forEach((o) => {
        o.geometry?.dispose()
        o.material?.dispose()
      })
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      mount.removeChild(labelRenderer.domElement)
    }
  }, [])

  const entry = selected ? visit.painted.find((p) => p.region === selected) : null

  return (
    <div className="scene">
      <div ref={mountRef} className="scene" />
      {mode === 'paint' && selected && (
        <IntakePicker
          region={selected}
          entry={entry}
          listening={listening === selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
