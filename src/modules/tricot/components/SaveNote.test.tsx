import { act, render, renderHook, screen } from '@testing-library/react'
import { SaveNote, useSaveNote } from './SaveNote'

describe('« Enregistré »', () => {
  it('seulement quand l’enregistrement a vraiment réussi', async () => {
    const { result } = renderHook(() => useSaveNote())
    await act(() => result.current.run(async () => undefined))
    expect(result.current.state).toBe('saved')
    // Échec rendu par `false` (l'erreur a déjà été montrée) : rien d'affiché
    await act(() => result.current.run(async () => false))
    expect(result.current.state).toBe('idle')
    await act(async () => {
      await expect(result.current.run(() => Promise.reject(new Error('non')))).rejects.toThrow('non')
    })
    expect(result.current.state).toBe('idle')
  })

  it('affiche l’état', () => {
    const { rerender } = render(<SaveNote state="saving" />)
    expect(screen.getByText('Enregistrement…')).toBeInTheDocument()
    rerender(<SaveNote state="saved" />)
    expect(screen.getByText('Enregistré')).toBeInTheDocument()
    rerender(<SaveNote state="idle" />)
    expect(screen.queryByText(/Enregistr/)).not.toBeInTheDocument()
  })
})
