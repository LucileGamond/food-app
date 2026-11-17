import userEvent from '@testing-library/user-event'

type Options = Parameters<typeof userEvent.setup>[0]

/**
 * Utilisateur simulé des tests. Chaque touche reste un vrai événement (keydown, input, keyup), mais sans attendre entre
 * deux touches (`delay: null`) : taper une recette entière ne prend plus plusieurs secondes, et les tests ne dépassent
 * plus leur délai quand toute la suite tourne sur une machine chargée.
 */
export function setupUser(options: Options = {}) {
  return userEvent.setup({ delay: null, ...options })
}
