import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BuildInfo, buildLabel } from './BuildInfo'

describe('buildLabel', () => {
  it('donne le numéro et l’heure du commit', () => {
    expect(buildLabel('1414f25', '2026-10-31T14:05:00+01:00')).toMatch(/^1414f25 · 31 oct\. 2026.*\d{2}:05$/)
  })

  it('garde le numéro seul si la date est illisible, et rien sans commit', () => {
    expect(buildLabel('1414f25', '')).toBe('1414f25')
    expect(buildLabel('', '2026-10-31T14:05:00Z')).toBeNull()
  })
})

describe('BuildInfo', () => {
  it('affiche le dernier commit à l’ouverture', async () => {
    render(<BuildInfo />)
    await userEvent.click(screen.getByRole('button', { name: 'Version de l’application' }))
    expect(await screen.findByText('Dernier commit')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`^${import.meta.env.VITE_COMMIT_HASH}`))).toBeInTheDocument()
  })
})
