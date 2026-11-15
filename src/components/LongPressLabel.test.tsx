import { act, fireEvent, render, screen } from '@testing-library/react'
import { LONG_PRESS_MS, LongPressLabel, iconOnlyLabel } from './LongPressLabel'

function setup(onClick = vi.fn()) {
  render(
    <>
      <LongPressLabel />
      <button type="button" aria-label="Supprimer le projet" onClick={onClick}>
        <svg aria-hidden />
      </button>
      <button type="button" aria-label="Ajouter un rang" onClick={onClick}>
        <svg aria-hidden />
        <span className="sr-only">Ajouter</span>
      </button>
      <button type="button" aria-label="Modifier les aiguilles" onClick={onClick}>
        <svg aria-hidden /> Modifier
      </button>
    </>,
  )
  return onClick
}

const bubble = () => screen.queryByTestId('long-press-label')

describe('appui long : le nom d’un bouton à icône seule', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reconnaît les boutons à icône seule (le texte réservé au lecteur d’écran ne compte pas)', () => {
    setup()
    expect(iconOnlyLabel(screen.getByRole('button', { name: 'Supprimer le projet' }))?.label).toBe('Supprimer le projet')
    expect(iconOnlyLabel(screen.getByRole('button', { name: 'Ajouter un rang' }))?.label).toBe('Ajouter un rang')
    // Un bouton qui écrit son nom n'en a pas besoin
    expect(iconOnlyLabel(screen.getByRole('button', { name: 'Modifier les aiguilles' }))).toBeNull()
  })

  it('montre le nom après un appui long, puis le cache', () => {
    setup()
    const button = screen.getByRole('button', { name: 'Supprimer le projet' })
    fireEvent.pointerDown(button, { clientX: 10, clientY: 10 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 50))
    expect(bubble()).toBeNull()
    act(() => vi.advanceTimersByTime(100))
    expect(bubble()).toHaveTextContent('Supprimer le projet')
    expect(bubble()).toHaveAttribute('aria-hidden')
    act(() => vi.advanceTimersByTime(3000))
    expect(bubble()).toBeNull()
  })

  it('relâcher après l’appui long ne déclenche pas le bouton ; un toucher court, si', () => {
    const onClick = setup()
    const button = screen.getByRole('button', { name: 'Supprimer le projet' })
    fireEvent.pointerDown(button)
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 10))
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    // Toucher court ensuite : le bouton agit, sans bulle
    fireEvent.pointerDown(button)
    act(() => vi.advanceTimersByTime(100))
    fireEvent.pointerUp(button)
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(bubble()).toBeNull()
  })

  it('le doigt qui glisse (défilement) annule ; un bouton qui écrit son nom n’a pas de bulle', () => {
    setup()
    const button = screen.getByRole('button', { name: 'Supprimer le projet' })
    fireEvent.pointerDown(button, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(button, { clientX: 10, clientY: 40 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 10))
    expect(bubble()).toBeNull()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Modifier les aiguilles' }))
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 10))
    expect(bubble()).toBeNull()
  })
})
