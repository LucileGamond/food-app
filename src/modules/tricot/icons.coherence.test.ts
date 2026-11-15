// Icônes du module Tricot : les actions qui ont leur icône illustrée (KnitIcons) ne reprennent pas un pictogramme
// standard, et les boutons « Annuler », « Fermer », « Enregistrer » portent la leur (décision du 2026-11-15).
const SOURCES = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

/** Pictogrammes Lucide remplacés par une icône illustrée, avec celle qui les remplace. */
const REPLACED: Record<string, string> = {
  FileText: 'PdfIcon',
  Files: 'PdfIcon',
  ListTree: 'OrganizeIcon ou StepsIcon',
  MoveRight: 'OrganizeIcon',
  Combine: 'JoinIcon',
  MessageCircleQuestion: 'QuestionIcon',
  Send: 'QuestionIcon',
  Languages: 'TranslateIcon',
  Highlighter: 'HighlightIcon',
  Crop: 'CropIcon',
  Star: 'StarIcon',
  ListOrdered: 'StepsIcon',
  NotebookPen: 'NotesIcon',
  Scale: 'ScaleIcon',
  Settings2: 'EditIcon',
  RefreshCw: 'RestartIcon',
  Repeat: 'RestartIcon',
  Save: 'DoneIcon',
  ExternalLink: 'LinkIcon',
  Download: 'LinkIcon',
  // Précédent et suivant ont le même chevron (2026-11-15)
  ChevronLeft: 'BackIcon',
  ChevronRight: 'OpenIcon',
}

describe('icônes du module Tricot', () => {
  const sources = Object.entries(SOURCES).map(([path, text]) => ({ path, text }))

  it('n’importe plus de Lucide les pictogrammes qui ont leur icône illustrée', () => {
    const wrong = sources.flatMap(({ path, text }) => {
      const lucide = /import \{([^}]*)\} from 'lucide-react'/.exec(text)?.[1] ?? ''
      return lucide
        .split(',')
        .map((n) => n.trim().split(' as ')[0]!)
        .filter((n) => n in REPLACED)
        .map((n) => `${path} : ${n} → ${REPLACED[n]}`)
    })
    expect(wrong).toEqual([])
  })

  it('donne son icône à chaque bouton « Annuler », « Fermer » ou « Enregistrer » écrit seul', () => {
    const wrong = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/<Button\b[^<]*>\s*\n\s*(Annuler|Fermer|Enregistrer)\s*\n/g)].map((m) => `${path} : « ${m[1]} » sans icône`),
    )
    expect(wrong).toEqual([])
  })
})
