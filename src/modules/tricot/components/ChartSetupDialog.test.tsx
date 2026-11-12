import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newChartForm } from '../lib/chart'
import type { StepSection } from '../lib/pattern'
import { ChartSetupDialog } from './ChartSetupDialog'

const rows = (n: number, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null })

describe('calage d’un diagramme : sa sous-étape', () => {
  it('choisir la sous-étape remplit le premier et le dernier rang ; l’enregistrement les garde', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => true)
    const steps = [{ id: 's1', title: 'Dos', totalRows: 30, sections: [rows(4, 'côtes'), rows(26, 'torsades')] }]
    render(<ChartSetupDialog open imageUrl="https://cdn.test/c1.png" initial={{ ...newChartForm('s1'), rows: '4' }} steps={steps} onCancel={() => undefined} onSave={onSave} />)
    await user.selectOptions(screen.getByLabelText('Sous-étape'), '2. 26 rangs : torsades (rangs 5 à 30)')
    expect(screen.getByLabelText('Rang 1 du diagramme au rang de l’étape')).toHaveValue('5')
    expect(screen.getByLabelText('Dernier rang (facultatif)')).toHaveValue('30')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startRow: 5, endRow: 30 }))
  })
})
