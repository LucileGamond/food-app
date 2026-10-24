#!/usr/bin/env node
// Convertit le weight.json de l'ancienne application en SQL à exécuter une fois
// dans Supabase (SQL Editor) pour reprendre l'historique des pesées.
//
//   node scripts/weights-to-sql.mjs chemin/vers/weight.json > weights.sql
//
// Les personnes sont retrouvées par leur nom affiché (profiles.display_name, sans tenir
// compte des accents ni de la casse). Relancer le script ne crée pas de doublons :
// une pesée existante (même personne, même jour) est remplacée.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const MIN_KG = 20
const MAX_KG = 300

/** « Éric » → « eric » */
export function personKey(name) {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
}

/** « 14-01-2024 », « 14/01/2024 » ou « 2024-01-14 » → « 2024-01-14 », sinon null. */
export function parseDate(raw) {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  const fr = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text)
  const iso = fr ? `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? iso : null
}

/** Mesures valides, triées et dédoublonnées (la dernière valeur d'une personne pour un jour l'emporte). */
export function parseWeights(text) {
  const data = JSON.parse(text.replace(/^﻿/, ''))
  if (!Array.isArray(data)) throw new Error('Le fichier doit contenir une liste de relevés.')
  const byKey = new Map()
  const rejected = []
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue
    const date = parseDate(item.date)
    if (!date) continue
    for (const [key, value] of Object.entries(item)) {
      if (key === 'date' || value === null || value === undefined || value === '') continue
      const kg = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
      if (!Number.isFinite(kg) || kg < MIN_KG || kg > MAX_KG) {
        rejected.push(`${key} le ${date} : ${value}`)
        continue
      }
      const person = personKey(key)
      byKey.set(`${person}|${date}`, { person, date, kg: Math.round(kg * 10) / 10 })
    }
  }
  const rows = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.person.localeCompare(b.person))
  return { rows, rejected }
}

const quote = (s) => `'${s.replace(/'/g, "''")}'`

export function weightsJsonToSql(text) {
  const { rows, rejected } = parseWeights(text)
  if (rows.length === 0) throw new Error('Aucune pesée exploitable dans le fichier.')
  const values = rows.map((r) => `  (${quote(r.person)}, date ${quote(r.date)}, ${r.kg.toFixed(1)})`).join(',\n')
  const people = [...new Set(rows.map((r) => r.person))]
  return [
    `-- ${rows.length} pesées (${people.map((p) => `${p} : ${rows.filter((r) => r.person === p).length}`).join(', ')})`,
    ...rejected.map((r) => `-- valeur ignorée : ${r}`),
    'begin;',
    'with v(person, measured_on, weight_kg) as (values',
    values,
    ')',
    'insert into public.weight_entries (profile_id, measured_on, weight_kg)',
    'select p.id, v.measured_on, v.weight_kg',
    'from v',
    'join public.profiles p',
    "  on lower(translate(p.display_name, 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç', 'AAAEEEEIIOOUUUCaaaeeeeiioouuuc')) = v.person",
    'on conflict (profile_id, measured_on) do update set weight_kg = excluded.weight_kg;',
    '',
    '-- Vérification : chaque personne du fichier doit avoir été retrouvée',
    `select v.person, count(p.id) as profils_trouves from (values ${people.map((p) => `(${quote(p)})`).join(', ')}) as v(person)`,
    "left join public.profiles p on lower(translate(p.display_name, 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç', 'AAAEEEEIIOOUUUCaaaeeeeiioouuuc')) = v.person",
    'group by v.person;',
    'commit;',
    '',
  ].join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage : node scripts/weights-to-sql.mjs weight.json > weights.sql')
    process.exit(1)
  }
  process.stdout.write(weightsJsonToSql(readFileSync(file, 'utf8')))
}
