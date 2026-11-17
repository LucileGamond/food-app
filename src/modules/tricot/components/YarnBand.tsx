import { useId, useMemo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { yarnFacts, yarnTitle, type Yarn } from '../lib/yarn'
import { ballWraps, gaugeHues } from '../lib/yarnDrawing'
import { seedOf } from '../lib/random'
import { shade } from '../lib/color'

/** Petite pelote aux couleurs d'une laine (même enroulement que la jauge), immobile. */
export function YarnBall({ hues, seed, className }: { hues: string[]; seed: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const colors = gaugeHues(hues)
  const key = colors.join(',')
  const wraps = useMemo(() => ballWraps(seed, 16, key.split(','), 16), [seed, key])
  return (
    <svg viewBox="-19 -19 38 38" className={cn('shrink-0', className)} aria-hidden data-testid="yarn-ball">
      <defs>
        <clipPath id={`${id}-c`}>
          <circle r={16} />
        </clipPath>
      </defs>
      <circle r={17.5} fill="none" stroke={colors[0]} strokeOpacity={0.3} strokeWidth={1.6} strokeDasharray=".5 1.6" />
      <g clipPath={`url(#${id}-c)`}>
        <circle r={16} fill={shade(colors[0]!, -30)} />
        {wraps.map((w, i) => (
          <g key={i}>
            <path d={w.d} fill="none" stroke={w.edge} strokeWidth={w.width + 0.9} strokeLinecap="round" />
            <path d={w.d} fill="none" stroke={w.color} strokeWidth={w.width} strokeLinecap="round" />
          </g>
        ))}
      </g>
      <circle r={16} fill="none" stroke={shade(colors[0]!, -34)} strokeWidth={0.9} />
    </svg>
  )
}

/**
 * Une laine présentée comme la bande (étiquette) qui entoure la pelote : sa pelote en couleur, son nom, puis coloris,
 * bain (mis en avant), poids et métrage, composition, aiguilles et nombre de pelotes.
 */
/**
 * `actions` : petits boutons (modifier, supprimer) en haut à droite de la bande, sur la ligne du nom, pour que les
 * caractéristiques de la laine gardent toute la largeur.
 */
export function YarnBand({ yarn, className, actions }: { yarn: Yarn; className?: string; actions?: ReactNode }) {
  const title = yarnTitle(yarn)
  const facts = yarnFacts(yarn)
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-dashed border-noix/35 bg-card px-3 py-2', className)} data-testid="yarn-band">
      <YarnBall hues={yarn.hues} seed={seedOf([title, yarn.color, ...yarn.hues].join('|'))} className="size-10" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-start gap-1">
          <p className="min-w-0 flex-1 knit-name text-base leading-tight">{title}</p>
          {actions && <div className="-mt-1 -mr-2 flex shrink-0">{actions}</div>}
        </div>
        {facts.length > 0 && (
          <span className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
            {facts.map((f) =>
              f.strong ? (
                <strong key={f.label} className="font-semibold text-foreground">
                  {f.label}
                </strong>
              ) : (
                <span key={f.label}>{f.label}</span>
              ),
            )}
          </span>
        )}
      </div>
    </div>
  )
}
