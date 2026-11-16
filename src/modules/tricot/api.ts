// Module Tricot : projets, étapes et avancée, bibliothèque de patrons, stock de laine, mesures, glossaire, Ravelry et
// appels à la fonction knit-pattern (IA). Chacun ne voit que ses données. Une partie par fichier dans `api/`.

import type { AppSupabaseClient } from '@/api/client'
import { createKnitContext } from './api/shared'
import { projectsApi } from './api/projects'
import { stepsApi } from './api/steps'
import { chartsApi } from './api/charts'
import { progressApi } from './api/progress'
import { libraryApi } from './api/library'
import { aiApi } from './api/ai'
import { stashApi } from './api/stash'
import { ravelryApi } from './api/ravelry'

export function createKnittingApi(db: AppSupabaseClient) {
  const ctx = createKnitContext(db)
  return {
    ...projectsApi(ctx),
    ...stepsApi(ctx),
    ...chartsApi(ctx),
    ...progressApi(ctx),
    ...libraryApi(ctx),
    ...aiApi(ctx),
    ...stashApi(ctx),
    ...ravelryApi(ctx),
  }
}
