import { describe, expect, it } from 'vitest'
import type { Meal } from './meals'
import {
  dayLog,
  isComplete,
  logRangeStart,
  missingDays,
  planSuggestions,
  streak,
  vegetarianShare,
  weekStart,
  weeklyStats,
  type LogKind,
  type LogSlot,
  type MealLogEntry,
} from './mealLog'
import { guessRecipeVegetarian } from './recipeList'

const ME = 'me'
const OTHER = 'other'

function entry(eaten_on: string, slot: LogSlot, kind: LogKind = 'vegetarian', profile_id = ME): MealLogEntry {
  return { profile_id, eaten_on, slot, kind }
}

function fullDay(day: string, kinds: [LogKind, LogKind, LogKind] = ['vegetarian', 'meat', 'vegetarian'], profile = ME): MealLogEntry[] {
  return [entry(day, 'BREAKFAST', kinds[0], profile), entry(day, 'LUNCH', kinds[1], profile), entry(day, 'DINNER', kinds[2], profile)]
}

function meal(date: string, slot: 'LUNCH' | 'DINNER', title: string, tags: string[] = [], people = [ME]): Meal {
  return { id: `${date}-${slot}-${title}`, meal_date: date, slot, people, recipe: { id: title, is_saved: true, title, notes: null, url: null, tags } }
}

describe('guessRecipeVegetarian', () => {
  it.each([
    [{ tags: ['Végé'], title: 'Curry' }, true],
    [{ tags: ['végétarienne'], title: 'Poulet ou tofu' }, true],
    [{ tags: ['Viande'], title: 'Gratin' }, false],
    [{ tags: [], title: 'Poulet basquaise' }, false],
    [{ tags: [], title: 'Saumon aux poireaux' }, false],
    [{ tags: [], title: 'Pâtes au thon' }, false],
    [{ tags: [], title: 'Quiche aux lardons' }, false],
    [{ tags: [], title: 'Bœuf bourguignon' }, false],
    [{ tags: [], title: 'Curry de lentilles' }, null],
    [{ tags: [], title: 'Barbecue de légumes' }, null],
    [{ tags: ['rapide'], title: 'Salade composée' }, null],
  ])('%o → %s', (recipe, expected) => {
    expect(guessRecipeVegetarian(recipe)).toBe(expected)
  })
})

describe('dayLog et isComplete', () => {
  it('ne garde que la personne et le jour demandés', () => {
    const entries = [entry('2026-11-16', 'LUNCH', 'meat'), entry('2026-11-16', 'DINNER', 'vegetarian', OTHER), entry('2026-11-15', 'DINNER')]
    expect(dayLog(entries, ME, '2026-11-16')).toEqual({ LUNCH: 'meat' })
  })

  it('complet seulement avec les trois moments, « pas de repas » compris', () => {
    expect(isComplete({ BREAKFAST: 'skipped', LUNCH: 'meat', DINNER: 'vegetarian' })).toBe(true)
    expect(isComplete({ LUNCH: 'meat', DINNER: 'vegetarian' })).toBe(false)
    expect(isComplete({})).toBe(false)
  })
})

describe('planSuggestions', () => {
  it('suggère midi et soir d’après les recettes prévues pour la personne', () => {
    const meals = [meal('2026-11-16', 'LUNCH', 'Poulet basquaise'), meal('2026-11-16', 'DINNER', 'Dahl', ['végé'])]
    expect(planSuggestions(meals, ME, '2026-11-16')).toEqual({ LUNCH: 'meat', DINNER: 'vegetarian' })
  })

  it('ignore les autres jours, les repas des autres et les recettes indécidables', () => {
    const meals = [
      meal('2026-11-15', 'LUNCH', 'Poulet'),
      meal('2026-11-16', 'LUNCH', 'Steak frites', [], [OTHER]),
      meal('2026-11-16', 'DINNER', 'Salade composée'),
    ]
    expect(planSuggestions(meals, ME, '2026-11-16')).toEqual({})
  })

  it('deux plats au même repas : végé seulement si les deux le sont', () => {
    const both = [meal('2026-11-16', 'LUNCH', 'Dahl', ['végé']), meal('2026-11-16', 'LUNCH', 'Taboulé', ['vegan'])]
    const mixed = [meal('2026-11-16', 'LUNCH', 'Dahl', ['végé']), meal('2026-11-16', 'LUNCH', 'Saumon')]
    const unknown = [meal('2026-11-16', 'LUNCH', 'Dahl', ['végé']), meal('2026-11-16', 'LUNCH', 'Salade')]
    expect(planSuggestions(both, ME, '2026-11-16')).toEqual({ LUNCH: 'vegetarian' })
    expect(planSuggestions(mixed, ME, '2026-11-16')).toEqual({ LUNCH: 'meat' })
    expect(planSuggestions(unknown, ME, '2026-11-16')).toEqual({})
  })
})

describe('missingDays', () => {
  const today = '2026-11-16'

  it('rien noté : aujourd’hui seulement, et seulement le soir', () => {
    expect(missingDays([], ME, today, 20)).toEqual([])
    expect(missingDays([], ME, today, 21)).toEqual([today])
  })

  it('jours passés incomplets depuis le premier jour noté, du plus récent au plus ancien', () => {
    const entries = [...fullDay('2026-11-12'), entry('2026-11-13', 'LUNCH'), ...fullDay('2026-11-15')]
    expect(missingDays(entries, ME, today, 9)).toEqual(['2026-11-14', '2026-11-13'])
  })

  it('aujourd’hui complet : pas compté, même le soir', () => {
    expect(missingDays([...fullDay('2026-11-15'), ...fullDay(today)], ME, today, 23)).toEqual([])
  })

  it('ne remonte pas au-delà de 7 jours', () => {
    const entries = fullDay('2026-11-01')
    expect(missingDays(entries, ME, today, 9)).toEqual(['2026-11-15', '2026-11-14', '2026-11-13', '2026-11-12', '2026-11-11', '2026-11-10', '2026-11-09'])
  })

  it('les réponses de l’autre ne comptent pas', () => {
    expect(missingDays(fullDay('2026-11-15', undefined, OTHER), ME, today, 9)).toEqual([])
  })
})

describe('streak', () => {
  const today = '2026-11-16'

  it('compte les jours complets d’affilée jusqu’à hier tant qu’aujourd’hui n’est pas fini', () => {
    const entries = [...fullDay('2026-11-13'), ...fullDay('2026-11-14'), ...fullDay('2026-11-15'), entry(today, 'BREAKFAST')]
    expect(streak(entries, ME, today)).toBe(3)
  })

  it('inclut aujourd’hui une fois complet', () => {
    expect(streak([...fullDay('2026-11-15'), ...fullDay(today)], ME, today)).toBe(2)
  })

  it('un trou casse la série ; rien noté : zéro', () => {
    expect(streak([...fullDay('2026-11-13'), ...fullDay('2026-11-15')], ME, today)).toBe(1)
    expect(streak([...fullDay('2026-11-14')], ME, today)).toBe(0)
    expect(streak([], ME, today)).toBe(0)
  })
})

describe('statistiques', () => {
  it('weekStart : lundi de la semaine, dimanche compris', () => {
    expect(weekStart('2026-11-16')).toBe('2026-11-16') // lundi
    expect(weekStart('2026-11-22')).toBe('2026-11-16') // dimanche
    expect(weekStart('2026-11-01')).toBe('2026-10-26')
  })

  it('weeklyStats : 8 semaines, la plus ancienne d’abord, sans les « pas de repas » ni les autres', () => {
    const entries = [
      ...fullDay('2026-11-16', ['skipped', 'meat', 'vegetarian']),
      ...fullDay('2026-11-10', ['vegetarian', 'vegetarian', 'vegetarian']),
      ...fullDay('2026-11-10', ['meat', 'meat', 'meat'], OTHER),
      entry('2026-09-01', 'LUNCH'), // trop ancien
    ]
    const stats = weeklyStats(entries, ME, '2026-11-17')
    expect(stats).toHaveLength(8)
    expect(stats[0]!.week).toBe('2026-09-28')
    expect(stats.at(-1)).toEqual({ week: '2026-11-16', vegetarian: 1, meat: 1 })
    expect(stats.at(-2)).toEqual({ week: '2026-11-09', vegetarian: 3, meat: 0 })
    expect(stats.slice(0, 6).every((s) => s.vegetarian + s.meat === 0)).toBe(true)
  })

  it('weeklyStats ignore les jours à venir', () => {
    expect(weeklyStats([entry('2026-11-18', 'LUNCH')], ME, '2026-11-17', 1)).toEqual([{ week: '2026-11-16', vegetarian: 0, meat: 0 }])
  })

  it('vegetarianShare', () => {
    expect(vegetarianShare({ vegetarian: 0, meat: 0 })).toBeNull()
    expect(vegetarianShare({ vegetarian: 2, meat: 1 })).toBe(67)
    expect(vegetarianShare({ vegetarian: 5, meat: 0 })).toBe(100)
  })

  it('logRangeStart : lundi de la première semaine des stats', () => {
    expect(logRangeStart('2026-11-17')).toBe('2026-09-28')
  })
})
