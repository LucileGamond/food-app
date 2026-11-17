// Couleurs « #rrggbb » : conversion en teinte, saturation et clarté, nuances plus claires ou plus sombres.

/** « #3f4fa0 » → [teinte 0-360, saturation 0-100, clarté 0-100]. */
export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}

/** Même couleur, plus claire (dl > 0) ou plus sombre, bornée pour rester une couleur de fil. */
export function shade(hex: string, dl: number): string {
  const [h, s, l] = hexToHsl(hex)
  return `hsl(${h} ${s}% ${Math.max(6, Math.min(92, Math.round(l + dl)))}%)`
}
