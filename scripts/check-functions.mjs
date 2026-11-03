// Vérifie le typage du vrai code Deno des Edge Functions, point d'entrée compris (tsc ne voit ni Deno ni les imports
// npm:/jsr:), avec la configuration de chaque fonction : ce qui est déployé est ce qui est vérifié.
import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', 'supabase', 'functions')
const functions = readdirSync(root).filter((name) => existsSync(join(root, name, 'index.ts')))
let failed = 0
for (const name of functions) {
  try {
    execSync('deno check --quiet --no-lock --config deno.json index.ts', { cwd: join(root, name), stdio: 'inherit' })
  } catch {
    failed++
  }
}
if (failed) {
  console.error(`${failed} fonction(s) sur ${functions.length} ne passent pas la vérification Deno.`)
  process.exit(1)
}
console.log(`${functions.length} fonctions vérifiées par Deno.`)
