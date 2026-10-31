import { addMinute, androidTimerUrl, isAndroid, findDurations, formatClock, formatTimerDuration, isRinging, parseTimers, pauseTimer, remainingMs, resumeTimer, startTimer } from './timers'

describe('durées dans les étapes', () => {
  it.each([
    ['Cuire 20 min.', '20 min', 1200],
    ['Laisser reposer 2 heures', '2 heures', 7200],
    ['Enfourner pour 1 h 30', '1 h 30', 5400],
    ['Compter 1h30 de cuisson', '1h30', 5400],
    ['Mijoter 2 heures et 15 minutes', '2 heures et 15 minutes', 8100],
    ['Cuire 20 à 25 min', '20 à 25 min', 1200],
    ['Cuire 10-12 minutes', '10-12 minutes', 600],
    ['Fouetter 30 secondes', '30 secondes', 30],
    ['Bake for 45 mins', '45 mins', 2700],
    ['Simmer 1 hour', '1 hour', 3600],
    ['Cuire 1,5 h', '1,5 h', 5400],
    ['Cuire 3 mn', '3 mn', 180],
  ])('repère « %s »', (text, found, seconds) => {
    expect(findDurations(text)).toEqual([{ start: text.indexOf(found), end: text.indexOf(found) + found.length, text: found, seconds }])
  })

  it('repère plusieurs durées', () => {
    expect(findDurations('Cuire 10 min, retourner, puis 5 min.').map((d) => d.seconds)).toEqual([600, 300])
  })

  it('ignore ce qui n’est pas une durée', () => {
    expect(findDurations('Ajouter 200 g de farine et 3 œufs à 180 °C')).toEqual([])
    expect(findDurations('Couper en dés de 5 mm, 2 hommes')).toEqual([])
    expect(findDurations('Mariner 48 h')).toEqual([])
    expect(findDurations('Cuire 0 min')).toEqual([])
  })
})

describe('minuteur', () => {
  const t0 = 1_000_000

  it('décompte puis sonne', () => {
    const timer = startTimer('a', 'Étape 1', 60, t0)
    expect(remainingMs(timer, t0 + 15_000)).toBe(45_000)
    expect(isRinging(timer, t0 + 59_999)).toBe(false)
    expect(isRinging(timer, t0 + 60_000)).toBe(true)
    expect(remainingMs(timer, t0 + 90_000)).toBe(0)
  })

  it('se met en pause et reprend', () => {
    const paused = pauseTimer(startTimer('a', 'x', 60, t0), t0 + 20_000)
    expect(paused).toMatchObject({ endsAt: null, remaining: 40_000 })
    expect(remainingMs(paused, t0 + 500_000)).toBe(40_000)
    expect(isRinging(paused, t0 + 500_000)).toBe(false)
    expect(pauseTimer(paused, t0)).toBe(paused)
    const resumed = resumeTimer(paused, t0 + 100_000)
    expect(resumed.endsAt).toBe(t0 + 140_000)
    expect(resumeTimer(resumed, t0)).toBe(resumed)
  })

  it('ajoute une minute', () => {
    const timer = startTimer('a', 'x', 60, t0)
    expect(addMinute(timer, t0).endsAt).toBe(t0 + 120_000)
    // Déjà en train de sonner : repart pour une minute à partir de maintenant.
    expect(addMinute(timer, t0 + 300_000).endsAt).toBe(t0 + 360_000)
    expect(addMinute(pauseTimer(timer, t0 + 30_000), t0).remaining).toBe(90_000)
  })

  it('affiche le temps restant', () => {
    expect(formatClock(245_000)).toBe('4:05')
    expect(formatClock(3_750_000)).toBe('1:02:30')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(0)).toBe('0:00')
    expect(formatTimerDuration(1200)).toBe('20 min')
    expect(formatTimerDuration(5400)).toBe('1 h 30')
    expect(formatTimerDuration(7200)).toBe('2 h')
    expect(formatTimerDuration(90)).toBe('1 min 30 s')
    expect(formatTimerDuration(45)).toBe('45 s')
  })

  it('relit les minuteurs enregistrés', () => {
    const timer = startTimer('a', 'x', 60, t0)
    expect(parseTimers(JSON.stringify([timer, { id: 1 }, null]))).toEqual([timer])
    expect(parseTimers('{"a":1}')).toEqual([])
    expect(parseTimers('pas du json')).toEqual([])
    expect(parseTimers(null)).toEqual([])
  })
})

describe('minuteur du téléphone (Android)', () => {
  it('reconnaît Android', () => {
    expect(isAndroid('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile')).toBe(true)
    expect(isAndroid('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false)
    expect(isAndroid('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0')).toBe(false)
  })

  it('lance le minuteur de l’Horloge avec la durée restante et le nom', () => {
    expect(androidTimerUrl(1199.4, 'Étape 3 · 20 min')).toBe(
      'intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=1199;' +
        'S.android.intent.extra.alarm.MESSAGE=%C3%89tape%203%20%C2%B7%2020%20min;B.android.intent.extra.alarm.SKIP_UI=false;end',
    )
    expect(androidTimerUrl(0.2, 'a;b')).toContain('LENGTH=1;S.android.intent.extra.alarm.MESSAGE=a%3Bb;')
  })
})
