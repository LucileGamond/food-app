import { render } from '@testing-library/react'
import * as Icons from './KnitIcons'
import { MINUS_RED, PLUS_GREEN } from '../lib/knitIcons'

const ALL = Object.entries(Icons).filter(([name]) => name.endsWith('Icon'))

describe('icônes illustrées du Tricot', () => {
  it('compte quinze icônes, chacune décorative, à 24 px par défaut, dans son cadre 64 × 64', () => {
    expect(ALL.map(([name]) => name).sort()).toEqual(
      ['AddIcon', 'ChartIcon', 'DeleteIcon', 'DoneIcon', 'EditIcon', 'KnitIcon', 'LinkIcon', 'MeasuresIcon', 'OpenIcon', 'PatternsIcon', 'PhotoIcon', 'RemoveIcon', 'RestartIcon', 'SearchIcon', 'UndoIcon'].sort(),
    )
    for (const [, Icon] of ALL) {
      const { container, unmount } = render(<Icon />)
      const svg = container.querySelector('svg')!
      expect(svg).toHaveAttribute('viewBox', '0 0 64 64')
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveClass('size-6')
      expect(svg.innerHTML.length).toBeGreaterThan(100)
      unmount()
    }
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
    const add = render(<Icons.AddIcon />).container.innerHTML
    const remove = render(<Icons.RemoveIcon />).container.innerHTML
    expect(add).toContain(PLUS_GREEN)
    expect(add).not.toContain(MINUS_RED)
    expect(remove).toContain(MINUS_RED)
    expect(remove).not.toContain(PLUS_GREEN)
  })
})
