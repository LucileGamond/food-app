import { axeFor } from './support/a11y'
import { createAppClient } from '../src/api/client'
import { createUsageRecorder } from '../supabase/functions/_shared/usage'
import { LOCAL_SERVICE_KEY, LOCAL_URL } from '../tests/integration/helpers'
import { ERIC, expect, login, test } from './fixtures'

const admin = createAppClient(LOCAL_URL, LOCAL_SERVICE_KEY, { persistSession: false })

test('affiche la consommation IA du foyer dans les réglages', async ({ page }) => {
  await admin.from('llm_usage').delete().gte('id', 0)
  const record = createUsageRecorder(LOCAL_URL, LOCAL_SERVICE_KEY, 'knit-pattern', fetch)
  await record({ user_id: ERIC.id, mode: 'ideas', ok: true, model: 'claude-haiku-5-5', requests: 1, input_tokens: 2_000_000, output_tokens: 10_000, cache_creation_tokens: 0, cache_read_tokens: 0, web_searches: 4, cost_usd: 0.245 })

  await login(page)
  await page.getByRole('link', { name: 'Réglages' }).filter({ visible: true }).click()
  const section = page.getByRole('region', { name: 'Consommation IA' })
  const household = section.getByRole('group', { name: 'Foyer' })
  await expect(household).toContainText('1 appel')
  await expect(household).toContainText('2 M en entrée')
  await expect(household).toContainText('0,21 €')
  await expect(section.getByRole('list', { name: 'Par fonctionnalité' })).toContainText('Idées de modèles')
  await expect(section.getByRole('list', { name: 'Par personne' })).toContainText('Eric')

  await section.getByLabel('Période').selectOption({ label: 'Le mois dernier' })
  await expect(section.getByText('Aucun appel sur cette période.')).toBeVisible()

  const results = await (await axeFor(page)).include('#section-conso-ia').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
  await admin.from('llm_usage').delete().gte('id', 0)
})

test('règle le budget IA du mois et saisit une recharge Anthropic', async ({ page }) => {
  await admin.from('llm_usage').delete().gte('id', 0)
  await admin.from('llm_credits').delete().gte('amount_usd', 0)
  await admin.from('llm_budget').delete().eq('id', true)
  const record = createUsageRecorder(LOCAL_URL, LOCAL_SERVICE_KEY, 'knit-pattern', fetch)
  await record({ user_id: ERIC.id, mode: 'ideas', ok: true, model: 'claude-haiku-5-5', requests: 1, input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0, web_searches: 0, cost_usd: 2.5 })

  await login(page)
  await page.getByRole('link', { name: 'Réglages' }).filter({ visible: true }).click()
  const section = page.getByRole('region', { name: 'Consommation IA' })

  const budget = section.getByRole('group', { name: 'Budget du mois' })
  await expect(budget).toContainText('Pas de budget')
  await budget.getByLabel('Budget mensuel (€)').fill('5')
  await budget.getByRole('button', { name: 'Enregistrer le budget' }).click()
  await expect(section.getByRole('group', { name: 'Budget du mois' })).toContainText('2,15 € sur 5,00 €')
  await expect(section.getByRole('progressbar', { name: 'Part du budget dépensée' })).toHaveAttribute('aria-valuenow', '43')

  const credit = section.getByRole('group', { name: 'Crédit Anthropic' })
  await expect(credit).toContainText('Aucune recharge saisie')
  await credit.getByLabel('Montant ($)').fill('10')
  await credit.getByLabel('Note (facultatif)').fill('Première recharge')
  await credit.getByRole('button', { name: 'Ajouter la recharge' }).click()
  await expect(credit.getByRole('list', { name: 'Recharges' })).toContainText('Première recharge')
  await expect(credit).toContainText('7,50 $')

  const results = await (await axeFor(page)).include('#section-conso-ia').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
  await admin.from('llm_usage').delete().gte('id', 0)
  await admin.from('llm_credits').delete().gte('amount_usd', 0)
  await admin.from('llm_budget').delete().eq('id', true)
})
