#!/usr/bin/env node
// Hook PreToolUse : refuse toute commande qui touche la base Supabase locale ou
// les ports partagés sans passer par scripts/with-db-lock.mjs.
//
// Sans ce garde-fou, le verrou se contourne tout seul : il suffit qu'une session
// lance `npx playwright test` ou `npm run test:all:raw` directement.
//
// Branché dans .claude/settings.json sur le matcher "Bash".
// Sortie 0 = la commande passe ; sortie 2 = elle est bloquée et stderr est
// renvoyé à Claude, qui corrige de lui-même.

import { readFileSync } from 'node:fs'

/** Commandes qui prennent la base ou un port partagé. */
const PARTAGE = [
  /\bsupabase\s+(db\s+reset|test\s+db|start|stop)\b/,
  /\bplaywright\s+test\b/,
  /\bnpm\s+run\s+(test:all:raw|test:e2e:raw|test:db:raw|test:integration:raw|db:reset:raw)\b/,
  /\bvitest\b[^|&]*vitest\.integration\.config\.ts/,
  /--port\s+(4173|5173|5180)\b/,
]

/** Ce qui est déjà protégé : le wrapper lui-même, et les scripts npm qui passent par lui. */
const PROTEGE = [
  /with-db-lock/,
  /\bnpm\s+run\s+(test:all|test:e2e|test:db|test:integration|db:reset)\b(?!:raw)/,
]

let entree = ''
try {
  entree = readFileSync(0, 'utf8')
} catch {
  process.exit(0) // pas d'entrée exploitable : on ne bloque rien
}

let charge
try {
  charge = JSON.parse(entree)
} catch {
  process.exit(0)
}

if (charge?.tool_name !== 'Bash') process.exit(0)

const commande = charge?.tool_input?.command
if (typeof commande !== 'string') process.exit(0)

if (PROTEGE.some((r) => r.test(commande))) process.exit(0)
if (!PARTAGE.some((r) => r.test(commande))) process.exit(0)

console.error(
  [
    'Bloqué : cette commande prend la base Supabase locale ou un port partagé',
    '(4173 / 5173 / 5180), que les 9 copies de travail de food-app se partagent.',
    '',
    'Passe par le verrou, qui attend son tour tout seul :',
    '  npm run test:all           (au lieu de test:all:raw)',
    '  npm run test:e2e           (au lieu de playwright test)',
    '  npm run test:db            (au lieu de supabase test db)',
    '  npm run test:integration',
    '  npm run db:reset           (au lieu de supabase db reset)',
    '',
    'Pour une commande non prévue :',
    '  node scripts/with-db-lock.mjs <ta commande>',
    '',
    "N'envoie pas de message aux autres sessions pour demander si la base est libre :",
    "le verrou s'en charge.",
  ].join('\n'),
)
process.exit(2)
