import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { newChartForm, type ChartSetup } from '../lib/chart'
import type { StepSection } from '../lib/pattern'
import { ChartSetupDialog } from './ChartSetupDialog'

const rows = (n: number, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null })

describe('calage d’un diagramme : sa sous-étape', () => {
  it('choisir la sous-étape remplit le premier et le dernier rang ; l’enregistrement les garde', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_setup: ChartSetup) => true)
    const steps = [{ id: 's1', title: 'Dos', totalRows: 30, sections: [rows(4, 'côtes'), rows(26, 'torsades')] }]
    render(<ChartSetupDialog open imageUrl="https://cdn.test/c1.png" initial={{ ...newChartForm('s1'), rows: '4' }} steps={steps} onCancel={() => undefined} onSave={onSave} />)
    await user.click(screen.getByRole('tab', { name: 'Où il va' }))
    await user.selectOptions(screen.getByLabelText('Sous-étape'), '2. 26 rangs : torsades (rangs 5 à 30)')
    expect(screen.getByLabelText('Rang 1 du diagramme au rang de l’étape')).toHaveValue('5')
    expect(screen.getByLabelText('Dernier rang (facultatif)')).toHaveValue('30')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    // Sous-étape sans identifiant : sa position, pour lui en donner un à l'enregistrement
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startRow: 5, endRow: 30, sectionIndex: 1 }))
  })

  it('sous-étape identifiée : suivie par son identifiant ; des rangs tapés à la main la détachent', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_setup: ChartSetup) => true)
    const steps = [{ id: 's1', title: 'Dos', totalRows: 30, sections: [rows(4, 'côtes'), { ...rows(26, 'torsades'), id: 'tors' }] }]
    const { unmount } = render(<ChartSetupDialog open imageUrl="https://cdn.test/c1.png" initial={{ ...newChartForm('s1'), rows: '4' }} steps={steps} onCancel={() => undefined} onSave={onSave} />)
    await user.click(screen.getByRole('tab', { name: 'Où il va' }))
    await user.selectOptions(screen.getByLabelText('Sous-étape'), '2. 26 rangs : torsades (rangs 5 à 30)')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ sectionId: 'tors', startRow: 5 }))
    expect(onSave.mock.lastCall?.[0]).not.toHaveProperty('sectionIndex')
    unmount()
    render(<ChartSetupDialog open imageUrl="https://cdn.test/c1.png" initial={{ ...newChartForm('s1'), rows: '4', sectionId: 'tors', startRow: '5' }} steps={steps} onCancel={() => undefined} onSave={onSave} />)
    await user.click(screen.getByRole('tab', { name: 'Où il va' }))
    expect(screen.getByLabelText('Sous-étape')).toHaveDisplayValue('2. 26 rangs : torsades (rangs 5 à 30)')
    await user.clear(screen.getByLabelText('Rang 1 du diagramme au rang de l’étape'))
    await user.type(screen.getByLabelText('Rang 1 du diagramme au rang de l’étape'), '7')
    expect(screen.getByLabelText('Sous-étape')).toHaveDisplayValue('Rangs choisis à la main')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave.mock.lastCall?.[0]).not.toHaveProperty('sectionId')
  })
})

describe('calage d’un diagramme : les deux traits', () => {
  it('se règlent au doigt sur l’image, ou au bouton (et au clavier) rang par rang', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_setup: ChartSetup) => true)
    const steps = [{ id: 's1', title: 'Dos', totalRows: 30, sections: [rows(30, 'torsades')] }]
    render(<ChartSetupDialog open imageUrl="https://cdn.test/c1.png" initial={{ ...newChartForm('s1'), rows: '4' }} steps={steps} onCancel={() => undefined} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: 'Descendre le trait du haut (dernière ligne)' }))
    await user.click(screen.getByRole('button', { name: 'Monter le trait du bas (ligne 1)' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ gridTop: 0.01, gridBottom: 0.99 }))
  })

  it('dit où est le problème : le nombre de lignes ramène à la grille', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_setup: ChartSetup) => true)
    const steps = [{ id: 's1', title: 'Dos', totalRows: 30, sections: [rows(30, 'torsades')] }]
    render(<ChartSetupDialog open imageUrl="https://cdn.test/c1.png" initial={newChartForm('s1')} steps={steps} onCancel={() => undefined} onSave={onSave} />)
    await user.click(screen.getByRole('tab', { name: 'Où il va' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Lignes de la grille')
    expect(screen.getByLabelText('Lignes de la grille')).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })
})
