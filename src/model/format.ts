import type { Yd } from './types'

const EPS = 1e-6
const FRACTIONS: [number, string][] = [
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
]

/**
 * A yard distance for display. Whole yards print plain. Thirds and halves print as
 * fractions, since the rulebook's 10-foot and 20-foot marks are 3⅓ and 6⅔ yards.
 */
export function formatYd(yd: Yd): string {
  const rounded = Math.round(yd)
  if (Math.abs(yd - rounded) < EPS) return String(rounded)

  const whole = Math.floor(yd)
  const frac = yd - whole
  const match = FRACTIONS.find(([value]) => Math.abs(frac - value) < EPS)
  if (match) return `${whole === 0 ? '' : whole}${match[1]}`

  return yd.toFixed(1)
}
