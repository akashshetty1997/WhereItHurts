// Light / dark appearance. Default follows the system setting; the header control can force
// Light or Dark (remembered in this browser). Applying it = the .dark class on <html>, which
// switches every token in src/index.css. index.html runs the same logic before first paint.

const KEY = 'whereithurts.theme'
export const THEMES = ['system', 'light', 'dark']
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    return THEMES.includes(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

function apply(theme) {
  const dark = theme === 'dark' || (theme === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Blocked storage: it still applies now, just isn't remembered.
  }
  apply(theme)
}

/** Keep "system" in sync when the OS switches light/dark while the app is open. */
export function followSystem() {
  const onChange = () => readTheme() === 'system' && apply('system')
  media().addEventListener('change', onChange)
  return () => media().removeEventListener('change', onChange)
}
