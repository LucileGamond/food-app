#!/usr/bin/env node
// Verrou partagé pour la base Supabase locale et les ports 4173 / 5173 / 5180.
//
// Les 9 copies de travail de food-app (main + worktrees) partagent UNE seule
// instance Supabase (project_id "food-app", ports 54321-54329) et un seul port
// Playwright (4173, --strictPort). Deux sessions Claude qui lancent les tests en
// même temps se marchent dessus. Ce script sérialise : la première prend le
// verrou, les autres attendent leur tour en affichant qui le tient.
//
// Usage : node scripts/with-db-lock.mjs <commande> [args...]
//   node scripts/with-db-lock.mjs npm run test:all:raw
//
// Le verrou vit dans le dossier temporaire du système, donc HORS des worktrees :
// c'est ce qui le rend commun à toutes les copies de travail.

import { openSync, closeSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'

const LOCK = join(tmpdir(), 'food-app-db.lock')
const ATTENTE_MS = 5000
const TIMEOUT_MS = 30 * 60 * 1000

const commande = process.argv.slice(2)
if (commande.length === 0) {
  console.error('Usage : node scripts/with-db-lock.mjs <commande> [args...]')
  process.exit(2)
}

const moi = [
  process.pid,
  basename(process.cwd()),
  commande.join(' '),
  new Date().toISOString(),
].join(' | ')

/** Le processus qui a posé le verrou tourne-t-il encore ? */
function vivant(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM' // existe mais appartient à quelqu'un d'autre
  }
}

function dormir(ms) {
  // Pause synchrone : on est dans un script de build, pas dans une boucle d'événements.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function prendreLeVerrou() {
  const limite = Date.now() + TIMEOUT_MS
  let dernierMessage = 0

  while (Date.now() < limite) {
    try {
      // 'wx' échoue si le fichier existe déjà : c'est ce qui rend la prise atomique.
      closeSync(openSync(LOCK, 'wx'))
      writeFileSync(LOCK, moi)
      return true
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }

    let detenteur = ''
    try {
      detenteur = readFileSync(LOCK, 'utf8').trim()
    } catch {
      continue // le verrou vient d'être relâché, on retente tout de suite
    }

    const pid = Number(detenteur.split('|')[0])
    if (!vivant(pid)) {
      console.error(`[db-lock] verrou abandonné par le PID ${pid}, je le libère`)
      try {
        unlinkSync(LOCK)
      } catch {}
      continue
    }

    if (Date.now() - dernierMessage > 60_000) {
      console.error(`[db-lock] base occupée par : ${detenteur}`)
      console.error('[db-lock] j\'attends qu\'elle se libère...')
      dernierMessage = Date.now()
    }
    dormir(ATTENTE_MS)
  }
  return false
}

function relacher() {
  try {
    const detenteur = readFileSync(LOCK, 'utf8')
    if (Number(detenteur.split('|')[0]) !== process.pid) return // pas le nôtre
    unlinkSync(LOCK)
  } catch {}
}

if (!prendreLeVerrou()) {
  console.error(`[db-lock] abandon : la base est restée occupée plus de ${TIMEOUT_MS / 60000} min.`)
  console.error(`[db-lock] si c'est un verrou mort, supprime ${LOCK}`)
  process.exit(1)
}

process.on('exit', relacher)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => {
    relacher()
    process.exit(1)
  })
}

const resultat = spawnSync(commande[0], commande.slice(1), { stdio: 'inherit', shell: true })
relacher()
process.exit(resultat.status ?? 1)
