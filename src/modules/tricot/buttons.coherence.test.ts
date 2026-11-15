// Boutons du module Tricot (décision du 2026-11-15) : tous le même beige foncé (variantes « default » et « outline »,
// habillées par index.css sous :root[data-module='tricot'] grâce à leurs repères btn-primary et btn-outline), sauf
// « Annuler » et « Fermer », en simple texte (ghost), pour ne pas peser autant que l'action d'à côté.
import { buttonVariants } from '@/components/ui/button'

const SOURCES = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

describe('boutons du module Tricot', () => {
  it('les variantes principale et contour portent chacune leur repère (le module les habille pareil)', () => {
    expect(buttonVariants()).toContain('btn-primary')
    expect(buttonVariants({ variant: 'outline' })).toContain('btn-outline')
    expect(buttonVariants({ variant: 'ghost' })).not.toMatch(/btn-(primary|outline)/)
  })

  it('met « Annuler » et « Fermer » en simple texte (ghost)', () => {
    const wrong = Object.entries(SOURCES).flatMap(([path, text]) =>
      [...text.matchAll(/<Button\b([^<]*)>\s*\n\s*<CloseIcon \/> (Annuler|Fermer)/g)].filter((m) => !m[1]!.includes('variant="ghost"')).map((m) => `${path} : « ${m[2]} »`),
    )
    expect(wrong).toEqual([])
  })
})
