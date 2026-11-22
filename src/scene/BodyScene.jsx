import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js'
import { visitStore, useVisit } from '../visitStore'
import { regionLabel } from '../regions'
import { registerBody, emitRegionClick, glow, setListening } from './bodyApi'
import { DEV_SEGMENTS, DEV_SEGMENT_GAP_MS } from './devSegments'
import IntakePicker from './IntakePicker'
import { toTen, toUnit } from './intensity'
import { PATIENTS, DEFAULT_PATIENT, SHAPE_ORDER, regionAt, regionAnchor } from './patientRegions'
import { createPatientMaterial, patientUniforms } from '../shaders/patientMaterial'
import { Focus, Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { regionLabel as fullRegionLabel } from '../regions'
import './scene.css'

// A real person: Microsoft Rocketbox "Sports_Male_04" (MIT, public/models/LICENSE-rocketbox.txt),
// baked to a static A-pose mesh in meters and compressed (meshopt + WebP). Lit by a CC0 Poly
// Haven studio HDRI (public/hdri) plus key and rim lights, with soft shadows, ambient occlusion
// and a light bloom. The patient faces +z, so their left is +x.
const HDRI_URL = '/hdri/studio_small_08_1k.hdr'

// Used when the visit JSON has no color for a speaker (v1 mock says "doctor", v2 says "pt").
const SPEAKER_COLORS = { pt: '#4FC3F7', doctor: '#4FC3F7', patient: '#FFB74D' }
const ACCENT = '#7fd6ff'

// Glow envelope, in seconds: quick rise, then a slow fade.
const GLOW_RISE_S = 0.15
const GLOW_FADE_S = 2.35
const GLOW_PEAK = 1.3

// Rings on a region's edge: selected (steady), listening (pulsing), hovered (faint).
const RING_SELECTED = { color: '#ffffff', level: 0.75 }
const RING_LISTENING = { color: '#FFB74D', level: 1.1 }
const RING_HOVER = { color: '#ffffff', level: 0.35 }

// Regions on the back: their labels show only when the camera is behind the body.
const BACK_REGIONS = new Set(['upper_back', 'lower_back'])

// Portrait framing: a long lens (narrow fov) keeps proportions natural.
const CAMERA_FOV = 28
const CAMERA_HOME = new THREE.Vector3(0, 1.0, 5.2)
const CAMERA_TARGET = new THREE.Vector3(0, 0.92, 0)
const INTRO_SECONDS = 2.2
// Every camera move (intro, close-up, turn, zoom, reset) eases along an arc around its target.
const MOVE_SECONDS = 0.9
// Zoom range: a close-up of one joint to the whole room.
const MIN_DISTANCE = 0.7
const MAX_DISTANCE = 9
const ZOOM_STEP = 1.45
// A press that moves less than this (px) and ends quickly is a tap, not a drag-to-rotate.
const TAP_MAX_MOVE = 6
const TAP_MAX_MS = 600
const DOUBLE_TAP_MS = 350
// The pain card opens this long after a click, so a quick second click still lands on the body.
const PICKER_DELAY_MS = 360
// Close-up framing per region: the side to look from (theta, radians around the body: 0 = front,
// π = back; the patient's right is −x, so a negative angle looks at it) and how far to stand.
const CLOSE_UP_THETA = {
  head: 0,
  neck: 0,
  right_shoulder: -0.55,
  upper_back: Math.PI,
  lower_back: Math.PI,
  left_leg: 0.3,
  left_knee: 0.25,
}
const CLOSE_UP_PHI = 1.38 // a little above eye level

// Studio backdrop: deep navy, a little lighter behind the patient.
function makeBackground() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size * 0.42, 0, size / 2, size / 2, size * 0.8)
  g.addColorStop(0, '#22385a')
  g.addColorStop(0.55, '#12223a')
  g.addColorStop(1, '#0a1424')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function radialTexture(stops) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [at, color] of stops) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Floor: a shadow catcher (only the patient's shadow shows), a soft pool of light under the
// feet that fades into the backdrop, and one thin accent ring.
function buildFloor() {
  const floor = new THREE.Group()
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.ShadowMaterial({ opacity: 0.42 }),
  )
  shadowCatcher.rotation.x = -Math.PI / 2
  shadowCatcher.receiveShadow = true
  floor.add(shadowCatcher)

  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(120,160,210,0.32)'], [0.45, 'rgba(60,90,140,0.12)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.y = 0.001
  floor.add(pool)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.632, 128),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.002
  floor.add(ring)
  floor.userData.ring = ring
  floor.traverse((o) => (o.raycast = () => {}))
  return floor
}

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3)
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

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

// Remount with key={patient} to switch patients (App.jsx does).
export default function BodyScene({ onRegionClick, mode = 'paint', patient = DEFAULT_PATIENT }) {
  const patientRef = useRef(patient)
  const viewRef = useRef(null) // camera actions for the overlay buttons
  const mountRef = useRef(null)
  const clickRef = useRef(onRegionClick)
  clickRef.current = onRegionClick
  const modeRef = useRef(mode)
  modeRef.current = mode

  const visit = useVisit()
  const [selected, setSelected] = useState(null)
  const [listening, setListeningState] = useState(null)
  const [loaded, setLoaded] = useState(false)
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
    let disposed = false
    const model = PATIENTS[patientRef.current] ?? PATIENTS[DEFAULT_PATIENT]
    const shapes = model.shapes
    patientUniforms.setShapes(shapes)
    const scene = new THREE.Scene()
    scene.background = makeBackground()
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50)
    camera.position.copy(CAMERA_HOME)

    // Antialiasing happens in the composer's multisampled buffers instead.
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // Neutral keeps the pain colors' hue; AgX turned bright purple and orange into white.
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    mount.appendChild(renderer.domElement)

    // HTML labels pinned to regions; they never take clicks.
    const labelRenderer = new CSS2DRenderer()
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.inset = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'
    mount.appendChild(labelRenderer.domElement)

    // Post-processing: scene → ambient occlusion → bloom → vignette → tone mapping + sRGB.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    const composer = new EffectComposer(renderer, target)
    composer.addPass(new RenderPass(scene, camera))
    const gtao = new GTAOPass(scene, camera, 1, 1)
    gtao.blendIntensity = 0.85
    gtao.updateGtaoMaterial({ radius: 0.18, distanceExponent: 1, thickness: 1, scale: 1 })
    composer.addPass(gtao)
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.82)
    composer.addPass(bloom)
    const vignette = new ShaderPass(VignetteShader)
    // VignetteShader mixes toward (1 - darkness): darkness 1 = toward black; offset sets the reach.
    vignette.uniforms.offset.value = 0.8
    vignette.uniforms.darkness.value = 1.0
    composer.addPass(vignette)
    composer.addPass(new OutputPass())

    // Lighting: studio HDRI for skin and fabric reflections, a warm key light with soft shadows,
    // a cool rim from behind-left and a warm kicker from behind-right that separate the figure
    // from the backdrop, and a faint fill.
    new HDRLoader().load(HDRI_URL, (hdr) => {
      if (disposed) return hdr.dispose()
      hdr.mapping = THREE.EquirectangularReflectionMapping
      scene.environment = hdr
      scene.environmentIntensity = 0.55
      scene.environmentRotation.set(0, Math.PI * 0.6, 0)
    })
    const key = new THREE.DirectionalLight('#fff0e0', 2.4)
    key.position.set(1.6, 5.0, 3.0)
    key.target.position.copy(CAMERA_TARGET)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 14 })
    key.shadow.camera.updateProjectionMatrix()
    key.shadow.radius = 5
    key.shadow.normalBias = 0.02
    key.shadow.bias = -0.0002
    const rimCool = new THREE.DirectionalLight('#9fd6ff', 2.6)
    rimCool.position.set(-2.6, 2.6, -3.0)
    const rimWarm = new THREE.DirectionalLight('#ffcfa6', 1.3)
    rimWarm.position.set(2.8, 1.8, -2.6)
    const fill = new THREE.HemisphereLight('#cfe4ff', '#1a140f', 0.35)
    scene.add(key, key.target, rimCool, rimWarm, fill)

    const floor = buildFloor()
    scene.add(floor)

    const patientRoot = new THREE.Group()
    scene.add(patientRoot)
    const patientMeshes = []
    const labels = new Map()

    new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .load(model.url, (gltf) => {
        if (disposed) return
        const maxAniso = renderer.capabilities.getMaxAnisotropy()
        patientRoot.add(gltf.scene)
        patientRoot.updateMatrixWorld(true)
        const toBody = new THREE.Matrix4().copy(patientRoot.matrixWorld).invert()
        // The optimizer split head and body into two meshes, each with its own quantization.
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return
          // Taps pass through hair to the skin underneath (a ponytail over the nape selects the neck).
          if (!/hair/i.test(o.material.name)) patientMeshes.push(o)
          // The bounds that came with the quantized geometry are too small, which made raycasts
          // (taps on the shoulder) miss and could frustum-cull the body. Recompute them.
          o.geometry.computeBoundingSphere()
          o.geometry.computeBoundingBox()
          const restMatrix = toBody.clone().multiply(o.matrixWorld)
          o.material = Array.isArray(o.material)
            ? o.material.map((m) => createPatientMaterial(m, restMatrix, maxAniso))
            : createPatientMaterial(o.material, restMatrix, maxAniso)
          o.castShadow = true
          o.receiveShadow = true
        })
        // A label per region, pinned at the region's surface.
        for (const region of SHAPE_ORDER) {
          const el = document.createElement('div')
          el.className = 'region-label'
          const label = new CSS2DObject(el)
          label.position.copy(regionAnchor(region, shapes))
          label.visible = false
          patientRoot.add(label)
          labels.set(region, { label, el, text: '' })
        }
        setLoaded(true)
      })

    // THREE.Timer replaces the deprecated Clock; connect() avoids a huge jump after a tab switch.
    const timer = new THREE.Timer()
    timer.connect(document)
    // region id -> { color, start }
    const glows = new Map()

    registerBody({
      glow(region, color) {
        if (!SHAPE_ORDER.includes(region)) return
        glows.set(region, { color: new THREE.Color(color), start: timer.getElapsed() })
      },
      setListening(region) {
        if (region) setSelected(region)
        setListeningState(region)
      },
      select(region) {
        setSelected(region)
        emitRegionClick(region)
        clickRef.current?.(region)
        // Chosen from the list: fly to it, so back pain is visible without turning by hand.
        if (region) focusRegion(region)
      },
    })

    // Integration: every new segment lights its regions in the speaker's color.
    const offSegment = visitStore.onSegment((segment) => {
      const color = speakerColor(segment.speaker)
      segment.regions.forEach((region) => glow(region, color))
    })

    // Drag (left or right button) orbits a full 360°, scroll zooms toward the pointer, and a short
    // click selects a body part (see onPointerUp).
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(CAMERA_TARGET)
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    controls.enablePan = false
    controls.enableDamping = true
    controls.zoomToCursor = true
    controls.minDistance = MIN_DISTANCE
    controls.maxDistance = MAX_DISTANCE
    controls.minPolarAngle = 0.2
    controls.maxPolarAngle = 1.85
    const onContextMenu = (e) => e.preventDefault()
    renderer.domElement.addEventListener('contextmenu', onContextMenu)

    const fakeVoice = import.meta.env.DEV && new URLSearchParams(location.search).has('fakevoice')
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const local = new THREE.Vector3()
    const regionUnder = (e) => {
      if (!patientMeshes.length) return null
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(patientMeshes, false)[0]
      if (!hit) return null
      return regionAt(patientRoot.worldToLocal(local.copy(hit.point)), shapes)
    }

    // Left-drag rotates; a short press without movement is a tap on the body.
    let press = null
    const onPointerDown = (e) => {
      press = e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null
    }
    const onPointerUp = (e) => {
      if (!press || e.button !== 0) return
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y)
      const quick = performance.now() - press.t < TAP_MAX_MS
      press = null
      if (moved > TAP_MAX_MOVE || !quick) return
      const region = regionUnder(e)
      // Two clicks on the same part in quick succession: a close-up of it. (Detected here, not
      // with dblclick, so the pain card opening after the first click can't swallow the second.)
      const now = performance.now()
      if (region && lastTap && lastTap.region === region && now - lastTap.t < DOUBLE_TAP_MS) {
        lastTap = null
        focusRegion(region)
        return
      }
      lastTap = { region, t: now }
      // Selected in every mode (ring on the body); the pain card only opens during intake.
      setSelected(region)
      if (modeRef.current === 'paint' && region && fakeVoice) fakeVoiceIntake(region)
      emitRegionClick(region)
      clickRef.current?.(region)
    }
    let lastTap = null
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    // Hover: the region under the pointer gets a faint outline, and the cursor shows it's tappable.
    // Raycasting runs at most once per frame.
    let hovered = null
    let pendingMove = null
    const onPointerMove = (e) => {
      pendingMove = e
    }
    const onPointerLeave = () => {
      pendingMove = null
      hovered = null
    }
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)
    // Keyboard: arrows turn the body, + / − zoom, 0 shows the whole body, Esc clears the selection.
    // Ignored while typing, and T / P stay with the talk buttons.
    const onKeyDown = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'Escape') setSelected(null)
      else if (e.key === 'ArrowLeft') moveBy({ thetaDelta: -Math.PI / 8 })
      else if (e.key === 'ArrowRight') moveBy({ thetaDelta: Math.PI / 8 })
      else if (e.key === '+' || e.key === '=') zoom(1 / ZOOM_STEP)
      else if (e.key === '-' || e.key === '_') zoom(ZOOM_STEP)
      else if (e.key === '0') resetView()
    }
    window.addEventListener('keydown', onKeyDown)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      renderer.setSize(w, h)
      composer.setSize(w, h)
      labelRenderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Camera moves: target slides, distance and height ease, the angle turns around the target
    // (never a straight line through the body). Reduce Motion jumps straight to the end.
    let move = null
    const spherical = new THREE.Spherical()
    const currentView = () => {
      spherical.setFromVector3(camera.position.clone().sub(controls.target))
      return { target: controls.target.clone(), radius: spherical.radius, phi: spherical.phi, theta: spherical.theta }
    }
    function moveTo(to, seconds = MOVE_SECONDS, ease = easeInOutCubic) {
      const from = currentView()
      let dTheta = to.thetaDelta
      if (dTheta === undefined) {
        const raw = (to.theta ?? from.theta) - from.theta
        dTheta = Math.atan2(Math.sin(raw), Math.cos(raw)) // the shorter way around
      }
      move = {
        from,
        to: {
          target: (to.target ?? from.target).clone(),
          radius: THREE.MathUtils.clamp(to.radius ?? from.radius, MIN_DISTANCE, MAX_DISTANCE),
          phi: to.phi ?? from.phi,
        },
        dTheta,
        seconds: reduceMotion ? 0.001 : seconds,
        ease,
        progress: 0,
      }
      controls.enabled = false
    }
    const moveBy = (delta) => moveTo(delta, 0.45)
    const zoom = (factor) => moveTo({ radius: currentView().radius * factor }, 0.4)
    const resetView = () => {
      spherical.setFromVector3(CAMERA_HOME.clone().sub(CAMERA_TARGET))
      moveTo({ target: CAMERA_TARGET, radius: spherical.radius, phi: spherical.phi, theta: 0 })
    }
    const turnAround = () => moveTo({ thetaDelta: Math.PI }, 1.2)
    // Close-up: aim at the middle of the region's shape, from its side, near enough to fill the view.
    const mid = new THREE.Vector3()
    function focusRegion(region) {
      const shape = shapes[region]
      if (!shape) return
      mid.copy(shape.a).add(shape.b).multiplyScalar(0.5)
      const length = shape.a.distanceTo(shape.b)
      moveTo({
        target: patientRoot.localToWorld(mid.clone()),
        radius: 1.0 + shape.r * 3 + length * 0.7,
        phi: CLOSE_UP_PHI,
        theta: CLOSE_UP_THETA[region] ?? 0,
      })
    }
    viewRef.current = { zoom, resetView, turnAround, focusRegion }
    renderer.setAnimationLoop(() => {
      timer.update()
      const t = timer.getElapsed()
      // Reduce Motion: the pain looks slow down (sharp sparks re-seed ~1/s instead of ~7/s).
      patientUniforms.setTime(reduceMotion ? t * 0.15 : t)

      if (move) {
        move.progress = Math.min(1, move.progress + timer.getDelta() / move.seconds)
        const k = move.ease(move.progress)
        controls.target.lerpVectors(move.from.target, move.to.target, k)
        camera.position
          .setFromSphericalCoords(
            THREE.MathUtils.lerp(move.from.radius, move.to.radius, k),
            THREE.MathUtils.lerp(move.from.phi, move.to.phi, k),
            move.from.theta + move.dTheta * k,
          )
          .add(controls.target)
        camera.lookAt(controls.target)
        if (move.progress === 1) {
          move = null
          controls.enabled = true
        }
      }

      if (pendingMove) {
        hovered = regionUnder(pendingMove)
        renderer.domElement.style.cursor = hovered ? 'pointer' : 'default'
        pendingMove = null
      }

      // A person never stands perfectly still: a slow, tiny weight shift from the feet.
      patientRoot.rotation.z = Math.sin(t * 0.55) * 0.004
      patientRoot.rotation.x = Math.sin(t * 0.37 + 1.3) * 0.0025
      floor.userData.ring.material.opacity = 0.28 + 0.1 * Math.sin(t * 1.2)

      const painted = new Map(visitStore.get().painted.map((p) => [p.region, p]))
      for (const region of SHAPE_ORDER) {
        const p = painted.get(region)
        patientUniforms.setPain(region, p?.type ?? null, p ? toUnit(p.intensity) : 0)
        const g = glows.get(region)
        const level = g ? glowEnvelope(t, g.start) * GLOW_PEAK : 0
        if (g && level === 0 && t - g.start > GLOW_RISE_S) glows.delete(region)
        patientUniforms.setGlow(region, g ? g.color : null, level)

        const ring =
          listeningRef.current === region
            ? { ...RING_LISTENING, level: RING_LISTENING.level * (0.55 + 0.45 * Math.sin(t * 6)) }
            : selectedRef.current === region
              ? RING_SELECTED
              : hovered === region && modeRef.current === 'paint'
                ? RING_HOVER
                : null
        patientUniforms.setRing(region, ring?.color, ring?.level ?? 0)
      }

      // Labels: during intake, every marked region shows "Right shoulder · aching · 5/10".
      const intake = modeRef.current === 'paint'
      const cameraBehind = camera.position.z < controls.target.z
      labels.forEach((entry, region) => {
        const p = painted.get(region)
        const facing = !BACK_REGIONS.has(region) || cameraBehind
        entry.label.visible = intake && !!p && facing
        if (!entry.label.visible) return
        const text = `${regionLabel(region)} · ${p.type} · ${toTen(p.intensity)}/10`
        if (text !== entry.text) entry.el.textContent = entry.text = text
      })

      controls.update()
      composer.render()
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
      if (params.get('view') === 'back') camera.position.set(0, 1.0, -5.2)
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

    // Camera intro: from a raised side angle to the resting view (skipped with Reduce Motion).
    if (!reduceMotion) {
      const rest = currentView()
      camera.position.setFromSphericalCoords(rest.radius * 1.25, rest.phi - 0.25, rest.theta - 0.75).add(controls.target)
      moveTo({ radius: rest.radius, phi: rest.phi, theta: rest.theta }, INTRO_SECONDS, easeOutCubic)
    }

    return () => {
      disposed = true
      registerBody(null)
      offSegment()
      clearInterval(devGlowTimer)
      renderer.setAnimationLoop(null)
      observer.disconnect()
      controls.dispose()
      viewRef.current = null
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      renderer.domElement.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      timer.dispose()
      scene.traverse((o) => {
        o.geometry?.dispose()
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        for (const m of mats) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) m[k]?.dispose()
          m.dispose()
        }
      })
      scene.environment?.dispose()
      scene.background.dispose()
      composer.dispose()
      target.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      mount.removeChild(labelRenderer.domElement)
    }
  }, [])

  // The pain card follows the selection after a short delay (see PICKER_DELAY_MS).
  const [pickerFor, setPickerFor] = useState(null)
  useEffect(() => {
    const id = setTimeout(() => setPickerFor(selected), selected ? PICKER_DELAY_MS : 0)
    return () => clearTimeout(id)
  }, [selected])

  const entry = selected ? visit.painted.find((p) => p.region === selected) : null

  return (
    <div className="scene">
      <div ref={mountRef} className="scene" />
      {/* View controls: a floating functional layer over the 3D content. */}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3">
        <p className="rounded-full bg-background/70 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur">
          Drag to turn · Double-click a part to zoom in
        </p>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex gap-1 rounded-xl bg-background/70 p-1 backdrop-blur">
            <ViewButton label="Zoom Out (−)" onClick={() => viewRef.current?.zoom(ZOOM_STEP)} icon={ZoomOut} iconOnly />
            <ViewButton label="Zoom In (+)" onClick={() => viewRef.current?.zoom(1 / ZOOM_STEP)} icon={ZoomIn} iconOnly />
            <ViewButton label="Turn Around" onClick={() => viewRef.current?.turnAround()} icon={RotateCcw} />
            <ViewButton label="Whole Body" onClick={() => viewRef.current?.resetView()} icon={Maximize2} />
          </div>
          {selected && (
            <Button variant="default" className="gap-2" onClick={() => viewRef.current?.focusRegion(selected)}>
              <Focus className="size-4" aria-hidden />
              Close Up: {fullRegionLabel(selected)}
            </Button>
          )}
        </div>
      </div>
      {!loaded && (
        <p className="absolute inset-x-0 top-1/2 text-center text-sm text-muted-foreground">Loading the patient…</p>
      )}
      {mode === 'paint' && selected && pickerFor === selected && (
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

function ViewButton({ label, icon, onClick, iconOnly = false }) {
  const Icon = icon
  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'default'}
      className={iconOnly ? 'size-9' : 'h-9 gap-2'}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon className="size-4" aria-hidden />
      {!iconOnly && label}
    </Button>
  )
}
