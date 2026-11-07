import { createHydrationApi } from '@/api/hydration'
import { createSettingsApi } from '@/api/settings'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import { ERIC, anonClient, resetData, signedInApi, waitFor } from './helpers'

beforeEach(async () => {
  await resetData()
})

describe('settings api', () => {
  it('donne les valeurs par défaut, puis enregistre les réglages de chacun', async () => {
    const lucile = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    expect(await lucile.api.settings.getSettings()).toEqual(DEFAULT_SETTINGS)

    const mine = {
      disabledPages: ['poids' as const],
      mutedNotifications: ['courses' as const],
      hydrationGoalMl: 2000,
      hydrationContainers: [
        { name: 'Gourde', volumeMl: 750 },
        { name: 'Tasse', volumeMl: 250 },
      ],
    }
    await lucile.api.settings.saveSettings(mine)
    expect(await lucile.api.settings.getSettings()).toEqual(mine)
    // Deuxième enregistrement : mise à jour de la même ligne
    await lucile.api.settings.saveSettings({ ...mine, hydrationGoalMl: 1800 })
    expect((await lucile.api.settings.getSettings()).hydrationGoalMl).toBe(1800)
    // Réglages individuels
    expect(await eric.api.settings.getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('refuse des valeurs invalides et l’accès sans connexion', async () => {
    const { api } = await signedInApi()
    await expect(api.settings.saveSettings({ ...DEFAULT_SETTINGS, hydrationGoalMl: 10 })).rejects.toThrow('Certaines valeurs sont invalides.')
    await expect(api.settings.saveSettings({ ...DEFAULT_SETTINGS, hydrationContainers: [{ name: 'Seau', volumeMl: 10_000 }] })).rejects.toThrow('Certaines valeurs sont invalides.')
    await expect(api.settings.saveSettings({ ...DEFAULT_SETTINGS, hydrationContainers: [] })).rejects.toThrow('Certaines valeurs sont invalides.')
    await expect(createSettingsApi(anonClient()).getSettings()).rejects.toThrow()
  })
})

describe('hydration api', () => {
  it('ajoute, liste et supprime les verres de la personne connectée', async () => {
    const lucile = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const since = new Date(Date.now() - 3600_000)

    const small = await lucile.api.hydration.addIntake(200)
    await lucile.api.hydration.addIntake(330)
    expect(small.volume_ml).toBe(200)
    expect((await lucile.api.hydration.listIntakes(since)).map((i) => i.volume_ml)).toEqual([200, 330])
    expect(await lucile.api.hydration.listIntakes(new Date(Date.now() + 60_000))).toEqual([])
    // Chacun ne voit que ses verres
    expect(await eric.api.hydration.listIntakes(since)).toEqual([])

    await lucile.api.hydration.deleteIntake(small.id)
    expect((await lucile.api.hydration.listIntakes(since)).map((i) => i.volume_ml)).toEqual([330])
  })

  it('prévient les autres appareils de la personne d’un verre ajouté', async () => {
    const phone = await signedInApi()
    const computer = await signedInApi()
    let events = 0
    let status = ''
    const unsubscribe = computer.api.hydration.subscribe(
      () => {
        events += 1
      },
      (s) => {
        status = s
      },
    )
    try {
      await waitFor(() => status === 'SUBSCRIBED', 20000)
      // Le serveur temps réel peut être lent juste après un démarrage : on ajoute jusqu'à être notifié.
      const deadline = Date.now() + 30000
      while (events === 0 && Date.now() < deadline) {
        await phone.api.hydration.addIntake(200)
        await waitFor(() => events > 0, 3000).catch(() => undefined)
      }
      expect(events).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  }, 60000)

  it('refuse un volume invalide et l’accès sans connexion', async () => {
    const { api } = await signedInApi()
    await expect(api.hydration.addIntake(0)).rejects.toThrow('Certaines valeurs sont invalides.')
    const anon = createHydrationApi(anonClient())
    await expect(anon.listIntakes(new Date())).rejects.toThrow()
    await expect(anon.addIntake(200)).rejects.toThrow()
    await expect(anon.deleteIntake('00000000-0000-0000-0000-000000000000')).rejects.toThrow()
  })
})
