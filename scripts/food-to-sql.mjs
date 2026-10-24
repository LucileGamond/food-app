#!/usr/bin/env node
// Convertit le Plan.json et les fichiers Consumption-*.json de l'ancienne application FoodTracker
// en SQL à exécuter une fois dans Supabase (SQL Editor).
//
//   node scripts/food-to-sql.mjs [--person Lucile] Plan.json [Consumption-….json …] > food.sql
//
// - Le plan de la personne est remplacé par celui du fichier.
// - Chaque fichier Consumption devient une période (remplacée si elle existe déjà avec les mêmes dates),
//   avec ses quotas figés et ses consommations. L'ancienne application ne suivait pas le sport :
//   les éléments « sport » du plan sont ajoutés aux périodes importées.
// Relancer le script ne crée pas de doublons.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const MEAL_KEYS = {
  petit_dejeuner: 'BREAKFAST',
  dejeuner: 'LUNCH',
  collation_apres_midi: 'SNACK',
  aperitif: 'APERITIF',
  diner: 'DINNER',
  pool_alimentaire: 'POOL',
  sport: 'SPORT',
}

const CATEGORY_LABELS = {
  boisson: 'Boisson',
  produit_laitier: 'Produit laitier',
  aliment_plaisir: 'Aliment plaisir',
  aliment_glucidique: 'Aliment glucidique',
  aliment_protidique: 'Aliment protidique',
  plat_prepare: 'Plat préparé',
  matiere_grasse: 'Matière grasse',
  vegetaux_fruits: 'Végétaux et fruits',
  autres: 'Autres',
}

/** « aliment_glucidique » → « Aliment glucidique » */
export function categoryLabel(key) {
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key]
  const text = key.replace(/_/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** « Éric » → « eric » */
export function personKey(name) {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
}

function parseJson(text) {
  return JSON.parse(text.replace(/^﻿/, ''))
}

function toItem(meal, category, raw, position) {
  const name = typeof raw?.nom === 'string' ? raw.nom.trim() : ''
  const allowed = Number(raw?.allowedOccurrences)
  if (!name || !Number.isInteger(allowed) || allowed < 1 || allowed > 99) return null
  const rawQuantity = meal === 'SPORT' ? raw.duree : raw.quantity
  const quantity = typeof rawQuantity === 'number' && rawQuantity > 0 ? rawQuantity : null
  const unit = typeof raw.unit === 'string' && raw.unit.trim() && quantity !== null ? raw.unit.replace(/_/g, ' ').trim() : null
  const dates = Array.isArray(raw.consumedDates) ? raw.consumedDates.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : []
  return { meal, category, name, quantity, unit, allowed, position, dates }
}

/** Éléments d'un plan (ou d'une période) dans l'ordre du fichier ; un doublon dans un même moment est ignoré. */
export function parseItems(data) {
  const items = []
  const skipped = []
  let position = 0
  for (const [key, meal] of Object.entries(MEAL_KEYS)) {
    const section = data[key]
    if (!section) continue
    const groups = meal === 'SPORT' && Array.isArray(section) ? { sport: section } : section
    for (const [categoryKey, list] of Object.entries(groups)) {
      if (!Array.isArray(list)) continue
      const category = meal === 'SPORT' ? 'Sport' : categoryLabel(categoryKey)
      for (const raw of list) {
        position += 10
        const item = toItem(meal, category, raw, position)
        if (!item) skipped.push(`${key} / ${categoryKey} : ${raw?.nom ?? '?'}`)
        else if (items.some((i) => i.meal === meal && i.name === item.name)) skipped.push(`${key} / ${item.name} (doublon)`)
        else items.push(item)
      }
    }
  }
  return { items, skipped }
}

export function parsePlan(text) {
  const { items, skipped } = parseItems(parseJson(text))
  if (items.length === 0) throw new Error('Le plan ne contient aucun aliment exploitable.')
  return { items: items.map(({ dates: _dates, ...i }) => i), skipped }
}

/** Une période : dates, éléments figés (avec les éléments sport du plan s'ils manquent) et consommations. */
export function parseConsumption(text, planItems = []) {
  const data = parseJson(text)
  const start = data.startDate
  const end = data.endDate
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? '') || end < start) {
    throw new Error('startDate / endDate manquantes ou invalides.')
  }
  const { items, skipped } = parseItems(data)
  for (const sport of planItems.filter((i) => i.meal === 'SPORT')) {
    if (!items.some((i) => i.meal === 'SPORT' && i.name === sport.name)) items.push({ ...sport, dates: [] })
  }
  const outside = []
  for (const item of items) {
    const inside = item.dates.filter((d) => d >= start && d <= end)
    outside.push(...item.dates.filter((d) => d < start || d > end).map((d) => `${item.name} le ${d}`))
    item.dates = inside
  }
  return { start, end, items, skipped, outside }
}

const quote = (s) => `'${s.replace(/'/g, "''")}'`
const sqlValue = (v) => (v === null ? 'null' : typeof v === 'number' ? String(v) : quote(v))
const PROFILE_MATCH = "lower(translate(display_name, 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç', 'AAAEEEEIIOOUUUCaaaeeeeiioouuuc'))"

function itemValues(items) {
  return items.map((i) => `  (${[i.meal, i.category, i.name, i.quantity, i.unit, i.allowed, i.position].map(sqlValue).join(', ')})`).join(',\n')
}

export function foodToSql({ planText, consumptionTexts = [], person = 'Lucile' }) {
  const key = personKey(person)
  const plan = parsePlan(planText)
  const periods = consumptionTexts.map((t) => parseConsumption(t, plan.items))
  const lines = [
    `-- Plan de ${person} : ${plan.items.length} aliments`,
    ...plan.skipped.map((s) => `-- ignoré : ${s}`),
    'begin;',
    `create temp table _person on commit drop as select id from public.profiles where ${PROFILE_MATCH} = ${quote(key)};`,
    'do $$ begin',
    `  if (select count(*) from _person) <> 1 then raise exception 'Profil « ${person.replace(/'/g, "''")} » introuvable'; end if;`,
    'end $$;',
    '',
    'delete from public.food_plan_items where profile_id = (select id from _person);',
    'insert into public.food_plan_items (profile_id, meal, category, name, quantity, unit, allowed_occurrences, position)',
    'select (select id from _person), v.meal::public.food_meal, v.category, v.name, v.quantity::numeric, v.unit::text, v.allowed, v.position',
    'from (values',
    itemValues(plan.items),
    ') as v(meal, category, name, quantity, unit, allowed, position);',
  ]

  for (const period of periods) {
    const consumptions = period.items.flatMap((i) => i.dates.map((d) => [i.meal, i.name, d]))
    lines.push(
      '',
      `-- Période du ${period.start} au ${period.end} : ${period.items.length} aliments, ${consumptions.length} consommations`,
      ...period.skipped.map((s) => `-- ignoré : ${s}`),
      ...period.outside.map((s) => `-- hors période, ignoré : ${s}`),
      `delete from public.food_periods where profile_id = (select id from _person) and start_date = date ${quote(period.start)} and end_date = date ${quote(period.end)};`,
      'with period as (',
      `  insert into public.food_periods (profile_id, start_date, end_date) select id, date ${quote(period.start)}, date ${quote(period.end)} from _person returning id`,
      '), items as (',
      '  insert into public.food_period_items (period_id, meal, category, name, quantity, unit, allowed_occurrences, position)',
      '  select period.id, v.meal::public.food_meal, v.category, v.name, v.quantity::numeric, v.unit::text, v.allowed, v.position',
      '  from period, (values',
      itemValues(period.items).replace(/^ {2}/gm, '    '),
      '  ) as v(meal, category, name, quantity, unit, allowed, position)',
      '  returning id, meal, name',
      ')',
    )
    if (consumptions.length > 0) {
      lines.push(
        'insert into public.food_consumptions (item_id, consumed_on, created_at)',
        "select items.id, c.consumed_on::date, now() + c.seq * interval '1 millisecond'",
        'from items join (values',
        consumptions.map(([meal, name, d], seq) => `  (${quote(meal)}, ${quote(name)}, ${quote(d)}, ${seq})`).join(',\n'),
        ') as c(meal, name, consumed_on, seq) on items.meal = c.meal::public.food_meal and items.name = c.name;',
      )
    } else {
      lines.push('select count(*) from items;')
    }
  }

  lines.push('commit;', '')
  return lines.join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  let person = 'Lucile'
  const personIndex = args.indexOf('--person')
  if (personIndex !== -1) {
    person = args[personIndex + 1] ?? person
    args.splice(personIndex, 2)
  }
  const [planFile, ...consumptionFiles] = args
  if (!planFile) {
    console.error('Usage : node scripts/food-to-sql.mjs [--person Lucile] Plan.json [Consumption-….json …] > food.sql')
    process.exit(1)
  }
  process.stdout.write(
    foodToSql({
      planText: readFileSync(planFile, 'utf8'),
      consumptionTexts: consumptionFiles.map((f) => readFileSync(f, 'utf8')),
      person,
    }),
  )
}
