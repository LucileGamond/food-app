// Mode cuisine vocal : commandes reconnues dans ce que dit la personne, et textes lus à voix haute.

import { formatIngredient, type Ingredient } from './recipes'

export type VoiceCommand = 'next' | 'previous' | 'repeat' | 'ingredients' | 'timer' | 'pause' | 'resume' | 'remaining' | 'stop' | 'help'

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Phrases reconnues, de la plus précise à la plus générale (« reprends le minuteur » avant « minuteur »). Pas de mots
 * trop courants (« ok », « fait », « quoi ») : une conversation dans la cuisine ne doit pas faire avancer la recette.
 */
const COMMANDS: readonly [VoiceCommand, RegExp][] = [
  ['help', /\b(aide|qu est ce que je peux dire|commandes?)\b/],
  ['remaining', /\b(combien de temps|temps restant|reste combien|il reste)\b/],
  ['stop', /\b(arrete|stop|stoppe|silence|tais toi)\b/],
  ['pause', /\b(pause)\b/],
  ['resume', /\b(reprends?|reprendre|continue le minuteur|relance)\b/],
  ['timer', /\b(minuteur|chrono|chronometre|timer)\b/],
  ['ingredients', /\b(ingredients?)\b/],
  ['previous', /\b(precedente?|retour|en arriere|revenir)\b/],
  ['repeat', /\b(repete|repeter|redis|encore une fois|relis)\b/],
  ['next', /\b(suivante?|la suite|ensuite|c est fait|next)\b/],
]

/** Commande reconnue dans une phrase entendue ; null si aucune (bruit, conversation). */
export function parseCommand(heard: string): VoiceCommand | null {
  const text = normalize(heard)
  if (!text) return null
  return COMMANDS.find(([, pattern]) => pattern.test(text))?.[0] ?? null
}

export const VOICE_HELP =
  'Dis « suivant », « précédent » ou « répète » pour les étapes, « ingrédients » pour la liste, « lance le minuteur », « pause », « reprends », « combien de temps » ou « arrête ».'

/** « 12 minutes et 30 secondes », « 1 heure 5 minutes », « 45 secondes » : un temps restant à dire. */
export function spokenDuration(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const unit = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
  if (h > 0) return [unit(h, 'heure'), m > 0 ? unit(m, 'minute') : ''].filter(Boolean).join(' ')
  if (m > 0) return s > 0 ? `${unit(m, 'minute')} et ${unit(s, 'seconde')}` : unit(m, 'minute')
  return unit(s, 'seconde')
}

/** Liste des ingrédients à lire : « 4 pommes. 50 g sucre. » (abréviations lues en entier). */
export function spokenIngredients(ingredients: readonly Ingredient[]): string {
  if (ingredients.length === 0) return 'Aucun ingrédient.'
  return ingredients
    .map((i) =>
      formatIngredient(i)
        .replace(/(\d+(?:,\d+)?)? ?c\. à ([sc])\./g, (_, n: string | undefined, kind: string) => {
          const plural = n !== undefined && Number(n.replace(',', '.')) > 1 ? 's' : ''
          return `${n ? `${n} ` : ''}cuillère${plural} à ${kind === 's' ? 'soupe' : 'café'}`
        })
        .replace(/(\d)\s?g\b/g, '$1 grammes')
        .replace(/(\d)\s?kg\b/g, '$1 kilos')
        .replace(/(\d)\s?cl\b/g, '$1 centilitres')
        .replace(/(\d)\s?ml\b/g, '$1 millilitres'),
    )
    .join('. ')
    .concat('.')
}
