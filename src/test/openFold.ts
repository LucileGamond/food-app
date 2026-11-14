import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach } from 'vitest'

/** Ouvre un bloc replié (Fold) d’après son titre. */
export async function openFold(title: string | RegExp) {
  const toggle = await screen.findByRole('button', { name: title, expanded: false })
  await userEvent.click(toggle)
}

/** Blocs de la préparation d'une étape (texte, sous-étapes, diagrammes, notes), repliés par défaut. */
const STEP_PART = /^(step-text|sections-|charts-|notes-part-)/

let watcher: MutationObserver | null = null

/**
 * Pour les tests qui ne portent pas sur le repli : déplie les blocs de la préparation d'une étape dès qu'ils
 * apparaissent (y compris en passant à une autre étape), jusqu'à la fin du test.
 */
export function unfoldStepParts() {
  const open = () => {
    for (const button of document.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"][aria-controls]')) {
      const id = button.getAttribute('aria-controls')!.replace(/-content$/, '')
      if (STEP_PART.test(id) && !button.dataset.unfolded) {
        // Une seule fois par bloc : un test peut ensuite le replier lui-même.
        button.dataset.unfolded = 'true'
        fireEvent.click(button)
      }
    }
  }
  watcher?.disconnect()
  watcher = new MutationObserver(open)
  watcher.observe(document.body, { childList: true, subtree: true })
  open()
}

afterEach(() => {
  watcher?.disconnect()
  watcher = null
})
