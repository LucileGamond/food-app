import { parseCommand, spokenDuration, spokenIngredients } from './voice'

describe('commandes vocales', () => {
  it.each([
    ['Suivant', 'next'],
    ['étape suivante', 'next'],
    ["c'est fait", 'next'],
    ['Précédent', 'previous'],
    ['revenir en arrière', 'previous'],
    ['répète', 'repeat'],
    ['tu peux répéter ?', 'repeat'],
    ['les ingrédients', 'ingredients'],
    ['lance le minuteur', 'timer'],
    ['mets un chrono', 'timer'],
    ['pause', 'pause'],
    ['reprends le minuteur', 'resume'],
    ['combien de temps il reste', 'remaining'],
    ['arrête', 'stop'],
    ['stop', 'stop'],
    ['aide', 'help'],
    ['Qu’est-ce que je peux dire ?', 'help'],
  ])('« %s » → %s', (heard, command) => {
    expect(parseCommand(heard)).toBe(command)
  })

  it.each(['', 'ok', 'c’est bon le beurre', 'quoi', 'je coupe les oignons', 'il fait beau'])('« %s » n’est pas une commande', (heard) => {
    expect(parseCommand(heard)).toBeNull()
  })

  it('dit une durée', () => {
    expect(spokenDuration(750_000)).toBe('12 minutes et 30 secondes')
    expect(spokenDuration(60_000)).toBe('1 minute')
    expect(spokenDuration(45_000)).toBe('45 secondes')
    expect(spokenDuration(1000)).toBe('1 seconde')
    expect(spokenDuration(3_900_000)).toBe('1 heure 5 minutes')
    expect(spokenDuration(7_200_000)).toBe('2 heures')
  })

  it('lit les ingrédients, abréviations en entier', () => {
    expect(
      spokenIngredients([
        { name: 'pommes', quantity: 4, unit: null, note: null },
        { name: 'sucre', quantity: 50, unit: 'g', note: null },
        { name: 'huile', quantity: 2, unit: 'c. à s.', note: null },
        { name: 'crème', quantity: 20, unit: 'cl', note: 'liquide' },
        { name: 'sel', quantity: 1, unit: 'c. à c.', note: null },
      ]),
    ).toBe('4 pommes. 50 grammes sucre. 2 cuillères à soupe huile. 20 centilitres crème (liquide). 1 cuillère à café sel.')
    expect(spokenIngredients([])).toBe('Aucun ingrédient.')
    // Pluriel à partir de 2, comme à l'écran ; litres et décilitres lus en entier
    expect(
      spokenIngredients([
        { name: 'huile', quantity: 1.5, unit: 'c. à s.', note: null },
        { name: 'lait', quantity: 1, unit: 'l', note: null },
        { name: 'eau', quantity: 2.5, unit: 'dl', note: null },
        { name: 'farine', quantity: 1, unit: 'kg', note: null },
      ]),
    ).toBe('1,5 cuillère à soupe huile. 1 litre lait. 2,5 décilitres eau. 1 kilo farine.')
  })
})
