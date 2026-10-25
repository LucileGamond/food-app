import { formatDay, type IsoDate } from './dates'
import { slotLabel, type Meal } from './meals'
import { scaleIngredients, type Ingredient } from './recipes'
import { addAmounts, findMergeTarget, guessAisle, normalizeName, type Aisle, type ShoppingItem, type ShoppingItemInput } from './shopping'
import { isUnit } from './units'

// ---------------------------------------------------------------------------
// Repas à prendre en compte

/** D'où viennent les ingrédients d'un repas : recette enregistrée, page web (lien), ou nulle part. */
export type MealSource = 'recipe' | 'link' | 'none'

export function mealSource(meal: Meal): MealSource {
  if (meal.recipe.is_saved) return 'recipe'
  return meal.recipe.url ? 'link' : 'none'
}

/** Repas cochés par défaut : à partir d'aujourd'hui (les repas passés sont déjà mangés). */
export function defaultSelection(meals: readonly Meal[], today: IsoDate): Set<string> {
  return new Set(meals.filter((m) => m.meal_date >= today).map((m) => m.id))
}

/** « mar. 27 oct. · Soir » */
export function mealWhen(meal: Pick<Meal, 'meal_date' | 'slot'>): string {
  return `${formatDay(meal.meal_date)} · ${slotLabel(meal.slot)}`
}

// ---------------------------------------------------------------------------
// Ce qui n'entre pas dans la liste

export type SkipReason = 'no-ingredients' | 'unreadable-page' | 'unchecked'

export interface SkippedEntry {
  key: string
  reason: SkipReason
  /** Titre du repas, ou nom de l'article décoché. */
  label: string
  /** Quand (repas) ou quantité (article). */
  detail: string
  url: string | null
  /** Article décoché, pour pouvoir le rajouter tel quel. */
  input?: ShoppingItemInput
}

export const SKIP_LABELS: Record<SkipReason, string> = {
  'no-ingredients': 'Sans ingrédients',
  'unreadable-page': 'Page illisible',
  unchecked: 'Décoché',
}

export function skippedMeal(meal: Meal, reason: Exclude<SkipReason, 'unchecked'>): SkippedEntry {
  return { key: `meal-${meal.id}`, reason, label: meal.recipe.title, detail: mealWhen(meal), url: meal.recipe.url }
}

/** Article à ajouter pour une entrée non reprise : l'article décoché tel quel, ou un rappel pour le repas. */
export function skippedInput(entry: SkippedEntry): ShoppingItemInput {
  return entry.input ?? { name: `Ingrédients : ${entry.label}`.slice(0, 120), quantity: null, unit: null, aisle: 'AUTRE' }
}

// ---------------------------------------------------------------------------
// Construction des lignes

export interface MealIngredients {
  meal: Meal
  /** Nombre de personnes prévu par la recette (null si inconnu : quantités prises telles quelles). */
  servings: number | null
  ingredients: Ingredient[]
}

export interface DraftLine {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  aisle: Aisle
  /** Basique du placard (décoché par défaut). */
  pantry: boolean
  /** À acheter (case cochée dans l'aperçu). */
  include: boolean
  /** Titres des repas qui l'utilisent. */
  meals: string[]
}

// Basiques qu'on a presque toujours : décochés par défaut, toujours visibles dans l'aperçu.
const PANTRY_WORDS = [
  'sel', 'fleur de sel', 'poivre', 'huile', 'vinaigre', 'sucre', 'eau', 'cumin', 'paprika', 'curry', 'curcuma', 'cannelle', 'muscade',
  'herbes de provence', 'laurier', 'piment d espelette', 'origan', 'levure chimique', 'bicarbonate',
]
const PANTRY_PATTERN = new RegExp(`^(${PANTRY_WORDS.join('|')})( |$)`)

export function isPantry(name: string): boolean {
  return PANTRY_PATTERN.test(normalizeName(name).replace(/[’']/g, ' '))
}

/** Quantités adaptées au nombre de personnes du repas (si la recette indique pour combien elle est prévue). */
export function mealIngredients({ meal, servings, ingredients }: MealIngredients): Ingredient[] {
  const people = meal.people.length
  return servings && people > 0 ? scaleIngredients(ingredients, servings, people) : ingredients.map((i) => ({ ...i }))
}

// Articles qui s'achètent à l'unité : on ne prend pas « 0,5 reblochon » ni « 1,5 sachet ».
const COUNTED_UNITS = new Set(['gousse', 'tranche', 'sachet', 'boîte', 'botte', 'brin', 'feuille', 'morceau'])

/** Quantité à acheter : arrondie à l'unité supérieure pour les articles comptés (sans unité ou à la pièce). */
export function purchaseQuantity(quantity: number | null, unit: string | null): number | null {
  if (quantity === null || (unit !== null && !COUNTED_UNITS.has(unit))) return quantity
  return Math.ceil(quantity - 1e-9)
}

const withPurchaseQuantities = (lines: DraftLine[]): DraftLine[] => lines.map((l) => ({ ...l, quantity: purchaseQuantity(l.quantity, l.unit) }))

/** Ajoute une ligne à `lines`, ou l'additionne à une ligne du même produit dans une unité compatible. */
function pushLine(lines: DraftLine[], line: DraftLine) {
  for (const existing of lines) {
    const merged = addAmounts(existing, line)
    if (!merged) continue
    existing.quantity = merged.quantity
    existing.pantry ||= line.pantry
    existing.include = !existing.pantry
    for (const title of line.meals) if (!existing.meals.includes(title)) existing.meals.push(title)
    return
  }
  lines.push({ ...line, meals: [...line.meals] })
}

/** Lignes de courses : ingrédients adaptés au nombre de personnes, doublons additionnés, rayon deviné. */
export function buildDraft(sources: readonly MealIngredients[]): DraftLine[] {
  const lines: DraftLine[] = []
  let seq = 0
  for (const source of sources) {
    for (const ingredient of mealIngredients(source)) {
      const name = ingredient.name.replace(/\s+/g, ' ').trim()
      if (!name) continue
      // Unité inconnue (import) : la quantité n'aurait pas de sens seule.
      const known = ingredient.unit === null || isUnit(ingredient.unit)
      const pantry = isPantry(name)
      pushLine(lines, {
        id: `d${++seq}`,
        name,
        quantity: known ? ingredient.quantity : null,
        unit: known ? ingredient.unit : null,
        aisle: guessAisle(name),
        pantry,
        include: !pantry,
        meals: [source.meal.recipe.title],
      })
    }
  }
  return withPurchaseQuantities(lines)
}

export interface TidyLine {
  id: string
  name: string
  aisle: Aisle
  pantry: boolean
}

/** Applique les suggestions du modèle (nom, rayon, placard), puis refusionne les lignes devenues identiques. */
export function applyTidy(lines: readonly DraftLine[], tidy: readonly TidyLine[]): DraftLine[] {
  const byId = new Map(tidy.map((t) => [t.id, t]))
  const result: DraftLine[] = []
  for (const line of lines) {
    const t = byId.get(line.id)
    const pantry = line.pantry || Boolean(t?.pantry)
    pushLine(result, { ...line, name: t?.name || line.name, aisle: t?.aisle ?? line.aisle, pantry, include: !pantry })
  }
  return withPurchaseQuantities(result)
}

/** « oignon » → « Oignon » */
export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1)
}

export function toItemInput(line: DraftLine): ShoppingItemInput {
  return { name: capitalize(line.name).slice(0, 120), quantity: line.quantity, unit: line.unit, aisle: line.aisle }
}

export function uncheckedEntries(lines: readonly DraftLine[]): SkippedEntry[] {
  return lines
    .filter((l) => !l.include)
    .map((l) => {
      const input = toItemInput(l)
      return { key: `line-${l.id}`, reason: 'unchecked', label: input.name, detail: l.meals.join(', '), url: null, input }
    })
}

// ---------------------------------------------------------------------------
// Ajout à une liste existante

export interface ListMerge {
  updates: { item: ShoppingItem; quantity: number }[]
  additions: ShoppingItemInput[]
}

/** Complète une liste : quantité additionnée aux articles déjà présents (non cochés), nouveaux articles sinon. */
export function mergeIntoList(existing: readonly ShoppingItem[], inputs: readonly ShoppingItemInput[]): ListMerge {
  const items = existing.map((i) => ({ ...i }))
  const updated = new Map<string, ShoppingItem>()
  const additions: ShoppingItemInput[] = []
  for (const input of inputs) {
    const plan = findMergeTarget(items, input)
    if (!plan) {
      additions.push(input)
      continue
    }
    // Même article sans quantité des deux côtés : déjà sur la liste, rien à changer.
    if (plan.quantity === null) continue
    plan.item.quantity = plan.quantity
    updated.set(plan.item.id, plan.item)
  }
  return { updates: [...updated.values()].map((item) => ({ item, quantity: item.quantity! })), additions }
}
