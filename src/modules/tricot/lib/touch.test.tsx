import { render, screen } from '@testing-library/react'
import { ModeCounter } from '../components/mode/ModeCounter'
import { HelpTip } from '../components/HelpTip'
import { TOUCH_AREA, TOUCH_AREA_INLINE } from './touch'

/** Cibles tactiles d'au moins 44 px (E1) : les petits boutons gardent leur dessin, leur zone tactile déborde. */
describe('zones tactiles', () => {
  it('28 px + 2 × 8 px = 44 px ; une ligne de texte (20 px) + 2 × 12 px = 44 px', () => {
    expect(TOUCH_AREA).toContain('after:-inset-2')
    expect(TOUCH_AREA_INLINE).toContain('after:-inset-y-3')
  })

  it('« Terminer la sous-étape » du compteur', () => {
    render(<ModeCounter rowCount={3} totalRows={20} onCount={() => {}} substeps={[{ index: 0, title: 'jersey', row: 4, rows: null, finishable: true }]} onFinishSubstep={() => {}} />)
    const finish = screen.getByRole('button', { name: /Terminer la sous-étape/ })
    expect(finish).toHaveClass('relative', 'after:-inset-2')
  })

  it('le « ? » d’aide', () => {
    render(<HelpTip label="test">Aide</HelpTip>)
    expect(screen.getByRole('button', { name: 'Aide : test' })).toHaveClass('relative', 'after:-inset-2')
  })
})
