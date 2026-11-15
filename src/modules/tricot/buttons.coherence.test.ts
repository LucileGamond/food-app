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

/** Chaque <Button …>…</Button> d'un fichier : ses attributs et son contenu (accolades des attributs comprises). */
function buttons(text: string): { attrs: string; body: string; line: number }[] {
  const found: { attrs: string; body: string; line: number }[] = []
  for (const m of text.matchAll(/<Button\b/g)) {
    let i = m.index + m[0].length
    let depth = 0
    for (; i < text.length; i++) {
      const c = text[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    const attrs = text.slice(m.index + m[0].length, i)
    if (attrs.endsWith('/')) continue
    const end = text.indexOf('</Button>', i)
    found.push({ attrs, body: text.slice(i + 1, end).trim(), line: text.slice(0, m.index).split('\n').length })
  }
  return found
}

// Règles des boutons, validées le 2026-11-15 :
// 1. une seule action principale par écran (beige foncé, icône et texte) ;
// 2. les actions d'un bloc : icône et texte, sous le contenu ;
// 3. les actions sur un élément (laine, fiche, diagramme…) : petite icône seule en haut à droite (ItemAction), au-delà
//    de deux un menu « … » ;
// 4. Annuler, Fermer : sans fond, avec icône, avant l'action principale ;
// 5. Supprimer : jamais un bouton à texte (la poubelle d'ItemAction ou le menu), toujours confirmé.
describe('règles des boutons du module Tricot', () => {
  const all = Object.entries(SOURCES).flatMap(([path, text]) => buttons(text).map((b) => ({ ...b, at: `${path}:${b.line}` })))

  it('un bouton à texte commence par son icône', () => {
    // Le contenu commence par une balise (l'icône) ou une expression (icône ou sablier selon l'état).
    const wrong = all.filter((b) => b.body && !/^[<{]/.test(b.body)).map((b) => `${b.at} : « ${b.body.split('\n')[0]} »`)
    expect(wrong).toEqual([])
  })

  it('les actions modifier et supprimer d’un élément passent par ItemAction (petite icône seule)', () => {
    const wrong = all.filter((b) => /^<(EditIcon|DeleteIcon)\b[^>]*\/>$/.test(b.body)).map((b) => b.at)
    expect(wrong).toEqual([])
  })

  it('aucun bouton à texte « Supprimer » : la poubelle ou le menu', () => {
    const wrong = all.filter((b) => /^<DeleteIcon[^>]*\/>\s*Supprimer/.test(b.body)).map((b) => b.at)
    expect(wrong).toEqual([])
  })

  it('ItemAction : sans fond, petit, avec sa zone de toucher', () => {
    const source = SOURCES['./components/ItemAction.tsx']!
    expect(source).toContain('variant="ghost"')
    expect(source).toContain('size="icon-sm"')
    expect(source).toContain('TOUCH_AREA')
  })
})
