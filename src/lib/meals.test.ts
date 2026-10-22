import {
  countMealsOnDay,
  dropTarget,
  groupMealsBySlot,
  isMoveNeeded,
  isValidUrl,
  linkify,
  mealCountLabel,
  parseSlotKey,
  peopleLabel,
  slotKey,
  slotLabel,
  toRecipeSource,
  validateMealForm,
  type Meal,
  type MealFormValues,
} from './meals'

const profiles = [
  { id: 'l', display_name: 'Lucile' },
  { id: 'e', display_name: 'Eric' },
  { id: 'a', display_name: 'Anne' },
]

function meal(id: string, date: string, slot: Meal['slot']): Meal {
  return {
    id,
    meal_date: date,
    slot,
    people: ['l'],
    recipe: { id: `r-${id}`, is_saved: false, title: id, notes: null, url: null, tags: [] },
  }
}

const baseForm: MealFormValues = { people: ['l'], mode: 'adhoc', recipeId: null, title: 'Pâtes', notes: '', url: '' }

describe('slotLabel', () => {
  it('traduit les créneaux', () => {
    expect(slotLabel('LUNCH')).toBe('Midi')
    expect(slotLabel('DINNER')).toBe('Soir')
  })
})

describe('peopleLabel', () => {
  it('affiche une seule personne', () => {
    expect(peopleLabel(['l'], profiles)).toBe('Lucile')
  })
  it('affiche deux personnes par ordre alphabétique', () => {
    expect(peopleLabel(['l', 'e'], profiles)).toBe('Eric et Lucile')
  })
  it('affiche plus de deux personnes', () => {
    expect(peopleLabel(['l', 'e', 'a'], profiles)).toBe('Anne, Eric et Lucile')
  })
  it('gère les cas limites', () => {
    expect(peopleLabel([], profiles)).toBe('')
    expect(peopleLabel(['x'], profiles)).toBe('Inconnu')
  })
})

describe('linkify', () => {
  it('rend les URL cliquables et garde le texte autour', () => {
    expect(linkify('Voir https://exemple.fr/recette, merci')).toEqual([
      { type: 'text', value: 'Voir ' },
      { type: 'link', value: 'https://exemple.fr/recette' },
      { type: 'text', value: ', merci' },
    ])
  })
  it('gère plusieurs liens et un texte sans lien', () => {
    expect(linkify('http://a.fr http://b.fr')).toEqual([
      { type: 'link', value: 'http://a.fr' },
      { type: 'text', value: ' ' },
      { type: 'link', value: 'http://b.fr' },
    ])
    expect(linkify('Pâtes')).toEqual([{ type: 'text', value: 'Pâtes' }])
    expect(linkify('')).toEqual([])
  })
})

describe('isValidUrl', () => {
  it('accepte http(s) uniquement', () => {
    expect(isValidUrl('https://exemple.fr')).toBe(true)
    expect(isValidUrl('HTTP://exemple.fr/a?b=1')).toBe(true)
    expect(isValidUrl('ftp://exemple.fr')).toBe(false)
    expect(isValidUrl('exemple.fr')).toBe(false)
    expect(isValidUrl('https://')).toBe(false)
  })
})

describe('validateMealForm', () => {
  it('valide une recette ponctuelle correcte', () => {
    expect(validateMealForm(baseForm)).toEqual({})
  })
  it('exige au moins une personne', () => {
    expect(validateMealForm({ ...baseForm, people: [] }).people).toBeDefined()
  })
  it('exige un titre non vide pour une recette ponctuelle', () => {
    expect(validateMealForm({ ...baseForm, title: '   ' }).title).toBeDefined()
  })
  it('refuse un lien invalide mais accepte un lien vide', () => {
    expect(validateMealForm({ ...baseForm, url: 'pas un lien' }).url).toBeDefined()
    expect(validateMealForm({ ...baseForm, url: '  ' }).url).toBeUndefined()
  })
  it('exige une recette choisie en mode sauvegardé, sans regarder le titre', () => {
    expect(validateMealForm({ ...baseForm, mode: 'saved', title: '' })).toEqual({ recipe: 'Choisis une recette' })
    expect(validateMealForm({ ...baseForm, mode: 'saved', recipeId: 'r1', title: '' })).toEqual({})
  })
})

describe('toRecipeSource', () => {
  it('construit une recette ponctuelle nettoyée', () => {
    expect(toRecipeSource({ ...baseForm, title: ' Pâtes ', notes: ' x ', url: ' https://a.fr ' })).toEqual({
      kind: 'adhoc', title: 'Pâtes', notes: 'x', url: 'https://a.fr',
    })
  })
  it('construit une référence de recette sauvegardée', () => {
    expect(toRecipeSource({ ...baseForm, mode: 'saved', recipeId: 'r1' })).toEqual({ kind: 'saved', recipeId: 'r1' })
    expect(() => toRecipeSource({ ...baseForm, mode: 'saved' })).toThrow()
  })
})

describe('slotKey / parseSlotKey', () => {
  it('fait l’aller-retour', () => {
    const key = slotKey({ date: '2026-10-20', slot: 'DINNER' })
    expect(key).toBe('2026-10-20|DINNER')
    expect(parseSlotKey(key)).toEqual({ date: '2026-10-20', slot: 'DINNER' })
  })
  it('refuse les clés invalides', () => {
    expect(parseSlotKey('2026-10-20|BRUNCH')).toBeNull()
    expect(parseSlotKey('hier|LUNCH')).toBeNull()
    expect(parseSlotKey('2026-10-20|LUNCH|x')).toBeNull()
    expect(parseSlotKey('')).toBeNull()
  })
})

describe('regroupement et comptage', () => {
  const meals = [meal('a', '2026-10-20', 'LUNCH'), meal('b', '2026-10-20', 'LUNCH'), meal('c', '2026-10-21', 'DINNER')]

  it('regroupe par créneau en gardant l’ordre', () => {
    const groups = groupMealsBySlot(meals)
    expect(groups.get('2026-10-20|LUNCH')?.map((m) => m.id)).toEqual(['a', 'b'])
    expect(groups.get('2026-10-21|DINNER')?.map((m) => m.id)).toEqual(['c'])
    expect(groups.get('2026-10-20|DINNER')).toBeUndefined()
  })

  it('compte les repas d’un jour et formate le libellé', () => {
    expect(countMealsOnDay(meals, '2026-10-20')).toBe(2)
    expect(countMealsOnDay(meals, '2026-10-22')).toBe(0)
    expect(mealCountLabel(0)).toBe('Aucun repas')
    expect(mealCountLabel(1)).toBe('1 repas')
    expect(mealCountLabel(3)).toBe('3 repas')
  })
})

describe('isMoveNeeded', () => {
  it('ignore un dépôt sur le même créneau', () => {
    const m = meal('a', '2026-10-20', 'LUNCH')
    expect(isMoveNeeded(m, { date: '2026-10-20', slot: 'LUNCH' })).toBe(false)
    expect(isMoveNeeded(m, { date: '2026-10-20', slot: 'DINNER' })).toBe(true)
    expect(isMoveNeeded(m, { date: '2026-10-21', slot: 'LUNCH' })).toBe(true)
  })
})

describe('dropTarget', () => {
  it('lit la zone de dépôt', () => {
    expect(dropTarget('slot:2026-10-20|LUNCH')).toEqual({ date: '2026-10-20', slot: 'LUNCH' })
    expect(dropTarget('slot:nimporte')).toBeNull()
    expect(dropTarget('move:abc')).toBeNull()
    expect(dropTarget(undefined)).toBeNull()
    expect(dropTarget(42)).toBeNull()
  })
})
