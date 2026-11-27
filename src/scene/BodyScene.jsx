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
import { visitStore, useVisit, unmentioned } from '../visitStore'
import { regionLabel } from '../regions'
import { registerBody, emitRegionClick, glow, setListening, pulse, showAnatomy, anatomyLayer, openMovement, preloadAnatomy } from './bodyApi'
import { DEV_SEGMENTS, DEV_SEGMENT_GAP_MS } from './devSegments'
import { extract } from '@/lib/api'
import IntakePicker from './IntakePicker'
import { toTen, toUnit } from './intensity'
import { PATIENTS, DEFAULT_PATIENT, SHAPE_ORDER, regionAt, regionAnchor } from './patientRegions'
import { createAnatomy } from './anatomy'
import { createMovementSim } from './movementSim'
import { MOVEMENTS } from './movements'
import MovementPanel from './MovementPanel'
import { faceTexture, loadSavedPhoto, FACE_PHOTO_ENABLED } from './facePhoto'
import AnatomyOverlay from './AnatomyOverlay'
import { createPatientMaterial, patientUniforms } from '../shaders/patientMaterial'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Bone,
  Focus,
  Hand,
  Gamepad2,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { regionLabel as fullRegionLabel } from '../regions'
import './scene.css'

// A real person: Microsoft Rocketbox "Sports_Male_04" (MIT, public/models/LICENSE-rocketbox.txt),
// baked to a static A-pose mesh in meters and compressed (meshopt + WebP). Lit by a CC0 Poly
// Haven studio HDRI (public/hdri) plus key and rim lights, with soft shadows, ambient occlusion
// and a light bloom. The patient faces +z, so their left is +x.
const HDRI_URL = '/hdri/studio_small_08_1k.hdr'

// Used when the visit JSON has no color for a speaker (v1 mock says "doctor", v2 says "pt").
const SPEAKER_COLORS = { pt: '#4FC3F7', doctor: '#4FC3F7', patient: '#F78FB3' }

// Glow envelope, in seconds: quick rise, then a slow fade.
const GLOW_RISE_S = 0.15
const GLOW_FADE_S = 2.35
const GLOW_PEAK = 1.3

// Rings on a region's edge: selected (steady), listening (pulsing), hovered (faint).
const RING_SELECTED = { color: '#ffffff', level: 0.75 }
const RING_LISTENING = { color: '#F78FB3', level: 1.1 }
const RING_HOVER = { color: '#ffffff', level: 0.35 }
// End of visit: marked pain nobody talked about glows amber on the body (plan D8).
const FLAG_COLOR = new THREE.Color('#ffb300')
const RING_FLAG = { color: '#ffb300', level: 1.0 }
// Movement check: the area the PT tested gets its own ring (teal: not a speaker, not a pain type).
const RING_ASSESSED = { color: '#5eead4', level: 0.95 }
// Pain-path pulse (plan D7): travel speed, minimum duration, how many times it runs.
const PULSE_SPEED = 0.55 // m/s along the path
const PULSE_MIN_SECONDS = 1.3
const PULSE_RUNS = 2
const PULSE_TAIL = [0.07, 0.14] // trailing samples, as a fraction of the run

// The pulse's route through the body: long regions (a leg) run end to end, picking the end
// nearer to where the pulse came from; compact ones (a knee, a shoulder) are one waypoint.
function pulseRoute(path, shapes) {
  const points = []
  for (const region of path) {
    const shape = shapes[region]
    if (!shape) continue
    const prev = points[points.length - 1]
    if (shape.a.distanceTo(shape.b) > 0.25) {
      const [first, second] = prev && prev.distanceTo(shape.b) < prev.distanceTo(shape.a) ? [shape.b, shape.a] : [shape.a, shape.b]
      points.push(first.clone(), second.clone())
    } else {
      points.push(shape.a.clone().add(shape.b).multiplyScalar(0.5))
    }
  }
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]))
  return { points, lengths, total: lengths[lengths.length - 1] }
}

function pointOnRoute(route, fraction, out) {
  const d = THREE.MathUtils.clamp(fraction, 0, 1) * route.total
  let i = 1
  while (i < route.lengths.length - 1 && route.lengths[i] < d) i++
  const span = route.lengths[i] - route.lengths[i - 1] || 1
  return out.lerpVectors(route.points[i - 1], route.points[i], (d - route.lengths[i - 1]) / span)
}

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
const CONTROLS_KEY = 'whereithurts.viewControls'
function readControlsOpen() {
  try {
    return localStorage.getItem(CONTROLS_KEY) !== 'closed'
  } catch {
    return true
  }
}
function saveControlsOpen(open) {
  try {
    localStorage.setItem(CONTROLS_KEY, open ? 'open' : 'closed')
  } catch {
    // Blocked storage: the panel just opens again next time.
  }
}
// View controls without a mouse or trackpad (buttons and keys): one step of turning or tilting.
const TURN_STEP = Math.PI / 8
const TILT_STEP = 0.2
// Slide: move the view up or down the body (the orbit center's height), within these limits.
const SLIDE_STEP = 0.2
const MIN_TARGET_Y = 0.1
const MAX_TARGET_Y = 1.9
const MIN_PHI = 0.2 // same limits as the orbit controls below
const MAX_PHI = 1.85
// Camera angle around the patient for each side (the patient faces +z; their left is +x).
const SIDE_VIEWS = { front: 0, left: Math.PI / 2, back: Math.PI, right: -Math.PI / 2 }
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

// Stage colors from the theme (src/index.css --stage-*), so the studio follows light and dark mode.
function stageColors() {
  const css = getComputedStyle(document.documentElement)
  const value = (name) => css.getPropertyValue(name).trim()
  return {
    center: value('--stage-center'),
    mid: value('--stage-mid'),
    edge: value('--stage'),
    floor: value('--stage-floor'),
    ring: value('--stage-ring'),
  }
}

// Studio backdrop: lighter behind the patient, fading to the edge color.
function makeBackground(colors = stageColors()) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size * 0.42, 0, size / 2, size / 2, size * 0.8)
  g.addColorStop(0, colors.center)
  g.addColorStop(0.55, colors.mid)
  g.addColorStop(1, colors.edge)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const floorPool = (colors) => radialTexture([[0, colors.floor], [1, 'rgba(0,0,0,0)']])

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
function buildFloor(colors = stageColors()) {
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
    new THREE.MeshBasicMaterial({ map: floorPool(colors), transparent: true, depthWrite: false }),
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.y = 0.001
  floor.add(pool)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.632, 128),
    new THREE.MeshBasicMaterial({ color: colors.ring, transparent: true, opacity: 0.5, depthWrite: false }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.002
  floor.add(ring)
  floor.userData.ring = ring
  floor.userData.pool = pool
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
  // Each line goes through /api/extract like live speech, so ratings and movements come along.
  DEV_SEGMENTS.forEach((seg, i) => {
    setTimeout(async () => {
      const speaker = seg.speaker === 'pt' ? ptRole : seg.speaker
      const found = await extract(seg.text, speaker === 'patient' ? 'patient' : 'pt').catch(() => ({}))
      visitStore.addSegment({
        id: `dev-${Date.now()}-${i}`,
        path: [],
        ...seg,
        speaker,
        rating: found.rating ?? null,
        movement: found.movement ?? null,
      })
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
export default function BodyScene({ onRegionClick, mode = 'paint', patient = DEFAULT_PATIENT, canShowAnatomy = false }) {
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
  // The no-mouse controls panel: open by default, remembered per browser.
  const [showControls, setShowControlsState] = useState(() => readControlsOpen())
  const setShowControls = (next) =>
    setShowControlsState((open) => {
      const value = typeof next === 'function' ? next(open) : next
      saveControlsOpen(value)
      return value
    })
  // Show Anatomy: { region, ready } while open; the structure the PT picked inside it.
  const [anatomyOpen, setAnatomyOpen] = useState(null)
  const [structure, setStructure] = useState(null)
  const [hoverLabel, setHoverLabel] = useState(null)
  const simRef = useRef(null) // the open movement simulation (src/scene/movementSim.js)
  const [layers, setLayers] = useState({ skin: true, muscle: true, bone: true, mark: true })
  const canAnatomyRef = useRef(canShowAnatomy)
  canAnatomyRef.current = canShowAnatomy
  const selectedRef = useRef(null)
  const listeningRef = useRef(null)
  selectedRef.current = selected
  listeningRef.current = listening

  // Leaving intake (Start visit) closes the picker.
  useEffect(() => {
    if (mode !== 'paint') setSelected(null)
  }, [mode])
  // A new step closes anatomy and Reach Up, so nothing hides the end-of-visit flags; the visit
  // preloads the anatomy, so a spoken "raise your arm" plays without waiting for the file.
  const firstMode = useRef(true)
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false
    } else {
      showAnatomy(null)
    }
    if (mode === 'visit') preloadAnatomy()
  }, [mode])
  // The band where the patient said it hurts follows the visit.
  const painArc = anatomyOpen?.sim ? (visit.painArcs?.[anatomyOpen.region] ?? null) : null
  useEffect(() => {
    simRef.current?.setArc(painArc)
  }, [painArc, anatomyOpen])

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
    const rimCool = new THREE.DirectionalLight('#f2f2f2', 2.2)
    rimCool.position.set(-2.6, 2.6, -3.0)
    const rimWarm = new THREE.DirectionalLight('#ffcfa6', 1.3)
    rimWarm.position.set(2.8, 1.8, -2.6)
    const fill = new THREE.HemisphereLight('#ececec', '#141414', 0.35)
    scene.add(key, key.target, rimCool, rimWarm, fill)

    const floor = buildFloor()
    scene.add(floor)
    // Light/dark switch (the .dark class on <html>): rebuild the backdrop and floor colors.
    const applyStage = () => {
      const colors = stageColors()
      const previous = scene.background
      scene.background = makeBackground(colors)
      previous?.dispose()
      const pool = floor.userData.pool.material
      pool.map.dispose()
      pool.map = floorPool(colors)
      pool.needsUpdate = true
      floor.userData.ring.material.color.set(colors.ring)
      // Light studio: only glows brighter than white may bloom (threshold 1 in the HDR buffer),
      // otherwise the white backdrop bleeds over the patient and washes them out. Softer vignette.
      const dark = document.documentElement.classList.contains('dark')
      bloom.threshold = dark ? 0.82 : 1.0
      bloom.strength = dark ? 0.5 : 0.35
      vignette.uniforms.darkness.value = dark ? 1.0 : 0.55
    }
    applyStage()
    const themeObserver = new MutationObserver(applyStage)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const patientRoot = new THREE.Group()
    scene.add(patientRoot)
    const patientMeshes = []
    const skinMaterials = [] // [{ material, transparent }]: see-through while anatomy is open
    const labels = new Map()
    // Dev: ?fit=right_shoulder:x,y,z,armDegrees,scale tries another anatomy fit (see patientRegions.js).
    const devFit = import.meta.env.DEV && new URLSearchParams(location.search).get('fit')
    if (devFit) {
      const [region, nums] = devFit.split(':')
      const [x, y, z, arm, scale] = nums.split(',').map(Number)
      const fit = model.anatomy?.[region]
      if (fit) {
        fit.target.set(x, y, z)
        if (scale) fit.scale = scale
        if (fit.arm && !Number.isNaN(arm)) fit.arm.z = arm
      }
    }
    const anatomy = createAnatomy(patientRoot, model.anatomy)

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
          for (const material of [o.material].flat()) skinMaterials.push({ material, transparent: material.transparent })
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
        // A face photo kept from earlier (Use My Photo) goes back on, while the feature is on.
        if (FACE_PHOTO_ENABLED) {
          loadSavedPhoto()
            .then((photo) => photo && !disposed && setFace(photo))
            .catch((error) => console.warn('Saved face photo not applied:', error))
        }
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
      showRatings(region, rating) {
        ratingOverride = region ? { region, rating } : null
      },
      pulse(path, color) {
        const route = pulseRoute(path, shapes)
        if (route.points.length < 2 || route.total < 0.05) return
        pulseRun = {
          route,
          color: new THREE.Color(color),
          start: timer.getElapsed(),
          seconds: Math.max(PULSE_MIN_SECONDS, route.total / PULSE_SPEED),
        }
      },
      // A still of the whole body from the front or back, on white, for the printed reports.
      // Rendered and read back in the same tick (no preserveDrawingBuffer needed); the view the
      // person was looking at comes straight back.
      snapshot(side) {
        const saved = {
          position: camera.position.clone(),
          target: controls.target.clone(),
          background: scene.background,
          bloom: bloom.enabled,
          vignette: vignette.enabled,
        }
        const offset = CAMERA_HOME.clone().sub(CAMERA_TARGET)
        if (side === 'back') offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
        camera.position.copy(CAMERA_TARGET).add(offset)
        camera.lookAt(CAMERA_TARGET)
        scene.background = new THREE.Color('#ffffff')
        floor.visible = false
        bloom.enabled = false
        vignette.enabled = false
        composer.render()
        const url = renderer.domElement.toDataURL('image/png')
        scene.background = saved.background
        floor.visible = true
        bloom.enabled = saved.bloom
        vignette.enabled = saved.vignette
        camera.position.copy(saved.position)
        controls.target.copy(saved.target)
        camera.lookAt(saved.target)
        composer.render()
        return { url, aspect: renderer.domElement.width / renderer.domElement.height }
      },
      showAnatomy: (region) => (region ? openAnatomy(region) : closeAnatomy()),
      openMovement: (region) => openAnatomy(region, { sim: true }),
      playMovement: (region, label, direction) => playMovement(region, label, direction),
      preloadAnatomy: () => anatomy.preload(),
      // Use My Photo: a canvas with a face, or null for the model's own face. Ends on a close-up.
      async setFacePhoto(photo) {
        if (anatomyRegion) closeAnatomy()
        await setFace(photo)
        // Reveal: a straight-on close-up of the face.
        const head = headMesh()
        if (!disposed && head) {
          const box = new THREE.Box3().setFromObject(head)
          const face = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - (box.max.y - box.min.y) * 0.4, 0)
          moveTo({ target: face, radius: 1.05, phi: 1.5, theta: 0 }, 1.4)
        }
      },
      anatomyLayer: (layer, visible) => setAnatomyLayer(layer, visible),
      select(region) {
        setSelected(region)
        emitRegionClick(region)
        clickRef.current?.(region)
        // Chosen from the list: fly to it, so back pain is visible without turning by hand.
        if (region) focusRegion(region)
      },
    })

    // Use My Photo (src/scene/facePhoto.js). The head mesh is the one whose material is the head's.
    const headMesh = () => patientMeshes.find((m) => /head/i.test([m.material].flat()[0]?.name ?? ''))
    // A straight-on render of the face (the person's view is restored in the same tick), and a way
    // to find the head texture's UV under any point of it.
    function captureFace(head) {
      const box = new THREE.Box3().setFromObject(head)
      const size = box.getSize(new THREE.Vector3())
      // The head mesh runs from the collar to the crown; the face sits in its upper part.
      const aim = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - size.y * 0.4, (box.min.z + box.max.z) / 2)
      const shotCamera = camera.clone()
      const distance = (size.y * 0.42) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      shotCamera.position.set(aim.x, aim.y, aim.z + distance)
      shotCamera.lookAt(aim)
      shotCamera.updateMatrixWorld()
      const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), bloom: bloom.enabled, vignette: vignette.enabled }
      camera.position.copy(shotCamera.position)
      camera.quaternion.copy(shotCamera.quaternion)
      bloom.enabled = false
      vignette.enabled = false
      composer.render()
      const image = document.createElement('canvas')
      image.width = renderer.domElement.width
      image.height = renderer.domElement.height
      image.getContext('2d').drawImage(renderer.domElement, 0, 0)
      camera.position.copy(saved.position)
      camera.quaternion.copy(saved.quaternion)
      bloom.enabled = saved.bloom
      vignette.enabled = saved.vignette
      composer.render()
      const faceRay = new THREE.Raycaster()
      const at = new THREE.Vector2()
      return {
        image,
        uvAt(x, y) {
          at.set(x * 2 - 1, 1 - y * 2)
          faceRay.setFromCamera(at, shotCamera)
          return faceRay.intersectObject(head, false)[0]?.uv?.clone() ?? null
        },
      }
    }
    let faceRequest = 0
    async function setFace(photo) {
      const head = headMesh()
      if (!head) throw new Error('The patient hasn’t loaded yet.')
      const material = [head.material].flat()[0]
      material.userData.originalMap ??= material.map
      const original = material.userData.originalMap
      const request = ++faceRequest
      let next = original
      if (photo) {
        next = await faceTexture(photo, original, captureFace(head))
        if (disposed || request !== faceRequest) return next.dispose()
      }
      if (material.map !== original) material.map.dispose()
      material.map = next
    }

    // Show Anatomy: the skin around the region fades to see-through (the shader's x-ray sphere),
    // the reference anatomy appears inside, and ambient occlusion is turned off so it isn't
    // shaded by the skin it's seen through. Closing fades back, then removes it.
    const xray = { level: 0, goal: 0, a: new THREE.Vector3(), b: new THREE.Vector3(), radius: 0.28, showMark: true, skin: 1, skinGoal: 1 }
    let anatomyRequest = 0
    let anatomyRegion = null // open (or opening)
    const setSkinSeeThrough = (on) => {
      for (const s of skinMaterials) {
        const next = on || s.transparent
        if (s.material.transparent !== next) {
          s.material.transparent = next
          s.material.needsUpdate = true
        }
      }
    }
    const sims = new Map() // region -> movement simulation, made the first time it opens
    let simActive = null // the open one
    let lastBandGlow = 0
    async function openAnatomy(region, { sim = false, label = null } = {}) {
      if (!anatomy.has(region)) return
      const request = ++anatomyRequest
      simActive?.reset()
      simActive = null
      simRef.current = null
      anatomyRegion = region
      setAnatomyOpen({ region, ready: false, sim, label })
      setStructure(null)
      // Clear the stage for the anatomy (not saved: the Controls button brings the panel back).
      setShowControlsState(false)
      let ok = false
      try {
        ok = await anatomy.show(region)
      } catch (error) {
        console.error('Show Anatomy failed to load', error)
        ok = false
      }
      if (disposed || request !== anatomyRequest) return
      if (!ok) {
        anatomyRegion = null
        return setAnatomyOpen(null)
      }
      const entry = anatomy.region()
      const fit = entry.fit
      const movement = MOVEMENTS[region]
      if (sim && entry.rig && movement) {
        // A movement simulation: the baked body can't move, so the skin over the moving part
        // becomes a ghost outline and the bones move inside it.
        if (!sims.has(region)) sims.set(region, createMovementSim(movement, entry, { reduceMotion }))
        simActive = sims.get(region)
        simActive.setArc(visitStore.get().painArcs?.[region] ?? null)
        simActive.show(true)
        simRef.current = simActive
        const ghost = movement.ghost(entry)
        xray.a.copy(ghost.a)
        xray.b.copy(ghost.b)
        xray.radius = ghost.r
        xray.goal = 1
        xray.skinGoal = 0.5 // a faint ghost outline (the rim), so the moving bones read clearly
      } else {
        // See-through around the anchor, or along a limb (fit.xray: { a, b, r }).
        xray.a.copy(fit.xray?.a ?? fit.target)
        xray.b.copy(fit.xray?.b ?? fit.target)
        xray.radius = fit.xray?.r ?? 0.28
        xray.goal = 1
        xray.skinGoal = 1
      }
      setSkinSeeThrough(true)
      gtao.blendIntensity = 0
      bloom.enabled = false // light bones would bloom into a white haze
      setAnatomyOpen({ region, ready: true, sim: !!simActive, label })
      if (simActive) {
        const view = movement.camera(entry)
        moveTo({ target: patientRoot.localToWorld(view.at), radius: view.radius, phi: view.phi, theta: view.theta })
      } else {
        focusRegion(region, fit.viewTheta)
      }
    }
    // Voice: the PT asked for a movement ("raise your arm", "turn your head to the left"). Open its
    // simulation, play one sweep (direction -1: the other way), and go back to the skin afterwards
    // unless someone took the slider.
    async function playMovement(region, label, direction = 1) {
      if (!MOVEMENTS[region] || !model.anatomy?.[region]) return
      if (simActive?.movement !== MOVEMENTS[region]) await openAnatomy(region, { sim: true, label })
      else setAnatomyOpen((open) => (open ? { ...open, label } : open))
      if (!simActive || disposed) return
      const sim = simActive
      sim.play(() => {
        if (!sim.touched && simActive === sim) closeAnatomy()
      }, direction)
    }
    function closeAnatomy() {
      anatomyRequest++
      // Reach Up zooms out of the whole body; leaving it shows the whole body again (so the end of
      // the visit never opens on a close-up that hides an amber flag).
      if (simActive) {
        simActive.reset()
        resetView()
      }
      simActive = null
      simRef.current = null
      anatomyRegion = null
      anatomy.hide()
      xray.goal = 0
      xray.skinGoal = 1
      xray.showMark = true
      anatomy.highlight(null)
      setAnatomyOpen(null)
      setStructure(null)
      setLayers({ skin: true, muscle: true, bone: true, mark: true })
      anatomy.setLayer('muscle', true)
      anatomy.setLayer('bone', true)
    }
    function setAnatomyLayer(layer, visible) {
      if (layer === 'mark') xray.showMark = visible
      else if (layer === 'skin') xray.skinGoal = visible ? 1 : 0 // 1 = see-through ghost, 0 = gone around the region
      else anatomy.setLayer(layer, visible)
    }
    const structureUnder = (e) => {
      const meshes = anatomy.meshes()
      if (!meshes.length) return null
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      // Joints first: they're drawn on top and sit inside the bones. A little slack (about 14 px)
      // makes the small markers easy to hit.
      let joint = null
      let best = 14 // pixels
      for (const m of anatomy.markers()) {
        const p = m.getWorldPosition(new THREE.Vector3()).project(camera)
        const d = Math.hypot(((p.x - pointer.x) * rect.width) / 2, ((p.y - pointer.y) * rect.height) / 2)
        if (p.z < 1 && d < best) {
          best = d
          joint = m
        }
      }
      return joint ?? raycaster.intersectObjects(meshes, false)[0]?.object ?? null
    }

    // Integration: every new segment lights its regions in the speaker's color.
    let ratingOverride = null // { region, rating }: Before / After from the movement check
    let pulseRun = null
    const pulseHead = new THREE.Vector3()
    const pulseTail1 = new THREE.Vector3()
    const pulseTail2 = new THREE.Vector3()
    const offSegment = visitStore.onSegment((segment) => {
      const color = speakerColor(segment.speaker)
      segment.regions.forEach((region) => glow(region, color))
      // Pain described as moving ("starts in my lower back and shoots down my left leg").
      if (segment.path?.length > 1) pulse(segment.path, color)
    })

    // Drag (left or right button) orbits a full 360°, scroll zooms toward the pointer, and a short
    // click selects a body part (see onPointerUp).
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(CAMERA_TARGET)
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    // Shift / Ctrl / ⌘ + drag slides the body up or down (OrbitControls pans on a modified left drag).
    // Locked to vertical: sideways and depth movement are undone, and the height stays in range.
    controls.enablePan = true
    controls.screenSpacePanning = true
    let panLock = null
    controls.addEventListener('start', () => (panLock = controls.target.clone()))
    controls.addEventListener('end', () => (panLock = null))
    controls.addEventListener('change', () => {
      if (!panLock) return
      const t = controls.target
      const fix = new THREE.Vector3(
        panLock.x - t.x,
        THREE.MathUtils.clamp(t.y, MIN_TARGET_Y, MAX_TARGET_Y) - t.y,
        panLock.z - t.z,
      )
      if (fix.lengthSq() > 0) {
        t.add(fix)
        camera.position.add(fix)
      }
    })
    controls.enableDamping = true
    controls.zoomToCursor = true
    controls.minDistance = MIN_DISTANCE
    controls.maxDistance = MAX_DISTANCE
    controls.minPolarAngle = MIN_PHI
    controls.maxPolarAngle = MAX_PHI
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
      if (anatomy.current()) {
        // Picking bones and muscles (and Add to Report) is a PT tool, and not part of Reach Up.
        if (simActive || !canAnatomyRef.current) return
        const mesh = structureUnder(e)
        anatomy.highlight(mesh, 0.35)
        setStructure(mesh ? { ...mesh.userData } : null)
        return
      }
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
    let hoveredStructure = null
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
    // Keyboard (no mouse or trackpad needed): ← → turn, ↑ ↓ tilt, Shift+↑ ↓ or Page Up / Down slide, + / − zoom, F / L / B / R show
    // the front, the patient's left side, the back, the right side, 0 the whole body, ? the
    // controls panel, Esc clears the selection. Ignored while typing; T / P stay with the talk buttons.
    const KEY_ACTIONS = {
      ArrowLeft: () => turn(-1),
      ArrowRight: () => turn(1),
      ArrowUp: () => tilt(-1),
      ArrowDown: () => tilt(1),
      PageUp: () => slide(1),
      PageDown: () => slide(-1),
      '+': () => zoom(1 / ZOOM_STEP),
      '=': () => zoom(1 / ZOOM_STEP),
      '-': () => zoom(ZOOM_STEP),
      _: () => zoom(ZOOM_STEP),
      0: () => resetView(),
      f: () => showSide('front'),
      l: () => showSide('left'),
      b: () => showSide('back'),
      r: () => showSide('right'),
      '?': () => setShowControls((open) => !open),
    }
    const onKeyDown = (e) => {
      // Typing, or arrow keys on a slider (Reach Up), aren't camera moves.
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="slider"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') return anatomyRegion ? closeAnatomy() : setSelected(null)
      if (e.key.toLowerCase() === 'x' && canAnatomyRef.current) {
        if (anatomyRegion) return closeAnatomy()
        if (selectedRef.current && anatomy.has(selectedRef.current)) return openAnatomy(selectedRef.current)
        return
      }
      const shiftSlide = e.shiftKey && { ArrowUp: () => slide(1), ArrowDown: () => slide(-1) }[e.key]
      const action = shiftSlide || KEY_ACTIONS[e.key.length === 1 ? e.key.toLowerCase() : e.key]
      if (!action) return
      e.preventDefault() // arrows would otherwise scroll a panel
      action()
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
    const turn = (direction) => moveBy({ thetaDelta: direction * TURN_STEP })
    // Slide the body up (+1) or down (-1) in view: the orbit center moves the other way.
    const slide = (direction) => {
      const t = currentView().target
      const y = THREE.MathUtils.clamp(t.y - direction * SLIDE_STEP, MIN_TARGET_Y, MAX_TARGET_Y)
      moveTo({ target: new THREE.Vector3(t.x, y, t.z) }, 0.35)
    }
    const tilt = (direction) =>
      moveTo({ phi: THREE.MathUtils.clamp(currentView().phi + direction * TILT_STEP, MIN_PHI, MAX_PHI) }, 0.45)
    const showSide = (side) => {
      spherical.setFromVector3(CAMERA_HOME.clone().sub(CAMERA_TARGET))
      moveTo({ target: CAMERA_TARGET, radius: spherical.radius, phi: spherical.phi, theta: SIDE_VIEWS[side] })
    }
    // Close-up: aim at the middle of the region's shape, from its side, near enough to fill the view.
    const mid = new THREE.Vector3()
    // theta: optional view angle (Show Anatomy picks the side its structures are on).
    function focusRegion(region, theta) {
      const shape = shapes[region]
      if (!shape) return
      mid.copy(shape.a).add(shape.b).multiplyScalar(0.5)
      const length = shape.a.distanceTo(shape.b)
      moveTo({
        target: patientRoot.localToWorld(mid.clone()),
        radius: 1.0 + shape.r * 3 + length * 0.7,
        phi: CLOSE_UP_PHI,
        theta: theta ?? CLOSE_UP_THETA[region] ?? 0,
      })
    }
    viewRef.current = { zoom, resetView, turnAround, focusRegion, turn, tilt, slide, showSide }
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
        if (anatomy.current()) {
          const mesh = simActive || !canAnatomyRef.current ? null : structureUnder(pendingMove)
          if (mesh !== hoveredStructure) {
            hoveredStructure = mesh
            setHoverLabel(mesh?.userData.label ?? null)
          }
          renderer.domElement.style.cursor = mesh ? 'pointer' : 'default'
          hovered = null
        } else {
          hovered = regionUnder(pendingMove)
          renderer.domElement.style.cursor = hovered ? 'pointer' : 'default'
        }
        pendingMove = null
      }

      // Show Anatomy fade (about 0.6 s each way).
      const xrayStep = timer.getDelta() / (reduceMotion ? 0.001 : 0.6)
      if (xray.skin !== xray.skinGoal) {
        xray.skin = xray.skinGoal > xray.skin ? Math.min(xray.skinGoal, xray.skin + xrayStep) : Math.max(xray.skinGoal, xray.skin - xrayStep)
      }
      if (xray.level !== xray.goal) {
        const step = xrayStep
        xray.level = xray.goal > xray.level ? Math.min(xray.goal, xray.level + step) : Math.max(xray.goal, xray.level - step)
        if (xray.level === 0 && !anatomyRegion) {
          setSkinSeeThrough(false)
          gtao.blendIntensity = 0.85
          bloom.enabled = true
        }
      }
      patientUniforms.setXray(xray.a, xray.b, xray.radius, xray.level, xray.showMark, xray.skin)
      anatomy.update(t)

      // Reach Up: move the arm, and pulse the shoulder while it's inside the band where it hurts.
      if (simActive && simActive.update(timer.getDelta()) && t - lastBandGlow > 1.2) {
        lastBandGlow = t
        glow(anatomyRegion, SPEAKER_COLORS.patient)
      }

      // A person never stands perfectly still: a slow, tiny weight shift from the feet.
      patientRoot.rotation.z = Math.sin(t * 0.55) * 0.004
      patientRoot.rotation.x = Math.sin(t * 0.37 + 1.3) * 0.0025
      floor.userData.ring.material.opacity = 0.45 + 0.1 * Math.sin(t * 1.2)

      // Pain-path pulse: runs PULSE_RUNS times, fading in and out at each end of the route.
      if (pulseRun) {
        const elapsed = t - pulseRun.start
        const run = Math.floor(elapsed / pulseRun.seconds)
        if (run >= PULSE_RUNS) {
          pulseRun = null
          patientUniforms.setPulse([pulseHead, pulseTail1, pulseTail2], null, 0)
        } else {
          const u = (elapsed % pulseRun.seconds) / pulseRun.seconds
          pointOnRoute(pulseRun.route, u, pulseHead)
          pointOnRoute(pulseRun.route, u - PULSE_TAIL[0], pulseTail1)
          pointOnRoute(pulseRun.route, u - PULSE_TAIL[1], pulseTail2)
          const fade = Math.min(1, u / 0.08, (1 - u) / 0.12)
          patientUniforms.setPulse([pulseHead, pulseTail1, pulseTail2], pulseRun.color, fade)
        }
      }

      const visitNow = visitStore.get()
      const painted = new Map(visitNow.painted.map((p) => [p.region, p]))
      const ended = modeRef.current === 'ended'
      const flagged = ended ? new Map(unmentioned(visitNow).map((p) => [p.region, p.coverage])) : null
      const missed = flagged ? new Set(flagged.keys()) : null
      const checks = visitNow.observations ?? []
      const assessed = modeRef.current !== 'paint' ? (checks[checks.length - 1]?.assessedRegion ?? null) : null
      for (const region of SHAPE_ORDER) {
        const p = painted.get(region)
        if (ratingOverride?.region === region) {
          patientUniforms.setPain(region, p?.type ?? 'aching', ratingOverride.rating / 10)
        } else {
          patientUniforms.setPain(region, p?.type ?? null, p ? toUnit(p.intensity) : 0)
        }
        const g = glows.get(region)
        const level = g ? glowEnvelope(t, g.start) * GLOW_PEAK : 0
        if (g && level === 0 && t - g.start > GLOW_RISE_S) glows.delete(region)
        if (missed?.has(region)) {
          // Missed pain: a steady amber glow that breathes slowly, over the pain look.
          patientUniforms.setGlow(region, FLAG_COLOR, 0.75 + 0.25 * Math.sin(t * 2.2))
        } else {
          patientUniforms.setGlow(region, g ? g.color : null, level)
        }

        const ring =
          listeningRef.current === region
            ? { ...RING_LISTENING, level: RING_LISTENING.level * (0.55 + 0.45 * Math.sin(t * 6)) }
            : selectedRef.current === region
              ? RING_SELECTED
              : missed?.has(region)
                ? RING_FLAG
                : assessed === region
                ? RING_ASSESSED
                : hovered === region && modeRef.current === 'paint'
                  ? RING_HOVER
                  : null
        // Show Anatomy: no rings over the see-through skin.
        patientUniforms.setRing(region, anatomyRegion ? null : ring?.color, anatomyRegion ? 0 : (ring?.level ?? 0))
      }

      // Labels: during intake, every marked region shows "Right shoulder · aching · 5/10";
      // at the end, every missed region says so.
      const intake = modeRef.current === 'paint'
      const cameraBehind = camera.position.z < controls.target.z
      labels.forEach((entry, region) => {
        const p = painted.get(region)
        const facing = !BACK_REGIONS.has(region) || cameraBehind
        const isMissed = !!missed?.has(region)
        const isAssessed = assessed === region && !isMissed
        entry.label.visible = (((intake || isMissed) && !!p) || isAssessed) && facing && !anatomyRegion
        entry.el.classList.toggle('flag', isMissed)
        entry.el.classList.toggle('assessed', isAssessed)
        if (!entry.label.visible) return
        const text = isMissed
          ? `${regionLabel(region)} · ${flagged.get(region) === 'pt_asked' ? 'asked, no answer' : 'not discussed'}`
          : isAssessed
            ? `Area assessed by PT · ${regionLabel(region)}`
            : `${regionLabel(region)} · ${p.type} · ${toTen(p.intensity)}/10`
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
      // ?anatomy=right_shoulder opens Show Anatomy once the patient has loaded.
      const devAnatomy = params.get('anatomy')
      if (devAnatomy) setTimeout(() => openAnatomy(devAnatomy), 2500)
      // For screenshot scripts: camera and anatomy controls from the console.
      window.__scene = { moveTo, currentView, openAnatomy, closeAnatomy, setAnatomyLayer, THREE, patientRoot, patientMeshes, anatomy, playMovement, sim: () => simActive }
      const devRegion = params.get('glow')
      if (devRegion) {
        const fire = () => glow(devRegion, SPEAKER_COLORS.pt)
        fire()
        devGlowTimer = setInterval(fire, 3000)
      }
      // ?pulse=lower_back,left_leg runs the pain-path pulse every 4 s.
      const devPulse = params.get('pulse')
      if (devPulse) {
        const fire = () => pulse(devPulse.split(','), SPEAKER_COLORS.patient)
        setTimeout(fire, 2500)
        devGlowTimer = setInterval(fire, 4000)
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
      if (import.meta.env.DEV) delete window.__scene
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
      themeObserver.disconnect()
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
        {/* Show Anatomy puts its own panel in this corner. */}
        {anatomyOpen ? (
          <span />
        ) : (
          <p className="rounded-full bg-card/85 px-3 py-1.5 text-sm text-muted-foreground ring-1 ring-border backdrop-blur">
            Drag to turn · Shift-drag to slide up or down · Double-click a part to zoom in
          </p>
        )}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex gap-1 rounded-xl bg-card/85 p-1 ring-1 ring-border backdrop-blur">
            <ViewButton label="Zoom Out (−)" onClick={() => viewRef.current?.zoom(ZOOM_STEP)} icon={ZoomOut} iconOnly />
            <ViewButton label="Zoom In (+)" onClick={() => viewRef.current?.zoom(1 / ZOOM_STEP)} icon={ZoomIn} iconOnly />
            <ViewButton label="Turn Around" onClick={() => viewRef.current?.turnAround()} icon={RotateCcw} />
            <ViewButton label="Whole Body" onClick={() => viewRef.current?.resetView()} icon={Maximize2} />
            <ViewButton
              label="Controls"
              title="Show or hide the view controls (?)"
              onClick={() => setShowControls((open) => !open)}
              icon={Gamepad2}
              pressed={showControls}
            />
          </div>
          {selected && !anatomyOpen && (
            <Button variant="default" className="gap-2" onClick={() => viewRef.current?.focusRegion(selected)}>
              <Focus className="size-4" aria-hidden />
              Close Up: {fullRegionLabel(selected)}
            </Button>
          )}
          {selected && !anatomyOpen && MOVEMENTS[selected] && PATIENTS[patient]?.anatomy?.[selected] && (
            <Button variant="secondary" className="gap-2" onClick={() => openMovement(selected)} title={MOVEMENTS[selected].question}>
              <Hand className="size-4" aria-hidden />
              {MOVEMENTS[selected].button}
            </Button>
          )}
          {selected && !anatomyOpen && canShowAnatomy && PATIENTS[patient]?.anatomy?.[selected] && (
            <Button
              variant="secondary"
              className="gap-2"
              onClick={() => showAnatomy(selected)}
              title="Show the bones and muscles under the skin (X)"
            >
              <Bone className="size-4" aria-hidden />
              Show Anatomy <kbd className="text-xs text-muted-foreground">X</kbd>
            </Button>
          )}
        </div>
      </div>
      {showControls && (
        <div className="absolute right-4 bottom-4">
          <ViewControls view={viewRef} onClose={() => setShowControls(false)} />
        </div>
      )}
      {!loaded && (
        <p className="absolute inset-x-0 top-1/2 text-center text-sm text-muted-foreground">Loading the patient…</p>
      )}
      {anatomyOpen?.sim && (
        <MovementPanel
          region={anatomyOpen.region}
          sim={anatomyOpen.ready ? simRef.current : null}
          label={anatomyOpen.label}
          arc={painArc}
          onClose={() => showAnatomy(null)}
        />
      )}
      {anatomyOpen && !anatomyOpen.sim && (
        <AnatomyOverlay
          region={anatomyOpen.region}
          ready={anatomyOpen.ready}
          structure={structure}
          hoverLabel={hoverLabel}
          layers={layers}
          onLayer={(layer, visible) => {
            setLayers((current) => ({ ...current, [layer]: visible }))
            anatomyLayer(layer, visible)
          }}
          onClose={() => showAnatomy(null)}
          onCloseStructure={() => setStructure(null)}
        />
      )}
      {mode === 'paint' && selected && pickerFor === selected && !anatomyOpen && (
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

function ViewButton({ label, title, icon, onClick, iconOnly = false, pressed }) {
  const Icon = icon
  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'default'}
      className={cn(iconOnly ? 'size-9' : 'h-9 gap-2', 'aria-pressed:bg-secondary')}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
    >
      <Icon className="size-4" aria-hidden />
      {!iconOnly && label}
    </Button>
  )
}

// For people who don't use a mouse or trackpad: every camera move as a button, with its key.
// Opens from the gamepad button or with "?"; every control is reachable with Tab.
function ViewControls({ view, onClose }) {
  const act = (name, ...args) => () => view.current?.[name](...args)
  return (
    <section
      aria-label="View controls"
      className="w-64 space-y-3 rounded-xl bg-card/90 p-3 text-sm text-foreground shadow-lg ring-1 ring-border backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-bold">View Controls</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Hide
        </Button>
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        <span className="text-muted-foreground">Turn</span>
        <div className="flex gap-1">
          <ViewButton label="Turn Left (←)" onClick={act('turn', -1)} icon={ChevronLeft} iconOnly />
          <ViewButton label="Turn Right (→)" onClick={act('turn', 1)} icon={ChevronRight} iconOnly />
        </div>
        <span className="text-muted-foreground">Tilt</span>
        <div className="flex gap-1">
          <ViewButton label="Look From Above (↑)" onClick={act('tilt', -1)} icon={ChevronUp} iconOnly />
          <ViewButton label="Look From Below (↓)" onClick={act('tilt', 1)} icon={ChevronDown} iconOnly />
        </div>
        <span className="text-muted-foreground">Slide</span>
        <div className="flex gap-1">
          <ViewButton label="Slide Body Up (Shift+↑)" onClick={act('slide', 1)} icon={ChevronsUp} iconOnly />
          <ViewButton label="Slide Body Down (Shift+↓)" onClick={act('slide', -1)} icon={ChevronsDown} iconOnly />
        </div>
        <span className="text-muted-foreground">Zoom</span>
        <div className="flex gap-1">
          <ViewButton label="Zoom Out (−)" onClick={act('zoom', ZOOM_STEP)} icon={ZoomOut} iconOnly />
          <ViewButton label="Zoom In (+)" onClick={act('zoom', 1 / ZOOM_STEP)} icon={ZoomIn} iconOnly />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Button variant="outline" size="sm" onClick={act('showSide', 'front')} title="Front (F)">
          Front <kbd className="ml-auto text-xs text-muted-foreground">F</kbd>
        </Button>
        <Button variant="outline" size="sm" onClick={act('showSide', 'back')} title="Back (B)">
          Back <kbd className="ml-auto text-xs text-muted-foreground">B</kbd>
        </Button>
        <Button variant="outline" size="sm" onClick={act('showSide', 'left')} title="Patient's left side (L)">
          Left Side <kbd className="ml-auto text-xs text-muted-foreground">L</kbd>
        </Button>
        <Button variant="outline" size="sm" onClick={act('showSide', 'right')} title="Patient's right side (R)">
          Right Side <kbd className="ml-auto text-xs text-muted-foreground">R</kbd>
        </Button>
        <Button variant="outline" size="sm" className="col-span-2" onClick={act('resetView')} title="Whole body (0)">
          Whole Body <kbd className="ml-auto text-xs text-muted-foreground">0</kbd>
        </Button>
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        Keys: ← → turn · ↑ ↓ tilt · Shift+↑ ↓ slide (or Shift-drag) · + − zoom · F L B R sides · 0 whole body · Esc clear selection. Sides are the
        patient’s.
      </p>
    </section>
  )
}
