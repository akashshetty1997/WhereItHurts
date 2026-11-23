// Use My Photo: puts a person's face from a photo onto the 3D patient's face, all in the browser
// (the photo is never uploaded; it's kept in this browser so a refresh keeps the face).
//
//   1. MediaPipe's face landmarker finds the same 478 points on the photo and on a straight-on
//      render of the 3D head (BodyScene → captureFace).
//   2. Each point on the render is traced onto the head (a raycast), which gives its place on the
//      head's texture (its UV). The head texture is one unwrapped piece, so the points keep their
//      layout there.
//   3. The points are triangulated (Delaunay), and the photo is warped triangle by triangle onto a
//      copy of the head texture, color-matched to the model's skin, with a soft edge along the face
//      outline so it blends into the rest of the head.
// Only the face changes: the head's shape, hair, ears and eyes stay the model's.
import { TextureSource } from 'three'
import Delaunator from 'delaunator'

const VISION_VERSION = '1.2.2' // keep in sync with package.json
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const SAVE_KEY = 'whereithurts.facePhoto'
const MAX_PHOTO = 1280 // px, longest side, for finding and warping the face
const SAVE_PHOTO = 720 // px, longest side, for the copy kept in this browser

// Use My Photo is switched off for the demo (it isn't reliable yet): no button, and a photo saved
// earlier isn't put back. Set to true to bring it back.
export const FACE_PHOTO_ENABLED = false

export class FacePhotoError extends Error {}

let landmarker = null
function loadLandmarker() {
  landmarker ??= (async () => {
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
    const files = await FilesetResolver.forVisionTasks(WASM)
    const model = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 1,
    })
    return { model, oval: orderLoop(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) }
  })().catch((error) => {
    landmarker = null // try again next time
    throw error
  })
  return landmarker
}

// The face outline comes as unordered edges; chain them into one loop of landmark indices.
function orderLoop(edges) {
  const next = new Map(edges.map((e) => [e.start, e.end]))
  const loop = [edges[0].start]
  for (let i = 0; i < edges.length; i++) {
    const n = next.get(loop.at(-1))
    if (n === undefined || n === loop[0]) break
    loop.push(n)
  }
  return loop
}

// A photo file → a canvas, upright (EXIF) and no bigger than `max` px.
export async function readPhoto(file, max = MAX_PHOTO) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  return toCanvas(bitmap, max)
}

function toCanvas(image, max) {
  const scale = Math.min(1, max / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function landmarksOf(model, image) {
  const result = model.detect(image)
  return result.faceLandmarks?.[0] ?? null
}

// Saved photo (this browser only).
export function savePhoto(canvas) {
  try {
    localStorage.setItem(SAVE_KEY, toCanvas(canvas, SAVE_PHOTO).toDataURL('image/jpeg', 0.88))
  } catch {
    // Storage full or blocked: the face just won't survive a refresh.
  }
}
export function forgetPhoto() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // Nothing saved.
  }
}
export function hasSavedPhoto() {
  try {
    return !!localStorage.getItem(SAVE_KEY)
  } catch {
    return false
  }
}
export async function loadSavedPhoto() {
  let url = null
  try {
    url = localStorage.getItem(SAVE_KEY)
  } catch {
    return null
  }
  if (!url) return null
  const image = new Image()
  image.src = url
  await image.decode()
  return toCanvas(image, MAX_PHOTO)
}

// Builds the new face texture.
//   photo     canvas with the person's face
//   original  the head material's map (THREE.Texture), left untouched
//   shot      { image, uvAt(x, y) }: a straight-on render of the head and, for a point on it
//             (0–1, top-left origin), the head texture's UV there, or null off the head
export async function faceTexture(photo, original, shot) {
  const { model, oval } = await loadLandmarker()
  const photoPoints = await landmarksOf(model, photo)
  if (!photoPoints) throw new FacePhotoError('No face found in that photo. Try a clear, front-facing photo with good light.')
  const modelPoints = await landmarksOf(model, shot.image)
  if (!modelPoints) throw new FacePhotoError('Couldn’t line up the 3D face. Try again from the Whole Body view.')

  const source = original.image
  const W = source.width
  const H = source.height
  // Where each landmark lands on the head texture, in texture pixels (glTF: v runs down).
  const uv = modelPoints.map((p) => {
    const hit = shot.uvAt(p.x, p.y)
    return hit ? [hit.x * W, hit.y * H] : null
  })
  const src = photoPoints.map((p) => [p.x * photo.width, p.y * photo.height])

  // Triangles over the points (in the straight-on render, where the face is flat and in order).
  const ids = uv.flatMap((p, i) => (p ? [i] : []))
  if (ids.length < 300) throw new FacePhotoError('Couldn’t line up the 3D face. Try again from the Whole Body view.')
  const delaunay = Delaunator.from(ids, (i) => modelPoints[i].x, (i) => modelPoints[i].y)
  // Keep only triangles that land cleanly on the texture: not across a seam (a very long edge),
  // not folded over (flipped winding), and not badly stretched (where the head curves away from
  // the straight-on view, at the sides of the face).
  const maxEdge = 0.12 * W
  const area = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2
  const screen = (i) => [modelPoints[i].x, modelPoints[i].y]
  const candidates = []
  for (let t = 0; t < delaunay.triangles.length; t += 3) {
    const tri = [0, 1, 2].map((k) => ids[delaunay.triangles[t + k]])
    const d = tri.map((i) => uv[i])
    const long = [0, 1, 2].some((k) => Math.hypot(d[k][0] - d[(k + 1) % 3][0], d[k][1] - d[(k + 1) % 3][1]) > maxEdge)
    const a = area(...tri.map(screen))
    if (long || Math.abs(a) < 1e-9) continue
    candidates.push({ tri, ratio: area(...d) / a })
  }
  // The texture's face is one piece: most triangles share one winding (the sign of the ratio)
  // and a similar scale. Outliers are folds and stretches.
  const sign = Math.sign(candidates.reduce((sum, c) => sum + Math.sign(c.ratio), 0)) || 1
  const scales = candidates.filter((c) => Math.sign(c.ratio) === sign).map((c) => Math.abs(c.ratio)).sort((x, y) => x - y)
  const median = scales[Math.floor(scales.length / 2)] ?? 1
  const triangles = candidates
    .filter((c) => Math.sign(c.ratio) === sign && Math.abs(c.ratio) < median * 2.6)
    .map((c) => c.tri)

  // 1. Warp the photo onto a layer the size of the texture.
  const layer = document.createElement('canvas')
  layer.width = W
  layer.height = H
  const lc = layer.getContext('2d')
  for (const tri of triangles) warpTriangle(lc, photo, tri.map((i) => src[i]), tri.map((i) => uv[i]))

  // 2. Soft mask: where the photo landed, inside the face outline, with the edge pulled in and
  //    faded (blur, then a contrast step that both erodes and softens), so it melts into the head.
  const outline = oval.map((i) => uv[i]).filter(Boolean)
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length
  const feather = Math.round(W * 0.014)
  const shape = document.createElement('canvas')
  shape.width = W
  shape.height = H
  const sc = shape.getContext('2d')
  sc.fillStyle = '#fff'
  sc.beginPath()
  outline.forEach(([x, y], k) => {
    const px = cx + (x - cx) * 0.95
    const py = cy + (y - cy) * 0.95
    if (k) sc.lineTo(px, py)
    else sc.moveTo(px, py)
  })
  sc.closePath()
  sc.fill()
  sc.globalCompositeOperation = 'destination-in'
  sc.drawImage(layer, 0, 0)
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  const mc = mask.getContext('2d')
  mc.filter = `blur(${feather}px)`
  mc.drawImage(shape, 0, 0)
  mc.filter = 'none'
  erode(mc, outline, feather)

  // 3. Color: shift the photo toward the model's skin (most of the way), so the face sits in the
  //    same light and tone as the neck and ears around it.
  const base = document.createElement('canvas')
  base.width = W
  base.height = H
  const bc = base.getContext('2d')
  bc.drawImage(source, 0, 0, W, H)
  matchColor(lc, bc, mc, outline, 0.7)

  lc.globalCompositeOperation = 'destination-in'
  lc.drawImage(mask, 0, 0)
  bc.drawImage(layer, 0, 0)

  // Same color space, flipY, wrapping and filtering as the original. A clone shares its image
  // source, so it gets a TextureSource of its own (setting .image would replace the original's too).
  const texture = original.clone()
  texture.source = new TextureSource(base)
  texture.needsUpdate = true
  return texture
}

// Alpha a → clamp((a − 0.5) · 2): the blurred edge moves inward by about half the blur and keeps a
// soft ramp, so the hard triangle edges never show.
function erode(ctx, outline, pad) {
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  const x = Math.max(0, Math.floor(Math.min(...xs) - pad * 3))
  const y = Math.max(0, Math.floor(Math.min(...ys) - pad * 3))
  const w = Math.min(ctx.canvas.width - x, Math.ceil(Math.max(...xs) + pad * 3) - x)
  const h = Math.min(ctx.canvas.height - y, Math.ceil(Math.max(...ys) + pad * 3) - y)
  if (w <= 0 || h <= 0) return
  const img = ctx.getImageData(x, y, w, h)
  const d = img.data
  for (let i = 3; i < d.length; i += 4) d[i] = Math.max(0, Math.min(255, (d[i] - 128) * 2))
  ctx.putImageData(img, x, y)
}

// Affine-maps the photo triangle s onto the texture triangle d (clipped, slightly grown so
// neighbors meet without hairline gaps).
function warpTriangle(ctx, image, s, d) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s
  const [[u0, v0], [u1, v1], [u2, v2]] = d
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
  if (Math.abs(det) < 1e-6) return
  // Solve [u v] = [a c e; b d f] · [x y 1] from the three pairs.
  const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det
  const c = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det
  const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det
  const dd = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det
  const e = u0 - a * x0 - c * y0
  const f = v0 - b * x0 - dd * y0
  const mx = (u0 + u1 + u2) / 3
  const my = (v0 + v1 + v2) / 3
  const grow = (u, v) => {
    const len = Math.hypot(u - mx, v - my) || 1
    return [u + ((u - mx) / len) * 0.9, v + ((v - my) / len) * 0.9]
  }
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(...grow(u0, v0))
  ctx.lineTo(...grow(u1, v1))
  ctx.lineTo(...grow(u2, v2))
  ctx.closePath()
  ctx.clip()
  ctx.setTransform(a, b, c, dd, e, f)
  ctx.drawImage(image, 0, 0)
  ctx.restore()
}

// Per-channel gain so the warped photo's average skin matches the texture's under the same area.
function matchColor(layerCtx, baseCtx, maskCtx, outline, strength) {
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  const x = Math.max(0, Math.floor(Math.min(...xs)))
  const y = Math.max(0, Math.floor(Math.min(...ys)))
  const w = Math.min(layerCtx.canvas.width - x, Math.ceil(Math.max(...xs)) - x)
  const h = Math.min(layerCtx.canvas.height - y, Math.ceil(Math.max(...ys)) - y)
  if (w <= 0 || h <= 0) return
  const layer = layerCtx.getImageData(x, y, w, h)
  const base = baseCtx.getImageData(x, y, w, h).data
  const mask = maskCtx.getImageData(x, y, w, h).data
  const sumL = [0, 0, 0]
  const sumB = [0, 0, 0]
  let n = 0
  const L = layer.data
  for (let i = 0; i < L.length; i += 4) {
    // Only well inside the face, and skip very dark texels (the eye openings in the texture).
    if (L[i + 3] < 250 || mask[i + 3] < 200 || base[i] + base[i + 1] + base[i + 2] < 120) continue
    for (let k = 0; k < 3; k++) {
      sumL[k] += L[i + k]
      sumB[k] += base[i + k]
    }
    n++
  }
  if (n < 100) return
  const gain = [0, 1, 2].map((k) => 1 + strength * (sumB[k] / Math.max(1, sumL[k]) - 1))
  for (let i = 0; i < L.length; i += 4) {
    if (!L[i + 3]) continue
    for (let k = 0; k < 3; k++) L[i + k] = Math.min(255, L[i + k] * gain[k])
  }
  layerCtx.putImageData(layer, x, y)
}
