// The v1 mock stores intensity as 0–1, v2 as 0–10. Everything on the body goes through these.
export const toTen = (i) => (i > 1 ? Math.round(i) : Math.round(i * 10))
export const toUnit = (i) => (i > 1 ? i / 10 : i)
