// Did each marked pain (and the goal) really come up? (docs/NEXT_PHASE_PLAN.md → Task A2)
//
// A region only counts as covered when the PATIENT talked about it: a PT question alone
// ("Does your knee hurt?") isn't enough. For each marked region:
//   not_discussed       no line names it
//   pt_asked            only PT lines name it, and the patient's next line doesn't answer
//   patient_responded   a patient line names it, or answers a PT line that named it
//   reviewed            the PT checked it by hand
// The PT's own choice (visit.coverageReview[region]) always wins over the suggestion.
// Pure functions: no store, no React, so they run under `node --test`.

export const COVERAGE_LABELS = {
  not_discussed: 'Never came up',
  pt_asked: 'Asked, but the patient didn’t answer',
  patient_responded: 'The patient talked about it',
  reviewed: 'Reviewed by PT',
}

// Statuses that leave a marked pain flagged in amber at the end of the visit.
export const FLAGGED = new Set(['not_discussed', 'pt_asked'])

const isPatient = (segment) => segment.speaker === 'patient'
const lineText = (segment) => segment.correctedText ?? segment.text ?? ''

const NUMBER = '(?:\\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten)'
const RATING_RE = new RegExp(
  `\\b(?:\\d{1,2}|(?:a|about|around|maybe|like|probably|is|it's|its)\\s+${NUMBER}|${NUMBER}\\s+(?:out of|of)\\s+(?:10|ten))\\b`,
  'i',
)
const PAIN_WORDS_RE =
  /\b(hurts?|hurting|hurt|pain\w*|aches?|aching|achy|burn\w*|sharp|stab\w*|sore\w*|tight\w*|stiff\w*|numb\w*|tingl\w*|throb\w*|shoot\w*|dull|tender|pinch\w*|better|worse|fine|okay|ok)\b/i
const YES_NO_RE = /^\W*(yes|yeah|yep|yup|no|nope|nah|not really|a little|a bit|kind of|sort of|sometimes|mostly|only when)\b/i

// Does this patient line answer a question about `region`? A line that names other body parts but
// not this one is about something else.
export function answers(segment, region) {
  if (!segment || !isPatient(segment)) return false
  const regions = segment.regions ?? []
  if (regions.length && !regions.includes(region)) return false
  const text = lineText(segment)
  return segment.rating != null || RATING_RE.test(text) || PAIN_WORDS_RE.test(text) || YES_NO_RE.test(text)
}

// The suggested status for one region, with the ids of the lines that support it.
export function suggestCoverage(segments, region) {
  const responded = []
  const asked = []
  segments.forEach((s, i) => {
    if (!(s.regions ?? []).includes(region)) return
    if (isPatient(s)) {
      responded.push(s.id)
      return
    }
    const reply = segments.slice(i + 1).find(isPatient)
    if (answers(reply, region)) responded.push(s.id, reply.id)
    else asked.push(s.id)
  })
  if (responded.length) return { status: 'patient_responded', evidence: [...new Set(responded)] }
  if (asked.length) return { status: 'pt_asked', evidence: asked }
  return { status: 'not_discussed', evidence: [] }
}

// { [region]: { status, suggested, evidence, review } } for every marked region.
export function coverage(visit) {
  const segments = visit.segments ?? []
  const reviews = visit.coverageReview ?? {}
  const result = {}
  for (const p of visit.painted ?? []) {
    const { status: suggested, evidence } = suggestCoverage(segments, p.region)
    const review = reviews[p.region] ?? null
    result[p.region] = { status: review?.status ?? suggested, suggested, evidence, review }
  }
  return result
}

// The catch: marked pain whose final status is Never came up or Asked-but-not-answered.
// Each item is the painted entry plus { coverage, evidence }.
export function flaggedPain(visit) {
  const all = coverage(visit)
  return (visit.painted ?? [])
    .filter((p) => FLAGGED.has(all[p.region].status))
    .map((p) => ({ ...p, coverage: all[p.region].status, evidence: all[p.region].evidence }))
}

// Did the goal come up? A line shares the goal's content words: one is enough for a short goal
// ("Put plates on the top shelf" → plates, shelf), two for a longer one. The PT can confirm or
// correct it (visit.goal.review = { status: 'discussed' | 'not_discussed', at }).
const STOP_WORDS = new Set(['the', 'and', 'with', 'want', 'like', 'able', 'again', 'would', 'could', 'some', 'that', 'this', 'from', 'into', 'without', 'being'])
const contentWords = (text) => new Set(text.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !STOP_WORDS.has(w)) ?? [])

export function goalCoverage(visit) {
  const text = visit.goal?.text
  if (!text) return null
  const goal = contentWords(text)
  const need = goal.size >= 4 ? 2 : 1
  const evidence = goal.size
    ? (visit.segments ?? [])
        .filter((s) => [...contentWords(lineText(s))].filter((w) => goal.has(w)).length >= need)
        .map((s) => s.id)
    : []
  const suggested = evidence.length ? 'discussed' : 'not_discussed'
  const review = visit.goal.review ?? null
  const status = review?.status ?? suggested
  return { status, suggested, discussed: status === 'discussed', evidence, review }
}

// The lines behind a status, for quoting beside it.
export function evidenceLines(visit, ids) {
  const wanted = new Set(ids)
  return (visit.segments ?? []).filter((s) => wanted.has(s.id))
}
