import type { SVGProps } from 'react'
import { plyAlong, toPoints, type Palette, type Point } from '../lib/knitIcons'

// Icône du module Tricot, « T de Torsade » : une aiguille en bois pour la barre du T, une torsade de deux brins (écru
// et gaude) pour le jambage, sur fond indigo. Le même dessin que l'icône de l'application Torsade à venir.

const ECRU: Palette = ['#a89a7c', '#efe6d2', '#f8f1e2', '#fffaf0', '#7d6f55']
const GAUDE: Palette = ['#b88a12', '#d6a91f', '#e8c547', '#f2d97a', '#6e520a']
const WOOD = ['#c08a52', '#e0b07a', '#8a5a2e'] as const
const BG = '#2f3b80'

/** Jambage : de y = 30 à 100, un croisement tous les 18 (toujours dans le même sens, comme une vraie torsade). */
const CABLE = { cx: 50, amp: 9, y0: 30, y1: 100, period: 18, width: 10 }

function cablePoints(phase: number, from: number, to: number): Point[] {
  const { cx, amp, y0, period } = CABLE
  const pts: Point[] = []
  for (let y = from; y <= to + 0.01; y += 1) pts.push([cx + amp * Math.sin((Math.PI * (y - y0)) / period + phase), y])
  return pts
}

function strand(points: Point[], pal: Palette) {
  const pieces = plyAlong(points, CABLE.width)
  return { points: toPoints(points), pal, back: pieces.filter((p) => !p.front), front: pieces.filter((p) => p.front) }
}

// Brin écru, brin gaude, puis l'écru repasse devant un croisement sur deux. Calculés une fois.
const STRANDS = [
  strand(cablePoints(0, CABLE.y0, CABLE.y1), ECRU),
  strand(cablePoints(Math.PI, CABLE.y0, CABLE.y1), GAUDE),
  ...Array.from({ length: Math.floor((CABLE.y1 - CABLE.y0) / CABLE.period) + 1 }, (_, k) => k)
    .filter((k) => k % 2 === 0)
    .map((k) => {
      const y = CABLE.y0 + k * CABLE.period
      return strand(cablePoints(0, Math.max(CABLE.y0, y - CABLE.period * 0.42), Math.min(CABLE.y1, y + CABLE.period * 0.42)), ECRU)
    }),
]

/** Aiguille : du bouton (12, 24) à la pointe (90, 24), 7 d'épaisseur. */
const NEEDLE = { x1: 12, x2: 90, y: 24, w: 7 }

export function TorsadeIcon(props: SVGProps<SVGSVGElement>) {
  const { x1, x2, y, w } = NEEDLE
  const tip = w * 2.2
  const end = x2 - tip
  return (
    <svg viewBox="0 0 100 100" fill="none" data-icon="torsade" {...props}>
      <rect width={100} height={100} rx={22} fill={BG} />
      <g strokeLinecap="round" strokeLinejoin="round">
        {STRANDS.map((s, i) => (
          <g key={i}>
            <polyline points={s.points} stroke={s.pal[4]} strokeWidth={CABLE.width} />
            {s.back.map((p, j) => (
              <polyline key={`b${j}`} points={p.points} stroke={s.pal[1]} strokeWidth={CABLE.width * 0.55} />
            ))}
            {s.front.map((p, j) => (
              <polyline key={`f${j}`} points={p.points} stroke={s.pal[2 + (p.ply % 2)]} strokeWidth={CABLE.width * 0.55} />
            ))}
          </g>
        ))}
      </g>
      <g strokeLinecap="round">
        <line x1={x1} y1={y} x2={end} y2={y} stroke={WOOD[2]} strokeWidth={w + 1.2} />
        <line x1={x1} y1={y} x2={end} y2={y} stroke={WOOD[0]} strokeWidth={w} />
        <line x1={x1 + 2} y1={y - w * 0.2} x2={end - 2} y2={y - w * 0.2} stroke={WOOD[1]} strokeWidth={w * 0.3} />
        <path d={`M${end} ${y + w / 2}L${x2} ${y}L${end} ${y - w / 2}Z`} fill={WOOD[0]} stroke={WOOD[2]} strokeWidth={0.8} strokeLinejoin="round" />
        <circle cx={x1} cy={y} r={w * 1.05} fill="#a33a26" stroke="#4f1a11" strokeWidth={0.8} />
      </g>
    </svg>
  )
}
