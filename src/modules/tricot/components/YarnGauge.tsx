import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ballScale, ballWraps, gaugeFraction, gaugeHues, plySegments, shade, threadCenter, type ThreadLine } from '../lib/yarnGauge'

const SIZES = {
  lg: { w: 320, h: 96, r: 30, line: { x0: 40, x1: 312, y: 50, amp: 9, waves: 2.5, width: 9 }, wraps: 34 },
  sm: { w: 320, h: 44, r: 16, line: { x0: 20, x1: 314, y: 22, amp: 4, waves: 2, width: 6 }, wraps: 22 },
} satisfies Record<string, { w: number; h: number; r: number; line: ThreadLine; wraps: number }>

/** Longueur fictive du fil (pathLength) : la part tricotée s'en déduit. */
const L = 1000

/**
 * Jauge du module Tricot : la pelote, aux couleurs de la laine du projet, se déroule à gauche et le fil retors avance
 * vers la droite à chaque rang. Le chemin qui reste est en pointillés dès le début. Décorative : le nombre de rangs
 * est écrit à côté.
 */
export function YarnGauge({
  done,
  total,
  hues,
  seed,
  size = 'sm',
  className,
}: {
  done: number
  total: number
  hues: string[]
  /** Enroulement de la pelote (stable par projet : seedOf(id)). */
  seed: number
  size?: keyof typeof SIZES
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  const cfg = SIZES[size]
  const colors = gaugeHues(hues)
  const key = colors.join(',')
  const center = useMemo(() => threadCenter(cfg.line), [cfg])
  const plies = useMemo(() => plySegments(cfg.line), [cfg])
  const wraps = useMemo(() => ballWraps(seed, cfg.r, key.split(','), cfg.wraps), [seed, cfg, key])
  const fraction = gaugeFraction(done, total)
  const ply = (i: number) => colors[i % colors.length]!
  const bw = cfg.line.width * 0.62
  const motion = 'transition-[stroke-dashoffset,transform] duration-500 ease-out motion-reduce:transition-none'

  return (
    <svg
      viewBox={`0 0 ${cfg.w} ${cfg.h}`}
      className={cn('block w-full overflow-visible', className)}
      aria-hidden
      data-testid="yarn-gauge"
      data-fraction={fraction.toFixed(3)}
    >
      <defs>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={-20} y={-20} width={cfg.w + 40} height={cfg.h + 40}>
          <polyline
            points={center}
            fill="none"
            stroke="#fff"
            strokeWidth={cfg.line.width * 2.4}
            strokeLinecap="round"
            pathLength={L}
            // Trait puis grand vide : à 0 rang, rien ne réapparaît au bout du fil.
            strokeDasharray={`${L} ${2 * L}`}
            strokeDashoffset={L * (1 - fraction)}
            className={motion}
            data-testid="yarn-gauge-reveal"
          />
        </mask>
        <clipPath id={`${id}-c`}>
          <circle r={cfg.r} />
        </clipPath>
      </defs>

      {/* Chemin qui reste à tricoter, visible dès le début. */}
      <polyline points={center} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth={1.5} strokeDasharray="2 5" strokeLinecap="round" className="text-noix" />

      <g mask={`url(#${id}-m)`}>
        <polyline points={center} fill="none" stroke={colors[0]} strokeOpacity={0.18} strokeWidth={cfg.line.width * 1.5} strokeLinecap="round" />
        <polyline points={center} fill="none" stroke={shade(colors[0]!, -30)} strokeWidth={cfg.line.width * 0.9} strokeLinecap="round" />
        {plies
          .filter((s) => !s.front)
          .map((s, i) => (
            <polyline key={`b${i}`} points={s.points} fill="none" stroke={shade(ply(s.ply), -12)} strokeWidth={bw} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        {plies
          .filter((s) => s.front)
          .map((s, i) => (
            <g key={`f${i}`}>
              <polyline points={s.points} fill="none" stroke={shade(ply(s.ply), -32)} strokeWidth={bw + 1} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={s.points} fill="none" stroke={shade(ply(s.ply), colors.length === 1 ? (s.ply - 1) * 8 : 0)} strokeWidth={bw} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={s.points} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={bw * 0.3} strokeDasharray="1.5 2.5" />
            </g>
          ))}
      </g>

      <g transform={`translate(${cfg.line.x0} ${cfg.line.y})`}>
        <g className={motion} style={{ transform: `rotate(${Math.round(done * 9)}deg) scale(${ballScale(fraction).toFixed(3)})` }} data-testid="yarn-gauge-ball">
          <circle r={cfg.r + 2.5} fill="none" stroke={colors[0]} strokeOpacity={0.3} strokeWidth={2.5} strokeDasharray=".6 2" />
          <g clipPath={`url(#${id}-c)`}>
            <circle r={cfg.r} fill={shade(colors[0]!, -30)} />
            {wraps.map((w, i) => (
              <g key={i} transform={`rotate(${w.rotate})`}>
                <path d={w.d} fill="none" stroke={w.edge} strokeWidth={w.width + 1.2} strokeLinecap="round" />
                <path d={w.d} fill="none" stroke={w.color} strokeWidth={w.width} strokeLinecap="round" />
              </g>
            ))}
          </g>
          <circle r={cfg.r} fill="none" stroke={shade(colors[0]!, -34)} strokeWidth={cfg.r / 18} />
          <circle cx={-cfg.r * 0.32} cy={-cfg.r * 0.34} r={cfg.r * 0.42} fill="#fff" fillOpacity={0.08} />
        </g>
      </g>
    </svg>
  )
}
