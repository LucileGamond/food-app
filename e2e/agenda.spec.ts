import { axeFor } from './support/a11y'
import type { Page } from '@playwright/test'
import { createAppClient } from '../src/api/client'
import { LOCAL_SERVICE_KEY, LOCAL_URL } from '../tests/integration/helpers'
import { ERIC, expect, login, openNavPage, test } from './fixtures'

const admin = createAppClient(LOCAL_URL, LOCAL_SERVICE_KEY, { persistSession: false })
const SECRET_URL = 'https://calendar.google.com/calendar/ical/lucile%40gmail.com/private-abc/basic.ics'

/** Jour du foyer (Paris), « YYYY-MM-DD ». */
const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** Rendez-vous d'aujourd'hui, en milieu de journée (même jour à Paris quelle que soit l'heure d'été). */
const midday = (title: string, hourUtc: number, description: string | null = null) => ({ uid: title, title, location: null, description, allDay: false, startsAt: `${parisToday()}T${String(hourUtc).padStart(2, '0')}:00:00Z`, endsAt: `${parisToday()}T${String(hourUtc + 1).padStart(2, '0')}:00:00Z` })

async function replaceEvents(sourceId: string, events: unknown[]) {
  const { error } = await admin.rpc('replace_calendar_events', { p_source_id: sourceId, p_events: events as never })
  if (error) throw error
}

/** Synchronisation simulée (sync-calendars n'est pas servie en local) : chaque nouvelle source reçoit `events`. */
async function fakeSync(page: Page, events: unknown[]) {
  await page.route('**/functions/v1/sync-calendars', async (route) => {
    const { data } = await admin.from('calendar_sources').select('id').is('last_synced_at', null)
    for (const source of data ?? []) await replaceEvents(source.id, events)
    await route.fulfill({ json: { synced: data?.length ?? 0, failed: 0 } })
  })
}

/** Agenda d'Eric, déjà synchronisé, avec un rendez-vous aujourd'hui. */
async function seedEricCalendar() {
  const { data, error } = await admin.from('calendar_sources').insert({ owner_id: ERIC.id, provider: 'ical', name: 'Travail' }).select('id').single()
  if (error) throw error
  await replaceEvents(data.id, [midday('Réunion d’équipe', 13)])
}

/** Page Agenda activée dans les réglages (masquée par défaut), puis ouverte depuis la navigation. */
async function openAgenda(page: Page) {
  await page.getByRole('link', { name: 'Réglages' }).filter({ visible: true }).click()
  await page.getByRole('checkbox', { name: 'Agenda' }).first().click()
  await openNavPage(page, 'Agenda')
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
}

test('suivre son agenda Google, voir aussi celui d’Eric, choisir les agendas affichés', async ({ page }) => {
  await seedEricCalendar()
  await fakeSync(page, [midday('Dentiste', 9, 'Pense à la carte Vitale'), { uid: 'conge', title: 'Congé', location: null, allDay: true, startDate: parisToday(), endDate: '2999-01-01' }])
  await login(page)
  await openAgenda(page)

  // Ajouter son agenda par l'adresse secrète iCal
  await page.getByRole('link', { name: 'Agendas suivis' }).click()
  await expect(page.getByRole('list', { name: 'Agendas suivis' })).toContainText('Travail · Eric')
  await page.getByLabel('Nom').fill('Perso')
  await page.getByLabel('Adresse secrète au format iCal').fill('https://calendar.google.com/calendar/embed?src=lucile')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('adresse secrète au format iCal')
  await page.getByLabel('Adresse secrète au format iCal').fill(SECRET_URL)
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Agenda « Perso » ajouté')).toBeVisible()
  const perso = page.getByRole('list', { name: 'Agendas suivis' }).getByRole('listitem').filter({ hasText: 'Perso' })
  await expect(perso).toContainText(/Synchronisé à \d+ h/)

  // La semaine : mes rendez-vous et ceux d'Eric
  await page.getByRole('link', { name: 'Agenda', exact: true }).filter({ visible: true }).first().click()
  const today = page.getByRole('region', { name: /aujourd’hui/ })
  await expect(today.getByText('Dentiste')).toBeVisible()
  await expect(today.getByText('Congé')).toBeVisible()
  await expect(today.getByText('Réunion d’équipe')).toBeVisible()
  await expect(today.getByText('Eric', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: 'Moi' }).click()
  await expect(today.getByText('Réunion d’équipe')).toBeHidden()
  await expect(today.getByText('Dentiste')).toBeVisible()

  // Détail d'un rendez-vous
  await today.getByRole('button', { name: /Dentiste/ }).click()
  const details = page.getByRole('dialog', { name: 'Dentiste' })
  await expect(details).toContainText('Perso · moi')
  await expect(details).toContainText('Pense à la carte Vitale')
  await page.keyboard.press('Escape')
  await expect(details).toBeHidden()

  // Vue du mois : la grille, puis le jour choisi
  await page.getByRole('tab', { name: 'Mois' }).click()
  const grid = page.getByRole('group', { name: /\d{4}$/ })
  await expect(grid.getByRole('button', { pressed: true })).toHaveAccessibleName(/2 rendez-vous/)
  await expect(page.getByRole('region', { name: /aujourd’hui/ }).getByText('Dentiste')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Mois', selected: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Semaine' }).click()

  // Accueil : les rendez-vous du jour, avec le même choix
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Rendez-vous' })
  await expect(card.getByRole('radio', { name: 'Moi' })).toHaveAttribute('aria-checked', 'true')
  await expect(card.getByText('Dentiste')).toBeVisible()
  await expect(card.getByText('Réunion d’équipe')).toBeHidden()
  await card.getByRole('radio', { name: 'Eric' }).click()
  await expect(card.getByText('Réunion d’équipe')).toBeVisible()
  await expect(card.getByText('Dentiste')).toBeHidden()
})

test('ne plus suivre son agenda ; celui d’Eric ne peut pas être retiré', async ({ page }) => {
  await seedEricCalendar()
  await fakeSync(page, [midday('Dentiste', 9)])
  await login(page)
  await openAgenda(page)
  await page.goto('/agenda/sources')
  await page.getByLabel('Adresse secrète au format iCal').fill(SECRET_URL)
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  const list = page.getByRole('list', { name: 'Agendas suivis' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list.getByRole('button', { name: 'Ne plus suivre Travail' })).toHaveCount(0)

  await list.getByRole('button', { name: 'Ne plus suivre Mon agenda' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ne plus suivre' }).click()
  await expect(page.getByText('Agenda « Mon agenda » supprimé')).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await page.goto('/agenda')
  await expect(page.getByRole('region', { name: /aujourd’hui/ }).getByText('Dentiste')).toBeHidden()
})

test('accessibilité des écrans de l’agenda', async ({ page }) => {
  await seedEricCalendar()
  await login(page)
  await openAgenda(page)
  for (const path of ['/agenda', '/agenda/sources', '/']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Réunion d’équipe').or(page.getByText('Travail · Eric')).first()).toBeVisible()
    const results = await (await axeFor(page)).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
})
