import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AiIcon } from './AiIcon'

// Tout le code de l'app (hors tests), en texte, chemin relatif à src/.
const raw = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
const files = Object.entries(raw).map(([path, text]) => ({ path: path.replace(/^\/src\//, ''), text }))

const showsAiIcon = (text: string) => /<AiIcon\b|\bAiIcon\)/.test(text)

/** Écrans dont un bouton appelle l'IA : chacun doit montrer les petites étoiles. */
const AI_SCREENS = [
  'components/recipes/RecipeImportCard.tsx',
  'components/recipes/ImportChoices.tsx',
  'pages/RecipeDetailPage.tsx',
  'pages/RecipeBatchImportPage.tsx',
  'pages/BookScanPage.tsx',
  'pages/SharePage.tsx',
  'pages/PlanningPage.tsx',
  'components/planning/MealIdeasDialog.tsx',
  'components/planning/ShoppingFromPlanDialog.tsx',
  'modules/repas/pages/WeekPlanPage.tsx',
]

const AI_KNITTING = ['AdaptPanel.tsx', 'PatternForm.tsx', 'YarnIdeasSection.tsx', 'StepQuestion.tsx', 'YarnPanel.tsx', 'SizedText.tsx', 'KnittingImportPage.tsx']

describe('AiIcon', () => {
  it('rend les petites étoiles, cachées des lecteurs d’écran et repérables', () => {
    const { container } = render(<AiIcon className="size-4" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('data-ai-icon')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.getAttribute('class')).toContain('size-4')
  })

  it('le code de l’app est bien lu', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files.some((f) => f.path === 'components/AiIcon.tsx')).toBe(true)
  })

  it('les étoiles (Sparkles) ne sont utilisées que par AiIcon : elles restent réservées à l’IA', () => {
    const users = files.filter((f) => /\bSparkles\b/.test(f.text)).map((f) => f.path)
    expect(users).toEqual(['components/AiIcon.tsx'])
  })

  it.each(AI_SCREENS)('%s montre l’icône de l’IA', (path) => {
    const file = files.find((f) => f.path === path)
    expect(file, path).toBeDefined()
    expect(showsAiIcon(file!.text)).toBe(true)
  })

  it.each(AI_KNITTING)('tricot : %s montre l’icône de l’IA', (name) => {
    const file = files.find((f) => f.path.startsWith('modules/tricot/') && f.path.endsWith(`/${name}`))
    expect(file, name).toBeDefined()
    expect(showsAiIcon(file!.text)).toBe(true)
  })
})
