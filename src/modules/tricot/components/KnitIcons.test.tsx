import { render } from '@testing-library/react'
import * as Icons from './KnitIcons'
import { MINUS_RED, PLUS_GREEN } from '../lib/knitIcons'

const ALL = Object.entries(Icons).filter(([name]) => name.endsWith('Icon'))

/** Couleurs de remplissage des éléments dessinés. */
const fills = (container: Element) => [...container.querySelectorAll('svg [fill]')].map((e) => e.getAttribute('fill'))

describe('icônes illustrées du Tricot', () => {
  it('compte trente icônes, chacune décorative, à 24 px par défaut, dans son cadre 64 × 64', () => {
    expect(ALL.map(([name]) => name).sort()).toEqual(
      [
        ...['AddIcon', 'ChartIcon', 'DeleteIcon', 'DoneIcon', 'EditIcon', 'KnitIcon', 'LinkIcon', 'MeasuresIcon', 'OpenIcon', 'PatternsIcon', 'PhotoIcon', 'RemoveIcon', 'RestartIcon', 'SearchIcon', 'UndoIcon'],
        // Icônes des boutons, ajoutées le 2026-11-15
        ...['CloseIcon', 'CropIcon', 'HighlightIcon', 'JoinIcon', 'NeedlesIcon', 'NotesIcon', 'OrganizeIcon', 'PdfIcon', 'QuestionIcon', 'ScaleIcon', 'SplitIcon', 'StarIcon', 'StepsIcon', 'TranslateIcon'],
        // Retour : le chevron d'« Ouvrir » retourné (2026-11-15)
        'BackIcon',
      ].sort(),
    )
    for (const [, Icon] of ALL) {
      const { container, unmount } = render(<Icon />)
      const svg = container.querySelector('svg')!
      expect(svg).toHaveAttribute('viewBox', '0 0 64 64')
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveClass('size-6')
      // Dessinée : des formes peintes, pas un cadre vide
      expect(svg.querySelectorAll('[fill], [stroke]').length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('« Revenir » est le chevron d’« Ouvrir », retourné', () => {
    const open = render(<Icons.OpenIcon />).container.querySelector('svg')!
    const back = render(<Icons.BackIcon />).container.querySelector('svg')!
    expect(back.querySelector('g[transform]')).toHaveAttribute('transform', 'matrix(-1 0 0 1 64 0)')
    const paths = (svg: Element) => [...svg.querySelectorAll('path')].map((e) => e.getAttribute('d'))
    expect(paths(back)).toEqual(paths(open))
  })

  it('garde la taille demandée, et se nomme quand on lui donne un libellé', () => {
    const { container } = render(<Icons.EditIcon className="size-4" aria-label="Modifier" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveClass('size-4')
    expect(svg).not.toHaveClass('size-6')
    expect(svg).not.toHaveAttribute('aria-hidden')
    expect(svg).toHaveAttribute('aria-label', 'Modifier')
  })

  it('« + » sur pastille verte pour ajouter, « − » sur pastille rouge pour retirer, même pelote', () => {
    const add = fills(render(<Icons.AddIcon />).container)
    const remove = fills(render(<Icons.RemoveIcon />).container)
    expect(add).toContain(PLUS_GREEN)
    expect(add).not.toContain(MINUS_RED)
    expect(remove).toContain(MINUS_RED)
    expect(remove).not.toContain(PLUS_GREEN)
  })
})
