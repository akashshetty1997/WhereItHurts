import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { visitStore } from '../visitStore'

// Placeholder body: capsules and boxes (PLAN fallback option 3) until the GLB is ready.
// The body faces +z (toward the camera), so the PATIENT's left is +x.
const SKIN = '#cfd8dc'
const PAIN_COLORS = { burning: '#ff5722', sharp: '#fff59d', aching: '#7e57c2' }

function part(geometry, position, region = null) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 }),
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
  )
  return body
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

    // Left button is reserved for painting/clicking; right-drag rotates, scroll zooms.
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    controls.enablePan = false
    controls.enableDamping = true
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

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
      console.log('[raycast] region:', region)
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

    // Placeholder paint look: pulse emissive by pain type. Shader owner replaces this.
    const clock = new THREE.Clock()
    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime()
      const painted = new Map(visitStore.get().painted.map((p) => [p.region, p]))
      body.children.forEach((mesh) => {
        const p = painted.get(mesh.userData.region)
        if (p) {
          mesh.material.emissive.set(PAIN_COLORS[p.type])
          mesh.material.emissiveIntensity = p.intensity * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI))
        } else {
          mesh.material.emissiveIntensity = 0
        }
      })
      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      controls.dispose()
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
