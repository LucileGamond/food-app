import { useId, type SVGProps } from 'react'
import { ballWraps, plySegments, shade, type Wrap } from '../lib/yarnGauge'

/** Pelotes du panier : garance à gauche, indigo derrière (d'où sort le fil), gaude à droite. */
const BALLS: { cx: number; cy: number; r: number; hues: string[]; seed: number }[] = [
  { cx: 50, cy: 40, r: 22, hues: ['#3f4fa0', '#5a69bd', '#7e8bcf'], seed: 11 },
  { cx: 27, cy: 54, r: 18, hues: ['#a33a26', '#c4553a', '#de7a5c'], seed: 23 },
  { cx: 73, cy: 55, r: 17, hues: ['#d6a91f', '#e8c547', '#f2d97a'], seed: 37 },
]

// Calculés une fois : l'icône est la même partout.
const WRAPS: Wrap[][] = BALLS.map((b) => ballWraps(b.seed, b.r, b.hues, 24, b.cx, b.cy))
const RIM = { x0: 8, x1: 92, y: 68, amp: 0, waves: 1, width: 5 }
const RIM_PLIES = plySegments(RIM, 3, 0.5)
const OSIER = ['#ecd6b0', '#e6cda3', '#f0dcba']
const RIM_COLORS = ['#ecd6b0', '#e2c597', '#f2e0c0']
const BODY = 'M10 68 L90 68 L85 88 Q84 91 81 91 L19 91 Q16 91 15 88 Z'
const THREAD = 'M63 30 C83 18 95 30 91 44 S83 58 94 66'

/** Icône du module Tricot : panier d'osier blond rempli de pelotes de couleur (garance, indigo, gaude). */
export function BasketIcon(props: SVGProps<SVGSVGElement>) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 100 100" fill="none" data-icon="basket" {...props}>
      <defs>
        {BALLS.map((b, i) => (
          <clipPath key={i} id={`${id}-b${i}`}>
            <circle cx={b.cx} cy={b.cy} r={b.r} />
          </clipPath>
        ))}
        <clipPath id={`${id}-k`}>
          <path d={BODY} />
        </clipPath>
      </defs>
      {BALLS.map((b, i) => (
        <g key={i}>
          {i === 1 && (
            // Fil qui s'échappe de la pelote indigo et passe par-dessus le bord.
            <g strokeLinecap="round">
              <path d={THREAD} stroke="#1a2150" strokeWidth={3.4} />
              <path d={THREAD} stroke="#5a69bd" strokeWidth={2.2} />
              <path d={THREAD} stroke="#fff" strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="1.6 2.4" />
            </g>
          )}
          <g clipPath={`url(#${id}-b${i})`}>
            <circle cx={b.cx} cy={b.cy} r={b.r} fill={shade(b.hues[0]!, -30)} />
            {WRAPS[i]!.map((w, j) => (
              <g key={j}>
                <path d={w.d} stroke={w.edge} strokeWidth={w.width + 0.9} strokeLinecap="round" />
                <path d={w.d} stroke={w.color} strokeWidth={w.width} strokeLinecap="round" />
              </g>
            ))}
          </g>
          <circle cx={b.cx} cy={b.cy} r={b.r} stroke={shade(b.hues[0]!, -34)} strokeWidth={b.r / 14} />
        </g>
      ))}
      <path d={BODY} fill="#c9a77a" />
      <g clipPath={`url(#${id}-k)`}>
        {[0, 1, 2].map((row) =>
          Array.from({ length: 8 }, (_, k) => {
            // Brins d'osier bornés au panier (la découpe arrondit les côtés) : rien ne dépasse de l'icône.
            const x = Math.max(-16 + (row % 2) * 8 + k * 16 + 0.8, 10)
            const end = Math.min(-16 + (row % 2) * 8 + k * 16 + 15.2, 90)
            if (end - x < 2) return null
            return <rect key={`${row}-${k}`} x={x} y={69.5 + row * 7.4} width={end - x} height={6.4} rx={3.2} fill={OSIER[(row + k) % 3]} stroke="#c9a77a" strokeWidth={0.6} />
          }),
        )}
      </g>
      <path d={BODY} stroke="#a8835a" strokeWidth={1.4} strokeLinejoin="round" />
      {/* Bord en corde torsadée. */}
      <g strokeLinecap="round">
        <line x1={RIM.x0} y1={RIM.y} x2={RIM.x1} y2={RIM.y} stroke="#a8835a" strokeWidth={4.8} />
        {RIM_PLIES.filter((s) => !s.front).map((s, i) => (
          <polyline key={`b${i}`} points={s.points} stroke={RIM_COLORS[s.ply % 3]} strokeOpacity={0.8} strokeWidth={3} />
        ))}
        {RIM_PLIES.filter((s) => s.front).map((s, i) => (
          <g key={`f${i}`}>
            <polyline points={s.points} stroke="#a8835a" strokeOpacity={0.6} strokeWidth={3.8} />
            <polyline points={s.points} stroke={RIM_COLORS[(s.ply + 1) % 3]} strokeWidth={3} />
          </g>
        ))}
      </g>
    </svg>
  )
}
