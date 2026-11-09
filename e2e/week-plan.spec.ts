import { axeFor } from './support/a11y'
import { createAppClient } from '../src/api/client'
import { LOCAL_SERVICE_KEY, LOCAL_URL, signedInApi } from '../tests/integration/helpers'
import { ERIC, LUCILE, dayLabel, expect, login, test } from './fixtures'

const admin = createAppClient(LOCAL_URL, LOCAL_SERVICE_KEY, { persistSession: false })

/** Jour du foyer (Paris) dans `offset` jours, « YYYY-MM-DD ». */
function parisDay(offset: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * 86_400_000))
}

/** Eric dîne dehors demain soir (20 h – 23 h à Paris en hiver, 21 h – minuit en été : le dîner est couvert). */
async function seedEricDinnerOut() {
  const { data, error } = await admin.from('calendar_sources').insert({ owner_id: ERIC.id, provider: 'ical', name: 'Perso' }).select('id').single()
  if (error) throw error
  const day = parisDay(1)
  const events = [{ uid: 'cine', title: 'Ciné', location: null, description: null, allDay: false, startsAt: `${day}T19:00:00Z`, endsAt: `${day}T22:00:00Z` }]
  const { error: replaceError } = await admin.rpc('replace_calendar_events', { p_source_id: data.id, p_events: events as never })
  if (replaceError) throw replaceError
}

test('planifier la semaine : qui mange à la maison, proposition de l’IA, repas créés avec qui cuisine', async ({ page, isMobile }) => {
  await seedEricDinnerOut()
  const { api } = await signedInApi()
  await api.inbox.addItem({ title: 'Lasagnes' })
  await api.inbox.addItem({ title: 'Salade de saumon' })

  // Réponse simulée : aucun appel réel au modèle.
  let sent: { slots: { key: string; people: string[]; freeCooks: string[] }[]; dishes: { id: string; title: string; fragile: boolean }[] } | null = null
  await page.route('**/functions/v1/plan-week', async (route) => {
    sent = route.request().postDataJSON()
    const dish = (title: string) => sent!.dishes.find((d) => d.title === title)!.id
    const [first, second] = sent!.slots
    await route.fulfill({
      json: {
        meals: [
          { slot: first!.key, dishId: dish('Salade de saumon'), cookId: first!.people[0], why: 'Saumon à manger vite' },
          { slot: second!.key, dishId: dish('Lasagnes'), cookId: second!.people[0], why: 'Du temps pour cuisiner' },
        ],
      },
    })
  })

  await login(page)

  // Ma règle : midi en semaine au travail, l'escalade ne compte pas.
  await page.getByRole('link', { name: 'Réglages' }).filter({ visible: true }).click()
  await page.getByRole('checkbox', { name: 'Le midi en semaine, je mange au travail' }).click()
  await page.getByRole('textbox', { name: 'Rendez-vous qui ne m’empêchent pas de manger à la maison' }).fill('escalade')
  await page.getByRole('button', { name: 'Enregistrer mes règles' }).click()
  await expect(page.getByText('Règles des repas enregistrées')).toBeVisible()

  await page.goto('/planning')
  await page.getByRole('button', { name: 'Planifier la semaine' }).click()
  await expect(page.getByRole('heading', { name: 'Planifier la semaine' })).toBeVisible()
  await expect(page.getByText(/^2 plats à planifier/)).toBeVisible()

  // Eric dîne dehors demain : décoché, avec la raison.
  const tomorrowDinner = page.getByRole('group', { name: `${dayLabel(1)} — Soir` })
  await expect(tomorrowDinner.getByRole('button', { name: 'Eric' })).toHaveAttribute('aria-pressed', 'false')
  await expect(tomorrowDinner.getByText(/^Eric : .*Ciné$/)).toBeVisible()
  // Corrigé à la main : Lucile ne dîne pas là ce soir.
  const tonight = page.getByRole('group', { name: `${dayLabel(0)} — Soir` })
  await tonight.getByRole('button', { name: 'Lucile' }).click()
  await expect(tonight.getByRole('button', { name: 'Lucile' })).toHaveAttribute('aria-pressed', 'false')

  const presence = await (await axeFor(page)).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(presence.violations.map((v) => v.id)).toEqual([])
  await page.screenshot({ path: `test-results/layout/semaine-presence-${test.info().project.name}.png`, fullPage: true })

  await page.getByRole('button', { name: 'Proposer avec l’IA' }).click()
  await expect(page.getByRole('button', { name: 'Valider la semaine' })).toBeEnabled()
  expect(sent!.slots.find((s) => s.key === `${parisDay(0)}|DINNER`)?.people ?? []).not.toContain(LUCILE.id)
  expect(sent!.slots.find((s) => s.key === `${parisDay(1)}|DINNER`)?.people ?? []).not.toContain(ERIC.id)
  expect(sent!.dishes.find((d) => d.title === 'Salade de saumon')?.fragile).toBe(true)

  // Le premier plat proposé : modifiable (qui cuisine).
  const firstKey = sent!.slots[0]!.key
  const [date, mealSlot] = firstKey.split('|') as [string, 'LUNCH' | 'DINNER']
  const offset = Math.round((Date.parse(date) - Date.parse(parisDay(0))) / 86_400_000)
  const first = page.getByRole('group', { name: `${dayLabel(offset)} — ${mealSlot === 'LUNCH' ? 'Midi' : 'Soir'}` })
  await expect(first.getByRole('combobox', { name: 'Plat' })).toHaveValue(/.+/)
  await expect(first.getByText('Saumon à manger vite')).toBeVisible()
  await first.getByRole('combobox', { name: 'Qui cuisine' }).selectOption({ label: 'Personne (restes)' })

  const draft = await (await axeFor(page)).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(draft.violations.map((v) => v.id)).toEqual([])
  await page.screenshot({ path: `test-results/layout/semaine-proposition-${test.info().project.name}.png`, fullPage: true })

  await page.getByRole('button', { name: 'Valider la semaine' }).click()
  await expect(page.getByText('2 repas planifiés')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()
  await expect(page.getByText('Salade de saumon', { exact: true })).toBeVisible()
  await expect(page.getByText('Lasagnes', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/^(Eric|Lucile) cuisine$/).first()).toBeVisible()

  // Plats retirés de « À planifier ».
  expect(await api.inbox.listItems('plan')).toEqual([])
  void isMobile
})
