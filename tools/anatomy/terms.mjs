#!/usr/bin/env node
// Writes src/scene/anatomyTerms.json: the words a PT may say for each anatomy structure and joint,
// so Auto-follow (src/scene/autoFollow.js) can open the one being explained.
//
//   node tools/anatomy/terms.mjs     # also run at the end of build.mjs
//
// Terms per structure: its label, its anatomical name, the parts of that name ("Atlas (C1
// vertebra)" → atlas, c1 vertebra; "Deltoid, front (clavicular) part" → deltoid) and the
// hand-written `synonyms` in structures.json. Lower case; matching is whole words.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(HERE, '../../src/scene/anatomyTerms.json')
// The same structures for the backend's Claude prompt (smart pass `structures`).
const BACKEND_OUT = path.resolve(HERE, '../../backend/app/data/anatomy_structures.json')

const clean = (t) => t.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()

function termsFor(s) {
  const names = [s.label, s.anatomical, ...(s.synonyms ?? [])].filter(Boolean)
  const terms = new Set()
  for (const name of names) {
    terms.add(clean(name))
    const inner = name.match(/\(([^)]+)\)/)?.[1]
    if (inner) terms.add(clean(inner))
    const outer = name.replace(/\([^)]*\)/g, '').split(',')[0]
    terms.add(clean(outer))
  }
  // Too short or too vague to act on (C1 and friends are fine: they're precise).
  return [...terms].filter((t) => t.length >= 4 || /^[ctl]\d+$/.test(t))
}

export function buildTerms(config) {
  const entries = []
  for (const [region, spec] of Object.entries(config.regions)) {
    for (const s of spec.structures ?? [])
      entries.push({ id: s.fma, region, kind: s.kind, label: s.label, anatomical: s.anatomical, terms: termsFor(s) })
    for (const j of spec.joints ?? [])
      entries.push({ id: j.id, region, kind: 'joint', label: j.label, anatomical: j.anatomical, terms: termsFor(j) })
  }
  return entries
}

export function writeTerms(config) {
  const entries = buildTerms(config)
  writeFileSync(OUT, JSON.stringify(entries, null, 1) + '\n')
  // One entry per id (a structure in two regions keeps its first), without the match words.
  const seen = new Set()
  const backend = entries
    .filter((e) => !seen.has(e.id) && seen.add(e.id))
    .map(({ id, region, label, anatomical }) => ({ id, region, label, anatomical }))
  writeFileSync(BACKEND_OUT, JSON.stringify(backend, null, 1) + '\n')
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${entries.length} structures and joints) and ${path.relative(process.cwd(), BACKEND_OUT)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeTerms(JSON.parse(readFileSync(path.join(HERE, 'structures.json'), 'utf8')))
}
