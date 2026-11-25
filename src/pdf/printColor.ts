/** Color math for print. Colors are '#RRGGBB' strings throughout. */

export type Rgb = { r: number; g: number; b: number }

/** Channels from 0 to 1. Accepts '#RGB' and '#RRGGBB'. Anything else is black. */
export function hexToRgb(hex: string): Rgb {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex)
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  const parts = short ? short.slice(1).map((c) => c + c) : long ? long.slice(1) : ['00', '00', '00']
  const [r, g, b] = parts.map((c) => parseInt(c, 16) / 255)
  return { r, g, b }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase()
}

/** WCAG relative luminance, 0 for black to 1 for white. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast ratio between two colors, from 1 (same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The color you see when `color` is laid over `background` at an opacity. Lets the PDF avoid transparency. */
export function blend(color: string, background: string, opacity: number): string {
  const c = hexToRgb(color)
  const bg = hexToRgb(background)
  const mix = (a: number, b: number) => a * opacity + b * (1 - opacity)
  return rgbToHex({ r: mix(c.r, bg.r), g: mix(c.g, bg.g), b: mix(c.b, bg.b) })
}

/** Contrast against white paper that a printed line needs to be easy to see. */
export const PRINT_CONTRAST = 3

/**
 * The color to print a position's lines in on white paper.
 * A screen color that is too light, such as white or yellow, is darkened until it shows up.
 * It is darkened by scaling, so the hue stays the same: yellow turns gold, not gray.
 * A color that is already dark enough comes back unchanged.
 */
export function printColor(screenColor: string, minContrast: number = PRINT_CONTRAST): string {
  if (contrast(screenColor, '#FFFFFF') >= minContrast) return rgbToHex(hexToRgb(screenColor))
  const { r, g, b } = hexToRgb(screenColor)
  // Find the lightest shade that passes: 0 is black, 1 is the original.
  let dark = 0
  let light = 1
  for (let i = 0; i < 20; i++) {
    const mid = (dark + light) / 2
    const candidate = rgbToHex({ r: r * mid, g: g * mid, b: b * mid })
    if (contrast(candidate, '#FFFFFF') >= minContrast) dark = mid
    else light = mid
  }
  return rgbToHex({ r: r * dark, g: g * dark, b: b * dark })
}
