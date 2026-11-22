// "Testing mode" (act as both patient and PT), remembered in this browser.
const TEST_MODE_KEY = 'whereithurts.testMode'

export function readTestMode() {
  try {
    return localStorage.getItem(TEST_MODE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveTestMode(on) {
  try {
    localStorage.setItem(TEST_MODE_KEY, on ? '1' : '0')
  } catch {
    // Blocked storage: the choice just isn't remembered after a reload.
  }
}
