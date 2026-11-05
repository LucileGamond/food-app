import { activeTopics, DEFAULT_SETTINGS, describeTopics, homePath, isPageEnabled, pageOf, parseGoalLiters, toggleNotification, togglePage } from './settings'

describe('réglages', () => {
  it('désactive le suivi d’hydratation par défaut, le reste est affiché', () => {
    expect(isPageEnabled(DEFAULT_SETTINGS, 'hydratation')).toBe(false)
    expect(isPageEnabled(DEFAULT_SETTINGS, 'courses')).toBe(true)
  })

  it('retrouve la page d’une adresse', () => {
    expect(pageOf('/courses')).toBe('courses')
    expect(pageOf('/courses/123')).toBe('courses')
    expect(pageOf('/plan/modifier')).toBe('plan')
    expect(pageOf('/planning')).toBe('planning')
    expect(pageOf('/reglages')).toBeNull()
    expect(pageOf('/partage')).toBeNull()
  })

  it('choisit la première page affichée comme accueil', () => {
    expect(homePath(DEFAULT_SETTINGS)).toBe('/planning')
    expect(homePath({ ...DEFAULT_SETTINGS, disabledPages: ['planning', 'recettes'] })).toBe('/plan')
    expect(homePath({ ...DEFAULT_SETTINGS, disabledPages: ['planning', 'recettes', 'plan', 'courses', 'poids', 'hydratation', 'tricot', 'plantes'] })).toBe('/reglages')
  })

  it('active et désactive pages et notifications', () => {
    expect(togglePage(DEFAULT_SETTINGS, 'hydratation', true)).toEqual({ disabledPages: ['tricot', 'plantes'] })
    expect(togglePage(DEFAULT_SETTINGS, 'poids', false)).toEqual({ disabledPages: ['hydratation', 'tricot', 'plantes', 'poids'] })
    expect(toggleNotification(DEFAULT_SETTINGS, 'courses', false)).toEqual({ mutedNotifications: ['courses'] })
    expect(toggleNotification({ ...DEFAULT_SETTINGS, mutedNotifications: ['courses'] }, 'courses', true)).toEqual({ mutedNotifications: [] })
  })

  it('liste les notifications qu’on recevra', () => {
    expect(activeTopics(DEFAULT_SETTINGS).map((t) => t.key)).toEqual(['courses'])
    const all = activeTopics({ ...DEFAULT_SETTINGS, disabledPages: [] })
    expect(describeTopics(all)).toBe('listes de courses modifiées par l’autre, rappels pour boire et plantes à arroser')
    expect(activeTopics({ ...DEFAULT_SETTINGS, disabledPages: [], mutedNotifications: ['courses'] }).map((t) => t.key)).toEqual(['hydratation', 'plantes'])
    expect(describeTopics([])).toBe('')
  })

  it('lit l’objectif en litres', () => {
    expect(parseGoalLiters('1,5')).toBe(1500)
    expect(parseGoalLiters(' 2 ')).toBe(2000)
    expect(parseGoalLiters('0.75')).toBe(750)
    expect(parseGoalLiters('0,2')).toBeNull()
    expect(parseGoalLiters('6')).toBeNull()
    expect(parseGoalLiters('')).toBeNull()
    expect(parseGoalLiters('beaucoup')).toBeNull()
  })
})
