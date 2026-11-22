// The v1 mock stores intensity as 0–1, v2 as 0–10. Everything on the body goes through these.
// Ratings are whole numbers 0–10; only an old fractional 0–1 value (0.6) is scaled. So 1 is 1/10, not 10/10.
const isTen = (i) => i > 1 || Number.isInteger(i)
export const toTen = (i) => (isTen(i) ? Math.round(i) : Math.round(i * 10))
export const toUnit = (i) => (isTen(i) ? i / 10 : i)
