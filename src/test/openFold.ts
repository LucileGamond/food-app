import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Ouvre un bloc replié (Fold) d’après son titre. */
export async function openFold(title: string | RegExp) {
  const toggle = await screen.findByRole('button', { name: title, expanded: false })
  await userEvent.click(toggle)
}
