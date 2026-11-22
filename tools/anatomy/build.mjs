#!/usr/bin/env node
// Builds public/models/anatomy.glb from BodyParts3D 4.0 (CC BY 4.0), one named node per structure.
//
//   node tools/anatomy/build.mjs            # uses tools/anatomy/.cache (downloads if missing)
//
// Steps: resolve each structure (FMA id) to its element files (FJ*.obj) through
// isa_element_parts.txt (a structure can be several files), extract and merge them,
// put everything in the app's body frame (meters, feet at y = 0, up = +y, the patient faces +z,
// the patient's left = +x), compute joint points and fitting landmarks, then write a meshopt-
// compressed GLB without joining or instancing, so every structure stays its own clickable mesh.
// Finally it reloads the GLB and checks that every structure is still a separate named node.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, prune, dedup } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const CACHE = path.join(HERE, '.cache')
const OUT = path.join(ROOT, 'public/models/anatomy.glb')
const LICENSE_OUT = path.join(ROOT, 'public/models/LICENSE-bodyparts3d.txt')
const config = JSON.parse(readFileSync(path.join(HERE, 'structures.json'), 'utf8'))

// ---------- source files ----------

function cached(url) {
  const file = path.join(CACHE, path.basename(url))
  if (!existsSync(file)) {
    mkdirSync(CACHE, { recursive: true })
    console.log(`downloading ${url}`)
    execFileSync('curl', ['-sS', '--retry', '3', '-o', file, url], { stdio: 'inherit' })
  }
  return file
}

const zip = cached(config.source.zip)
const partsList = readFileSync(cached(config.source.partsList), 'utf8')
const parts = new Map() // FMA id -> { bp, name }
for (const line of partsList.split('\n').slice(1)) {
  const [fma, bp, name] = line.trim().split('\t')
  if (fma && bp) parts.set(fma, { bp, name })
}

// FMA id -> element files (FJ ids). The OBJs in the zip are named by these FJ ids.
const elements = new Map()
for (const line of readFileSync(cached(config.source.elementParts), 'utf8').split('\n').slice(1)) {
  const [fma, , fj] = line.trim().split('\t')
  if (fma && fj) elements.set(fma, [...(elements.get(fma) ?? []), fj])
}

// Zip entries by file id (the file name without ".obj").
const entries = new Map()
for (const entry of execFileSync('unzip', ['-Z1', zip], { maxBuffer: 64 << 20 }).toString().split('\n')) {
  if (entry.toLowerCase().endsWith('.obj')) entries.set(path.basename(entry, path.extname(entry)), entry)
}

function objFor(fma) {
  const part = parts.get(fma)
  if (!part) return { error: 'not in parts list' }
  const files = elements.get(fma) ?? []
  const missing = files.filter((fj) => !entries.has(fj))
  if (!files.length || missing.length) return { error: `no OBJ (elements: ${files.join(', ') || 'none'})`, name: part.name }
  const meshes = files.map((fj) => parseObj(execFileSync('unzip', ['-p', zip, entries.get(fj)], { maxBuffer: 256 << 20 }).toString()))
  return { name: part.name, mesh: mergeMeshes(meshes), files }
}

function mergeMeshes(meshes) {
  if (meshes.length === 1) return meshes[0]
  const positions = new Float64Array(meshes.reduce((n, m) => n + m.positions.length, 0))
  const indices = new Uint32Array(meshes.reduce((n, m) => n + m.indices.length, 0))
  let p = 0
  let i = 0
  for (const m of meshes) {
    positions.set(m.positions, p)
    indices.set(m.indices.map((x) => x + p / 3), i)
    p += m.positions.length
    i += m.indices.length
  }
  return { positions, indices }
}

// Minimal OBJ: "v x y z" and "f a b c ..." (a may be a/b/c); polygons are fanned into triangles.
function parseObj(text) {
  const positions = []
  const indices = []
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/)
      positions.push(+x, +y, +z)
    } else if (line.startsWith('f ')) {
      const ids = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((t) => {
          const i = parseInt(t, 10)
          return i < 0 ? positions.length / 3 + i : i - 1
        })
      for (let k = 1; k + 1 < ids.length; k++) indices.push(ids[0], ids[k], ids[k + 1])
    }
  }
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) }
}

// ---------- small vector helpers ----------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => scale(a, 1 / Math.hypot(...a))
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

function centroid(positions) {
  const c = [0, 0, 0]
  const n = positions.length / 3
  for (let i = 0; i < positions.length; i += 3) {
    c[0] += positions[i]
    c[1] += positions[i + 1]
    c[2] += positions[i + 2]
  }
  return scale(c, 1 / n)
}

const point = (positions, i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]]

// ---------- body frame from reference bones ----------

function refMeshes(ids) {
  return ids.map((id) => {
    const found = objFor(id)
    if (!found.mesh) throw new Error(`reference ${id}: ${found.error}`)
    return found.mesh
  })
}

const ref = Object.fromEntries(Object.entries(config.reference).filter(([k]) => !k.startsWith('_')).map(([k, ids]) => [k, refMeshes(ids)]))
const meanCentroid = (meshes) => scale(meshes.map((m) => centroid(m.positions)).reduce(add), 1 / meshes.length)

const top = meanCentroid(ref.top)
const feet = meanCentroid(ref.feet)
const up = norm(sub(top, feet))
let left = sub(meanCentroid(ref.left), meanCentroid(ref.right))
left = norm(sub(left, scale(up, dot(left, up)))) // patient's left, perpendicular to up
const front = cross(left, up) // x × y = z: the direction the patient faces
const facesFront = dot(sub(meanCentroid(ref.front), meanCentroid(ref.back)), front) > 0
if (!facesFront) throw new Error('sternum is behind T1 in the computed frame: the source is mirrored, check axes')

// Lowest point of the feet = floor; the skull top sets the height (and the unit).
let floor = Infinity
for (const m of ref.feet) for (let i = 0; i < m.positions.length / 3; i++) floor = Math.min(floor, dot(point(m.positions, i), up))
let crown = -Infinity
for (const m of ref.top) for (let i = 0; i < m.positions.length / 3; i++) crown = Math.max(crown, dot(point(m.positions, i), up))
const rawHeight = crown - floor
const unit = rawHeight > 100 ? 0.001 : rawHeight > 10 ? 0.01 : 1 // mm, cm or m
const center = feet // x/z origin between the feet

function toBody(p) {
  const d = sub(p, center)
  return [dot(d, left) * unit, (dot(p, up) - floor) * unit, dot(d, front) * unit]
}

console.log(`frame: height ${(rawHeight * unit).toFixed(3)} m (unit ${unit}), faces front: ${facesFront}`)

function transform(mesh) {
  const out = new Float32Array(mesh.positions.length)
  for (let i = 0; i < mesh.positions.length / 3; i++) out.set(toBody(point(mesh.positions, i)), 3 * i)
  return { positions: out, indices: mesh.indices }
}

function normals({ positions, indices }) {
  const n = new Float32Array(positions.length)
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]
    const pa = point(positions, a)
    const face = cross(sub(point(positions, b), pa), sub(point(positions, c), pa))
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) n[3 * v + k] += face[k]
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1
    n[i] /= l
    n[i + 1] /= l
    n[i + 2] /= l
  }
  return n
}

// ---------- joint points and landmarks ----------

// Closest pair of vertices between two meshes (optionally only the top `aTop` share of a).
function closestPoints(a, b, aTop) {
  let candidates = [...Array(a.positions.length / 3).keys()]
  if (aTop) {
    const ys = candidates.map((i) => a.positions[3 * i + 1])
    const cut = [...ys].sort((x, y) => y - x)[Math.floor(ys.length * aTop)]
    candidates = candidates.filter((i) => a.positions[3 * i + 1] >= cut)
  }
  let best = [Infinity, null, null]
  for (const i of candidates) {
    const p = point(a.positions, i)
    for (let j = 0; j < b.positions.length / 3; j++) {
      const d = dist2(p, point(b.positions, j))
      if (d < best[0]) best = [d, p, point(b.positions, j)]
    }
  }
  return { at: scale(add(best[1], best[2]), 0.5), gap: Math.sqrt(best[0]) }
}

function farthestFrom(mesh, p) {
  let best = [-1, null]
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const q = point(mesh.positions, i)
    const d = dist2(p, q)
    if (d > best[0]) best = [d, q]
  }
  return best[1]
}

// ---------- build ----------

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('anatomy')
const regionsExtras = {}
let expected = 0
let failed = false

for (const [region, spec] of Object.entries(config.regions)) {
  const group = doc.createNode(region).setExtras({ region })
  scene.addChild(group)
  const meshes = new Map()
  console.log(`\n${region}`)
  for (const s of spec.structures) {
    const found = objFor(s.fma)
    if (!found.mesh) {
      console.log(`  MISSING ${s.fma} ${s.anatomical}: ${found.error}`)
      failed = true
      continue
    }
    const mesh = transform(found.mesh)
    meshes.set(s.fma, mesh)
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(mesh.positions).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals(mesh)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(mesh.indices).setBuffer(buffer))
    const node = doc
      .createNode(`${region}:${s.fma}`)
      .setMesh(doc.createMesh(s.fma).addPrimitive(prim))
      .setExtras({ fma: s.fma, region, kind: s.kind, label: s.label, anatomical: s.anatomical, sentence: s.sentence, source: found.name })
    group.addChild(node)
    expected++
    console.log(`  ok  ${s.fma.padEnd(9)} ${found.name} (${found.files.join('+')}, ${mesh.positions.length / 3} vertices)`)
  }

  const joints = {}
  for (const j of spec.joints ?? []) {
    const [a, b] = [meshes.get(j.recipe.a), meshes.get(j.recipe.b)]
    if (!a || !b) {
      console.log(`  MISSING joint ${j.id}: needs ${j.recipe.a} and ${j.recipe.b}`)
      failed = true
      continue
    }
    const { at, gap } = closestPoints(a, b, j.recipe.aTop)
    joints[j.id] = at
    group.addChild(
      doc
        .createNode(`${region}:${j.id}`)
        .setTranslation(at)
        .setExtras({ joint: j.id, region, kind: 'joint', label: j.label, anatomical: j.anatomical, sentence: j.sentence }),
    )
    expected++
    console.log(`  ok  joint ${j.id} at [${at.map((v) => v.toFixed(3))}] (gap ${(gap * 100).toFixed(1)} cm)`)
  }

  const landmarks = {}
  for (const [name, l] of Object.entries(spec.landmarks ?? {})) {
    if (name.startsWith('_')) continue
    if (l.joint) landmarks[name] = joints[l.joint]
    else if (l.farthestFrom) landmarks[name] = farthestFrom(meshes.get(l.on), joints[l.farthestFrom])
  }
  regionsExtras[region] = { overlay: spec.overlay !== false, landmarks }
}

scene.setExtras({ credit: config.source.credit, regions: regionsExtras })

await MeshoptEncoder.ready
await doc.transform(dedup(), prune({ keepLeaves: true, keepExtras: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
await io.write(OUT, doc)
writeFileSync(
  LICENSE_OUT,
  `${config.source.credit}\nhttps://creativecommons.org/licenses/by/4.0/\nSource: ${config.source.zip}\nUsed as reference anatomy (an illustration, not a scan of any patient). Converted to glTF by tools/anatomy/build.mjs.\n`,
)

// ---------- check: every structure is still its own named node ----------

await MeshoptDecoder.ready
const check = await io.read(OUT)
const named = check
  .getRoot()
  .listNodes()
  .filter((n) => n.getExtras()?.kind)
const size = readFileSync(OUT).length
console.log(`\nwrote ${path.relative(ROOT, OUT)}: ${(size / 1024 / 1024).toFixed(2)} MB, ${named.length}/${expected} structure nodes`)
if (named.length !== expected) throw new Error('structures were merged or lost during optimization')
if (failed) {
  console.log('some structures are missing (see above)')
  process.exitCode = 1
}
