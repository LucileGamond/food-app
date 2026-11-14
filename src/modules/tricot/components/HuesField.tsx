import { Plus, X } from 'lucide-react'
import { MAX_HUES } from '../lib/yarn'

/** Nuancier de teintures (indigo, garance, gaude, noix, sauge, écru, gris, noir) : un toucher ajoute la couleur. */
export const DYES: { name: string; hex: string }[] = [
  { name: 'Indigo', hex: '#3f4fa0' },
  { name: 'Garance', hex: '#b4472f' },
  { name: 'Gaude', hex: '#e2b93a' },
  { name: 'Noix', hex: '#6e5238' },
  { name: 'Sauge', hex: '#7f9a7a' },
  { name: 'Écru', hex: '#ece3d0' },
  { name: 'Gris', hex: '#8a8a8a' },
  { name: 'Noir', hex: '#262626' },
]

/**
 * Couleurs du fil : jusqu'à 3 pastilles (un chiné, un dégradé), lues sur la photo de l'étiquette ou choisies à la main
 * (nuancier, ou sélecteur de couleur en touchant une pastille). La première colore le projet.
 */
export function HuesField({ hues, onChange }: { hues: string[]; onChange: (hues: string[]) => void }) {
  const full = hues.length >= MAX_HUES
  const set = (index: number, hex: string) => onChange(hues.map((h, i) => (i === index ? hex.toLowerCase() : h)))
  const add = (hex: string) => !full && !hues.includes(hex) && onChange([...hues, hex])
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Couleurs du fil</legend>
      <p className="text-xs text-muted-foreground">
        {hues.length === 0 ? 'Jusqu’à 3, lues sur la photo ou choisies ici. La première colore le projet.' : 'Touche une pastille pour la changer. La première colore le projet.'}
      </p>
      {hues.length > 0 && (
        <ul className="flex flex-wrap gap-3" aria-label="Couleurs choisies">
          {hues.map((hex, i) => (
            <li key={i} className="relative">
              <label className="block size-11 cursor-pointer rounded-full shadow-[0_0_0_1px_var(--color-border)] ring-2 ring-background" style={{ background: hex }}>
                <input type="color" className="sr-only" aria-label={`Couleur ${i + 1}`} value={hex} onChange={(e) => set(i, e.target.value)} />
              </label>
              <button
                type="button"
                aria-label={`Retirer la couleur ${i + 1}`}
                className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={() => onChange(hues.filter((_, j) => j !== i))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Nuancier">
          <Plus className="size-4 text-muted-foreground" aria-hidden />
          {DYES.map((dye) => (
            <button
              key={dye.hex}
              type="button"
              aria-label={`Ajouter ${dye.name}`}
              title={dye.name}
              disabled={hues.includes(dye.hex)}
              className="size-7 rounded-full shadow-[0_0_0_1px_var(--color-border)] transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-30 motion-reduce:transition-none"
              style={{ background: dye.hex }}
              onClick={() => add(dye.hex)}
            />
          ))}
        </div>
      )}
    </fieldset>
  )
}
