// Past visits, kept in this browser (docs/NEXT_PHASE_PLAN.md → Task 0). A stand-in for server
// storage: this module is the only place that reads or writes visit history, so a server can
// replace it later without touching the screens.
//
//   archiveVisit(visit, ownerId)   keep a copy (same visit id again replaces the earlier copy)
//   listVisits(ownerId)            newest first
//   getLastVisit(ownerId, { patientKey?, before? })
//   deleteVisit(id)
//
// Versioned like the current visit (src/visitStore.js): an older saved shape is ignored. At most
// MAX_PER_OWNER visits per owner (oldest dropped). If storage is full or blocked, it fails quietly.

export const HISTORY_KEY = 'whereithurts.history'
export const HISTORY_VERSION = 1
export const MAX_PER_OWNER = 50

const defaultStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

// Something worth keeping: a mark, a goal or a line.
export const hasContent = (visit) => !!(visit?.painted?.length || visit?.segments?.length || visit?.goal?.text)

export function createHistory(storage = defaultStorage()) {
  function read() {
    try {
      const saved = JSON.parse(storage?.getItem(HISTORY_KEY) ?? 'null')
      return saved?.version === HISTORY_VERSION && Array.isArray(saved.visits) ? saved.visits : []
    } catch {
      return []
    }
  }

  function write(visits) {
    try {
      storage?.setItem(HISTORY_KEY, JSON.stringify({ version: HISTORY_VERSION, visits }))
      return true
    } catch {
      return false // storage full or blocked: the visit just isn't kept
    }
  }

  const newestFirst = (a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '')

  return {
    archiveVisit(visit, ownerId = 'guest') {
      if (!hasContent(visit)) return null
      const id = visit.visitId
      const record = {
        id,
        ownerId,
        patientKey: visit.patientKey?.trim() || null,
        endedAt: visit.endedAt ?? new Date().toISOString(),
        // Only the visit's own data; nothing large (body-map images are made at print time).
        visit: structuredClone(visit),
      }
      const others = read().filter((r) => r.id !== id)
      const mine = [record, ...others.filter((r) => r.ownerId === ownerId)].sort(newestFirst).slice(0, MAX_PER_OWNER)
      write([...mine, ...others.filter((r) => r.ownerId !== ownerId)])
      return record
    },
    listVisits(ownerId = 'guest') {
      return read()
        .filter((r) => r.ownerId === ownerId)
        .sort(newestFirst)
    },
    getLastVisit(ownerId = 'guest', { patientKey, before } = {}) {
      return (
        this.listVisits(ownerId).find(
          (r) => r.id !== before && (patientKey === undefined || (r.patientKey ?? null) === (patientKey ?? null)),
        ) ?? null
      )
    },
    deleteVisit(id) {
      write(read().filter((r) => r.id !== id))
    },
  }
}

const history = createHistory()
export const archiveVisit = (visit, ownerId) => history.archiveVisit(visit, ownerId)
export const listVisits = (ownerId) => history.listVisits(ownerId)
export const getLastVisit = (ownerId, options) => history.getLastVisit(ownerId, options)
export const deleteVisit = (id) => history.deleteVisit(id)

// "guest" in Try the Demo, else the account id.
export const ownerIdOf = (user) => (user && user.id != null && !user.guest ? String(user.id) : 'guest')
