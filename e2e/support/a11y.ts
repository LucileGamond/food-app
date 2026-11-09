import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/**
 * Analyse axe une fois les animations finies : pendant l'ouverture d'un dialogue (fondu), les couleurs sont
 * semi-transparentes et axe signale un contraste insuffisant qui n'existe pas (échec intermittent en CI).
 */
export async function axeFor(page: Page): Promise<AxeBuilder> {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          // Les animations sans fin (chargement) ne se terminent jamais : on ne les attend pas.
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]),
  )
  return new AxeBuilder({ page })
}
