// Draws the app icons as PNG files with no image library, so nothing extra needs installing.
// The picture matches public/favicon.svg: a green field, two yard lines, and an orange route.
// Run with: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const GREEN = [0x1f, 0x6b, 0x3a]
const WHITE = [0xff, 0xff, 0xff]
const ORANGE = [0xff, 0x8a, 0x3d]

/** The route, in fractions of the icon: up, then a break to the right. */
const ROUTE = [
  [0.28, 0.78],
  [0.28, 0.47],
  [0.69, 0.22],
]

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

/**
 * The color at a point, as [r, g, b, alpha], with x and y from 0 to 1.
 * `corner` rounds the corners. `inset` shrinks the picture toward the middle, which a
 * maskable icon needs so that a circular mask does not cut the route off.
 */
function colorAt(x, y, corner, inset) {
  // Outside the rounded square: transparent.
  const cx = Math.max(corner - x, x - (1 - corner), 0)
  const cy = Math.max(corner - y, y - (1 - corner), 0)
  if (corner > 0 && Math.hypot(cx, cy) > corner) return [0, 0, 0, 0]

  // Work out where this point falls in the picture.
  const u = (x - 0.5) / (1 - inset * 2) + 0.5
  const v = (y - 0.5) / (1 - inset * 2) + 0.5
  let color = GREEN

  for (const line of [0.34, 0.66]) {
    if (Math.abs(v - line) < 0.024) color = color.map((c, i) => Math.round(c * 0.5 + WHITE[i] * 0.5))
  }
  const d = Math.min(distanceToSegment(u, v, ROUTE[0], ROUTE[1]), distanceToSegment(u, v, ROUTE[1], ROUTE[2]))
  if (d < 0.047) color = ORANGE
  return [...color, 255]
}

/** Renders the icon at a size, averaging 4 x 4 samples per pixel for smooth edges. */
function render(size, { corner = 0, inset = 0 } = {}) {
  const samples = 4
  const pixels = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0, 0]
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const [r, g, b, a] = colorAt((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size, corner, inset)
          // Weight color by alpha, so transparent samples do not darken the edge.
          sum[0] += r * a
          sum[1] += g * a
          sum[2] += b * a
          sum[3] += a
        }
      }
      const i = (py * size + px) * 4
      const alpha = sum[3] / (samples * samples)
      pixels[i] = sum[3] ? Math.round(sum[0] / sum[3]) : 0
      pixels[i + 1] = sum[3] ? Math.round(sum[1] / sum[3]) : 0
      pixels[i + 2] = sum[3] ? Math.round(sum[2] / sum[3]) : 0
      pixels[i + 3] = Math.round(alpha)
    }
  }
  return pixels
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const check = Buffer.alloc(4)
  check.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, check])
}

/** Encodes RGBA pixels as a PNG file. */
function png(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bits per channel
  header[9] = 6 // RGBA
  // Each row starts with a filter byte. 0 means the row is stored as is.
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const out = new URL('../public/icons/', import.meta.url)
mkdirSync(out, { recursive: true })

const icons = [
  // Rounded, for desktop and Android.
  ['pwa-192.png', 192, { corner: 0.22 }],
  ['pwa-512.png', 512, { corner: 0.22 }],
  // Full bleed with the picture pulled in, for Android's shaped masks.
  ['maskable-512.png', 512, { inset: 0.1 }],
  // Full bleed and opaque. iOS rounds the corners itself and turns transparency black.
  ['apple-touch-icon.png', 180, {}],
]

for (const [name, size, options] of icons) {
  writeFileSync(new URL(name, out), png(size, render(size, options)))
  console.log(`${name}  ${size} x ${size}`)
}
